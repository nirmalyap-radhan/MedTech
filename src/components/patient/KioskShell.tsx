import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SUPPORTED_LANGUAGES, getLanguageLabel } from '../../types';
import { t, type TranslationStrings } from '../../utils/i18n';
import { 
  Home, 
  User, 
  Stethoscope, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Globe, 
  ShieldCheck, 
  Lightbulb, 
  ChevronDown,
  Volume2,
  VolumeX,
  Stethoscope as DoctorIcon,
  Check
} from 'lucide-react';
import { MediKiokLogo, BotanicalLeafWatermark } from '../common/MedicalIcons';

interface KioskShellProps {
  currentView: string;
  onNavigate: (view: string) => void;
  children: React.ReactNode;
  activeStepNumber?: number;
  totalSteps?: number;
}

interface StepItem {
  id: string;
  stepNumber: number;
  view: string;
  titleEn: string;
  titleOr: string;
  titleHi: string;
  subtitleEn: string;
  subtitleOr: string;
  subtitleHi: string;
  titleKey: keyof TranslationStrings;
  subKey: keyof TranslationStrings;
  icon: React.ComponentType<{ className?: string }>;
}

const KIOSK_STEPS: StepItem[] = [
  {
    id: 'welcome',
    stepNumber: 1,
    view: 'patient-welcome',
    titleEn: 'Welcome',
    titleOr: 'ସ୍ୱାଗତମ୍',
    titleHi: 'स्वागत',
    subtitleEn: 'Get Started',
    subtitleOr: 'ଆରମ୍ଭ କରନ୍ତୁ',
    subtitleHi: 'शुरू करें',
    titleKey: 'stepWelcome',
    subKey: 'stepWelcomeSub',
    icon: Home,
  },
  {
    id: 'details',
    stepNumber: 2,
    view: 'patient-register',
    titleEn: 'Patient Details',
    titleOr: 'ରୋଗୀ ବିବରଣୀ',
    titleHi: 'रोगी विवरण',
    subtitleEn: 'Basic Information',
    subtitleOr: 'ମୌଳିକ ସୂଚନା',
    subtitleHi: 'मूल जानकारी',
    titleKey: 'stepPatientDetails',
    subKey: 'stepPatientDetailsSub',
    icon: User,
  },
  {
    id: 'symptoms',
    stepNumber: 3,
    view: 'patient-intake',
    titleEn: 'Symptoms & History',
    titleOr: 'ଲକ୍ଷଣ ଓ ଇତିହାସ',
    titleHi: 'लक्षण और इतिहास',
    subtitleEn: 'Current & Past',
    subtitleOr: 'ବର୍ତ୍ତମାନ ଓ ପୂର୍ବ',
    subtitleHi: 'वर्तमान और पिछला',
    titleKey: 'stepSymptoms',
    subKey: 'stepSymptomsSub',
    icon: Stethoscope,
  },
  {
    id: 'documents',
    stepNumber: 4,
    view: 'patient-documents',
    titleEn: 'Documents',
    titleOr: 'ଦସ୍ତାବିଜ୍ ସ୍କାନ',
    titleHi: 'दस्तावेज़',
    subtitleEn: 'Upload Reports',
    subtitleOr: 'ରିପୋର୍ଟ ଅପଲୋଡ଼',
    subtitleHi: 'रिपोर्ट अपलोड',
    titleKey: 'stepPrescription',
    subKey: 'stepPrescriptionSub',
    icon: FileText,
  },
  {
    id: 'ayush',
    stepNumber: 5,
    view: 'patient-ayush',
    titleEn: 'AYUSH Assessment',
    titleOr: 'ଆୟୁଷ ଆକଳନ',
    titleHi: 'आयुष मूल्यांकन',
    subtitleEn: 'Dashavidha Pariksha',
    subtitleOr: 'ଦଶବିଧ ପରୀକ୍ଷା',
    subtitleHi: 'दशविद परीक्षा',
    titleKey: 'stepAyush',
    subKey: 'stepAyushSub',
    icon: Sparkles,
  },
  {
    id: 'review',
    stepNumber: 6,
    view: 'patient-review',
    titleEn: 'Review & Confirm',
    titleOr: 'ଯାଞ୍ଚ ଓ ଦାଖଲ',
    titleHi: 'समीक्षा और पुष्टि',
    subtitleEn: 'Check & Submit',
    subtitleOr: 'ଯାଞ୍ଚ କରନ୍ତୁ',
    subtitleHi: 'जांचें और भेजें',
    titleKey: 'stepReview',
    subKey: 'stepReviewSub',
    icon: CheckCircle2,
  },
];

export const KioskShell: React.FC<KioskShellProps> = ({
  currentView,
  onNavigate,
  children,
}) => {
  const { currentLanguage, setLanguage } = useApp();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [audioAssist, setAudioAssist] = useState(true);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  // Live real-time clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const getCurrentStepIndex = (): number => {
    switch (currentView) {
      case 'patient-welcome':
        return 1;
      case 'patient-register':
      case 'patient-language':
        return 2;
      case 'patient-intake':
        return 3;
      case 'patient-documents':
        return 4;
      case 'patient-ayush':
        return 5;
      case 'patient-review':
        return 6;
      default:
        return 1;
    }
  };

  const activeStep = getCurrentStepIndex();
  const clinicalStep = Math.max(1, Math.min(5, activeStep - 1));
  const progressPercent = Math.round((clinicalStep / 5) * 100);

  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="min-h-screen bg-[#F6F8F5] text-[#142B25] flex flex-col font-['Plus_Jakarta_Sans',sans-serif] selection:bg-[#0D3B36]/15">
      <div className="flex-1 flex flex-col lg:flex-row w-full max-w-[1720px] mx-auto min-h-screen">
        
        {/* ========================================================= */}
        {/* LEFT SIDEBAR: Deep Medical Teal Gradient with Navigation  */}
        {/* ========================================================= */}
        <aside className="w-full lg:w-72 xl:w-80 bg-gradient-to-b from-[#0D3B36] via-[#092B26] to-[#061E1A] text-white flex flex-col justify-between p-5 sm:p-6 shrink-0 relative overflow-hidden shadow-2xl z-20">
          
          <div className="absolute -bottom-10 -left-10 text-[#144E44]/40 pointer-events-none select-none">
            <BotanicalLeafWatermark size={260} />
          </div>

          <div className="space-y-7 relative z-10">
            {/* Logo and Application Header */}
            <div 
              onClick={() => onNavigate('patient-welcome')}
              className="flex items-center space-x-3.5 cursor-pointer group select-none"
            >
              <div className="transition-transform group-hover:scale-105">
                <MediKiokLogo size={42} />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-white font-['Plus_Jakarta_Sans','Manrope']">
                  MediKiok
                </h1>
                <p className="text-[11px] font-semibold text-[#86EFAC] tracking-wide uppercase">
                  {t('appTitle', currentLanguage)}
                </p>
              </div>
            </div>

            {/* Stepper Navigation List */}
            <nav className="space-y-1.5 pt-2">
              {KIOSK_STEPS.map((step) => {
                const isCurrent = step.stepNumber === activeStep;
                const isCompleted = step.stepNumber < activeStep;
                const IconComponent = step.icon;

                const stepTitle = t(step.titleKey, currentLanguage);
                const stepSubtitle = t(step.subKey, currentLanguage);

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => onNavigate(step.view)}
                    className={`w-full text-left rounded-2xl p-3 sm:p-3.5 flex items-center space-x-3.5 transition-all cursor-pointer group ${
                      isCurrent
                        ? 'bg-white/15 text-white shadow-lg backdrop-blur-md border border-white/20'
                        : isCompleted
                        ? 'text-white/85 hover:bg-white/8 hover:text-white'
                        : 'text-white/55 hover:bg-white/5 hover:text-white/80'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                        isCurrent
                          ? 'bg-[#186A5B] text-white shadow-sm ring-2 ring-[#86EFAC]/40'
                          : isCompleted
                          ? 'bg-[#10443B] text-[#86EFAC] border border-[#1C5F53]'
                          : 'bg-white/5 text-white/50 border border-white/10 group-hover:border-white/20'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="w-5 h-5 stroke-[2.8]" />
                      ) : (
                        <IconComponent className="w-5 h-5" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-bold truncate ${isCurrent ? 'text-white font-extrabold' : ''}`}>
                          {stepTitle}
                        </span>
                        {isCurrent && (
                          <span className="w-2 h-2 rounded-full bg-[#86EFAC] animate-pulse shrink-0 ml-1.5" />
                        )}
                      </div>
                      <p className={`text-[11px] truncate ${isCurrent ? 'text-[#A3E5C7]' : 'text-white/45'}`}>
                        {stepSubtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom Sidebar Info & Slogan */}
          <div className="pt-6 relative z-10 border-t border-white/10 space-y-4">
            <div>
              <p className="text-xs italic text-white/75 font-medium leading-relaxed">
                {t('tagline', currentLanguage)}
              </p>
              <div className="w-16 h-1 bg-gradient-to-r from-[#86EFAC] to-transparent rounded-full mt-2" />
            </div>

            <div className="flex items-center justify-between text-[11px] text-white/50 pt-1">
              <span>Version 1.0.0</span>
              <button
                type="button"
                onClick={() => onNavigate('doctor-login')}
                className="flex items-center space-x-1 text-white/70 hover:text-[#86EFAC] transition-colors cursor-pointer"
                title="Switch to Doctor Workstation"
              >
                <DoctorIcon className="w-3.5 h-3.5" />
                <span className="font-semibold underline decoration-white/30">
                  {t('doctorPortal', currentLanguage)}
                </span>
              </button>
            </div>
          </div>
        </aside>

        {/* ========================================================= */}
        {/* MAIN WORKSPACE & RIGHT SUPPORT COLUMN                     */}
        {/* ========================================================= */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#F6F8F5]">
          
          {/* Top Bar: Language Selector & Clock */}
          <header className="px-5 sm:px-8 py-4 flex items-center justify-between gap-4 border-b border-[#D8E3DC]/60 bg-[#F6F8F5]/80 backdrop-blur-md sticky top-0 z-30">
            {/* Left: Language Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="h-10 px-4 bg-white/90 hover:bg-white text-[#142B25] border border-[#D5DFD8] rounded-full shadow-xs flex items-center space-x-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer active:scale-98"
              >
                <Globe className="w-4 h-4 text-[#0F766E]" />
                <span className="font-bold">
                  {getLanguageLabel(currentLanguage)}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#5B736B]" />
              </button>

              {langMenuOpen && (
                <div className="absolute top-12 left-0 w-56 max-h-72 overflow-y-auto bg-white rounded-2xl shadow-xl border border-[#D5DFD8] py-2 z-50 animate-in fade-in zoom-in-95">
                  {SUPPORTED_LANGUAGES.map((lang) => {
                    const isSelected = currentLanguage === lang.code;
                    const label = lang.code === 'en' ? 'English' : `${lang.nameNative} (${lang.nameEn})`;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          setLanguage(lang.code);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-xs font-bold flex items-center justify-between hover:bg-[#E8F2EC] cursor-pointer ${
                          isSelected ? 'text-[#0D3B36] bg-[#E8F2EC]/60' : 'text-[#142B25]'
                        }`}
                      >
                        <span>{label}</span>
                        {isSelected && <Check className="w-4 h-4 text-[#0D3B36] stroke-[2.5]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Audio Toggle & Live Date/Time Badge */}
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setAudioAssist(!audioAssist)}
                className="hidden sm:flex items-center space-x-1.5 h-10 px-3.5 bg-white/80 hover:bg-white text-[#142B25] border border-[#D5DFD8] rounded-full text-xs font-semibold shadow-xs transition-all cursor-pointer"
                title="Toggle Voice Prompts"
              >
                {audioAssist ? (
                  <Volume2 className="w-4 h-4 text-[#0F766E]" />
                ) : (
                  <VolumeX className="w-4 h-4 text-[#5B736B]" />
                )}
                <span>
                  {audioAssist
                    ? (currentLanguage === 'or' ? 'ଅଡିଓ: ଅନ୍' : 'Audio: ON')
                    : (currentLanguage === 'or' ? 'ଅଡିଓ: ଅଫ୍' : 'Audio: OFF')}
                </span>
              </button>

              <div className="h-10 px-4 bg-white/90 text-[#142B25] border border-[#D5DFD8] rounded-full shadow-xs flex items-center space-x-2 text-xs sm:text-sm font-semibold">
                <Clock className="w-4 h-4 text-[#0F766E]" />
                <span>{currentTime || '10:24 AM'}</span>
                <span className="text-[#A4B5AC]">•</span>
                <span className="text-[#5B736B] font-medium hidden sm:inline">
                  {currentDate || 'Thu, 25 Sep 2026'}
                </span>
              </div>
            </div>
          </header>

          {/* Body Columns: Center Content + Right Support Panel */}
          <div className="flex-1 flex flex-col xl:flex-row p-4 sm:p-6 lg:p-8 gap-6 max-w-full">
            
            {/* Center Content Area */}
            <main className="flex-1 min-w-0 space-y-6">
              {children}
            </main>

            {/* Right Side Support Panel */}
            <aside className="w-full xl:w-76 shrink-0 space-y-5">
              
              {/* Card 1: "Your Progress" */}
              <div className="bg-white/95 rounded-[24px] border border-[#D8E3DC] p-5 shadow-xs space-y-4">
                <h3 className="font-['Plus_Jakarta_Sans','Manrope'] text-base font-extrabold text-[#142B25]">
                  {t('yourProgress', currentLanguage)}
                </h3>

                <div className="flex items-center justify-center py-2">
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                      <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        stroke="#E8EFEA"
                        strokeWidth="7"
                        fill="transparent"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        stroke="#145A4D"
                        strokeWidth="7"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        fill="transparent"
                        className="transition-all duration-700 ease-out"
                      />
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-xl font-extrabold text-[#142B25] leading-none">
                        {clinicalStep}/5
                      </span>
                      <span className="text-[11px] font-semibold text-[#5B736B] mt-0.5">
                        {progressPercent}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1 border-t border-[#E8EFEA]">
                  {KIOSK_STEPS.filter((s) => s.stepNumber > 1).map((s) => {
                    const isDone = s.stepNumber < activeStep;
                    const isNow = s.stepNumber === activeStep;
                    const sTitle = t(s.titleKey, currentLanguage);

                    return (
                      <div
                        key={s.id}
                        className="flex items-center space-x-2.5 text-xs font-semibold"
                      >
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                            isDone
                              ? 'bg-[#145A4D] text-white'
                              : isNow
                              ? 'border-2 border-[#145A4D] bg-[#E8F2EC] text-[#145A4D]'
                              : 'border border-[#D1DDD6] bg-transparent text-transparent'
                          }`}
                        >
                          {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : isNow ? '•' : ''}
                        </div>
                        <span
                          className={`truncate ${
                            isNow
                              ? 'font-bold text-[#142B25]'
                              : isDone
                              ? 'text-[#415C53]'
                              : 'text-[#84968E]'
                          }`}
                        >
                          {sTitle}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Card 2: "Your Information Matters" */}
              <div className="bg-white/95 rounded-[24px] border border-[#D8E3DC] p-5 shadow-xs space-y-3 relative overflow-hidden">
                <div className="absolute -bottom-6 -right-6 text-[#145A4D]/10 pointer-events-none select-none">
                  <BotanicalLeafWatermark size={120} />
                </div>

                <div className="w-10 h-10 rounded-full bg-[#E5F3EB] text-[#145A4D] flex items-center justify-center">
                  <Lightbulb className="w-5 h-5" />
                </div>

                <h4 className="font-['Plus_Jakarta_Sans','Manrope'] text-sm font-bold text-[#142B25]">
                  {t('infoMattersTitle', currentLanguage)}
                </h4>

                <p className="text-xs text-[#5B736B] leading-relaxed relative z-10">
                  {t('infoMattersSub', currentLanguage)}
                </p>
              </div>

              {/* Footer Trust Badges */}
              <div className="pt-2 flex items-center justify-center space-x-2 text-[11px] font-semibold text-[#668076]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#145A4D]" />
                <span>{t('secureLabel', currentLanguage)}</span>
                <span>•</span>
                <span>{t('privateLabel', currentLanguage)}</span>
                <span>•</span>
                <span>{t('betterCareLabel', currentLanguage)}</span>
              </div>

            </aside>

          </div>

        </div>

      </div>
    </div>
  );
};
