import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SUPPORTED_LANGUAGES, type Language } from '../../types';
import { 
  ShieldCheck, 
  ArrowRight, 
  QrCode, 
  Volume2, 
  CheckCircle2, 
  Mic, 
  FileText, 
  Accessibility,
  HeartPulse
} from 'lucide-react';
import { motion } from 'framer-motion';

interface WelcomeScreenProps {
  onStart: () => void;
  onContinue: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart, onContinue }) => {
  const { currentLanguage, setLanguage } = useApp();
  const [selectedLang, setSelectedLang] = useState<string>(currentLanguage || 'or');
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);

  const handleSelectLanguage = (code: string) => {
    setSelectedLang(code);
    setLanguage(code as Language);
  };

  const playPreviewAudio = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPlayingAudio(code);
    setTimeout(() => setPlayingAudio(null), 1200);
  };

  return (
    <div className="space-y-6">
      
      {/* Hero Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-[28px] overflow-hidden border border-[#D8E3DC] shadow-sm bg-gradient-to-r from-[#F6F8F5] via-[#F6F8F5]/90 to-[#E8F2EC]/40 p-6 sm:p-8 flex items-center min-h-[175px]"
      >
        <div 
          className="absolute inset-y-0 right-0 w-1/2 pointer-events-none select-none opacity-30 mix-blend-multiply bg-cover bg-right"
          style={{
            backgroundImage: `url('/assets/kiosk_hero_banner.jpg')`,
            maskImage: 'linear-gradient(to right, transparent, black 40%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 40%)',
          }}
        />

        <div className="relative z-10 space-y-2 max-w-xl">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 bg-white/80 rounded-full border border-[#D8E3DC] shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-[#145A4D]" />
            <span className="text-[11px] font-bold text-[#145A4D] uppercase tracking-wider">
              Self-Service OPD Check-in Kiosk
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#0D3B36] tracking-tight font-['Plus_Jakarta_Sans','Manrope']">
            Welcome to MediKiok
          </h1>

          <p className="text-xs sm:text-sm text-[#5B736B] leading-relaxed">
            Touch your preferred language below to start your outpatient intake. You can speak your symptoms freely, scan previous prescriptions, and review your AYUSH profile.
          </p>
        </div>
      </motion.div>

      {/* Main Card with Language Grid & Actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white/95 backdrop-blur-sm rounded-[28px] border border-[#D8E3DC] shadow-[0_12px_32px_-8px_rgba(13,59,54,0.06)] p-6 sm:p-8 space-y-7"
      >
        {/* Section Title */}
        <div className="flex items-center justify-between border-b border-[#E8EFEA] pb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#142B25]">
              Select Your Preferred Language (ଆପଣଙ୍କ ଭାଷା ବାଛନ୍ତୁ)
            </h3>
            <p className="text-xs text-[#6B857C] mt-0.5">
              Screen text, voice instructions, and clinical questions will adapt automatically
            </p>
          </div>
          <div className="px-3 py-1 rounded-full bg-[#E5F3EB] text-[#145A4D] text-xs font-bold">
            13 Indic & English Languages
          </div>
        </div>

        {/* 13-Language Touch Selection Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4 max-h-[380px] overflow-y-auto pr-1">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = selectedLang === lang.code;
            return (
              <div
                key={lang.code}
                onClick={() => handleSelectLanguage(lang.code)}
                className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer relative flex flex-col justify-between min-h-[114px] group ${
                  isSelected
                    ? 'bg-[#E8F2EC] border-[#145A4D] shadow-sm ring-3 ring-[#145A4D]/15'
                    : 'bg-[#F8FAF7] border-[#D8E3DC] hover:border-[#145A4D] hover:bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-2xl font-extrabold text-[#142B25] block">
                      {lang.nameNative}
                    </span>
                    <span className="text-xs font-semibold text-[#5B736B] mt-0.5 block">
                      {lang.nameEn}
                    </span>
                  </div>
                  {isSelected ? (
                    <CheckCircle2 className="w-6 h-6 text-[#145A4D] fill-white" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-[#D1DDD6] group-hover:border-[#145A4D]" />
                  )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#D8E3DC]/60">
                  <span className="text-[11px] font-medium text-[#5B736B] truncate pr-1">
                    {lang.sampleVoice}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => playPreviewAudio(lang.code, e)}
                    className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                      playingAudio === lang.code
                        ? 'bg-[#145A4D] text-white animate-pulse'
                        : 'bg-white text-[#145A4D] border border-[#D1DDD6] hover:bg-[#E8F2EC]'
                    }`}
                    title="Hear language preview"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>Audio</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Feature Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
          <div className="bg-[#F8FAF7] p-4 rounded-2xl border border-[#D8E3DC] flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#E5F3EB] text-[#145A4D] flex items-center justify-center shrink-0">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#142B25]">Multimodal Voice Intake</p>
              <p className="text-[11px] text-[#6B857C]">Speak naturally in Odia, Hindi or English</p>
            </div>
          </div>

          <div className="bg-[#F8FAF7] p-4 rounded-2xl border border-[#D8E3DC] flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#E5F3EB] text-[#145A4D] flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#142B25]">Prescription OCR Scanner</p>
              <p className="text-[11px] text-[#6B857C]">Extracts prior medicines and lab values</p>
            </div>
          </div>

          <div className="bg-[#F8FAF7] p-4 rounded-2xl border border-[#D8E3DC] flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#E5F3EB] text-[#145A4D] flex items-center justify-center shrink-0">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#142B25]">AYUSH & Allopathy Triage</p>
              <p className="text-[11px] text-[#6B857C]">Prakriti assessment & instant doctor queue</p>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <button
            type="button"
            onClick={onStart}
            className="h-16 bg-[#124E43] hover:bg-[#0B352E] text-white font-['Plus_Jakarta_Sans','Manrope'] font-bold text-base rounded-full shadow-md hover:shadow-lg flex items-center justify-center space-x-3 transition-all cursor-pointer group active:scale-98"
          >
            <span>Start New Registration</span>
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            <span className="text-xs font-normal text-white/70 ml-1">(~2 mins)</span>
          </button>

          <button
            type="button"
            onClick={onContinue}
            className="h-16 bg-white hover:bg-[#F2F5F3] text-[#142B25] font-['Plus_Jakarta_Sans','Manrope'] font-bold text-sm sm:text-base rounded-full border-2 border-[#D8E3DC] hover:border-[#145A4D] flex items-center justify-center space-x-2.5 transition-all shadow-xs cursor-pointer active:scale-98"
          >
            <QrCode className="w-5 h-5 text-[#145A4D]" />
            <span>Scan QR / Returning Patient Token</span>
          </button>
        </div>

        {/* Accessibility Dock */}
        <div className="pt-4 border-t border-[#E8EFEA] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#6B857C]">
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1 font-semibold text-[#145A4D]">
              <Accessibility className="w-4 h-4" />
              <span>Accessibility:</span>
            </span>
            <span className="cursor-pointer hover:underline">Large Font</span>
            <span className="text-[#D8E3DC]">•</span>
            <span className="cursor-pointer hover:underline">High Contrast</span>
            <span className="text-[#D8E3DC]">•</span>
            <span className="cursor-pointer hover:underline">Voice Guide</span>
          </div>

          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-[#145A4D]" />
            <span className="font-bold text-[#142B25]">ABHA / ABDM Compliant</span>
          </div>
        </div>

      </motion.div>

    </div>
  );
};
