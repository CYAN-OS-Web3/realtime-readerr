import React, { useRef } from 'react';
import { Upload, Crown, CreditCard, CheckCircle2, AlertCircle, PlayCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useVoiceManagement } from '../hooks/useVoiceManagement';

export const VoiceManager = () => {
    const { 
        voiceOrderId, 
        voiceApprovalUrl, 
        voiceUiStatus, 
        voiceSample, 
        setVoiceState,
        isTranslating,
        installId
    } = useStore();

    const { createVoiceChangeOrder, completeVoiceChange, assignInitialVoice } = useVoiceManagement();
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) {
                setVoiceState({ voiceUiStatus: 'File too large (Max 10MB)' });
                return;
            }
            setVoiceState({ voiceSample: file, voiceUiStatus: 'File selected: ' + file.name });
        }
    };

    return (
        <div className="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-8 animate-in fade-in duration-500">
            {/* Hero Section */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950/40 via-cyan-950/20 to-black border border-cyan-500/20 p-8 shadow-2xl">
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                    <div className="w-24 h-24 bg-cyan-500/20 rounded-full flex items-center justify-center border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.2)]">
                        <Crown className="w-12 h-12 text-cyan-400" />
                    </div>
                    
                    <div className="flex-1 text-center md:text-left">
                        <h2 className="text-2xl font-black text-white tracking-tight mb-2">ELEVENLABS VOICE CLONING</h2>
                        <p className="text-gray-400 text-sm leading-relaxed max-w-xl">
                            Transform your real-time translation experience with your own voice. Upload a sample to create a digital dual that sounds exactly like you.
                        </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-black text-cyan-500 tracking-[0.2em] uppercase">MEMBER LEVEL</span>
                        <div className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-cyan-400 text-[10px] font-bold">LEGACY GOLD</div>
                    </div>
                </div>
            </div>

            {/* Main Flow */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Step 1: Upload */}
                <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center border border-gray-700">
                            <span className="text-xs font-black text-cyan-400">01</span>
                        </div>
                        <h3 className="text-sm font-bold text-gray-200 uppercase tracking-widest">Voice Sample</h3>
                    </div>

                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={`group flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-8 transition-all cursor-pointer ${
                            voiceSample 
                                ? 'border-cyan-500/50 bg-cyan-500/5' 
                                : 'border-gray-800 hover:border-gray-600 hover:bg-white/5'
                        }`}
                    >
                        <input 
                            ref={fileInputRef}
                            type="file" 
                            accept="audio/*" 
                            className="hidden" 
                            onChange={handleFileChange}
                            disabled={isTranslating}
                        />
                        <Upload className={`w-10 h-10 mb-4 transition-transform group-hover:-translate-y-1 ${voiceSample ? 'text-cyan-400' : 'text-gray-600'}`} />
                        <span className="text-xs font-bold text-gray-400 text-center">
                            {voiceSample ? voiceSample.name : 'CLICK TO UPLOAD MP3/WAV'}
                        </span>
                        <span className="text-[10px] text-gray-600 mt-2 italic">Recommended: 30-60 seconds of clear speech</span>
                    </div>
                </div>

                {/* Step 2: Assign / Pay */}
                <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center border border-gray-700">
                            <span className="text-xs font-black text-cyan-400">02</span>
                        </div>
                        <h3 className="text-sm font-bold text-gray-200 uppercase tracking-widest">Processing</h3>
                    </div>

                    <div className="flex-1 flex flex-col gap-4">
                        {!voiceApprovalUrl ? (
                            <button
                                onClick={assignInitialVoice}
                                disabled={!voiceSample || isTranslating}
                                className="flex-1 bg-cyan-500/10 border border-cyan-500/30 rounded-xl flex items-center justify-between px-6 hover:bg-cyan-500/20 transition-all disabled:opacity-30 group"
                            >
                                <div className="flex flex-col items-start py-4">
                                    <span className="text-xs font-black text-cyan-400 uppercase tracking-wider">Free Assignment</span>
                                    <span className="text-[10px] text-gray-500 uppercase">Initial setup / Legacy user</span>
                                </div>
                                <CheckCircle2 className="w-5 h-5 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        ) : (
                            <button
                                onClick={completeVoiceChange}
                                disabled={!voiceSample || isTranslating}
                                className="flex-1 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center justify-between px-6 hover:bg-green-500/20 transition-all disabled:opacity-30 group"
                            >
                                <div className="flex flex-col items-start py-4">
                                    <span className="text-xs font-black text-green-400 uppercase tracking-wider">Complete Order</span>
                                    <span className="text-[10px] text-gray-500 uppercase">Deploy Trained Model</span>
                                </div>
                                <PlayCircle className="w-5 h-5 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        )}

                        {!voiceOrderId && (
                            <button
                                onClick={createVoiceChangeOrder}
                                disabled={isTranslating}
                                className="flex-1 bg-indigo-500 border border-indigo-400 rounded-xl flex items-center justify-between px-6 hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20 group py-4 h-full"
                            >
                                <div className="flex flex-col items-start">
                                    <span className="text-xs font-black text-white uppercase tracking-wider">Premium Voice Update</span>
                                    <span className="text-[10px] text-indigo-100/70 uppercase">Pay $5 via PayPal</span>
                                </div>
                                <CreditCard className="w-5 h-5 text-white" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Status Bar */}
            {voiceUiStatus && (
                <div className={`p-4 rounded-xl border flex items-center gap-3 animate-in slide-in-from-top-2 duration-300 ${
                    voiceUiStatus.includes('success') 
                        ? 'bg-green-500/10 border-green-500/30 text-green-400' 
                        : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                }`}>
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-xs font-bold leading-none tracking-wide">{voiceUiStatus}</span>
                </div>
            )}
            
            {/* Footer / ID */}
            <div className="flex items-center justify-between px-2 opacity-30 select-none">
                <span className="text-[9px] font-mono">INSTALL_ID: {installId}</span>
                <span className="text-[9px] font-mono">ENGINE: ELEVEN_V2_TURBO</span>
            </div>
        </div>
    );
};
