import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { UpdateChecker } from './UpdateChecker';
import { invoke } from '../tauri-api';
import { listen } from '@tauri-apps/api/event';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { X, Search, Trash2, Filter, ChevronDown, ChevronRight, Info, CheckCircle2, XCircle, SkipForward, Search as SearchIcon, ArrowRightLeft, Settings } from 'lucide-react';

interface DebugLog {
    log_type: 'info' | 'search' | 'passed' | 'rejected' | 'skipped' | 'found' | 'error' | 'comparison';
    message: string;
    details?: string;
    timestamp: string;
}

export function StatusBar({ onSettingsClick }: { onSettingsClick?: () => void }) {
    const { statusText } = useAppStore();
    const [showDebug, setShowDebug] = useState(false);
    const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [autoScroll, setAutoScroll] = useState(true);
    const virtuosoRef = useRef<VirtuosoHandle>(null);

    // Filters
    const [filters, setFilters] = useState({
        info: true,
        search: true,
        passed: true,
        rejected: true,
        skipped: true,
        found: true,
        error: true,
        comparison: true,
    });

    useEffect(() => {
        const unlistenPromise = listen<DebugLog>('debug-log', (event) => {
            setDebugLogs((prev) => [...prev, event.payload]);
        });

        return () => {
            unlistenPromise.then((unlisten) => unlisten());
        };
    }, []);

    const handleLogout = async () => {
        try {
            await invoke('logout');
            useAppStore.setState({ isLoggedIn: false, playlists: [] });
        } catch (e) {
            console.error('Logout failed:', e);
        }
    };

    const handleClearLogs = () => {
        setDebugLogs([]);
    };

    const toggleFilter = (key: keyof typeof filters) => {
        setFilters(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const filteredLogs = debugLogs.filter(log => {
        if (!filters[log.log_type]) return false;
        if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !log.details?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
    });

    const getLogColor = (type: DebugLog['log_type']) => {
        switch (type) {
            case 'info': return 'text-zinc-400';
            case 'search': return 'text-blue-400';
            case 'passed': return 'text-green-400';
            case 'rejected': return 'text-red-400';
            case 'skipped': return 'text-yellow-600';
            case 'found': return 'text-purple-400';
            case 'error': return 'text-red-500 font-bold';
            case 'comparison': return 'text-cyan-400';
            default: return 'text-zinc-400';
        }
    };

    const getLogIcon = (type: DebugLog['log_type']) => {
        switch (type) {
            case 'info': return <Info size={14} />;
            case 'search': return <SearchIcon size={14} />;
            case 'passed': return <CheckCircle2 size={14} />;
            case 'rejected': return <XCircle size={14} />;
            case 'skipped': return <SkipForward size={14} />;
            case 'found': return <CheckCircle2 size={14} className="text-purple-400" />;
            case 'error': return <XCircle size={14} />;
            case 'comparison': return <ArrowRightLeft size={14} />;
            default: return <Info size={14} />;
        }
    };

    return (
        <>
            <div className="flex-shrink-0 bg-zinc-900/90 border-t border-zinc-800 px-4 py-2 z-50 flex items-center justify-between">
                <span className="text-zinc-400 text-sm">{statusText}</span>
                <div className="flex items-center gap-3">
                    <UpdateChecker />
                    <button
                        onClick={() => setShowDebug(true)}
                        className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs px-3 py-1.5 rounded transition-colors tracking-tight font-medium"
                    >
                        Debug
                    </button>
                    <button
                        onClick={onSettingsClick}
                        className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs px-3 py-1.5 rounded transition-colors tracking-tight font-medium flex items-center gap-1.5"
                    >
                        <Settings size={14} />
                        Settings
                    </button>
                    <button
                        onClick={handleLogout}
                        className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs px-3 py-1.5 rounded transition-colors tracking-tight font-medium"
                    >
                        Logout
                    </button>
                </div>
            </div>

            {/* Debug Modal */}
            {showDebug && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-[95vw] h-[90vh] flex flex-col overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between p-3 border-b border-zinc-700 bg-zinc-800/50">
                            <h2 className="text-white font-semibold flex items-center gap-2">
                                <Info size={18} className="text-blue-400" />
                                Debug Console
                                <span className="text-xs font-normal text-zinc-500 ml-2">({filteredLogs.length} logs)</span>
                            </h2>
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search logs..."
                                        className="bg-zinc-950 border border-zinc-700 rounded-md py-1 pl-8 pr-3 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 w-48"
                                    />
                                </div>
                                <button
                                    onClick={handleClearLogs}
                                    className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
                                >
                                    <Trash2 size={14} />
                                    Clear
                                </button>
                                <button
                                    onClick={() => setShowDebug(false)}
                                    className="text-zinc-400 hover:text-white transition-colors p-1 hover:bg-zinc-800 rounded"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="flex flex-wrap gap-2 p-2 border-b border-zinc-800 bg-zinc-900/50 text-xs">
                            <div className="flex items-center gap-1 text-zinc-500 mr-2">
                                <Filter size={12} />
                                <span>Filters:</span>
                            </div>
                            {(Object.keys(filters) as Array<keyof typeof filters>).map(type => (
                                <button
                                    key={type}
                                    onClick={() => toggleFilter(type)}
                                    className={`px-2 py-1 rounded border transition-colors flex items-center gap-1.5 capitalize ${filters[type]
                                        ? 'bg-zinc-800 border-zinc-600 text-zinc-200'
                                        : 'bg-zinc-950 border-zinc-800 text-zinc-600'
                                        }`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${type === 'passed' ? 'bg-green-500' :
                                        type === 'rejected' ? 'bg-red-500' :
                                            type === 'found' ? 'bg-purple-500' :
                                                type === 'search' ? 'bg-blue-500' :
                                                    type === 'error' ? 'bg-red-600' :
                                                        'bg-zinc-500'
                                        }`} />
                                    {type}
                                </button>
                            ))}
                            <div className="flex-1" />
                            <label className="flex items-center gap-2 text-zinc-400 cursor-pointer hover:text-zinc-200 select-none">
                                <input
                                    type="checkbox"
                                    checked={autoScroll}
                                    onChange={(e) => setAutoScroll(e.target.checked)}
                                    className="rounded border-zinc-700 bg-zinc-800 accent-green-500"
                                />
                                Auto-scroll
                            </label>
                        </div>

                        {/* Logs */}
                        <div className="flex-1 bg-zinc-950">
                            {filteredLogs.length === 0 ? (
                                <div className="text-center text-zinc-600 mt-20 italic">
                                    No logs to display...
                                </div>
                            ) : (
                                <Virtuoso
                                    ref={virtuosoRef}
                                    data={filteredLogs}
                                    followOutput={autoScroll ? 'auto' : false}
                                    className="font-mono text-[11px]"
                                    itemContent={(_index, log) => (
                                        <LogItem log={log} getLogColor={getLogColor} getLogIcon={getLogIcon} />
                                    )}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function LogItem({ log, getLogColor, getLogIcon }: {
    log: DebugLog,
    getLogColor: (t: DebugLog['log_type']) => string,
    getLogIcon: (t: DebugLog['log_type']) => React.ReactNode
}) {
    const [expanded, setExpanded] = useState(false);
    const hasDetails = !!log.details;

    return (
        <div className={`group hover:bg-zinc-900 px-2 py-0.5 border-b border-zinc-900/50 ${hasDetails ? 'cursor-pointer' : ''}`} onClick={() => hasDetails && setExpanded(!expanded)}>
            <div className="flex items-start gap-2">
                <span className="text-zinc-600 min-w-[70px] select-none text-[10px] pt-0.5">{log.timestamp}</span>
                <span className={`min-w-[80px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${getLogColor(log.log_type)}`}>
                    <span className="opacity-70">{getLogIcon(log.log_type)}</span>
                    {log.log_type}
                </span>
                <span className="text-zinc-300 flex-1 break-words">
                    {log.message}
                    {hasDetails && (
                        <span className="ml-2 text-zinc-600 text-[10px] inline-flex items-center">
                            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        </span>
                    )}
                </span>
            </div>
            {expanded && log.details && (
                <div className="ml-[160px] mt-1 mb-1 p-2 bg-zinc-900/50 rounded border border-zinc-800 text-zinc-400 whitespace-pre-wrap animate-in fade-in slide-in-from-top-1 duration-200">
                    {log.details}
                </div>
            )}
        </div>
    );
}
