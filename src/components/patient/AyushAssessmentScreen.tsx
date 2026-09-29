import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { AyushAssessment } from '../../types';
import { ChevronDown, ChevronUp, Sparkles, ArrowRight, ArrowLeft, Check, Leaf } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AyushAssessmentScreenProps {
  onNext: () => void;
  onBack: () => void;
}

const AYUSH_SECTIONS: Array<{
  key: keyof AyushAssessment;
  title: string;
  sanskritTerm: string;
  description: string;
  options: string[];
}> = [
  {
    key: 'prakriti',
    title: 'Constitutional Type',
    sanskritTerm: 'Prakriti (ପ୍ରକୃତି)',
    description: 'Inherent bio-energetic constitution (Vata, Pitta, Kapha).',
    options: ['Vata Dominant', 'Pitta Dominant', 'Kapha Dominant', 'Pitta-Kapha Dominant', 'Vata-Pitta Dominant', 'Tridoshaja'],
  },
  {
    key: 'vikriti',
    title: 'Pathological State',
    sanskritTerm: 'Vikriti (ବିକୃତି)',
    description: 'Current state of Dosha imbalance during illness.',
    options: ['Vata Dushti', 'Pitta Dushti', 'Kapha Dushti', 'Vata-Pitta Dushti (Febrile state)', 'Sannipataja'],
  },
  {
    key: 'sara',
    title: 'Tissue Quality & Vitality',
    sanskritTerm: 'Sara (ସାର)',
    description: 'Excellence of Dhatu tissue structures.',
    options: ['Rakta & Mamsa Sara', 'Tvaka Sara (Skin)', 'Medo Sara (Fat tissue)', 'Asthi Sara (Bone)', 'Pravara Sara (Superior)'],
  },
  {
    key: 'samhanana',
    title: 'Body Compactness',
    sanskritTerm: 'Samhanana (ସଂହନନ)',
    description: 'Symmetry and firmness of musculoskeletal structure.',
    options: ['Madhyama (Moderate Build)', 'Pravara (Compact / Athletic)', 'Heena (Slender / Fragile)'],
  },
  {
    key: 'pramana',
    title: 'Anthropometric Measurement',
    sanskritTerm: 'Pramana (ପ୍ରମାଣ)',
    description: 'Proportional body measurements and height-weight index.',
    options: ['Madhyama (Standard Proportions)', 'Pravara (Optimal)', 'Heena'],
  },
  {
    key: 'satmya',
    title: 'Habituation & Adaptability',
    sanskritTerm: 'Satmya (ସାତ୍ମ୍ୟ)',
    description: 'Wholesomeness and environmental dietary adaptability.',
    options: ['Satmya to Shita & Ruksha Ahara', 'Pravara Satmya', 'Madhyama Satmya', 'Alpa Satmya'],
  },
  {
    key: 'satva',
    title: 'Mental Strength & Resilience',
    sanskritTerm: 'Satva (ସତ୍ତ୍ୱ)',
    description: 'Psychological tolerance to pain and therapeutic procedures.',
    options: ['Madhyama Satva (Moderate Resilience)', 'Pravara Satva (Strong)', 'Avara Satva (Sensitive)'],
  },
  {
    key: 'aharaShakti',
    title: 'Digestive Capacity',
    sanskritTerm: 'Ahara Shakti (ଆହାର ଶକ୍ତି)',
    description: 'Power of digestion (Abhyavaharana & Jarana Shakti).',
    options: ['Mandagni (Diminished due to illness)', 'Tikshnagni (Hyperactive)', 'Vishamagni (Irregular)', 'Samagni (Balanced)'],
  },
  {
    key: 'vyayamaShakti',
    title: 'Physical Endurance',
    sanskritTerm: 'Vyayama Shakti (ବ୍ୟାୟାମ ଶକ୍ତି)',
    description: 'Capacity for physical effort and stamina.',
    options: ['Alpa (Low capacity due to fever)', 'Madhyama (Moderate)', 'Pravara (High capacity)'],
  },
  {
    key: 'vaya',
    title: 'Age Stage',
    sanskritTerm: 'Vaya (ବୟସ)',
    description: 'Chronological life stage (Bala, Madhya, Vriddha).',
    options: ['Madhyama Vaya (Middle Age - 45 Years)', 'Bala (Childhood / Youth)', 'Vriddha (Elderly > 60 Y)'],
  },
];

export const AyushAssessmentScreen: React.FC<AyushAssessmentScreenProps> = ({ onNext, onBack }) => {
  const { currentDraft, updateDraftAyush } = useApp();
  const [expandedKey, setExpandedKey] = useState<string | null>('prakriti');

  const ayushData = currentDraft.ayush;

  const handleSelectOption = (key: keyof AyushAssessment, val: string) => {
    updateDraftAyush({ [key]: val });
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-white/95 backdrop-blur-sm rounded-[28px] border border-[#D8E3DC] shadow-[0_12px_32px_-8px_rgba(13,59,54,0.06)] p-6 sm:p-10 space-y-7"
      >
        {/* Header */}
        <div className="border-b border-[#E8EFEA] pb-5">
          <div className="flex items-center space-x-2 text-xs font-bold text-[#145A4D] uppercase tracking-wider mb-2">
            <span className="w-6 h-6 rounded-lg bg-[#E5F3EB] flex items-center justify-center text-[#145A4D]">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span>Step 05 • AYUSH Holistic Health & Department Triage</span>
          </div>

          <h2 className="font-['Plus_Jakarta_Sans','Manrope'] text-2xl sm:text-3xl font-extrabold text-[#142B25] tracking-tight">
            AYUSH Prakriti & Dashavidha Pariksha (ଦଶବିଧ ପରୀକ୍ଷା)
          </h2>

          <p className="text-sm text-[#5B736B] mt-1 font-medium leading-relaxed">
            Standardized constitutional profile according to National AYUSH Morbidity & Standardized Terminology Portal (NAMSTP) guidelines.
          </p>
        </div>

        {/* Visual Prakriti Tri-Dosha Balance Card */}
        <div className="bg-[#F0F7F4] rounded-[24px] border border-[#C6DDD2] p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-[#145A4D] uppercase tracking-wider block">
                Calculated Constitutional Profile
              </span>
              <h3 className="text-lg font-extrabold text-[#142B25] mt-0.5">
                Predominant Prakriti: Vata-Pitta (वात-पित्त)
              </h3>
            </div>
            <div className="px-3.5 py-1 bg-white text-[#145A4D] text-xs font-bold rounded-full border border-[#C6DDD2] shadow-xs self-start sm:self-auto flex items-center space-x-1.5">
              <Leaf className="w-3.5 h-3.5" />
              <span>Ministry of AYUSH Integrative Protocol</span>
            </div>
          </div>

          {/* Tri-Dosha Visual Proportion Bars */}
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-[#142B25]">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#124E43]" />
                  <span>Vata (Air / Ether) — 45% (Elevated)</span>
                </span>
                <span className="text-[#5B736B] font-medium">Restless, Dryness, Joint sensitivity</span>
              </div>
              <div className="w-full h-3 bg-white rounded-full overflow-hidden border border-[#D5E4DB] p-0.5">
                <div className="h-full bg-[#124E43] rounded-full" style={{ width: '45%' }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-[#142B25]">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E]" />
                  <span>Pitta (Fire / Metabolism) — 35% (Moderate)</span>
                </span>
                <span className="text-[#5B736B] font-medium">Sharp appetite, metabolic heat</span>
              </div>
              <div className="w-full h-3 bg-white rounded-full overflow-hidden border border-[#D5E4DB] p-0.5">
                <div className="h-full bg-[#0F766E] rounded-full" style={{ width: '35%' }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-[#142B25]">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#8EAEA1]" />
                  <span>Kapha (Earth / Water) — 20% (Stable)</span>
                </span>
                <span className="text-[#5B736B] font-medium">Structural stamina</span>
              </div>
              <div className="w-full h-3 bg-white rounded-full overflow-hidden border border-[#D5E4DB] p-0.5">
                <div className="h-full bg-[#8EAEA1] rounded-full" style={{ width: '20%' }} />
              </div>
            </div>
          </div>

          <p className="text-xs text-[#5B736B] leading-relaxed border-t border-[#D5E4DB] pt-3 font-medium">
            Clinical Recommendation: Triage recommends consulting Internal Medicine alongside Integrative Ayurveda OPD for herbal gastro-support and lifestyle modifications.
          </p>
        </div>

        {/* Structured Expandable Clinical Accordion */}
        <div className="space-y-3 pt-1">
          {AYUSH_SECTIONS.map((sec) => {
            const isExpanded = expandedKey === sec.key;
            const currentValue = ayushData[sec.key] || sec.options[0];

            return (
              <div
                key={sec.key}
                className="bg-[#F8FAF7] rounded-2xl border border-[#D8E3DC] overflow-hidden transition-all shadow-xs"
              >
                <button
                  type="button"
                  onClick={() => setExpandedKey(isExpanded ? null : sec.key)}
                  className="w-full p-4.5 flex items-center justify-between text-left hover:bg-[#E5F3EB]/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center space-x-3.5">
                    <div className="w-9 h-9 rounded-xl bg-white text-[#145A4D] border border-[#D8E3DC] font-bold text-xs flex items-center justify-center shadow-xs">
                      {sec.title.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-['Plus_Jakarta_Sans','Manrope'] font-bold text-sm text-[#142B25]">
                          {sec.title}
                        </span>
                        <span className="text-xs font-bold text-[#145A4D] bg-white border border-[#D8E3DC] px-2.5 py-0.5 rounded-full">
                          {sec.sanskritTerm}
                        </span>
                      </div>
                      <p className="text-xs text-[#5B736B] mt-0.5">
                        Selected: <span className="font-bold text-[#145A4D]">{currentValue}</span>
                      </p>
                    </div>
                  </div>

                  <div className="text-[#5B736B]">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-[#D8E3DC] bg-white p-5 space-y-3.5"
                    >
                      <p className="text-xs text-[#5B736B] font-medium">{sec.description}</p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {sec.options.map((opt) => {
                          const isSelected = currentValue === opt;
                          return (
                            <button
                              type="button"
                              key={opt}
                              onClick={() => handleSelectOption(sec.key, opt)}
                              className={`p-3.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                                isSelected
                                  ? 'bg-[#124E43] text-white border-[#124E43] shadow-xs'
                                  : 'bg-[#F8FAF7] text-[#142B25] border-[#D8E3DC] hover:border-[#145A4D]'
                              }`}
                            >
                              <span>{opt}</span>
                              {isSelected && <Check className="w-4 h-4 shrink-0 stroke-[3]" />}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            );
          })}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-[#E8EFEA]">
          <button
            type="button"
            onClick={onBack}
            className="h-14 px-8 bg-white hover:bg-[#F2F5F3] text-[#142B25] font-bold text-sm rounded-full border border-[#D1DDD6] shadow-xs flex items-center space-x-2 transition-all cursor-pointer active:scale-98"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <button
            type="button"
            onClick={onNext}
            className="h-14 px-9 bg-[#124E43] hover:bg-[#0B352E] text-white font-['Plus_Jakarta_Sans','Manrope'] font-bold text-sm sm:text-base rounded-full shadow-md hover:shadow-lg flex items-center space-x-2 transition-all cursor-pointer group active:scale-98"
          >
            <span>Review Intake & Submit Case</span>
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

      </motion.div>
    </div>
  );
};
