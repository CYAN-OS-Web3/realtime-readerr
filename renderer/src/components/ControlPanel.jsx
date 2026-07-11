import React, { useCallback, useEffect, useState } from 'react';
import { Settings, Play, Pause, Square, Volume2, Mic, Activity, SparkleIcon, Wand2Icon } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ipcService } from '../services/ipcService';
import { goBackendService } from '../services/summarizeService';
import { CustomSelect } from './CustomSelect';

export const ControlPanel = () => {
    const { 
        isTranslating, 
        setIsTranslating, 
        sessionPhase,
        setSessionPhase,
        settings, 
        updateSettings,
        addLog,
        setShowConfigModal,
        startSession,
        getSessionTranscripts,
        clearSessionTranscripts,
        authUserId,
        setToast,
        hideToast
    } = useStore();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const startStreaming = async ({ isResume = false } = {}) => {
        try {
            if (!isResume) {
                updateSettings({ inputDeviceId: '' });
                localStorage.removeItem('inputDeviceId');
                startSession();
                setSessionPhase('active');
                addLog('🟢 Session started', 'info');
            } else {
                addLog('▶️ Session resumed', 'info');
            }

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
            setSessionPhase('active');
            addLog('Bắt đầu dịch trực tiếp...', 'info');
        } catch (err) {
            console.error(isResume ? 'Resume failed:' : 'Start failed:', err);
            setIsTranslating(false);
        }
    };

    const pauseSession = async () => {
        try {
            console.log('Sending PAUSE');
            ipcService.finalizeUtterance();
            ipcService.toggleTranslation({ isTranslating: false });
            ipcService.hideOverlay();
            setIsTranslating(false);
            setSessionPhase('paused');
            addLog('⏸️ Session paused', 'info');
        } catch (err) {
            console.error('Pause failed:', err);
            addLog('❌ Error pausing session', 'error');
        }
    };

    const resumeSession = async () => {
        await startStreaming({ isResume: true });
    };

    const endSession = useCallback(async () => {
        try {
            console.log("Sending STOP");
            ipcService.finalizeUtterance();
            ipcService.toggleTranslation({ isTranslating: false });
            ipcService.hideOverlay();
            setIsTranslating(false);
            setSessionPhase('ended');
            
            // Get final transcripts
            const sessionData = getSessionTranscripts();
            
            if (sessionData.transcripts.length > 0) {
                addLog(`⏹️ Session stopped. Captured ${sessionData.transcripts.length} transcripts.`, 'info');
                addLog(`💡 Click "Give Summary" to summarize the conversation.`, 'info');
                
                // Automatically check if a summary already exists for this session ID
                try {
                    const existing = await goBackendService.getStoredSummary(sessionData.sessionId);
                    if (existing) {
                        addLog('📋 Restored summary from database', 'success');
                    }
                } catch {
                    console.warn('[Summarizer] Failed to check for existing summary');
                }
            } else {
                addLog('⏹️ Session stopped. No transcripts captured.', 'info');
                clearSessionTranscripts();
            }
        } catch (err) {
            console.error("Stop failed:", err);
            addLog('❌ Error stopping session', 'error');
        }
    }, [addLog, clearSessionTranscripts, getSessionTranscripts, setIsTranslating, setSessionPhase]);
    const handleGiveSummary = async () => {
        try {
            if (!authUserId) {
                setToast({
                    show: true,
                    status: 'warning',
                    title: 'Account Required',
                    message: 'Please connect your account in the header first to generate AI summaries.'
                });
                setTimeout(() => hideToast(), 3000);
                return;
            }

            const sessionData = getSessionTranscripts();
            
            if (sessionData.transcripts.length === 0) {
                addLog('⚠️ No transcripts to summarize', 'warning');
                return;
            }

            // Show 'Generating' toast for 3 seconds via global store
            setToast({
                show: true,
                status: 'generating',
                title: 'Generating Session Summary',
                message: 'Processing conversation intelligence in background...'
            });

            setTimeout(() => {
                // Only hide if we haven't completed yet
                const currentToast = useStore.getState().toast;
                if (currentToast.status === 'generating') {
                    hideToast();
                }
            }, 3000);

            addLog(`📤 Requesting summary for ${sessionData.transcripts.length} transcripts...`, 'info');
            
            try {
                // Get the user ID (fallback to installId if authUserId not set)
                const userId = authUserId || localStorage.getItem('installId') || 'anonymous';
                const token = localStorage.getItem('cyan_token') || '';

                const result = await goBackendService.requestSummarization({
                    sessionId: sessionData.sessionId,
                    userId: userId,
                    transcripts: sessionData.transcripts,
                    sourceLang: settings.sourceLang,
                    targetLang: settings.targetLang,
                    token: token
                });

                // Parse response
                const title = result.summary_title || 'Session Summary';
                
                // --- NEW: Fetch from DB to confirm storage ---
                // Show success toast via global store
                setToast({
                    show: true,
                    status: 'complete',
                    title: 'Summarization Complete',
                    message: title || 'Conversation summary is ready for review.'
                });
                
                setTimeout(() => {
                    hideToast();
                }, 5000);
                
                addLog('✅ Summary generation complete', 'success');
            } catch (apiError) {
                console.error('Go Backend error:', apiError);
                addLog(`❌ Failed to get summary: ${apiError.message}`, 'error');
                setToast({ show: false });
            }
        } catch (err) {
            console.error("Summary failed:", err);
            addLog('❌ Error getting summary', 'error');
            setToast({ show: false });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClearSession = () => {
        clearSessionTranscripts();
        setSessionPhase('idle');
        addLog('Session cleared', 'info');
    };

    // Listen for Escape key to stop translation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && (isTranslating || sessionPhase === 'paused')) {
                console.log("Escape key pressed - stopping translation");
                endSession();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [endSession, isTranslating, sessionPhase]);

    return (
        <div className="flex-1 flex flex-col p-4 space-y-5 overflow-y-auto custom-scrollbar">
            {/* Stream Control CTA */}
            <div className="relative group">
                <button
                    onClick={isTranslating ? pauseSession : (sessionPhase === 'paused' ? resumeSession : startStreaming)}
                    disabled={isSubmitting}
                    className={`w-full py-5 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all duration-500 transform active:scale-95 z-10 relative disabled:opacity-50 disabled:cursor-not-allowed ${
                        isTranslating
                            ? 'bg-red-500/10 border border-dashed border-red-500/50 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]'
                            : sessionPhase === 'paused'
                                ? 'bg-amber-500/10 border border-dashed border-amber-500/50 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.2)]'
                            : 'bg-cyan-500 border border-dashed border-cyan-400 text-black shadow-[0_0_30px_rgba(6,182,212,0.3)]'
                    }`}
                >
                    {isSubmitting ? (
                        <>
                            <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-[10px] font-black tracking-[0.2em] uppercase">Processing...</span>
                        </>
                    ) : sessionPhase === 'paused' ? (
                        <>
                            <Play className="w-5 h-5 fill-amber-400" />
                            <span className="text-[10px] font-black tracking-[0.2em] uppercase">RESUME SESSION</span>
                        </>
                    ) : isTranslating ? (
                        <>
                            <Pause className="w-5 h-5 fill-red-500" />
                            <span className="text-[10px] font-black tracking-[0.2em] uppercase">PAUSE SESSION</span>
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

            {/* Summary Actions (shown while paused or after session ends) */}
            {(isTranslating || sessionPhase === 'paused') && (
                <div className="space-y-3">
                    <button
                        onClick={endSession}
                        disabled={isSubmitting}
                        className="w-full py-4 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-dashed bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.1)]"
                    >
                        <div className="flex items-center gap-2">
                            <Square className="w-4 h-4 fill-red-400" />
                            <span className="text-[10px] font-black tracking-[0.2em] uppercase">End Session</span>
                        </div>
                    </button>

                    {sessionPhase === 'paused' && (
                        <button
                            onClick={handleGiveSummary}
                            disabled={isSubmitting}
                            className={`w-full py-4 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-dashed shadow-[0_0_30px_rgba(34,197,94,0.1)] ${
                                authUserId 
                                    ? 'bg-green-500/10 border-green-500/50 text-green-400 hover:bg-green-500/20' 
                                    : 'bg-gray-800/20 border-gray-700/50 text-gray-500 grayscale opacity-60 hover:bg-gray-800/40'
                            }`}
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                                    <span className="text-[9px] font-black tracking-[0.2em] uppercase">Summarizing...</span>
                                </>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="text-lg"><Wand2Icon/></span>
                                    <span className="text-[10px] font-black tracking-[0.2em] uppercase">Generate & Save Summary</span>
                                </div>
                            )}
                        </button>
                    )}
                </div>
            )}

            {sessionPhase === 'ended' && !isTranslating && (
                <div className="space-y-3">
                    <button
                        onClick={handleGiveSummary}
                        disabled={isSubmitting}
                        className={`w-full py-4 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-dashed shadow-[0_0_30px_rgba(34,197,94,0.1)] ${
                            authUserId 
                                ? 'bg-green-500/10 border-green-500/50 text-green-400 hover:bg-green-500/20' 
                                : 'bg-gray-800/20 border-gray-700/50 text-gray-500 grayscale opacity-60 hover:bg-gray-800/40'
                        }`}
                    >
                        {isSubmitting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                                <span className="text-[9px] font-black tracking-[0.2em] uppercase">Summarizing...</span>
                            </>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className="text-lg"><Wand2Icon/></span>
                                <span className="text-[10px] font-black tracking-[0.2em] uppercase">Generate & Save Summary</span>
                            </div>
                        )}
                    </button>
                    


                    <button
                        onClick={handleClearSession}
                        disabled={isSubmitting}
                        className="w-full py-2.5 rounded-lg glass-button text-gray-400 text-[9px] font-black tracking-widest uppercase disabled:opacity-50"
                    >
                        Clear Session
                    </button>
                </div>
            )}

            {/* Language Pair */}
            <div className="space-y-3 p-3 glass-panel rounded-xl relative z-50">
                <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                        <label className="text-[9px] text-gray-500 font-black uppercase tracking-widest">INPUT SOURCE</label>
                    </div>
                    <CustomSelect
                        value={settings.sourceLang}
                        onChange={(val) => updateSettings({ sourceLang: val })}
                        options={(settings.languages || []).map(l => ({ value: l.code, label: l.name, icon: l.flag }))}
                        disabled={isTranslating}
                        showSearch={true}
                        placeholder="Select language..."
                    />
                </div>

                <div className="flex justify-center -my-1 relative z-10">
                    <div className="p-1.5 glass-panel rounded-full shadow-lg">
                        <Activity className="w-3 h-3 text-cyan-500" />
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                        <label className="text-[9px] text-gray-500 font-black uppercase tracking-widest">OUTPUT TARGET</label>
                    </div>
                    <CustomSelect
                        value={settings.targetLang}
                        onChange={(val) => updateSettings({ targetLang: val })}
                        options={(settings.languages || []).map(l => ({ value: l.code, label: l.name, icon: l.flag }))}
                        disabled={isTranslating}
                        showSearch={true}
                        placeholder="Select language..."
                    />
                </div>
            </div>

            {/* Audio Config */}
            <div className="space-y-4 relative z-40">
                <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black text-gray-400 tracking-widest uppercase">Audio Engine</h4>
                    <Volume2 className="w-3.5 h-3.5 text-gray-600" />
                </div>

                <div className="grid grid-cols-1 gap-3">
                    <CustomSelect
                        value={settings.ttsEngine}
                        onChange={(val) => updateSettings({ ttsEngine: val })}
                        disabled={isTranslating}
                        options={[
                            { value: 'google', label: 'Google WaveNet (Standard)' },
                            { value: 'azure', label: 'Microsoft Azure (Neural)' },
                            { value: 'elevenlabs', label: 'ElevenLabs (HD Clone)' }
                        ]}
                    />

                    <button
                        onClick={() => setShowConfigModal(true)}
                        className="w-full py-2.5 glass-button rounded-lg text-gray-400 text-[9px] font-black tracking-widest uppercase"
                    >
                        Auto-Config VAC
                    </button>
                </div>
            </div>

            {/* Fine Tuning */}
            <div className="space-y-4 pt-4 border-t border-gray-800/50 relative z-30">
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

                <div className="flex items-center justify-between glass-panel p-2.5 rounded-lg">
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
