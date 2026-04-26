import React, { useEffect, useState } from 'react';
import { MessageSquare, Mic2, FileText, Activity, ChevronLeft, ChevronRight, PanelsTopLeft } from 'lucide-react';
import { useStore } from '../store/useStore';

export const Sidebar = () => {
    const { activeTab, setActiveTab, micVolume, settings, isTranslating } = useStore();
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            setIsCollapsed(window.innerWidth < 1100);
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const menuItems = [
        { id: 'translation', icon: MessageSquare, label: 'Translation' },
        { id: 'voice', icon: Mic2, label: 'Voice Manager' },
        { id: 'logs', icon: FileText, label: 'System Logs' },
    ];

    return (
        <aside
            className={`relative z-20 flex h-full flex-col border-r border-white/5 bg-black/40 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.25)] transition-all duration-300 ease-out ${
                isCollapsed ? 'w-20 md:w-24' : 'w-64 lg:w-72'
            }`}
        >
            <button
                onClick={() => setIsCollapsed((value) => !value)}
                className="absolute right-0 top-1/2 z-30 flex h-9 w-9 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/5 bg-black/70 text-gray-300 shadow-[0_0_20px_rgba(0,0,0,0.35)] transition-colors hover:bg-black/90 hover:text-white"
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>

            <div className={`flex-1 overflow-y-auto py-4 ${isCollapsed ? 'px-3' : 'px-4'} custom-scrollbar`}>
                <div className="space-y-2">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                className={`group relative flex w-full items-center rounded-2xl border px-3 py-3.5 text-left transition-all duration-200 ${
                                    isActive
                                        ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300 shadow-[0_0_24px_rgba(6,182,212,0.08)]'
                                        : 'border-transparent bg-white/0 text-gray-400 hover:border-white/5 hover:bg-white/5 hover:text-gray-200'
                                } ${isCollapsed ? 'justify-center' : 'gap-3'}`}
                            >
                                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all ${isActive ? 'bg-cyan-500 text-black shadow-[0_0_18px_rgba(6,182,212,0.25)]' : 'bg-white/5 text-inherit group-hover:bg-white/10'}`}>
                                    <Icon className="h-5 w-5" />
                                </div>

                                {!isCollapsed && (
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-black uppercase tracking-[0.25em]">
                                                {item.label}
                                            </span>
                                          
                                        </div>
                                        <p className="mt-1 truncate text-[10px] text-gray-500">
                                            {item.id === 'translation' && 'Main live translation workspace'}
                                            {item.id === 'voice' && 'Voice cloning and payment workflow'}
                                            {item.id === 'logs' && 'System events and pipeline status'}
                                        </p>
                                    </div>
                                )}

                                {isCollapsed && isActive && (
                                    <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className={`border-t border-white/5 bg-black/20 ${isCollapsed ? 'px-3 py-4' : 'px-4 py-4'} space-y-3`}>
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-1`}>
                    {!isCollapsed && <span className="text-[9px] font-black uppercase tracking-[0.35em] text-gray-500">Mic Level</span>}
                    {isTranslating && micVolume > (settings.sensitivity / 2) && (
                        <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
                    )}
                </div>

                <div className={`rounded-2xl border border-white/5 bg-white/5 p-2 ${isCollapsed ? 'h-28' : 'h-40'} overflow-hidden`}>
                    <div className={`flex h-full flex-col-reverse gap-px ${isCollapsed ? 'p-0.5' : 'p-1'}`}>
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
                </div>

                {!isCollapsed && (
                    <div className="text-center pt-2 border-t border-white/5">
                        <span className="text-[8px] font-bold text-gray-600 tracking-[0.3em] uppercase">Stable v2.1</span>
                    </div>
                )}
            </div>
        </aside>
    );
};
