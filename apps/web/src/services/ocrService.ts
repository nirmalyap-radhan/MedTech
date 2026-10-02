/**
 * ocrService.ts
 * --------------
 * MediKiok OCR client service.
 *
 * Sends real image / PDF files to the Medical-Prescription-OCR backend
 * (ocr_api_server.py — running on port 7861) and normalises the response
 * into the OCRResult interface that DocumentUploadScreen can consume.
 *
 * Architecture:
 *   File/Blob (from file picker or camera capture)
 *     → POST multipart/form-data to http://localhost:7861/api/ocr
 *     → ocr_api_server.py → analyze_prescription() (Donut OCR + optional VLM)
 *     → normalized JSON → OCRResult
 */

import type { StructuredMedicine, OCRPatientDetails } from '../types';
import { parsePrescriptionText, cleanOCRNoise } from '../utils/prescriptionParser';

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export interface OCRResult {
  /** Whether OCR was successful */
  ok: boolean;
  /** "medical prescription" | "not medical prescription" | detected label */
  documentType: string;
  /** Whether the doc was classified as a prescription */
  isPrescription: boolean;
  /** OCR confidence 0–1 */
  confidence: number;
  /** Raw Donut OCR extracted text */
  extractedText: string;
  /** Heuristically extracted doctor name from OCR text */
  doctorName: string;
  /** Structured medicine list from VLM, or parsed from table */
  medicines: string[];
  /** Short diagnosis / handwritten text summary */
  diagnosis: string;
  /** Full handwritten text extracted by VLM (if available) */
  handwrittenText: string;
  /** Structured medicine table with dosage, frequency, duration, instructions */
  structuredMedicines?: StructuredMedicine[];
  /** Parsed patient demographics from prescription slip */
  patientDetails?: OCRPatientDetails;
  /** Error message from OCR backend (VLM side), if any */
  ocrError: string | null;
  /** Human-readable error if the whole call failed */
  errorMessage?: string;
}

export interface OCRProgressStep {
  message: string;
}

// ──────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────

const OCR_API_BASE =
  (import.meta.env.VITE_OCR_API_URL as string | undefined) ||
  'http://localhost:7861';

const OCR_ENDPOINT = `${OCR_API_BASE}/api/ocr`;
const HEALTH_ENDPOINT = `${OCR_API_BASE}/api/health`;

// Timeout for OCR requests — allow up to 120s for multi-page scan processing
const OCR_TIMEOUT_MS = 120_000;

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`OCR request timed out after ${timeoutMs / 1000}s`)), timeoutMs);
    fetch(url, options)
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

function buildFilename(file: File): string {
  return file.name || 'upload.jpg';
}

// ──────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────

class OCRService {

  /**
   * Quick health-check to see if the OCR backend is reachable.
   * Returns true if reachable, false otherwise.
   */
  async isBackendOnline(): Promise<boolean> {
    try {
      const res = await fetch(HEALTH_ENDPOINT, { method: 'GET', signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Send a file (image or PDF) to the OCR backend.
   *
   * @param file   - The File / Blob from a file picker or camera capture.
   * @param onStep - Optional callback to report scanning progress steps.
   * @returns      - OCRResult with real extracted data from the backend.
   */
  async processDocument(
    file: File,
    onStep?: (step: OCRProgressStep) => void,
  ): Promise<OCRResult> {

    const report = (message: string) => {
      console.log('[OCRService]', message);
      onStep?.({ message });
    };

    try {
      report('Connecting to OCR engine...');

      // Build multipart form data — field name MUST be "file"
      const formData = new FormData();
      formData.append('file', file, buildFilename(file));

      report('Reading document...');

      const response = await fetchWithTimeout(
        OCR_ENDPOINT,
        {
          method: 'POST',
          body: formData,
          // Do NOT set Content-Type manually — browser sets boundary automatically
        },
        OCR_TIMEOUT_MS,
      );

      report('Extracting clinical information & medicines...');

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`OCR server returned HTTP ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();

      if (data.status === 'error') {
        throw new Error(data.message || 'OCR backend reported an error');
      }

      report('Organising structured medical history...');

      return this._normalize(data);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[OCRService] processDocument failed:', message);
      return {
        ok: false,
        documentType: 'Unknown',
        isPrescription: false,
        confidence: 0,
        extractedText: '',
        doctorName: '',
        medicines: [],
        diagnosis: '',
        handwrittenText: '',
        ocrError: null,
        errorMessage: message,
      };
    }
  }

  /**
   * Normalise the raw backend JSON into a typed OCRResult.
   */
  private _normalize(data: Record<string, unknown>): OCRResult {
    const rawExtracted = typeof data.extracted_text === 'string' ? data.extracted_text.trim() : '';
    const rawHandwritten = typeof data.handwritten_text === 'string' ? data.handwritten_text.trim() : '';

    // Run client-side clinical parser for structured extraction & fallback
    const parsed = parsePrescriptionText(rawHandwritten || rawExtracted);

    let medicines = Array.isArray(data.medicines)
      ? (data.medicines as unknown[]).filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
      : [];

    // Backend-provided structured medicines or parser fallback
    let structuredMedicines: StructuredMedicine[] = [];
    if (Array.isArray(data.structured_medicines) && data.structured_medicines.length > 0) {
      structuredMedicines = data.structured_medicines as StructuredMedicine[];
    } else if (parsed.medicines.length > 0) {
      structuredMedicines = parsed.medicines;
    }

    // If medicines list was empty, populate from structured medicines
    if (medicines.length === 0 && structuredMedicines.length > 0) {
      medicines = structuredMedicines.map((m) => {
        const parts = [m.medicine_name];
        if (m.dosage && m.dosage !== 'unclear') parts.push(m.dosage);
        if (m.frequency && m.frequency !== 'unclear') parts.push(m.frequency);
        if (m.duration && m.duration !== 'unclear') parts.push(`x ${m.duration}`);
        return parts.join(' ');
      });
    } else if (medicines.length === 0 && parsed.formattedMedicinesList.length > 0) {
      medicines = parsed.formattedMedicinesList;
    }

    const confidence = typeof data.confidence === 'number' ? data.confidence : 0;

    // Patient details from backend or parser
    const patientDetails: OCRPatientDetails = (data.patient_info as OCRPatientDetails) || parsed.patient;

    // Diagnosis / clinical description without dot noise
    let diagnosis = '';
    if (typeof data.clinical_description === 'string' && data.clinical_description.trim()) {
      diagnosis = cleanOCRNoise(data.clinical_description.trim());
    } else if (typeof data.diagnosis === 'string' && data.diagnosis.trim()) {
      diagnosis = cleanOCRNoise(data.diagnosis.trim());
    } else if (parsed.clinicalDescription) {
      diagnosis = parsed.clinicalDescription;
    } else if (rawExtracted) {
      diagnosis = cleanOCRNoise(rawExtracted.slice(0, 300));
    }

    const doctorName =
      (typeof data.doctor_name === 'string' && data.doctor_name.trim()) ||
      patientDetails.doctorName ||
      '';

    const handwrittenText =
      rawHandwritten ||
      parsed.handwrittenText ||
      medicines.join('\n');

    return {
      ok: true,
      documentType: typeof data.document_type === 'string' ? data.document_type : 'medical prescription',
      isPrescription: Boolean(data.is_prescription),
      confidence: Math.round(confidence * 100),       // convert 0-1 → 0-100 for display
      extractedText: rawExtracted,
      doctorName,
      medicines,
      structuredMedicines,
      patientDetails,
      diagnosis,
      handwrittenText,
      ocrError: typeof data.ocr_error === 'string' && data.ocr_error ? data.ocr_error : null,
    };
  }
}

export const ocrService = new OCRService();
