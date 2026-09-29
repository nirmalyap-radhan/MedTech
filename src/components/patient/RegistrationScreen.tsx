import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ArrowRight, User, Phone, Calendar, Sparkles, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

interface RegistrationScreenProps {
  onNext: () => void;
}

export const RegistrationScreen: React.FC<RegistrationScreenProps> = ({ onNext }) => {
  const { currentDraft, updateDraftPatient, currentLanguage } = useApp();

  const [formData, setFormData] = useState({
    name: currentDraft.patient.name || 'Rajesh Mohanty',
    age: currentDraft.patient.age || 42,
    gender: currentDraft.patient.gender || 'Male',
    mobile: currentDraft.patient.mobile || '+91 98450 12890',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateDraftPatient(formData);
    onNext();
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
              <User className="w-3.5 h-3.5" />
            </span>
            <span>Step 01 • Patient Demographics & Verification</span>
          </div>

          <h2 className="font-['Plus_Jakarta_Sans','Manrope'] text-2xl sm:text-3xl font-extrabold text-[#142B25] tracking-tight">
            {currentLanguage === 'or' ? 'ରୋଗୀଙ୍କ ପରିଚୟ ସୂଚନା (Patient Demographics)' : 'Patient Details'}
          </h2>

          <p className="text-sm text-[#5B736B] mt-1 font-medium leading-relaxed">
            Please enter basic identification details for OPD registration, clinical record matching, and queue allocation.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Full Name */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#142B25]">
              Full Legal Name (ରୋଗୀଙ୍କ ପୂରା ନାମ) *
            </label>
            <div className="relative">
              <User className="w-5 h-5 text-[#145A4D] absolute left-4.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Rajesh Mohanty"
                className="w-full h-15 pl-13 pr-4 bg-[#F8FAF7] border-2 border-[#D8E3DC] rounded-2xl text-base text-[#142B25] font-semibold focus:outline-none focus:border-[#145A4D] focus:bg-white focus:ring-4 focus:ring-[#145A4D]/10 transition-all"
              />
            </div>
          </div>

          {/* Age & Gender Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            
            {/* Age */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#142B25]">
                Age in Years (ବୟସ) *
              </label>
              <div className="relative">
                <Calendar className="w-5 h-5 text-[#145A4D] absolute left-4.5 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  required
                  min={1}
                  max={120}
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) || 0 })}
                  placeholder="e.g. 42"
                  className="w-full h-15 pl-13 pr-4 bg-[#F8FAF7] border-2 border-[#D8E3DC] rounded-2xl text-base text-[#142B25] font-semibold focus:outline-none focus:border-[#145A4D] focus:bg-white focus:ring-4 focus:ring-[#145A4D]/10 transition-all"
                />
              </div>
            </div>

            {/* Gender */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#142B25]">
                Biological Gender (ଲିଙ୍ଗ) *
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(['Male', 'Female', 'Other'] as const).map((g) => (
                  <button
                    type="button"
                    key={g}
                    onClick={() => setFormData({ ...formData, gender: g })}
                    className={`h-15 text-sm font-bold rounded-2xl border-2 transition-all cursor-pointer ${
                      formData.gender === g
                        ? 'bg-[#124E43] text-white border-[#124E43] shadow-sm ring-3 ring-[#124E43]/20'
                        : 'bg-[#F8FAF7] text-[#142B25] border-[#D8E3DC] hover:border-[#145A4D] hover:bg-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Patient Mobile / UHID */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#142B25]">
              Mobile Number / ABHA ID (ମୋବାଇଲ୍ ନମ୍ବର) *
            </label>
            <div className="relative">
              <Phone className="w-5 h-5 text-[#145A4D] absolute left-4.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                placeholder="e.g. +91 98450 12890"
                className="w-full h-15 pl-13 pr-4 bg-[#F8FAF7] border-2 border-[#D8E3DC] rounded-2xl text-base text-[#142B25] font-semibold focus:outline-none focus:border-[#145A4D] focus:bg-white focus:ring-4 focus:ring-[#145A4D]/10 transition-all"
              />
            </div>
          </div>

          {/* Quick Demo Autofill Badge */}
          <div className="bg-[#E5F3EB]/70 p-4 rounded-2xl border border-[#D5E4DB] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5 text-xs text-[#0D3B36] font-semibold">
              <Sparkles className="w-4 h-4 text-[#145A4D] shrink-0" />
              <span>Token #MK-21917 demo record preloaded for quick evaluation</span>
            </div>
            <button
              type="button"
              onClick={() =>
                setFormData({
                  name: 'Rajesh Mohanty',
                  age: 42,
                  gender: 'Male',
                  mobile: '+91 98450 12890',
                })
              }
              className="text-xs font-bold text-[#145A4D] hover:underline cursor-pointer"
            >
              Reset to Token #MK-21917
            </button>
          </div>

          {/* ABDM Security Note */}
          <div className="flex items-center space-x-2 text-xs text-[#6B857C] pt-1">
            <ShieldCheck className="w-4 h-4 text-[#145A4D]" />
            <span>Encrypted in accordance with National Digital Health Mission (ABDM) standards.</span>
          </div>

          {/* Primary Action Button */}
          <div className="pt-4 border-t border-[#E8EFEA] flex justify-end">
            <button
              type="submit"
              className="h-15 px-10 bg-[#124E43] hover:bg-[#0B352E] text-white font-['Plus_Jakarta_Sans','Manrope'] font-bold text-base rounded-full shadow-md hover:shadow-lg flex items-center space-x-3 transition-all cursor-pointer group active:scale-98"
            >
              <span>{currentLanguage === 'or' ? 'ଲକ୍ଷଣ ଓ ସ୍ୱାସ୍ଥ୍ୟ ଇତିହାସକୁ ଯାଆନ୍ତୁ' : currentLanguage === 'hi' ? 'लक्षण और इतिहास जारी रखें' : 'Continue to Symptoms & History'}</span>
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

        </form>
      </motion.div>
    </div>
  );
};
