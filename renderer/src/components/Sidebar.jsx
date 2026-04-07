import React from 'react';
import { MessageSquare, Mic2, FileText, Settings2, Activity } from 'lucide-react';
import { useStore } from '../store/useStore';

export const Sidebar = () => {
    const { activeTab, setActiveTab, micVolume, settings, isTranslating } = useStore();

    const menuItems = [
        { id: 'translation', icon: MessageSquare, label: 'Translation' },
        { id: 'voice', icon: Mic2, label: 'Voice Manager' },
        { id: 'logs', icon: FileText, label: 'System Logs' },
    ];

    return (
        <aside className="w-20 lg:w-48 bg-gray-900 border-r border-gray-800 flex flex-col h-full relative z-20">
            {/* Nav Items */}
            <div className="flex-1 py-6 px-3 space-y-2">
                {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
                                isActive 
                                    ? 'bg-cyan-500/10 text-cyan-400 shadow-[inset_0_0_12px_rgba(34,211,238,0.1)]' 
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                            }`}
                        >
                            <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-cyan-500 text-black' : 'bg-gray-800 group-hover:bg-gray-700'}`}>
                                <Icon className="w-5 h-5" />
                            </div>
                            <span className={`text-[11px] font-black tracking-widest uppercase hidden lg:block ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                                {item.label}
                            </span>
                            
                            {isActive && (
                                <div className="absolute left-0 w-1 h-8 bg-cyan-500 rounded-r-full shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Persistent Mic Feedback */}
            <div className="p-4 space-y-3 bg-black/20 border-t border-gray-800/50">
                <div className="flex items-center justify-between px-1">
                    <span className="text-[9px] font-black text-gray-500 tracking-tighter uppercase">MIC LEVEL</span>
                    {isTranslating && micVolume > (settings.sensitivity / 2) && (
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                    )}
                </div>
                
                <div className="h-40 bg-gray-850 rounded-lg overflow-hidden flex flex-col-reverse p-1 gap-px border border-gray-800">
                    {Array.from({ length: 20 }).map((_, i) => (
                        <div 
                            key={i} 
                            className={`flex-1 rounded-sm transition-all duration-150 ${
                                (i * 5) < micVolume 
                                    ? i > 15 
                                        ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' 
                                        : 'bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.5)]'
                                    : 'bg-gray-800/30'
                            }`}
                        />
                    ))}
                </div>
                
                <div className="text-center pt-2 border-t border-gray-800/50">
                    <span className="text-[8px] font-bold text-gray-600 tracking-widest uppercase">STABLE v2.1</span>
                </div>
            </div>
        </aside>
    );
};
