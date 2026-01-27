import { useState, useEffect } from 'react';
import { X, RotateCcw, ChevronDown, Trash2 } from 'lucide-react';
import { invoke } from '../tauri-api';

interface ReviewChange {
    id: string;
    type: 'replace' | 'duplicate';
    newTitle?: string;
    newArtist?: string;
    newAlbum?: string;
    newDate?: string;
    remTitle?: string;
    remArtist?: string;
    remAlbum?: string;
    remDate?: string;
}

interface HistoryItem {
    id: string;
    playlistName: string;
    time: string;
    action: string;
    status?: string;
    warning_message?: string;
    changes?: ReviewChange[];
    ignored?: ReviewChange[];
    // Optional mapping fields
    config_name?: string;
    finished_at?: string;
    tracks_processed?: number;
}

interface HistoryModalProps {
    onClose: () => void;
    onRestore?: () => void;
}

export function HistoryModal({ onClose, onRestore }: HistoryModalProps) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isRestoring, setIsRestoring] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
    const [restoredId, setRestoredId] = useState<string | null>(null);
    const [confirmClearAll, setConfirmClearAll] = useState(false);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = () => {
        invoke<any[]>('get_history')
            .then(data => {
                console.log("History Data Received:", data);
                const mapped: HistoryItem[] = data.map(d => ({
                    id: d.id,
                    playlistName: d.config_name || d.playlistName || "Unknown",
                    time: new Date(d.finished_at || d.time).toLocaleString(),
                    action: d.tracks_processed ? `${d.tracks_processed} tracks processed` : (d.action || "Update"),
                    status: d.status,
                    warning_message: d.warning_message,
                    changes: d.changes,
                    ignored: d.ignored
                }));
                setHistory(mapped);
            })
            .catch(console.error);
    }

    const handleRestore = async (item: HistoryItem) => {
        setIsRestoring(true);
        try {
            await invoke<string>('restore_snapshot', { snapshotId: item.id });
            setRestoredId(item.id);
            if (onRestore) onRestore();

            setTimeout(() => {
                setRestoredId(null);
            }, 2000);
        } catch (e: any) {
            alert(`Error: ${e}`);
        }
        setIsRestoring(false);
        setConfirmRestoreId(null);
    };

    const handleDelete = async (id: string) => {
        try {
            await invoke('delete_history_item', { id });
            setHistory(prev => prev.filter(item => item.id !== id));
            setConfirmDeleteId(null);
        } catch (e) {
            console.error('Failed to delete history item:', e);
        }
    };

    const handleClearAll = async () => {
        try {
            await invoke('clear_history');
            setHistory([]);
            setConfirmClearAll(false);
        } catch (e) {
            console.error('Failed to clear history:', e);
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div data-tauri-drag-region="true" className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-800/50 rounded-t-lg">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold text-white pointer-events-none">History / Undo</h2>
                        {history.length > 0 && (
                            confirmClearAll ? (
                                <div className="flex items-center gap-2 bg-red-900/20 px-2 py-1 rounded border border-red-900/30">
                                    <span className="text-red-400 text-xs font-medium mr-1">Are you sure?</span>
                                    <button
                                        onClick={handleClearAll}
                                        className="bg-red-900/50 hover:bg-red-900/70 text-red-200 text-xs font-bold px-2 py-0.5 rounded transition-colors"
                                    >
                                        YES, CLEAR ALL
                                    </button>
                                    <button
                                        onClick={() => setConfirmClearAll(false)}
                                        className="text-zinc-400 hover:text-zinc-300 text-xs font-bold px-2 py-0.5"
                                    >
                                        CANCEL
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmClearAll(true)}
                                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 text-xs font-medium transition-colors border border-red-900/50"
                                >
                                    <Trash2 size={12} />
                                    Clear All
                                </button>
                            )
                        )}
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                    <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
                        Track changes and manage your session history. You can <span className="text-white font-medium">undo</span> actions to restore playlists, <span className="text-red-400 font-medium">delete</span> specific entries, or <span className="text-red-500 font-medium">clear all</span> to start fresh.
                    </p>

                    {history.length === 0 ? (
                        <div className="text-center text-zinc-500 py-12 bg-zinc-800/30 rounded-lg border border-zinc-800/50 border-dashed">
                            No actions performed in this session yet.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {history.map(item => (
                                <div
                                    key={item.id}
                                    className={`bg-zinc-800 border transition-all duration-200 rounded-lg overflow-hidden ${expandedId === item.id ? 'border-zinc-600 ring-1 ring-zinc-600/50' : 'border-zinc-700 hover:border-zinc-600'
                                        }`}
                                >
                                    <div
                                        className="p-3 cursor-pointer select-none"
                                        onClick={() => toggleExpand(item.id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`transition-transform duration-200 text-zinc-400 ${expandedId === item.id ? 'rotate-180' : ''}`}>
                                                    <ChevronDown size={16} />
                                                </div>
                                                <div>
                                                    <div className="text-white font-medium flex items-center gap-2">
                                                        {item.playlistName}
                                                        <span className="text-zinc-500 font-normal text-xs">•</span>
                                                        <span className="text-zinc-300 font-normal text-sm">{item.action}</span>
                                                    </div>
                                                    <div className="text-zinc-500 text-xs mt-0.5">{item.time}</div>

                                                    {/* WARNING BANNER */}
                                                    {item.warning_message && (
                                                        <div className="mt-2 text-xs bg-yellow-900/30 text-yellow-200 border border-yellow-700/50 p-2 rounded flex items-start gap-2">
                                                            <span className="text-yellow-500 font-bold">⚠️</span>
                                                            <span className="whitespace-pre-wrap">{item.warning_message}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {/* DELETE BUTTON */}
                                                {confirmDeleteId === item.id ? (
                                                    <div className="flex items-center gap-1 bg-red-900/20 px-2 py-1 rounded border border-red-900/30">
                                                        <span className="text-red-400 text-xs mr-1">Delete?</span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDelete(item.id);
                                                            }}
                                                            className="text-red-400 hover:text-red-300 p-1 hover:bg-white/10 rounded"
                                                        >
                                                            <div className="text-[10px] font-bold">YES</div>
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setConfirmDeleteId(null);
                                                            }}
                                                            className="text-zinc-400 hover:text-zinc-300 p-1 hover:bg-white/10 rounded"
                                                        >
                                                            <div className="text-[10px] font-bold">NO</div>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirmDeleteId(item.id);
                                                            setConfirmRestoreId(null);
                                                        }}
                                                        className="text-zinc-500 hover:text-red-400 p-1.5 rounded hover:bg-red-900/20 transition-colors"
                                                        title="Delete history entry"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}

                                                {/* RESTORE BUTTON */}
                                                {restoredId === item.id ? (
                                                    <div className="bg-green-900/30 text-green-400 px-3 py-1.5 rounded text-xs font-medium border border-green-900/50 flex items-center gap-1">
                                                        <RotateCcw size={12} /> Restored!
                                                    </div>
                                                ) : confirmRestoreId === item.id ? (
                                                    <div className="flex items-center gap-1 bg-zinc-700 px-2 py-1 rounded border border-zinc-600">
                                                        <span className="text-zinc-300 text-xs mr-1">Undo?</span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRestore(item);
                                                            }}
                                                            className="text-green-400 hover:text-green-300 p-1 hover:bg-white/10 rounded"
                                                        >
                                                            <div className="text-[10px] font-bold">YES</div>
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setConfirmRestoreId(null);
                                                            }}
                                                            className="text-zinc-400 hover:text-zinc-300 p-1 hover:bg-white/10 rounded"
                                                        >
                                                            <div className="text-[10px] font-bold">NO</div>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirmRestoreId(item.id);
                                                            setConfirmDeleteId(null);
                                                        }}
                                                        disabled={isRestoring}
                                                        className="bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded flex items-center gap-1 text-xs font-medium transition-colors"
                                                    >
                                                        <RotateCcw size={12} />
                                                        Undo
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Details */}
                                    {expandedId === item.id && (
                                        <div className="border-t border-zinc-700/50 bg-black/20 p-3">
                                            {item.changes && item.changes.length > 0 && (
                                                <div className="space-y-2">
                                                    {item.changes.map((change, idx) => (
                                                        <div key={idx} className="text-xs">
                                                            {change.type === 'replace' ? (
                                                                <div className="flex items-center gap-2 bg-zinc-900/50 p-2 rounded border border-zinc-800">
                                                                    <div className="text-blue-400 font-bold px-1.5 py-0.5 bg-blue-950/30 rounded text-[10px] self-start mt-0.5">REP</div>
                                                                    <div className="flex-1 w-full min-w-0">
                                                                        <div className="flex items-center gap-2 text-xs w-full">
                                                                            {/* Current Track (Left) */}
                                                                            <div className="flex-1 w-0 min-w-0 bg-black/40 rounded p-1.5 border border-red-500/20">
                                                                                <div className="flex items-baseline justify-between mb-0.5 gap-2">
                                                                                    <span className="text-red-400 font-bold truncate" title={change.remTitle}>{change.remTitle}</span>
                                                                                    <span className="text-red-500/50 text-[10px] whitespace-nowrap flex-shrink-0">{change.remDate}</span>
                                                                                </div>
                                                                                <div className="text-zinc-500 text-[10px] truncate" title={`${change.remArtist} • ${change.remAlbum}`}>
                                                                                    {change.remArtist} • {change.remAlbum}
                                                                                </div>
                                                                            </div>

                                                                            {/* Arrow */}
                                                                            <div className="text-zinc-600 flex-shrink-0">
                                                                                →
                                                                            </div>

                                                                            {/* New Track (Right) */}
                                                                            <div className="flex-1 w-0 min-w-0 bg-black/40 rounded p-1.5 border border-green-500/20">
                                                                                <div className="flex items-baseline justify-between mb-0.5 gap-2">
                                                                                    <span className="text-green-400 font-bold truncate" title={change.newTitle}>{change.newTitle}</span>
                                                                                    <span className="text-green-500/50 text-[10px] whitespace-nowrap flex-shrink-0">{change.newDate}</span>
                                                                                </div>
                                                                                <div className="text-zinc-400 text-[10px] truncate" title={`${change.newArtist} • ${change.newAlbum}`}>
                                                                                    {change.newArtist} • {change.newAlbum}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-start gap-2 bg-zinc-900/50 p-2 rounded border border-zinc-800">
                                                                    <div className="text-orange-400 font-bold px-1.5 py-0.5 bg-orange-950/30 rounded text-[10px] mt-0.5">DUP</div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-zinc-400 truncate w-full flex items-baseline gap-2">
                                                                            <span className="text-red-400 font-medium">{change.remTitle}</span>
                                                                            <span className="text-zinc-600 text-[10px]">{change.remDate}</span>
                                                                        </div>
                                                                        <div className="text-zinc-500 text-[10px] truncate" title={`${change.remArtist} • ${change.remAlbum}`}>
                                                                            {change.remArtist} • {change.remAlbum}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}

                                                </div>
                                            )}

                                            {/* Ignored Section */}
                                            {item.ignored && item.ignored.length > 0 && (
                                                <div className="mt-4 pt-4 border-t border-zinc-700/50">
                                                    <h4 className="text-zinc-500 text-xs font-bold uppercase mb-2">Ignored / Rejected Changes</h4>
                                                    <div className="space-y-2 opacity-60">
                                                        {item.ignored.map((change, idx) => (
                                                            <div key={`ign-${idx}`} className="text-xs">
                                                                {/* Minimalist Ignored Item */}
                                                                <div className="flex items-center gap-2 bg-zinc-900/30 p-2 rounded border border-zinc-800/50">
                                                                    <div className="text-zinc-500 font-bold px-1.5 py-0.5 bg-zinc-800 rounded text-[10px]">SKIP</div>
                                                                    <div className="text-zinc-500 truncate w-full flex items-baseline gap-2">
                                                                        <span className="text-zinc-400 font-medium">{change.remTitle}</span>
                                                                        <span className="text-zinc-600 text-[10px]">{change.remArtist}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
