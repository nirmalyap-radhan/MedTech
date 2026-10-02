import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  ArrowLeft,
  CheckCircle2,
  Edit2,
  FileText,
  Activity,
  ShieldCheck,
  Check,
  Volume2,
  Play,
  Pause,
  Download,
  Printer,
  Plus,
  Trash2,
  Heart,
  Pill,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { generatePatientReport } from '../../utils/generatePatientReport';

interface DoctorPatientCaseScreenProps {
  onBackToQueue: () => void;
}

export const DoctorPatientCaseScreen: React.FC<DoctorPatientCaseScreenProps> = ({ onBackToQueue }) => {
  const { activeCase, updateCaseSummary, confirmDoctorCase, currentDoctor } = useApp();

  // Active view layout toggle for flexible workstation workflow
  const [workstationView, setWorkstationView] = useState<'trio' | 'voice-ayush' | 'ocr-rx' | 'soap-plan'>('trio');

  // Audio Playback simulation state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Transcript language toggle
  const [transcriptLang, setTranscriptLang] = useState<'odia' | 'english'>('odia');

  // AI Summary Editing Mode State
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummaryText, setEditedSummaryText] = useState(activeCase.aiSummary);
  const [showConfirmSuccessModal, setShowConfirmSuccessModal] = useState(false);

  // SOAP Plan / E-Prescription dynamic items state
  const [prescriptions, setPrescriptions] = useState<Array<{ id: string; name: string; dosage: string; freq: string; duration: string }>>([
    { id: '1', name: 'Tab Pantoprazole', dosage: '40 mg', freq: '1-0-0 (Before Food)', duration: '7 Days' },
    { id: '2', name: 'Syp Gelusil MPS', dosage: '10 ml', freq: '1-1-1 (After Food)', duration: '5 Days' },
    { id: '3', name: 'Tab Paracetamol', dosage: '650 mg', freq: 'SOS (If Fever/Pain)', duration: '3 Days' },
  ]);
  const [newMedName, setNewMedName] = useState('');
  const [newMedDosage, setNewMedDosage] = useState('');

  // OCR items verification toggle
  const [verifiedOCRIds, setVerifiedOCRIds] = useState<Record<string, boolean>>({
    'med-1': true,
    'med-2': true,
    'med-3': true,
  });

  const handleSaveSummary = () => {
    updateCaseSummary(activeCase.id, editedSummaryText);
    setIsEditingSummary(false);
  };

  const handleConfirmCase = () => {
    confirmDoctorCase(activeCase.id);
    setShowConfirmSuccessModal(true);
    setTimeout(() => {
      setShowConfirmSuccessModal(false);
    }, 2800);
  };

  const handleAddMedication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMedName) return;
    setPrescriptions([
      ...prescriptions,
      {
        id: Date.now().toString(),
        name: newMedName,
        dosage: newMedDosage || 'Standard',
        freq: '1-0-1',
        duration: '5 Days',
      },
    ]);
    setNewMedName('');
    setNewMedDosage('');
  };

  const handleRemoveMedication = (id: string) => {
    setPrescriptions(prescriptions.filter((p) => p.id !== id));
  };

  const toggleAudio = () => {
    setIsPlayingAudio(!isPlayingAudio);
  };

  return (
    <div className="p-4 sm:p-7 space-y-6 max-w-7xl mx-auto font-['Plus_Jakarta_Sans',sans-serif]">
      
      {/* Top Clinical Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D1DDD6] pb-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToQueue}
            className="flex items-center space-x-2 text-xs font-extrabold text-[#52635B] hover:text-[#0D4738] bg-white border border-[#D1DDD6] px-3.5 py-2 rounded-2xl transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-[#0F766E]" />
            <span>RETURN TO QUEUE</span>
          </button>

          <div className="flex items-center space-x-2 text-xs">
            <span className="text-[#52635B]">Workstation Case:</span>
            <span className="font-mono font-extrabold text-[#0D4738] bg-[#E8F2EC] px-2.5 py-1 rounded-xl border border-[#0D4738]/20">
              #{activeCase.id}
            </span>
          </div>
        </div>

        {/* Workstation View Switcher */}
        <div className="flex items-center space-x-1 bg-white p-1 rounded-2xl border border-[#D1DDD6]">
          {[
            { id: 'trio', label: '3-Column Workstation' },
            { id: 'voice-ayush', label: 'Voice & AYUSH' },
            { id: 'ocr-rx', label: 'OCR Scanner' },
            { id: 'soap-plan', label: 'SOAP & E-Prescription' },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setWorkstationView(v.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                workstationView === v.id
                  ? 'bg-[#0D4738] text-white shadow-xs'
                  : 'text-[#52635B] hover:text-[#0D4738] hover:bg-[#F8F9F6]'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* PATIENT HEADER & VITALS STRIP */}
      <div className="bg-white rounded-3xl border border-[#D1DDD6] p-6 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          
          {/* Identity Info */}
          <div className="flex items-start space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-[#0D4738] text-white font-extrabold text-xl flex items-center justify-center shrink-0 shadow-md">
              {activeCase.patient.name.substring(0, 2).toUpperCase()}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-['Plus_Jakarta_Sans'] font-extrabold text-2xl sm:text-3xl text-[#1A2621] tracking-tight">
                  {activeCase.patient.name}
                </h1>
                <span
                  className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                    activeCase.status === 'Doctor Verified'
                      ? 'bg-[#0D4738] text-white'
                      : 'bg-[#E8F2EC] text-[#0D4738] border border-[#0D4738]/20'
                  }`}
                >
                  {activeCase.status === 'Doctor Verified' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{activeCase.status}</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#52635B] font-semibold">
                <span>{activeCase.patient.age} Y / {activeCase.patient.gender}</span>
                <span>•</span>
                <span>Mobile: <strong className="text-[#1A2621]">{activeCase.patient.mobile}</strong></span>
                <span>•</span>
                <span>Arrival: <strong className="text-[#1A2621]">{activeCase.arrivalTime}</strong></span>
                <span>•</span>
                <span className="inline-flex items-center space-x-1 text-[#0D4738] bg-[#E8F2EC] px-2 py-0.5 rounded-md font-mono font-bold">
                  <ShieldCheck className="w-3 h-3 text-[#0F766E]" />
                  <span>ABHA: 91-8273-1920-3847</span>
                </span>
              </div>
            </div>
          </div>

          {/* Consultation Verification CTAs */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {activeCase.status !== 'Doctor Verified' ? (
              <button
                onClick={handleConfirmCase}
                className="h-12 px-6 bg-[#0D4738] hover:bg-[#0A382C] text-white font-['Plus_Jakarta_Sans'] font-extrabold text-xs tracking-wide rounded-2xl shadow-md flex items-center space-x-2 transition-all cursor-pointer active:scale-95"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>CONFIRM & SIGN CONSULTATION</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2 bg-[#E8F2EC] text-[#0D4738] border border-[#0D4738]/30 px-4 py-2.5 rounded-2xl text-xs font-extrabold">
                <CheckCircle2 className="w-4 h-4 text-[#0F766E]" />
                <span>CONSULTATION SIGNED & VERIFIED</span>
              </div>
            )}

            <button
              onClick={() => generatePatientReport(activeCase)}
              id="btn-download-final-report"
              className="h-12 px-5 bg-white hover:bg-[#F8F9F6] text-[#0D4738] font-['Plus_Jakarta_Sans'] font-extrabold text-xs rounded-2xl border-2 border-[#0D4738]/30 hover:border-[#0D4738] flex items-center space-x-2 transition-all cursor-pointer shadow-xs active:scale-95"
              title="Download Final Patient Report as PDF"
            >
              <Printer className="w-4 h-4 text-[#0F766E]" />
              <span>PRINT OPD SLIP</span>
            </button>
          </div>
        </div>

        {/* Clinical Vitals Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-[#D1DDD6]">
          <div className="bg-[#F8F9F6] p-3 rounded-2xl border border-[#D1DDD6] text-center">
            <span className="text-[10px] font-extrabold text-[#52635B] uppercase tracking-wider block">Blood Pressure</span>
            <span className="text-sm font-extrabold text-[#1A2621]">130/85 mmHg</span>
          </div>
          <div className="bg-[#F8F9F6] p-3 rounded-2xl border border-[#D1DDD6] text-center">
            <span className="text-[10px] font-extrabold text-[#52635B] uppercase tracking-wider block">Pulse Rate</span>
            <span className="text-sm font-extrabold text-[#0D4738] flex items-center justify-center space-x-1">
              <Heart className="w-3.5 h-3.5 text-[#D32F2F] fill-current" />
              <span>78 bpm</span>
            </span>
          </div>
          <div className="bg-[#F8F9F6] p-3 rounded-2xl border border-[#D1DDD6] text-center">
            <span className="text-[10px] font-extrabold text-[#52635B] uppercase tracking-wider block">SpO2 Oxygen</span>
            <span className="text-sm font-extrabold text-[#0F766E]">98% (Room Air)</span>
          </div>
          <div className="bg-[#F8F9F6] p-3 rounded-2xl border border-[#D1DDD6] text-center">
            <span className="text-[10px] font-extrabold text-[#52635B] uppercase tracking-wider block">Body Temp</span>
            <span className="text-sm font-extrabold text-[#1A2621]">98.6 °F (Oral)</span>
          </div>
          <div className="bg-[#F8F9F6] p-3 rounded-2xl border border-[#D1DDD6] text-center col-span-2 sm:col-span-1">
            <span className="text-[10px] font-extrabold text-[#52635B] uppercase tracking-wider block">Weight / BMI</span>
            <span className="text-sm font-extrabold text-[#1A2621]">64 kg (BMI 22.8)</span>
          </div>
        </div>
      </div>

      {/* Confirmation Success Toast Banner */}
      {showConfirmSuccessModal && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0D4738] text-white p-4 rounded-2xl flex items-center justify-between shadow-lg"
        >
          <div className="flex items-center space-x-3 text-sm font-extrabold">
            <CheckCircle2 className="w-5 h-5 text-[#A3C7B5]" />
            <span>Consultation Case Verified Successfully! Electronic prescription signed and dispatched to Hospital OPD Pharmacy.</span>
          </div>
        </motion.div>
      )}

      {/* 3-COLUMN CLINICAL CONSULTATION WORKSTATION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ======================================================== */}
        {/* COLUMN 1: MULTIMODAL INTAKE & AYUSH DOSHA DOSSIER (4 Cols) */}
        {/* ======================================================== */}
        {(workstationView === 'trio' || workstationView === 'voice-ayush') && (
          <div className={`${workstationView === 'trio' ? 'lg:col-span-4' : 'lg:col-span-12'} space-y-6`}>
            
            {/* 1.1 Voice Intake Audio Player & Dual Transcript */}
            <div className="bg-white rounded-3xl border border-[#D1DDD6] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#D1DDD6] pb-3">
                <div className="flex items-center space-x-2 text-xs font-extrabold text-[#0D4738] uppercase">
                  <Volume2 className="w-4 h-4 text-[#0F766E]" />
                  <span>Kiosk Voice Intake</span>
                </div>
                <span className="text-[10px] font-extrabold text-[#0D4738] bg-[#E8F2EC] px-2 py-0.5 rounded-full border border-[#0D4738]/20">
                  🎙️ Odia (Audio 42s)
                </span>
              </div>

              {/* Simulated Waveform & Playback Controls */}
              <div className="bg-[#F8F9F6] p-4 rounded-2xl border border-[#D1DDD6] space-y-3">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={toggleAudio}
                    className="w-11 h-11 rounded-2xl bg-[#0D4738] text-white flex items-center justify-center shadow-sm hover:bg-[#0A382C] cursor-pointer transition-all active:scale-95"
                  >
                    {isPlayingAudio ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </button>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#52635B]">
                      <span>{isPlayingAudio ? 'Playing patient audio...' : 'Audio Recorded: Odia Intake'}</span>
                      <span>0:42</span>
                    </div>
                    {/* Simulated Waveform Bars */}
                    <div className="flex items-center space-x-1 h-6">
                      {[40, 65, 85, 30, 95, 60, 45, 90, 75, 50, 80, 100, 35, 70, 90, 55, 40, 85, 60, 75].map((h, i) => (
                        <div
                          key={i}
                          style={{ height: `${h}%` }}
                          className={`w-1 rounded-full transition-all ${
                            i < (isPlayingAudio ? 12 : 8) ? 'bg-[#0D4738]' : 'bg-[#D1DDD6]'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dual-Language Transcript Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-[#1A2621] uppercase tracking-wider">
                    Med-PaLM Transcript
                  </span>
                  <div className="flex items-center space-x-1 text-[10px] font-extrabold bg-[#F8F9F6] p-0.5 rounded-lg border border-[#D1DDD6]">
                    <button
                      onClick={() => setTranscriptLang('odia')}
                      className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        transcriptLang === 'odia' ? 'bg-[#0D4738] text-white' : 'text-[#52635B]'
                      }`}
                    >
                      ଓଡ଼ିଆ (Original)
                    </button>
                    <button
                      onClick={() => setTranscriptLang('english')}
                      className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        transcriptLang === 'english' ? 'bg-[#0D4738] text-white' : 'text-[#52635B]'
                      }`}
                    >
                      English (Clinical)
                    </button>
                  </div>
                </div>

                <div className="bg-[#E8F2EC]/40 p-3.5 rounded-2xl border border-[#D1DDD6] text-xs leading-relaxed text-[#1A2621] font-medium">
                  {transcriptLang === 'odia' ? (
                    <p className="italic">
                      “ମୋ ପେଟରେ ତିନି ଦିନ ହେଲା ପ୍ରବଳ ଯନ୍ତ୍ରଣା ହେଉଛି। ଖାଇବା ପରେ ଅମ୍ଳପିତ୍ତ (Heartburn) ବଢୁଛି ଏବଂ ବାନ୍ତି ଭଳି ଲାଗୁଛି।”
                    </p>
                  ) : (
                    <p>
                      “Severe epigastric pain persisting for 3 days, accompanied by post-prandial heartburn (acid reflux) and occasional nausea.”
                    </p>
                  )}
                </div>
              </div>

              {/* Symptom Body Map Visualizer */}
              <div className="bg-[#F8F9F6] p-3.5 rounded-2xl border border-[#D1DDD6] space-y-2">
                <span className="text-[11px] font-extrabold text-[#1A2621] uppercase tracking-wider block">
                  Body Map Anatomic Localization
                </span>
                <div className="flex items-center space-x-3">
                  <div className="w-16 h-20 bg-white rounded-xl border border-[#D1DDD6] flex items-center justify-center relative shadow-xs">
                    {/* Torso graphic representation */}
                    <div className="w-10 h-14 border-2 border-[#52635B]/40 rounded-t-xl rounded-b-md relative">
                      {/* Highlighted Epigastric Hotspot */}
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#D32F2F]/30 rounded-full flex items-center justify-center animate-ping"></div>
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-[#D32F2F] rounded-full"></div>
                    </div>
                  </div>
                  <div className="text-xs space-y-0.5">
                    <span className="font-extrabold text-[#1A2621]">Primary Zone: Epigastrium / Abdomen</span>
                    <p className="text-[11px] text-[#52635B]">Radiation: Retrosternal area (burning)</p>
                    <span className="inline-block text-[10px] font-extrabold text-[#D32F2F] bg-[#FEECEC] px-2 py-0.5 rounded-md border border-[#D32F2F]/20">
                      Severity: 7/10 (Severe)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 1.2 AYUSH Dashavidha Pariksha & Tri-Dosha Card */}
            <div className="bg-white rounded-3xl border border-[#D1DDD6] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#D1DDD6] pb-3">
                <div className="flex items-center space-x-2 text-xs font-extrabold text-[#0D4738] uppercase">
                  <ShieldCheck className="w-4 h-4 text-[#0F766E]" />
                  <span>AYUSH Dashavidha Pariksha</span>
                </div>
                <span className="text-[10px] font-extrabold text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded-full border border-[#F59E0B]/30">
                  Vata-Pitta Imbalance
                </span>
              </div>

              {/* Tri-Dosha Proportion Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-extrabold text-[#1A2621]">
                  <span>Tri-Dosha Ratio</span>
                  <span className="text-[#0D4738]">Vata 45% • Pitta 35% • Kapha 20%</span>
                </div>
                <div className="h-3 w-full rounded-full bg-[#E8F2EC] flex overflow-hidden p-0.5">
                  <div style={{ width: '45%' }} className="bg-[#0D4738] rounded-l-full" title="Vata: 45%" />
                  <div style={{ width: '35%' }} className="bg-[#D97706]" title="Pitta: 35%" />
                  <div style={{ width: '20%' }} className="bg-[#0F766E] rounded-r-full" title="Kapha: 20%" />
                </div>
              </div>

              {/* AYUSH Key Assessment Attributes */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#F8F9F6] p-2.5 rounded-xl border border-[#D1DDD6]">
                  <span className="text-[10px] font-extrabold text-[#52635B] uppercase block">Prakriti</span>
                  <span className="font-extrabold text-[#1A2621]">{activeCase.ayush.prakriti || 'Vata-Pitta'}</span>
                </div>
                <div className="bg-[#F8F9F6] p-2.5 rounded-xl border border-[#D1DDD6]">
                  <span className="text-[10px] font-extrabold text-[#52635B] uppercase block">Agni State</span>
                  <span className="font-extrabold text-[#1A2621]">Vishamagni (Irregular)</span>
                </div>
                <div className="bg-[#F8F9F6] p-2.5 rounded-xl border border-[#D1DDD6]">
                  <span className="text-[10px] font-extrabold text-[#52635B] uppercase block">Koshtha</span>
                  <span className="font-extrabold text-[#1A2621]">Krura (Constipative)</span>
                </div>
                <div className="bg-[#F8F9F6] p-2.5 rounded-xl border border-[#D1DDD6]">
                  <span className="text-[10px] font-extrabold text-[#52635B] uppercase block">Bala / Sara</span>
                  <span className="font-extrabold text-[#1A2621]">Madhyama Bala</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ======================================================== */}
        {/* COLUMN 2: HANDWRITTEN RX OCR & FORMULARY (4 Cols)        */}
        {/* ======================================================== */}
        {(workstationView === 'trio' || workstationView === 'ocr-rx') && (
          <div className={`${workstationView === 'trio' ? 'lg:col-span-4' : 'lg:col-span-12'} space-y-6`}>
            
            <div className="bg-white rounded-3xl border border-[#D1DDD6] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#D1DDD6] pb-3">
                <div className="flex items-center space-x-2 text-xs font-extrabold text-[#0D4738] uppercase">
                  <FileText className="w-4 h-4 text-[#0F766E]" />
                  <span>Prescription OCR Scanner</span>
                </div>
                <span className="text-[10px] font-extrabold text-[#0D4738] bg-[#E8F2EC] px-2 py-0.5 rounded-full border border-[#0D4738]/20">
                  96% Confidence
                </span>
              </div>

              {/* Scanned Document Viewport with Bounding Boxes */}
              <div className="relative bg-[#F8F9F6] rounded-2xl border-2 border-dashed border-[#D1DDD6] p-4 text-center overflow-hidden">
                <div className="h-44 w-full bg-gradient-to-b from-[#FFFFFF] to-[#F0F4F2] rounded-xl border border-[#D1DDD6] p-3 flex flex-col justify-between text-left relative shadow-xs">
                  
                  {/* Doctor Prescription Header Mock */}
                  <div className="border-b border-[#D1DDD6]/60 pb-1 flex justify-between items-center text-[10px] text-[#52635B]">
                    <span className="font-bold">Govt. Sub-Divisional Hospital • Rx</span>
                    <span className="font-mono">Date: 18-Sep</span>
                  </div>

                  {/* Simulated Handwritten Lines with Bounding Boxes */}
                  <div className="space-y-2 py-1">
                    
                    {/* Bounding Box 1 */}
                    <div className="relative inline-block border-2 border-[#0F766E] bg-[#0F766E]/10 px-2 py-1 rounded text-left">
                      <span className="text-[9px] font-bold text-[#0F766E] block">OCR Match 96%</span>
                      <p className="font-serif italic font-bold text-xs text-[#1A2621]">Tab Pantocid 40mg 1 OD</p>
                    </div>

                    {/* Bounding Box 2 */}
                    <div className="relative inline-block border-2 border-[#0F766E] bg-[#0F766E]/10 px-2 py-1 rounded text-left ml-2">
                      <span className="text-[9px] font-bold text-[#0F766E] block">OCR Match 92%</span>
                      <p className="font-serif italic font-bold text-xs text-[#1A2621]">Syp Gelusil 10ml TDS</p>
                    </div>

                  </div>

                  <div className="text-[10px] text-[#52635B] flex justify-between items-center pt-1 border-t border-[#D1DDD6]/40">
                    <span>Signature verified</span>
                    <span className="text-[#0D4738] font-bold">2 Formulations Detected</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#52635B] font-semibold mt-2.5 px-1">
                  <span>Scanned via MediKiok Camera Slot</span>
                  <span className="text-[#0D4738] font-bold">Auto-digitized</span>
                </div>
              </div>

              {/* Extracted Formulary Verification Table */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-extrabold text-[#1A2621] uppercase tracking-wider block">
                  Detected Formulary (Doctor Verification)
                </span>

                {[
                  { id: 'med-1', name: 'Tab Pantoprazole 40mg', orig: 'Tab Pantocid 40', score: 96, freq: '1-0-0' },
                  { id: 'med-2', name: 'Syp Gelusil MPS 10ml', orig: 'Gelusil TDS', score: 92, freq: '1-1-1' },
                  { id: 'med-3', name: 'Tab Paracetamol 650mg', orig: 'Dolo 650 SOS', score: 98, freq: 'SOS' },
                ].map((item) => {
                  const isChecked = !!verifiedOCRIds[item.id];
                  return (
                    <div
                      key={item.id}
                      onClick={() => setVerifiedOCRIds({ ...verifiedOCRIds, [item.id]: !isChecked })}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        isChecked
                          ? 'bg-[#E8F2EC]/60 border-[#0D4738] text-[#1A2621]'
                          : 'bg-[#F8F9F6] border-[#D1DDD6] text-[#52635B]'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-extrabold">{item.name}</span>
                          <span className="text-[10px] font-extrabold text-[#0D4738] bg-white px-1.5 py-0.5 rounded border border-[#D1DDD6]">
                            {item.score}%
                          </span>
                        </div>
                        <p className="text-[10px] text-[#52635B]">
                          Handwritten reading: <span className="font-serif italic font-semibold">"{item.orig}"</span>
                        </p>
                      </div>

                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                          isChecked ? 'bg-[#0D4738] text-white border-[#0D4738]' : 'bg-white border-[#D1DDD6]'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Lab Reports & Past Record Attachment */}
              <div className="bg-[#F8F9F6] p-3.5 rounded-2xl border border-[#D1DDD6] space-y-2">
                <span className="text-[11px] font-extrabold text-[#1A2621] uppercase tracking-wider block">
                  Attached Lab Investigations (1)
                </span>
                <div className="bg-white p-2.5 rounded-xl border border-[#D1DDD6] flex items-center justify-between text-xs">
                  <div>
                    <span className="font-extrabold text-[#1A2621]">Serum Amylase & LFT</span>
                    <p className="text-[10px] text-[#52635B]">16-Sep-2026 • SDH Laboratory</p>
                  </div>
                  <span className="text-[10px] font-extrabold text-[#0D4738] bg-[#E8F2EC] px-2 py-0.5 rounded-md">
                    Normal
                  </span>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ======================================================== */}
        {/* COLUMN 3: SOAP CLINICAL NOTES & E-PRESCRIPTION (4 Cols)   */}
        {/* ======================================================== */}
        {(workstationView === 'trio' || workstationView === 'soap-plan') && (
          <div className={`${workstationView === 'trio' ? 'lg:col-span-4' : 'lg:col-span-12'} space-y-6`}>
            
            <div className="bg-white rounded-3xl border border-[#D1DDD6] p-5 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-[#D1DDD6] pb-3">
                <div className="flex items-center space-x-2 text-xs font-extrabold text-[#0D4738] uppercase">
                  <Activity className="w-4 h-4 text-[#0F766E]" />
                  <span>SOAP Notes & E-Prescription</span>
                </div>
                <span className="text-[10px] font-extrabold text-[#0D4738] bg-[#E8F2EC] px-2 py-0.5 rounded-full border border-[#0D4738]/20">
                  Doctor Editable
                </span>
              </div>

              {/* S: Subjective */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#1A2621] uppercase tracking-wider flex items-center space-x-1">
                    <span className="w-5 h-5 rounded-md bg-[#0D4738] text-white text-[10px] font-extrabold flex items-center justify-center">S</span>
                    <span>Subjective (AI Prepopulated)</span>
                  </span>
                  {!isEditingSummary ? (
                    <button
                      onClick={() => setIsEditingSummary(true)}
                      className="text-[10px] font-extrabold text-[#0D4738] hover:underline flex items-center space-x-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveSummary}
                      className="text-[10px] font-extrabold text-white bg-[#0D4738] px-2 py-0.5 rounded-md cursor-pointer"
                    >
                      Save
                    </button>
                  )}
                </div>

                {!isEditingSummary ? (
                  <div className="bg-[#F8F9F6] p-3 rounded-2xl border border-[#D1DDD6] text-xs text-[#1A2621] leading-relaxed">
                    {activeCase.aiSummary}
                  </div>
                ) : (
                  <textarea
                    rows={4}
                    value={editedSummaryText}
                    onChange={(e) => setEditedSummaryText(e.target.value)}
                    className="w-full p-3 bg-white border-2 border-[#0D4738] rounded-2xl text-xs text-[#1A2621] focus:outline-none"
                  />
                )}
              </div>

              {/* O: Objective */}
              <div className="space-y-1.5">
                <span className="text-xs font-extrabold text-[#1A2621] uppercase tracking-wider flex items-center space-x-1">
                  <span className="w-5 h-5 rounded-md bg-[#0F766E] text-white text-[10px] font-extrabold flex items-center justify-center">O</span>
                  <span>Objective Findings</span>
                </span>
                <div className="bg-[#F8F9F6] p-3 rounded-2xl border border-[#D1DDD6] text-xs text-[#1A2621] space-y-1">
                  <p className="font-semibold">Vitals: BP 130/85 mmHg, Pulse 78 bpm regular, SpO2 98%, Afebrile.</p>
                  <p className="text-[#52635B]">Physical Exam: Tenderness on deep palpation over epigastrium. No rebound tenderness, no organomegaly.</p>
                </div>
              </div>

              {/* A: Assessment / Differentials */}
              <div className="space-y-1.5">
                <span className="text-xs font-extrabold text-[#1A2621] uppercase tracking-wider flex items-center space-x-1">
                  <span className="w-5 h-5 rounded-md bg-[#D97706] text-white text-[10px] font-extrabold flex items-center justify-center">A</span>
                  <span>Assessment & Differential</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2.5 py-1 rounded-xl bg-[#FEECEC] text-[#D32F2F] border border-[#D32F2F]/30 text-xs font-extrabold">
                    1. Acute Gastritis / Reflux (Primary)
                  </span>
                  <span className="px-2.5 py-1 rounded-xl bg-[#FEF3C7] text-[#D97706] border border-[#F59E0B]/30 text-xs font-extrabold">
                    2. Peptic Ulcer Disease
                  </span>
                </div>
              </div>

              {/* P: Plan & E-Prescription Builder */}
              <div className="space-y-2 pt-2 border-t border-[#D1DDD6]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#1A2621] uppercase tracking-wider flex items-center space-x-1">
                    <span className="w-5 h-5 rounded-md bg-[#0D4738] text-white text-[10px] font-extrabold flex items-center justify-center">P</span>
                    <span>Plan & E-Prescription ({prescriptions.length})</span>
                  </span>
                </div>

                {/* Prescription Items List */}
                <div className="space-y-2">
                  {prescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      className="bg-[#F8F9F6] p-3 rounded-2xl border border-[#D1DDD6] flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <Pill className="w-3.5 h-3.5 text-[#0F766E]" />
                          <span className="font-extrabold text-[#1A2621]">{rx.name}</span>
                          <span className="font-semibold text-[#52635B]">{rx.dosage}</span>
                        </div>
                        <p className="text-[11px] text-[#0D4738] font-bold">
                          {rx.freq} • {rx.duration}
                        </p>
                      </div>

                      <button
                        onClick={() => handleRemoveMedication(rx.id)}
                        className="text-[#52635B] hover:text-[#D32F2F] p-1 rounded-lg transition-colors cursor-pointer"
                        title="Remove Drug"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Drug Input Form */}
                <form onSubmit={handleAddMedication} className="flex items-center space-x-2 pt-1">
                  <input
                    type="text"
                    placeholder="Add medicine (e.g. Tab Domperidone)..."
                    value={newMedName}
                    onChange={(e) => setNewMedName(e.target.value)}
                    className="flex-1 h-9 px-3 bg-[#F8F9F6] border border-[#D1DDD6] rounded-xl text-xs font-semibold text-[#1A2621] focus:outline-none focus:ring-2 focus:ring-[#0D4738]"
                  />
                  <input
                    type="text"
                    placeholder="Dose (10mg)"
                    value={newMedDosage}
                    onChange={(e) => setNewMedDosage(e.target.value)}
                    className="w-20 h-9 px-2 bg-[#F8F9F6] border border-[#D1DDD6] rounded-xl text-xs font-semibold text-[#1A2621] focus:outline-none focus:ring-2 focus:ring-[#0D4738]"
                  />
                  <button
                    type="submit"
                    className="h-9 px-3 bg-[#0D4738] text-white rounded-xl text-xs font-extrabold hover:bg-[#0A382C] cursor-pointer flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </form>

                {/* Advice & Dietary Precautions */}
                <div className="bg-[#E8F2EC]/40 p-3 rounded-2xl border border-[#D1DDD6] text-xs space-y-1">
                  <span className="font-extrabold text-[#0D4738] uppercase text-[10px]">Lifestyle & AYUSH Dietary Advice:</span>
                  <p className="text-[#1A2621] font-medium leading-relaxed">
                    Avoid spicy, fried foods and tea/coffee on empty stomach. Drink warm water. Follow Pathya diet (moong dal khichdi). Review in 7 days if symptoms persist.
                  </p>
                </div>
              </div>

              {/* Bottom Action Ribbon */}
              <div className="pt-3 border-t border-[#D1DDD6] space-y-2.5">
                <div className="flex items-center space-x-2 text-[11px] text-[#52635B] bg-[#F8F9F6] p-2.5 rounded-xl border border-[#D1DDD6]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                  <span className="truncate">Attending: <strong>{currentDoctor?.name || 'Dr. A. K. Mishra'}</strong> ({currentDoctor?.mciRegNumber || 'MCI-48920/OD'})</span>
                </div>

                {activeCase.status !== 'Doctor Verified' ? (
                  <button
                    onClick={handleConfirmCase}
                    className="w-full h-13 bg-[#0D4738] hover:bg-[#0A382C] text-white font-['Plus_Jakarta_Sans'] font-extrabold text-xs tracking-wide rounded-2xl shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer active:scale-95"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>SIGN & CONFIRM CONSULTATION</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="w-full py-2.5 bg-[#E8F2EC] text-[#0D4738] border border-[#0D4738]/20 rounded-2xl text-xs font-extrabold text-center flex items-center justify-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-[#0F766E]" />
                      <span>CONSULTATION SIGNED & COMPLETED</span>
                    </div>

                    <button
                      onClick={() => generatePatientReport(activeCase)}
                      className="w-full h-11 bg-white hover:bg-[#F8F9F6] text-[#0D4738] border-2 border-[#0D4738]/30 rounded-2xl text-xs font-extrabold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-xs active:scale-95"
                    >
                      <Download className="w-4 h-4 text-[#0F766E]" />
                      <span>DISPATCH / DOWNLOAD FINAL OPD SLIP (PDF)</span>
                    </button>
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

      </div>

    </div>
  );
};
