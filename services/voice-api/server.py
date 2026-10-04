"""
server.py
---------
MediKiok Voice Backend — Sarvam Saaras v2 Integration.

Serves the React frontend at http://localhost:5000/api/transcribe.

Flow per request:
  1. Browser sends real recorded audio (multipart/form-data) from MediaRecorder.
  2. We write audio bytes to a temp file.
  3. We POST to Sarvam /speech-to-text twice:
       a) mode=transcribe  -> regional (Odia/Hindi/English) transcript
       b) mode=translate   -> English translation
  4. Return both as JSON to the React frontend.

Security: SARVAM_API_KEY is read from .env — never exposed to the browser/React/Vite.
"""

import os
import sys
import json
import logging
import tempfile
import urllib.parse
import base64
import re
import time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

import requests

# Production Database & Medical Vector DB integrations
from database import db_manager, verify_password, hash_password, generate_salt
from vector_db import vector_db


# ------------------------------------------------------------------
# Load SARVAM_API_KEY and GEMINI_API_KEY from .env (server-side only)
# ------------------------------------------------------------------
_ENV_PATH = Path(__file__).parent / ".env"

def _load_env():
    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ[key.strip()] = value.strip()  # Always override stale env vars

_load_env()

SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "")
SARVAM_ENDPOINT = "https://api.sarvam.ai/speech-to-text"
SARVAM_MODEL = "saaras:v4"

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
GEMINI_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-flash-lite"]
GEMINI_MODEL = GEMINI_MODELS[0]

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:%(name)s:%(message)s",
)
logger = logging.getLogger(__name__)

if not SARVAM_API_KEY or SARVAM_API_KEY == "your_sarvam_api_key_here":
    logger.warning("=" * 60)
    logger.warning("SARVAM_API_KEY is not set in .env!")
    logger.warning("Edit indic-speech-translate-main/.env and add:")
    logger.warning("  SARVAM_API_KEY=<your key from https://dashboard.sarvam.ai>")
    logger.warning("=" * 60)
else:
    logger.info("Sarvam API key loaded from .env (key hidden for security).")

if GEMINI_API_KEY:
    logger.info("Gemini API key loaded from .env (primary model: %s).", GEMINI_MODEL)
else:
    logger.info("GEMINI_API_KEY not configured. Using Medical Knowledge Graph clinical heuristic engine.")

# ------------------------------------------------------------------
# Language code mapping
# ------------------------------------------------------------------
LANG_CODE_MAP = {
    "odia": "od-IN",
    "or": "od-IN",
    "hindi": "hi-IN",
    "hi": "hi-IN",
    "english": "en-IN",
    "en": "en-IN",
    "tamil": "ta-IN",
    "ta": "ta-IN",
    "telugu": "te-IN",
    "te": "te-IN",
    "kannada": "kn-IN",
    "kn": "kn-IN",
    "bengali": "bn-IN",
    "bn": "bn-IN",
    "gujarati": "gu-IN",
    "gu": "gu-IN",
    "marathi": "mr-IN",
    "mr": "mr-IN",
    "punjabi": "pa-IN",
    "pa": "pa-IN",
    "malayalam": "ml-IN",
    "ml": "ml-IN",
    "assamese": "as-IN",
    "as": "as-IN",
    "urdu": "ur-IN",
    "ur": "ur-IN",
}

def resolve_lang_code(lang: str) -> str:
    return LANG_CODE_MAP.get(lang.lower().strip(), "od-IN")


# ------------------------------------------------------------------
# Sarvam API call
# ------------------------------------------------------------------
import subprocess

def normalize_to_wav(input_path: str) -> str:
    """
    If ffmpeg is available, convert any audio (webm, ogg, mp4, etc.) to
    clean 16kHz 16-bit mono PCM WAV for maximum ASR accuracy with Sarvam.
    Uses error-tolerant demuxing flags for browser-recorded WebM streams.
    Returns path to converted wav file, or original path if conversion fails.
    """
    wav_path = input_path + "_16k.wav"
    try:
        res = subprocess.run(
            [
                "ffmpeg", "-y",
                "-fflags", "+genpts+discardcorrupt",
                "-err_detect", "ignore_err",
                "-i", input_path,
                "-ar", "16000",
                "-ac", "1",
                "-c:a", "pcm_s16le",
                wav_path,
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if res.returncode == 0 and os.path.exists(wav_path) and os.path.getsize(wav_path) > 100:
            logger.info("[Server] Audio normalized to 16kHz mono WAV: %s (%d bytes)", wav_path, os.path.getsize(wav_path))
            return wav_path
        else:
            logger.warning("[Server] ffmpeg conversion returned code %d: %s", res.returncode, (res.stderr or "")[-300:])
    except Exception as e:
        logger.warning("[Server] ffmpeg conversion error: %s", e)
    return input_path


def call_sarvam(audio_path: str, language_code: str, mode: str) -> dict:
    """
    POST audio to Sarvam /speech-to-text.
    mode: 'transcribe' (regional) or 'translate' (English output).
    Returns raw Sarvam JSON response dict.
    """
    if not SARVAM_API_KEY or SARVAM_API_KEY == "your_sarvam_api_key_here":
        raise RuntimeError("SARVAM_API_KEY not configured in .env")

    ext = os.path.splitext(audio_path)[1].lower()
    mime_map = {
        ".wav": "audio/wav",
        ".webm": "audio/webm",
        ".mp3": "audio/mpeg",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
    }
    content_type = mime_map.get(ext, "audio/wav")
    headers = {"api-subscription-key": SARVAM_API_KEY}

    with open(audio_path, "rb") as audio_file:
        files = {"file": (os.path.basename(audio_path), audio_file, content_type)}
        data = {
            "model": SARVAM_MODEL,
            "language_code": language_code,
            "mode": mode,
            "with_timestamps": "false",
            "with_disfluencies": "false",
        }
        logger.info("[Sarvam] POST %s model=%s lang=%s mode=%s mime=%s", SARVAM_ENDPOINT, SARVAM_MODEL, language_code, mode, content_type)
        response = requests.post(SARVAM_ENDPOINT, headers=headers, files=files, data=data, timeout=60)

    logger.info("[Sarvam] HTTP %d", response.status_code)
    if response.status_code != 200:
        logger.error("[Sarvam] Error: %s", response.text[:400])
        raise RuntimeError(f"Sarvam HTTP {response.status_code}: {response.text[:300]}")

    result = response.json()
    logger.info("[Sarvam] Response: %s", json.dumps(result)[:300])
    return result


def extract_transcript(sarvam_response: dict) -> str:
    return (
        sarvam_response.get("transcript")
        or sarvam_response.get("text")
        or ""
    ).strip()


# Persistent disk and memory cache for synthesized question audio (text -> base64 wav)
TTS_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tts_cache.json")
TMP_CACHE_FILE = "/tmp/medikiok_tts_cache.json"
TTS_CACHE: dict = {}

for path_to_try in (TTS_CACHE_FILE, TMP_CACHE_FILE):
    if os.path.exists(path_to_try):
        try:
            with open(path_to_try, "r", encoding="utf-8") as _f:
                loaded = json.load(_f)
                TTS_CACHE.update(loaded)
        except Exception as _e:
            pass
logger.info("[Server TTS] Loaded %d cached audio items", len(TTS_CACHE))

def save_tts_cache():
    try:
        # Write to /tmp so we NEVER trigger Vite file watcher in the project root
        with open(TMP_CACHE_FILE, "w", encoding="utf-8") as _f:
            json.dump(TTS_CACHE, _f)
    except Exception as _e:
        logger.warning("[Server TTS] Failed to save /tmp cache: %s", _e)

def call_sarvam_tts(text: str, language_code: str = "od-IN") -> str:
    """
    Generate authentic Odia speech audio using Sarvam bulbul:v3.
    Returns base64-encoded audio (WAV).
    """
    if not SARVAM_API_KEY or SARVAM_API_KEY == "your_sarvam_api_key_here":
        raise RuntimeError("SARVAM_API_KEY not configured in .env")

    headers = {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "inputs": [text],
        "target_language_code": language_code,
        "speaker": "ritu",
        "model": "bulbul:v3",
    }
    logger.info("[Sarvam TTS] Requesting speech for: '%s' (lang=%s)", text[:40], language_code)
    resp = requests.post("https://api.sarvam.ai/text-to-speech", headers=headers, json=payload, timeout=20)
    if resp.status_code != 200:
        logger.error("[Sarvam TTS] HTTP %d: %s", resp.status_code, resp.text[:300])
        raise RuntimeError(f"Sarvam TTS HTTP {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    audios = data.get("audios", [])
    if not audios:
        raise RuntimeError("No audio received from Sarvam TTS")
    return audios[0]


# ------------------------------------------------------------------
# Gemini Flash Clinical Reasoning & Adaptive Question Generator
# ------------------------------------------------------------------

def get_fallback_clinical_reasoning(dialogue_history: list, patient_info: dict, latest_regional: str, latest_english: str) -> dict:
    """
    Intelligent Medical Knowledge Graph engine for clinical intake reasoning
    when Gemini API key is not present or during offline fallback.
    """
    combined_text = (
        " ".join([t.get("answer_english", "") + " " + t.get("answer_regional", "") for t in dialogue_history])
        + " " + latest_english + " " + latest_regional
    ).lower()

    step_count = len(dialogue_history) + (1 if latest_english or latest_regional else 0)

    # 1. Detect Clinical Domains
    is_fever = any(w in combined_text for w in ["fever", "ଜ୍ୱର", "बुखार", "temperature", "chills", "ଥଣ୍ଡା"])
    is_respiratory = any(w in combined_text for w in ["cough", "କାଶ", "खांसी", "cold", "breath", "throat", "ଶ୍ୱାସ", "गला"])
    is_pain = any(w in combined_text for w in ["pain", "ache", "ବିନ୍ଧା", "ପୀଡ଼ା", "दर्द", "headache", "ମୁଣ୍ଡବିନ୍ଧା"])
    is_cardiac = any(w in combined_text for w in ["chest", "ଛାତି", "सीने", "bp", "blood pressure", "hypertension", "heart"])
    is_gi = any(w in combined_text for w in ["stomach", "vomit", "loose", "diarrhea", "ବାନ୍ତି", "ପେଟ", "पेट"])

    # 2. Build Differentials & Considerations
    suspicions = []
    symptoms = []
    red_flags = []
    risk_level = "Mild"
    prakriti_vikriti = "Vata-Pitta Dushti"
    agni = "Mandagni"

    if is_fever:
        suspicions.append("Acute Febrile Illness (AFI)")
        symptoms.append("Elevated body temperature / Fever")
        if is_respiratory:
            suspicions.append("Viral Upper Respiratory Tract Infection (URTI)")
            symptoms.append("Cough & Upper respiratory involvement")
        if is_pain:
            suspicions.append("Suspected Viral Prodrome / Dengue / Chikungunya")
            symptoms.append("Generalized body ache / Myalgia")
            prakriti_vikriti = "Vata-Pitta Dushti (Febrile & Inflammatory state)"
        if "shiver" in combined_text or "chills" in combined_text or "ଥଣ୍ଡା" in combined_text:
            suspicions.append("Rule out Malaria / Enteric Fever")
            symptoms.append("Fever with rigors/chills")

    if is_cardiac:
        suspicions.append("Hypertension / Cardiovascular Review Required")
        symptoms.append("Chest discomfort / BP concern")
        risk_level = "Moderate"
        red_flags.append("Monitor Blood Pressure and ECG if chest discomfort persists")

    if is_gi:
        suspicions.append("Acute Gastroenteritis / Dyspepsia")
        symptoms.append("Gastrointestinal distress")
        agni = "Agnimandya / Vishamagni"

    if not suspicions:
        suspicions = ["General Symptomatic OPD Presentation", "Clinical Evaluation Pending"]
        symptoms = [latest_english or "Patient reported primary concern"]
        risk_level = "Mild"

    # 3. Formulate the Next Best Adaptive Question
    next_q = None

    if step_count == 1:
        # After Chief Complaint -> Inquire about Duration & Onset
        next_q = {
            "id": f"dyn_q_{step_count+1}",
            "category": "Chief Concern",
            "type": "text",
            "text_en": "How long have you been experiencing this problem, and did it start suddenly?",
            "text_or": "ଆପଣଙ୍କୁ ଏହି ସମସ୍ୟା କେତେ ଦିନ ହେଲା ହେଉଛି ଏବଂ ଏହା ହଠାତ୍ ଆରମ୍ଭ ହୋଇଥିଲା କି?",
            "text_hi": "आपको यह समस्या कितने समय से हो रही है, और क्या यह अचानक शुरू हुई थी?",
            "placeholder_en": "e.g., 3 days, 2 weeks, since yesterday morning...",
            "placeholder_or": "ଯେପରି: ୩ ଦିନ, ୨ ସପ୍ତାହ, କାଲି ସକାଳୁ...",
            "placeholder_hi": "जैसे, 3 दिन, 2 हफ्ते, कल सुबह से...",
            "is_terminal": False,
        }
    elif step_count == 2:
        # After Duration -> Inquire about Associated Core Symptoms
        if is_fever:
            next_q = {
                "id": f"dyn_q_{step_count+1}",
                "category": "Symptoms",
                "type": "yes-no",
                "text_en": "Are you having chills, severe headache, body ache, or joint pain?",
                "text_or": "ଆପଣଙ୍କୁ କମ୍ପ ସହ ଥଣ୍ଡା, ପ୍ରବଳ ମୁଣ୍ଡବିନ୍ଧା କିମ୍ବା ଶରୀର ପୀଡ଼ା ହେଉଛି କି?",
                "text_hi": "क्या आपको कंपकंपी के साथ ठंड, तेज सिरदर्द या शरीर में दर्द हो रहा है?",
                "placeholder_en": "Select Yes / No or speak your answer",
                "placeholder_or": "ହଁ / ନା ବାଛନ୍ତୁ କିମ୍ବା ଉତ୍ତର କୁହନ୍ତୁ",
                "placeholder_hi": "हाँ / नहीं चुनें या अपना उत्तर बोलें",
                "is_terminal": False,
            }
        else:
            next_q = {
                "id": f"dyn_q_{step_count+1}",
                "category": "Symptoms",
                "type": "yes-no",
                "text_en": "Do you have any cough, shortness of breath, or chest heaviness?",
                "text_or": "ଆପଣଙ୍କର କାଶ, ଶ୍ୱାସକଷ୍ଟ କିମ୍ବା ଛାତିରେ ଭାରୀପଣ ଅଛି କି?",
                "text_hi": "क्या आपको खांसी, सांस लेने में तकलीफ या सीने में भारीपन है?",
                "placeholder_en": "Select Yes / No or speak your answer",
                "placeholder_or": "ହଁ / ନା ବାଛନ୍ତୁ କିମ୍ବା ଉତ୍ତର କୁହନ୍ତୁ",
                "placeholder_hi": "हाँ / नहीं चुनें या अपना उत्तर बोलें",
                "is_terminal": False,
            }
    elif step_count == 3:
        # Inquire about Differential Red Flags / Warning Signs
        if is_fever:
            next_q = {
                "id": f"dyn_q_{step_count+1}",
                "category": "Differential Assessment",
                "type": "yes-no",
                "text_en": "Have you noticed any skin rash, pain behind your eyes, or bleeding from nose/gums?",
                "text_or": "ଆପଣଙ୍କ ଶରୀରରେ କୌଣସି ଲାଲ ଦାଗ, ଆଖି ପଛପଟେ ଯନ୍ତ୍ରଣା କିମ୍ବା ରକ୍ତସ୍ରାବ ହୋଇଛି କି?",
                "text_hi": "क्या आपके शरीर पर लाल चकत्ते, आंखों के पीछे दर्द या नाक/मसूड़ों से खून आया है?",
                "placeholder_en": "Select Yes / No or speak your answer",
                "placeholder_or": "ହଁ / ନା ବାଛନ୍ତୁ କିମ୍ବା ଉତ୍ତର କୁହନ୍ତୁ",
                "placeholder_hi": "हाँ / नहीं चुनें या अपना उत्तर बोलें",
                "is_terminal": False,
            }
        else:
            next_q = {
                "id": f"dyn_q_{step_count+1}",
                "category": "Differential Assessment",
                "type": "yes-no",
                "text_en": "Are you feeling extreme weakness, dizziness, or loss of appetite?",
                "text_or": "ଆପଣଙ୍କୁ ଅତ୍ୟଧିକ ଦୁର୍ବଳତା, ମୁଣ୍ଡ ବୁଲାଇବା କିମ୍ବା ଭୋକ ନ ଲାଗିବା ହେଉଛି କି?",
                "text_hi": "क्या आपको बहुत अधिक कमजोरी, चक्कर आना या भूख न लगना महसूस हो रहा है?",
                "placeholder_en": "Select Yes / No or speak your answer",
                "placeholder_or": "ହଁ / ନା ବାଛନ୍ତୁ କିମ୍ବା ଉତ୍ତର କୁହନ୍ତୁ",
                "placeholder_hi": "हाँ / नहीं चुनें या अपना उत्तर बोलें",
                "is_terminal": False,
            }
    elif step_count == 4:
        # Inquire about Past Medical Conditions
        next_q = {
            "id": f"dyn_q_{step_count+1}",
            "category": "History",
            "type": "multi-select",
            "text_en": "Do you have any existing health conditions like High BP, Diabetes, or Asthma?",
            "text_or": "ଆପଣଙ୍କର ହାଇ ବିପି, ମଧୁମେହ (Diabetes) କିମ୍ବା ଆଜମା ପରି କୌଣସି ପୂର୍ବ ସମସ୍ୟା ଅଛି କି?",
            "text_hi": "क्या आपको हाई बीपी, डायबिटीज या अस्थमा जैसी कोई पुरानी बीमारी है?",
            "options": [
                "Hypertension (High BP)",
                "Diabetes Mellitus",
                "Asthma / Respiratory Issue",
                "Heart Condition",
                "Thyroid Disorder",
                "None of the above",
            ],
            "placeholder_en": "Select conditions or speak",
            "placeholder_or": "ତାଲିକାରୁ ବାଛନ୍ତୁ କିମ୍ବା କୁହନ୍ତୁ",
            "placeholder_hi": "सूची से चुनें या बोलें",
            "is_terminal": False,
        }
    elif step_count == 5:
        # Inquire about Current Medications
        next_q = {
            "id": f"dyn_q_{step_count+1}",
            "category": "Medications",
            "type": "voice-text",
            "text_en": "Are you currently taking any regular medicines or fever tablets?",
            "text_or": "ଆପଣ ବର୍ତ୍ତମାନ କୌଣସି ନିୟମିତ ଔଷଧ କିମ୍ବା ଜ୍ୱର ବଟିକା ଖାଉଛନ୍ତି କି?",
            "text_hi": "क्या आप अभी कोई नियमित दवा या बुखार की गोली ले रहे हैं?",
            "placeholder_en": "e.g., Paracetamol 650mg, BP tablet daily...",
            "placeholder_or": "ଯେପରି: ପାରାସିଟାମଲ୍, ଦୈନିକ ବିପି ଔଷଧ...",
            "placeholder_hi": "जैसे, पैरासिटामोल, रोजाना की बीपी दवा...",
            "is_terminal": False,
        }
    elif step_count == 6:
        # Inquire about Drug / Food Allergies
        next_q = {
            "id": f"dyn_q_{step_count+1}",
            "category": "Allergies",
            "type": "voice-text",
            "text_en": "Do you have any known allergies to medicines like Penicillin, or any food allergy?",
            "text_or": "ଆପଣଙ୍କର ପେନିସିଲିନ୍ ପରି କୌଣସି ଔଷଧ କିମ୍ବା ଖାଦ୍ୟରୁ ଆଲର୍ଜି ଅଛି କି?",
            "text_hi": "क्या आपको पेनिसिलिन जैसी किसी दवा या किसी भोजन से एलर्जी है?",
            "placeholder_en": "e.g., Penicillin skin allergy, None...",
            "placeholder_or": "ଯେପରି: ପେନିସିଲିନ୍ ଆଲର୍ଜି, କିଛି ନାହିଁ...",
            "placeholder_hi": "जैसे, पेनिसिलिन एलर्जी, कोई नहीं...",
            "is_terminal": True,
        }
    else:
        # Terminal completion
        next_q = {
            "id": f"dyn_q_done",
            "category": "Allergies",
            "type": "voice-text",
            "text_en": "Thank you. Your voice case-taking is complete. Please review your summary.",
            "text_or": "ଧନ୍ୟବାଦ। ଆପଣଙ୍କ ମୌଖିକ ତଥ୍ୟ ସଂଗ୍ରହ ସମ୍ପୂର୍ଣ୍ଣ ହୋଇଛି। ଦୟାକରି ସାରାଂଶ ଯାଞ୍ଚ କରନ୍ତୁ।",
            "text_hi": "धन्यवाद। आपका मौखिक विवरण पूरा हो गया है। कृपया अपने सारांश की समीक्षा करें।",
            "placeholder_en": "Case intake complete",
            "placeholder_or": "ତଥ୍ୟ ସଂଗ୍ରହ ସମ୍ପୂର୍ଣ୍ଣ",
            "placeholder_hi": "विवरण पूरा हुआ",
            "is_terminal": True,
        }

    return {
        "status": "success",
        "source": "medical-knowledge-graph-engine",
        "clinical_considerations": {
            "primary_suspicions": suspicions,
            "symptoms_identified": symptoms,
            "red_flags": red_flags,
            "risk_level": risk_level,
            "ayush_correlation": {
                "dosha_imbalance": prakriti_vikriti,
                "agni_state": agni,
            },
            "clinical_notes": f"Automated clinical intake step {step_count}. Primary presentation correlates with {', '.join(suspicions[:2])}.",
        },
        "next_question": next_q,
    }


def call_gemini_clinical_engine(dialogue_history: list, patient_info: dict, latest_regional: str, latest_english: str) -> dict:
    """
    POST clinical conversation to Gemini Flash (1.5-flash) to derive:
      1. Clinical considerations / differential diagnosis / red flags / AYUSH dosha correlation
      2. The single next best clinical follow-up question in English, Odia, and Hindi.
    """
    if not GEMINI_API_KEY:
        logger.info("[Gemini Flash] No API key set in .env. Using Medical Knowledge Graph engine.")
        return get_fallback_clinical_reasoning(dialogue_history, patient_info, latest_regional, latest_english)

    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

    p_name = patient_info.get("name", "Patient")
    p_age = patient_info.get("age", 45)
    p_gender = patient_info.get("gender", "Male")

    history_str = ""
    for idx, turn in enumerate(dialogue_history):
        q = turn.get("question", "")
        a_reg = turn.get("answer_regional", "")
        a_eng = turn.get("answer_english", "")
        history_str += f"Turn {idx+1}:\n- Question: {q}\n- Patient Odia Answer: {a_reg}\n- English Translation: {a_eng}\n"

    system_instruction = (
        "You are an expert AI Clinical Intake Physician for an Indian hospital OPD Kiosk in Odisha, India (e.g. AIIMS Bhubaneswar). "
        "You receive structured conversational patient intake history in Odia and translated English. "
        "Your role is two-fold:\n"
        "1. CLINICAL CONSIDERATIONS: Synthesize real-time differential diagnosis considerations, identified symptoms, clinical red-flags, and AYUSH (Prakriti/Vikriti/Agni) correlation for the consulting doctor's case sheet.\n"
        "2. NEXT BEST QUESTION: Formulate the single most clinically relevant, focused follow-up question. "
        "Provide accurate, fluent, empathetic translations in English, Odia (authentic Odia script), and Hindi. "
        "Keep the question concise and easy for a patient to answer via microphone.\n\n"
        "Output ONLY a valid JSON object matching this schema:\n"
        "{\n"
        '  "clinical_considerations": {\n'
        '    "primary_suspicions": ["Diagnosis 1", "Diagnosis 2"],\n'
        '    "symptoms_identified": ["Symptom 1 with duration", "Symptom 2"],\n'
        '    "red_flags": ["Red flag warning if any, else empty array"],\n'
        '    "risk_level": "Mild" | "Moderate" | "High" | "Emergency",\n'
        '    "ayush_correlation": {\n'
        '      "dosha_imbalance": "e.g. Pitta-Vata Dushti",\n'
        '      "agni_state": "e.g. Mandagni / Vishamagni / Samagni"\n'
        '    },\n'
        '    "clinical_notes": "Brief 1-2 sentence doctor clinical summary."\n'
        '  },\n'
        '  "next_question": {\n'
        '    "id": "dyn_q_N",\n'
        '    "category": "Chief Concern" | "Symptoms" | "Differential Assessment" | "History" | "Medications" | "Allergies",\n'
        '    "type": "voice-text" | "yes-no" | "multi-select",\n'
        '    "text_en": "English question text",\n'
        '    "text_or": "Odia script question text",\n'
        '    "text_hi": "Hindi script question text",\n'
        '    "placeholder_en": "English placeholder",\n'
        '    "placeholder_or": "Odia placeholder",\n'
        '    "placeholder_hi": "Hindi placeholder",\n'
        '    "options": ["Optional button options for multi-select or quick tap"],\n'
        '    "is_terminal": false\n'
        '  }\n'
        "}"
    )

    # Medical Vector RAG Grounding: retrieve relevant AIIMS / WHO / CCRAS protocols
    rag_context = ""
    try:
        query_text = f"{latest_english} {latest_regional}"
        matched_guidelines = vector_db.search_similar_guidelines(query_text, top_k=2)
        if matched_guidelines:
            rag_context = "\n\nRelevant Standard Clinical Protocols (from Vector Knowledge Base):\n"
            for g in matched_guidelines:
                rag_context += f"- [{g['metadata'].get('title', 'Clinical Guideline')}]: {g['content']}\n"
    except Exception as rag_err:
        logger.debug("[RAG Error] %s", rag_err)

    prompt_content = f"""Patient Profile:
Name: {p_name}, Age: {p_age}, Gender: {p_gender}

Current Intake Dialogue History:
{history_str}

Latest Patient Utterance:
- Odia: "{latest_regional}"
- English Translation: "{latest_english}"
- Total questions completed so far: {len(dialogue_history)}{rag_context}

Based on this clinical progression and guidelines, provide the updated clinical considerations and the single next best follow-up question. (If 5-8 questions have been completed covering chief complaint, duration, associated symptoms, medical history, medications, and allergies, set "is_terminal": true)."""

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt_content}],
            }
        ],
        "systemInstruction": {
            "parts": [{"text": system_instruction}],
        },
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
            "maxOutputTokens": 1024,
        },
    }

    def extract_json(raw_text: str) -> dict:
        t = raw_text.strip()
        if t.startswith("```"):
            lines = t.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            t = "\n".join(lines).strip()
        start = t.find("{")
        end = t.rfind("}")
        if start != -1 and end != -1 and end > start:
            t = t[start : end + 1]
        return json.loads(t)

    FAST_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"]
    for model_name in FAST_MODELS:
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
        try:
            logger.info("[Gemini Flash] Requesting clinical reasoning for %s with %s...", p_name, model_name)
            resp = requests.post(endpoint, json=payload, timeout=2.5)
            if resp.status_code == 200:
                result_json = resp.json()
                candidates = result_json.get("candidates", [])
                if candidates:
                    text_part = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    parsed = extract_json(text_part)
                    parsed["status"] = "success"
                    parsed["source"] = f"gemini-flash ({model_name})"
                    logger.info("[Gemini Flash] Clinical reasoning generated successfully via %s.", model_name)
                    return parsed
            logger.warning("[Gemini Flash] %s HTTP %d. Falling back immediately to instant Medical Knowledge Graph.", model_name, resp.status_code)
            break
        except Exception as e:
            logger.warning("[Gemini Flash] %s call timed out or failed (%s). Falling back immediately to instant Medical Knowledge Graph.", model_name, e)
            break

    logger.info("[Clinical Engine] Generating instant clinical considerations & next question via Medical Knowledge Graph.")
    return get_fallback_clinical_reasoning(dialogue_history, patient_info, latest_regional, latest_english)


# ------------------------------------------------------------------
# Gemini Multimodal OCR Processing
# ------------------------------------------------------------------
def process_ocr_with_gemini(file_bytes: bytes, content_type: str = "image/jpeg") -> dict:
    """
    Process medical prescription or report image/PDF bytes using Gemini Flash Vision API.
    Returns normalized JSON dictionary matching OCRResult expectations.
    """
    if not GEMINI_API_KEY:
        return {
            "status": "error",
            "message": "GEMINI_API_KEY not configured on server",
            "extracted_text": "",
            "document_type": "Unknown",
            "is_prescription": False,
            "confidence": 0,
            "medicines": [],
            "structured_medicines": []
        }

    mime_type = "image/jpeg"
    if "pdf" in content_type.lower() or file_bytes[:4] == b"%PDF":
        mime_type = "application/pdf"
    elif "png" in content_type.lower() or file_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        mime_type = "image/png"
    elif "webp" in content_type.lower() or (len(file_bytes) > 12 and file_bytes[8:12] == b"WEBP"):
        mime_type = "image/webp"

    img_b64 = base64.b64encode(file_bytes).decode("utf-8")

    prompt = """You are an expert clinical physician and medical AI analyzing a medical document (prescription slip, MRI/CT scan report, X-ray report, lab test, or discharge summary).
Carefully extract all visible details into JSON format:
{
  "document_type": "Prescription" | "Scan Report" | "Lab Report" | "Discharge Summary" | "Medical Report",
  "is_prescription": true,
  "doctor_name": "...",
  "patient_name": "...",
  "date": "...",
  "age": "...",
  "gender": "...",
  "weight": "...",
  "clinical_description": "...",
  "diagnosis": "...",
  "vitals": "...",
  "handwritten_text": "...",
  "medicines": [
    {
      "medicine_name": "...",
      "dosage": "...",
      "frequency": "...",
      "duration": "...",
      "instructions": "...",
      "confidence": "high|medium|low"
    }
  ]
}
Requirements:
- Return ONLY valid JSON without markdown wrapping.
- For prescriptions, populate structured medicines and copy handwritten clinical advice."""

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": img_b64
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 2048
        }
    }

    models_to_try = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-flash-lite"]
    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
        try:
            resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=20)
            if resp.status_code == 200:
                data = resp.json()
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
                raw_clean = raw_text.strip()
                if raw_clean.startswith("```"):
                    lines = raw_clean.splitlines()
                    if lines[0].startswith("```"): lines = lines[1:]
                    if lines and lines[-1].startswith("```"): lines = lines[:-1]
                    raw_clean = "\n".join(lines).strip()
                parsed = None
                try:
                    parsed = json.loads(raw_clean)
                except Exception:
                    m = re.search(r'\{[\s\S]*\}', raw_clean)
                    if m:
                        try:
                            parsed = json.loads(m.group())
                        except Exception:
                            pass
                if parsed:
                    struct_meds = parsed.get("medicines", [])
                    formatted_meds = []
                    for m in struct_meds:
                        if isinstance(m, dict):
                            parts = [m.get("medicine_name", "")]
                            if m.get("dosage"): parts.append(m.get("dosage"))
                            if m.get("frequency"): parts.append(m.get("frequency"))
                            if m.get("duration"): parts.append(f"x {m.get('duration')}")
                            name_str = " ".join([p for p in parts if p]).strip()
                            if name_str:
                                formatted_meds.append(name_str)
                        elif isinstance(m, str):
                            formatted_meds.append(m)

                    doc_type = parsed.get("document_type", "Prescription")
                    is_rx = parsed.get("is_prescription", True)

                    summary_parts = []
                    if parsed.get("document_type"): summary_parts.append(f"Document Type: {parsed['document_type']}")
                    if parsed.get("doctor_name"): summary_parts.append(f"Doctor: {parsed['doctor_name']}")
                    if parsed.get("patient_name"): summary_parts.append(f"Name: {parsed['patient_name']}")
                    if parsed.get("clinical_description"): summary_parts.append(f"Clinical Description: {parsed['clinical_description']}")
                    if parsed.get("diagnosis"): summary_parts.append(f"Diagnosis: {parsed['diagnosis']}")
                    if parsed.get("handwritten_text"): summary_parts.append(f"Advice / Findings:\n{parsed['handwritten_text']}")

                    return {
                        "status": "success",
                        "ok": True,
                        "document_type": doc_type,
                        "is_prescription": is_rx,
                        "confidence": 0.95,
                        "doctor_name": parsed.get("doctor_name", ""),
                        "patient_info": {
                            "patientName": parsed.get("patient_name", ""),
                            "age": parsed.get("age", ""),
                            "gender": parsed.get("gender", ""),
                            "date": parsed.get("date", ""),
                            "doctorName": parsed.get("doctor_name", "")
                        },
                        "clinical_description": parsed.get("clinical_description", ""),
                        "diagnosis": parsed.get("diagnosis", ""),
                        "handwritten_text": parsed.get("handwritten_text", ""),
                        "medicines": formatted_meds,
                        "structured_medicines": struct_meds,
                        "extracted_text": "\n".join(summary_parts)
                    }
        except Exception as e:
            logger.warning("[OCR] Gemini model %s failed: %s", model_name, e)
            continue

    return {
        "status": "error",
        "message": "Gemini OCR processing failed",
        "extracted_text": "",
        "document_type": "Unknown",
        "is_prescription": False,
        "confidence": 0,
        "medicines": [],
        "structured_medicines": []
    }


# ------------------------------------------------------------------
# HTTP Handler
# ------------------------------------------------------------------
class MediKiokVoiceHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        logger.info(format, *args)

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, api-subscription-key")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            logger.warning("[Server] Client disconnected before response could be sent.")

    def do_OPTIONS(self):
        self._send_json(200, {"status": "ok"})

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")
        query_params = urllib.parse.parse_qs(parsed.query)

        # Health & OCR Health Endpoints
        if path in ("/api/health", "/api/ocr/health"):
            self._send_json(200, {"status": "ok", "service": "ocr-engine-cloud-gemini"})
            return

        # 1. Cases Endpoints
        if path == "/api/cases":
            cases = db_manager.get_all_cases()
            self._send_json(200, {"status": "success", "cases": cases})
            return

        if path.startswith("/api/cases/"):
            case_id = path.replace("/api/cases/", "").strip()
            c = db_manager.get_case_by_id(case_id)
            if c:
                self._send_json(200, {"status": "success", "case": c})
            else:
                self._send_json(404, {"status": "error", "message": f"Case {case_id} not found"})
            return

        # 2. Doctor Auth Endpoints
        if path == "/api/auth/doctors":
            doctors = db_manager.list_doctors()
            self._send_json(200, {"status": "success", "doctors": doctors})
            return

        if path == "/api/auth/session":
            auth_header = self.headers.get("Authorization", "")
            token = None
            if auth_header.startswith("Bearer "):
                token = auth_header.replace("Bearer ", "").strip()
            elif "token" in query_params:
                token = query_params["token"][0]

            if not token:
                self._send_json(401, {"status": "error", "message": "Missing session token"})
                return

            sess = db_manager.get_session(token)
            if sess:
                self._send_json(200, {"status": "success", "session": sess, "doctor": sess["doctor"]})
            else:
                self._send_json(401, {"status": "error", "message": "Invalid or expired session token"})
            return

        if path == "/api/audit/logs":
            limit = int(query_params.get("limit", [50])[0])
            logs = db_manager.get_audit_logs(limit)
            self._send_json(200, {"status": "success", "logs": logs})
            return

        # Default Health & Info
        self._send_json(200, {
            "service": "medikiok-voice-backend",
            "database_backend": "PostgreSQL (pgvector)" if db_manager.is_postgres else "SQLite (Local Persistent)",
            "vector_index_size": len(vector_db.local_index.embeddings),
            "stt_provider": "Sarvam Saaras v2",
            "tts_provider": "Sarvam bulbul:v3",
            "clinical_ai_provider": f"Gemini Flash ({GEMINI_MODEL})" if GEMINI_API_KEY else "Medical Knowledge Graph Engine",
            "model": SARVAM_MODEL,
            "gemini_configured": bool(GEMINI_API_KEY),
            "api_key_configured": bool(
                SARVAM_API_KEY and SARVAM_API_KEY != "your_sarvam_api_key_here"
            ),
            "supported_languages": list(LANG_CODE_MAP.keys()),
            "endpoints": [
                "GET  /api/cases",
                "POST /api/cases",
                "POST /api/cases/:id/status",
                "POST /api/cases/:id/summary",
                "POST /api/auth/login",
                "POST /api/auth/register",
                "POST /api/auth/logout",
                "GET  /api/auth/session",
                "GET  /api/auth/doctors",
                "POST /api/vector/search",
                "POST /api/guidelines/search",
                "POST /api/transcribe",
                "POST /api/tts",
                "POST /api/clinical-reasoning"
            ],
        })

    def _read_json_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return {}
        body = self.rfile.read(content_length)
        return json.loads(body.decode("utf-8"))

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")
        
        # Handle case updates via PUT
        if "/status" in path:
            case_id = path.replace("/api/cases/", "").replace("/status", "").strip()
            payload = self._read_json_body()
            status = payload.get("status", "Doctor Verified")
            db_manager.update_case_status(case_id, status)
            self._send_json(200, {"status": "success", "caseId": case_id, "caseStatus": status})
            return

        if "/summary" in path:
            case_id = path.replace("/api/cases/", "").replace("/summary", "").strip()
            payload = self._read_json_body()
            summary = payload.get("summary", "")
            db_manager.update_case_summary(case_id, summary)
            self._send_json(200, {"status": "success", "caseId": case_id})
            return

        self._send_json(404, {"status": "error", "message": "Endpoint not found"})

    def _handle_tts(self):
        try:
            payload = self._read_json_body()
            text = payload.get("text", "").strip()
            language = payload.get("language", "odia").strip().lower()

            if not text:
                self._send_json(400, {"status": "error", "message": "Text parameter is required."})
                return

            sarvam_lang_map = {
                "or": "od-IN", "odia": "od-IN", "od-in": "od-IN",
                "hi": "hi-IN", "hindi": "hi-IN", "hi-in": "hi-IN",
                "en": "en-IN", "english": "en-IN", "en-in": "en-IN",
                "bn": "bn-IN", "bengali": "bn-IN", "bn-in": "bn-IN",
                "te": "te-IN", "telugu": "te-IN", "te-in": "te-IN",
                "ta": "ta-IN", "tamil": "ta-IN", "ta-in": "ta-IN",
                "mr": "mr-IN", "marathi": "mr-IN", "mr-in": "mr-IN",
                "gu": "gu-IN", "gujarati": "gu-IN", "gu-in": "gu-IN",
                "kn": "kn-IN", "kannada": "kn-IN", "kn-in": "kn-IN",
                "ml": "ml-IN", "malayalam": "ml-IN", "ml-in": "ml-IN",
                "pa": "pa-IN", "punjabi": "pa-IN", "pa-in": "pa-IN",
            }
            lang_code = sarvam_lang_map.get(language, "od-IN")

            cache_key_full = f"{language}:{text}"
            audio_b64 = TTS_CACHE.get(text) or TTS_CACHE.get(cache_key_full)

            if not audio_b64:
                try:
                    logger.info("[Server TTS] Requesting speech synthesis via Sarvam for lang=%s text='%s'", language, text[:40])
                    audio_b64 = call_sarvam_tts(text, lang_code)
                    TTS_CACHE[text] = audio_b64
                    TTS_CACHE[cache_key_full] = audio_b64
                    save_tts_cache()
                except Exception as sarvam_err:
                    logger.warning("[Server TTS] Sarvam TTS call failed: %s", sarvam_err)

            if audio_b64:
                self._send_json(200, {"status": "success", "audio_base64": audio_b64})
            else:
                self._send_json(500, {"status": "error", "message": f"TTS synthesis failed for language '{language}'"})
        except Exception as err:
            logger.error("[Server TTS Error] %s", err, exc_info=True)
            self._send_json(500, {"status": "error", "message": str(err)})

    def _handle_clinical_reasoning(self):
        try:
            payload = self._read_json_body()
            dialogue_history = payload.get("dialogue_history", [])
            patient_info = payload.get("patient_info", {})
            latest_regional = payload.get("latest_regional", "")
            latest_english = payload.get("latest_english", "")

            res = call_gemini_clinical_engine(dialogue_history, patient_info, latest_regional, latest_english)
            self._send_json(200, res)
        except Exception as err:
            logger.error("[Server Clinical Reasoning Error] %s", err, exc_info=True)
            self._send_json(500, {"status": "error", "message": str(err)})

    def _handle_ocr(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            content_type = self.headers.get("Content-Type", "")
            if content_length == 0:
                self._send_json(400, {"status": "error", "message": "Empty request body"})
                return

            raw_data = self.rfile.read(content_length)
            file_bytes = None
            file_mime = "image/jpeg"

            if "multipart/form-data" in content_type and "boundary=" in content_type:
                boundary = content_type.split("boundary=")[-1].strip().encode("utf-8")
                parts = raw_data.split(b"--" + boundary)
                for part in parts:
                    if not part or part.strip() in (b"", b"--", b"--\r\n"):
                        continue
                    if b"\r\n\r\n" not in part:
                        continue
                    header_section, _, body_section = part.partition(b"\r\n\r\n")
                    header_text = header_section.decode("utf-8", errors="replace")
                    body = body_section
                    if body.endswith(b"\r\n"):
                        body = body[:-2]

                    if 'name="file"' in header_text or 'filename=' in header_text or 'name="image"' in header_text:
                        file_bytes = body
                        if "Content-Type:" in header_text:
                            for line in header_text.splitlines():
                                if line.lower().startswith("content-type:"):
                                    file_mime = line.split(":", 1)[1].strip()
                        break
            else:
                file_bytes = raw_data
                file_mime = content_type or "image/jpeg"

            if not file_bytes:
                self._send_json(400, {"status": "error", "message": "No image or document file uploaded."})
                return

            res = process_ocr_with_gemini(file_bytes, file_mime)
            self._send_json(200, res)
        except Exception as err:
            logger.error("[OCR Handler Error] %s", err, exc_info=True)
            self._send_json(500, {"status": "error", "message": str(err)})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")

        # 1. Doctor Authentication
        if path == "/api/auth/login":
            try:
                payload = self._read_json_body()
                email = payload.get("email", "")
                password = payload.get("password", "")

                doc = db_manager.get_doctor_by_email(email)
                if not doc:
                    db_manager.add_audit_log("UNKNOWN", email, "LOGIN_FAILED", "127.0.0.1", f"Unknown email {email}")
                    self._send_json(401, {"status": "error", "message": "No medical staff account registered with this email."})
                    return

                # Lockout check
                if doc.get("lockout_until") and doc["lockout_until"] > int(time.time() * 1000):
                    wait_sec = int((doc["lockout_until"] - int(time.time() * 1000)) / 1000)
                    self._send_json(403, {"status": "error", "message": f"Account temporarily locked. Retry in {wait_sec} seconds."})
                    return

                # Verify password
                if not verify_password(password, doc["salt"], doc["password_hash"]):
                    attempts = (doc.get("failed_attempts") or 0) + 1
                    lockout = (int(time.time() * 1000) + 60000) if attempts >= 5 else None
                    db_manager.update_doctor_login_failure(doc["id"], attempts, lockout)
                    db_manager.add_audit_log(doc["id"], doc["name"], "LOGIN_FAILED", "127.0.0.1", f"Failed attempt {attempts}/5")
                    self._send_json(401, {"status": "error", "message": f"Incorrect password. {max(0, 5 - attempts)} attempts remaining."})
                    return

                # Success
                db_manager.update_doctor_login_success(doc["id"])
                profile = {
                    "id": doc["id"],
                    "name": doc["name"],
                    "email": doc["email"],
                    "mciRegNumber": doc["mci_reg_number"],
                    "department": doc["department"],
                    "roomNumber": doc["room_number"],
                    "role": doc["role"],
                    "phone": doc["phone"],
                    "avatar": doc["avatar"],
                    "createdAt": str(doc.get("created_at")) if doc.get("created_at") else time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "lastLoginAt": str(doc.get("last_login_at")) if doc.get("last_login_at") else None,
                }
                session = db_manager.create_session(profile)
                db_manager.add_audit_log(doc["id"], doc["name"], "LOGIN_SUCCESS", "127.0.0.1", f"Authenticated session issued: {session['token'][:8]}...")
                self._send_json(200, {"status": "success", "session": session, "doctor": profile})
            except Exception as err:
                logger.error("[Auth Login Error] %s", err, exc_info=True)
                self._send_json(500, {"status": "error", "message": str(err)})
            return

        if path == "/api/auth/register":
            try:
                payload = self._read_json_body()
                password_plain = payload.get("passwordPlain") or payload.get("password", "")
                ok, doc_profile, err_msg = db_manager.register_doctor(payload, password_plain)
                if not ok:
                    self._send_json(400, {"status": "error", "message": err_msg})
                    return
                db_manager.add_audit_log(doc_profile["id"], doc_profile["name"], "DOCTOR_REGISTERED", "127.0.0.1", f"Registered doctor {doc_profile['name']} ({doc_profile['mciRegNumber']})")
                self._send_json(200, {"status": "success", "doctor": doc_profile})
            except Exception as err:
                self._send_json(500, {"status": "error", "message": str(err)})
            return

        if path == "/api/auth/logout":
            try:
                payload = self._read_json_body()
                token = payload.get("token") or self.headers.get("Authorization", "").replace("Bearer ", "").strip()
                db_manager.delete_session(token)
                self._send_json(200, {"status": "success", "message": "Session terminated."})
            except Exception as err:
                self._send_json(500, {"status": "error", "message": str(err)})
            return

        # 2. Patient Cases
        if path == "/api/cases":
            try:
                payload = self._read_json_body()
                saved_case = db_manager.save_case(payload)
                # Automatically index into medical vector DB for semantic lookup
                try:
                    vector_db.index_patient_case(saved_case)
                except Exception as v_err:
                    logger.warning("Vector indexing deferred: %s", v_err)
                self._send_json(200, {"status": "success", "case": saved_case})
            except Exception as err:
                logger.error("[Save Case Error] %s", err, exc_info=True)
                self._send_json(500, {"status": "error", "message": str(err)})
            return

        if path.startswith("/api/cases/") and path.endswith("/status"):
            try:
                case_id = path.replace("/api/cases/", "").replace("/status", "").strip()
                payload = self._read_json_body()
                status = payload.get("status", "Doctor Verified")
                db_manager.update_case_status(case_id, status)
                self._send_json(200, {"status": "success", "caseId": case_id, "caseStatus": status})
            except Exception as err:
                self._send_json(500, {"status": "error", "message": str(err)})
            return

        if path.startswith("/api/cases/") and path.endswith("/summary"):
            try:
                case_id = path.replace("/api/cases/", "").replace("/summary", "").strip()
                payload = self._read_json_body()
                summary = payload.get("summary", "")
                db_manager.update_case_summary(case_id, summary)
                self._send_json(200, {"status": "success", "caseId": case_id})
            except Exception as err:
                self._send_json(500, {"status": "error", "message": str(err)})
            return

        # 3. Vector Database Semantic Search Endpoints
        if path == "/api/vector/search":
            try:
                payload = self._read_json_body()
                query = payload.get("query", "")
                entity_type = payload.get("entity_type")
                top_k = int(payload.get("top_k", 5))
                results = vector_db.search_all(query, entity_type=entity_type, top_k=top_k)
                self._send_json(200, {"status": "success", "results": results})
            except Exception as err:
                self._send_json(500, {"status": "error", "message": str(err)})
            return

        if path == "/api/guidelines/search":
            try:
                payload = self._read_json_body()
                query = payload.get("query", "")
                top_k = int(payload.get("top_k", 3))
                results = vector_db.search_similar_guidelines(query, top_k=top_k)
                self._send_json(200, {"status": "success", "guidelines": results})
            except Exception as err:
                self._send_json(500, {"status": "error", "message": str(err)})
            return

        # 4. Existing Services
        if path == "/api/ocr":
            self._handle_ocr()
            return

        if path == "/api/tts":
            self._handle_tts()
            return

        if path == "/api/clinical-reasoning":
            self._handle_clinical_reasoning()
            return

        if path != "/api/transcribe":
            self._send_json(404, {"status": "error", "message": "Endpoint not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            content_type = self.headers.get("Content-Type", "")
            logger.info("[Server] POST /api/transcribe | size=%d | type=%s", content_length, content_type)

            if content_length == 0:
                self._send_json(400, {"status": "error", "message": "Empty request body."})
                return

            raw_data = self.rfile.read(content_length)
            logger.info("[Server] Read %d bytes from body", len(raw_data))

            # Parse multipart/form-data
            audio_bytes = None
            requested_lang = "odia"

            if "multipart/form-data" in content_type and "boundary=" in content_type:
                boundary = content_type.split("boundary=")[-1].strip().encode("utf-8")
                parts = raw_data.split(b"--" + boundary)
                for part in parts:
                    if not part or part.strip() in (b"", b"--", b"--\r\n"):
                        continue
                    if b"\r\n\r\n" not in part:
                        continue
                    header_section, _, body_section = part.partition(b"\r\n\r\n")
                    header_text = header_section.decode("utf-8", errors="replace")
                    body = body_section
                    if body.endswith(b"\r\n"):
                        body = body[:-2]

                    if 'name="audio"' in header_text or 'filename=' in header_text:
                        audio_bytes = body
                        logger.info("[Server] Audio part: %d bytes", len(audio_bytes))
                    elif 'name="language"' in header_text:
                        requested_lang = body.decode("utf-8", errors="replace").strip().lower()
                        logger.info("[Server] Language: '%s'", requested_lang)
            else:
                audio_bytes = raw_data
                logger.info("[Server] Raw binary: %d bytes", len(audio_bytes))

            if not audio_bytes or len(audio_bytes) < 200:
                self._send_json(400, {
                    "status": "error",
                    "message": f"Audio too short ({len(audio_bytes) if audio_bytes else 0} bytes). Speak for at least 1 second.",
                })
                return

            logger.info("[Server] Audio part: %d bytes | Hex prefix: %s", len(audio_bytes), audio_bytes[:32].hex())

            # Detect audio format from magic bytes
            if audio_bytes[:4] == b"RIFF":
                suffix = ".wav"
            elif audio_bytes[:4] == b"OggS":
                suffix = ".ogg"
            elif audio_bytes[:4] == b"fLaC":
                suffix = ".flac"
            elif audio_bytes[:3] in (b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
                suffix = ".mp3"
            elif len(audio_bytes) >= 12 and audio_bytes[4:8] in (b"ftyp", b"mdat", b"moov"):
                # MP4/M4A/AAC container — Safari MediaRecorder outputs audio/mp4
                suffix = ".mp4"
            elif audio_bytes[:4] == b"\x1aE\xdf\xa3":
                # True WebM EBML header
                suffix = ".webm"
            else:
                # Unknown — default to mp4 (Safari) since Chrome webm is handled above
                # ffmpeg will auto-detect the true container from the file contents
                suffix = ".mp4"

            logger.info("[Server] Detected format: %s | lang request: '%s'", suffix, requested_lang)

            # Write to temp file
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name
            logger.info("[Server] Temp audio: %s (%d bytes)", tmp_path, len(audio_bytes))

            sarvam_lang = resolve_lang_code(requested_lang)
            logger.info("[Server] Sarvam language code: %s", sarvam_lang)

            regional_transcript = ""
            english_translation = ""
            sarvam_error = None
            audio_for_sarvam = normalize_to_wav(tmp_path)
            if audio_for_sarvam == tmp_path and suffix in (".webm", ".mp4"):
                # ffmpeg failed to convert — dump for inspection
                try:
                    with open("/tmp/failed_audio.bin", "wb") as f_fail:
                        f_fail.write(audio_bytes)
                    logger.warning(
                        "[Server] Dumped failed audio to /tmp/failed_audio.bin (%d bytes) hex=%s",
                        len(audio_bytes), audio_bytes[:16].hex()
                    )
                except Exception:
                    pass

            try:
                import concurrent.futures
                if sarvam_lang in ("en-IN", "english"):
                    t_result = call_sarvam(audio_for_sarvam, sarvam_lang, mode="transcribe")
                    regional_transcript = extract_transcript(t_result)
                    english_translation = regional_transcript
                else:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                        f_transcribe = executor.submit(call_sarvam, audio_for_sarvam, sarvam_lang, "transcribe")
                        f_translate = executor.submit(call_sarvam, audio_for_sarvam, sarvam_lang, "translate")

                        t_result = f_transcribe.result(timeout=12)
                        tr_result = f_translate.result(timeout=12)

                        regional_transcript = extract_transcript(t_result)
                        english_translation = extract_transcript(tr_result)

                logger.info("[Server] Regional transcript: '%s' | English translation: '%s'", regional_transcript, english_translation)

            except Exception as sarvam_err:
                sarvam_error = str(sarvam_err)
                logger.error("[Server] Sarvam error: %s", sarvam_error)
            finally:
                for fpath in (tmp_path, audio_for_sarvam):
                    if fpath and os.path.exists(fpath):
                        try:
                            os.remove(fpath)
                        except Exception:
                            pass

            if sarvam_error:
                self._send_json(502, {
                    "status": "error",
                    "message": f"Voice service unavailable. {sarvam_error}",
                    "audio_bytes_received": len(audio_bytes),
                })
                return

            if not regional_transcript and not english_translation:
                self._send_json(200, {
                    "status": "empty",
                    "regional_text": "",
                    "english_text": "",
                    "message": "No speech detected. Speak clearly and try again.",
                    "language": sarvam_lang,
                    "audio_bytes_received": len(audio_bytes),
                    "service": "sarvam-saaras-v2",
                })
                return

            self._send_json(200, {
                "status": "success",
                "regional_text": regional_transcript or english_translation,
                "english_text": english_translation or regional_transcript,
                "language": sarvam_lang,
                "audio_bytes_received": len(audio_bytes),
                "service": "sarvam-saaras-v2",
                "model": SARVAM_MODEL,
            })

        except BrokenPipeError:
            logger.warning("[Server] Client disconnected (BrokenPipe).")
        except Exception as err:
            logger.error("[Server] Unhandled error: %s", err, exc_info=True)
            try:
                self._send_json(500, {"status": "error", "message": str(err)})
            except Exception:
                pass


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------
def run_server(port: int = 5000):
    server_address = ("", port)
    httpd = ThreadingHTTPServer(server_address, MediKiokVoiceHandler)
    logger.info("=" * 60)
    logger.info("MediKiok Voice Backend | Sarvam Saaras v2")
    logger.info("http://localhost:%d/api/transcribe", port)
    logger.info("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("[Server] Shutting down.")


if __name__ == "__main__":
    run_server()
