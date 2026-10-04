export type Language =
  | 'or' // Odia
  | 'hi' // Hindi
  | 'en' // English
  | 'bn' // Bengali
  | 'ta' // Tamil
  | 'te' // Telugu
  | 'kn' // Kannada
  | 'ml' // Malayalam
  | 'mr' // Marathi
  | 'gu' // Gujarati
  | 'pa' // Punjabi
  | 'as' // Assamese
  | 'ur'; // Urdu

export interface LanguageMeta {
  id: Language;
  code: Language;
  nameNative: string;
  nameEn: string;
  subtext: string;
  sampleVoice: string;
  sarvamCode: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  {
    id: 'or',
    code: 'or',
    nameNative: 'ଓଡ଼ିଆ',
    nameEn: 'Odia',
    subtext: 'ଓଡ଼ିଆ ଭାଷାରେ କଥାବାର୍ତ୍ତା କରନ୍ତୁ କିମ୍ବା ଲେଖନ୍ତୁ',
    sampleVoice: '“ମୋ ନାମ ନିର୍ମଲ୍ୟ”',
    sarvamCode: 'od-IN',
  },
  {
    id: 'hi',
    code: 'hi',
    nameNative: 'हिन्दी',
    nameEn: 'Hindi',
    subtext: 'हिन्दी भाषा में बातचीत करें या लिखें',
    sampleVoice: '“मेरा नाम निर्मल्या है”',
    sarvamCode: 'hi-IN',
  },
  {
    id: 'en',
    code: 'en',
    nameNative: 'English',
    nameEn: 'English',
    subtext: 'Speak or type your symptoms in English',
    sampleVoice: '“My name is Nirmalya”',
    sarvamCode: 'en-IN',
  },
  {
    id: 'bn',
    code: 'bn',
    nameNative: 'বাংলা',
    nameEn: 'Bengali',
    subtext: 'বাংলা ভাষায় কথা বলুন বা লিখুন',
    sampleVoice: '“আমার নাম নির্মল্য”',
    sarvamCode: 'bn-IN',
  },
  {
    id: 'ta',
    code: 'ta',
    nameNative: 'தமிழ்',
    nameEn: 'Tamil',
    subtext: 'தமிழில் பேசுங்கள் அல்லது எழுதுங்கள்',
    sampleVoice: '“என் பெயர் நிர்மல்யா”',
    sarvamCode: 'ta-IN',
  },
  {
    id: 'te',
    code: 'te',
    nameNative: 'తెలుగు',
    nameEn: 'Telugu',
    subtext: 'తెలుగులో మాట్లాడండి లేదా రాయండి',
    sampleVoice: '“నా పేరు నిర్మల్య”',
    sarvamCode: 'te-IN',
  },
  {
    id: 'kn',
    code: 'kn',
    nameNative: 'ಕನ್ನಡ',
    nameEn: 'Kannada',
    subtext: 'ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡಿ ಅಥವಾ ಬರೆಯಿರಿ',
    sampleVoice: '“ನನ್ನ ಹೆಸರು ನಿರ್ಮಲ್ಯ”',
    sarvamCode: 'kn-IN',
  },
  {
    id: 'ml',
    code: 'ml',
    nameNative: 'മലയാളം',
    nameEn: 'Malayalam',
    subtext: 'മലയാളത്തിൽ സംസാരിക്കുക അല്ലെങ്കിൽ എഴുതുക',
    sampleVoice: '“എന്റെ പേര് നിർമ്മല്യ”',
    sarvamCode: 'ml-IN',
  },
  {
    id: 'mr',
    code: 'mr',
    nameNative: 'मराठी',
    nameEn: 'Marathi',
    subtext: 'मराठी भाषेत बोला किंवा लिहा',
    sampleVoice: '“माझे नाव निर्मल्या आहे”',
    sarvamCode: 'mr-IN',
  },
  {
    id: 'gu',
    code: 'gu',
    nameNative: 'ગુજરાતી',
    nameEn: 'Gujarati',
    subtext: 'ગુજરાતી ભાષામાં બોલો અથવા લખો',
    sampleVoice: '“મારું નામ નિર્મલ્ય છે”',
    sarvamCode: 'gu-IN',
  },
  {
    id: 'pa',
    code: 'pa',
    nameNative: 'ਪੰਜਾਬੀ',
    nameEn: 'Punjabi',
    subtext: 'ਪੰਜਾਬੀ ਭਾਸ਼ਾ ਵਿੱਚ ਗੱਲ ਕਰੋ ਜਾਂ ਲਿਖੋ',
    sampleVoice: '“ਮੇਰਾ ਨਾਮ ਨਿਰਮਲਿਆ ਹੈ”',
    sarvamCode: 'pa-IN',
  },
  {
    id: 'as',
    code: 'as',
    nameNative: 'অসমীয়া',
    nameEn: 'Assamese',
    subtext: 'অসমীয়াত কথা কওক বা লিখক',
    sampleVoice: '“মোৰ নাম নিৰ্মল্য”',
    sarvamCode: 'as-IN',
  },
  {
    id: 'ur',
    code: 'ur',
    nameNative: 'اردو',
    nameEn: 'Urdu',
    subtext: 'اردو میں بات کریں یا لکھیں',
    sampleVoice: '“میرا نام نرملیا ہے”',
    sarvamCode: 'ur-IN',
  },
];

export function getLanguageLabel(langCode: string): string {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
  if (!lang) return langCode.toUpperCase();
  if (lang.code === 'en') return 'English';
  return `${lang.nameNative} (${lang.nameEn})`;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  mobile: string;
  preferredLanguage: Language;
}

export interface IntakeAnswer {
  questionId: string;
  questionText: string;
  rawVoiceInput?: string;
  transcription?: string;
  answerValue: string;
  structuredData?: {
    chiefComplaint?: string;
    duration?: string;
    severity?: string;
    triggers?: string;
  };
}

export interface StructuredMedicine {
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  confidence?: 'high' | 'medium' | 'low' | string;
}

export interface OCRPatientDetails {
  name?: string;
  date?: string;
  age?: string;
  gender?: string;
  weight?: string;
  doctorName?: string;
  vitals?: string;
  clinicalDescription?: string;
}

export interface OCRDocument {
  id: string;
  name: string;
  type: 'Prescription' | 'Lab Report' | 'Discharge Summary' | 'Scan Report';
  date: string;
  doctorName: string;
  medicines: string[];
  structuredMedicines?: StructuredMedicine[];
  patientDetails?: OCRPatientDetails;
  handwrittenText?: string;
  findings: string;
  confidenceScore: number; // e.g. 96
  previewUrl?: string;
  rawExtractedText?: string;
}

export interface AyushAssessment {
  prakriti: string; // Vata, Pitta, Kapha or dual
  vikriti: string; // Current imbalance
  sara: string; // Dhatu excellence (Rasa, Rakta, Mamsa, etc.)
  samhanana: string; // Compactness of body
  pramana: string; // Anthropometric measurement
  satmya: string; // Habituation / Adaptability
  satva: string; // Mental strength / Resilience
  aharaShakti: string; // Digestive capacity
  vyayamaShakti: string; // Physical endurance
  vaya: string; // Age category (Bala, Madhya, Vriddha)
}

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  category: 'Consultation' | 'Lab' | 'Prescription' | 'Intake';
  description: string;
  facility?: string;
}

export interface ClinicalConsiderations {
  primarySuspicions: string[];
  symptomsIdentified: string[];
  redFlags: string[];
  riskLevel: 'Low' | 'Mild' | 'Moderate' | 'High' | 'Emergency';
  ayushCorrelation: {
    doshaImbalance: string;
    agniState: string;
  };
  clinicalNotes: string;
  source?: string;
}

export interface DynamicClinicalQuestion {
  id: string;
  category: 'Chief Concern' | 'Symptoms' | 'Differential Assessment' | 'History' | 'Medications' | 'Allergies';
  type: 'voice-text' | 'yes-no' | 'multi-select' | 'text';
  textEn: string;
  textHi: string;
  textOr: string;
  textRegional?: string;
  options?: string[];
  placeholderEn?: string;
  placeholderHi?: string;
  placeholderOr?: string;
  placeholderRegional?: string;
  isTerminal?: boolean;
}

export interface ClinicalDialogueTurn {
  question: string;
  answerRegional: string;
  answerEnglish: string;
  category?: string;
  timestamp?: string;
}

export interface PatientCase {
  id: string;
  patient: Patient;
  chiefComplaint: string;
  duration: string;
  associatedSymptoms: string[];
  pastMedicalHistory: string[];
  currentMedications: string[];
  allergies: string[];
  relevantPreviousHistory: string;
  arrivalTime: string;
  status: 'Draft' | 'Case Ready' | 'Doctor Verified';
  answers: IntakeAnswer[];
  documents: OCRDocument[];
  ayush: AyushAssessment;
  aiSummary: string;
  timeline: TimelineEvent[];
  updatedAt: string;
  clinicalConsiderations?: ClinicalConsiderations;
}

export interface ClinicalQuestion {
  id: string;
  stepNumber: number;
  textEn: string;
  textHi: string;
  textOr: string;
  textRegional?: string;
  category: 'Chief Concern' | 'Symptoms' | 'Differential Assessment' | 'History' | 'Medications' | 'Allergies';
  type: 'voice-text' | 'yes-no' | 'multi-select' | 'text';
  options?: string[];
  placeholderEn?: string;
  placeholderHi?: string;
  placeholderOr?: string;
  placeholderRegional?: string;
}

export type DoctorRole =
  | 'CHIEF_MEDICAL_OFFICER'
  | 'CONSULTANT_PHYSICIAN'
  | 'AYUSH_SPECIALIST'
  | 'RESIDENT_DOCTOR';

export interface DoctorProfile {
  id: string;
  name: string;
  email: string;
  mciRegNumber: string;
  department: string;
  roomNumber: string;
  role: DoctorRole;
  avatar: string;
  phone: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface DoctorRecord extends DoctorProfile {
  passwordHash: string;
  salt: string;
  failedLoginAttempts: number;
  lockoutUntil?: number;
}

export interface AuthSession {
  token: string;
  doctorId: string;
  doctor: DoctorProfile;
  issuedAt: number;
  expiresAt: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  doctorId: string;
  doctorName: string;
  action: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT' | 'CASE_VERIFIED' | 'DOCTOR_REGISTERED';
  ipAddress: string;
  details: string;
}
