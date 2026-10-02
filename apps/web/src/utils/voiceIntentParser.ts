/**
 * voiceIntentParser.ts
 * --------------------
 * Parses real patient voice transcripts (Odia & English translation)
 * to automatically map clinical responses (e.g., YES/NO questions).
 *
 * Supports native Odia speech variations and English translations from Sarvam STT.
 */

export interface ParsedVoiceResponse {
  isYesNo: boolean;
  yesNoValue?: 'Yes' | 'No';
  matchedPattern?: string;
}

/**
 * Detect affirmative or negative intent from patient's spoken Odia/English
 */
export function parseYesNoIntent(
  regionalText: string = '',
  englishText: string = ''
): ParsedVoiceResponse {
  const reg = regionalText.trim().toLowerCase();
  const eng = englishText.trim().toLowerCase();

  // 1. Odia & Hindi Negative Patterns
  const negativePatterns = [
    // Odia
    'ନାହିଁ',
    'ନାହି',
    'ନା',
    'ନାଇଁ',
    'ନାଇ',
    'କିଛି ନାହିଁ',
    'କିଛି ନାଇଁ',
    'ହେଉନାହିଁ',
    'ନାହାନ୍ତି',
    'ହେଉନି',
    'ନାହିଁ ଆଜ୍ଞା',
    // Hindi
    'नहीं',
    'नहीं है',
    'ना',
    'न',
    'कुछ नहीं',
    'कोई नहीं',
    'नहीं जी',
  ];

  // 2. Odia & Hindi Affirmative Patterns
  const affirmativePatterns = [
    // Odia
    'ହଁ',
    'ହଁ, ଅଛି',
    'ହଁ ଅଛି',
    'ଅଛି',
    'ହଁ ହେଉଛି',
    'ହେଉଛି',
    'ଆଜ୍ଞା',
    'ହଁ ଆଜ୍ଞା',
    'ହଁ, ଆଜ୍ଞା',
    'ଅଛି ଆଜ୍ଞା',
    'ହଁ ଲାଗୁଛି',
    'ଲାଗୁଛି',
    // Hindi
    'हाँ',
    'हां',
    'हाँ जी',
    'हां जी',
    'हाँ है',
    'है',
    'जी हाँ',
    'जी हां',
  ];

  // 3. English Negative Patterns (from Sarvam translation)
  const isEngNegative = /\b(no|nope|nah|not|neither|never|none|negative|don't|no fever|no cough|no pain)\b/i.test(
    eng
  );

  // 4. English Affirmative Patterns (from Sarvam translation)
  const isEngAffirmative = /\b(yes|yeah|yep|yup|affirmative|present|have|suffering|there is|positive)\b/i.test(
    eng
  );

  // Check Negative First
  for (const pattern of negativePatterns) {
    if (reg.includes(pattern)) {
      return {
        isYesNo: true,
        yesNoValue: 'No',
        matchedPattern: `Pattern: "${pattern}"`,
      };
    }
  }

  if (isEngNegative) {
    return {
      isYesNo: true,
      yesNoValue: 'No',
      matchedPattern: `English: "${eng}"`,
    };
  }

  // Check Affirmative
  for (const pattern of affirmativePatterns) {
    if (reg.includes(pattern)) {
      return {
        isYesNo: true,
        yesNoValue: 'Yes',
        matchedPattern: `Pattern: "${pattern}"`,
      };
    }
  }

  if (isEngAffirmative) {
    return {
      isYesNo: true,
      yesNoValue: 'Yes',
      matchedPattern: `English: "${eng}"`,
    };
  }

  return {
    isYesNo: false,
  };
}
