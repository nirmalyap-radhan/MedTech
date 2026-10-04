/**
 * languageUtils.ts
 * -----------------
 * Centralized Language Normalization & Browser Diagnostic Utility for MediKiok.
 *
 * Provides single-source-of-truth mapping between:
 * 1. Internal App Language Code ('or', 'hi', 'en', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'as', 'ur')
 * 2. Sarvam AI Provider Code ('od-IN', 'hi-IN', 'en-IN', 'bn-IN', 'ta-IN', 'te-IN', etc.)
 * 3. Browser SpeechSynthesis BCP-47 Locale Code
 * 4. Human-readable names (Native script & English)
 * 5. Browser environment diagnostics for mobile & Safari troubleshooting
 */

import type { Language } from '../types';

export interface LanguageDefinition {
  id: Language;
  sarvamCode: string;
  bcp47Locale: string;
  nameEnglish: string;
  nameNative: string;
  scriptName: string;
}

export const LANGUAGE_REGISTRY: Record<Language, LanguageDefinition> = {
  or: {
    id: 'or',
    sarvamCode: 'od-IN', // Sarvam's official Odia code is od-IN
    bcp47Locale: 'or-IN',
    nameEnglish: 'Odia',
    nameNative: 'ଓଡ଼ିଆ',
    scriptName: 'Odia',
  },
  hi: {
    id: 'hi',
    sarvamCode: 'hi-IN',
    bcp47Locale: 'hi-IN',
    nameEnglish: 'Hindi',
    nameNative: 'हिन्दी',
    scriptName: 'Devanagari',
  },
  en: {
    id: 'en',
    sarvamCode: 'en-IN',
    bcp47Locale: 'en-IN',
    nameEnglish: 'English',
    nameNative: 'English',
    scriptName: 'Latin',
  },
  bn: {
    id: 'bn',
    sarvamCode: 'bn-IN',
    bcp47Locale: 'bn-IN',
    nameEnglish: 'Bengali',
    nameNative: 'বাংলা',
    scriptName: 'Bengali',
  },
  ta: {
    id: 'ta',
    sarvamCode: 'ta-IN',
    bcp47Locale: 'ta-IN',
    nameEnglish: 'Tamil',
    nameNative: 'தமிழ்',
    scriptName: 'Tamil',
  },
  te: {
    id: 'te',
    sarvamCode: 'te-IN',
    bcp47Locale: 'te-IN',
    nameEnglish: 'Telugu',
    nameNative: 'తెలుగు',
    scriptName: 'Telugu',
  },
  mr: {
    id: 'mr',
    sarvamCode: 'mr-IN',
    bcp47Locale: 'mr-IN',
    nameEnglish: 'Marathi',
    nameNative: 'मराठी',
    scriptName: 'Devanagari',
  },
  gu: {
    id: 'gu',
    sarvamCode: 'gu-IN',
    bcp47Locale: 'gu-IN',
    nameEnglish: 'Gujarati',
    nameNative: 'ગુજરાતી',
    scriptName: 'Gujarati',
  },
  kn: {
    id: 'kn',
    sarvamCode: 'kn-IN',
    bcp47Locale: 'kn-IN',
    nameEnglish: 'Kannada',
    nameNative: 'ಕನ್ನಡ',
    scriptName: 'Kannada',
  },
  ml: {
    id: 'ml',
    sarvamCode: 'ml-IN',
    bcp47Locale: 'ml-IN',
    nameEnglish: 'Malayalam',
    nameNative: 'മലയാളം',
    scriptName: 'Malayalam',
  },
  pa: {
    id: 'pa',
    sarvamCode: 'pa-IN',
    bcp47Locale: 'pa-IN',
    nameEnglish: 'Punjabi',
    nameNative: 'ਪੰਜਾਬੀ',
    scriptName: 'Gurmukhi',
  },
  as: {
    id: 'as',
    sarvamCode: 'as-IN',
    bcp47Locale: 'as-IN',
    nameEnglish: 'Assamese',
    nameNative: 'অসমীয়া',
    scriptName: 'Bengali-Assamese',
  },
  ur: {
    id: 'ur',
    sarvamCode: 'ur-IN',
    bcp47Locale: 'ur-IN',
    nameEnglish: 'Urdu',
    nameNative: 'اردو',
    scriptName: 'Perso-Arabic',
  },
};

/**
 * Normalizes any language code, name, or locale tag to the canonical internal Language ID.
 */
export function normalizeLanguageCode(input: string | undefined | null): Language {
  if (!input) return 'or';
  const clean = input.trim().toLowerCase();

  // 1. Direct match on ID
  if (clean in LANGUAGE_REGISTRY) {
    return clean as Language;
  }

  // 2. Match on prefix before hyphen or underscore (e.g. 'hi-in' -> 'hi', 'od-in' -> 'or')
  const prefix = clean.split(/[-_]/)[0];
  if (prefix === 'od') return 'or';
  if (prefix in LANGUAGE_REGISTRY) {
    return prefix as Language;
  }

  // 3. Match on English name
  for (const [id, def] of Object.entries(LANGUAGE_REGISTRY)) {
    if (def.nameEnglish.toLowerCase() === clean) {
      return id as Language;
    }
  }

  // 4. Match on Sarvam code
  for (const [id, def] of Object.entries(LANGUAGE_REGISTRY)) {
    if (def.sarvamCode.toLowerCase() === clean) {
      return id as Language;
    }
  }

  return 'or';
}

/**
 * Returns Sarvam's official API language code (e.g. 'od-IN', 'hi-IN', 'te-IN')
 */
export function getSarvamLanguageCode(lang: string | undefined | null): string {
  const norm = normalizeLanguageCode(lang);
  return LANGUAGE_REGISTRY[norm]?.sarvamCode || 'od-IN';
}

/**
 * Returns BCP-47 Locale code for browser SpeechSynthesis
 */
export function getBrowserSpeechLocale(lang: string | undefined | null): string {
  const norm = normalizeLanguageCode(lang);
  return LANGUAGE_REGISTRY[norm]?.bcp47Locale || 'or-IN';
}

/**
 * Returns human-readable English name for language (e.g. "Telugu")
 */
export function getLanguageEnglishName(lang: string | undefined | null): string {
  const norm = normalizeLanguageCode(lang);
  return LANGUAGE_REGISTRY[norm]?.nameEnglish || 'Odia';
}

/**
 * Returns native script name for language (e.g. "తెలుగు")
 */
export function getLanguageNativeName(lang: string | undefined | null): string {
  const norm = normalizeLanguageCode(lang);
  return LANGUAGE_REGISTRY[norm]?.nameNative || 'ଓଡ଼ିଆ';
}

/**
 * Diagnoses the client browser environment for debugging Safari and Mobile Chrome
 */
export function getBrowserDiagnosticInfo(): string {
  if (typeof navigator === 'undefined') return 'SSR/Node';
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isChrome = /Chrome/i.test(ua) || /CriOS/i.test(ua);
  const isFirefox = /Firefox/i.test(ua) || /FxiOS/i.test(ua);
  const isEdge = /Edg/i.test(ua);

  if (isIOS) {
    if (isChrome) return 'Mobile Chrome (iOS/WebKit)';
    if (isFirefox) return 'Mobile Firefox (iOS/WebKit)';
    return 'Mobile Safari (iOS)';
  }
  if (isAndroid) {
    if (isChrome) return 'Mobile Chrome (Android)';
    if (isFirefox) return 'Mobile Firefox (Android)';
    return 'Mobile Browser (Android)';
  }
  if (isEdge) return 'Desktop Edge';
  if (isChrome) return 'Desktop Chrome';
  if (isSafari) return 'Desktop Safari (macOS)';
  if (isFirefox) return 'Desktop Firefox';
  return `Generic (${ua.slice(0, 40)})`;
}
