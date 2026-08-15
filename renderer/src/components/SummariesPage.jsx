import React, { useEffect, useState } from 'react';
import { Sparkles, Clock, Calendar, ChevronLeft, ChevronRight, Search, FileText, ExternalLink, RefreshCw } from 'lucide-react';
import { useStore } from '../store/useStore';
// import { goBackendService } from '../services/summarizeService';

export const SummariesPage = () => {
    const { addLog, authUserId } = useStore();
    const [summaries, setSummaries] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState(null);

    const fetchSummaries = async () => {
        if (!authUserId) return;
        setIsLoading(true);
        try {
            const token = localStorage.getItem('cyan_token') || '';
            // const backendUrl = goBackendService.getBackendUrl();
            const url = `https://translator-gateway.fly.dev/api/v1/summarization/list?page=${page}&page_size=${pageSize}`;

            console.log(`[SummariesPage] Fetching summaries from: ${url}`);
            console.log(`[SummariesPage] Auth Debug:`, {
                hasToken: !!token,
                tokenLength: token.length,
                tokenPreview: token ? token.substring(0, 20) + '...' : 'NONE',
                authUserId: authUserId
            });
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch summaries: ${response.status}`);
            }

            const result = await response.json();
            console.log('[SummariesPage] Received list:', JSON.stringify(result, null, 2));
            
            setSummaries(result.data || []);
            setTotal(result.total || 0);
        } catch (err) {
            console.error('[SummariesPage] Error:', err);
            addLog(`❌ Failed to load summaries: ${err.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSummaries();
    }, [page]);

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Unknown Date';
        try {
            const date = new Date(dateStr);
            return new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        } catch {
            return dateStr;
        }
    };

    const toggleExpand = (id) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const filteredSummaries = summaries.filter(s => 
        (s.summary_title?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.summary?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.session_id?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (!authUserId) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-950/50 gap-6 animate-in fade-in zoom-in-95 duration-700">
               
                
                <div className="text-center space-y-3 px-6">

                    <p className="text-xs text-gray-500 font-medium max-w-[280px] mx-auto leading-relaxed">
                        Please <span className="text-gray-300 font-bold">Connect Account</span> in the header to view and manage your archived conversation summaries.
                    </p>
                </div>

                <div className="w-32 h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent"></div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col glass-panel h-full animate-in fade-in duration-500 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-4 md:px-8 md:py-6 bg-gray-900/50 border-b border-dashed border-gray-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl md:text-2xl font-black text-white tracking-tight uppercase mb-1">AI Summary</h2>
                    <p className="text-[9px] md:text-[10px] text-cyan-500 font-bold uppercase tracking-[0.2em]">Archived Conversation Intelligence</p>
                </div>

                <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                        <input 
                            type="text"
                            placeholder="SEARCH SESSIONS..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="glass-input rounded-full pl-9 pr-4 py-2 text-[10px] text-white w-full md:w-64"
                        />
                    </div>
                    <button 
                        onClick={fetchSummaries}
                        disabled={isLoading}
                        className="p-2 glass-button rounded-lg text-gray-400 disabled:opacity-50 shrink-0"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                {isLoading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4">
                        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">Querying Summary...</span>
                    </div>
                ) : filteredSummaries.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 select-none">
                        <FileText className="w-12 h-12 mb-4 text-gray-500" />
                        <span className="text-xs font-bold uppercase tracking-[0.3em] text-center">No summaries found</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {filteredSummaries.map((summary) => (
                            <div 
                                key={summary.id}
                                onClick={() => toggleExpand(summary.id)}
                                className={`group glass-panel transition-all duration-500 overflow-hidden cursor-pointer ${
                                    expandedId === summary.id 
                                        ? 'border-cyan-500/50 ring-1 ring-cyan-500/20 shadow-[0_20px_60px_rgba(0,0,0,0.6)] rounded-3xl' 
                                        : 'hover:border-cyan-500/30 rounded-2xl hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)]'
                                }`}
                            >
                                <div className="p-4 md:p-5 flex flex-col md:flex-row gap-4 md:gap-6">
                                    <div className="flex flex-row md:flex-col items-center md:justify-center gap-2 md:px-4 md:border-r border-gray-800/50 min-w-[90px] md:min-w-[120px]">
                                        <div className={`p-2 md:p-2.5 rounded-lg md:rounded-xl transition-colors ${expandedId === summary.id ? 'bg-cyan-500 text-black' : 'bg-gray-800 text-gray-400'}`}>
                                            <Calendar className="w-4 h-4 md:w-5 md:h-5" />
                                        </div>
                                        <span className="text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-tight text-left md:text-center">
                                            {formatDate(summary.created_at)}
                                        </span>
                                    </div>

                                    <div className="flex-1 min-w-0 py-1">
                                        <div className="flex items-center justify-between mb-2 md:mb-3">
                                            <h3 className={`text-xs md:text-sm font-black tracking-tight truncate pr-2 transition-colors ${expandedId === summary.id ? 'text-cyan-400' : 'text-white'}`}>
                                                {summary.summary_title || 'Untitled Session'}
                                            </h3>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className={`p-1 md:p-1.5 rounded-lg transition-all ${expandedId === summary.id ? 'rotate-180 bg-cyan-500/20 text-cyan-400' : 'text-gray-500'}`}>
                                                    <ChevronRight className="w-4 h-4" />
                                                </div>
                                            </div>
                                        </div>
                                        <p className={`text-[11px] md:text-xs leading-relaxed transition-all ${expandedId === summary.id ? 'text-gray-200' : 'text-gray-400 line-clamp-2 italic'}`}>
                                            "{summary.summary}"
                                        </p>
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {expandedId === summary.id && (
                                    <div className="px-4 md:px-5 pb-5 md:pb-6 pt-2 animate-in slide-in-from-top-4 duration-500">
                                        <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mb-4 md:mb-6"></div>
                                        
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 px-2 md:px-4">
                                            {/* Key Points & Topics */}
                                            <div className="space-y-6">
                                                {summary.metadata?.summary_with_sources?.key_points?.length > 0 && (
                                                    <div className="space-y-3">
                                                        <h4 className="text-[9px] md:text-[10px] font-black text-cyan-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                                            <div className="w-1 h-3 bg-cyan-500 rounded-full"></div>
                                                            Key Insights
                                                        </h4>
                                                        <ul className="space-y-2 md:space-y-2.5">
                                                            {summary.metadata.summary_with_sources.key_points.map((point, idx) => (
                                                                <li key={idx} className="flex gap-2 md:gap-3 text-[11px] md:text-xs text-gray-300 leading-relaxed">
                                                                    <span className="text-cyan-500 font-bold mt-0.5 shrink-0">0{idx + 1}.</span>
                                                                    <span>{point}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {summary.metadata?.summary_with_sources?.main_topics?.length > 0 && (
                                                    <div className="space-y-3">
                                                        <h4 className="text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Core Topics</h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {summary.metadata.summary_with_sources.main_topics.map((topic, idx) => (
                                                                <span key={idx} className="px-2 md:px-3 py-1 bg-gray-800/30 border border-dashed border-gray-600 rounded-full text-[9px] md:text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                                                    {topic}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Participants & Stats */}
                                            <div className="space-y-6">
                                                <div className="grid grid-cols-2 gap-3 md:gap-4">
                                                    <div className="p-3 md:p-4 bg-gray-800/30 rounded-xl md:rounded-2xl border border-dashed border-gray-700/50">
                                                        <p className="text-[8px] md:text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Turns</p>
                                                        <p className="text-lg md:text-xl font-black text-white">{summary.metadata?.turn_count || 0}</p>
                                                    </div>
                                                    <div className="p-3 md:p-4 bg-gray-800/30 rounded-xl md:rounded-2xl border border-dashed border-gray-700/50">
                                                        <p className="text-[8px] md:text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Sentiment</p>
                                                        <p className="text-[10px] md:text-xs font-black text-cyan-400 uppercase tracking-widest truncate">{summary.metadata?.sentiment || 'NEUTRAL'}</p>
                                                    </div>
                                                </div>

                                                {summary.metadata?.summary_with_sources?.participants?.length > 0 && (
                                                    <div className="space-y-3">
                                                        <h4 className="text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Identified Speakers</h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {summary.metadata.summary_with_sources.participants.map((p, idx) => (
                                                                <div key={idx} className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-cyan-500/5 border border-dashed border-cyan-500/30 rounded-lg md:rounded-xl">
                                                                    <div className="w-1 md:w-1.5 h-1 md:h-1.5 bg-cyan-500 rounded-full"></div>
                                                                    <span className="text-[9px] md:text-[10px] font-black text-gray-300 uppercase tracking-tight">{p}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer / Pagination */}
            <div className="px-4 md:px-6 py-4 bg-gray-900/50 border-t border-dashed border-gray-700/50 flex flex-col md:flex-row items-center justify-between gap-4 select-none">
                <div className="flex items-center gap-4">
                    <span className="text-[9px] font-black text-gray-500 tracking-widest uppercase">
                        Showing {filteredSummaries.length} of {total} Summaries
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        disabled={page === 1 || isLoading}
                        onClick={() => setPage(p => p - 1)}
                        className="p-2 glass-button rounded-lg text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="px-4 py-1.5 glass-panel rounded-lg min-w-[40px] flex items-center justify-center">
                        <span className="text-xs font-black text-white">{page}</span>
                    </div>
                    <button 
                        disabled={summaries.length < pageSize || isLoading}
                        onClick={() => setPage(p => p + 1)}
                        className="p-2 glass-button rounded-lg text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};
