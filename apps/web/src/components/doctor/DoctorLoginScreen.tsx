import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  ShieldCheck,
  Stethoscope,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  KeyRound,
  Eye,
  EyeOff,
  History,
  Building2,
  FileCheck2,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { authDatabaseService } from '../../services/authDatabaseService';
import type { DoctorProfile, AuditLog, DoctorRole } from '../../types';

interface DoctorLoginScreenProps {
  onLoginSuccess: () => void;
}

export const DoctorLoginScreen: React.FC<DoctorLoginScreenProps> = ({ onLoginSuccess }) => {
  const { doctorLogin, registerDoctor, authLoading } = useApp();

  // Mode: Sign In vs Register Doctor vs Audit Log
  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'audit'>('login');

  // Login Form State
  const [email, setEmail] = useState('dr.mishra@hospital.gov.in');
  const [password, setPassword] = useState('Doctor@123');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available Doctors in Database (for quick fill)
  const [seededDoctors, setSeededDoctors] = useState<DoctorProfile[]>([]);

  // Registration Form State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regMci, setRegMci] = useState('');
  const [regDept, setRegDept] = useState('Internal Medicine & Critical Care');
  const [regRoom, setRegRoom] = useState('Room 105');
  const [regRole, setRegRole] = useState<DoctorRole>('CONSULTANT_PHYSICIAN');
  const [regPhone, setRegPhone] = useState('+91 94370 00000');
  const [regSuccessMessage, setRegSuccessMessage] = useState<string | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Load doctors and audit logs on mount
  useEffect(() => {
    loadDatabaseInfo();
  }, []);

  const loadDatabaseInfo = async () => {
    try {
      const docs = await authDatabaseService.getAllDoctors();
      setSeededDoctors(docs);
      const logs = await authDatabaseService.getAuditLogs(8);
      setAuditLogs(logs);
    } catch {
      // ignore
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await doctorLogin(email, password);
      if (res.success) {
        onLoginSuccess();
      } else {
        setErrorMessage(res.error || 'Authentication failed. Please verify credentials.');
      }
    } catch {
      setErrorMessage('Unexpected database connection error.');
    } finally {
      setIsSubmitting(false);
      loadDatabaseInfo();
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setRegSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const res = await registerDoctor({
        name: regName,
        email: regEmail,
        passwordPlain: regPassword,
        mciRegNumber: regMci,
        department: regDept,
        roomNumber: regRoom,
        role: regRole,
        phone: regPhone,
      });

      if (res.success && res.doctor) {
        setRegSuccessMessage(`Dr. ${res.doctor.name} registered successfully with ID ${res.doctor.id}!`);
        setEmail(res.doctor.email);
        setPassword(regPassword);
        // Switch to login tab after 1.5s
        setTimeout(() => {
          setActiveTab('login');
          setRegSuccessMessage(null);
        }, 1800);
      } else {
        setErrorMessage(res.error || 'Registration failed.');
      }
    } catch {
      setErrorMessage('Database error during doctor onboarding.');
    } finally {
      setIsSubmitting(false);
      loadDatabaseInfo();
    }
  };

  const selectDoctorPreset = (doc: DoctorProfile) => {
    setEmail(doc.email);
    setPassword('Doctor@123');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-[#F8F9F6] font-['Plus_Jakarta_Sans',sans-serif]">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-xl bg-white rounded-3xl border border-[#D1DDD6] shadow-xl p-6 sm:p-9 space-y-6"
      >
        {/* Header */}
        <div className="text-center space-y-3 border-b border-[#D1DDD6] pb-5">
          <div className="w-16 h-16 rounded-2xl bg-[#0D4738] text-[#E8F2EC] mx-auto flex items-center justify-center shadow-md">
            <Stethoscope className="w-9 h-9 text-[#A3C7B5]" />
          </div>
          <div>
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#E8F2EC] text-[#0D4738] border border-[#0D4738]/20 text-[11px] font-extrabold uppercase tracking-wider mb-2">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0F766E]" />
              <span>Enterprise Clinical Workstation • IndexedDB & SHA-256 Auth</span>
            </div>
            <h1 className="font-['Plus_Jakarta_Sans'] text-2xl sm:text-3xl font-extrabold text-[#1A2621] tracking-tight">
              Doctor Clinical Workstation
            </h1>
            <p className="text-xs text-[#52635B] mt-1 font-medium">
              National Health Authority & MCI/NMC Compliant Practitioner Portal
            </p>
          </div>

          {/* Navigation Mode Tabs */}
          <div className="flex items-center justify-center space-x-1 pt-2">
            {[
              { id: 'login', label: 'Doctor Sign In', icon: Lock },
              { id: 'register', label: 'Register New Staff', icon: UserPlus },
              { id: 'audit', label: 'Security Audit', icon: History },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setErrorMessage(null);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center space-x-1.5 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-[#0D4738] text-white shadow-xs'
                      : 'bg-[#F8F9F6] text-[#52635B] hover:text-[#0D4738] hover:bg-[#E8F2EC]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Error Notification Alert */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-[#FEECEC] border border-[#D32F2F]/30 p-3.5 rounded-2xl flex items-start space-x-2.5 text-xs text-[#D32F2F] font-bold"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>{errorMessage}</span>
              </div>
            </motion.div>
          )}

          {regSuccessMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-[#E8F2EC] border border-[#0D4738]/30 p-3.5 rounded-2xl flex items-center space-x-2.5 text-xs text-[#0D4738] font-extrabold"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#0F766E]" />
              <span>{regSuccessMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ======================================================== */}
        {/* TAB 1: DOCTOR SIGN IN                                    */}
        {/* ======================================================== */}
        {activeTab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-[#1A2621] mb-1.5">
                Official Hospital Email / Doctor ID
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 text-[#52635B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="dr.name@hospital.gov.in"
                  className="w-full h-13 pl-11 pr-4 bg-[#F8F9F6] border border-[#D1DDD6] rounded-2xl text-sm font-semibold text-[#1A2621] focus:outline-none focus:ring-2 focus:ring-[#0D4738] focus:border-[#0D4738] transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-extrabold uppercase tracking-wider text-[#1A2621]">
                  Workstation Password
                </label>
                <span className="text-[11px] font-bold text-[#0F766E]">
                  Default: Doctor@123
                </span>
              </div>
              <div className="relative">
                <Lock className="w-5 h-5 text-[#52635B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full h-13 pl-11 pr-11 bg-[#F8F9F6] border border-[#D1DDD6] rounded-2xl text-sm font-semibold text-[#1A2621] focus:outline-none focus:ring-2 focus:ring-[#0D4738] focus:border-[#0D4738] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#52635B] hover:text-[#1A2621] cursor-pointer p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Quick Doctor Preset Selector */}
            <div className="space-y-2 pt-1">
              <span className="text-[11px] font-extrabold text-[#52635B] uppercase tracking-wider block">
                Quick Select Practitioner (Hospital Directory):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {seededDoctors.slice(0, 4).map((doc) => {
                  const isCurrent = email.toLowerCase() === doc.email.toLowerCase();
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => selectDoctorPreset(doc)}
                      className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center space-x-2.5 ${
                        isCurrent
                          ? 'bg-[#E8F2EC] border-[#0D4738] ring-2 ring-[#0D4738]/20 text-[#0D4738]'
                          : 'bg-[#F8F9F6] border-[#D1DDD6] hover:bg-white text-[#1A2621]'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-[#0D4738] text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                        {doc.avatar}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-extrabold text-xs block truncate">{doc.name}</span>
                        <span className="text-[10px] text-[#52635B] block truncate">{doc.department.split('&')[0]}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || authLoading}
                className="w-full h-14 bg-[#0D4738] hover:bg-[#0A382C] disabled:bg-[#52635B] text-white font-['Plus_Jakarta_Sans'] font-extrabold text-sm tracking-wide rounded-2xl shadow-md flex items-center justify-center space-x-2.5 transition-all cursor-pointer active:scale-[0.99]"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#A3C7B5]" />
                    <span>VERIFYING CLINICAL CREDENTIALS...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>AUTHENTICATE & ENTER OPD WORKSTATION</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ======================================================== */}
        {/* TAB 2: REGISTER NEW DOCTOR STAFF                         */}
        {/* ======================================================== */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div className="bg-[#E8F2EC]/40 p-3.5 rounded-2xl border border-[#D1DDD6] text-xs text-[#52635B] leading-relaxed">
              <span className="font-extrabold text-[#0D4738]">Hospital Staff Onboarding: </span>
              All registered medical practitioners are cryptographically salted and verified under the National Medical Commission (NMC) standard.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold uppercase text-[#1A2621] mb-1">Doctor Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="Dr. Priyadarshini Mohanty"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="w-full h-11 px-3 bg-[#F8F9F6] border border-[#D1DDD6] rounded-xl text-xs font-semibold text-[#1A2621] focus:ring-2 focus:ring-[#0D4738]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-[#1A2621] mb-1">MCI / NMC Reg Number</label>
                <input
                  type="text"
                  required
                  placeholder="MCI-68219/OD"
                  value={regMci}
                  onChange={(e) => setRegMci(e.target.value)}
                  className="w-full h-11 px-3 bg-[#F8F9F6] border border-[#D1DDD6] rounded-xl text-xs font-semibold text-[#1A2621] focus:ring-2 focus:ring-[#0D4738]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold uppercase text-[#1A2621] mb-1">Official Hospital Email</label>
                <input
                  type="email"
                  required
                  placeholder="dr.mohanty@hospital.gov.in"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full h-11 px-3 bg-[#F8F9F6] border border-[#D1DDD6] rounded-xl text-xs font-semibold text-[#1A2621] focus:ring-2 focus:ring-[#0D4738]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-[#1A2621] mb-1">Workstation Password</label>
                <input
                  type="password"
                  required
                  placeholder="Min 6 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full h-11 px-3 bg-[#F8F9F6] border border-[#D1DDD6] rounded-xl text-xs font-semibold text-[#1A2621] focus:ring-2 focus:ring-[#0D4738]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-extrabold uppercase text-[#1A2621] mb-1">Department</label>
                <select
                  value={regDept}
                  onChange={(e) => setRegDept(e.target.value)}
                  className="w-full h-11 px-2.5 bg-[#F8F9F6] border border-[#D1DDD6] rounded-xl text-xs font-semibold text-[#1A2621] focus:ring-2 focus:ring-[#0D4738]"
                >
                  <option value="Internal Medicine & Critical Care">Internal Medicine</option>
                  <option value="Cardiology">Cardiology</option>
                  <option value="General Surgery & Acute Triage">General Surgery</option>
                  <option value="Pediatrics & Neonatology">Pediatrics</option>
                  <option value="AYUSH & Integrative Medicine">AYUSH Integrative</option>
                  <option value="Pulmonology">Pulmonology</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-[#1A2621] mb-1">OPD Room</label>
                <input
                  type="text"
                  required
                  placeholder="Room 105"
                  value={regRoom}
                  onChange={(e) => setRegRoom(e.target.value)}
                  className="w-full h-11 px-3 bg-[#F8F9F6] border border-[#D1DDD6] rounded-xl text-xs font-semibold text-[#1A2621] focus:ring-2 focus:ring-[#0D4738]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-[#1A2621] mb-1">Official Mobile</label>
                <input
                  type="tel"
                  placeholder="+91 94370 00000"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  className="w-full h-11 px-3 bg-[#F8F9F6] border border-[#D1DDD6] rounded-xl text-xs font-semibold text-[#1A2621] focus:ring-2 focus:ring-[#0D4738]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-[#1A2621] mb-1">Role / Designation</label>
                <select
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value as any)}
                  className="w-full h-11 px-2.5 bg-[#F8F9F6] border border-[#D1DDD6] rounded-xl text-xs font-semibold text-[#1A2621] focus:ring-2 focus:ring-[#0D4738]"
                >
                  <option value="CONSULTANT_PHYSICIAN">Consultant</option>
                  <option value="CHIEF_MEDICAL_OFFICER">Chief MO</option>
                  <option value="AYUSH_SPECIALIST">AYUSH Specialist</option>
                  <option value="RESIDENT_DOCTOR">Resident Doctor</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-13 bg-[#0D4738] hover:bg-[#0A382C] text-white font-['Plus_Jakarta_Sans'] font-extrabold text-xs tracking-wide rounded-2xl shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>REGISTER & STORE IN CLINICAL DATABASE</span>
            </button>
          </form>
        )}

        {/* ======================================================== */}
        {/* TAB 3: SECURITY AUDIT LOGS                               */}
        {/* ======================================================== */}
        {activeTab === 'audit' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#1A2621] uppercase tracking-wider flex items-center space-x-1.5">
                <History className="w-4 h-4 text-[#0F766E]" />
                <span>IndexedDB Security Audit Trail</span>
              </span>
              <button
                type="button"
                onClick={loadDatabaseInfo}
                className="text-[11px] font-bold text-[#0D4738] hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="bg-[#F8F9F6] rounded-2xl border border-[#D1DDD6] divide-y divide-[#D1DDD6] max-h-72 overflow-y-auto">
              {auditLogs.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#52635B]">No security events logged yet.</div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        log.action === 'LOGIN_SUCCESS'
                          ? 'bg-[#E8F2EC] text-[#0D4738]'
                          : log.action === 'LOGIN_FAILED'
                          ? 'bg-[#FEECEC] text-[#D32F2F]'
                          : 'bg-[#FEF3C7] text-[#D97706]'
                      }`}>
                        {log.action}
                      </span>
                      <span className="text-[10px] text-[#52635B] font-mono">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <p className="font-extrabold text-[#1A2621]">{log.doctorName}</p>
                    <p className="text-[11px] text-[#52635B]">{log.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="border-t border-[#D1DDD6] pt-4 flex items-center justify-between text-[11px] text-[#52635B] font-medium">
          <span className="flex items-center space-x-1">
            <Building2 className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>AIIMS / SDH Clinical Intranet</span>
          </span>
          <span>IndexedDB Schema v1.0 • AES/SHA-256</span>
        </div>
      </motion.div>
    </div>
  );
};
