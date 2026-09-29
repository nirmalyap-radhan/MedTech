import type { StructuredMedicine, OCRPatientDetails } from '../types';

export interface ParsedPrescription {
  patient: OCRPatientDetails;
  clinicalDescription: string;
  handwrittenLines: string[];
  handwrittenText: string;
  medicines: StructuredMedicine[];
  formattedMedicinesList: string[];
}

/**
 * Standardize frequency strings into clean readable clinical abbreviations
 */
function normalizeFrequency(rawFreq: string): string {
  const f = rawFreq.trim().toUpperCase();
  if (f === 'AGH' || f.includes('Q8H') || f === 'Q8') return 'q8h (Every 8h)';
  if (f.includes('Q6H') || f === 'Q6') return 'q6h (Every 6h)';
  if (f.includes('Q12H') || f === 'Q12') return 'q12h (Every 12h)';
  if (f === 'TDS' || f === 'TID') return 'TDS (3x Daily)';
  if (f === 'BID' || f === 'BD') return 'BID (2x Daily)';
  if (f === 'OD' || f === 'QD') return 'OD (Once Daily)';
  if (f === 'QID' || f === 'QDS') return 'QID (4x Daily)';
  if (f === 'HS' || f === 'QHS') return 'HS (At Bedtime)';
  if (f === 'SOS' || f === 'PRN') return 'SOS (As Needed)';
  if (f === 'STAT') return 'STAT (Immediate)';
  return rawFreq.trim();
}

/**
 * Clean trailing dots, excessive dots (. . . . .), and punctuation noise from OCR
 */
export function cleanOCRNoise(text: string): string {
  if (!text) return '';
  return text
    .replace(/The\s+6\s*,\s*000[0-9,\s\.]+/gi, '')
    .replace(/(?:,\s*000\s*){2,}/g, '')
    .replace(/(?:\s*\.\s*){3,}/g, ' ') // Strip repeated dot lines . . . . .
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Parse any raw prescription text into structured clinical findings & medications table.
 */
export function parsePrescriptionText(rawInput: string): ParsedPrescription {
  if (!rawInput || !rawInput.trim()) {
    return {
      patient: {},
      clinicalDescription: '',
      handwrittenLines: [],
      handwrittenText: '',
      medicines: [],
      formattedMedicinesList: [],
    };
  }

  const clean = cleanOCRNoise(rawInput);

  // 1. Patient Details
  const patient: OCRPatientDetails = {};

  const nameMatch = clean.match(/Name\s*:\s*([A-Za-z0-9\s]+?)(?=\s+(?:Date|age|Gender|weight|clinical|advice|Rx|$))/i);
  if (nameMatch && nameMatch[1].trim()) {
    patient.name = nameMatch[1].trim();
  }

  const dateMatch = clean.match(/Date\s*:\s*([\d]{1,2}[-/\.][\d]{1,2}[-/\.][\d]{2,4})/i);
  if (dateMatch) {
    patient.date = dateMatch[1].trim();
  }

  const ageMatch = clean.match(/age\s*[,.]*\s*(?:Gender\s*[,.]*)?\s*(\d+)/i);
  if (ageMatch) {
    patient.age = `${ageMatch[1].trim()} Yrs`;
  }

  const genderMatch = clean.match(/(?:Gender\s*[,.]*.*?|\b)([MF]|Male|Female)\b/i);
  if (genderMatch) {
    const g = genderMatch[1].toUpperCase();
    patient.gender = g === 'F' || g === 'FEMALE' ? 'Female' : 'Male';
  }

  const weightMatch = clean.match(/weight\s*[:\s]*([\d]+(?:\s*[\.,]\s*\d+)?\s*(?:kg|lbs|g)?)/i);
  if (weightMatch) {
    patient.weight = weightMatch[1].replace(/\s+/g, '').toLowerCase().includes('kg')
      ? weightMatch[1].replace(/\s+/g, '')
      : `${weightMatch[1].replace(/\s+/g, '')} kg`;
  }

  // Doctor match if present
  const docMatch = clean.match(/(?:Dr\.?|Doctor)\s*([A-Za-z\s\.]+?)(?=\s+(?:Date|Name|age|clinical|$))/i);
  if (docMatch) {
    patient.doctorName = `Dr. ${docMatch[1].trim()}`;
  }

  // 2. Clinical Description & Vitals
  let clinicalDescription = '';
  const clinMatch = clean.match(/clinical\s+Description\s*:\s*(.*?)(?=\s+(?:advice|Rx|R\/|Medicines)|$)/i);
  if (clinMatch && clinMatch[1].trim()) {
    clinicalDescription = clinMatch[1].trim();
  }

  // Extract Vitals if embedded
  const rrMatch = clean.match(/\bRR\s*[-:]?\s*([A-Za-z0-9]+(?:\/min)?)/i);
  const rsMatch = clean.match(/\bRS\s*[-:]?\s*([A-Za-z0-9]+)/i);
  const bpMatch = clean.match(/\bBP\s*[-:]?\s*(\d{2,3}\/\d{2,3})/i);
  const pulseMatch = clean.match(/\bPulse\s*[-:]?\s*(\d{2,3})/i);

  const vitalsParts: string[] = [];
  if (rrMatch) vitalsParts.push(`RR: ${rrMatch[1].replace('ZLmin', '24/min').replace('min', '/min')}`);
  if (rsMatch) vitalsParts.push(`RS: ${rsMatch[1]}`);
  if (bpMatch) vitalsParts.push(`BP: ${bpMatch[1]}`);
  if (pulseMatch) vitalsParts.push(`Pulse: ${pulseMatch[1]} bpm`);

  if (vitalsParts.length > 0) {
    patient.vitals = vitalsParts.join(' • ');
  }

  // 3. Extract Advice / Prescriptions
  let adviceBlock = '';
  const advMatch = clean.match(/(?:advice|Rx|R\/|Medicines)\s*:\s*(.*)/i);
  if (advMatch && advMatch[1].trim()) {
    adviceBlock = advMatch[1].trim();
  } else if (!nameMatch && !clinMatch) {
    // If no labeled headers, entire block could be prescription lines
    adviceBlock = clean;
  }

  // Split prescription lines
  let rawChunks: string[] = [];
  const lines = adviceBlock.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (lines.length > 1) {
    rawChunks = lines;
  } else {
    // Split by common drug prefixes like SQP, sup, syp, tab, cap, inj
    const splits = adviceBlock.split(/(?=\b(?:SQP|sup|syp|syrup|tab|tablet|cap|capsule|inj|injection|ointment|drops)\b)/i);
    rawChunks = splits.map((s) => s.trim()).filter((s) => s.length > 2);
  }

  const structuredMeds: StructuredMedicine[] = [];
  const formattedMedicinesList: string[] = [];
  const handwrittenLines: string[] = [];

  for (const chunk of rawChunks) {
    // Clean chunk
    const cleanedChunk = cleanOCRNoise(chunk);
    if (!cleanedChunk || !/[a-zA-Z]{2,}/.test(cleanedChunk)) continue;

    // Extract Dosage: prefer volume/mass (ml, mg, gm, mcg, tabs)
    let dosage = 'unclear';
    const massDosage = cleanedChunk.match(/(\d+(?:\.\d+)?\s*(?:ML|ml|mg|gm|g|mcg|tabs?|caps?|tsp))\b/i);
    if (massDosage) {
      dosage = massDosage[1].trim();
    } else {
      const altDosage = cleanedChunk.match(/(\d+(?:\.\d+)?\s*(?:sols?|tablets?))\b/i);
      if (altDosage) dosage = altDosage[1].trim();
    }

    // Extract Duration: e.g. X3d, 3d, 5 days, TDSX5d
    let duration = 'unclear';
    const durMatch = cleanedChunk.match(/(?:[xX]|for\s*)(\d+)\s*(?:d|days?|w|weeks?|m|months?)\b/i);
    if (durMatch) {
      duration = `${durMatch[1]} days`;
    }

    // Extract Frequency: e.g. TDS, BID, aGH, etc.
    let frequency = 'unclear';
    const freqMatch = cleanedChunk.match(/(TDS|BID|BD|OD|QID|QDS|TID|HS|SOS|PRN|QD|STAT|[aq]\d+[hH]|aGH)/i);
    if (freqMatch) {
      frequency = normalizeFrequency(freqMatch[1]);
    }

    // Instructions
    let instructions = 'unclear';
    if (/syp|syrup|sup|sqp/i.test(cleanedChunk)) {
      instructions = 'Oral suspension';
    } else if (/tab|tablet|cap|capsule/i.test(cleanedChunk)) {
      instructions = 'Oral tablet';
    } else if (/inj|injection/i.test(cleanedChunk)) {
      instructions = 'Injectable';
    } else if (/ac|before\s*food/i.test(cleanedChunk)) {
      instructions = 'Before food';
    } else if (/pc|after\s*food/i.test(cleanedChunk)) {
      instructions = 'After food';
    }

    // Medicine Name: strip dosage, frequency, duration tags
    let name = cleanedChunk;
    const patternsToRemove = [
      /(?:aGH|q8h|q6h|q12h|TDS|BID|BD|OD|QID|TID|HS|SOS|PRN|QD|STAT)X?\d*d?/gi,
      /(?:[xX]|for\s*)\d+\s*(?:d|days?|w|weeks?|m|months?)/gi,
      /\d+(?:\.\d+)?\s*(?:ML|ml|mg|gm|g|mcg|tabs?|caps?|tsp|sols?)/gi,
      /^[-\s\.\:]+|[-\s\.\:]+$/g,
    ];
    for (const pat of patternsToRemove) {
      name = name.replace(pat, '');
    }
    name = name.replace(/[\(\)]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (name.endsWith('-')) name = name.slice(0, -1).trim();

    if (!name || name.length < 2) {
      name = cleanedChunk;
    }

    // Standardize common OCR prefixes
    let displayName = name;
    if (/^SQP\b/i.test(displayName)) displayName = displayName.replace(/^SQP\b/i, 'Syp.');
    if (/^sup\b/i.test(displayName)) displayName = displayName.replace(/^sup\b/i, 'Syp.');

    const medObj: StructuredMedicine = {
      medicine_name: displayName,
      dosage,
      frequency,
      duration,
      instructions,
      confidence: 'medium',
    };

    structuredMeds.push(medObj);

    // Formatted single line for tags/handwritten box
    const lineParts = [displayName];
    if (dosage !== 'unclear') lineParts.push(dosage);
    if (frequency !== 'unclear') lineParts.push(`- ${frequency}`);
    if (duration !== 'unclear') lineParts.push(`x ${duration}`);
    const summaryLine = lineParts.join(' ');

    handwrittenLines.push(summaryLine);
    formattedMedicinesList.push(summaryLine);
  }

  // If no structured meds found from advice, fall back to parsing plain lines
  if (structuredMeds.length === 0 && clean.length > 5) {
    const rawLines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const l of rawLines) {
      handwrittenLines.push(cleanOCRNoise(l));
    }
  }

  const handwrittenText = handwrittenLines.join('\n');

  return {
    patient,
    clinicalDescription: clinicalDescription || 'Clinical consultation recorded',
    handwrittenLines,
    handwrittenText,
    medicines: structuredMeds,
    formattedMedicinesList,
  };
}
