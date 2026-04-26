import React, { useEffect } from 'react';
import { Settings, Play, Square, Volume2, Mic, Activity } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ipcService } from '../services/ipcService';

export const ControlPanel = () => {
    const { 
        isTranslating, 
        setIsTranslating, 
        settings, 
        updateSettings,
        audioInputs,
        audioOutputs,
        addLog,
        setShowConfigModal
    } = useStore();

    const toggleTranslation = async () => {
        const newState = !isTranslating;
        
        if (newState) {
            try {
                const targetShort = settings.targetLang.split('-')[0];
                ipcService.toggleTranslation({
                    isTranslating: true,
                    sourceLang: settings.sourceLang,
                    targetLang: targetShort,
                    ttsEngine: settings.ttsEngine,
                    sensitivity: settings.sensitivity,
                    sampleRate: settings.sampleRate,
                    token: localStorage.getItem('cyan_token') || ''
                });
                ipcService.showOverlay();
                setIsTranslating(true);
                addLog('Bắt đầu dịch trực tiếp...', 'info');
            } catch (err) {
                console.error("Start failed:", err);
                setIsTranslating(false);
            }
        } else {
            console.log("Sending STOP");
            ipcService.toggleTranslation({ isTranslating: false });
            ipcService.hideOverlay();
            setIsTranslating(false);
            addLog('Đã dừng dịch.', 'info');
        }
    };

    // Listen for Escape key to stop translation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isTranslating) {
                console.log("Escape key pressed - stopping translation");
                toggleTranslation();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isTranslating]);

    return (
        <div className="flex-1 flex flex-col p-4 space-y-5 overflow-y-auto custom-scrollbar">
            {/* Stream Control CTA */}
            <div className="relative group">
                <button
                    onClick={toggleTranslation}
                    className={`w-full py-5 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all duration-500 transform active:scale-95 z-10 relative ${
                        isTranslating
                            ? 'bg-red-500/10 border border-red-500/50 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]'
                            : 'bg-cyan-500 border border-cyan-400 text-black shadow-[0_0_30px_rgba(6,182,212,0.3)]'
                    }`}
                >
                    {isTranslating ? (
                        <>
                            <Square className="w-5 h-5 fill-red-500" />
                            <span className="text-[10px] font-black tracking-[0.2em] uppercase">STOP SERVICE</span>
                        </>
                    ) : (
                        <>
                            <Play className="w-5 h-5 fill-black" />
                            <span className="text-[10px] font-black tracking-[0.2em] uppercase">START SESSION</span>
                        </>
                    )}
                </button>
                {isTranslating && (
                    <div className="absolute inset-0 bg-red-500/10 blur-xl animate-pulse -z-10 rounded-2xl" />
                )}
            </div>

            {/* Language Pair */}
            <div className="space-y-3 p-3 bg-black/20 rounded-xl border border-gray-800/50">
                <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                        <label className="text-[9px] text-gray-500 font-black uppercase tracking-widest">INPUT SOURCE</label>
                    </div>
                    <select
                        value={settings.sourceLang}
                        onChange={(e) => updateSettings({ sourceLang: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-2.5 text-white text-xs focus:border-cyan-500 outline-none transition-colors"
                    >
                        {settings.languages?.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex justify-center -my-1 relative z-10">
                    <div className="p-1.5 bg-gray-800 rounded-full border border-gray-700 shadow-lg">
                        <Activity className="w-3 h-3 text-cyan-500" />
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                        <label className="text-[9px] text-gray-500 font-black uppercase tracking-widest">OUTPUT TARGET</label>
                    </div>
                    <select
                        value={settings.targetLang}
                        onChange={(e) => updateSettings({ targetLang: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-2.5 text-white text-xs focus:border-cyan-500 outline-none transition-colors"
                    >
                        {settings.languages?.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Audio Config */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black text-gray-400 tracking-widest uppercase">Audio Engine</h4>
                    <Volume2 className="w-3.5 h-3.5 text-gray-600" />
                </div>

                <div className="grid grid-cols-1 gap-3">
                    <select
                        value={settings.ttsEngine}
                        onChange={(e) => updateSettings({ ttsEngine: e.target.value })}
                        disabled={isTranslating}
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-2.5 text-white text-[11px] focus:border-cyan-500 outline-none disabled:opacity-30"
                    >
                        <option value="google">Google Cloud (Standard)</option>
                        <option value="azure">Microsoft Azure (Neural)</option>
                        <option value="elevenlabs">ElevenLabs (HD Clone)</option>
                    </select>

                    <button
                        onClick={() => setShowConfigModal(true)}
                        className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-400 text-[9px] font-black tracking-widest uppercase transition-all"
                    >
                        Auto-Config VAC
                    </button>
                </div>
            </div>

            {/* Fine Tuning */}
            <div className="space-y-4 pt-4 border-t border-gray-800/50">
                <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                        <label className="text-[9px] text-gray-500 font-black tracking-widest uppercase">GATE SENSITIVITY</label>
                        <span className="text-[9px] font-mono text-cyan-500">{settings.sensitivity.toFixed(0)}%</span>
                    </div>
                    <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        step="1"
                        value={settings.sensitivity}
                        onChange={(e) => updateSettings({ sensitivity: parseInt(e.target.value) })}
                        className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                </div>

                <div className="flex items-center justify-between bg-black/20 p-2.5 rounded-lg border border-gray-800/30">
                    <div className="flex items-center gap-2">
                        <Mic className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-[9px] font-black text-gray-400 tracking-widest uppercase">Adaptive DNR</span>
                    </div>
                    <button 
                        onClick={() => updateSettings({ noiseGateMode: settings.noiseGateMode === 'off' ? 'adaptive' : 'off' })}
                        className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ${settings.noiseGateMode !== 'off' ? 'bg-cyan-500' : 'bg-gray-700'}`}
                    >
                        <div className={`w-3 h-3 bg-white rounded-full transition-transform duration-200 ${settings.noiseGateMode !== 'off' ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>
        </div>
    );
};
