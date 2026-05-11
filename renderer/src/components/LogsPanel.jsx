import React from 'react';
import { Terminal, Trash2, Clock, Info, AlertTriangle, Bug, RefreshCw } from 'lucide-react';
import { useStore } from '../store/useStore';

export const LogsPanel = () => {
    const { logs, clearLogs } = useStore();

    return (
        <div className="flex-1 flex flex-col bg-gray-950/50 h-full animate-in fade-in duration-500">
            {/* Header */}
            <div className="px-6 py-4 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-800 rounded-lg border border-gray-700">
                        <Terminal className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-white tracking-widest uppercase">System Diagnostics</h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Real-time Backend Traffic & Error Pipeline</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => {
                            // Clear all cyan_ related storage
                            Object.keys(localStorage).forEach(key => {
                                if (key.startsWith('cyan_') || key === 'installId') {
                                    localStorage.removeItem(key);
                                }
                            });
                            window.location.reload();
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-500 transition-all group"
                        title="Clear all local state and tokens"
                    >
                        <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                        <span className="text-[10px] font-black tracking-widest uppercase">Hard Reset</span>
                    </button>

                    <button 
                        onClick={clearLogs}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-500 transition-all group"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-[10px] font-black tracking-widest uppercase">Flush Buffer</span>
                    </button>
                </div>
            </div>

            {/* Logs Window */}
            <div className="flex-1 overflow-y-auto p-6 font-mono custom-scrollbar space-y-2">
                {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 select-none">
                        <Bug className="w-12 h-12 mb-4 text-gray-500" />
                        <span className="text-xs font-bold uppercase tracking-[0.3em]">No events recorded</span>
                    </div>
                ) : (
                    logs.map((log, idx) => (
                        <div 
                            key={idx} 
                            className={`flex items-start gap-4 p-3 rounded-lg border leading-tight transition-all animate-in slide-in-from-left-2 duration-300 ${
                                log.type === 'error' ? 'bg-red-500/5 border-red-500/20 text-red-400' :
                                log.type === 'warn' ? 'bg-amber-500/5 border-amber-500/20 text-amber-400' :
                                'bg-gray-900/40 border-gray-800/40 text-gray-400'
                            }`}
                        >
                            <div className="flex items-center gap-2 min-w-[80px] opacity-40">
                                <Clock className="w-3 h-3" />
                                <span className="text-[10px] font-bold">{log.time}</span>
                            </div>

                            <div className="flex-1 flex gap-3">
                                <div className="mt-0.5">
                                    {log.type === 'error' ? <AlertTriangle className="w-3 h-3 h-3" /> : <Info className="w-3 h-3" />}
                                </div>
                                <p className="text-xs break-all font-medium whitespace-pre-wrap">{log.msg}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer Stats */}
            <div className="px-6 py-3 bg-gray-900/80 border-t border-gray-800 flex items-center justify-between select-none">
                <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        <span className="text-[9px] font-black text-gray-500 tracking-widest uppercase">Buffer: {logs.length}/50</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                        <span className="text-[9px] font-black text-gray-500 tracking-widest uppercase">Critical: {logs.filter(l => l.type === 'error').length}</span>
                    </div>
                </div>
                <span className="text-[9px] font-black text-gray-600 tracking-tighter uppercase italic opacity-50">Authorized Debug Access Only</span>
            </div>
        </div>
    );
};
