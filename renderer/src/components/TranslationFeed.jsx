import React from 'react';
import { useStore } from '../store/useStore';

export const TranslationFeed = () => {
    const { transcripts, isTranslating, settings } = useStore();
    const { sourceLang, targetLang } = settings;

    // Find language labels for the header
    const sourceLabel = settings.languages?.find(l => l.code === sourceLang)?.name || 'Source';
    const targetLabel = settings.languages?.find(l => l.code === targetLang)?.name || 'Translated';
    const sourceFlag = settings.languages?.find(l => l.code === sourceLang)?.flag || '🌐';
    const targetFlag = settings.languages?.find(l => l.code === targetLang)?.flag || '🌐';

    return (
        <div className="flex-1 flex flex-col bg-black/40 border border-gray-800/50 rounded-2xl overflow-hidden backdrop-blur-md shadow-2xl relative group">
            {/* Header / Legend */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-900/50 border-b border-gray-800/50">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-gray-500 tracking-widest uppercase">{sourceFlag} {sourceLabel}</span>
                    </div>
                </div>
                
                {isTranslating && (
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>
                        <span className="text-[10px] font-black text-cyan-400 tracking-widest uppercase">LIVE STREAM ACTIVE</span>
                    </div>
                )}

                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-cyan-500/70 tracking-widest uppercase">{targetFlag} {targetLabel}</span>
                </div>
            </div>
            
            {/* Feed Content */}
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">
                {transcripts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 select-none">
                        <div className="w-16 h-16 border-2 border-dashed border-gray-700 rounded-full flex items-center justify-center mb-4">
                            <span className="text-2xl">⌨️</span>
                        </div>
                        <p className="text-xs font-medium tracking-wide">
                            {isTranslating ? 'Listening for speech...' : 'Session idle. Press Start to begin.'}
                        </p>
                    </div>
                ) : (
                    transcripts.map((item, idx) => (
                        <div 
                            key={idx} 
                            className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out"
                        >
                            {/* Source Side */}
                            <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-3 shadow-inner hover:bg-gray-800/40 transition-colors">
                                <p className="text-xs leading-relaxed text-gray-300 font-medium break-words">
                                    {item.source || '...'}
                                </p>
                            </div>

                            {/* Target Side */}
                            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-3 shadow-lg hover:bg-cyan-500/10 transition-colors relative">
                                <p className="text-xs leading-relaxed text-cyan-100 font-bold break-words">
                                    {item.target || (isTranslating ? 'Translating...' : '—')}
                                </p>
                                {item.isFinal && (
                                    <div className="absolute -right-1 -top-1 w-2 h-2 bg-cyan-500 rounded-full border-2 border-black" />
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Fading bottom edge */}
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
        </div>
    );
};
