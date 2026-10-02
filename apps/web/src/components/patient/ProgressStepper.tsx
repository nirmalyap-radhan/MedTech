import React from 'react';
import { Check } from 'lucide-react';

interface ProgressStepperProps {
  currentStep: number; // 1 to 5 or 6
  onStepClick: (step: number) => void;
}

const STEPS = [
  { id: 1, labelEn: 'Identity', labelOr: 'ରୋଗୀ ପରିଚୟ' },
  { id: 2, labelEn: 'Language', labelOr: 'ଭାଷା ଚୟନ' },
  { id: 3, labelEn: 'Voice Intake', labelOr: 'ସ୍ୱର ତଥ୍ୟ' },
  { id: 4, labelEn: 'Prescription OCR', labelOr: 'ଔଷଧ ସ୍କାନ' },
  { id: 5, labelEn: 'AYUSH & Review', labelOr: 'ଆୟୁଷ ଓ ଯାଞ୍ଚ' },
];

export const ProgressStepper: React.FC<ProgressStepperProps> = ({ currentStep, onStepClick }) => {
  return (
    <div className="w-full bg-white border-b border-[#D1DDD6] py-3 px-4 sm:px-6 shadow-[0_1px_3px_rgba(13,71,56,0.03)]">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        {STEPS.map((step, idx) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;

          return (
            <React.Fragment key={step.id}>
              {/* Step Pill */}
              <button
                onClick={() => onStepClick(step.id)}
                className={`flex items-center space-x-2.5 text-xs font-bold rounded-full px-3.5 py-1.5 transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-[#0D4738] text-white shadow-md ring-4 ring-[#0D4738]/15 scale-102'
                    : isCompleted
                    ? 'bg-[#E8F2EC] text-[#0D4738] border border-[#D1DDD6] hover:bg-[#D5E6DC]'
                    : 'text-[#5B6560] bg-transparent hover:text-[#131B2E] hover:bg-[#F2F5F3]'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isCurrent
                      ? 'bg-white text-[#0D4738]'
                      : isCompleted
                      ? 'bg-[#0D4738] text-white'
                      : 'bg-[#D1DDD6] text-[#5B6560]'
                  }`}
                >
                  {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : step.id}
                </div>
                <span className="hidden sm:inline font-['Plus_Jakarta_Sans','Manrope']">
                  {step.labelEn}
                </span>
                {isCurrent && (
                  <span className="hidden lg:inline text-[10px] uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded-full font-bold">
                    Active
                  </span>
                )}
              </button>

              {/* Connecting Line */}
              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-[2px] mx-2 sm:mx-3 rounded-full transition-colors ${
                    step.id < currentStep ? 'bg-[#0D4738]' : 'bg-[#D1DDD6]'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
