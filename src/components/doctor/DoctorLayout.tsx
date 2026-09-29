import React from 'react';
import { useApp } from '../../context/AppContext';
import { Users, CheckCircle2, Clock, LogOut, Activity } from 'lucide-react';

interface DoctorLayoutProps {
  children: React.ReactNode;
  activeTab: 'queue' | 'todays-cases' | 'completed' | 'patient-detail';
  onNavigateTab: (tab: 'queue' | 'todays-cases' | 'completed') => void;
  onLogout: () => void;
  queueCount: number;
  verifiedCount: number;
}

export const DoctorLayout: React.FC<DoctorLayoutProps> = ({
  children,
  activeTab,
  onNavigateTab,
  onLogout,
  queueCount,
  verifiedCount,
}) => {
  const { currentDoctor } = useApp();

  const doctorName = currentDoctor?.name || 'Dr. A. K. Mishra';
  const doctorDept = currentDoctor?.department || 'Internal Medicine';
  const doctorRoom = currentDoctor?.roomNumber || 'Room 104';
  const doctorAvatar = currentDoctor?.avatar || 'AM';
  const doctorMci = currentDoctor?.mciRegNumber || 'MCI-48920/OD';

  return (
    <div className="min-h-[calc(100vh-4rem)] flex bg-[#F8F9F6] font-['Plus_Jakarta_Sans',sans-serif]">
      
      {/* Enterprise Clinical Left Sidebar */}
      <aside className="w-64 bg-[#0D4738] text-white flex flex-col justify-between shrink-0 shadow-lg hidden md:flex border-r border-[#0D4738]/20">
        
        <div className="p-5 space-y-6">
          {/* Workstation Header */}
          <div className="border-b border-[#E8F2EC]/20 pb-4">
            <div className="flex items-center space-x-2 text-[11px] font-bold uppercase tracking-wider text-[#A3C7B5]">
              <Activity className="w-3.5 h-3.5 text-[#0F766E]" />
              <span>OPD Workstation</span>
            </div>
            <h1 className="font-['Plus_Jakarta_Sans'] text-lg font-extrabold text-white mt-1 tracking-tight truncate">
              {doctorName}
            </h1>
            <p className="text-xs text-[#A3C7B5] truncate">{doctorDept} • {doctorRoom}</p>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1.5">
            
            {/* Patient Queue */}
            <button
              onClick={() => onNavigateTab('queue')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'queue' || activeTab === 'patient-detail'
                  ? 'bg-white text-[#0D4738] shadow-md font-extrabold'
                  : 'text-[#E8F2EC] hover:bg-[#0A382C]'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Users className="w-4 h-4" />
                <span>Patient Queue</span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'queue' || activeTab === 'patient-detail' ? 'bg-[#0D4738] text-white' : 'bg-[#E8F2EC]/20 text-white'
              }`}>
                {queueCount}
              </span>
            </button>

            {/* Today's Cases */}
            <button
              onClick={() => onNavigateTab('todays-cases')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'todays-cases'
                  ? 'bg-white text-[#0D4738] shadow-md font-extrabold'
                  : 'text-[#E8F2EC] hover:bg-[#0A382C]'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Clock className="w-4 h-4" />
                <span>Today's OPD Cases</span>
              </div>
              <span className="text-[10px] font-bold text-[#A3C7B5]">6 Total</span>
            </button>

            {/* Completed / Verified Cases */}
            <button
              onClick={() => onNavigateTab('completed')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'completed'
                  ? 'bg-white text-[#0D4738] shadow-md font-extrabold'
                  : 'text-[#E8F2EC] hover:bg-[#0A382C]'
              }`}
            >
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="w-4 h-4" />
                <span>Verified Cases</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#E8F2EC]/20 text-white">
                {verifiedCount}
              </span>
            </button>

          </nav>
        </div>

        {/* Sidebar Bottom Profile & Logout */}
        <div className="p-4 border-t border-[#E8F2EC]/15 space-y-2 bg-[#092E24]">
          <div className="flex items-center space-x-3 p-2 rounded-xl">
            <div className="w-10 h-10 rounded-xl bg-[#0F766E] flex items-center justify-center font-extrabold text-sm text-white shadow-xs">
              {doctorAvatar}
            </div>
            <div className="text-left text-xs min-w-0">
              <p className="font-extrabold text-white truncate">{doctorName}</p>
              <p className="text-[11px] text-[#A3C7B5] truncate">Reg: {doctorMci}</p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-2 py-2.5 text-xs font-bold text-[#E8F2EC] hover:text-white hover:bg-[#0D4738] rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out Workstation</span>
          </button>
        </div>

      </aside>

      {/* Main Workstation Content View */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

    </div>
  );
};
