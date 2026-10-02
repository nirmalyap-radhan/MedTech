import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { User, ShieldCheck, Globe, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import { MediKiokLogo } from './MedicalIcons';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  const { currentLanguage, isDoctorAuthenticated, currentDoctor } = useApp();
  const [audioAssist, setAudioAssist] = useState(true);

  const isPatientView = currentView.startsWith('patient');
  const isDoctorView = currentView.startsWith('doctor');

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-[#D8E3DC] sticky top-0 z-50 shadow-[0_2px_8px_-2px_rgba(13,59,54,0.06)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        
        {/* Brand & Hospital Subtitle */}
        <div className="flex items-center space-x-6">
          <button
            onClick={() => onNavigate('patient-welcome')}
            className="flex items-center space-x-3 text-left focus:outline-none group cursor-pointer"
          >
            <div className="transition-transform group-hover:scale-105">
              <MediKiokLogo size={40} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-['Plus_Jakarta_Sans','Manrope'] font-extrabold text-xl tracking-tight text-[#142B25]">
                  MediKiok
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#E5F3EB] text-[#145A4D] border border-[#C6DDD2]">
                  Clinical OPD
                </span>
              </div>
              <span className="text-[11px] text-[#5B736B] font-medium block">
                AIIMS / Apollo General OPD Facility • Kiosk #04-East
              </span>
            </div>
          </button>

          {/* Clinical Interface Selector Tabs */}
          <div className="hidden md:flex items-center bg-[#EFF3F0] p-1 rounded-xl border border-[#D5E4DB]">
            <button
              onClick={() => onNavigate('patient-welcome')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isPatientView
                  ? 'bg-[#124E43] text-white shadow-xs'
                  : 'text-[#5B736B] hover:text-[#142B25]'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>PATIENT KIOSK</span>
            </button>
            <button
              onClick={() => onNavigate(isDoctorAuthenticated ? 'doctor-queue' : 'doctor-login')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isDoctorView
                  ? 'bg-[#124E43] text-white shadow-xs'
                  : 'text-[#5B736B] hover:text-[#142B25]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isDoctorAuthenticated ? (currentDoctor?.name || 'DR. WORKSTATION') : 'DOCTOR PORTAL'}</span>
              {isDoctorAuthenticated && (
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" title="Doctor Authenticated"></span>
              )}
            </button>
          </div>
        </div>

        {/* Right Status, Kiosk Metadata & Emergency Badge */}
        <div className="flex items-center space-x-3">
          
          {/* Live Queue Counter Badge */}
          <div className="hidden xl:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-[#E5F3EB] text-[#145A4D] text-xs font-semibold border border-[#C6DDD2]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0F766E] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#145A4D]"></span>
            </span>
            <span>Live Queue: 18 Active • Avg Wait: ~12m</span>
          </div>

          {/* Audio Assistance Toggle */}
          <button
            onClick={() => setAudioAssist(!audioAssist)}
            className={`hidden sm:flex items-center space-x-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
              audioAssist
                ? 'bg-[#E5F3EB] text-[#145A4D] border-[#145A4D]/30 shadow-xs'
                : 'bg-white text-[#5B736B] border-[#D8E3DC]'
            }`}
            title="Toggle Voice Prompts"
          >
            {audioAssist ? <Volume2 className="w-4 h-4 text-[#145A4D]" /> : <VolumeX className="w-4 h-4 text-[#5B736B]" />}
            <span>{audioAssist ? 'Audio: ON' : 'Audio: OFF'}</span>
          </button>

          {/* Active Language Chip */}
          <div className="flex items-center space-x-1.5 text-xs text-[#5B736B] bg-[#F8FAF7] px-3 py-1.5 rounded-full border border-[#D8E3DC]">
            <Globe className="w-3.5 h-3.5 text-[#145A4D]" />
            <span className="font-bold uppercase text-[#142B25]">
              {currentLanguage === 'or' ? 'ଓଡ଼ିଆ' : currentLanguage === 'hi' ? 'हिन्दी' : 'English'}
            </span>
          </div>

          {/* Emergency SOS Badge */}
          <button
            onClick={() => alert('Emergency Assistance Triggered! Hospital attendant dispatched to Kiosk #04.')}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-[#FEE2E2] hover:bg-[#FCD34D] text-[#BA1A1A] border border-[#FCA5A5] text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <AlertCircle className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>SOS</span>
          </button>

          {/* Mobile switcher */}
          <div className="flex md:hidden">
            <button
              onClick={() => onNavigate(isPatientView ? 'doctor-login' : 'patient-welcome')}
              className="px-3 py-1.5 bg-[#124E43] text-white text-xs font-bold rounded-full cursor-pointer"
            >
              {isPatientView ? 'Doctor View' : 'Kiosk View'}
            </button>
          </div>

        </div>

      </div>
    </header>
  );
};
