import React, { useState, useEffect } from 'react';
import { X, User, LogOut, Check, Loader2, Activity, CreditCard } from 'lucide-react';
import { useStore } from '../store/useStore';

export const ProfileModal = () => {
    const { 
        showProfileModal, 
        setShowProfileModal, 
        authUserId, 
        setAuthUserId,
        addLog,
        backendUrl,
        setToast
    } = useStore();

    const [profile, setProfile] = useState(null);
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!showProfileModal || !authUserId) return;
        
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
    }, [showProfileModal, authUserId, backendUrl]);

    const handleLogout = () => {
        setAuthUserId(null);
        localStorage.removeItem('installId');
        localStorage.removeItem('cyan_token');
        localStorage.removeItem('cyan_user');
        addLog('User signed out.', 'info');
        setShowProfileModal(false);
    };

    if (!showProfileModal) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="glass-panel p-8 w-full max-w-lg shadow-[0_0_100px_rgba(6,182,212,0.1)] relative overflow-hidden flex flex-col max-h-[90vh]">
                {/* Decorative glow */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 blur-[60px] -mr-16 -mt-16 rounded-full pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-600/10 blur-[60px] -ml-16 -mb-16 rounded-full pointer-events-none" />

                <div className="flex items-center justify-between mb-6 relative z-10">
                    <h3 className="text-xl font-black text-white tracking-widest uppercase italic">User <span className="text-cyan-400">Profile</span></h3>
                    <button 
                        className="p-2 glass-button text-gray-500 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-10">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-cyan-500">
                            <Loader2 className="w-8 h-8 animate-spin mb-4" />
                            <p className="text-xs tracking-widest font-bold uppercase text-cyan-500/70">Loading Profile...</p>
                        </div>
                    ) : error ? (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                            <p className="text-sm font-bold text-red-400 mb-2">Error Loading Profile</p>
                            <p className="text-xs text-red-400/70">{error}</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Profile Details */}
                            <div className="glass-panel rounded-xl p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase flex items-center gap-2">
                                        <User className="w-3.5 h-3.5" />
                                        Identity
                                    </h4>
                                </div>

                                <div className="space-y-4 text-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center text-lg font-black text-cyan-400 border border-dashed border-cyan-500/30 shrink-0">
                                            {(profile?.first_name?.[0] || profile?.username?.[0] || 'U').toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="font-bold text-white text-base">
                                                {profile?.first_name || profile?.last_name ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : profile?.username || 'User'}
                                            </div>
                                            <div className="text-gray-400 text-xs">{profile?.email}</div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 mt-4 glass-panel p-3 rounded-lg">
                                        <div>
                                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-0.5">Account Status</span>
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-1.5 h-1.5 rounded-full ${profile?.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                                <span className="text-xs font-medium text-gray-300 capitalize">{profile?.status || 'Unknown'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Subscription Details */}
                            {subscription && (
                                <div className="glass-panel rounded-xl p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase flex items-center gap-2">
                                            <CreditCard className="w-3.5 h-3.5" />
                                            Subscription & Quotas
                                        </h4>
                                        <div className="px-2 py-0.5 bg-cyan-500/10 border border-dashed border-cyan-500/30 rounded text-[10px] font-black text-cyan-400 tracking-widest uppercase">
                                            {subscription.plan_display || subscription.plan}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {/* Usage Progress */}
                                        <div>
                                            <div className="flex justify-between text-xs mb-1.5 font-medium">
                                                <span className="text-gray-400">Monthly TTS Generation</span>
                                                <span className="text-cyan-400">{subscription.chars_used.toLocaleString()} / {subscription.chars_limit.toLocaleString()} chars</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full ${subscription.chars_percent > 90 ? 'bg-red-500' : subscription.chars_percent > 75 ? 'bg-amber-400' : 'bg-cyan-500'}`}
                                                    style={{ width: `${Math.min(100, subscription.chars_percent)}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="glass-panel rounded-lg p-3">
                                                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1">ElevenLabs Credits</span>
                                                <div className="text-sm font-black text-white">
                                                    {subscription.eleven_credits_used?.toLocaleString() || 0} <span className="text-gray-500 font-medium text-xs">/ {subscription.eleven_credits_limit?.toLocaleString() || 'N/A'}</span>
                                                </div>
                                            </div>
                                            <div className="glass-panel rounded-lg p-3">
                                                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Time Used</span>
                                                <div className="text-sm font-black text-white">
                                                    {subscription.minutes_used} <span className="text-gray-500 font-medium text-xs">/ {subscription.minutes_limit} min</span>
                                                </div>
                                            </div>
                                        </div>

                                        {subscription.reset_date && (
                                            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold flex items-center justify-between">
                                                <span>Data Access: <span className="text-gray-300">{subscription.data_access}</span></span>
                                                <span>Resets: <span className="text-gray-300">{new Date(subscription.reset_date).toLocaleDateString()}</span></span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-6 pt-6 border-t border-white/10 flex justify-between items-center relative z-10">
                    <button 
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 border border-dashed border-red-500/30 bg-red-500/5 text-red-400 font-bold text-xs tracking-widest rounded-lg hover:bg-red-500/10 transition-all uppercase"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                    </button>
                    <button 
                        onClick={() => setShowProfileModal(false)}
                        className="px-6 py-2 glass-button text-white font-bold text-xs tracking-widest rounded-lg uppercase"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
