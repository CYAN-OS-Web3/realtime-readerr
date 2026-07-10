import React, { useEffect, useState } from 'react';
import { MessageSquare, Mic2, FileText, Activity, ChevronLeft, ChevronRight, PanelsTopLeft, Sparkles, Terminal, User } from 'lucide-react';
import { useStore } from '../store/useStore';

export const Sidebar = () => {
    const { activeTab, setActiveTab, micVolume, settings, updateSettings, isTranslating } = useStore();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [audioDevices, setAudioDevices] = useState([]);

    useEffect(() => {
        const handleResize = () => {
            setIsCollapsed(window.innerWidth < 1100);
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const getDevices = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(device => device.kind === 'audioinput');
                setAudioDevices(audioInputs);
            } catch (error) {
                console.error("Error fetching audio devices:", error);
            }
        };

        getDevices();
        navigator.mediaDevices.addEventListener('devicechange', getDevices);
        return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    }, []);

    const menuItems = [
        { id: 'translation', icon: MessageSquare, label: 'Translation' },
        { id: 'summaries', icon: Sparkles, label: 'Summaries' },
        { id: 'voice', icon: Mic2, label: 'Voice Manager' },
        { id: 'profile', icon: User, label: 'Profile' }
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
                                            {item.id === 'summaries' && 'Review AI-generated session summaries'}
                                            {item.id === 'voice' && 'Voice cloning and payment workflow'}
                                            {item.id === 'logs' && 'System events and pipeline status'}
                                            {item.id === 'profile' && 'Account status and subscription quotas'}
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

                {!isCollapsed && audioDevices.length > 0 && (
                    <div className="pt-2 pb-1">
                        <select 
                            value={settings.inputDeviceId || ''}
                            onChange={(e) => updateSettings({ inputDeviceId: e.target.value })}
                            className="w-full bg-[#1a1a1a] border border-white/20 hover:border-white/30 rounded-lg px-3 py-2.5 text-xs text-gray-200 font-semibold outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all cursor-pointer appearance-none shadow-lg"
                            style={{ backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%239CA3AF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem top 50%', backgroundSize: '0.5rem auto' }}
                        >
                            <option value="" className="bg-[#1a1a1a] text-gray-200 py-1">Default Microphone</option>
                            <option value="system-audio" className="bg-[#1a1a1a] text-cyan-400 py-1 font-bold">System Audio (Beta)</option>
                            {audioDevices.map(device => (
                                <option key={device.deviceId} value={device.deviceId} className="bg-[#1a1a1a] text-gray-200 py-1">
                                    {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {!isCollapsed && (
                    <div className="text-center pt-2 border-t border-white/5">
                        <span className="text-[8px] font-bold text-gray-600 tracking-[0.3em] uppercase">Stable v2.1</span>
                    </div>
                )}
            </div>
        </aside>
    );
};
