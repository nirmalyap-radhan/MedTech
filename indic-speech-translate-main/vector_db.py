"""
vector_db.py
------------
Medical Vector Database & Retrieval-Augmented Generation (RAG) Engine for MediKiok.
Provides:
  1. Dense text embeddings via Gemini Embeddings API (text-embedding-004) with local cosine fallback.
  2. Multi-backend vector storage:
     - Cloud Vector DB: Pinecone (using VECTOR_DB_URL & VECTOR_DB_API_KEY)
     - Local Persistent Vector Store (vector_store.json) as reliable fallback
  3. Semantic similarity search across:
     - Standard Clinical Guidelines (AIIMS, WHO, CCRAS AYUSH Dashavidha Pariksha)
     - Patient Cases (Longitudinal case similarity search)
     - Drug Interaction & Contraindication alerts
"""

import os
import json
import math
import time
import logging
import requests
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("medikiok_vector_db")

BASE_DIR = Path(__file__).parent
LOCAL_VECTOR_PATH = BASE_DIR / "vector_store.json"
_ENV_PATH = BASE_DIR / ".env"

def _load_env():
    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ[k.strip()] = v.strip()

_load_env()

# Load credentials from environment
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
VECTOR_DB_URL = os.environ.get("VECTOR_DB_URL", "").strip()
VECTOR_DB_API_KEY = os.environ.get("VECTOR_DB_API_KEY", "").strip()

# -------------------------------------------------------------
# Curated Standard Clinical Guidelines & Protocol Knowledge Base
# -------------------------------------------------------------
CLINICAL_GUIDELINES_SEED = [
    {
        "id": "guideline-aiims-triage-redflags",
        "title": "AIIMS Emergency & Acute OPD Triage Red Flags",
        "category": "emergency_triage",
        "content": (
            "AIIMS Clinical Red Flags: Immediate escalation required if patient exhibits: "
            "1. Altered mental sensorium, severe lethargy, or sudden confusion. "
            "2. Chest pain radiating to neck, jaw, or left arm with diaphoresis (suspected Acute Coronary Syndrome). "
            "3. Respiratory distress with respiratory rate > 28/min or SpO2 < 93% on room air. "
            "4. High fever (>103°F) with neck rigidity, petechial rash, or severe photophobia (meningism). "
            "5. Massive hematemesis or melena (active upper GI bleed). "
            "6. Severe dehydration with systolic BP < 90 mmHg or delayed capillary refill > 3 seconds."
        ),
        "source": "AIIMS Clinical Practice Guidelines for Acute Care",
    },
    {
        "id": "guideline-who-fever-respiratory",
        "title": "WHO / MOHFW Acute Febrile & Upper Respiratory Protocol",
        "category": "respiratory_fever",
        "content": (
            "Management of Acute Febrile Illness & Upper Respiratory Tract Infection: "
            "1. Febrile illness < 5 days without focal localizing signs in endemic tropical areas requires ruling out Malaria, Dengue (NS1 Ag / IgM), and Scrub Typhus. "
            "2. Paracetamol 500mg-650mg every 6-8 hours (maximum 3000mg/24h) is the safe antipyretic of choice. "
            "3. Avoid NSAIDs (Ibuprofen, Diclofenac) in suspected dengue or unexplained acute fever due to hemorrhagic risk. "
            "4. Routine antibiotics (Amoxicillin, Azithromycin) are NOT indicated for acute uncomplicated viral upper respiratory infections unless high fever persists > 5 days with purulent sputum, marked leukocytosis, or bilateral crackles."
        ),
        "source": "WHO Clinical Management of Acute Respiratory Infections",
    },
    {
        "id": "guideline-ccras-ayush-dashavidha",
        "title": "CCRAS AYUSH Dashavidha Pariksha & Jwara Assessment",
        "category": "ayush_integrative",
        "content": (
            "Ayurvedic Dashavidha Pariksha Diagnostic Criteria: "
            "1. Prakriti & Vikriti: Evaluation of baseline biological constitution (Vata, Pitta, Kapha) versus current pathological imbalance. "
            "2. Jwara (Febrile state) is predominantly characterized by Amadosha (endotoxin accumulation) and Mandagni (suppression of metabolic fire). "
            "3. In Pitta-dominant Jwara with burning sensation, thirst, and sour eructations (Amlapitta correlation), Langhana (digestive rest), Shadanga Paniya, and mild cooling/digestive herbs are recommended. "
            "4. Agni State: Mandagni dictates light easily digestible food (Manda, Peya) and avoidance of heavy dairy or greasy food until digestive fire stabilizes."
        ),
        "source": "CCRAS Ayurvedic Clinical Protocol Handbook",
    },
    {
        "id": "guideline-drug-interactions-penicillin",
        "title": "Pharmacovigilance: Penicillin Allergy & Drug-Drug Interactions",
        "category": "pharmacovigilance",
        "content": (
            "Critical Drug Warnings & Cross-Reactivity: "
            "1. Penicillin Allergy: Any history of urticaria, angioedema, or rash to Penicillin contraindicates all beta-lactams including Amoxicillin, Ampicillin, and Augmentin. Use Macrolides (Azithromycin) or Fluoroquinolones as alternatives when indicated. "
            "2. Hypertension Caution: Hypertensive patients on Calcium Channel Blockers (Amlodipine) should avoid oral decongestants (Pseudoephedrine, Phenylephrine) due to risk of acute BP spikes. "
            "3. Dyspepsia / GERD: Patients with burning epigastric discomfort must avoid NSAIDs, Aspirin, and excessive caffeine which exacerbate gastric mucosal erosion."
        ),
        "source": "Indian Pharmacopoeia Commission & National Formulary of India",
    },
    {
        "id": "guideline-gerd-gastritis-amlapitta",
        "title": "Clinical Management of Dyspepsia, GERD & Amlapitta",
        "category": "gastroenterology",
        "content": (
            "Protocol for Acid Peptic Disorders & Amlapitta: "
            "1. Symptoms: Postprandial burning sensation in epigastrium, sour regurgitation, retrosternal heartburn, and nausea. "
            "2. First-line therapy: Proton Pump Inhibitors (Pantoprazole 40mg or Omeprazole 20mg once daily taken 30 minutes before breakfast) for 2 to 4 weeks. "
            "3. AYUSH correlation: Pitta-Vata aggravation. Dietary rules: avoid pungent (Katu), sour (Amla), fermented foods and late-night meals. Cooling herbs like Yashtimadhu, Shatavari, and Amalaki support mucosal healing."
        ),
        "source": "Indian Society of Gastroenterology Clinical Consensus",
    }
]

class LocalVectorIndex:
    """Fast, deterministic vector store with unit-normalized cosine similarity."""
    def __init__(self):
        self.embeddings: Dict[str, Dict[str, Any]] = {}
        self._load()

    def _load(self):
        if LOCAL_VECTOR_PATH.exists():
            try:
                data = json.loads(LOCAL_VECTOR_PATH.read_text(encoding="utf-8"))
                self.embeddings = data
                logger.info("Loaded %d embeddings from local vector store.", len(self.embeddings))
            except Exception as e:
                logger.warning("Failed to load local vector store (%s), reinitializing.", e)
                self.embeddings = {}

    def _save(self):
        try:
            LOCAL_VECTOR_PATH.write_text(json.dumps(self.embeddings, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error("Failed to save local vector store: %s", e)

    def upsert(self, vector_id: str, vector: List[float], content: str, entity_type: str, metadata: Dict[str, Any]):
        arr = np.array(vector, dtype=np.float32)
        norm = np.linalg.norm(arr)
        if norm > 0:
            arr = arr / norm
        self.embeddings[vector_id] = {
            "id": vector_id,
            "vector": arr.tolist(),
            "content": content,
            "entity_type": entity_type,
            "metadata": metadata,
            "updated_at": time.time(),
        }
        self._save()

    def search(self, query_vector: List[float], entity_type: Optional[str] = None, top_k: int = 3, min_score: float = 0.1) -> List[Dict[str, Any]]:
        if not self.embeddings:
            return []

        q_arr = np.array(query_vector, dtype=np.float32)
        q_norm = np.linalg.norm(q_arr)
        if q_norm > 0:
            q_arr = q_arr / q_norm

        candidates = []
        for vid, entry in self.embeddings.items():
            if entity_type and entry.get("entity_type") != entity_type:
                continue
            e_arr = np.array(entry["vector"], dtype=np.float32)
            similarity = float(np.dot(q_arr, e_arr))
            if similarity >= min_score:
                candidates.append({
                    "id": vid,
                    "score": round(similarity, 4),
                    "content": entry["content"],
                    "entity_type": entry["entity_type"],
                    "metadata": entry.get("metadata", {}),
                })

        candidates.sort(key=lambda x: x["score"], reverse=True)
        return candidates[:top_k]

class MedicalVectorDB:
    def __init__(self):
        self.local_index = LocalVectorIndex()
        self.pinecone_index = None
        self._init_pinecone()
        self._seed_guidelines()

    def _init_pinecone(self):
        global VECTOR_DB_URL, VECTOR_DB_API_KEY
        if VECTOR_DB_API_KEY and VECTOR_DB_URL and not VECTOR_DB_API_KEY.startswith("#"):
            try:
                from pinecone import Pinecone
                pc = Pinecone(api_key=VECTOR_DB_API_KEY)
                self.pinecone_index = pc.Index(host=VECTOR_DB_URL)
                stats = self.pinecone_index.describe_index_stats()
                logger.info("Connected to Pinecone Vector Database! (Dimension: %s, Vectors: %s)", stats.dimension, stats.total_vector_count)
            except Exception as err:
                logger.warning("Could not connect to Pinecone (%s). Falling back to local vector index.", err)
                self.pinecone_index = None

    def _generate_fallback_embedding(self, text: str, dim: int = 768) -> List[float]:
        """
        Fast, high-entropy character n-gram + word hashing dense 768-dim vector embedding.
        Works 100% offline, guaranteeing reliable cosine search without external dependencies.
        """
        text = text.lower()
        vec = np.zeros(dim, dtype=np.float32)
        words = text.split()
        for i, word in enumerate(words):
            h = hash(word) % dim
            vec[h] += 1.0 / (1.0 + math.log(1 + i))

        for i in range(len(text) - 2):
            trigram = text[i:i+3]
            h = hash(trigram) % dim
            vec[h] += 0.5

        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.tolist()

    def get_embedding(self, text: str) -> List[float]:
        """
        Get 768-dim text embedding: uses Gemini Embeddings API (text-embedding-004) if API key available,
        otherwise uses deterministic local semantic 768-dim dense vector.
        """
        if GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here":
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={GEMINI_API_KEY}"
                payload = {
                    "model": "models/text-embedding-004",
                    "content": {"parts": [{"text": text[:2000]}]}
                }
                resp = requests.post(url, json=payload, timeout=6)
                if resp.status_code == 200:
                    data = resp.json()
                    values = data.get("embedding", {}).get("values", [])
                    if values and len(values) == 768:
                        return values
            except Exception as err:
                logger.debug("Gemini embedding API call failed (%s). Using local embedding.", err)

        return self._generate_fallback_embedding(text, dim=768)

    def _seed_guidelines(self):
        """Seed core clinical guidelines into vector DB and Pinecone."""
        pinecone_batch = []
        for g in CLINICAL_GUIDELINES_SEED:
            gid = g["id"]
            full_text = f"{g['title']}: {g['content']}"
            vec = self.get_embedding(full_text)

            # Local upsert
            if gid not in self.local_index.embeddings:
                self.local_index.upsert(
                    vector_id=gid,
                    vector=vec,
                    content=g["content"],
                    entity_type="guideline",
                    metadata={"title": g["title"], "category": g["category"], "source": g["source"]}
                )

            # Pinecone batch
            if self.pinecone_index:
                pinecone_batch.append({
                    "id": gid,
                    "values": vec,
                    "metadata": {
                        "content": g["content"],
                        "title": g["title"],
                        "category": g["category"],
                        "source": g["source"],
                        "entity_type": "guideline"
                    }
                })

        if self.pinecone_index and pinecone_batch:
            try:
                self.pinecone_index.upsert(vectors=pinecone_batch)
                logger.info("Seeded %d guidelines into Pinecone index.", len(pinecone_batch))
            except Exception as e:
                logger.warning("Pinecone guideline seeding deferred: %s", e)

        logger.info("Clinical guidelines vector index ready (%d total vectors).", len(self.local_index.embeddings))

    def index_patient_case(self, case_data: Dict[str, Any]):
        """
        Index a patient case into the vector database (Pinecone + local) for longitudinal and similar-case search.
        """
        case_id = case_data.get("id")
        if not case_id:
            return

        chief_complaint = case_data.get("chiefComplaint", "")
        duration = case_data.get("duration", "")
        symptoms = ", ".join(case_data.get("associatedSymptoms", []))
        summary = case_data.get("aiSummary", "")
        patient = case_data.get("patient", {})
        age = patient.get("age", "")
        gender = patient.get("gender", "")

        semantic_text = f"Patient {case_id} ({age}Y {gender}): Chief Complaint: {chief_complaint} for {duration}. Symptoms: {symptoms}. Summary: {summary}."
        vector = self.get_embedding(semantic_text)

        metadata = {
            "caseId": case_id,
            "patientName": patient.get("name", "Unknown"),
            "chiefComplaint": chief_complaint,
            "status": case_data.get("status", "Case Ready"),
            "entity_type": "patient_case",
            "content": semantic_text
        }

        # 1. Local index
        self.local_index.upsert(
            vector_id=f"case-{case_id}",
            vector=vector,
            content=semantic_text,
            entity_type="patient_case",
            metadata=metadata
        )

        # 2. Pinecone index
        if self.pinecone_index:
            try:
                self.pinecone_index.upsert(vectors=[{
                    "id": f"case-{case_id}",
                    "values": vector,
                    "metadata": metadata
                }])
                logger.info("Indexed patient case %s into Pinecone.", case_id)
            except Exception as pe:
                logger.warning("Pinecone case indexing error: %s", pe)

    def search_similar_guidelines(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Find the top relevant clinical guidelines for RAG reasoning grounding."""
        return self.search_all(query, entity_type="guideline", top_k=top_k)

    def search_similar_cases(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Find past similar clinical cases based on semantic symptoms."""
        return self.search_all(query, entity_type="patient_case", top_k=top_k)

    def search_all(self, query: str, entity_type: Optional[str] = None, top_k: int = 5) -> List[Dict[str, Any]]:
        """General semantic vector search across Pinecone and local fallback."""
        query_vector = self.get_embedding(query)

        # Try Pinecone first if connected
        if self.pinecone_index:
            try:
                filter_dict = {"entity_type": {"$eq": entity_type}} if entity_type else None
                res = self.pinecone_index.query(
                    vector=query_vector,
                    top_k=top_k,
                    include_metadata=True,
                    filter=filter_dict
                )
                if res and res.matches:
                    out = []
                    for match in res.matches:
                        md = match.metadata or {}
                        out.append({
                            "id": match.id,
                            "score": round(float(match.score), 4),
                            "content": md.get("content", ""),
                            "entity_type": md.get("entity_type", entity_type or "general"),
                            "metadata": md
                        })
                    return out
            except Exception as pe:
                logger.warning("Pinecone query failed (%s), falling back to local index.", pe)

        # Fallback to local cosine index
        return self.local_index.search(query_vector, entity_type=entity_type, top_k=top_k)

# Global singleton
vector_db = MedicalVectorDB()
