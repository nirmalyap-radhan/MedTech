export type Language = 'en' | 'hi' | 'or';

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
  options?: string[];
  placeholderEn?: string;
  placeholderHi?: string;
  placeholderOr?: string;
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
  category: 'Chief Concern' | 'Symptoms' | 'Differential Assessment' | 'History' | 'Medications' | 'Allergies';
  type: 'voice-text' | 'yes-no' | 'multi-select' | 'text';
  options?: string[];
  placeholderEn?: string;
  placeholderHi?: string;
  placeholderOr?: string;
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
