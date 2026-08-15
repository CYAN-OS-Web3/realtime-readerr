import React from 'react';
import { Mic, FileText, User, List } from 'lucide-react';
import { useStore } from '../store/useStore';

const TABS = [
  { id: 'translation', icon: Mic, label: 'Live' },
  { id: 'summaries', icon: FileText, label: 'Summaries' },
  { id: 'profile', icon: User, label: 'Profile' },
  { id: 'logs', icon: List, label: 'Logs' },
];

export const MobileTabBar = () => {
  const { activeTab, setActiveTab } = useStore();

  return (
    <div
      id="mobile-tabbar"
      className="mobile-tabbar fixed bottom-0 left-0 right-0 z-50 flex"
      style={{
        background: 'rgba(5,5,5,0.95)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {TABS.map(({ id, icon: IconComponent, label }) => (
        <button
          key={id}
          id={`mobile-tab-${id}`}
          onClick={() => setActiveTab(id)}
          className="flex-1 flex flex-col items-center py-3 gap-1 transition-all"
          style={{
            color: activeTab === id ? '#22d3ee' : '#6b7280',
            borderTop: activeTab === id ? '2px solid #22d3ee' : '2px solid transparent',
            background: 'none',
            border: 'none',
          }}
        >
          <IconComponent className="w-5 h-5" style={{ color: activeTab === id ? '#22d3ee' : '#6b7280' }} />
          <span className="text-[10px] font-black uppercase tracking-widest">
            {label}
          </span>
        </button>
      ))}
    </div>
  );
};
