import React from 'react';
import { useApp } from '../../context/AppContext';
import { SUPPORTED_LANGUAGES } from '../../types';
import { ArrowRight, Languages, Check, Volume2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface LanguageScreenProps {
  onNext: () => void;
}

export const LanguageScreen: React.FC<LanguageScreenProps> = ({ onNext }) => {
  const { currentLanguage, setLanguage } = useApp();

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 font-['Plus_Jakarta_Sans',sans-serif]">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-3xl border border-[#D1DDD6] shadow-sm p-6 sm:p-9 space-y-6"
      >
        {/* Header */}
        <div className="border-b border-[#D1DDD6] pb-4">
          <div className="flex items-center space-x-2 text-xs font-extrabold text-[#0D4738] uppercase tracking-wider mb-1">
            <Languages className="w-4 h-4 text-[#0F766E]" />
            <span>Step 02 of 05 • Kiosk Language Selection</span>
          </div>
          <h2 className="font-['Plus_Jakarta_Sans'] text-2xl sm:text-3xl font-extrabold text-[#1A2621] tracking-tight">
            {currentLanguage === 'or'
              ? 'ଆପଣଙ୍କର ପସନ୍ଦର ଭାଷା ଚୟନ କରନ୍ତୁ'
              : currentLanguage === 'hi'
              ? 'अपनी पसंदीदा भाषा चुनें'
              : 'Choose your preferred language'}
          </h2>
          <p className="text-sm text-[#52635B] mt-1 font-medium">
            {currentLanguage === 'or'
              ? 'କିଓସ୍କ ବାର୍ତ୍ତାଳାପ ଏବଂ ଭଏସ୍ ଇନପୁଟ୍ ପାଇଁ ଭାଷା ବାଛନ୍ତୁ।'
              : 'Select the language for voice intake, screen text, and clinical questions.'}
          </p>
        </div>

        {/* Accessible Language Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[440px] overflow-y-auto pr-1">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = currentLanguage === lang.id;
            return (
              <button
                key={lang.id}
                onClick={() => setLanguage(lang.id)}
                className={`w-full text-left p-5 rounded-2xl border transition-all flex items-start justify-between touch-manipulation cursor-pointer ${
                  isSelected
                    ? 'bg-[#E8F2EC] border-[#0D4738] shadow-sm ring-2 ring-[#0D4738]/20'
                    : 'bg-[#F8F9F6] border-[#D1DDD6] hover:border-[#0F766E] hover:bg-white'
                }`}
              >
                <div className="space-y-1.5 flex-1 pr-4">
                  <div className="flex items-center space-x-3">
                    <span className="font-['Plus_Jakarta_Sans'] font-extrabold text-2xl text-[#1A2621]">
                      {lang.nameNative}
                    </span>
                    <span className="text-xs font-bold text-[#52635B] bg-white border border-[#D1DDD6] px-2.5 py-0.5 rounded-lg">
                      {lang.nameEn}
                    </span>
                  </div>
                  <p className="text-xs text-[#52635B] font-medium">{lang.subtext}</p>
                  
                  {/* Sample Voice Preview */}
                  <div className="flex items-center space-x-2 text-xs text-[#0D4738] pt-1">
                    <Volume2 className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span className="italic font-bold">{lang.sampleVoice}</span>
                  </div>
                </div>

                {/* Selected Checkmark Indicator */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-[#0D4738] text-white shadow-xs' : 'bg-[#D1DDD6] text-[#52635B]'
                  }`}
                >
                  {isSelected ? <Check className="w-5 h-5 stroke-[3]" /> : null}
                </div>
              </button>
            );
          })}
        </div>

        {/* Info Box */}
        <div className="bg-[#E8F2EC]/60 p-4 rounded-2xl border border-[#D1DDD6] text-xs text-[#52635B] leading-relaxed">
          <span className="font-bold text-[#0D4738]">Clinical Note: </span>
          You can change language anytime during the intake process. MediKiok automatically translates your responses into structured medical terms for the doctor.
        </div>

        {/* Primary Action Button */}
        <div className="pt-2">
          <button
            onClick={onNext}
            className="w-full h-15 bg-[#0D4738] hover:bg-[#0A382C] text-white font-['Plus_Jakarta_Sans'] font-extrabold text-base tracking-wide rounded-2xl shadow-md flex items-center justify-center space-x-3 transition-all cursor-pointer active:scale-[0.99]"
          >
            <span>
              {currentLanguage === 'or'
                ? 'ପରବର୍ତ୍ତୀ: ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା (NEXT: HEALTH HISTORY)'
                : currentLanguage === 'hi'
                ? 'अगला: स्वास्थ्य समस्या (NEXT: HEALTH HISTORY)'
                : 'PROCEED TO HEALTH HISTORY'}
            </span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

      </motion.div>
    </div>
  );
};
