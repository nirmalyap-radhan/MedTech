/**
 * Unified API Configuration for MediKiok Web
 * Automatically sanitizes and handles URL variants (with or without /api/transcribe, trailing slashes, etc.)
 */

function getCleanVoiceBase(): string {
  const envUrl = (import.meta.env.VITE_VOICE_API_URL as string | undefined)?.trim();
  if (!envUrl) return 'http://localhost:5000';
  return envUrl.replace(/\/+$/, '').replace(/\/api\/transcribe\/?$/, '');
}

function getCleanOcrBase(): string {
  const envOcr = (import.meta.env.VITE_OCR_API_URL as string | undefined)?.trim();
  if (envOcr) return envOcr.replace(/\/+$/, '').replace(/\/api\/ocr\/?$/, '');
  return getCleanVoiceBase();
}

export const VOICE_API_BASE_URL = getCleanVoiceBase();
export const OCR_API_BASE_URL = getCleanOcrBase();

export const VOICE_TRANSCRIBE_ENDPOINT = `${VOICE_API_BASE_URL}/api/transcribe`;
export const VOICE_TTS_ENDPOINT = `${VOICE_API_BASE_URL}/api/tts`;
export const CLINICAL_REASONING_ENDPOINT = `${VOICE_API_BASE_URL}/api/clinical-reasoning`;
export const CASES_ENDPOINT = `${VOICE_API_BASE_URL}/api/cases`;
export const VECTOR_SEARCH_ENDPOINT = `${VOICE_API_BASE_URL}/api/vector/search`;
export const OCR_ENDPOINT = `${OCR_API_BASE_URL}/api/ocr`;
export const OCR_HEALTH_ENDPOINT = `${OCR_API_BASE_URL}/api/health`;
