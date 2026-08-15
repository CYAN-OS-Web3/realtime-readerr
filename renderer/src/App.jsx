import React from 'react';
import { SignJWT } from 'jose';
import { useStore } from './store/useStore';
import { ipcService } from './services/ipcService';
import { useAudioPipeline } from './hooks/useAudioPipeline';
import { useTranslationFeed } from './hooks/useTranslationFeed';
import { useAuthListener } from './hooks/useAuthListener';
import { useMiniPayConnect } from './hooks/useMiniPayConnect';
import { IS_WEB } from './web3/config';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ControlPanel } from './components/ControlPanel';
import { TranslationFeed } from './components/TranslationFeed';
import { VoiceManager } from './components/VoiceManager';
import { LogsPanel } from './components/LogsPanel';
import { SummariesPage } from './components/SummariesPage';
import { AutoConfigModal } from './components/AutoConfigModal';
import { ProfileModal } from './components/ProfileModal';
import { ProfilePage } from './components/ProfilePage';
import { PaymentGate } from './components/PaymentGate';
import { MobileTabBar } from './components/MobileTabBar';
import { X, ExternalLink, Activity, Settings2, Loader2, CheckCircle2 } from 'lucide-react';

const BubbleBackground = () => (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[150px] rounded-full animate-pulse delay-700" />
    </div>
);

const FloatingOverlay = () => {
    const { transcripts, showOverlay, setShowOverlay, settings } = useStore();
    if (!showOverlay || transcripts.length === 0) return null;

    const last = transcripts[0];

    return (
        <div className="hidden md:block fixed bottom-12 right-12 w-[420px] glass-panel rounded-3xl p-6 z-50 animate-slide-up select-none ring-1 ring-cyan-500/10">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
                    </div>
                    <span className="text-[10px] font-black text-cyan-400/80 tracking-[0.3em] uppercase">Visual HUD</span>
                </div>
                <button 
                    onClick={() => setShowOverlay(false)} 
                    className="p-1.5 hover:bg-white/5 rounded-full transition-all text-gray-500 hover:text-white"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            
            <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 to-transparent blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative space-y-4 bg-black/20 rounded-2xl p-4 border border-dashed border-white/5 overflow-hidden">
                    <div>
                        <p className="text-[9px] font-black text-cyan-500/40 uppercase tracking-[0.2em] mb-2">Translation Pipeline</p>
                        <p className="text-lg font-bold text-white leading-[1.4] tracking-tight drop-shadow-sm select-text">
                            {last.target}
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-5 flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                    <div className="px-2 py-0.5 rounded-md bg-white/5 border border-dashed border-white/5">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{settings.sourceLang.split('-')[0]}</span>
                    </div>
                    <div className="w-4 h-[1px] bg-gray-800"></div>
                    <div className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-dashed border-cyan-500/10">
                        <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">{settings.targetLang.split('-')[0]}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Activity className="w-3 h-3 text-cyan-500/30" />
                    <span className="text-[8px] font-mono font-bold text-cyan-500/30 uppercase tracking-tighter">Latency: Ultra Low</span>
                </div>
            </div>
        </div>
    );
};

// Error Boundary Logic
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen bg-gray-950 flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-6 border border-dashed border-red-500/50">
                        <X className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-black text-white mb-2 uppercase tracking-widest">Initialization Failed</h1>
                    <p className="text-red-400 font-mono text-xs max-w-md bg-black/40 p-4 rounded-lg border border-dashed border-red-900/30 whitespace-pre-wrap">
                        {this.state.error?.toString()}
                    </p>
                    <button
                        onClick={() => {
                            if (typeof this.props.onReset === 'function') {
                                this.props.onReset();
                                return;
                            }
                            window.location.reload();
                        }}
                        className="mt-8 px-6 py-2 glass-button rounded-full text-xs font-bold text-gray-400 hover:text-white uppercase tracking-widest"
                    >
                        Refresh Application
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const AppShell = () => {
    const { activeTab, showConfigModal, addLog, setAuthUserId, toast, hideToast } = useStore();
    
    // Initialize hooks
    useAudioPipeline();
    useTranslationFeed();
    useAuthListener(); // Listen for OAuth token from backend (Electron)

    // MiniPay: auto-connect injected wallet
    const { address: walletAddress } = useMiniPayConnect();
    // Authenticate with backend and auto-register if missing
    const authenticateMiniPayUser = React.useCallback(async () => {
        try {
            const backendUrl = "https://translator-gateway.fly.dev";
            const email = `${walletAddress.slice(0, 8)}@minipay.celo`;
            const password = walletAddress;
            const username = `minipay_${walletAddress.slice(0, 6)}`;

            let userToken = null;
            let userData = null;

            // 1. Try to Login
            try {
                const loginRes = await fetch(`${backendUrl}/api/v1/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });
                
                if (!loginRes.ok) throw new Error("Login failed");
                const loginData = await loginRes.json();
                userToken = loginData.data?.token;
                userData = loginData.data?.user;
            } catch {
                // 2. If login fails, Register
                console.log("[MiniPay] Login failed, registering new user...");
                const regRes = await fetch(`${backendUrl}/api/v1/auth/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email,
                        username,
                        password,
                        first_name: "MiniPay",
                        last_name: "User"
                    }),
                });
                
                if (!regRes.ok) throw new Error("Registration failed");
                
                // 3. Login again after successful registration
                const loginRes = await fetch(`${backendUrl}/api/v1/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });
                
                if (!loginRes.ok) throw new Error("Login after registration failed");
                const loginData = await loginRes.json();
                userToken = loginData.data?.token;
                userData = loginData.data?.user;
            }

            if (!userToken || !userData) {
                throw new Error("Failed to authenticate with backend");
            }

            setAuthUserId(userData.id);
            localStorage.setItem('cyan_token', userToken);
            localStorage.setItem('cyan_user', JSON.stringify(userData));
            addLog(`MiniPay session authenticated (Plan: ${userData.plan || "free"}).`, 'info');
        } catch (err) {
            console.error("[MiniPay] Authentication flow failed", err);
            addLog(`Authentication failed: ${err.message}`, 'error');
        }
    }, [walletAddress, setAuthUserId, addLog]);

    React.useEffect(() => {
        if (!IS_WEB || !walletAddress) return;
        addLog(`Wallet connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`, 'success');
        authenticateMiniPayUser();
    }, [walletAddress, addLog, authenticateMiniPayUser]);

    // Listen for OAuth callback token from backend (URL Params)
    React.useEffect(() => {
        if (IS_WEB) {
            // In web mode, we manually poll the backend health since we don't have Electron IPC
            const checkHealth = async () => {
                try {
                    const backendUrl = 'https://translator-gateway.fly.dev';
                    const start = performance.now();
                    const res = await fetch(`${backendUrl}/health`, { method: 'GET' });
                    const latency = Math.round(performance.now() - start);
                    
                    if (res.ok) {
                        useStore.getState().setConnection(true, latency);
                        addLog(`Backend connected (ping: ${latency}ms)`, 'success');
                    } else {
                        useStore.getState().setConnection(false, 0);
                        addLog(`Backend health check returned ${res.status}`, 'error');
                    }
                } catch (err) {
                    useStore.getState().setConnection(false, 0);
                    addLog(`Backend offline: ${err.message}`, 'error');
                }
            };
            
            checkHealth();
            const intervalId = setInterval(checkHealth, 30000);
            return () => clearInterval(intervalId);
        }
    }, [addLog]);

    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        
        // Check if dev token is set in URL for testing
        const devToken = params.get('devToken');
        if (devToken && devToken !== 'undefined') {
            console.log('[Auth] Dev Token from URL detected');
            localStorage.setItem('cyan_token', devToken);
            addLog('✅ Dev Token applied from URL', 'success');
        }

        // Check for production token in URL
        const urlToken = params.get('token');
        if (urlToken) {
            console.log('✓ Token received from URL parameter');
            localStorage.setItem('cyan_token', urlToken);
            const urlUser = params.get('user');
            if (urlUser) {
                localStorage.setItem('cyan_user', urlUser);
                setAuthUserId(urlUser);
            }
            addLog('✅ Account connected via URL', 'success');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [addLog, setAuthUserId]);

    React.useEffect(() => {
        const unsub = ipcService.onAuthSync(async (data) => {
            if (data?.token) {
                localStorage.setItem('cyan_token', data.token);
                
                let fetchedUser = null;
                try {
                    const res = await fetch('https://translator-gateway.fly.dev/api/v1/user/profile', {
                        headers: { 'Authorization': `Bearer ${data.token}` }
                    });
                    if (res.ok) {
                        const profileData = await res.json();
                        fetchedUser = profileData.data;
                    }
                } catch (e) {
                    console.error('[Auth] Failed to fetch profile', e);
                }

                const userToSave = fetchedUser || data.user;

                if (userToSave) {
                    localStorage.setItem('cyan_user', JSON.stringify(userToSave));
                } else if (data.userId) {
                    localStorage.setItem('cyan_user', data.userId);
                }
                setAuthUserId(data.userId || (userToSave && (userToSave.id || userToSave.email)) || 'synced-user');
                
                if (data.isAutoGenerated) {
                    addLog('⚠️ No token found in deep link. App auto-generated a fallback token.', 'warning');
                } else {
                    addLog('✅ Authentication synced from system', 'success');
                }
                console.log('[Auth] Token stored from main process. Auto-generated:', !!data.isAutoGenerated);
            }
        });

        return () => {
            if (typeof unsub === 'function') unsub();
        };
    }, []);

    const renderContent = () => {
        switch (activeTab) {
            case 'translation':
                return (
                    <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-6 p-4 md:p-6 overflow-hidden min-h-0">
                        <div className="w-full md:w-80 flex flex-col gap-4 md:gap-6 shrink-0 flex-1 md:flex-none min-h-0">
                            <div className="flex-1 glass-panel rounded-2xl overflow-hidden flex flex-col min-h-0">
                                <div className="px-5 py-4 border-b border-dashed border-gray-800 flex items-center gap-2">
                                    <Settings2 className="w-4 h-4 text-cyan-500" />
                                    <span className="text-[10px] font-black text-gray-300 tracking-widest uppercase">Quick Settings</span>
                                </div>
                                <ControlPanel />
                            </div>
                        </div>
                        <TranslationFeed />
                    </div>
                );
            case 'voice':
                return <VoiceManager />;
            case 'summaries':
                return <SummariesPage />;
            case 'logs':
                return <LogsPanel />;
            case 'profile':
                return <ProfilePage />;
            default:
                return null;
        }
    };

    const appContent = (
        <div className="relative h-screen bg-[#050505] text-gray-100 flex flex-col overflow-hidden font-sans selection:bg-cyan-500/30">
            <BubbleBackground />
            <Header />
            
            <div className="flex-1 flex overflow-hidden relative z-10 min-h-0">
                <Sidebar className="desktop-sidebar" />
                <main className="flex-1 flex flex-col relative overflow-hidden min-h-0" style={IS_WEB ? { paddingBottom: '0' } : {}}>
                    {renderContent()}
                </main>
            </div>
            {IS_WEB && <MobileTabBar />}

            <FloatingOverlay />
            
            {showConfigModal && <AutoConfigModal />}
            <ProfileModal />

            {/* Global Floating Toast System */}
            {toast.show && (
                <div className="fixed bottom-6 right-6 z-[100] animate-slide-up">
                    <div className={`glass-panel rounded-2xl p-4 flex items-start gap-4 min-w-[320px] ring-1 transition-all duration-500 ${
                        toast.status === 'generating' ? 'border-cyan-500/30 ring-cyan-500/20' : 
                        toast.status === 'warning' ? 'border-amber-500/30 ring-amber-500/20' :
                        'border-emerald-500/30 ring-emerald-500/20'
                    }`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border border-dashed shrink-0 ${
                            toast.status === 'generating' ? 'bg-cyan-500/10 border-cyan-500/20' : 
                            toast.status === 'warning' ? 'bg-amber-500/10 border-amber-500/20' :
                            'bg-emerald-500/10 border-emerald-500/20'
                        }`}>
                            {toast.status === 'generating' ? (
                                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                            ) : toast.status === 'warning' ? (
                                <Activity className="w-5 h-5 text-amber-400" />
                            ) : (
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            )}
                        </div>
                        <div className="flex-1 pt-0.5">
                            <h4 className={`text-[11px] font-black uppercase tracking-[0.2em] mb-1 ${
                                toast.status === 'generating' ? 'text-cyan-400' : 
                                toast.status === 'warning' ? 'text-amber-400' :
                                'text-emerald-400'
                            }`}>
                                {toast.title || (toast.status === 'generating' ? 'Processing Task' : 'Task Complete')}
                            </h4>
                            <p className="text-xs text-gray-200 font-medium leading-relaxed">
                                {toast.message}
                            </p>
                        </div>
                        <button 
                            onClick={hideToast}
                            className="p-1 hover:bg-white/5 rounded-full transition-colors text-gray-500 hover:text-white"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Essential for TTS longevity on Windows */}
            <audio id="keep-alive-audio" className="hidden" />
        </div>
    );

    if (IS_WEB) {
        if (!walletAddress) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505] text-cyan-500 font-black tracking-widest uppercase">
                    <Loader2 className="w-8 h-8 animate-spin mb-4" />
                    <p>Connecting Wallet...</p>
                </div>
            );
        }

        return (
            <PaymentGate
                onPaymentSuccess={async ({ hash }) => {
                    addLog(`Payment confirmed: ${hash.slice(0, 10)}...`, 'success');
                    try {
                        const token = localStorage.getItem('cyan_token');
                        const backendUrl = "https://translator-gateway.fly.dev";
                        await fetch(`${backendUrl}/api/v1/payment/minipay/activate`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ transaction_hash: hash })
                        });
                        addLog("Plan updated in backend to Pro!", "success");
                    } catch (e) {
                        console.error("Failed to activate plan on backend", e);
                    }
                    authenticateMiniPayUser(); // Refresh the real token from backend
                }}
            >
                {appContent}
            </PaymentGate>
        );
    }

    return appContent;
};

export default function App() {
    const [resetToken, setResetToken] = React.useState(0);

    return (
        <ErrorBoundary onReset={() => setResetToken((value) => value + 1)}>
            <AppShell key={resetToken} />
        </ErrorBoundary>
    );
}
