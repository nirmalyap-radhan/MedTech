"""
database.py
-----------
Enterprise Clinical Database Layer for MediKiok.
Provides automatic multi-backend database connectivity:
  1. PostgreSQL (with pgvector support) when DATABASE_URL is configured in .env
  2. Local persistent SQLite (medikiok_clinical.db) as seamless zero-config fallback.

Thread-safe and ACID-compliant.
"""

import os
import sys
import json
import time
import hashlib
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger("medikiok_db")

# Path to local files & .env
BASE_DIR = Path(__file__).parent
LOCAL_SQLITE_PATH = BASE_DIR / "medikiok_clinical.db"
_ENV_PATH = BASE_DIR / ".env"

def _load_env():
    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ[k.strip()] = v.strip()

_load_env()

# Read DATABASE_URL from environment
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

# Password hashing utilities matching the frontend Web Crypto SHA-256 scheme
def hash_password(password: str, salt: str) -> str:
    """Standardized SHA-256 hash with salt for clinical doctor credentials."""
    payload = f"{password}:{salt}:medikiosk_clinical_secure_v1".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()

def verify_password(plain_password: str, salt: str, password_hash: str) -> bool:
    return hash_password(plain_password, salt) == password_hash

def generate_salt() -> str:
    return os.urandom(16).hex()

def generate_token() -> str:
    return os.urandom(32).hex()

# Seed Doctors matching INITIAL_DOCTORS
INITIAL_DOCTORS = [
    {
        "id": "DOC-2026-001",
        "name": "Dr. Suresh Mishra",
        "email": "dr.mishra@hospital.gov.in",
        "passwordPlain": "Doctor@123",
        "mciRegNumber": "MCI-48920/OD",
        "department": "Internal Medicine & Critical Care",
        "roomNumber": "Room 104",
        "role": "CONSULTANT_PHYSICIAN",
        "phone": "+91 94370 12890",
        "avatar": "SM",
    },
    {
        "id": "DOC-2026-002",
        "name": "Dr. Sneha Patnaik",
        "email": "dr.patnaik@hospital.gov.in",
        "passwordPlain": "Doctor@123",
        "mciRegNumber": "NMC-92384/AIIMS",
        "department": "General Surgery & Acute Triage",
        "roomNumber": "Room 108",
        "role": "CHIEF_MEDICAL_OFFICER",
        "phone": "+91 98610 88231",
        "avatar": "SP",
    },
    {
        "id": "DOC-2026-003",
        "name": "Dr. Rajesh Panda (Vaidya)",
        "email": "dr.panda@ayush.gov.in",
        "passwordPlain": "Doctor@123",
        "mciRegNumber": "AYUSH-CCRAS-3382",
        "department": "AYUSH & Integrative Medicine",
        "roomNumber": "Room 102",
        "role": "AYUSH_SPECIALIST",
        "phone": "+91 94388 47120",
        "avatar": "RP",
    },
    {
        "id": "DOC-2026-004",
        "name": "Dr. Debabrata Jena",
        "email": "dr.jena@hospital.gov.in",
        "passwordPlain": "Doctor@123",
        "mciRegNumber": "MCI-55102/OD",
        "department": "Gastroenterology & Hepatology",
        "roomNumber": "Room 110",
        "role": "CONSULTANT_PHYSICIAN",
        "phone": "+91 97761 33491",
        "avatar": "DJ",
    },
]

INITIAL_SEED_CASES = [
    {
        "id": "MK-21917",
        "patient": {
            "id": "MK-21917",
            "name": "Sameer Kumar Das",
            "age": 45,
            "gender": "Male",
            "mobile": "+91 98610 23456",
            "preferredLanguage": "or",
        },
        "chiefComplaint": "Fever (ଜ୍ୱର)",
        "duration": "3 days",
        "associatedSymptoms": ["Cough (କାଶ)", "Body ache (ଶରୀର ପୀଡ଼ା)", "Mild Chills"],
        "pastMedicalHistory": ["Hypertension (High BP) - 4 years", "No known diabetes"],
        "currentMedications": ["Amlodipine 5mg (1-0-0)"],
        "allergies": ["Penicillin (Skin Rash)"],
        "relevantPreviousHistory": "Mild upper respiratory tract infection recorded 6 months ago at District Headquarters Hospital, Cuttack.",
        "arrivalTime": "08:24 AM",
        "status": "Case Ready",
        "updatedAt": "2026-09-11 08:24",
        "answers": [
            {
                "questionId": "q1",
                "questionText": "What is your main health concern?",
                "rawVoiceInput": "ମୋର ତିନି ଦିନ ହେଲା ଜ୍ୱର ହେଉଛି",
                "transcription": "ମୋର ତିନି ଦିନ ହେଲା ଜ୍ୱର ହେଉଛି (I have had fever for three days)",
                "answerValue": "Fever for 3 days",
                "structuredData": {
                    "chiefComplaint": "Fever",
                    "duration": "3 days",
                    "severity": "Moderate"
                }
            }
        ],
        "documents": [
            {
                "id": "doc-01",
                "name": "Prescription_Sep05_DrSharma.pdf",
                "type": "Prescription",
                "date": "05 September 2026",
                "doctorName": "Dr. R. K. Sharma (MD Internal Med)",
                "medicines": ["Paracetamol 650mg TDS", "Amoxicillin 500mg BD", "Pantoprazole 40mg OD"],
                "findings": "Acute Febrile Illness, Advised CBC + MP Test",
                "confidenceScore": 96
            }
        ],
        "ayush": {
            "prakriti": "Pitta-Kapha Dominant",
            "vikriti": "Vata-Pitta Dushti (Febrile state)",
            "sara": "Rakta & Mamsa Sara",
            "samhanana": "Madhyama",
            "pramana": "Madhyama",
            "satmya": "Satmya to Shita & Ruksha Ahara",
            "satva": "Madhyama Satva",
            "aharaShakti": "Mandagni (Diminished digestive fire)",
            "vyayamaShakti": "Alpa (Low endurance due to fever)",
            "vaya": "Madhyama Vaya (45 Years)"
        },
        "clinicalConsiderations": {
            "primarySuspicions": ["Acute Viral Fever / Upper Respiratory Infection", "Dengue / Malarial prodrome to rule out"],
            "symptomsIdentified": ["Fever (3 days)", "Dry Cough", "Body ache", "Mild Chills"],
            "redFlags": ["Penicillin allergy reported — avoid beta-lactam class", "Hypertension — caution with decongestants"],
            "riskLevel": "Moderate",
            "ayushCorrelation": {
                "doshaImbalance": "Pitta-Vata aggravation resulting in Jwara (fever)",
                "agniState": "Mandagni — digestive capacity impaired"
            },
            "clinicalNotes": "Patient has 3-day acute febrile state with dry cough. Vitals stable at intake. Recommended CBC, platelet count, and peripheral smear.",
            "source": "AI Clinical Knowledge Graph"
        },
        "aiSummary": "45-year-old male with 3-day moderate fever, cough, and generalized body ache. Known hypertensive on Amlodipine. Penicillin allergy confirmed. Prescriptions reviewed via Donut OCR. Prepared for OPD Physician.",
        "timeline": [
            {
                "id": "t1",
                "date": "11 September 2026",
                "title": "MediKiok Multimodal Intake Complete",
                "category": "Intake",
                "description": "Voice questionnaire (Odia) and prescription OCR scanned at OPD Kiosk."
            }
        ]
    },
    {
        "id": "MK-21918",
        "patient": {
            "id": "MK-21918",
            "name": "Manjula Behera",
            "age": 38,
            "gender": "Female",
            "mobile": "+91 94371 88902",
            "preferredLanguage": "hi",
        },
        "chiefComplaint": "Upper abdominal burning and nausea",
        "duration": "1 week",
        "associatedSymptoms": ["Sour belching", "Loss of appetite", "Postprandial bloating"],
        "pastMedicalHistory": ["Recurrent gastritis for 2 years", "No surgeries"],
        "currentMedications": ["Ranitidine 150mg (occasional)"],
        "allergies": ["None reported"],
        "relevantPreviousHistory": "Diagnosed with non-ulcer dyspepsia in 2024 at Capital Hospital, Bhubaneswar.",
        "arrivalTime": "08:41 AM",
        "status": "Case Ready",
        "updatedAt": "2026-09-11 08:41",
        "answers": [
            {
                "questionId": "q1",
                "questionText": "What is your main health concern?",
                "answerValue": "Severe burning sensation in upper stomach and sour belching after eating.",
                "structuredData": {
                    "chiefComplaint": "Epigastric burning",
                    "duration": "1 week",
                    "severity": "Moderate"
                }
            }
        ],
        "documents": [],
        "ayush": {
            "prakriti": "Pitta Dominant",
            "vikriti": "Pitta-Vata Vidagdha Agni (Amlapitta)",
            "sara": "Twak & Rasa Sara",
            "samhanana": "Madhyama",
            "pramana": "Madhyama",
            "satmya": "Katu-Amla Satmya (Aggravating spicy habit)",
            "satva": "Pravara Satva",
            "aharaShakti": "Tikshnagni progressing to Vishamagni",
            "vyayamaShakti": "Madhyama",
            "vaya": "Madhyama Vaya (38 Years)"
        },
        "clinicalConsiderations": {
            "primarySuspicions": ["Gastroesophageal Reflux Disease (GERD)", "Gastric / Duodenal Erosion", "Amlapitta"],
            "symptomsIdentified": ["Epigastric pain/burning", "Acid regurgitation", "Postprandial bloating"],
            "redFlags": ["Monitor for melena or hematemesis", "Unintentional weight loss screening"],
            "riskLevel": "Low",
            "ayushCorrelation": {
                "doshaImbalance": "Pitta Prakopa (Amlapitta with sour burning)",
                "agniState": "Tikshnagni leading to Vidagdhata"
            },
            "clinicalNotes": "Classic symptoms of hyperacidity with dietary triggers. Advised PPI course, lifestyle counseling, and dietary modification.",
            "source": "AI Clinical Knowledge Graph"
        },
        "aiSummary": "38-year-old female presenting with 1-week burning epigastric discomfort, sour regurgitation, and bloating. Consistent with Amlapitta / GERD spectrum. No red-flag dysphagia.",
        "timeline": [
            {
                "id": "t2",
                "date": "11 September 2026",
                "title": "MediKiok Intake Complete",
                "category": "Intake",
                "description": "Voice dialogue completed in Hindi. Clinical triage generated."
            }
        ]
    }
]

# Auto-fix unencoded special characters in DATABASE_URL
import re
import urllib.parse

def fix_db_url(url: str) -> str:
    """Auto-encode unescaped @ or special characters in DATABASE_URL password."""
    if not url or "@" not in url:
        return url
    m = re.match(r'^(postgres(?:ql)?://)([^:]+):(.*)@([^@/]+(?::\d+)?(?:/.*)?)$', url)
    if m:
        proto, user, raw_pass, host_part = m.groups()
        encoded_pass = urllib.parse.quote_plus(urllib.parse.unquote_plus(raw_pass))
        return f"{proto}{user}:{encoded_pass}@{host_part}"
    return url

class DatabaseManager:
    def __init__(self):
        self.is_postgres = False
        self._pg_conn = None
        self.db_url = ""
        self._init_backend()

    def _get_pg_conn(self):
        if not self.is_postgres:
            return None
        try:
            if self._pg_conn and not self._pg_conn.closed:
                with self._pg_conn.cursor() as cur:
                    cur.execute("SELECT 1;")
                return self._pg_conn
        except Exception:
            pass

        try:
            import psycopg2
            conn = psycopg2.connect(
                self.db_url,
                connect_timeout=10,
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10
            )
            conn.autocommit = True
            self._pg_conn = conn
            return conn
        except Exception as e:
            logger.warning("PostgreSQL connection error (%s). Falling back to persistent SQLite.", e)
            self.is_postgres = False
            return None

    def _init_backend(self):
        global DATABASE_URL
        raw_url = os.environ.get("DATABASE_URL", "").strip()
        self.db_url = fix_db_url(raw_url)
        
        if self.db_url and not self.db_url.startswith("#"):
            try:
                import psycopg2
                import psycopg2.extras
                conn = psycopg2.connect(
                    self.db_url,
                    connect_timeout=10,
                    keepalives=1,
                    keepalives_idle=30,
                    keepalives_interval=10
                )
                conn.autocommit = True
                self._pg_conn = conn
                self.is_postgres = True
                logger.info("Connected to PostgreSQL Production Database via DATABASE_URL.")
                self._init_postgres_tables()
                return
            except Exception as e:
                logger.warning("Could not connect to PostgreSQL (%s). Falling back to persistent SQLite.", e)

        # Fallback to persistent SQLite
        self.is_postgres = False
        logger.info("Using local persistent SQLite clinical database at: %s", LOCAL_SQLITE_PATH)
        self._init_sqlite_tables()

    def _get_sqlite_conn(self):
        import sqlite3
        conn = sqlite3.connect(str(LOCAL_SQLITE_PATH), timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    # -------------------------------------------------------------
    # Schema Initializers
    # -------------------------------------------------------------
    def _init_sqlite_tables(self):
        conn = self._get_sqlite_conn()
        cur = conn.cursor()

        cur.execute("""
        CREATE TABLE IF NOT EXISTS doctors (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            mci_reg_number TEXT UNIQUE NOT NULL,
            department TEXT NOT NULL,
            room_number TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'CONSULTANT_PHYSICIAN',
            phone TEXT NOT NULL,
            avatar TEXT NOT NULL,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            lockout_until INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_login_at TEXT
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS auth_sessions (
            token TEXT PRIMARY KEY,
            doctor_id TEXT NOT NULL,
            doctor_profile TEXT NOT NULL,
            issued_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            doctor_id TEXT NOT NULL,
            doctor_name TEXT NOT NULL,
            action TEXT NOT NULL,
            ip_address TEXT NOT NULL,
            details TEXT,
            target_id TEXT
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS patient_cases (
            id TEXT PRIMARY KEY,
            patient TEXT NOT NULL,
            chief_complaint TEXT NOT NULL,
            duration TEXT,
            associated_symptoms TEXT,
            past_medical_history TEXT,
            current_medications TEXT,
            allergies TEXT,
            relevant_previous_history TEXT,
            arrival_time TEXT,
            status TEXT NOT NULL DEFAULT 'Case Ready',
            answers TEXT,
            documents TEXT,
            ayush TEXT,
            clinical_considerations TEXT,
            ai_summary TEXT,
            timeline TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS vector_embeddings (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            content TEXT NOT NULL,
            embedding TEXT NOT NULL,
            metadata TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)

        conn.commit()
        self._seed_initial_data_sqlite(conn)
        conn.close()

    def _seed_initial_data_sqlite(self, conn):
        cur = conn.cursor()
        # Seed doctors if empty
        cur.execute("SELECT COUNT(*) as count FROM doctors")
        row = cur.fetchone()
        if row and row["count"] == 0:
            for seed in INITIAL_DOCTORS:
                salt = generate_salt()
                p_hash = hash_password(seed["passwordPlain"], salt)
                cur.execute("""
                    INSERT INTO doctors (id, name, email, password_hash, salt, mci_reg_number, department, room_number, role, phone, avatar)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    seed["id"], seed["name"], seed["email"].lower().strip(), p_hash, salt,
                    seed["mciRegNumber"], seed["department"], seed["roomNumber"], seed["role"],
                    seed["phone"], seed["avatar"]
                ))
            logger.info("Seeded %d hospital doctors into clinical database.", len(INITIAL_DOCTORS))

        # Seed initial patient cases if empty
        cur.execute("SELECT COUNT(*) as count FROM patient_cases")
        row = cur.fetchone()
        if row and row["count"] == 0:
            for c in INITIAL_SEED_CASES:
                cur.execute("""
                    INSERT INTO patient_cases (
                        id, patient, chief_complaint, duration, associated_symptoms,
                        past_medical_history, current_medications, allergies,
                        relevant_previous_history, arrival_time, status, answers,
                        documents, ayush, clinical_considerations, ai_summary,
                        timeline, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    c["id"],
                    json.dumps(c["patient"]),
                    c["chiefComplaint"],
                    c["duration"],
                    json.dumps(c.get("associatedSymptoms", [])),
                    json.dumps(c.get("pastMedicalHistory", [])),
                    json.dumps(c.get("currentMedications", [])),
                    json.dumps(c.get("allergies", [])),
                    c.get("relevantPreviousHistory", ""),
                    c.get("arrivalTime", ""),
                    c.get("status", "Case Ready"),
                    json.dumps(c.get("answers", [])),
                    json.dumps(c.get("documents", [])),
                    json.dumps(c.get("ayush", {})),
                    json.dumps(c.get("clinicalConsiderations", {})),
                    c.get("aiSummary", ""),
                    json.dumps(c.get("timeline", [])),
                    c.get("updatedAt", "")
                ))
            logger.info("Seeded %d initial clinical cases into database.", len(INITIAL_SEED_CASES))
        conn.commit()

    def _init_postgres_tables(self):
        # Read schema.sql and apply
        try:
            candidate_paths = [
                BASE_DIR.parent.parent / "database" / "schema.sql",
                BASE_DIR.parent / "database" / "schema.sql",
                BASE_DIR.parent / "schema.sql",
                BASE_DIR / "schema.sql"
            ]
            schema_path = next((p for p in candidate_paths if p.exists()), None)
            if schema_path:
                sql_content = schema_path.read_text(encoding="utf-8")
                conn = self._get_pg_conn()
                if conn:
                    with conn.cursor() as cur:
                        cur.execute(sql_content)
                    logger.info("Applied PostgreSQL schema from schema.sql.")
                    
                    # Seed cases if empty
                    with conn.cursor() as cur:
                        cur.execute("SELECT COUNT(*) FROM patient_cases;")
                        row = cur.fetchone()
                        if row and row[0] == 0:
                            for c in INITIAL_SEED_CASES:
                                self.save_case(c)
                            logger.info("Seeded %d initial clinical cases into PostgreSQL.", len(INITIAL_SEED_CASES))
        except Exception as err:
            logger.error("Error initializing PostgreSQL tables: %s", err)

    # -------------------------------------------------------------
    # Doctor Authentication Operations
    # -------------------------------------------------------------
    def get_doctor_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        clean_email = email.lower().strip()
        if clean_email in ["dr.suresh", "suresh", "dr.mishra", "dr.suresh.mishra@hospital.gov.in"]:
            clean_email = "dr.mishra@hospital.gov.in"

        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    import psycopg2.extras
                    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                        cur.execute("SELECT * FROM doctors WHERE LOWER(email) = LOWER(%s)", (clean_email,))
                        row = cur.fetchone()
                        return dict(row) if row else None
                except Exception as e:
                    logger.warning("Postgres get_doctor error (%s), fallback to SQLite.", e)

        conn = self._get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM doctors WHERE LOWER(email) = LOWER(?)", (clean_email,))
        row = cur.fetchone()
        res = dict(row) if row else None
        conn.close()
        return res

    def get_doctor_by_id(self, doctor_id: str) -> Optional[Dict[str, Any]]:
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    import psycopg2.extras
                    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                        cur.execute("SELECT * FROM doctors WHERE id = %s", (doctor_id,))
                        row = cur.fetchone()
                        return dict(row) if row else None
                except Exception as e:
                    logger.warning("Postgres get_doctor_by_id error (%s), fallback to SQLite.", e)

        conn = self._get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM doctors WHERE id = ?", (doctor_id,))
        row = cur.fetchone()
        res = dict(row) if row else None
        conn.close()
        return res

    def list_doctors(self) -> List[Dict[str, Any]]:
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    import psycopg2.extras
                    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                        cur.execute("SELECT id, name, email, mci_reg_number, department, room_number, role, phone, avatar, last_login_at FROM doctors ORDER BY name ASC")
                        return [dict(r) for r in cur.fetchall()]
                except Exception as e:
                    logger.warning("Postgres list_doctors error (%s), fallback to SQLite.", e)

        conn = self._get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, name, email, mci_reg_number, department, room_number, role, phone, avatar, last_login_at FROM doctors ORDER BY name ASC")
        res = [dict(r) for r in cur.fetchall()]
        conn.close()
        return res

    def register_doctor(self, doc: Dict[str, Any], password_plain: str) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        email = doc.get("email", "").lower().strip()
        mci = doc.get("mciRegNumber", "").strip()
        
        existing = self.get_doctor_by_email(email)
        if existing:
            return False, None, "A doctor with this email is already registered."

        salt = generate_salt()
        p_hash = hash_password(password_plain, salt)
        doc_id = doc.get("id") or f"DOC-2026-{int(time.time()) % 1000:03d}"
        
        saved_pg = False
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO doctors (id, name, email, password_hash, salt, mci_reg_number, department, room_number, role, phone, avatar)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """, (
                            doc_id, doc["name"], email, p_hash, salt, mci,
                            doc.get("department", "General Medicine"), doc.get("roomNumber", "Room 101"),
                            doc.get("role", "CONSULTANT_PHYSICIAN"), doc.get("phone", ""), doc.get("avatar", "DR")
                        ))
                    saved_pg = True
                except Exception as e:
                    logger.warning("Postgres register_doctor error (%s), falling back to SQLite.", e)

        if not saved_pg:
            conn = self._get_sqlite_conn()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO doctors (id, name, email, password_hash, salt, mci_reg_number, department, room_number, role, phone, avatar)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                doc_id, doc["name"], email, p_hash, salt, mci,
                doc.get("department", "General Medicine"), doc.get("roomNumber", "Room 101"),
                doc.get("role", "CONSULTANT_PHYSICIAN"), doc.get("phone", ""), doc.get("avatar", "DR")
            ))
            conn.commit()
            conn.close()

        clean_profile = {
            "id": doc_id,
            "name": doc["name"],
            "email": email,
            "mciRegNumber": mci,
            "department": doc.get("department", "General Medicine"),
            "roomNumber": doc.get("roomNumber", "Room 101"),
            "role": doc.get("role", "CONSULTANT_PHYSICIAN"),
            "phone": doc.get("phone", ""),
            "avatar": doc.get("avatar", "DR"),
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        return True, clean_profile, None

    def update_doctor_login_success(self, doctor_id: str):
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        updated_pg = False
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    with conn.cursor() as cur:
                        cur.execute("UPDATE doctors SET failed_attempts = 0, lockout_until = NULL, last_login_at = %s WHERE id = %s", (now_iso, doctor_id))
                    updated_pg = True
                except Exception as e:
                    logger.warning("Postgres update_login_success error (%s).", e)

        conn = self._get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("UPDATE doctors SET failed_attempts = 0, lockout_until = NULL, last_login_at = ? WHERE id = ?", (now_iso, doctor_id))
        conn.commit()
        conn.close()

    def update_doctor_login_failure(self, doctor_id: str, new_attempts: int, lockout_until: Optional[int]):
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    with conn.cursor() as cur:
                        cur.execute("UPDATE doctors SET failed_attempts = %s, lockout_until = %s WHERE id = %s", (new_attempts, lockout_until, doctor_id))
                except Exception as e:
                    logger.warning("Postgres update_login_failure error (%s).", e)

        conn = self._get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("UPDATE doctors SET failed_attempts = ?, lockout_until = ? WHERE id = ?", (new_attempts, lockout_until, doctor_id))
        conn.commit()
        conn.close()


    # -------------------------------------------------------------
    # Session Management
    # -------------------------------------------------------------
    def create_session(self, doctor_profile: Dict[str, Any], validity_hours: int = 8) -> Dict[str, Any]:
        token = generate_token()
        now_ms = int(time.time() * 1000)
        expires_at = now_ms + (validity_hours * 3600 * 1000)
        profile_json = json.dumps(doctor_profile, default=str)

        saved_pg = False
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO auth_sessions (token, doctor_id, doctor_profile, issued_at, expires_at, is_active)
                            VALUES (%s, %s, %s, %s, %s, TRUE)
                        """, (token, doctor_profile["id"], profile_json, now_ms, expires_at))
                    saved_pg = True
                except Exception as e:
                    logger.warning("Postgres create_session error (%s).", e)

        if not saved_pg:
            conn = self._get_sqlite_conn()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO auth_sessions (token, doctor_id, doctor_profile, issued_at, expires_at, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
            """, (token, doctor_profile["id"], profile_json, now_ms, expires_at))
            conn.commit()
            conn.close()

        return {
            "token": token,
            "doctorId": doctor_profile["id"],
            "doctor": doctor_profile,
            "issuedAt": now_ms,
            "expiresAt": expires_at
        }

    def get_session(self, token: str) -> Optional[Dict[str, Any]]:
        if not token:
            return None
        now_ms = int(time.time() * 1000)

        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    import psycopg2.extras
                    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                        cur.execute("SELECT * FROM auth_sessions WHERE token = %s AND is_active = TRUE", (token,))
                        row = cur.fetchone()
                        if row and row["expires_at"] >= now_ms:
                            profile = row["doctor_profile"] if isinstance(row["doctor_profile"], dict) else json.loads(row["doctor_profile"])
                            return {
                                "token": row["token"],
                                "doctorId": row["doctor_id"],
                                "doctor": profile,
                                "issuedAt": row["issued_at"],
                                "expiresAt": row["expires_at"],
                            }
                except Exception as e:
                    logger.warning("Postgres get_session error (%s).", e)

        conn = self._get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM auth_sessions WHERE token = ? AND is_active = 1", (token,))
        row = cur.fetchone()
        conn.close()
        if not row or row["expires_at"] < now_ms:
            return None
        profile = json.loads(row["doctor_profile"])
        return {
            "token": row["token"],
            "doctorId": row["doctor_id"],
            "doctor": profile,
            "issuedAt": row["issued_at"],
            "expiresAt": row["expires_at"],
        }

    def delete_session(self, token: str):
        if not token:
            return
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    with conn.cursor() as cur:
                        cur.execute("UPDATE auth_sessions SET is_active = FALSE WHERE token = %s", (token,))
                except Exception as e:
                    logger.warning("Postgres delete_session error (%s).", e)

        conn = self._get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("UPDATE auth_sessions SET is_active = 0 WHERE token = ?", (token,))
        conn.commit()
        conn.close()

    # -------------------------------------------------------------
    # Audit Logging
    # -------------------------------------------------------------
    def add_audit_log(self, doctor_id: str, doctor_name: str, action: str, ip_address: str, details: str, target_id: Optional[str] = None):
        log_id = f"log-{int(time.time() * 1000)}-{os.urandom(2).hex()}"
        iso_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        logged_pg = False
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO audit_logs (id, timestamp, doctor_id, doctor_name, action, ip_address, details, target_id)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """, (log_id, iso_time, doctor_id, doctor_name, action, ip_address, details, target_id))
                    logged_pg = True
                except Exception as e:
                    logger.warning("Postgres add_audit_log error (%s).", e)

        if not logged_pg:
            conn = self._get_sqlite_conn()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO audit_logs (id, timestamp, doctor_id, doctor_name, action, ip_address, details, target_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (log_id, iso_time, doctor_id, doctor_name, action, ip_address, details, target_id))
            conn.commit()
            conn.close()

    def get_audit_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    import psycopg2.extras
                    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                        cur.execute("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT %s", (limit,))
                        return [dict(r) for r in cur.fetchall()]
                except Exception as e:
                    logger.warning("Postgres get_audit_logs error (%s).", e)

        conn = self._get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?", (limit,))
        res = [dict(r) for r in cur.fetchall()]
        conn.close()
        return res

    # -------------------------------------------------------------
    # Patient Cases CRUD
    # -------------------------------------------------------------
    def get_all_cases(self) -> List[Dict[str, Any]]:
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    import psycopg2.extras
                    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                        cur.execute("SELECT * FROM patient_cases ORDER BY updated_at DESC")
                        rows = cur.fetchall()
                        out = []
                        for r in rows:
                            c = dict(r)
                            for k in ["patient", "associated_symptoms", "past_medical_history", "current_medications", "allergies", "answers", "documents", "ayush", "clinical_considerations", "timeline"]:
                                if k in c and isinstance(c[k], str):
                                    try:
                                        c[k] = json.loads(c[k])
                                    except Exception:
                                        pass
                            out.append(self._format_case_dict(c))
                        return out
                except Exception as e:
                    logger.warning("Postgres get_all_cases error (%s).", e)

        conn = self._get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM patient_cases ORDER BY updated_at DESC")
        rows = cur.fetchall()
        out = []
        for r in rows:
            c = dict(r)
            out.append(self._format_case_dict(c))
        conn.close()
        return out

    def get_case_by_id(self, case_id: str) -> Optional[Dict[str, Any]]:
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    import psycopg2.extras
                    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                        cur.execute("SELECT * FROM patient_cases WHERE id = %s", (case_id,))
                        row = cur.fetchone()
                        return self._format_case_dict(dict(row)) if row else None
                except Exception as e:
                    logger.warning("Postgres get_case_by_id error (%s).", e)

        conn = self._get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM patient_cases WHERE id = ?", (case_id,))
        row = cur.fetchone()
        res = self._format_case_dict(dict(row)) if row else None
        conn.close()
        return res

    def save_case(self, case_data: Dict[str, Any]) -> Dict[str, Any]:
        case_id = case_data.get("id") or f"MK-{int(time.time() * 1000) % 90000 + 10000}"
        now_str = time.strftime("%Y-%m-%d %H:%M", time.localtime())

        patient_json = json.dumps(case_data.get("patient", {}))
        chief_complaint = case_data.get("chiefComplaint", "Not provided")
        duration = case_data.get("duration", "Not specified")
        associated_symptoms = json.dumps(case_data.get("associatedSymptoms", []))
        past_med_history = json.dumps(case_data.get("pastMedicalHistory", []))
        current_meds = json.dumps(case_data.get("currentMedications", []))
        allergies = json.dumps(case_data.get("allergies", []))
        relevant_prev = case_data.get("relevantPreviousHistory", "")
        arrival_time = case_data.get("arrivalTime") or time.strftime("%I:%M %p", time.localtime())
        status = case_data.get("status", "Case Ready")
        answers = json.dumps(case_data.get("answers", []))
        documents = json.dumps(case_data.get("documents", []))
        ayush = json.dumps(case_data.get("ayush", {}))
        clinical_considerations = json.dumps(case_data.get("clinicalConsiderations", {}))
        ai_summary = case_data.get("aiSummary", "")
        timeline = json.dumps(case_data.get("timeline", []))

        saved_pg = False
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO patient_cases (
                                id, patient, chief_complaint, duration, associated_symptoms,
                                past_medical_history, current_medications, allergies,
                                relevant_previous_history, arrival_time, status, answers,
                                documents, ayush, clinical_considerations, ai_summary,
                                timeline, updated_at
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (id) DO UPDATE SET
                                patient = EXCLUDED.patient,
                                chief_complaint = EXCLUDED.chief_complaint,
                                duration = EXCLUDED.duration,
                                associated_symptoms = EXCLUDED.associated_symptoms,
                                past_medical_history = EXCLUDED.past_medical_history,
                                current_medications = EXCLUDED.current_medications,
                                allergies = EXCLUDED.allergies,
                                relevant_previous_history = EXCLUDED.relevant_previous_history,
                                status = EXCLUDED.status,
                                answers = EXCLUDED.answers,
                                documents = EXCLUDED.documents,
                                ayush = EXCLUDED.ayush,
                                clinical_considerations = EXCLUDED.clinical_considerations,
                                ai_summary = EXCLUDED.ai_summary,
                                timeline = EXCLUDED.timeline,
                                updated_at = EXCLUDED.updated_at
                        """, (
                            case_id, patient_json, chief_complaint, duration, associated_symptoms,
                            past_med_history, current_meds, allergies, relevant_prev, arrival_time,
                            status, answers, documents, ayush, clinical_considerations, ai_summary,
                            timeline, now_str
                        ))
                    saved_pg = True
                except Exception as e:
                    logger.warning("Postgres save_case error (%s), fallback to SQLite.", e)

        if not saved_pg:
            conn = self._get_sqlite_conn()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO patient_cases (
                    id, patient, chief_complaint, duration, associated_symptoms,
                    past_medical_history, current_medications, allergies,
                    relevant_previous_history, arrival_time, status, answers,
                    documents, ayush, clinical_considerations, ai_summary,
                    timeline, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    patient = excluded.patient,
                    chief_complaint = excluded.chief_complaint,
                    duration = excluded.duration,
                    associated_symptoms = excluded.associated_symptoms,
                    past_medical_history = excluded.past_medical_history,
                    current_medications = excluded.current_medications,
                    allergies = excluded.allergies,
                    relevant_previous_history = excluded.relevant_previous_history,
                    status = excluded.status,
                    answers = excluded.answers,
                    documents = excluded.documents,
                    ayush = excluded.ayush,
                    clinical_considerations = excluded.clinical_considerations,
                    ai_summary = excluded.ai_summary,
                    timeline = excluded.timeline,
                    updated_at = excluded.updated_at
            """, (
                case_id, patient_json, chief_complaint, duration, associated_symptoms,
                past_med_history, current_meds, allergies, relevant_prev, arrival_time,
                status, answers, documents, ayush, clinical_considerations, ai_summary,
                timeline, now_str
            ))
            conn.commit()
            conn.close()

        case_data["id"] = case_id
        case_data["updatedAt"] = now_str
        return case_data

    def update_case_status(self, case_id: str, status: str) -> bool:
        now_str = time.strftime("%Y-%m-%d %H:%M", time.localtime())
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    with conn.cursor() as cur:
                        cur.execute("UPDATE patient_cases SET status = %s, updated_at = %s WHERE id = %s", (status, now_str, case_id))
                except Exception as e:
                    logger.warning("Postgres update_case_status error (%s).", e)

        conn = self._get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("UPDATE patient_cases SET status = ?, updated_at = ? WHERE id = ?", (status, now_str, case_id))
        conn.commit()
        conn.close()
        return True

    def update_case_summary(self, case_id: str, summary: str) -> bool:
        now_str = time.strftime("%Y-%m-%d %H:%M", time.localtime())
        if self.is_postgres:
            conn = self._get_pg_conn()
            if conn:
                try:
                    with conn.cursor() as cur:
                        cur.execute("UPDATE patient_cases SET ai_summary = %s, updated_at = %s WHERE id = %s", (summary, now_str, case_id))
                except Exception as e:
                    logger.warning("Postgres update_case_summary error (%s).", e)

        conn = self._get_sqlite_conn()
        cur = conn.cursor()
        cur.execute("UPDATE patient_cases SET ai_summary = ?, updated_at = ? WHERE id = ?", (summary, now_str, case_id))
        conn.commit()
        conn.close()
        return True


    def _format_case_dict(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Convert snake_case DB columns to CamelCase frontend PatientCase interface."""
        def parse_json(val, default):
            if val is None:
                return default
            if isinstance(val, (dict, list)):
                return val
            try:
                return json.loads(val)
            except Exception:
                return default

        return {
            "id": raw.get("id"),
            "patient": parse_json(raw.get("patient"), {}),
            "chiefComplaint": raw.get("chief_complaint") or raw.get("chiefComplaint", ""),
            "duration": raw.get("duration", ""),
            "associatedSymptoms": parse_json(raw.get("associated_symptoms") or raw.get("associatedSymptoms"), []),
            "pastMedicalHistory": parse_json(raw.get("past_medical_history") or raw.get("pastMedicalHistory"), []),
            "currentMedications": parse_json(raw.get("current_medications") or raw.get("currentMedications"), []),
            "allergies": parse_json(raw.get("allergies"), []),
            "relevantPreviousHistory": raw.get("relevant_previous_history") or raw.get("relevantPreviousHistory", ""),
            "arrivalTime": raw.get("arrival_time") or raw.get("arrivalTime", ""),
            "status": raw.get("status", "Case Ready"),
            "answers": parse_json(raw.get("answers"), []),
            "documents": parse_json(raw.get("documents"), []),
            "ayush": parse_json(raw.get("ayush"), {}),
            "clinicalConsiderations": parse_json(raw.get("clinical_considerations") or raw.get("clinicalConsiderations"), {}),
            "aiSummary": raw.get("ai_summary") or raw.get("aiSummary", ""),
            "timeline": parse_json(raw.get("timeline"), []),
            "updatedAt": str(raw.get("updated_at") or raw.get("updatedAt", ""))
        }

# Singleton instance
db_manager = DatabaseManager()
