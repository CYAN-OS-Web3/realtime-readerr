import React from 'react';
import { Globe, Minimize2, X, Wifi, WifiOff, LogOut, User } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ipcService } from '../services/ipcService';

export const Header = () => {
    const { 
        isConnected, 
        latency, 
        authUserId, 
        setAuthUserId, 
        setInstallId,
        addLog,
        wsConnectionState,
        isTranslating
    } = useStore();

    const handleLogout = () => {
        setAuthUserId(null);
        localStorage.removeItem('installId');
        localStorage.removeItem('cyan_token');
        addLog('User signed out.', 'info');
    };

    const [isLoggingIn, setIsLoggingIn] = React.useState(false);
    const handleLogin = async (e) => {
        if (e.altKey) {
            const manualId = '102870395312994795443';
            setAuthUserId(manualId);
            setInstallId(manualId);
            localStorage.setItem('installId', manualId);
            localStorage.setItem('cyan_token', 'dev-bypass-token-' + manualId);
            addLog('Dev Bypass: Authenticated as ' + manualId + ' (Token bypassed)', 'warn');
            return;
        }

        setIsLoggingIn(true);
        addLog('Connecting to account...', 'info');
        // const loginUrl = 'http://localhost:5174/login?autoOpenApp=1';
        const loginUrl = 'https://cyan-os-landingpage.vercel.app/login?autoOpenApp=1';
        try {
            const result = await ipcService.openExternal(loginUrl);
            if (result && result.ok) {
                addLog('Authentication window opened. Please complete login in your browser.', 'info');
            } else {
                addLog('Failed to open login window. Please check your browser settings.', 'error');
            }
        } catch (err) {
            addLog('Account connection error: ' + err.message, 'error');
        } finally {
            // Keep the loading state for a bit to prevent double clicks
            setTimeout(() => setIsLoggingIn(false), 2000);
        }
    };

    // WS connection state display helper
    const getWSIndicator = () => {
        if (!isTranslating) return null;
        const stateMap = {
            connecting:    { color: 'bg-yellow-500 animate-pulse', label: 'WS CONNECTING' },
            connected:     { color: 'bg-emerald-500', label: 'STREAM LIVE' },
            reconnecting:  { color: 'bg-amber-500 animate-pulse', label: 'RECONNECTING' },
            disconnected:  { color: 'bg-gray-500', label: 'WS DOWN' },
            failed:        { color: 'bg-red-500', label: 'WS FAILED' },
        };
        const info = stateMap[wsConnectionState] || stateMap.disconnected;
        return (
            <div className="flex items-center gap-1.5 bg-black/30 px-2 py-0.5 rounded border border-white/5">
                <div className={`w-1.5 h-1.5 rounded-full ${info.color}`} />
                <span className="text-[8px] font-black text-gray-400 tracking-widest uppercase">{info.label}</span>
            </div>
        );
    };

    return (
        <header className="h-14 bg-black/60 backdrop-blur-md border-b border-gray-800/80 flex items-center justify-between px-6 relative z-30">
            {/* Logo Section */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)] border border-white/10">
                        <img 
                            src="https://cyan-os.cc/logoCYAN.png" 
                            alt="Cyan OS" 
                            className="w-full h-full object-contain"
                        />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-xs font-black text-white tracking-widest uppercase leading-none">CYAN OS</h1>
                        <span className="text-[8px] font-bold text-cyan-500 tracking-[0.3em] uppercase opacity-80 mt-1">Real-Time Core</span>
                    </div>
                </div>

                <div className="h-6 w-px bg-gray-800 mx-2" />

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-cyan-500 animate-pulse' : 'bg-red-500'} shadow-[0_0_8px_rgba(6,182,212,0.5)]`} />
                        <span className="text-[10px] font-black text-gray-400 tracking-widest uppercase">{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
                    </div>
                    {isConnected && (
                        <span className="text-[9px] font-mono text-cyan-500/50 bg-cyan-500/5 px-2 py-0.5 rounded border border-cyan-500/10">{latency}ms</span>
                    )}
                    {getWSIndicator()}
                </div>
            </div>

            {/* Window Controls & User */}
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                    {authUserId ? (
                        <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-full pl-1.5 pr-3 py-1 group hover:border-cyan-500/50 transition-all cursor-default">
                            <div className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center text-[10px] font-black text-black">
                                {authUserId.slice(0,2).toUpperCase()}
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 max-w-[100px] truncate">{authUserId}</span>
                            <button onClick={handleLogout} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                                <LogOut className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleLogin}
                            disabled={isLoggingIn}
                            className={`flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all text-[10px] text-white font-black tracking-widest uppercase group ${isLoggingIn ? 'opacity-50 cursor-wait' : ''}`}
                        >
                            <User className={`w-3.5 h-3.5 text-gray-400 group-hover:text-cyan-400 ${isLoggingIn ? 'animate-pulse text-cyan-400' : ''}`} />
                            <span>{isLoggingIn ? 'CONNECTING...' : 'Connect Account'}</span>
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3 border-l border-gray-800 pl-4">
                    <button onClick={() => ipcService.minimizeWindow()} className="p-1 hover:bg-white/5 rounded transition-colors text-gray-500 hover:text-white">
                        <Minimize2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => ipcService.closeWindow()} className="p-1 hover:bg-red-500/20 rounded transition-colors text-gray-500 hover:text-red-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </header>
    );
};
