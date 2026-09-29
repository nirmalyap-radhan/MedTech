"""
ocr_api_server.py
------------------
Thin REST API wrapper around the existing Medical-Prescription-OCR pipeline.

Exposes:
  POST  http://localhost:7861/api/ocr       — multipart/form-data, field "file"
  GET   http://localhost:7861/api/health    — liveness probe

This server imports analyze_prescription() directly from app.py so there is
ZERO duplication of OCR logic. app.py is NOT modified.

Run:
  cd Medical-Prescription-OCR-main
  ./venv/bin/python ocr_api_server.py

MediKiok sends real image/PDF files here from the DocumentUpload screen.
The Gradio UI (port 7860) is completely independent and is not used by MediKiok.
"""

import io
import os
import sys
import json
import re
import logging
import traceback
from typing import Optional, List, Dict, Any
from http.server import HTTPServer, BaseHTTPRequestHandler

# ──────────────────────────────────────────────────────────
# Bootstrap: make sure we import from THIS directory
# ──────────────────────────────────────────────────────────
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:%(name)s:%(message)s",
)
logger = logging.getLogger("ocr_api_server")

# ──────────────────────────────────────────────────────────
# PIL — needed for image handling
# ──────────────────────────────────────────────────────────
from PIL import Image

# Register modern image formats (HEIC, HEIF, AVIF)
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    logger.info("HEIF/HEIC support enabled via pillow_heif.")
except Exception:
    pass

try:
    import pillow_avif
    logger.info("AVIF support enabled via pillow_avif.")
except Exception:
    pass

# ──────────────────────────────────────────────────────────
# PDF support (requires pymupdf or pdf2image)
# ──────────────────────────────────────────────────────────
_PDF_BACKEND = None

try:
    import fitz as _fitz  # PyMuPDF
    _PDF_BACKEND = "pymupdf"
    logger.info("PDF support: PyMuPDF (fitz) available.")
except ImportError:
    pass

if _PDF_BACKEND is None:
    try:
        from pdf2image import convert_from_bytes as _pdf2image_convert
        _PDF_BACKEND = "pdf2image"
        logger.info("PDF support: pdf2image available.")
    except ImportError:
        pass

if _PDF_BACKEND is None:
    logger.warning(
        "No PDF backend found. PDF uploads will fail. "
        "Install PyMuPDF: venv/bin/pip install pymupdf"
    )


def bytes_to_pil(data: bytes, filename: str = "", content_type: str = "") -> Image.Image:
    """Convert uploaded bytes (PDF or any image format) into a valid RGB PIL Image."""
    is_pdf = filename.lower().endswith(".pdf") or "pdf" in content_type.lower()
    if is_pdf:
        if _PDF_BACKEND == "pymupdf":
            doc = _fitz.open(stream=data, filetype="pdf")
            page = doc[0]
            mat = _fitz.Matrix(2.0, 2.0)  # 2× zoom for better OCR
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            doc.close()
            return img
        elif _PDF_BACKEND == "pdf2image":
            pages = _pdf2image_convert(data, dpi=200, first_page=1, last_page=1)
            return pages[0].convert("RGB")
        else:
            raise RuntimeError(
                "No PDF processing library installed. "
                "Run: venv/bin/pip install pymupdf"
            )

    # 1. First attempt: standard / registered PIL image loader
    try:
        return Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as pil_err:
        logger.warning("[OCR] PIL direct decode failed (%s). Attempting PyMuPDF image decode...", pil_err)

    # 2. Second attempt: PyMuPDF universal image decoder (decodes AVIF, WebP, JPEG, PNG, etc.)
    if _PDF_BACKEND == "pymupdf":
        try:
            doc = _fitz.open(stream=data)
            page = doc[0]
            pix = page.get_pixmap(alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            doc.close()
            return img
        except Exception as fitz_err:
            logger.warning("[OCR] PyMuPDF fallback decode failed (%s).", fitz_err)

    raise ValueError(f"Unable to decode uploaded image file '{filename}'. Format not recognized.")


# ──────────────────────────────────────────────────────────
# Import the core OCR pipeline from the existing app.py
# We import lazily to avoid slow model loading at server startup;
# the first /api/ocr request will trigger the load.
# ──────────────────────────────────────────────────────────
_ocr_pipeline_ready = False
_ocr_import_error: Optional[str] = None
_analyze_fn = None


def _ensure_ocr_loaded():
    global _ocr_pipeline_ready, _ocr_import_error, _analyze_fn
    if _ocr_pipeline_ready:
        return
    if _ocr_import_error:
        raise RuntimeError(_ocr_import_error)
    try:
        logger.info("Loading OCR models from app.py — this may take 20-60 seconds on first call...")
        # Suppress the Gradio launch that happens at the bottom of app.py
        # by patching gr.Blocks.launch before import
        import gradio as _gr
        _orig_launch = _gr.Blocks.launch
        _gr.Blocks.launch = lambda *a, **kw: None  # no-op during import
        import app as _app  # imports and runs model loading code in app.py
        _gr.Blocks.launch = _orig_launch  # restore
        _analyze_fn = _app.analyze_prescription
        _ocr_pipeline_ready = True
        logger.info("OCR pipeline loaded successfully.")
    except Exception as exc:
        _ocr_import_error = str(exc)
        logger.error("Failed to load OCR pipeline: %s", exc)
        raise


# ──────────────────────────────────────────────────────────
# Multipart parsing
# ──────────────────────────────────────────────────────────

def _parse_multipart(body: bytes, boundary: str) -> dict:
    """
    Very lightweight multipart/form-data parser.
    Returns a dict keyed by field name:
      { "file": { "filename": "...", "content_type": "...", "data": bytes } }
    """
    sep = ("--" + boundary).encode()
    end_sep = ("--" + boundary + "--").encode()
    parts = {}
    segments = body.split(sep)
    for seg in segments:
        if not seg or seg == b"--\r\n" or seg.startswith(b"--"):
            continue
        seg = seg.lstrip(b"\r\n")
        if b"\r\n\r\n" not in seg:
            continue
        header_bytes, _, content = seg.partition(b"\r\n\r\n")
        content = content.rstrip(b"\r\n")
        headers_raw = header_bytes.decode("utf-8", errors="replace")
        # Parse Content-Disposition
        name_match = re.search(r'name="([^"]+)"', headers_raw)
        filename_match = re.search(r'filename="([^"]+)"', headers_raw)
        ct_match = re.search(r"Content-Type:\s*(\S+)", headers_raw, re.I)
        if name_match:
            field_name = name_match.group(1)
            parts[field_name] = {
                "filename": filename_match.group(1) if filename_match else "",
                "content_type": ct_match.group(1) if ct_match else "application/octet-stream",
                "data": content,
            }
    return parts


def _clean_ocr_noise(text: str) -> str:
    """Strip repeated dots (. . . .), OCR artifacts, and extra whitespace."""
    if not text:
        return ""
    cleaned = re.sub(r'(\s*\.\s*){3,}', ' ', text)
    cleaned = re.sub(r'\s{2,}', ' ', cleaned).strip()
    return cleaned


def _parse_structured_medicines_table(medicines_table_md: str) -> List[Dict[str, str]]:
    """Parse markdown table into structured dictionary list."""
    structured = []
    lines = medicines_table_md.strip().splitlines()
    for line in lines:
        if "|" not in line or "Medicine" in line or "---" in line:
            continue
        cols = [c.strip() for c in line.strip("|").split("|")]
        if len(cols) >= 1 and cols[0] and cols[0] != "...":
            structured.append({
                "medicine_name": cols[0],
                "dosage": cols[1] if len(cols) > 1 and cols[1] != "..." else "unclear",
                "frequency": cols[2] if len(cols) > 2 and cols[2] != "..." else "unclear",
                "duration": cols[3] if len(cols) > 3 and cols[3] != "..." else "unclear",
                "instructions": cols[4] if len(cols) > 4 and cols[4] != "..." else "unclear",
                "confidence": cols[5] if len(cols) > 5 and cols[5] != "..." else "medium",
            })
    return structured


def _extract_clinical_data_from_raw_text(raw_text: str) -> Dict[str, Any]:
    """Extract patient demographics, clinical vitals, and structured prescription lines from raw OCR text."""
    clean = _clean_ocr_noise(raw_text)

    # 1. Patient info
    name_m = re.search(r'Name\s*:\s*([A-Za-z0-9\s]+?)(?=\s+(?:Date|age|Gender|weight|clinical|advice|Rx|$))', clean, re.I)
    patient_name = name_m.group(1).strip() if name_m else ""

    date_m = re.search(r'Date\s*:\s*([\d]{1,2}[-/\.][\d]{1,2}[-/\.][\d]{2,4})', clean, re.I)
    doc_date = date_m.group(1).strip() if date_m else ""

    age_m = re.search(r'age\s*[,.:]*\s*(?:Gender\s*[,.:]*\s*)?(\d+)', clean, re.I)
    patient_age = f"{age_m.group(1).strip()} Yrs" if age_m else ""

    gender_m = re.search(r'(?:Gender\s*[,.:]*.*?|\b)([MF]|Male|Female)\b', clean, re.I)
    patient_gender = ""
    if gender_m:
        g = gender_m.group(1).upper()
        patient_gender = "Female" if g in ["F", "FEMALE"] else "Male"

    weight_m = re.search(r'weight\s*[:\s]*([\d]+(?:\s*[\.,]\s*\d+)?\s*(?:kg|lbs|g)?)', clean, re.I)
    patient_weight = ""
    if weight_m:
        wt_raw = weight_m.group(1).replace(' ', '')
        patient_weight = wt_raw if "kg" in wt_raw.lower() else f"{wt_raw} kg"

    # 2. Clinical Description & Vitals
    clin_m = re.search(r'clinical\s+Description\s*[:\-]\s*(.*?)(?=\s+(?:advice|Rx|R/|Medicines|Vitals)|$)', clean, re.I)
    clinical_desc = clin_m.group(1).strip() if clin_m else ""

    vitals_m = re.search(r'Vitals\s*[:\-]\s*(.*?)(?=\s+(?:advice|Rx|R/|Medicines)|$)', clean, re.I)
    vitals_desc = vitals_m.group(1).strip() if vitals_m else ""

    # Doctor name
    doc_m = re.search(r'(?:Dr\.?|Doctor)\s*[:\s]*([A-Za-z\s\.\(\)\u0D00-\u0D7F]+?)(?=\s+(?:Date|Name|age|clinical|$))', clean, re.I)
    doctor_name = doc_m.group(1).strip() if doc_m else ""
    if doctor_name:
        doctor_name = re.sub(r'^(?:Doctor|Dr\.?)\s*[:\s]*', '', doctor_name, flags=re.I).strip()
        doctor_name = f"Dr. {doctor_name}" if not doctor_name.startswith("Dr.") else doctor_name

    # 3. Advice / Rx block
    adv_m = re.search(r'(?:advice|Rx|R/|Medicines)\s*:\s*(.*)', clean, re.I)
    advice_text = adv_m.group(1).strip() if adv_m else clean

    lines = [l.strip() for l in advice_text.splitlines() if l.strip()]
    if len(lines) > 1:
        splits = lines
    else:
        splits = re.split(r'(?=\b(?:SQP|sup|syp|syrup|tab|tablet|cap|capsule|inj|injection|ointment|drops)\b)', advice_text, flags=re.I)
        splits = [s.strip() for s in splits if len(s.strip()) > 2]

    structured_meds = []
    medicines_list = []
    handwritten_lines = []

    for chunk in splits:
        cleaned_chunk = _clean_ocr_noise(chunk)
        if not cleaned_chunk:
            continue

        # Dosage
        dos_m = re.search(r'(\d+(?:\.\d+)?\s*(?:ML|ml|mg|gm|g|mcg|tabs?|caps?|tsp))\b', cleaned_chunk, re.I)
        if not dos_m:
            dos_m = re.search(r'(\d+(?:\.\d+)?\s*(?:sols?|tablets?))\b', cleaned_chunk, re.I)
        dosage = dos_m.group(1).strip() if dos_m else "unclear"

        # Duration
        dur_m = re.search(r'(?:[xX]|for\s*)(\d+)\s*(?:d|days?|w|weeks?|m|months?)\b', cleaned_chunk, re.I)
        duration = f"{dur_m.group(1)} days" if dur_m else "unclear"

        # Frequency
        freq_m = re.search(r'(TDS|BID|BD|OD|QID|QDS|TID|HS|SOS|PRN|QD|STAT|[aq]\d+[hH]|aGH)', cleaned_chunk, re.I)
        raw_freq = freq_m.group(1).strip() if freq_m else "unclear"
        freq_upper = raw_freq.upper()
        if freq_upper == 'AGH':
            frequency = 'q8h (Every 8h)'
        elif freq_upper == 'TDS':
            frequency = 'TDS (3x Daily)'
        elif freq_upper in ['BID', 'BD']:
            frequency = 'BID (2x Daily)'
        elif freq_upper in ['OD', 'QD']:
            frequency = 'OD (Once Daily)'
        elif freq_upper in ['QID', 'QDS']:
            frequency = 'QID (4x Daily)'
        else:
            frequency = raw_freq

        # Instructions
        instructions = "unclear"
        if re.search(r'\b(?:syp|syrup|sup|sqp)\b', cleaned_chunk, re.I):
            instructions = "Oral suspension"
        elif re.search(r'\b(?:tab|tablet|cap|capsule)\b', cleaned_chunk, re.I):
            instructions = "Oral tablet"
        elif re.search(r'\b(?:inj|injection)\b', cleaned_chunk, re.I):
            instructions = "Injectable"

        # Medicine name
        med_name = cleaned_chunk
        for p in [
            r'(?:aGH|q8h|q6h|q12h|TDS|BID|BD|OD|QID|TID|HS|SOS|PRN|QD|STAT)X?\d*d?',
            r'(?:[xX]|for\s*)\d+\s*(?:d|days?|w|weeks?|m|months?)',
            r'\d+(?:\.\d+)?\s*(?:ML|ml|mg|gm|g|mcg|tabs?|caps?|tsp|sols?)',
            r'^[-\s\.\:]+|[-\s\.\:]+$'
        ]:
            med_name = re.sub(p, '', med_name, flags=re.I)
        med_name = re.sub(r'[\(\)]+', ' ', med_name)
        med_name = re.sub(r'\s{2,}', ' ', med_name).strip()
        if med_name.endswith('-'):
            med_name = med_name[:-1].strip()

        # Normalize prefix
        if re.match(r'^SQP\b', med_name, re.I):
            med_name = re.sub(r'^SQP\b', 'Syp.', med_name, flags=re.I)
        elif re.match(r'^sup\b', med_name, re.I):
            med_name = re.sub(r'^sup\b', 'Syp.', med_name, flags=re.I)

        med_obj = {
            "medicine_name": med_name or cleaned_chunk,
            "dosage": dosage,
            "frequency": frequency,
            "duration": duration,
            "instructions": instructions,
            "confidence": "medium",
        }
        structured_meds.append(med_obj)

        summary_parts = [med_name or cleaned_chunk]
        if dosage != "unclear":
            summary_parts.append(dosage)
        if frequency != "unclear":
            summary_parts.append(f"- {frequency}")
        if duration != "unclear":
            summary_parts.append(f"x {duration}")
        summary_line = " ".join(summary_parts)

        medicines_list.append(summary_line)
        handwritten_lines.append(summary_line)

    return {
        "patient_info": {
            "name": patient_name,
            "date": doc_date,
            "age": patient_age,
            "gender": patient_gender,
            "weight": patient_weight,
            "doctorName": doctor_name,
            "vitals": vitals_desc,
        },
        "clinical_description": clinical_desc,
        "structured_medicines": structured_meds,
        "medicines_list": medicines_list,
        "handwritten_lines": handwritten_lines,
    }


def _parse_medicine_text(medicines_table_md: str) -> List[str]:
    """
    Extract medicine name + dosage from the markdown table produced by
    format_medicines_table() in app.py.
    """
    medicines = []
    lines = medicines_table_md.strip().splitlines()
    for line in lines:
        if "|" not in line or "Medicine" in line or "---" in line:
            continue
        cols = [c.strip() for c in line.strip("|").split("|")]
        if len(cols) >= 2:
            name = cols[0].strip()
            dosage = cols[1].strip() if len(cols) > 1 else ""
            freq = cols[2].strip() if len(cols) > 2 else ""
            if name and name != "...":
                parts = [p for p in [name, dosage, freq] if p and p != "..."]
                medicines.append(" ".join(parts))
    return medicines


def _normalize_response(
    extracted_text: str,
    predicted_label: str,
    confidence: float,
    handwritten_text: str,
    medicines_table: str,
    error_msg: str,
    debug_text: str,
    enhanced_image: Any,  # PIL image or None — we discard this
) -> Dict[str, Any]:
    """Map the 8-tuple from analyze_prescription() to a clean JSON response."""
    is_prescription = "prescription" in (predicted_label or "").lower()

    # Extract structured medicines from Markdown table if available
    structured_meds = _parse_structured_medicines_table(medicines_table)
    medicines_list = _parse_medicine_text(medicines_table)

    # Run raw text parser for fallback and enrichment
    extracted_data = _extract_clinical_data_from_raw_text(extracted_text or handwritten_text)

    if not structured_meds and extracted_data["structured_medicines"]:
        structured_meds = extracted_data["structured_medicines"]

    if not medicines_list and extracted_data["medicines_list"]:
        medicines_list = extracted_data["medicines_list"]

    # Reconstruct clean markdown table if missing
    clean_table_md = medicines_table
    if (not medicines_table or "No medicines detected" in medicines_table or "*Could not parse" in medicines_table) and structured_meds:
        header = "| Medicine | Dosage | Frequency | Duration | Instructions | Confidence |"
        sep = "|----------|--------|-----------|----------|--------------|------------|"
        rows = [header, sep]
        for m in structured_meds:
            rows.append(f"| {m.get('medicine_name', '...')} | {m.get('dosage', '...')} | {m.get('frequency', '...')} | {m.get('duration', '...')} | {m.get('instructions', '...')} | {m.get('confidence', '...')} |")
        clean_table_md = "\n".join(rows)

    # Doctor name
    doctor_name = extracted_data["patient_info"].get("doctorName", "")
    if not doctor_name:
        for line in (extracted_text or "").splitlines():
            if any(kw in line.lower() for kw in ["dr.", "doctor", "dr ", "md", "mbbs"]):
                doctor_name = line.strip()[:80]
                break

    # Clean handwritten text
    clean_handwritten = _clean_ocr_noise(handwritten_text)
    if not clean_handwritten and extracted_data["handwritten_lines"]:
        clean_handwritten = "\n".join(extracted_data["handwritten_lines"])
    elif not clean_handwritten and medicines_list:
        clean_handwritten = "\n".join(medicines_list)

    # Diagnosis / Clinical Findings
    diagnosis = extracted_data["clinical_description"]
    if not diagnosis:
        diagnosis = clean_handwritten[:300] if clean_handwritten else _clean_ocr_noise(extracted_text)[:300]

    return {
        "status": "success",
        "document_type": predicted_label if predicted_label else "medical prescription",
        "is_prescription": is_prescription,
        "confidence": round(float(confidence), 3),
        "extracted_text": (extracted_text or "").strip(),
        "doctor_name": doctor_name or "Not detected",
        "medicines": medicines_list,
        "structured_medicines": structured_meds,
        "patient_info": extracted_data["patient_info"],
        "clinical_description": extracted_data["clinical_description"],
        "diagnosis": diagnosis,
        "handwritten_text": clean_handwritten,
        "raw_medicines_table": clean_table_md,
        "ocr_error": error_msg or None,
    }


# ──────────────────────────────────────────────────────────
# HTTP Handler
# ──────────────────────────────────────────────────────────

class OCRHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        logger.info(fmt, *args)

    def _send_json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # CORS — allow MediKiok dev server
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.end_headers()

    def do_GET(self):
        path = self.path.rstrip("/")
        if path == "/api/health":
            self._send_json(200, {
                "service": "medikiok-ocr-backend",
                "model": "NAVER Clova Donut (medical-prescription-ocr)",
                "pdf_backend": _PDF_BACKEND or "unavailable",
                "status": "ok",
                "port": 7861,
            })
        else:
            self._send_json(404, {"status": "error", "message": "Not found"})

    def do_POST(self):
        path = self.path.rstrip("/")
        if path != "/api/ocr":
            self._send_json(404, {"status": "error", "message": "Not found"})
            return

        try:
            content_type = self.headers.get("Content-Type", "")
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)

            # ── Parse multipart ──────────────────────────────────
            boundary_match = re.search(r"boundary=([^\s;]+)", content_type)
            if not boundary_match:
                self._send_json(400, {
                    "status": "error",
                    "message": "Expected multipart/form-data with a boundary parameter."
                })
                return

            boundary = boundary_match.group(1).strip('"')
            parts = _parse_multipart(body, boundary)

            if "file" not in parts:
                self._send_json(400, {
                    "status": "error",
                    "message": "No 'file' field found in multipart request."
                })
                return

            file_part = parts["file"]
            file_data = file_part["data"]
            filename = file_part["filename"].lower()
            file_ct = file_part["content_type"].lower()

            logger.info("[OCR] Received file: '%s' (%d bytes, type=%s)",
                        filename, len(file_data), file_ct)

            # ── Convert to PIL Image ──────────────────────────────
            if filename.endswith(".pdf") or "pdf" in file_ct:
                logger.info("[OCR] Converting PDF to image...")
                pil_image = pdf_bytes_to_pil(file_data)
            else:
                pil_image = Image.open(io.BytesIO(file_data)).convert("RGB")

            # ── Run OCR pipeline ─────────────────────────────────
            _ensure_ocr_loaded()
            logger.info("[OCR] Running analyze_prescription()...")
            results = _analyze_fn(pil_image)
            logger.info("[OCR] Pipeline finished. Predicted label: '%s', confidence: %.3f",
                        results[1], results[2])

            response_data = _normalize_response(*results)
            self._send_json(200, response_data)

        except Exception as exc:
            logger.error("[OCR] Error processing request: %s", exc)
            logger.error(traceback.format_exc())
            self._send_json(500, {
                "status": "error",
                "message": f"OCR processing failed: {str(exc)}",
            })


# ──────────────────────────────────────────────────────────
# Server Entry Point
# ──────────────────────────────────────────────────────────

OCR_API_PORT = 7861
OCR_API_HOST = "127.0.0.1"

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("MediKiok OCR API Server")
    logger.info("POST http://%s:%d/api/ocr  (multipart/form-data, field: file)", OCR_API_HOST, OCR_API_PORT)
    logger.info("GET  http://%s:%d/api/health", OCR_API_HOST, OCR_API_PORT)
    logger.info("Note: OCR models load on first /api/ocr request (~30-60s)")
    logger.info("=" * 60)
    server = HTTPServer((OCR_API_HOST, OCR_API_PORT), OCRHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("OCR API server stopped.")
