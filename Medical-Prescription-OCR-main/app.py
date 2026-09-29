import os
import io
import json
import base64
import re
import urllib.request
import urllib.error
import torch
from PIL import Image, ImageEnhance, ImageFilter
from transformers import VisionEncoderDecoderModel, DonutProcessor, pipeline
import gradio as gr

# ===================== MODEL LOADING (existing) =====================

current_dir = os.path.dirname(os.path.abspath(__file__))
donut_model_path = os.path.join(current_dir, "model")

try:
    processor = DonutProcessor.from_pretrained(donut_model_path)
    donut_model = VisionEncoderDecoderModel.from_pretrained(donut_model_path)
except Exception as e:
    print(f"Error loading Donut model: {e}")
    exit(1)

device = "cuda" if torch.cuda.is_available() else "cpu"
donut_model.to(device)
donut_model.eval()

try:
    classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli", device=0 if device == "cuda" else -1)
except Exception as e:
    print(f"Error initializing Zero-Shot Classifier: {e}")
    exit(1)

candidate_labels = ["medical prescription", "not medical prescription"]

# ===================== OLLAMA VISION MODEL DETECTION =====================

OLLAMA_BASE_URL = "http://localhost:11434"
VISION_MODEL_KEYWORDS = ["vl", "vision", "llava", "bakllava", "moondream", "minicpm-v"]

def detect_ollama_vision_model():
    """Auto-detect an installed Ollama model that supports vision input."""
    try:
        req = urllib.request.Request(f"{OLLAMA_BASE_URL}/api/tags")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            models = data.get("models", [])
            for m in models:
                name = m.get("name", "")
                for kw in VISION_MODEL_KEYWORDS:
                    if kw in name.lower():
                        return name
            return models[0]["name"] if models else None
    except Exception:
        return None

VISION_MODEL = detect_ollama_vision_model()

def check_ollama_running():
    try:
        req = urllib.request.Request(f"{OLLAMA_BASE_URL}/api/tags")
        urllib.request.urlopen(req, timeout=3)
        return True
    except Exception:
        return False

# ===================== EXISTING OCR FUNCTIONS =====================

def extract_text_from_image(image):
    image = image.convert("RGB")
    encoding = processor(images=image, return_tensors="pt").to(device)
    with torch.no_grad():
        generated_ids = donut_model.generate(
            encoding.pixel_values,
            max_length=512,
            num_beams=1,
            repetition_penalty=1.6,
            no_repeat_ngram_size=3,
            early_stopping=True,
            decoder_start_token_id=processor.tokenizer.convert_tokens_to_ids("<s_ocr>")
        )
    generated_text = processor.tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()
    # Guard against autoregressive decoder hallucination loops (e.g. "6,000,000 ,000...")
    if re.search(r'(?:,\s*000\s*){2,}', generated_text) or re.search(r'6\s*,\s*000\s*,\s*000', generated_text):
        generated_text = ""
    return generated_text

medical_keywords = [
    "prescribed", "take", "mg", "ml", "capsules", "dosage",
    "dr.", "doctor", "patient", "medications", "apply", "signature",
    "clinic", "pharmacy", "rx", "dose", "medicine", "drug"
]

def classify_prescription_zero_shot(text):
    if not text:
        return "No text found", 0.0
    result = classifier(text, candidate_labels)
    predicted_label = result["labels"][0]
    confidence = result["scores"][0]
    text_lower = text.lower()
    has_medical_keywords = any(keyword in text_lower for keyword in medical_keywords)
    if predicted_label == "not medical prescription" and has_medical_keywords:
        predicted_label = "medical prescription"
        confidence = max(confidence, 0.75)
    elif predicted_label == "medical prescription" and not has_medical_keywords:
        predicted_label = "not medical prescription"
        confidence = max(confidence, 0.75)
    return predicted_label, confidence

# ===================== IMAGE PREPROCESSING =====================

def enhance_image(image):
    """Enhance brightness and contrast for better VLM readability."""
    img = image.copy()
    img = ImageEnhance.Contrast(img).enhance(1.5)
    img = ImageEnhance.Brightness(img).enhance(1.1)
    img = img.filter(ImageFilter.SHARPEN)
    return img

def crop_handwritten_section(image):
    """Crop the lower portion of the prescription where handwriting typically is."""
    w, h = image.size
    top = int(h * 0.35)
    cropped = image.crop((0, top, w, h))
    return enhance_image(cropped)

def pil_to_base64(image, max_size=1024):
    """Convert PIL image to base64, resizing if too large."""
    img = image.copy()
    img.thumbnail((max_size, max_size), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode("utf-8")

# ===================== OLLAMA VLM ANALYSIS =====================

VLM_PROMPT = """You are analyzing a doctor's handwritten medical prescription.

Carefully inspect the image.

Focus especially on the handwritten prescription/medicine section.

Extract ONLY what is visibly written.

For every medicine, identify:
1. Medicine name
2. Strength/dosage
3. Frequency
4. Duration
5. Instructions

Common prescription abbreviations may include:
OD, BD, TDS, QID, HS, SOS, PRN, AC, PC.

IMPORTANT:
- Do NOT guess a medicine name.
- Do NOT hallucinate missing text.
- If handwriting is unclear, write 'UNCLEAR'.
- If only part of a medicine name is readable, report the readable portion.
- Preserve the doctor's original wording as much as possible.
- Separate printed patient information from handwritten prescription.
- Do not interpret or recommend medication.
- Return JSON only.

JSON format:

{
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
}"""

def query_ollama_vlm(image, model_name):
    """Send an image to the Ollama vision model and get structured JSON."""
    img_b64 = pil_to_base64(image)
    payload = json.dumps({
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": VLM_PROMPT,
                "images": [img_b64]
            }
        ],
        "stream": False
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{OLLAMA_BASE_URL}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode())
    return data.get("message", {}).get("content", "")

def parse_vlm_response(raw_text):
    """Extract JSON from the VLM response text."""
    raw_text = raw_text.strip()
    try:
        return json.loads(raw_text), raw_text
    except json.JSONDecodeError:
        pass
    match = re.search(r'\{[\s\S]*\}', raw_text)
    if match:
        try:
            return json.loads(match.group()), raw_text
        except json.JSONDecodeError:
            pass
    return None, raw_text

def format_medicines_table(medicines):
    """Format the medicines list into a markdown table."""
    if not medicines:
        return "*No medicines detected.*"
    header = "| Medicine | Dosage | Frequency | Duration | Instructions | Confidence |"
    sep = "|----------|--------|-----------|----------|--------------|------------|"
    rows = [header, sep]
    for m in medicines:
        row = "|"
        for key in ["medicine_name", "dosage", "frequency", "duration", "instructions", "confidence"]:
            row += f" {m.get(key, '...')} |"
        rows.append(row)
    return "\n".join(rows)

# ===================== GEMINI FLASH VISION INTEGRATION =====================

def load_gemini_api_key():
    key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
    if key:
        return key
    parent_env = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "indic-speech-translate-main", ".env")
    if os.path.exists(parent_env):
        try:
            with open(parent_env, "r") as f:
                for line in f:
                    if line.startswith("GEMINI_API_KEY="):
                        return line.split("=", 1)[1].strip()
        except Exception:
            pass
    return ""

GEMINI_API_KEY = load_gemini_api_key()

def query_gemini_vision(image):
    """Analyze medical prescription image using Gemini Vision."""
    if not GEMINI_API_KEY:
        return None, "No GEMINI_API_KEY found"

    img_b64 = pil_to_base64(image)
    prompt = """You are an expert clinical pharmacist analyzing a doctor's handwritten/printed medical prescription slip.
Carefully extract patient demographics, clinical description, vitals, doctor details, and all prescribed medications into JSON format:
{
  "doctor_name": "...",
  "patient_name": "...",
  "date": "...",
  "age": "...",
  "gender": "...",
  "weight": "...",
  "clinical_description": "...",
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
- Extract all medicines (syrup, tablet, capsules, drops), doses (e.g. 4 mL, 3 mL, 500mg), frequencies (e.g. Q6H, TDS, BD, OD, SOS), and durations (e.g. 3 d, 5 d).
- Extract any regional notes or instructions.
- Return ONLY the JSON object without markdown formatting."""

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
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

    models_to_try = ["gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode())
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
                parsed, clean_raw = parse_vlm_response(raw_text)
                if parsed:
                    return parsed, clean_raw
        except Exception:
            continue
    return None, "Gemini vision call failed"

# ===================== MAIN PIPELINE =====================

def analyze_prescription(image):
    """Full pipeline: Gemini Vision (primary) -> Ollama VLM -> Donut OCR."""
    debug_images = {}
    debug_raw = ""
    error_msg = ""
    handwritten_text = ""
    medicines_table = ""
    parsed_json = None
    extracted_text = ""
    predicted_label = "medical prescription"
    confidence = 0.95

    img_original = image.convert("RGB")
    debug_images["Original"] = img_original

    # 1. Primary multimodal engine: Gemini Vision
    if GEMINI_API_KEY:
        try:
            parsed_json, debug_raw = query_gemini_vision(img_original)
        except Exception as e:
            error_msg = f"Gemini VLM error: {e}"

    # 2. Secondary multimodal engine: Ollama VLM (if Gemini wasn't available)
    if not parsed_json and check_ollama_running() and VISION_MODEL:
        try:
            img_enhanced = enhance_image(img_original)
            debug_images["Enhanced"] = img_enhanced
            raw_response = query_ollama_vlm(img_enhanced, VISION_MODEL)
            parsed_json, debug_raw = parse_vlm_response(raw_response)
        except Exception as e:
            error_msg = f"Ollama VLM error: {e}"

    # 3. If Vision model succeeded, build structured output
    if parsed_json:
        handwritten_text = parsed_json.get("handwritten_text", "")
        medicines = parsed_json.get("medicines", [])
        medicines_table = format_medicines_table(medicines)
        predicted_label = "medical prescription"
        confidence = 0.99

        summary_parts = []
        if parsed_json.get("doctor_name"): summary_parts.append(f"Doctor: {parsed_json['doctor_name']}")
        if parsed_json.get("patient_name"): summary_parts.append(f"Name: {parsed_json['patient_name']}")
        if parsed_json.get("date"): summary_parts.append(f"Date: {parsed_json['date']}")
        if parsed_json.get("age"): summary_parts.append(f"Age: {parsed_json['age']}")
        if parsed_json.get("gender"): summary_parts.append(f"Gender: {parsed_json['gender']}")
        if parsed_json.get("weight"): summary_parts.append(f"Weight: {parsed_json['weight']}")
        if parsed_json.get("clinical_description"): summary_parts.append(f"Clinical Description: {parsed_json['clinical_description']}")
        if parsed_json.get("vitals"): summary_parts.append(f"Vitals: {parsed_json['vitals']}")
        if parsed_json.get("handwritten_text"): summary_parts.append(f"Advice:\n{parsed_json['handwritten_text']}")
        extracted_text = "\n".join(summary_parts)

    else:
        # Fallback to local Donut OCR with anti-looping safeguards
        try:
            extracted_text = extract_text_from_image(img_original)
            predicted_label, confidence = classify_prescription_zero_shot(extracted_text)
            confidence = round(confidence, 3)
        except Exception as e:
            extracted_text = f"OCR error: {e}"
        medicines_table = "*Could not parse structured medicines from VLM response.*"

    # Clean any lingering repetitive noise
    if re.search(r'(?:,\s*000\s*){2,}', extracted_text) or re.search(r'6\s*,\s*000\s*,\s*000', extracted_text):
        extracted_text = re.sub(r'The\s+6\s*,\s*000[0-9,\s]+', '', extracted_text).strip()

    debug_text = f"=== Raw VLM Response ===\n{debug_raw}\n\n"
    if parsed_json:
        debug_text += f"=== Parsed JSON ===\n{json.dumps(parsed_json, indent=2)}"

    return (
        extracted_text, predicted_label, confidence,
        handwritten_text, medicines_table, error_msg,
        debug_text, debug_images.get("Enhanced")
    )

# ===================== GRADIO UI =====================

with gr.Blocks(title="Medical Prescription OCR + VLM", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# Medical Prescription OCR + VLM Handwriting Recognition")

    with gr.Row():
        with gr.Column(scale=1):
            input_image = gr.Image(type="pil", label="Upload Prescription Image")
            with gr.Row():
                analyze_btn = gr.Button("Analyze Prescription", variant="primary")
                debug_toggle = gr.Checkbox(label="Show VLM Debug Output", value=False)

        with gr.Column(scale=2):
            gr.Markdown("### Existing OCR (Donut)")
            with gr.Row():
                extracted_text = gr.Textbox(label="Extracted Text", lines=4)
            with gr.Row():
                predicted_label = gr.Textbox(label="Predicted Label")
                confidence_score = gr.Number(label="Confidence Score")

            gr.Markdown("---")
            gr.Markdown("### AI Handwritten Prescription (Ollama VLM)")
            vlm_error = gr.Markdown(visible=True)
            handwritten_text = gr.Textbox(label="Handwritten Text", lines=4)
            medicines_md = gr.Markdown(label="Medicines")

            gr.Markdown("---")
            with gr.Group(visible=False) as debug_group:
                gr.Markdown("### VLM Debug Output")
                debug_enhanced_img = gr.Image(label="Enhanced Image Sent to VLM")
                debug_raw_text = gr.Textbox(label="Raw VLM Response / Parsed JSON", lines=10)

            gr.Markdown("---")
            gr.Markdown(
                "> **Medical Disclaimer:** AI transcription is for assistance only. "
                "Handwritten medicine names and dosage must be verified by a qualified "
                "doctor/pharmacist before use."
            )

    debug_toggle.change(
        fn=lambda x: gr.update(visible=x),
        inputs=[debug_toggle],
        outputs=[debug_group]
    )

    analyze_btn.click(
        fn=analyze_prescription,
        inputs=[input_image],
        outputs=[
            extracted_text, predicted_label, confidence_score,
            handwritten_text, medicines_md, vlm_error,
            debug_raw_text, debug_enhanced_img
        ]
    )

if __name__ == "__main__":
    print(f"Detected Ollama vision model: {VISION_MODEL or 'NONE'}")
    demo.launch(server_name="127.0.0.1", server_port=7860, share=False)
