import React from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { useStore } from '../store/useStore';

export const AutoConfigModal = () => {
    const { 
        showConfigModal, 
        setShowConfigModal, 
        configStep, 
        setConfigStep, 
        isConfiguring, 
        setIsConfiguring 
    } = useStore();

    if (!showConfigModal) return null;

    const startAutoConfigProcess = async () => {
        setIsConfiguring(true);
        setConfigStep(1);
        
        // Step 1: Detect Mic
        await new Promise(r => setTimeout(r, 1500));
        setConfigStep(2);
        
        // Step 2: VAC Sync
        await new Promise(r => setTimeout(r, 2000));
        setConfigStep(3);
        
        // Step 3: Audio Route
        await new Promise(r => setTimeout(r, 1500));
        setConfigStep(4);
        
        setIsConfiguring(false);
    };

    const closeConfigModal = () => {
        setShowConfigModal(false);
        setConfigStep(0);
        setIsConfiguring(false);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-gray-900 border border-cyan-500/30 rounded-2xl p-8 w-full max-w-md shadow-[0_0_100px_rgba(6,182,212,0.1)] relative overflow-hidden">
                {/* Decorative background glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-[50px] -mr-16 -mt-16 rounded-full" />
                
                <div className="flex items-center justify-between mb-8 relative">
                    <h3 className="text-xl font-black text-white tracking-widest uppercase italic">Auto <span className="text-cyan-400">Config</span></h3>
                    <button 
                        onClick={closeConfigModal}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-500 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-6 relative">
                    {[
                        { step: 1, label: 'Microphone Calibration', desc: 'Detecting input levels and noise floor' },
                        { step: 2, label: 'Virtual Audio Cable (VAC)', desc: 'Synchronizing with system audio routing' },
                        { step: 3, label: 'Low Latency Engine', desc: 'Optimizing buffer for real-time stream' },
                        { step: 4, label: 'System Ready', desc: 'All systems operational' }
                    ].map((item) => (
                        <div key={item.step} className="flex items-start gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-500 ${
                                configStep >= item.step 
                                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.2)]' 
                                    : 'bg-gray-800 border-gray-700 text-gray-600'
                            }`}>
                                {configStep > item.step || (item.step === 4 && configStep === 4) ? (
                                    <Check className="w-5 h-5" strokeWidth={3} />
                                ) : isConfiguring && configStep === item.step ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <span className="text-sm font-black">{item.step}</span>
                                )}
                            </div>
                            <div className="flex flex-col pt-0.5">
                                <span className={`text-sm font-bold tracking-wide uppercase ${configStep >= item.step ? 'text-white' : 'text-gray-500'}`}>
                                    {item.label}
                                </span>
                                <span className="text-[11px] text-gray-600 font-medium">{item.desc}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-10 flex gap-3 relative">
                    {!isConfiguring && configStep === 0 && (
                        <button 
                            onClick={startAutoConfigProcess} 
                            className="flex-1 py-4 bg-cyan-500 text-black font-black text-xs tracking-widest rounded-xl hover:bg-cyan-400 transform active:scale-95 transition-all shadow-lg shadow-cyan-900/20 uppercase"
                        >
                            Start Optimization
                        </button>
                    )}
                    
                    {!isConfiguring && configStep === 4 && (
                        <button 
                            onClick={closeConfigModal} 
                            className="flex-1 py-4 bg-green-500 text-black font-black text-xs tracking-widest rounded-xl hover:bg-green-400 transform active:scale-95 transition-all shadow-lg shadow-green-900/20 uppercase"
                        >
                            Finish
                        </button>
                    )}

                    {!isConfiguring && configStep !== 4 && (
                         <button 
                            onClick={closeConfigModal} 
                            className="px-6 py-4 border border-gray-700 text-gray-400 font-bold text-xs tracking-widest rounded-xl hover:bg-gray-800 transition-all uppercase"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
