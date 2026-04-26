import React from 'react';
import { useStore } from './store/useStore';
import { useAudioPipeline } from './hooks/useAudioPipeline';
import { useTranslationFeed } from './hooks/useTranslationFeed';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ControlPanel } from './components/ControlPanel';
import { TranslationFeed } from './components/TranslationFeed';
import { VoiceManager } from './components/VoiceManager';
import { LogsPanel } from './components/LogsPanel';
import { AutoConfigModal } from './components/AutoConfigModal';
import { X, ExternalLink, Activity, Settings2 } from 'lucide-react';

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
        <div className="fixed bottom-12 right-12 w-[420px] bg-black/40 backdrop-blur-3xl border border-white/5 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-50 animate-slide-up select-none ring-1 ring-cyan-500/10">
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
                <div className="relative space-y-4 bg-black/20 rounded-2xl p-4 border border-white/5 overflow-hidden">
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
                    <div className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{settings.sourceLang.split('-')[0]}</span>
                    </div>
                    <div className="w-4 h-[1px] bg-gray-800"></div>
                    <div className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/10">
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
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-6 border border-red-500/50">
                        <X className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-black text-white mb-2 uppercase tracking-widest">Initialization Failed</h1>
                    <p className="text-red-400 font-mono text-xs max-w-md bg-black/40 p-4 rounded-lg border border-red-900/30 whitespace-pre-wrap">
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
                        className="mt-8 px-6 py-2 bg-gray-900 border border-gray-800 rounded-full text-xs font-bold text-gray-400 hover:text-white transition-all uppercase tracking-widest"
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
    const { activeTab, showConfigModal } = useStore();
    
    // Initialize standard pipes
    useAudioPipeline();
    useTranslationFeed();

    const renderContent = () => {
        switch (activeTab) {
            case 'translation':
                return (
                    <div className="flex-1 flex gap-6 p-6 overflow-hidden">
                        <div className="w-80 flex flex-col gap-6">
                            <div className="flex-1 bg-gray-900/40 backdrop-blur-md border border-gray-800 rounded-2xl overflow-hidden flex flex-col shadow-xl">
                                <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
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
            case 'logs':
                return <LogsPanel />;
            default:
                return null;
        }
    };

    return (
        <div className="relative h-screen bg-[#050505] text-gray-100 flex flex-col overflow-hidden font-sans selection:bg-cyan-500/30">
            <BubbleBackground />
            <Header />
            
            <div className="flex-1 flex overflow-hidden relative z-10">
                <Sidebar />
                <main className="flex-1 flex flex-col relative overflow-hidden">
                    {renderContent()}
                </main>
            </div>

            <FloatingOverlay />
            
            {showConfigModal && <AutoConfigModal />}

            {/* Essential for TTS longevity on Windows */}
            <audio id="keep-alive-audio" className="hidden" />
        </div>
    );
};

export default function App() {
    const [resetToken, setResetToken] = React.useState(0);

    return (
        <ErrorBoundary onReset={() => setResetToken((value) => value + 1)}>
            <AppShell key={resetToken} />
        </ErrorBoundary>
    );
}
