import React from 'react';
import { Terminal, Trash2, Clock, Info, AlertTriangle, Bug, RefreshCw } from 'lucide-react';
import { useStore } from '../store/useStore';

export const LogsPanel = () => {
    const { logs, clearLogs } = useStore();

    return (
        <div className="flex-1 flex flex-col glass-panel h-full animate-in fade-in duration-500">
            {/* Header */}
            <div className="px-4 py-4 md:px-6 md:py-4 bg-gray-900/50 border-b border-dashed border-gray-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-800/40 rounded-lg border border-dashed border-gray-600">
                        <Terminal className="w-4 h-4 md:w-5 md:h-5 text-cyan-400" />
                    </div>
                    <div>
                        <h2 className="text-xs md:text-sm font-black text-white tracking-widest uppercase">System Diagnostics</h2>
                        <p className="text-[9px] md:text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Real-time Backend Traffic & Error Pipeline</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
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
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-dashed border-amber-500/50 rounded-lg text-amber-500 transition-all group"
                        title="Clear all local state and tokens"
                    >
                        <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4 group-hover:rotate-180 transition-transform duration-500" />
                        <span className="text-[9px] md:text-[10px] font-black tracking-widest uppercase">Hard Reset</span>
                    </button>

                    <button 
                        onClick={clearLogs}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-dashed border-red-500/50 rounded-lg text-red-500 transition-all group"
                    >
                        <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="text-[9px] md:text-[10px] font-black tracking-widest uppercase">Flush Buffer</span>
                    </button>
                </div>
            </div>

            {/* Logs Window */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 font-mono custom-scrollbar space-y-2">
                {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 select-none">
                        <Bug className="w-10 h-10 md:w-12 md:h-12 mb-4 text-gray-500" />
                        <span className="text-[10px] md:text-xs font-bold uppercase tracking-[0.3em]">No events recorded</span>
                    </div>
                ) : (
                    logs.map((log, idx) => (
                        <div 
                            key={idx} 
                            className={`flex flex-col md:flex-row items-start gap-2 md:gap-4 p-3 rounded-lg border border-dashed leading-tight transition-all animate-in slide-in-from-left-2 duration-300 ${
                                log.type === 'error' ? 'bg-red-500/5 border-red-500/20 text-red-400' :
                                log.type === 'warn' ? 'bg-amber-500/5 border-amber-500/20 text-amber-400' :
                                'bg-gray-900/40 border-gray-800/40 text-gray-400'
                            }`}
                        >
                            <div className="flex items-center gap-2 min-w-[70px] md:min-w-[80px] opacity-40">
                                <Clock className="w-3 h-3" />
                                <span className="text-[9px] md:text-[10px] font-bold">{log.time}</span>
                            </div>

                            <div className="flex-1 flex gap-2 md:gap-3">
                                <div className="mt-0.5 hidden md:block">
                                    {log.type === 'error' ? <AlertTriangle className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                                </div>
                                <p className="text-[10px] md:text-xs break-all font-medium whitespace-pre-wrap">{log.msg}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer Stats */}
            <div className="px-4 py-3 md:px-6 bg-gray-900/50 border-t border-dashed border-gray-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0 select-none">
                <div className="flex gap-4 md:gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        <span className="text-[9px] font-black text-gray-500 tracking-widest uppercase">Buffer: {logs.length}/50</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                        <span className="text-[9px] font-black text-gray-500 tracking-widest uppercase">Critical: {logs.filter(l => l.type === 'error').length}</span>
                    </div>
                </div>
                <span className="text-[8px] md:text-[9px] font-black text-gray-600 tracking-tighter uppercase italic opacity-50">Authorized Debug Access Only</span>
            </div>
        </div>
    );
};
