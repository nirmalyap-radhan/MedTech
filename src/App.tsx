import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/common/Navbar';
import { KioskShell } from './components/patient/KioskShell';
import { WelcomeScreen } from './components/patient/WelcomeScreen';
import { RegistrationScreen } from './components/patient/RegistrationScreen';
import { LanguageScreen } from './components/patient/LanguageScreen';
import { GuidedIntakeScreen } from './components/patient/GuidedIntakeScreen';
import { DocumentUploadScreen } from './components/patient/DocumentUploadScreen';
import { AyushAssessmentScreen } from './components/patient/AyushAssessmentScreen';
import { ReviewSubmitScreen } from './components/patient/ReviewSubmitScreen';

import { DoctorLayout } from './components/doctor/DoctorLayout';
import { DoctorLoginScreen } from './components/doctor/DoctorLoginScreen';
import { DoctorQueueScreen } from './components/doctor/DoctorQueueScreen';
import { DoctorPatientCaseScreen } from './components/doctor/DoctorPatientCaseScreen';

import type { PatientCase } from './types';

type AppView =
  | 'patient-welcome'
  | 'patient-register'
  | 'patient-language'
  | 'patient-intake'
  | 'patient-documents'
  | 'patient-ayush'
  | 'patient-review'
  | 'doctor-login'
  | 'doctor-queue'
  | 'doctor-patient-detail';

const MainContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('patient-intake');
  const [doctorSubTab, setDoctorSubTab] = useState<'queue' | 'todays-cases' | 'completed'>('queue');

  const { cases, selectDoctorPatient, isDoctorAuthenticated, doctorLogin, doctorLogout } = useApp();

  const handleSelectCaseInDoctorQueue = (caseId: string) => {
    selectDoctorPatient(caseId);
    setCurrentView('doctor-patient-detail');
  };

  const isPatientFlow = currentView.startsWith('patient');
  const isDoctorFlow = currentView.startsWith('doctor');

  return (
    <div className="min-h-screen bg-[#F6F8F5] font-['Plus_Jakarta_Sans',sans-serif] text-[#142B25] flex flex-col">
      {/* PATIENT FLOW: Master Kiosk Shell */}
      {isPatientFlow && (
        <KioskShell currentView={currentView} onNavigate={(v) => setCurrentView(v as AppView)}>
          {currentView === 'patient-welcome' && (
            <WelcomeScreen
              onStart={() => setCurrentView('patient-register')}
              onContinue={() => {
                selectDoctorPatient('MK-21917');
                setCurrentView('doctor-patient-detail');
              }}
            />
          )}

          {currentView === 'patient-register' && (
            <RegistrationScreen onNext={() => setCurrentView('patient-intake')} />
          )}

          {currentView === 'patient-language' && (
            <LanguageScreen onNext={() => setCurrentView('patient-intake')} />
          )}

          {currentView === 'patient-intake' && (
            <GuidedIntakeScreen
              onNext={() => setCurrentView('patient-documents')}
              onBack={() => setCurrentView('patient-register')}
            />
          )}

          {currentView === 'patient-documents' && (
            <DocumentUploadScreen
              onNext={() => setCurrentView('patient-ayush')}
              onBack={() => setCurrentView('patient-intake')}
            />
          )}

          {currentView === 'patient-ayush' && (
            <AyushAssessmentScreen
              onNext={() => setCurrentView('patient-review')}
              onBack={() => setCurrentView('patient-documents')}
            />
          )}

          {currentView === 'patient-review' && (
            <ReviewSubmitScreen
              onEditSection={(section) => setCurrentView(section as AppView)}
              onSubmittedSuccess={async (caseId) => {
                selectDoctorPatient(caseId);
                if (!isDoctorAuthenticated) {
                  await doctorLogin('dr.mishra@hospital.gov.in', 'Doctor@123');
                }
                setCurrentView('doctor-patient-detail');
              }}
            />
          )}
        </KioskShell>
      )}

      {/* DOCTOR WORKSTATION FLOW */}
      {isDoctorFlow && (
        <>
          <Navbar currentView={currentView} onNavigate={(v) => setCurrentView(v as AppView)} />
          <div className="flex-1">
            {!isDoctorAuthenticated && (
              <DoctorLoginScreen
                onLoginSuccess={() => {
                  setCurrentView('doctor-queue');
                }}
              />
            )}

            {isDoctorAuthenticated && (
              <DoctorLayout
                activeTab={currentView === 'doctor-patient-detail' ? 'patient-detail' : doctorSubTab}
                onNavigateTab={(tab) => {
                  setDoctorSubTab(tab);
                  setCurrentView('doctor-queue');
                }}
                onLogout={async () => {
                  await doctorLogout();
                  setCurrentView('doctor-login');
                }}
                queueCount={cases.filter((c: PatientCase) => c.status === 'Case Ready').length}
                verifiedCount={cases.filter((c: PatientCase) => c.status === 'Doctor Verified').length}
              >
                {(currentView === 'doctor-queue' || (isDoctorFlow && currentView !== 'doctor-patient-detail' && currentView !== 'doctor-login')) && (
                  <DoctorQueueScreen onSelectCase={handleSelectCaseInDoctorQueue} />
                )}

                {currentView === 'doctor-patient-detail' && (
                  <DoctorPatientCaseScreen onBackToQueue={() => setCurrentView('doctor-queue')} />
                )}
              </DoctorLayout>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}
