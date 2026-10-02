import React, { createContext, useContext, useState, useEffect } from 'react';
import type {
  PatientCase,
  Language,
  Patient,
  IntakeAnswer,
  OCRDocument,
  AyushAssessment,
  ClinicalConsiderations,
  DynamicClinicalQuestion,
  ClinicalDialogueTurn,
  DoctorProfile,
  AuthSession,
} from '../types';
import { INITIAL_PATIENT_CASES } from '../data/mockData';
import { authDatabaseService } from '../services/authDatabaseService';
import { caseDatabaseService } from '../services/caseDatabaseService';

interface AppContextType {
  cases: PatientCase[];
  activeCaseId: string;
  activeCase: PatientCase;
  currentLanguage: Language;
  currentDraft: {
    patient: Partial<Patient>;
    answers: IntakeAnswer[];
    documents: OCRDocument[];
    ayush: AyushAssessment;
    currentQuestionIndex: number;
    clinicalConsiderations?: ClinicalConsiderations;
    dialogueHistory: ClinicalDialogueTurn[];
    dynamicQuestions?: DynamicClinicalQuestion[];
  };
  // Doctor Auth & Database
  currentDoctor: DoctorProfile | null;
  isDoctorAuthenticated: boolean;
  activeDoctorSession: AuthSession | null;
  authLoading: boolean;
  doctorLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  doctorLogout: () => Promise<void>;
  registerDoctor: (data: {
    name: string;
    email: string;
    passwordPlain: string;
    mciRegNumber: string;
    department: string;
    roomNumber: string;
    role: any;
    phone: string;
  }) => Promise<{ success: boolean; doctor?: DoctorProfile; error?: string }>;
  // Patient Actions
  setLanguage: (lang: Language) => void;
  updateDraftPatient: (info: Partial<Patient>) => void;
  saveDraftAnswer: (answer: IntakeAnswer) => void;
  setCurrentQuestionIndex: (idx: number) => void;
  updateDraftClinicalConsiderations: (cc: ClinicalConsiderations) => void;
  addDialogueTurn: (turn: ClinicalDialogueTurn) => void;
  addDraftDocument: (doc: OCRDocument) => void;
  removeDraftDocument: (docId: string) => void;
  updateDraftDocument: (docId: string, updated: Partial<OCRDocument>) => void;
  updateDraftAyush: (ayush: Partial<AyushAssessment>) => void;
  submitPatientIntake: () => string; // Returns submitted case ID
  selectDoctorPatient: (caseId: string) => void;
  updateCaseSummary: (caseId: string, summary: string) => void;
  confirmDoctorCase: (caseId: string) => void;
  resetPatientDraft: () => void;
}

const defaultAyush: AyushAssessment = {
  prakriti: 'Pitta-Kapha Dominant',
  vikriti: 'Vata-Pitta Dushti (Febrile state)',
  sara: 'Rakta & Mamsa Sara',
  samhanana: 'Madhyama',
  pramana: 'Madhyama',
  satmya: 'Satmya to Shita & Ruksha Ahara',
  satva: 'Madhyama Satva',
  aharaShakti: 'Mandagni',
  vyayamaShakti: 'Alpa',
  vaya: 'Madhyama Vaya (45 Years)',
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cases, setCases] = useState<PatientCase[]>(INITIAL_PATIENT_CASES);
  const [activeCaseId, setActiveCaseId] = useState<string>('MK-21917');
  const [currentLanguage, setCurrentLanguage] = useState<Language>('or');

  // Doctor Auth & Database state
  const [currentDoctor, setCurrentDoctor] = useState<DoctorProfile | null>({
    id: 'DOC-2026-001',
    name: 'Dr. Suresh Mishra',
    email: 'dr.mishra@hospital.gov.in',
    mciRegNumber: 'MCI-48920/OD',
    department: 'Internal Medicine & Critical Care',
    roomNumber: 'Room 104',
    role: 'CONSULTANT_PHYSICIAN',
    phone: '+91 94370 12890',
    avatar: 'SM',
    createdAt: new Date().toISOString(),
  });
  const [isDoctorAuthenticated, setIsDoctorAuthenticated] = useState<boolean>(false);
  const [activeDoctorSession, setActiveDoctorSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // Initialize DB, load persistent cases, and verify existing session on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await authDatabaseService.getDB();
        const [active, dbCases] = await Promise.all([
          authDatabaseService.getActiveSession(),
          caseDatabaseService.getAllCases(),
        ]);
        if (mounted) {
          if (active) {
            setActiveDoctorSession(active);
            setCurrentDoctor(active.doctor);
            setIsDoctorAuthenticated(true);
          }
          if (dbCases && dbCases.length > 0) {
            setCases(dbCases);
            setActiveCaseId(dbCases[0].id);
          }
        }
      } catch (e) {
        console.error('Database initialization error:', e);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const doctorLogin = async (email: string, password: string) => {
    setAuthLoading(true);
    try {
      const res = await authDatabaseService.login(email, password);
      if (res.success && res.session && res.doctor) {
        setActiveDoctorSession(res.session);
        setCurrentDoctor(res.doctor);
        setIsDoctorAuthenticated(true);
        return { success: true };
      }
      return { success: false, error: res.error || 'Login failed.' };
    } finally {
      setAuthLoading(false);
    }
  };

  const doctorLogout = async () => {
    await authDatabaseService.logout(activeDoctorSession?.token);
    setActiveDoctorSession(null);
    setIsDoctorAuthenticated(false);
  };

  const registerDoctor = async (data: any) => {
    setAuthLoading(true);
    try {
      const res = await authDatabaseService.registerDoctor(data);
      if (res.success && res.doctor) {
        return { success: true, doctor: res.doctor };
      }
      return { success: false, error: res.error || 'Registration failed.' };
    } finally {
      setAuthLoading(false);
    }
  };

  const [currentDraft, setCurrentDraft] = useState<{
    patient: Partial<Patient>;
    answers: IntakeAnswer[];
    documents: OCRDocument[];
    ayush: AyushAssessment;
    currentQuestionIndex: number;
    clinicalConsiderations?: ClinicalConsiderations;
    dialogueHistory: ClinicalDialogueTurn[];
    dynamicQuestions?: DynamicClinicalQuestion[];
  }>({
    patient: {
      id: 'MK-' + Math.floor(10000 + Math.random() * 90000),
      name: 'Sameer Kumar Das',
      age: 45,
      gender: 'Male',
      mobile: '+91 98610 23456',
      preferredLanguage: 'or',
    },
    answers: [],
    documents: [
      {
        id: 'doc-demo-1',
        name: 'Prescription_Sep05_DrSharma.pdf',
        type: 'Prescription',
        date: '05 September 2026',
        doctorName: 'Dr. R. K. Sharma (MD Internal Med)',
        medicines: ['Paracetamol 650mg TDS', 'Amoxicillin 500mg BD'],
        findings: 'Acute Febrile Illness',
        confidenceScore: 97,
      },
    ],
    ayush: defaultAyush,
    currentQuestionIndex: 0,
    dialogueHistory: [],
    clinicalConsiderations: undefined,
  });

  const activeCase = cases.find((c) => c.id === activeCaseId) || cases[0];

  const setLanguage = (lang: Language) => {
    setCurrentLanguage(lang);
    setCurrentDraft((prev) => ({
      ...prev,
      patient: { ...prev.patient, preferredLanguage: lang },
    }));
  };

  const updateDraftPatient = (info: Partial<Patient>) => {
    setCurrentDraft((prev) => ({
      ...prev,
      patient: { ...prev.patient, ...info },
    }));
  };

  const saveDraftAnswer = (answer: IntakeAnswer) => {
    setCurrentDraft((prev) => {
      const existingIdx = prev.answers.findIndex((a) => a.questionId === answer.questionId);
      let newAnswers = [...prev.answers];
      if (existingIdx >= 0) {
        newAnswers[existingIdx] = answer;
      } else {
        newAnswers.push(answer);
      }
      return { ...prev, answers: newAnswers };
    });
  };

  const setCurrentQuestionIndex = (idx: number) => {
    setCurrentDraft((prev) => ({ ...prev, currentQuestionIndex: idx }));
  };

  const updateDraftClinicalConsiderations = (cc: ClinicalConsiderations) => {
    setCurrentDraft((prev) => ({ ...prev, clinicalConsiderations: cc }));
  };

  const addDialogueTurn = (turn: ClinicalDialogueTurn) => {
    setCurrentDraft((prev) => ({
      ...prev,
      dialogueHistory: [...prev.dialogueHistory, turn],
    }));
  };

  const addDraftDocument = (doc: OCRDocument) => {
    setCurrentDraft((prev) => ({
      ...prev,
      documents: [...prev.documents, doc],
    }));
  };

  const removeDraftDocument = (docId: string) => {
    setCurrentDraft((prev) => ({
      ...prev,
      documents: prev.documents.filter((d) => d.id !== docId),
    }));
  };

  const updateDraftDocument = (docId: string, updated: Partial<OCRDocument>) => {
    setCurrentDraft((prev) => ({
      ...prev,
      documents: prev.documents.map((d) => (d.id === docId ? { ...d, ...updated } : d)),
    }));
  };

  const updateDraftAyush = (ayushUpdate: Partial<AyushAssessment>) => {
    setCurrentDraft((prev) => ({
      ...prev,
      ayush: { ...prev.ayush, ...ayushUpdate },
    }));
  };

  const submitPatientIntake = (): string => {
    const caseId = currentDraft.patient.id || 'MK-' + Math.floor(10000 + Math.random() * 90000);
    const firstAnswer = currentDraft.answers[0]?.answerValue || '';
    const firstStructured = currentDraft.answers[0]?.structuredData;
    const languageLabel = currentLanguage === 'or' ? 'Odia' : currentLanguage === 'hi' ? 'Hindi' : 'English';

    const newCase: PatientCase = {
      id: caseId,
      patient: {
        id: caseId,
        name: currentDraft.patient.name || 'Sameer Kumar Das',
        age: currentDraft.patient.age || 45,
        gender: currentDraft.patient.gender || 'Male',
        mobile: currentDraft.patient.mobile || '+91 98610 23456',
        preferredLanguage: currentLanguage,
      },
      chiefComplaint: firstAnswer || 'Not provided',
      duration: firstStructured?.duration || 'Not specified',
      associatedSymptoms: [],
      pastMedicalHistory: [],
      currentMedications: [],
      allergies: [],
      relevantPreviousHistory: '',
      arrivalTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Case Ready',
      answers: currentDraft.answers,
      documents: currentDraft.documents,
      ayush: currentDraft.ayush,
      clinicalConsiderations: currentDraft.clinicalConsiderations,
      aiSummary: currentDraft.clinicalConsiderations?.clinicalNotes
        ? `[Gemini Clinical Case] ${currentDraft.clinicalConsiderations.clinicalNotes} Suspicions: ${currentDraft.clinicalConsiderations.primarySuspicions.join(', ')}. Risk: ${currentDraft.clinicalConsiderations.riskLevel}.`
        : `Patient ${currentDraft.patient.name || 'Sameer Kumar Das'}, ${currentDraft.patient.age || 45}Y ${currentDraft.patient.gender || 'M'}, completed MediKiok kiosk intake in ${languageLabel}${
            firstAnswer ? ` with the primary concern: ${firstAnswer}` : ''
          }. Prepared for Doctor OPD Review.`,
      timeline: [
        {
          id: 't-new',
          date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
          title: 'MediKiok Kiosk Intake Completed',
          category: 'Intake',
          description: 'Voice intake and document OCR processed at OPD Kiosk.',
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    setCases((prev) => {
      const exists = prev.some((c) => c.id === caseId);
      if (exists) {
        return prev.map((c) => (c.id === caseId ? newCase : c));
      }
      return [newCase, ...prev];
    });

    // Asynchronously persist to real database & vector engine
    caseDatabaseService.saveCase(newCase).catch((err) => {
      console.warn('[AppContext] Case database persist deferred:', err);
    });

    setActiveCaseId(caseId);
    return caseId;
  };

  const selectDoctorPatient = (caseId: string) => {
    setActiveCaseId(caseId);
  };

  const updateCaseSummary = (caseId: string, summary: string) => {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? { ...c, aiSummary: summary } : c))
    );
    caseDatabaseService.updateCaseSummary(caseId, summary).catch(() => {});
  };

  const confirmDoctorCase = (caseId: string) => {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? { ...c, status: 'Doctor Verified' } : c))
    );
    caseDatabaseService.updateCaseStatus(caseId, 'Doctor Verified').catch(() => {});
  };

  const resetPatientDraft = () => {
    setCurrentDraft({
      patient: {
        id: 'MK-' + Math.floor(10000 + Math.random() * 90000),
        name: 'Sameer Kumar Das',
        age: 45,
        gender: 'Male',
        mobile: '+91 98610 23456',
        preferredLanguage: 'or',
      },
      answers: [],
      documents: [
        {
          id: 'doc-demo-1',
          name: 'Prescription_Sep05_DrSharma.pdf',
          type: 'Prescription',
          date: '05 September 2026',
          doctorName: 'Dr. R. K. Sharma (MD Internal Med)',
          medicines: ['Paracetamol 650mg TDS', 'Amoxicillin 500mg BD'],
          findings: 'Acute Febrile Illness',
          confidenceScore: 97,
        },
      ],
      ayush: defaultAyush,
      currentQuestionIndex: 0,
      dialogueHistory: [],
      clinicalConsiderations: undefined,
    });
  };

  return (
    <AppContext.Provider
      value={{
        cases,
        activeCaseId,
        activeCase,
        currentLanguage,
        currentDraft,
        // Doctor Auth & Database
        currentDoctor,
        isDoctorAuthenticated,
        activeDoctorSession,
        authLoading,
        doctorLogin,
        doctorLogout,
        registerDoctor,
        // Patient Actions
        setLanguage,
        updateDraftPatient,
        saveDraftAnswer,
        setCurrentQuestionIndex,
        updateDraftClinicalConsiderations,
        addDialogueTurn,
        addDraftDocument,
        removeDraftDocument,
        updateDraftDocument,
        updateDraftAyush,
        submitPatientIntake,
        selectDoctorPatient,
        updateCaseSummary,
        confirmDoctorCase,
        resetPatientDraft,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
