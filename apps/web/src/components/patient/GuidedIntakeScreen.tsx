import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { CLINICAL_QUESTIONS } from '../../data/mockData';
import type { IntakeAnswer, ClinicalQuestion } from '../../types';
import { voiceService } from '../../services/voiceService';
import { ttsService } from '../../services/ttsService';
import { clinicalReasoningService } from '../../services/clinicalReasoningService';
import { parseYesNoIntent } from '../../utils/voiceIntentParser';
import { t, getQuestionText, getSymptomName } from '../../utils/i18n';
import {
  Mic,
  Check,
  ArrowLeft,
  ArrowRight,
  Volume2,
  VolumeX,
  RefreshCw,
  RotateCcw,
  Stethoscope,
  Keyboard,
  HandMetal,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FeverIcon,
  CoughIcon,
  HeadacheIcon,
  StomachPainIcon,
  BodyPainIcon,
  BreathlessnessIcon,
  NauseaIcon,
  DizzinessIcon,
  BotanicalLeafWatermark,
} from '../common/MedicalIcons';

interface GuidedIntakeScreenProps {
  onNext: () => void;
  onBack: () => void;
}

export type VoiceFlowState =
  | 'QUESTION_DISPLAY'
  | 'SPEAKING_QUESTION'
  | 'READY_TO_LISTEN'
  | 'RECORDING'
  | 'PROCESSING'
  | 'ANSWER_RECEIVED'
  | 'ERROR'
  | 'DENIED'
  | 'UNSUPPORTED'
  | 'EMPTY';

interface SymptomCardItem {
  id: string;
  name: string;
  nameOr: string;
  nameHi: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  bg: string;
  border: string;
  text: string;
  ring: string;
}

const COMMON_SYMPTOMS: SymptomCardItem[] = [
  { id: 'fever', name: 'Fever', nameOr: 'ଜ୍ୱର', nameHi: 'बुखार', icon: FeverIcon, bg: 'bg-[#FDF3F2]', border: 'border-[#F8CECB]', text: 'text-[#E05252]', ring: 'ring-[#E05252]/30' },
  { id: 'cough', name: 'Cough', nameOr: 'କାଶ', nameHi: 'खांसी', icon: CoughIcon, bg: 'bg-[#F1F7FD]', border: 'border-[#CCE2F7]', text: 'text-[#2563EB]', ring: 'ring-[#2563EB]/30' },
  { id: 'headache', name: 'Headache', nameOr: 'ମୁଣ୍ଡବିନ୍ଧା', nameHi: 'सिरदर्द', icon: HeadacheIcon, bg: 'bg-[#FDF9ED]', border: 'border-[#F7EAC4]', text: 'text-[#D97706]', ring: 'ring-[#D97706]/30' },
  { id: 'stomach', name: 'Stomach Pain', nameOr: 'ପେଟ ଯନ୍ତ୍ରଣା', nameHi: 'पेट दर्द', icon: StomachPainIcon, bg: 'bg-[#F0FAF4]', border: 'border-[#C7ECD5]', text: 'text-[#059669]', ring: 'ring-[#059669]/30' },
  { id: 'bodypain', name: 'Body Pain', nameOr: 'ଶରୀର ପୀଡ଼ା', nameHi: 'बदन दर्द', icon: BodyPainIcon, bg: 'bg-[#F6F3FC]', border: 'border-[#DDD3F7]', text: 'text-[#7C3AED]', ring: 'ring-[#7C3AED]/30' },
  { id: 'breathless', name: 'Breathlessness', nameOr: 'ଶ୍ୱାସକ୍ରିୟାରେ କଷ୍ଟ', nameHi: 'सांस फूलना', icon: BreathlessnessIcon, bg: 'bg-[#F0FAFA]', border: 'border-[#C3ECEC]', text: 'text-[#0284C7]', ring: 'ring-[#0284C7]/30' },
  { id: 'nausea', name: 'Nausea', nameOr: 'ବାନ୍ତି ଭାବ', nameHi: 'जी मिचलाना', icon: NauseaIcon, bg: 'bg-[#FEF2F4]', border: 'border-[#F9CDD5]', text: 'text-[#E11D48]', ring: 'ring-[#E11D48]/30' },
  { id: 'dizziness', name: 'Dizziness', nameOr: 'ମୁଣ୍ଡ ବୁଲାଇବା', nameHi: 'चक्कर आना', icon: DizzinessIcon, bg: 'bg-[#F2F5F9]', border: 'border-[#D1DCE7]', text: 'text-[#475569]', ring: 'ring-[#475569]/30' },
];

export const GuidedIntakeScreen: React.FC<GuidedIntakeScreenProps> = ({ onNext, onBack }) => {
  const {
    currentLanguage,
    currentDraft,
    saveDraftAnswer,
    setCurrentQuestionIndex,
    updateDraftClinicalConsiderations,
    addDialogueTurn,
  } = useApp();

  const [questions, setQuestions] = useState<ClinicalQuestion[]>(CLINICAL_QUESTIONS);
  const currentIndex = currentDraft.currentQuestionIndex || 0;
  const currentQuestion = questions[currentIndex] || questions[0];

  // Auto Voice-Guidance Toggle (enabled by default)
  const [autoVoice, setAutoVoice] = useState(true);

  // Input Mode: Speak (Default), Type, Touch Select
  const [inputMode, setInputMode] = useState<'speak' | 'type' | 'touch'>('speak');

  // Selected quick symptom cards
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);

  // Voice State Machine
  const [voiceState, setVoiceState] = useState<VoiceFlowState>('QUESTION_DISPLAY');
  const [voiceDetails, setVoiceDetails] = useState<{
    regional: string;
    english: string;
    language: string;
    source: string;
  } | null>(null);

  // Input value state
  const [inputValue, setInputValue] = useState('');
  const [selectedMulti, setSelectedMulti] = useState<string[]>([]);
  const [isAiReasoning, setIsAiReasoning] = useState(false);

  // Tracking refs to prevent race conditions and stale closures
  const activeQuestionIndexRef = useRef(currentIndex);
  const recordingTimerRef = useRef<any>(null);
  const lifecycleIdRef = useRef(0);
  const startListeningRef = useRef<(() => Promise<void>) | null>(null);
  const questionTitleRef = useRef<string>('');
  const lastSpokenKeyRef = useRef<string>('');
  const hasRequestedInitialMicRef = useRef<boolean>(false);

  // Localized question title & placeholder
  const questionTitle = getQuestionText(currentQuestion, currentLanguage);

  const placeholderText =
    currentLanguage === 'or'
      ? (currentQuestion.placeholderOr || currentQuestion.placeholderEn)
      : currentLanguage === 'hi'
      ? (currentQuestion.placeholderHi || currentQuestion.placeholderEn)
      : (currentQuestion.placeholderRegional || currentQuestion.placeholderEn);

  // ------------------------------------------------------------------
  // Microphone Stop and Process
  // ------------------------------------------------------------------
  const stopListeningSession = useCallback(async () => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    setVoiceState('PROCESSING');
    console.log('[VOICE] Recording stopped');

    const res = await voiceService.stopRecording(currentLanguage);

    if (activeQuestionIndexRef.current !== currentIndex) {
      console.log('[VOICE] Discarding result: question already changed');
      return;
    }

    if (res.status === 'success') {
      const reg = res.regionalTranscript;
      const eng = res.englishTranslation;

      setVoiceDetails({
        regional: reg,
        english: eng,
        language: res.detectedLanguage,
        source: res.backendSource,
      });

      if (currentQuestion.type === 'yes-no') {
        const intent = parseYesNoIntent(reg, eng);
        if (intent.isYesNo && intent.yesNoValue) {
          setInputValue(intent.yesNoValue);
        } else {
          const combined = (reg + ' ' + eng).toLowerCase();
          if (combined.includes('yes') || combined.includes('ହଁ') || combined.includes('हाँ')) {
            setInputValue('Yes');
          } else if (combined.includes('no') || combined.includes('ନା') || combined.includes('नहीं')) {
            setInputValue('No');
          } else {
            setInputValue(reg || eng || 'Yes');
          }
        }
      } else if (currentQuestion.type === 'multi-select') {
        const combined = (reg + ' ' + eng).toLowerCase();
        if (combined.includes('none') || combined.includes('ନାହିଁ') || combined.includes('नहीं')) {
          setSelectedMulti(['None of the above']);
          setInputValue('None of the above');
        } else {
          setInputValue(reg || eng);
        }
      } else {
        setInputValue(reg || eng);
      }

      addDialogueTurn({
        question: questionTitle,
        answerRegional: reg,
        answerEnglish: eng,
        category: currentQuestion.category,
      });

      // Save draft answer immediately
      saveDraftAnswer({
        questionId: currentQuestion.id,
        questionText: questionTitle,
        rawVoiceInput: reg,
        transcription: reg,
        answerValue: reg || eng,
        structuredData: {
          chiefComplaint: eng || reg,
          duration: '',
        },
      });

      // Trigger Gemini Flash clinical reasoning & dynamic question adaptation
      setIsAiReasoning(true);
      try {
        const dialogue = [
          ...currentDraft.dialogueHistory,
          {
            question: questionTitle,
            answerRegional: reg,
            answerEnglish: eng,
            category: currentQuestion.category,
          },
        ];
        const reasonRes = await clinicalReasoningService.evaluateClinicalDialogue(
          dialogue,
          currentDraft.patient,
          reg,
          eng,
          currentLanguage
        );
        if (reasonRes.status === 'success' && reasonRes.clinicalConsiderations) {
          updateDraftClinicalConsiderations(reasonRes.clinicalConsiderations);
          if (reasonRes.nextQuestion && !reasonRes.nextQuestion.isTerminal) {
            const nextIndex = currentIndex + 1;
            const newQ: ClinicalQuestion = {
              id: reasonRes.nextQuestion.id,
              stepNumber: nextIndex + 1,
              category: reasonRes.nextQuestion.category,
              type: reasonRes.nextQuestion.type,
              textEn: reasonRes.nextQuestion.textEn,
              textOr: reasonRes.nextQuestion.textOr,
              textHi: reasonRes.nextQuestion.textHi,
              textRegional: reasonRes.nextQuestion.textRegional,
              placeholderRegional: reasonRes.nextQuestion.placeholderRegional,
              options: reasonRes.nextQuestion.options,
              placeholderEn: reasonRes.nextQuestion.placeholderEn,
              placeholderOr: reasonRes.nextQuestion.placeholderOr,
              placeholderHi: reasonRes.nextQuestion.placeholderHi,
            };
            setQuestions((prev) => {
              const updated = [...prev];
              if (nextIndex < updated.length) {
                updated[nextIndex] = newQ;
              } else {
                updated.push(newQ);
              }
              return updated;
            });

            // Prefetch audio in background so it plays in 0ms when advanced
            const prefetchText =
              currentLanguage === 'or'
                ? (reasonRes.nextQuestion.textOr || reasonRes.nextQuestion.textEn)
                : currentLanguage === 'hi'
                ? (reasonRes.nextQuestion.textHi || reasonRes.nextQuestion.textEn)
                : currentLanguage === 'en'
                ? reasonRes.nextQuestion.textEn
                : (reasonRes.nextQuestion.textRegional || reasonRes.nextQuestion.textEn);
            if (prefetchText) {
              ttsService.prefetch(prefetchText, currentLanguage);
            }
          }
        }
      } catch (e) {
        console.warn('[VOICE] Clinical reasoning update failed:', e);
      } finally {
        setIsAiReasoning(false);
      }

      setVoiceState('ANSWER_RECEIVED');
    } else if (res.status === 'empty') {
      setVoiceState('EMPTY');
    } else {
      console.warn('[VOICE] Voice backend error:', res.errorMessage);
      setVoiceState('ERROR');
    }
  }, [currentIndex, currentLanguage, currentQuestion, questionTitle, addDialogueTurn, currentDraft.dialogueHistory, currentDraft.patient, saveDraftAnswer, updateDraftClinicalConsiderations]);

  // ------------------------------------------------------------------
  // Microphone Start
  // ------------------------------------------------------------------
  const startListeningSession = useCallback(async () => {
    if (activeQuestionIndexRef.current !== currentIndex) return;

    ttsService.stop();
    voiceService.cancelRecording();

    setVoiceState('READY_TO_LISTEN');

    const permStatus = await voiceService.startRecording();
    if (activeQuestionIndexRef.current !== currentIndex) {
      voiceService.cancelRecording();
      return;
    }

    if (permStatus === 'unsupported') {
      setVoiceState('UNSUPPORTED');
      return;
    }

    if (permStatus === 'denied') {
      setVoiceState('DENIED');
      return;
    }

    setVoiceState('RECORDING');

    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    recordingTimerRef.current = setTimeout(async () => {
      if (activeQuestionIndexRef.current === currentIndex && voiceService.isRecording()) {
        await stopListeningSession();
      }
    }, 7000);
  }, [currentIndex, stopListeningSession]);

  startListeningRef.current = startListeningSession;
  questionTitleRef.current = questionTitle;

  const handleMicButtonClick = async () => {
    if (voiceState === 'RECORDING') {
      await stopListeningSession();
    } else if (voiceState === 'DENIED') {
      await handleReplayQuestion();
    } else if (voiceState === 'SPEAKING_QUESTION') {
      ttsService.stop();
      await startListeningSession();
    } else {
      ttsService.stop();
      await startListeningSession();
    }
  };

  const handleReplayQuestion = async () => {
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    voiceService.cancelRecording();
    ttsService.stop();

    // Proactively verify/request microphone permission
    const permStatus = await voiceService.requestPermission();
    if (permStatus === 'denied') {
      setVoiceState('DENIED');
      return;
    }
    if (permStatus === 'unsupported') {
      setVoiceState('UNSUPPORTED');
      return;
    }

    setVoiceState('SPEAKING_QUESTION');
    const spoken = await ttsService.speak(questionTitle, currentLanguage);

    if (activeQuestionIndexRef.current !== currentIndex) return;

    if (spoken && autoVoice) {
      setVoiceState('READY_TO_LISTEN');
      await new Promise((r) => setTimeout(r, 350));
      if (activeQuestionIndexRef.current === currentIndex) {
        await startListeningSession();
      }
    } else {
      setVoiceState('READY_TO_LISTEN');
    }
  };

  const handleResetRecord = () => {
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    voiceService.cancelRecording();
    ttsService.stop();
    setVoiceState('READY_TO_LISTEN');
    setVoiceDetails(null);
    setInputValue('');
  };

  // ------------------------------------------------------------------
  // Smart pre-fetching of current and next question audio (0ms latency)
  // ------------------------------------------------------------------
  useEffect(() => {
    // Current question
    const curQ = questions[currentIndex] || currentQuestion;
    if (curQ) {
      const curText = getQuestionText(curQ, currentLanguage);
      if (curText) {
        ttsService.prefetch(curText, currentLanguage);
      }
    }

    // Next question
    const nextQ = questions[currentIndex + 1];
    if (nextQ) {
      const nextText = getQuestionText(nextQ, currentLanguage);
      if (nextText) {
        ttsService.prefetch(nextText, currentLanguage);
      }
    }
  }, [currentIndex, currentLanguage, questions, currentQuestion]);

  // ------------------------------------------------------------------
  // Question Lifecycle & Automatic Voice Guidance in Selected Language
  // ------------------------------------------------------------------
  useEffect(() => {
    const thisLifecycleId = ++lifecycleIdRef.current;
    activeQuestionIndexRef.current = currentIndex;

    // Immediately stop any previous audio or recording
    ttsService.stop();
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    voiceService.cancelRecording();
    setVoiceDetails(null);

    const targetQuestion = questions[currentIndex] || currentQuestion;
    const titleToSpeak = getQuestionText(targetQuestion, currentLanguage);

    const existingAnswer = currentDraft.answers.find((a: IntakeAnswer) => a.questionId === targetQuestion.id);
    if (existingAnswer) {
      setInputValue(existingAnswer.answerValue);
      if (targetQuestion.type === 'multi-select') {
        setSelectedMulti(existingAnswer.answerValue.split(', ').filter(Boolean));
      } else {
        setSelectedMulti([]);
      }
    } else {
      setInputValue('');
      setSelectedMulti([]);
    }

    const questionKey = `${currentIndex}:${targetQuestion.id}:${currentLanguage}`;

    if (autoVoice) {
      // Prevent repeating: only speak once per question transition
      if (lastSpokenKeyRef.current !== questionKey) {
        (async () => {
          // Flow: When entering this page, browser asks for mic permission.
          // When allowed, it speaks the question, and after question it listens to the user.
          if (!hasRequestedInitialMicRef.current) {
            hasRequestedInitialMicRef.current = true;
            try {
              console.log('[VOICE] Proactively requesting microphone permission...');
              await voiceService.requestPermission();
            } catch {
              // Safari defers mic prompt until explicit user interaction; proceed to speak question
            }
          }

          lastSpokenKeyRef.current = questionKey;
          setVoiceState('SPEAKING_QUESTION');

          console.log('[VOICE] Speaking question in', currentLanguage, ':', titleToSpeak);
          const spoken = await ttsService.speak(titleToSpeak, currentLanguage);

          if (lifecycleIdRef.current !== thisLifecycleId) return;

          if (spoken) {
            setVoiceState('READY_TO_LISTEN');
            await new Promise((r) => setTimeout(r, 350));
            if (lifecycleIdRef.current !== thisLifecycleId) return;

            if (startListeningRef.current) await startListeningRef.current();
          } else {
            console.warn('[VOICE] Question speak was not completed or blocked, ready to listen');
            setVoiceState('READY_TO_LISTEN');
            lastSpokenKeyRef.current = '';
          }
        })();
      } else {
        setVoiceState('READY_TO_LISTEN');
      }
    } else {
      setVoiceState('READY_TO_LISTEN');
    }

    return () => {
      ttsService.stop();
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      voiceService.cancelRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentLanguage, autoVoice, currentQuestion.id]);

  // Handle Quick Symptom Click: Selects symptom, queries follow-up, and prepares transition
  const handleToggleSymptom = async (sym: SymptomCardItem) => {
    const isSelected = selectedSymptoms.includes(sym.id);
    const updated = isSelected ? selectedSymptoms.filter((id) => id !== sym.id) : [sym.id];
    setSelectedSymptoms(updated);

    const symptomName = currentLanguage === 'or' ? sym.nameOr : currentLanguage === 'hi' ? sym.nameHi : sym.name;
    const symptomEn = sym.name;
    setInputValue(symptomName);

    // Save answer
    saveDraftAnswer({
      questionId: currentQuestion.id,
      questionText: questionTitle,
      rawVoiceInput: symptomName,
      transcription: symptomName,
      answerValue: symptomName,
      structuredData: {
        chiefComplaint: symptomEn,
        duration: '',
      },
    });

    addDialogueTurn({
      question: questionTitle,
      answerRegional: symptomName,
      answerEnglish: symptomEn,
      category: currentQuestion.category,
    });

    // Query AI for targeted follow-up question
    setIsAiReasoning(true);
    try {
      const reasonRes = await clinicalReasoningService.evaluateClinicalDialogue(
        [
          ...currentDraft.dialogueHistory,
          {
            question: questionTitle,
            answerRegional: symptomName,
            answerEnglish: symptomEn,
            category: currentQuestion.category,
          },
        ],
        currentDraft.patient,
        symptomName,
        symptomEn,
        currentLanguage
      );

      if (reasonRes.status === 'success' && reasonRes.nextQuestion) {
        updateDraftClinicalConsiderations(reasonRes.clinicalConsiderations);
        setQuestions((prev) => {
          const updatedQs = [...prev];
          const nextIndex = currentIndex + 1;
          const newQ: ClinicalQuestion = {
            id: reasonRes.nextQuestion.id,
            stepNumber: nextIndex + 1,
            category: reasonRes.nextQuestion.category,
            type: reasonRes.nextQuestion.type,
            textEn: reasonRes.nextQuestion.textEn,
            textOr: reasonRes.nextQuestion.textOr,
            textHi: reasonRes.nextQuestion.textHi,
            textRegional: reasonRes.nextQuestion.textRegional,
            placeholderRegional: reasonRes.nextQuestion.placeholderRegional,
            options: reasonRes.nextQuestion.options,
            placeholderEn: reasonRes.nextQuestion.placeholderEn,
            placeholderOr: reasonRes.nextQuestion.placeholderOr,
            placeholderHi: reasonRes.nextQuestion.placeholderHi,
          };
          if (nextIndex < updatedQs.length) {
            updatedQs[nextIndex] = newQ;
          } else {
            updatedQs.push(newQ);
          }
          return updatedQs;
        });

        // Prefetch audio in background so follow-up question plays with 0ms delay
        const prefetchText =
          currentLanguage === 'or'
            ? (reasonRes.nextQuestion.textOr || reasonRes.nextQuestion.textEn)
            : currentLanguage === 'hi'
            ? (reasonRes.nextQuestion.textHi || reasonRes.nextQuestion.textEn)
            : currentLanguage === 'en'
            ? reasonRes.nextQuestion.textEn
            : (reasonRes.nextQuestion.textRegional || reasonRes.nextQuestion.textEn);
        if (prefetchText) {
          ttsService.prefetch(prefetchText, currentLanguage);
        }
      }
    } finally {
      setIsAiReasoning(false);
    }
  };

  const handleSkipQuestion = () => {
    ttsService.stop();
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    voiceService.cancelRecording();

    if (!inputValue && selectedSymptoms.length === 0) {
      saveDraftAnswer({
        questionId: currentQuestion.id,
        questionText: questionTitle,
        answerValue: currentLanguage === 'or' ? 'ଛାଡ଼ିଦିଆଗଲା' : 'Skipped',
      });
    }

    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentQuestionIndex(nextIdx);
    } else {
      onNext();
    }
  };

  const handleConfirmAnswer = () => {
    ttsService.stop();
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    voiceService.cancelRecording();

    const finalVal =
      currentQuestion.type === 'multi-select'
        ? selectedMulti.join(', ') || 'None'
        : inputValue || (selectedSymptoms.length > 0 ? selectedSymptoms.join(', ') : 'Reported');

    const answerObj: IntakeAnswer = {
      questionId: currentQuestion.id,
      questionText: questionTitle,
      rawVoiceInput: voiceDetails?.regional,
      transcription: voiceDetails?.regional,
      answerValue: finalVal,
      structuredData: voiceDetails?.regional
        ? {
            chiefComplaint: voiceDetails.english,
            duration: '',
            severity: '',
          }
        : undefined,
    };

    saveDraftAnswer(answerObj);

    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentQuestionIndex(nextIdx);
    } else {
      onNext();
    }
  };

  const handlePrevQuestion = () => {
    ttsService.stop();
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    voiceService.cancelRecording();

    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentQuestionIndex(prevIdx);
    } else {
      onBack();
    }
  };

  const toggleMultiSelect = (option: string) => {
    if (selectedMulti.includes(option)) {
      setSelectedMulti(selectedMulti.filter((o) => o !== option));
    } else {
      setSelectedMulti([...selectedMulti, option]);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* ========================================================= */}
      {/* 1. HERO BANNER: Localized Clinic Photography & Header     */}
      {/* ========================================================= */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-[28px] overflow-hidden border border-[#D8E3DC] shadow-sm bg-gradient-to-r from-[#F6F8F5] via-[#F6F8F5]/90 to-[#E8F2EC]/40 min-h-[175px] sm:min-h-[200px] flex items-center p-6 sm:p-8"
      >
        <div 
          className="absolute inset-y-0 right-0 w-1/2 sm:w-7/12 pointer-events-none select-none opacity-30 sm:opacity-40 mix-blend-multiply bg-cover bg-right"
          style={{
            backgroundImage: `url('/assets/kiosk_hero_banner.jpg')`,
            maskImage: 'linear-gradient(to right, transparent, black 40%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 40%)',
          }}
        />

        <div className="absolute top-4 right-28 hidden md:block text-right pointer-events-none">
          <p className="text-sm font-semibold text-[#3D5A52]/70 leading-snug">
            {currentLanguage === 'or' ? 'ଉନ୍ନତ ଚିକିତ୍ସା\nସୁସ୍ଥ ଜୀବନ' : 'Better Care\nBrighter Lives'}
          </p>
        </div>

        <div className="absolute top-4 right-6 hidden lg:flex items-center space-x-1.5 text-xs font-semibold text-[#144E44]/80 pointer-events-none bg-white/70 backdrop-blur-xs px-3 py-1.5 rounded-full border border-white/60">
          <BotanicalLeafWatermark size={18} className="text-[#144E44]" />
          <span>{currentLanguage === 'or' ? 'ରୋଗୀଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ପ୍ରଥମ' : 'Patient First Always'}</span>
        </div>

        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="flex items-center space-x-2">
            <span className="text-lg sm:text-xl font-medium text-[#2C4A42]">
              {currentLanguage === 'or' ? 'ସ୍ୱାଗତମ୍' : currentLanguage === 'hi' ? 'स्वागत है' : 'Welcome to'}
            </span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#0D3B36] tracking-tight font-['Plus_Jakarta_Sans','Manrope']">
            MediKiok
          </h2>

          <p className="text-sm sm:text-base font-semibold text-[#245B4E]">
            {t('bannerSubtitle', currentLanguage)}
          </p>

          <p className="text-xs sm:text-sm text-[#5B736B] leading-relaxed max-w-xl pt-1">
            {t('bannerDesc', currentLanguage)}
          </p>
        </div>
      </motion.div>

      {/* ========================================================= */}
      {/* 2. MAIN INTERACTIVE CARD: Questions, Symptoms & Voice      */}
      {/* ========================================================= */}
      <motion.div
        key={currentQuestion.id}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-white/95 backdrop-blur-sm rounded-[28px] border border-[#D8E3DC] shadow-[0_12px_32px_-8px_rgba(13,59,54,0.06)] p-6 sm:p-8 space-y-7"
      >
        {/* Card Header: Shows localized questionTitle! */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8EFEA] pb-5">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#E5F3EB] text-[#0D3B36] flex items-center justify-center shrink-0 shadow-xs">
              <Stethoscope className="w-6 h-6 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center space-x-2 text-xs font-bold text-[#145A4D] uppercase tracking-wider mb-1">
                <span>{`Question ${currentIndex + 1} of ${questions.length}`}</span>
                <span className="text-[#B0C7BD]">•</span>
                <span>{currentQuestion.category}</span>
                {isAiReasoning && (
                  <span className="flex items-center space-x-1 text-[#0D3B36] bg-[#E5F3EB] px-2 py-0.5 rounded-full text-[10px] animate-pulse">
                    <Sparkles className="w-3 h-3" />
                    <span>AI Reasoning...</span>
                  </span>
                )}
              </div>
              <h3 className="font-['Plus_Jakarta_Sans','Manrope'] text-xl sm:text-2xl font-extrabold text-[#142B25] tracking-tight">
                {questionTitle}
              </h3>
              <p className="text-xs sm:text-sm text-[#667E75] font-medium mt-0.5">
                {t('questionHint', currentLanguage)}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Auto Voice Readout Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !autoVoice;
                setAutoVoice(next);
                if (!next) {
                  ttsService.stop();
                  voiceService.cancelRecording();
                  setVoiceState('READY_TO_LISTEN');
                }
              }}
              className={`px-3.5 py-1.5 rounded-full border text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                autoVoice
                  ? 'bg-[#E5F3EB] text-[#0D3B36] border-[#0D3B36]/20 shadow-xs'
                  : 'bg-[#F2F5F3] text-[#5B6560] border-[#D1DDD6]'
              }`}
              title="Toggle automatic question readout"
            >
              {autoVoice ? <Volume2 className="w-3.5 h-3.5 text-[#0D3B36]" /> : <VolumeX className="w-3.5 h-3.5 text-[#5B6560]" />}
              <span>{autoVoice ? t('voiceGuideOn', currentLanguage) : t('voiceGuideOff', currentLanguage)}</span>
            </button>

            {/* Repeat Audio Button */}
            <button
              type="button"
              onClick={handleReplayQuestion}
              disabled={voiceState === 'PROCESSING'}
              className="p-2 rounded-full bg-[#F2F5F3] hover:bg-[#E8F2EC] text-[#0D3B36] border border-[#D1DDD6] transition-all cursor-pointer"
              title="Replay Audio in selected language"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Common Symptoms Pill Badge */}
            <div className="px-3.5 py-1.5 rounded-full bg-[#EFF5F1] text-[#145A4D] border border-[#D5E4DB] text-xs font-bold flex items-center space-x-1.5">
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{t('commonSymptoms', currentLanguage)}</span>
            </div>
          </div>
        </div>

        {/* 8 Common Symptoms Grid (Active on Chief Concern) */}
        {currentIndex === 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {COMMON_SYMPTOMS.map((sym) => {
              const isSelected = selectedSymptoms.includes(sym.id) || inputValue.includes(sym.nameOr) || inputValue.includes(sym.name);
              const Icon = sym.icon;

              return (
                <button
                  key={sym.id}
                  type="button"
                  onClick={() => handleToggleSymptom(sym)}
                  className={`relative p-4 sm:p-5 rounded-2xl border-2 transition-all flex flex-col items-center justify-center space-y-2 text-center cursor-pointer group active:scale-[0.98] ${
                    sym.bg
                  } ${
                    isSelected
                      ? `${sym.border} ring-3 ${sym.ring} shadow-sm -translate-y-0.5`
                      : 'border-transparent hover:border-[#D5E4DB] hover:shadow-xs'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#145A4D] text-white flex items-center justify-center shadow-xs">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}

                  <div className="w-10 h-10 flex items-center justify-center transition-transform group-hover:scale-110">
                    <Icon size={32} />
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-xs sm:text-sm font-bold text-[#142B25] block">
                      {getSymptomName(sym.id, currentLanguage)}
                    </span>
                    <span className="text-[10px] text-[#6B857C] font-semibold block">
                      {sym.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Prominent Recorded Answer Banner if user has spoken or answered */}
        {inputValue && (
          <div className="p-4 rounded-2xl bg-[#E8F5EE] border-2 border-[#1B6B5D] text-[#0D3B36] flex items-center justify-between shadow-xs">
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#145A4D] flex items-center space-x-1">
                <Check className="w-3.5 h-3.5 stroke-[3] text-[#145A4D]" />
                <span>{t('yourAnswerHeader', currentLanguage)}</span>
              </span>
              <p className="text-base sm:text-lg font-extrabold text-[#0D3B36]">
                "{inputValue}"
              </p>
              {voiceDetails?.english && voiceDetails.english !== inputValue && (
                <p className="text-xs text-[#0F766E] font-medium">
                  Clinical Translation: {voiceDetails.english}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleResetRecord}
              className="text-xs text-red-600 hover:text-red-700 font-bold px-3 py-1.5 rounded-full hover:bg-red-50 border border-transparent hover:border-red-200 transition-all cursor-pointer"
            >
              {currentLanguage === 'or' ? 'ପରିବର୍ତ୍ତନ କରନ୍ତୁ' : 'Clear'}
            </button>
          </div>
        )}

        {/* Prominent YES / NO Selection Cards for Yes-No Questions */}
        {currentQuestion.type === 'yes-no' && (
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => {
                setInputValue('Yes');
                saveDraftAnswer({
                  questionId: currentQuestion.id,
                  questionText: questionTitle,
                  answerValue: 'Yes',
                });
              }}
              className={`h-20 rounded-2xl border-2 text-base sm:text-lg font-extrabold flex items-center justify-center space-x-3 transition-all cursor-pointer ${
                inputValue === 'Yes' || inputValue.toLowerCase() === 'yes' || inputValue.includes('ହଁ') || inputValue.includes('हाँ')
                  ? 'bg-[#145A4D] text-white border-[#145A4D] shadow-lg ring-4 ring-[#145A4D]/25 scale-[1.01]'
                  : 'bg-[#F8FAF7] text-[#142B25] border-[#D5E4DB] hover:border-[#145A4D] hover:bg-white'
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                inputValue === 'Yes' || inputValue.toLowerCase() === 'yes' || inputValue.includes('ହଁ') || inputValue.includes('हाँ')
                  ? 'bg-white text-[#145A4D]'
                  : 'border border-[#98AFA5] text-[#98AFA5]'
              }`}>
                <Check className="w-4 h-4 stroke-[3]" />
              </div>
              <div className="text-left">
                <span className="block leading-tight">{t('yesBtn', currentLanguage)}</span>
                <span className="text-[10px] font-semibold opacity-75 block">{t('yesSub', currentLanguage)}</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setInputValue('No');
                saveDraftAnswer({
                  questionId: currentQuestion.id,
                  questionText: questionTitle,
                  answerValue: 'No',
                });
              }}
              className={`h-20 rounded-2xl border-2 text-base sm:text-lg font-extrabold flex items-center justify-center space-x-3 transition-all cursor-pointer ${
                inputValue === 'No' || inputValue.toLowerCase() === 'no' || inputValue.includes('ନା') || inputValue.includes('नहीं')
                  ? 'bg-[#145A4D] text-white border-[#145A4D] shadow-lg ring-4 ring-[#145A4D]/25 scale-[1.01]'
                  : 'bg-[#F8FAF7] text-[#142B25] border-[#D5E4DB] hover:border-[#145A4D] hover:bg-white'
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                inputValue === 'No' || inputValue.toLowerCase() === 'no' || inputValue.includes('ନା') || inputValue.includes('नहीं')
                  ? 'bg-white text-[#145A4D]'
                  : 'border border-[#98AFA5] text-[#98AFA5]'
              }`}>
                <Check className="w-4 h-4 stroke-[3]" />
              </div>
              <div className="text-left">
                <span className="block leading-tight">{t('noBtn', currentLanguage)}</span>
                <span className="text-[10px] font-semibold opacity-75 block">{t('noSub', currentLanguage)}</span>
              </div>
            </button>
          </div>
        )}

        {/* Input Mode Selector Tabs: [🎤 Speak], [⌨️ Type], [👆 Touch Select] */}
        <div className="flex items-center justify-center pt-1">
          <div className="inline-flex p-1.5 bg-[#EFF3F0] rounded-full border border-[#D5E4DB] max-w-full">
            <button
              type="button"
              onClick={() => setInputMode('speak')}
              className={`px-5 sm:px-7 py-2.5 rounded-full text-xs sm:text-sm font-bold flex items-center space-x-2 transition-all cursor-pointer ${
                inputMode === 'speak'
                  ? 'bg-[#124E43] text-white shadow-md'
                  : 'text-[#4A645C] hover:text-[#142B25]'
              }`}
            >
              <Mic className="w-4 h-4" />
              <div className="text-left leading-tight">
                <span className="block">{t('speakButtonTitle', currentLanguage)}</span>
                <span className="text-[9px] font-normal opacity-80 hidden sm:block">
                  {t('speakButtonSub', currentLanguage)}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setInputMode('type')}
              className={`px-5 sm:px-7 py-2.5 rounded-full text-xs sm:text-sm font-bold flex items-center space-x-2 transition-all cursor-pointer ${
                inputMode === 'type'
                  ? 'bg-[#124E43] text-white shadow-md'
                  : 'text-[#4A645C] hover:text-[#142B25]'
              }`}
            >
              <Keyboard className="w-4 h-4" />
              <div className="text-left leading-tight">
                <span className="block">{t('typeButtonTitle', currentLanguage)}</span>
                <span className="text-[9px] font-normal opacity-80 hidden sm:block">
                  {t('typeButtonSub', currentLanguage)}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setInputMode('touch')}
              className={`px-5 sm:px-7 py-2.5 rounded-full text-xs sm:text-sm font-bold flex items-center space-x-2 transition-all cursor-pointer ${
                inputMode === 'touch'
                  ? 'bg-[#124E43] text-white shadow-md'
                  : 'text-[#4A645C] hover:text-[#142B25]'
              }`}
            >
              <HandMetal className="w-4 h-4" />
              <div className="text-left leading-tight">
                <span className="block">{t('selectButtonTitle', currentLanguage)}</span>
                <span className="text-[9px] font-normal opacity-80 hidden sm:block">
                  {t('selectButtonSub', currentLanguage)}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Dynamic Mode Area: Voice Waveform / Type Input / Touch Choices */}
        <div className="pt-2">
          {/* TAB 1: SPEAK MODE (Waveform & Circular Mic Button) */}
          {inputMode === 'speak' && (
            <div className="flex flex-col items-center justify-center space-y-4 py-5 px-4 bg-[#F8FAF7] rounded-3xl border border-[#DCE6DF]">
              
              {/* Sound Waveform Visualization */}
              <div className="flex items-center justify-center space-x-1 sm:space-x-1.5 h-10 w-full max-w-md">
                {[6, 12, 18, 28, 36, 22, 14, 32, 40, 30, 16, 26, 38, 24, 18, 10, 6].map((baseHeight, idx) => (
                  <span
                    key={idx}
                    className={`w-1 sm:w-1.5 rounded-full transition-all duration-300 ${
                      voiceState === 'RECORDING'
                        ? 'bg-[#2E8474] wave-bar'
                        : voiceState === 'PROCESSING'
                        ? 'bg-[#D97706] animate-pulse'
                        : 'bg-[#B0C7BD]'
                    }`}
                    style={{
                      height: voiceState === 'RECORDING' ? `${baseHeight}px` : '10px',
                    }}
                  />
                ))}
              </div>

              {/* Status Label in Selected Language */}
              <div className="text-center">
                <p className="text-sm font-bold text-[#142B25]">
                  {voiceState === 'RECORDING' && (currentLanguage === 'or' ? 'ଶୁଣୁଛି... ଆପଣଙ୍କ ଉତ୍ତର କୁହନ୍ତୁ (Listening...)' : currentLanguage === 'hi' ? 'सुन रहा हूँ... बोलिए (Listening...)' : 'Listening... (Speak your symptoms)')}
                  {voiceState === 'SPEAKING_QUESTION' && (currentLanguage === 'or' ? 'ପ୍ରଶ୍ନ ପଢ଼ାଯାଉଛି...' : currentLanguage === 'hi' ? 'प्रश्न पढ़ा जा रहा है...' : 'Reading Question Aloud...')}
                  {voiceState === 'PROCESSING' && (currentLanguage === 'or' ? 'Sarvam AI ଓ Gemini Flash ମାଧ୍ୟମରେ ବିଶ୍ଳେଷଣ ଚାଲିଛି...' : 'Transcribing with Sarvam Saaras v4 + Gemini Flash...')}
                  {voiceState === 'ANSWER_RECEIVED' && (currentLanguage === 'or' ? 'ଉତ୍ତର ଗ୍ରହଣ ହେଲା ✓' : 'Answer Received ✓')}
                  {voiceState === 'EMPTY' && (currentLanguage === 'or' ? 'କିଛି ଶୁଭିଲା ନାହିଁ — ପୁଣି ଥରେ କୁହନ୍ତୁ' : 'No speech detected — Tap to speak again')}
                  {voiceState === 'ERROR' && (currentLanguage === 'or' ? 'ସେବା ତ୍ରୁଟି — ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ କିମ୍ବା ଟାଇପ୍ କରନ୍ତୁ' : 'Voice service error — Please retry or type')}
                  {voiceState === 'DENIED' && (currentLanguage === 'or' ? 'ମାଇକ୍ରୋଫୋନ୍ ଅନୁମତି ଆବଶ୍ୟକ' : 'Microphone permission required')}
                  {voiceState === 'READY_TO_LISTEN' && (currentLanguage === 'or' ? 'ମାଇକ୍ରୋଫୋନ୍ ପ୍ରସ୍ତୁତ — କହିବା ପାଇଁ ଟ୍ୟାପ୍ କରନ୍ତୁ' : 'Microphone Ready — Tap below to speak')}
                  {voiceState === 'QUESTION_DISPLAY' && (currentLanguage === 'or' ? 'କହିବା ପାଇଁ ମାଇକ୍ରୋଫୋନ୍ ଦବାନ୍ତୁ' : 'Tap the microphone to speak your answer')}
                </p>
                <p className="text-xs text-[#6B857C] mt-0.5">
                  {currentLanguage === 'or' ? 'ଓଡ଼ିଆ, ହିନ୍ଦୀ ଏବଂ ଇଂରାଜୀ ଭାଷାରେ ସ୍ୱର ଗ୍ରହଣ କରାଯାଏ' : 'Supported in Odia (ଓଡ଼ିଆ), Hindi (हिन्दी), and English'}
                </p>
                {voiceState === 'DENIED' && (
                  <button
                    type="button"
                    onClick={handleReplayQuestion}
                    className="mt-2.5 inline-flex items-center space-x-1.5 px-4 py-2 bg-[#BA1A1A] hover:bg-[#9B1414] text-white text-xs font-bold rounded-full shadow-md cursor-pointer transition-all active:scale-95"
                  >
                    <Mic className="w-4 h-4" />
                    <span>
                      {currentLanguage === 'or'
                        ? 'ମାଇକ୍ରୋଫୋନ୍ ଅନୁମତି ଦିଅନ୍ତୁ ଓ ପ୍ରଶ୍ନ ଶୁଣନ୍ତୁ'
                        : currentLanguage === 'hi'
                        ? 'माइक्रोफ़ोन अनुमति दें और प्रश्न सुनें'
                        : 'Allow Permission & Hear Question'}
                    </span>
                  </button>
                )}
              </div>

              {/* Circular Big Mic Action Button */}
              <div className="relative py-2 flex items-center justify-center">
                {voiceState === 'RECORDING' && (
                  <span className="absolute w-24 h-24 rounded-full bg-[#2E8474]/20 animate-ping" />
                )}

                <button
                  type="button"
                  onClick={handleMicButtonClick}
                  disabled={voiceState === 'PROCESSING'}
                  className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-95 ${
                    voiceState === 'RECORDING'
                      ? 'bg-[#BA1A1A] text-white ring-8 ring-[#BA1A1A]/20 shadow-red-500/20'
                      : voiceState === 'PROCESSING'
                      ? 'bg-[#D97706] text-white'
                      : 'bg-[#2E8474] hover:bg-[#1E695B] text-white ring-8 ring-[#2E8474]/15 hover:scale-105'
                  }`}
                  title={voiceState === 'RECORDING' ? 'Stop Recording' : 'Start Speaking'}
                >
                  {voiceState === 'PROCESSING' ? (
                    <RefreshCw className="w-8 h-8 animate-spin" />
                  ) : (
                    <Mic className="w-8 h-8 stroke-[2.2]" />
                  )}
                </button>
              </div>

              {/* Live Transcript Preview if available */}
              <AnimatePresence>
                {voiceDetails && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="w-full max-w-lg p-4 rounded-2xl bg-white border border-[#D5E4DB] shadow-xs text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between text-[#145A4D] font-bold">
                      <span>{currentLanguage === 'or' ? 'ସ୍ୱୀକୃତ ସ୍ୱର ତଥ୍ୟ (Captured Speech):' : 'Transcribed Voice Input:'}</span>
                      <button
                        type="button"
                        onClick={handleResetRecord}
                        className="text-red-600 hover:underline flex items-center space-x-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{currentLanguage === 'or' ? 'ପରିଷ୍କାର କରନ୍ତୁ' : 'Clear'}</span>
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-[#142B25]">"{voiceDetails.regional}"</p>
                    {voiceDetails.english && (
                      <p className="text-xs text-[#0F766E] border-t border-[#E8EFEA] pt-1.5 font-medium">
                        Clinical Translation: {voiceDetails.english}
                      </p>
                    )}

                    {/* Quick Button to Advance to Follow-up Question */}
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={handleConfirmAnswer}
                        className="px-4 py-1.5 bg-[#124E43] hover:bg-[#0B352E] text-white rounded-full text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
                      >
                        <span>{currentLanguage === 'or' ? 'ପରବର୍ତ୍ତୀ ପ୍ରଶ୍ନ ପଚାରନ୍ତୁ →' : currentLanguage === 'hi' ? 'अगला प्रश्न पूछें →' : 'Ask Follow-up Question →'}</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          )}

          {/* TAB 2: TYPE MODE */}
          {inputMode === 'type' && (
            <div className="space-y-3 p-5 bg-[#F8FAF7] rounded-3xl border border-[#DCE6DF]">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#142B25]">
                {currentLanguage === 'or' ? 'ଆପଣଙ୍କ ସମସ୍ୟା ବିଷୟରେ ଲେଖନ୍ତୁ:' : 'Describe your symptoms in your own words:'}
              </label>
              <div className="relative">
                <textarea
                  rows={3}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={placeholderText || (currentLanguage === 'or' ? 'ଏଠାରେ ଲେଖନ୍ତୁ (ଯଥା: ୩ ଦିନ ହେଲା ଜ୍ୱର ଓ କାଶ)...' : 'Type your symptoms here...')}
                  className="w-full p-4 bg-white border-2 border-[#D5E4DB] rounded-2xl text-sm font-semibold text-[#142B25] focus:outline-none focus:border-[#145A4D] focus:ring-4 focus:ring-[#145A4D]/10 transition-all resize-none"
                />
              </div>
            </div>
          )}

          {/* TAB 3: TOUCH SELECT MODE */}
          {inputMode === 'touch' && (
            <div className="space-y-4 p-5 bg-[#F8FAF7] rounded-3xl border border-[#DCE6DF]">
              {/* If Question is Yes/No */}
              {currentQuestion.type === 'yes-no' && (
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setInputValue('Yes');
                      saveDraftAnswer({
                        questionId: currentQuestion.id,
                        questionText: questionTitle,
                        answerValue: 'Yes',
                      });
                    }}
                    className={`h-16 rounded-2xl border-2 text-base font-extrabold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                      inputValue === 'Yes'
                        ? 'bg-[#145A4D] text-white border-[#145A4D] shadow-md ring-4 ring-[#145A4D]/20'
                        : 'bg-white text-[#142B25] border-[#D5E4DB] hover:border-[#145A4D]'
                    }`}
                  >
                    <Check className={`w-5 h-5 ${inputValue === 'Yes' ? 'opacity-100' : 'opacity-40'}`} />
                    <span>{currentLanguage === 'or' ? 'ହଁ (YES)' : currentLanguage === 'hi' ? 'हाँ (YES)' : 'YES'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInputValue('No');
                      saveDraftAnswer({
                        questionId: currentQuestion.id,
                        questionText: questionTitle,
                        answerValue: 'No',
                      });
                    }}
                    className={`h-16 rounded-2xl border-2 text-base font-extrabold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                      inputValue === 'No'
                        ? 'bg-[#145A4D] text-white border-[#145A4D] shadow-md ring-4 ring-[#145A4D]/20'
                        : 'bg-white text-[#142B25] border-[#D5E4DB] hover:border-[#145A4D]'
                    }`}
                  >
                    <Check className={`w-5 h-5 ${inputValue === 'No' ? 'opacity-100' : 'opacity-40'}`} />
                    <span>{currentLanguage === 'or' ? 'ନାହିଁ (NO)' : currentLanguage === 'hi' ? 'नहीं (NO)' : 'NO'}</span>
                  </button>
                </div>
              )}

              {/* If Question is Multi-Select */}
              {currentQuestion.type === 'multi-select' && currentQuestion.options && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentQuestion.options.map((opt) => {
                    const isChecked = selectedMulti.includes(opt);
                    return (
                      <button
                        type="button"
                        key={opt}
                        onClick={() => toggleMultiSelect(opt)}
                        className={`p-3.5 rounded-xl border text-left font-semibold text-xs sm:text-sm transition-all flex items-center justify-between cursor-pointer ${
                          isChecked
                            ? 'bg-[#E5F3EB] border-[#145A4D] text-[#0D3B36] font-bold'
                            : 'bg-white border-[#D5E4DB] text-[#142B25] hover:border-[#145A4D]'
                        }`}
                      >
                        <span>{opt}</span>
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center ${
                            isChecked ? 'bg-[#145A4D] text-white' : 'border border-[#D1DDD6]'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Quick Preset Buttons for Text Questions */}
              {currentQuestion.type !== 'yes-no' && currentQuestion.type !== 'multi-select' && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#5B736B]">
                    {currentLanguage === 'or' ? 'ଅବଧି / ଗୁରୁତରତା ବାଛନ୍ତୁ:' : 'Select duration / severity:'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { en: '1 day', or: '୧ ଦିନ' },
                      { en: '2-3 days', or: '୨-୩ ଦିନ' },
                      { en: '1 week', or: '୧ ସପ୍ତାହ' },
                      { en: 'Mild', or: 'ସାମାନ୍ୟ' },
                      { en: 'Moderate', or: 'ମଧ୍ୟମ' },
                      { en: 'Severe', or: 'ଗମ୍ଭୀର' },
                    ].map((tag) => (
                      <button
                        type="button"
                        key={tag.en}
                        onClick={() => setInputValue((prev) => (prev ? `${prev}, ${currentLanguage === 'or' ? tag.or : tag.en}` : currentLanguage === 'or' ? tag.or : tag.en))}
                        className="px-3.5 py-1.5 rounded-full bg-white border border-[#D5E4DB] hover:border-[#145A4D] text-xs font-semibold text-[#142B25] shadow-xs cursor-pointer"
                      >
                        + {currentLanguage === 'or' ? tag.or : tag.en}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Gemini Flash Clinical Considerations Preview */}
        {currentDraft.clinicalConsiderations && (
          <div className="p-4 rounded-2xl bg-[#F0F7F4] border border-[#C6DDD2] text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-[#0D3B36] flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-[#0F766E]" />
                <span>{currentLanguage === 'or' ? 'କ୍ଲିନିକାଲ୍ ବିଶ୍ଳେଷଣ ଓ ଆୟୁଷ ତ୍ରିଦୋଷ' : 'AI Clinical Differential & AYUSH Triage'}</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white text-[#0D3B36] border border-[#C6DDD2]">
                {currentDraft.clinicalConsiderations.riskLevel} Priority
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {currentDraft.clinicalConsiderations.primarySuspicions.map((s: string, idx: number) => (
                <span key={idx} className="px-2 py-0.5 rounded-md bg-white border border-[#D5E4DB] text-[#0D3B36] font-semibold text-[11px]">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Navigation Buttons: [Back], [Skip], and [Next / Confirm] */}
        <div className="flex items-center justify-between pt-4 border-t border-[#E8EFEA] gap-3">
          <button
            type="button"
            onClick={handlePrevQuestion}
            className="h-14 px-7 bg-white hover:bg-[#F2F5F3] text-[#142B25] font-bold text-sm rounded-full border border-[#D1DDD6] shadow-xs flex items-center space-x-2 transition-all cursor-pointer active:scale-98"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('backBtn', currentLanguage)}</span>
          </button>

          <div className="flex items-center space-x-3">
            {currentIndex < questions.length - 1 && (
              <button
                type="button"
                onClick={handleSkipQuestion}
                className="h-14 px-6 bg-[#F2F5F3] hover:bg-[#E6EFE9] text-[#3D5A52] hover:text-[#0D3B36] font-bold text-sm rounded-full border border-[#D1DDD6] shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer active:scale-98"
              >
                <span>{t('skipBtn', currentLanguage)}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleConfirmAnswer}
              className="h-14 px-8 sm:px-9 bg-[#124E43] hover:bg-[#0B352E] text-white font-['Plus_Jakarta_Sans','Manrope'] font-bold text-sm sm:text-base rounded-full shadow-md hover:shadow-lg flex items-center space-x-2 transition-all cursor-pointer group active:scale-98"
            >
              <span>
                {currentIndex === questions.length - 1
                  ? t('continueBtn', currentLanguage)
                  : t('nextBtn', currentLanguage)}
              </span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>

      </motion.div>

    </div>
  );
};
