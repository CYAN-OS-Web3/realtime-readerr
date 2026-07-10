import React, { useState, useEffect } from 'react';
import { User, LogOut, Loader2, CreditCard, Activity } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ipcService } from '../services/ipcService';

export const ProfilePage = () => {
    const { 
        authUserId, 
        setAuthUserId,
        addLog,
        backendUrl
    } = useStore();

    const [profile, setProfile] = useState(null);
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!authUserId) return;
        
        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem('cyan_token');
                if (!token) throw new Error("Authentication token not found.");

                const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
                // Default backend URL to localhost if not set in state
                const baseUrl = backendUrl || 'http://localhost:8080';

                // Fetch Profile
                let pRes = await fetch(`${baseUrl}/api/v1/user/profile`, { headers });
                if (!pRes.ok) {
                    pRes = await fetch(`${baseUrl}/api/v1/user/profile`, { headers });
                }
                if (pRes.ok) {
                    const pData = await pRes.json();
                    if (isMounted) {
                        setProfile(pData.data);
                    }
                } else {
                    throw new Error("Failed to load profile details.");
                }

                // Fetch Subscription
                let sRes = await fetch(`${baseUrl}/api/v1/user/subscription`, { headers });
                if (!sRes.ok) {
                    sRes = await fetch(`${baseUrl}/api/v1/user/subscription`, { headers });
                }
                if (sRes.ok) {
                    const sData = await sRes.json();
                    if (isMounted) setSubscription(sData.data);
                }

            } catch (err) {
                console.error(err);
                if (isMounted) setError(err.message);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [authUserId, backendUrl]);

    const handleLogout = () => {
        setAuthUserId(null);
        localStorage.removeItem('installId');
        localStorage.removeItem('cyan_token');
        localStorage.removeItem('cyan_user');
        addLog('User signed out.', 'info');
    };

    if (!authUserId) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-950/50 h-full animate-in fade-in duration-500">
                <User className="w-16 h-16 text-gray-700 mb-4" />
                <h2 className="text-xl font-black text-white tracking-widest uppercase mb-2">Not Logged In</h2>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Connect your account to view profile</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-gray-950/50 h-full animate-in fade-in duration-500">
            {/* Header */}
            <div className="px-6 py-4 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-800 rounded-lg border border-gray-700">
                        <User className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-white tracking-widest uppercase">User Profile</h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Account Status & Quotas</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-500 transition-all group"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="text-[10px] font-black tracking-widest uppercase">Sign Out</span>
                    </button>
                </div>
            </div>

            {/* Profile Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative z-10">
                <div className="max-w-5xl mx-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32 text-cyan-500">
                            <Loader2 className="w-10 h-10 animate-spin mb-4" />
                            <p className="text-xs tracking-widest font-bold uppercase text-cyan-500/70">Loading Profile...</p>
                        </div>
                    ) : error ? (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-8 text-center mt-12">
                            <p className="text-lg font-bold text-red-400 mb-2">Error Loading Profile</p>
                            <p className="text-sm text-red-400/70">{error}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            {/* Left Column: User Details and Quota */}
                            <div className="space-y-8 flex flex-col">
                                {/* Profile Details */}
                                <div className="bg-black/40 border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden shrink-0">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 blur-[80px] -mr-32 -mt-32 rounded-full pointer-events-none" />
                                    
                                    <div className="flex items-center justify-between mb-6 relative z-10">
                                        <h4 className="text-xs font-black text-gray-400 tracking-[0.2em] uppercase flex items-center gap-2">
                                            <User className="w-4 h-4" />
                                            Identity
                                        </h4>
                                    </div>

                                    <div className="space-y-6 text-sm relative z-10">
                                        <div className="flex items-center gap-6">
                                            <div className="w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center text-2xl font-black text-cyan-400 border border-cyan-500/30 shrink-0">
                                                {(profile?.first_name?.[0] || profile?.username?.[0] || 'U').toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-bold text-white text-xl">
                                                    {profile?.first_name || profile?.last_name ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : profile?.username || 'User'}
                                                </div>
                                                <div className="text-gray-400 text-sm mt-1">{profile?.email}</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 mt-6 bg-white/5 p-4 rounded-xl border border-white/5">
                                            <div>
                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Account Status</span>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${profile?.is_active ? 'bg-emerald-400' : 'bg-red-400'} shadow-[0_0_10px_currentColor]`} />
                                                    <span className="text-sm font-bold text-gray-300 capitalize">{profile?.status || 'Unknown'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Quotas */}
                                {subscription && (
                                    <div className="bg-black/40 border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden flex-1">
                                        <div className="flex items-center justify-between mb-6 relative z-10">
                                            <h4 className="text-xs font-black text-gray-400 tracking-[0.2em] uppercase flex items-center gap-2">
                                                <Activity className="w-4 h-4" />
                                                Quotas
                                            </h4>
                                        </div>
                                        
                                        <div className="space-y-6 relative z-10">
                                            <div className="bg-white/5 border border-white/5 rounded-xl p-4">
                                                <div className="flex justify-between text-sm mb-2 font-bold">
                                                    <span className="text-gray-400 uppercase tracking-widest text-[10px]">Monthly TTS Generation</span>
                                                    <span className="text-cyan-400 font-mono">{subscription.chars_used.toLocaleString()} <span className="text-gray-500">/ {subscription.chars_limit.toLocaleString()} chars</span></span>
                                                </div>
                                                <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden border border-white/5">
                                                    <div 
                                                        className={`h-full rounded-full transition-all duration-1000 ${subscription.chars_percent > 90 ? 'bg-red-500' : subscription.chars_percent > 75 ? 'bg-amber-400' : 'bg-cyan-500'} shadow-[0_0_10px_currentColor]`}
                                                        style={{ width: `${Math.min(100, subscription.chars_percent)}%` }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-white/5 border border-white/5 rounded-xl p-4 hover:bg-white/10 transition-colors">
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">ElevenLabs Credits</span>
                                                    <div className="text-lg font-black text-white font-mono flex items-baseline gap-1">
                                                        {subscription.eleven_credits_used?.toLocaleString() || 0} 
                                                        <span className="text-gray-500 font-medium text-xs">/ {subscription.eleven_credits_limit?.toLocaleString() || 'N/A'}</span>
                                                    </div>
                                                </div>
                                                <div className="bg-white/5 border border-white/5 rounded-xl p-4 hover:bg-white/10 transition-colors">
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Time Used</span>
                                                    <div className="text-lg font-black text-white font-mono flex items-baseline gap-1">
                                                        {subscription.minutes_used} 
                                                        <span className="text-gray-500 font-medium text-xs">/ {subscription.minutes_limit} min</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right Column: Plan Details */}
                            <div className="flex flex-col">
                                {subscription && (
                                    <div className="bg-black/40 border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden flex-1 flex flex-col">
                                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-600/10 blur-[80px] -ml-32 -mb-32 rounded-full pointer-events-none" />

                                        <div className="flex items-center justify-between mb-6 relative z-10 shrink-0">
                                            <h4 className="text-xs font-black text-gray-400 tracking-[0.2em] uppercase flex items-center gap-2">
                                                <CreditCard className="w-4 h-4" />
                                                Plan Details
                                            </h4>
                                        </div>

                                        <div className="flex-1 flex flex-col justify-center items-center relative z-10 py-12">
                                            <div className="text-center w-full max-w-sm mx-auto">
                                                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-8 relative group hover:bg-white/10 transition-colors overflow-hidden">
                                                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    <span className="text-gray-500 text-[10px] font-bold tracking-[0.3em] uppercase block mb-3 relative z-10">Current Plan</span>
                                                    <div className="text-3xl font-black text-cyan-400 tracking-widest uppercase relative z-10">
                                                        {subscription.plan_display || subscription.plan}
                                                    </div>
                                                </div>
                                                
                                                <button 
                                                    onClick={() => ipcService.openExternal('https://cyan-os.cc/')}
                                                    className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black tracking-[0.2em] uppercase rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_35px_rgba(6,182,212,0.6)] hover:-translate-y-0.5 active:translate-y-0 flex justify-center items-center gap-2"
                                                >
                                                    <Activity className="w-4 h-4" />
                                                    Upgrade Plan
                                                </button>
                                                <p className="mt-4 text-[10px] text-gray-500 font-medium tracking-widest uppercase">
                                                    Unlock more features and higher quotas
                                                </p>
                                            </div>
                                        </div>

                                        {subscription.reset_date && (
                                            <div className="mt-auto pt-6 border-t border-white/10 text-xs text-gray-400 uppercase tracking-widest font-bold flex flex-col gap-3 shrink-0">
                                                <div className="flex items-center justify-between bg-black/40 p-4 rounded-xl border border-white/5">
                                                    <div className="flex items-center gap-3">
                                                        <Activity className="w-4 h-4 text-cyan-500" />
                                                        <span>Data Access</span>
                                                    </div>
                                                    <span className="text-white bg-white/10 px-3 py-1 rounded-md">{subscription.data_access}</span>
                                                </div>
                                                <div className="flex items-center justify-between bg-black/40 p-4 rounded-xl border border-white/5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                                        <span>Resets</span>
                                                    </div>
                                                    <span className="text-white bg-white/10 px-3 py-1 rounded-md">{new Date(subscription.reset_date).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
