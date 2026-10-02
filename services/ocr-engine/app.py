import os
import io
import json
import base64
import re
import requests
from PIL import Image
from flask import Flask, request, jsonify
from asgiref.wsgi import WsgiToAsgi

flask_app = Flask(__name__)

def load_gemini_api_key():
    key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
    if key:
        return key
    for parent in [os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "voice-api")]:
        env_file = os.path.join(parent, ".env")
        if os.path.exists(env_file):
            try:
                with open(env_file, "r") as f:
                    for line in f:
                        if line.startswith("GEMINI_API_KEY=") or line.startswith("GOOGLE_API_KEY="):
                            return line.split("=", 1)[1].strip()
            except Exception:
                pass
    return ""

GEMINI_API_KEY = load_gemini_api_key()

def pil_to_base64(image, max_size=1024):
    img = image.copy()
    img.thumbnail((max_size, max_size), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=82, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("utf-8")

def query_gemini_vision(file_bytes, mime_type="image/jpeg"):
    if not GEMINI_API_KEY:
        return None, "No GEMINI_API_KEY found"

    b64_data = base64.b64encode(file_bytes).decode("utf-8")
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
- Return ONLY valid JSON without markdown wrapping."""

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": b64_data
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
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                if raw_text.startswith("```"):
                    lines = raw_text.splitlines()
                    if lines[0].startswith("```"): lines = lines[1:]
                    if lines and lines[-1].startswith("```"): lines = lines[:-1]
                    raw_text = "\n".join(lines).strip()
                try:
                    return json.loads(raw_text), raw_text
                except Exception:
                    m = re.search(r'\{[\s\S]*\}', raw_text)
                    if m:
                        try:
                            return json.loads(m.group())
                        except Exception:
                            pass
        except Exception as e:
            print(f"Model {model_name} failed: {e}")
            continue

    return None, "Gemini vision call failed"

@flask_app.route("/", methods=["GET"])
@flask_app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "medikiok-ocr-engine-cloud",
        "gemini_key_configured": bool(GEMINI_API_KEY)
    })

@flask_app.route("/api/ocr", methods=["POST"])
def process_ocr():
    try:
        file = request.files.get("file") or request.files.get("image")
        if file:
            file_bytes = file.read()
            mime_type = file.mimetype or "image/jpeg"
        else:
            file_bytes = request.get_data()
            mime_type = request.content_type or "image/jpeg"

        if not file_bytes:
            return jsonify({"status": "error", "message": "No file uploaded"}), 400

        parsed_json, raw_text = query_gemini_vision(file_bytes, mime_type)
        if not parsed_json:
            return jsonify({"status": "error", "message": raw_text or "OCR failed"}), 500

        struct_meds = parsed_json.get("medicines", [])
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

        summary_parts = []
        if parsed_json.get("document_type"): summary_parts.append(f"Document Type: {parsed_json['document_type']}")
        if parsed_json.get("doctor_name"): summary_parts.append(f"Doctor: {parsed_json['doctor_name']}")
        if parsed_json.get("patient_name"): summary_parts.append(f"Name: {parsed_json['patient_name']}")
        if parsed_json.get("clinical_description"): summary_parts.append(f"Clinical Description: {parsed_json['clinical_description']}")
        if parsed_json.get("diagnosis"): summary_parts.append(f"Diagnosis: {parsed_json['diagnosis']}")
        if parsed_json.get("handwritten_text"): summary_parts.append(f"Advice / Findings:\n{parsed_json['handwritten_text']}")

        return jsonify({
            "status": "success",
            "ok": True,
            "document_type": parsed_json.get("document_type", "Prescription"),
            "is_prescription": parsed_json.get("is_prescription", True),
            "confidence": 0.95,
            "doctor_name": parsed_json.get("doctor_name", ""),
            "patient_info": {
                "patientName": parsed_json.get("patient_name", ""),
                "age": parsed_json.get("age", ""),
                "gender": parsed_json.get("gender", ""),
                "date": parsed_json.get("date", ""),
                "doctorName": parsed_json.get("doctor_name", "")
            },
            "clinical_description": parsed_json.get("clinical_description", ""),
            "diagnosis": parsed_json.get("diagnosis", ""),
            "handwritten_text": parsed_json.get("handwritten_text", ""),
            "medicines": formatted_meds,
            "structured_medicines": struct_meds,
            "extracted_text": "\n".join(summary_parts)
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Export both ASGI (app) and WSGI (flask_app) interfaces
app = WsgiToAsgi(flask_app)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    flask_app.run(host="0.0.0.0", port=port)
