import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, Edit2, ShieldCheck, ArrowRight, User, FileText, Activity, Clock, Stethoscope, Printer } from 'lucide-react';
import { motion } from 'framer-motion';

interface ReviewSubmitScreenProps {
  onEditSection: (section: string) => void;
  onSubmittedSuccess: (submittedCaseId: string) => void;
}

export const ReviewSubmitScreen: React.FC<ReviewSubmitScreenProps> = ({
  onEditSection,
  onSubmittedSuccess,
}) => {
  const { currentDraft, submitPatientIntake, currentLanguage } = useApp();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const handleSubmitCase = () => {
    const id = submitPatientIntake();
    setSubmittedId(id);
    setIsSubmitted(true);
  };

  if (isSubmitted && submittedId) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-white/95 backdrop-blur-sm rounded-[28px] border border-[#D8E3DC] p-8 sm:p-12 text-center space-y-7 shadow-lg relative overflow-hidden"
        >
          {/* Top Decorative Hospital Ribbon */}
          <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-[#0D3B36] via-[#145A4D] to-[#2E8474]" />

          <div className="w-20 h-20 rounded-3xl bg-[#E5F3EB] text-[#145A4D] mx-auto flex items-center justify-center shadow-xs">
            <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-extrabold uppercase tracking-widest text-[#145A4D] bg-[#E5F3EB] px-4 py-1.5 rounded-full border border-[#C6DDD2]">
              Token #{submittedId}
            </span>
            <h2 className="font-['Plus_Jakarta_Sans','Manrope'] text-3xl font-extrabold text-[#142B25] tracking-tight">
              {currentLanguage === 'or'
                ? 'ଆପଣଙ୍କର ସୂଚନା ଦାଖଲ ହୋଇସାରିଛି'
                : 'Registration & Kiosk Intake Complete'}
            </h2>
            <p className="text-sm text-[#5B736B] max-w-lg mx-auto font-medium leading-relaxed">
              Your voice history, scanned prescription, and AYUSH profile have been securely transmitted to the OPD physician workstation.
            </p>
          </div>

          {/* Printed Clinical Queue Ticket */}
          <div className="bg-[#F8FAF7] p-6 sm:p-7 rounded-[24px] border-2 border-dashed border-[#D8E3DC] max-w-md mx-auto text-left space-y-3.5 text-xs shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E8EFEA] pb-3">
              <span className="font-extrabold text-[#142B25] uppercase tracking-wide">AIIMS / OPD Clinical Ticket</span>
              <span className="text-[#5B736B] font-semibold">Today, 09:30 AM</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#5B736B]">Patient Token:</span>
              <span className="font-extrabold text-[#145A4D] text-sm">#{submittedId}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#5B736B]">Patient Name:</span>
              <span className="font-bold text-[#142B25]">{currentDraft.patient.name}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#5B736B]">Consulting Room:</span>
              <span className="font-bold text-[#142B25]">OPD Room 104 • Dr. Suresh Mishra</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#5B736B]">AI Triage Priority:</span>
              <span className="font-bold text-[#BA1A1A] bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
                Priority 1 (Urgent Triage)
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-[#E8EFEA] pt-2">
              <span className="text-[#5B736B]">Estimated Wait Time:</span>
              <span className="font-bold text-[#145A4D]">~8 minutes (Next in Room)</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 max-w-md mx-auto space-y-3">
            <button
              onClick={() => onSubmittedSuccess(submittedId)}
              className="w-full h-15 bg-[#124E43] hover:bg-[#0B352E] text-white font-['Plus_Jakarta_Sans','Manrope'] font-bold text-sm sm:text-base rounded-full shadow-md hover:shadow-lg flex items-center justify-center space-x-2 transition-all cursor-pointer group active:scale-98"
            >
              <Stethoscope className="w-5 h-5" />
              <span>Switch to Doctor Clinical Workstation</span>
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </button>

            <button
              onClick={() => window.print()}
              className="w-full h-12 bg-white hover:bg-[#F2F5F3] text-[#142B25] border border-[#D8E3DC] font-bold text-xs rounded-full shadow-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#145A4D]" />
              <span>Print Physical Kiosk Slip</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

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
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
            <span>Final Verification • Patient Kiosk Review</span>
          </div>

          <h2 className="font-['Plus_Jakarta_Sans','Manrope'] text-2xl sm:text-3xl font-extrabold text-[#142B25] tracking-tight">
            {currentLanguage === 'or' ? 'ଆପଣଙ୍କର ସୂଚନା ଯାଞ୍ଚ କରନ୍ତୁ' : 'Review & Confirm Intake Dossier'}
          </h2>

          <p className="text-sm text-[#5B736B] mt-1 font-medium leading-relaxed">
            Please verify your patient demographic details, chief complaints, scanned prescriptions, and AYUSH profile before final submission to the doctor's queue.
          </p>
        </div>

        {/* Structured Review Sections */}
        <div className="space-y-4">
          
          {/* Section 1: Patient Details */}
          <div className="bg-[#F8FAF7] p-5 rounded-2xl border border-[#D8E3DC] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm font-bold text-[#142B25]">
                <User className="w-4 h-4 text-[#145A4D]" />
                <span>Patient Demographics</span>
              </div>
              <button
                type="button"
                onClick={() => onEditSection('patient-register')}
                className="text-xs font-bold text-[#145A4D] hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white p-4 rounded-xl border border-[#D8E3DC]">
              <div>
                <span className="text-[#6B857C] block font-medium">Name</span>
                <span className="font-bold text-[#142B25] text-sm">{currentDraft.patient.name}</span>
              </div>
              <div>
                <span className="text-[#6B857C] block font-medium">Age / Gender</span>
                <span className="font-bold text-[#142B25] text-sm">{currentDraft.patient.age} Y • {currentDraft.patient.gender}</span>
              </div>
              <div>
                <span className="text-[#6B857C] block font-medium">Mobile / ID</span>
                <span className="font-bold text-[#142B25] text-sm">{currentDraft.patient.mobile}</span>
              </div>
              <div>
                <span className="text-[#6B857C] block font-medium">Intake Language</span>
                <span className="font-bold text-[#145A4D] text-sm uppercase">{currentLanguage}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Current Concern & Symptoms */}
          <div className="bg-[#F8FAF7] p-5 rounded-2xl border border-[#D8E3DC] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm font-bold text-[#142B25]">
                <Activity className="w-4 h-4 text-[#145A4D]" />
                <span>Current Health Concern & Symptoms</span>
              </div>
              <button
                type="button"
                onClick={() => onEditSection('patient-intake')}
                className="text-xs font-bold text-[#145A4D] hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#D8E3DC] space-y-2 text-xs">
              <div>
                <span className="text-[#6B857C] block font-medium">Primary Complaint</span>
                <span className="font-bold text-[#142B25] text-sm">
                  {currentDraft.answers[0]?.answerValue || 'Reported on Kiosk'}
                </span>
              </div>
              {currentDraft.answers[0]?.rawVoiceInput && (
                <div className="bg-[#E5F3EB]/60 p-2.5 rounded-lg text-xs text-[#145A4D] italic border border-[#C6DDD2]">
                  Captured Voice Audio: “{currentDraft.answers[0].rawVoiceInput}”
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Uploaded Documents */}
          <div className="bg-[#F8FAF7] p-5 rounded-2xl border border-[#D8E3DC] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm font-bold text-[#142B25]">
                <FileText className="w-4 h-4 text-[#145A4D]" />
                <span>Uploaded Documents ({currentDraft.documents.length})</span>
              </div>
              <button
                type="button"
                onClick={() => onEditSection('patient-documents')}
                className="text-xs font-bold text-[#145A4D] hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>
            <div className="space-y-2">
              {currentDraft.documents.map((doc) => (
                <div key={doc.id} className="bg-white p-3.5 rounded-xl border border-[#D8E3DC] flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-[#142B25] text-sm">{doc.name}</span>
                    <p className="text-[#6B857C] mt-0.5">{doc.type} • {doc.date} • {doc.doctorName}</p>
                  </div>
                  <span className="text-xs font-bold text-[#145A4D] bg-[#E5F3EB] px-3 py-1 rounded-full border border-[#D8E3DC]">
                    OCR Confidence {doc.confidenceScore}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: AYUSH Assessment */}
          <div className="bg-[#F8FAF7] p-5 rounded-2xl border border-[#D8E3DC] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm font-bold text-[#142B25]">
                <Clock className="w-4 h-4 text-[#145A4D]" />
                <span>AYUSH Assessment (Dashavidha Pariksha)</span>
              </div>
              <button
                type="button"
                onClick={() => onEditSection('patient-ayush')}
                className="text-xs font-bold text-[#145A4D] hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-white p-4 rounded-xl border border-[#D8E3DC]">
              <div>
                <span className="text-[#6B857C] block font-medium">Prakriti</span>
                <span className="font-bold text-[#142B25]">{currentDraft.ayush.prakriti}</span>
              </div>
              <div>
                <span className="text-[#6B857C] block font-medium">Vikriti</span>
                <span className="font-bold text-[#142B25]">{currentDraft.ayush.vikriti}</span>
              </div>
              <div>
                <span className="text-[#6B857C] block font-medium">Ahara Shakti</span>
                <span className="font-bold text-[#142B25]">{currentDraft.ayush.aharaShakti}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Submit Action */}
        <div className="pt-4 border-t border-[#E8EFEA] flex justify-end">
          <button
            type="button"
            onClick={handleSubmitCase}
            className="h-16 px-10 bg-[#124E43] hover:bg-[#0B352E] text-white font-['Plus_Jakarta_Sans','Manrope'] font-bold text-base rounded-full shadow-md hover:shadow-lg flex items-center space-x-3 transition-all cursor-pointer group active:scale-98"
          >
            <span>Submit for Doctor Review (ଦାଖଲ କରନ୍ତୁ)</span>
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

      </motion.div>
    </div>
  );
};
