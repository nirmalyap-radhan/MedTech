import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Search,
  ArrowUpDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
  Mic,
  FileText,
  ShieldCheck,
  Heart,
  Stethoscope,
  Filter,
} from 'lucide-react';
import type { PatientCase } from '../../types';

interface DoctorQueueScreenProps {
  onSelectCase: (caseId: string) => void;
}

export const DoctorQueueScreen: React.FC<DoctorQueueScreenProps> = ({ onSelectCase }) => {
  const { cases } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Urgent' | 'Voice' | 'OCR' | 'AYUSH' | 'Verified'>('All');
  const [sortBy, setSortBy] = useState<'arrival' | 'priority' | 'name'>('priority');
  const [selectedPreviewId, setSelectedPreviewId] = useState<string>('MK-21917');

  // Derive priority for each case
  const getCasePriority = (c: PatientCase): { label: 'Urgent' | 'Moderate' | 'Routine'; color: string; bg: string; border: string } => {
    if (c.clinicalConsiderations?.riskLevel === 'Emergency' || c.clinicalConsiderations?.riskLevel === 'High') {
      return { label: 'Urgent', color: 'text-[#D32F2F]', bg: 'bg-[#FEECEC]', border: 'border-[#D32F2F]/30' };
    }
    if (c.clinicalConsiderations?.riskLevel === 'Moderate' || c.associatedSymptoms.length > 2) {
      return { label: 'Moderate', color: 'text-[#D97706]', bg: 'bg-[#FEF3C7]', border: 'border-[#F59E0B]/30' };
    }
    return { label: 'Routine', color: 'text-[#0F766E]', bg: 'bg-[#E8F2EC]', border: 'border-[#0F766E]/30' };
  };

  // Filter & Search Logic
  const filteredCases = cases.filter((c: PatientCase) => {
    const matchesSearch =
      c.patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.chiefComplaint.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'Urgent') {
      return getCasePriority(c).label === 'Urgent';
    }
    if (statusFilter === 'Voice') {
      return c.answers.some((a) => !!a.rawVoiceInput);
    }
    if (statusFilter === 'OCR') {
      return c.documents.length > 0;
    }
    if (statusFilter === 'AYUSH') {
      return !!c.ayush?.prakriti;
    }
    if (statusFilter === 'Verified') {
      return c.status === 'Doctor Verified';
    }
    return true;
  });

  // Sort logic
  const sortedCases = [...filteredCases].sort((a, b) => {
    if (sortBy === 'priority') {
      const pMap = { Urgent: 3, Moderate: 2, Routine: 1 };
      return pMap[getCasePriority(b).label] - pMap[getCasePriority(a).label];
    }
    if (sortBy === 'name') {
      return a.patient.name.localeCompare(b.patient.name);
    }
    return a.arrivalTime.localeCompare(b.arrivalTime);
  });

  // Selected preview case
  const activePreviewCase = cases.find((c) => c.id === selectedPreviewId) || cases[0];

  return (
    <div className="p-4 sm:p-7 space-y-6 max-w-7xl mx-auto font-['Plus_Jakarta_Sans',sans-serif]">
      
      {/* Top Clinical Header & Stats Ribbon */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-[#D1DDD6] shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-xs font-extrabold text-[#0D4738] uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-[#0F766E] animate-pulse"></span>
            <span>OPD Room 104 • Internal Medicine Triage</span>
          </div>
          <h1 className="font-['Plus_Jakarta_Sans'] text-2xl sm:text-3xl font-extrabold text-[#1A2621] mt-1 tracking-tight">
            Clinical Triage & Patient Queue
          </h1>
          <p className="text-xs sm:text-sm text-[#52635B] mt-0.5">
            Real-time multimodal queue for patients who completed MediKiok voice intake, prescription OCR, & AYUSH assessment.
          </p>
        </div>

        {/* Triage Count Badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <div className="bg-[#0D4738] text-white px-3.5 py-2 rounded-xl flex items-center space-x-2 shadow-xs">
            <Clock className="w-4 h-4 text-[#A3C7B5]" />
            <span>Active Queue: {cases.filter((c) => c.status !== 'Doctor Verified').length}</span>
          </div>
          <div className="bg-[#FEECEC] text-[#D32F2F] border border-[#D32F2F]/30 px-3.5 py-2 rounded-xl flex items-center space-x-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>1 Urgent Priority</span>
          </div>
          <div className="bg-[#E8F2EC] text-[#0D4738] border border-[#D1DDD6] px-3.5 py-2 rounded-xl flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>Verified: {cases.filter((c) => c.status === 'Doctor Verified').length}</span>
          </div>
        </div>
      </div>

      {/* Search, Filter & Sort Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-white p-4 rounded-3xl border border-[#D1DDD6] shadow-sm">
        
        {/* Search Input */}
        <div className="lg:col-span-5 relative">
          <Search className="w-4 h-4 text-[#52635B] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search patient name, Token #MK-21917, complaint, or ABHA..."
            className="w-full h-11 pl-10 pr-4 bg-[#F8F9F6] border border-[#D1DDD6] rounded-2xl text-xs font-semibold text-[#1A2621] focus:outline-none focus:ring-2 focus:ring-[#0D4738] focus:border-[#0D4738] transition-all"
          />
        </div>

        {/* Filter Tabs */}
        <div className="lg:col-span-5 flex items-center space-x-1.5 overflow-x-auto py-1">
          <Filter className="w-3.5 h-3.5 text-[#52635B] shrink-0 hidden sm:block ml-1" />
          {[
            { id: 'All', label: 'All Waiting' },
            { id: 'Urgent', label: '🚨 Urgent' },
            { id: 'Voice', label: '🎙️ Voice Intake' },
            { id: 'OCR', label: '📄 OCR Attached' },
            { id: 'AYUSH', label: '🌿 AYUSH' },
            { id: 'Verified', label: 'Verified' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-2 text-xs font-extrabold rounded-xl shrink-0 transition-all cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-[#0D4738] text-white shadow-xs'
                  : 'bg-[#F8F9F6] text-[#52635B] border border-[#D1DDD6] hover:bg-[#E8F2EC] hover:text-[#0D4738]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sort Selector */}
        <div className="lg:col-span-2 flex items-center justify-end">
          <button
            onClick={() => {
              if (sortBy === 'priority') setSortBy('arrival');
              else if (sortBy === 'arrival') setSortBy('name');
              else setSortBy('priority');
            }}
            className="w-full sm:w-auto h-11 px-3 bg-[#F8F9F6] border border-[#D1DDD6] rounded-2xl text-xs font-extrabold text-[#1A2621] flex items-center justify-center space-x-1.5 hover:bg-[#E8F2EC] cursor-pointer transition-all"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>Sort: {sortBy === 'priority' ? 'Triage' : sortBy === 'arrival' ? 'Arrival' : 'Name'}</span>
          </button>
        </div>

      </div>

      {/* Main Grid: Queue Table + Quick Dossier Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* Table View (8 Cols on XL) */}
        <div className="xl:col-span-8 bg-white rounded-3xl border border-[#D1DDD6] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-[#D1DDD6] bg-[#F8F9F6] flex items-center justify-between">
            <span className="text-xs font-extrabold text-[#1A2621] uppercase tracking-wider">
              Patients in Queue ({sortedCases.length})
            </span>
            <span className="text-[11px] font-bold text-[#52635B]">
              Click a row to preview dossier • Double click to enter workstation
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white border-b border-[#D1DDD6] text-[11px] font-extrabold uppercase tracking-wider text-[#52635B]">
                  <th className="py-3.5 px-4 sm:px-6">Patient & Token</th>
                  <th className="py-3.5 px-3">Triage</th>
                  <th className="py-3.5 px-4">Chief Complaint & Multimodal</th>
                  <th className="py-3.5 px-3">Arrival</th>
                  <th className="py-3.5 px-4 text-right sm:pr-6">Workstation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D1DDD6] text-xs font-medium text-[#1A2621]">
                {sortedCases.map((c: PatientCase) => {
                  const priority = getCasePriority(c);
                  const isSelected = selectedPreviewId === c.id;
                  const isPrimaryDemo = c.id === 'MK-21917';

                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedPreviewId(c.id)}
                      onDoubleClick={() => onSelectCase(c.id)}
                      className={`hover:bg-[#F8F9F6] transition-all cursor-pointer ${
                        isSelected ? 'bg-[#E8F2EC]/60 ring-2 ring-inset ring-[#0D4738]/30' : ''
                      }`}
                    >
                      {/* Patient & Token */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-2xl bg-[#0D4738]/10 text-[#0D4738] font-extrabold text-xs flex items-center justify-center shrink-0 border border-[#0D4738]/20">
                            {c.patient.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-extrabold text-[#1A2621] text-sm font-['Plus_Jakarta_Sans']">
                                {c.patient.name}
                              </span>
                              {isPrimaryDemo && (
                                <span className="text-[10px] font-extrabold text-[#0D4738] bg-[#E8F2EC] px-1.5 py-0.5 rounded-md border border-[#0D4738]/20">
                                  Demo
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 text-[11px] text-[#52635B] mt-0.5">
                              <span className="font-mono font-bold text-[#1A2621] bg-[#F8F9F6] px-1.5 py-0.5 rounded border border-[#D1DDD6]">
                                #{c.id}
                              </span>
                              <span>•</span>
                              <span>{c.patient.age}Y / {c.patient.gender}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Triage Priority Badge */}
                      <td className="py-4 px-3">
                        <span
                          className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${priority.bg} ${priority.color} ${priority.border}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${priority.label === 'Urgent' ? 'bg-[#D32F2F] animate-ping' : priority.label === 'Moderate' ? 'bg-[#F59E0B]' : 'bg-[#0F766E]'}`}></span>
                          <span>{priority.label}</span>
                        </span>
                      </td>

                      {/* Chief Complaint & Multimodal Attached Chips */}
                      <td className="py-4 px-4 max-w-xs">
                        <p className="font-extrabold text-[#1A2621] text-xs truncate">{c.chiefComplaint}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {c.answers.some((a) => !!a.rawVoiceInput) && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-[#0D4738]/10 text-[#0D4738] text-[10px] font-extrabold border border-[#0D4738]/20">
                              <Mic className="w-3 h-3" />
                              <span>Odia Voice</span>
                            </span>
                          )}
                          {c.documents.length > 0 && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-[#0F766E]/10 text-[#0F766E] text-[10px] font-extrabold border border-[#0F766E]/20">
                              <FileText className="w-3 h-3" />
                              <span>{c.documents.length} Rx OCR</span>
                            </span>
                          )}
                          {c.ayush?.prakriti && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-[#FEF3C7] text-[#D97706] text-[10px] font-extrabold border border-[#F59E0B]/30">
                              <span>🌿 {c.ayush.prakriti}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Arrival & Status */}
                      <td className="py-4 px-3">
                        <span className="text-[#1A2621] font-bold block">{c.arrivalTime}</span>
                        <span className="text-[10px] text-[#52635B] flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>~8m wait</span>
                        </span>
                      </td>

                      {/* Action Button */}
                      <td className="py-4 px-4 text-right sm:pr-6">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCase(c.id);
                          }}
                          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all inline-flex items-center space-x-1.5 cursor-pointer active:scale-95 ${
                            c.status === 'Doctor Verified'
                              ? 'bg-[#E8F2EC] text-[#0D4738] border border-[#0D4738]/20 hover:bg-[#D1DDD6]'
                              : 'bg-[#0D4738] hover:bg-[#0A382C] text-white shadow-xs'
                          }`}
                        >
                          <span>OPEN</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Patient Quick-Dossier Drawer / Card (4 Cols on XL) */}
        {activePreviewCase && (
          <div className="xl:col-span-4 bg-white rounded-3xl border border-[#D1DDD6] p-6 shadow-sm space-y-5 sticky top-6">
            
            {/* Header Badge */}
            <div className="flex items-center justify-between border-b border-[#D1DDD6] pb-4">
              <div className="flex items-center space-x-2 text-xs font-extrabold text-[#0D4738] uppercase">
                <Sparkles className="w-4 h-4 text-[#0F766E]" />
                <span>Instant Clinical Preview</span>
              </div>
              <span className="text-[11px] font-mono font-bold text-[#52635B] bg-[#F8F9F6] px-2 py-0.5 rounded-lg border border-[#D1DDD6]">
                #{activePreviewCase.id}
              </span>
            </div>

            {/* Patient Identity */}
            <div className="flex items-start space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#0D4738] text-white font-extrabold text-base flex items-center justify-center shrink-0 shadow-xs">
                {activePreviewCase.patient.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-['Plus_Jakarta_Sans'] font-extrabold text-lg text-[#1A2621]">
                  {activePreviewCase.patient.name}
                </h3>
                <p className="text-xs text-[#52635B] font-semibold">
                  {activePreviewCase.patient.age} Y • {activePreviewCase.patient.gender} • Mobile: {activePreviewCase.patient.mobile}
                </p>
                <div className="inline-flex items-center space-x-1.5 text-[10px] font-extrabold text-[#0D4738] bg-[#E8F2EC] px-2 py-0.5 rounded-full mt-1">
                  <ShieldCheck className="w-3 h-3 text-[#0F766E]" />
                  <span>ABHA ID: 91-8273-1920-3847</span>
                </div>
              </div>
            </div>

            {/* Vitals Ribbon */}
            <div className="grid grid-cols-3 gap-2 bg-[#F8F9F6] p-3 rounded-2xl border border-[#D1DDD6] text-center">
              <div>
                <span className="text-[10px] font-extrabold text-[#52635B] uppercase block">Blood Pressure</span>
                <span className="text-xs font-extrabold text-[#1A2621]">130/85 mmHg</span>
              </div>
              <div className="border-x border-[#D1DDD6]">
                <span className="text-[10px] font-extrabold text-[#52635B] uppercase block">Pulse Rate</span>
                <span className="text-xs font-extrabold text-[#0D4738] flex items-center justify-center space-x-0.5">
                  <Heart className="w-3 h-3 text-[#D32F2F] fill-current" />
                  <span>78 bpm</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] font-extrabold text-[#52635B] uppercase block">SpO2 Oxygen</span>
                <span className="text-xs font-extrabold text-[#0F766E]">98% Room</span>
              </div>
            </div>

            {/* AI Synthesized Case Summary Preview */}
            <div className="space-y-2">
              <span className="text-xs font-extrabold text-[#1A2621] uppercase tracking-wider flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
                <span>AI Clinical Narrative</span>
              </span>
              <div className="bg-[#E8F2EC]/40 p-3.5 rounded-2xl border border-[#D1DDD6] text-xs text-[#1A2621] leading-relaxed font-medium">
                "{activePreviewCase.aiSummary.slice(0, 180)}..."
              </div>
            </div>

            {/* Differential Suspicions Chips */}
            {activePreviewCase.clinicalConsiderations?.primarySuspicions && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-extrabold text-[#52635B] uppercase tracking-wider block">
                  Suspected Differentials
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {activePreviewCase.clinicalConsiderations.primarySuspicions.map((sus, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-xl bg-white border border-[#D1DDD6] text-xs font-bold text-[#0D4738]"
                    >
                      {sus}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Full Workstation Launch Button */}
            <button
              onClick={() => onSelectCase(activePreviewCase.id)}
              className="w-full h-13 bg-[#0D4738] hover:bg-[#0A382C] text-white font-['Plus_Jakarta_Sans'] font-extrabold text-xs tracking-wide rounded-2xl shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer active:scale-[0.98]"
            >
              <Stethoscope className="w-4 h-4" />
              <span>LAUNCH FULL CONSULTATION WORKSTATION</span>
              <ChevronRight className="w-4 h-4" />
            </button>

          </div>
        )}

      </div>

    </div>
  );
};
