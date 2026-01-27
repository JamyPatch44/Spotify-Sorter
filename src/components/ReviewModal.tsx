import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

interface ReviewChange {
    id: string;
    type: 'replace' | 'duplicate';
    // For replacements
    newTitle?: string;
    newArtist?: string;
    newAlbum?: string;
    newDate?: string;
    // For duplicates
    remTitle?: string;
    remArtist?: string;
    remAlbum?: string;
    remDate?: string;
}

interface ReviewStats {
    total: number;
    removed: number;
    replaced: number;
}

interface ReviewModalProps {
    playlistName: string;
    changes: ReviewChange[];
    stats: ReviewStats;
    onApprove: (approvedIds: string[]) => void;
    onCancel: () => void;
}

export function ReviewModal({ playlistName, changes, stats, onApprove, onCancel }: ReviewModalProps) {
    const [checkedIds, setCheckedIds] = useState<string[]>(changes.map(c => c.id));
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        // Reset selection and search when moving to a new review (e.g. next playlist)
        setCheckedIds(changes.map(c => c.id));
        setSearchQuery('');
    }, [changes]);

    const filteredChanges = changes.filter(c => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (c.newTitle?.toLowerCase().includes(q)) ||
            (c.newArtist?.toLowerCase().includes(q)) ||
            (c.remTitle?.toLowerCase().includes(q)) ||
            (c.remArtist?.toLowerCase().includes(q))
        );
    });

    const toggleChange = (id: string) => {
        if (checkedIds.includes(id)) {
            setCheckedIds(checkedIds.filter(i => i !== id));
        } else {
            setCheckedIds([...checkedIds, id]);
        }
    };

    const handleSelectAll = () => {
        const visibleIds = filteredChanges.map(c => c.id);
        // Add all visible IDs to selection (merge)
        const newSet = new Set([...checkedIds, ...visibleIds]);
        setCheckedIds(Array.from(newSet));
    };

    const handleDeselectAll = () => {
        const visibleIds = filteredChanges.map(c => c.id);
        // Remove visible IDs from selection
        setCheckedIds(checkedIds.filter(id => !visibleIds.includes(id)));
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div data-tauri-drag-region="true" className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-800/50 rounded-t-lg">
                    <div>
                        <h2 className="text-xl font-bold text-white pointer-events-none">Review Changes</h2>
                        <p className="text-zinc-400 text-sm pointer-events-none">Playlist: {playlistName}</p>
                    </div>
                    <p className="text-zinc-400 text-sm pointer-events-none text-right">
                        {stats.replaced} replacements, {stats.removed} duplicates removed ({stats.total} total tracks)
                    </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
                    <button
                        onClick={handleSelectAll}
                        className="text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded"
                    >
                        Select All
                    </button>
                    <button
                        onClick={handleDeselectAll}
                        className="text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded"
                    >
                        Deselect All
                    </button>

                    <input
                        type="text"
                        placeholder="Search changes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 text-xs text-white rounded px-2 py-1 ml-2 w-48 focus:outline-none focus:border-green-500"
                    />

                    <span className="text-zinc-500 text-sm ml-auto">
                        {checkedIds.length} of {changes.length} changes approved
                    </span>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4">
                    <div className="space-y-2">
                        {filteredChanges.length === 0 ? (
                            <div className="text-center text-zinc-500 py-8">
                                No changes match your search.
                            </div>
                        ) : (
                            filteredChanges.map(change => (
                                <div
                                    key={change.id}
                                    onClick={() => toggleChange(change.id)}
                                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${checkedIds.includes(change.id)
                                        ? 'bg-green-900/20 border-green-700'
                                        : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center mt-0.5 ${checkedIds.includes(change.id)
                                            ? 'bg-green-600 border-green-600'
                                            : 'border-zinc-600'
                                            }`}>
                                            {checkedIds.includes(change.id) && <Check size={14} className="text-white" />}
                                        </div>
                                        <div className="flex-1">
                                            {change.type === 'replace' ? (
                                                <>
                                                    <div className="flex items-center gap-2 text-xs w-full">
                                                        {/* Current Track (Left) */}
                                                        <div className="flex-1 w-0 min-w-0 bg-black/40 rounded p-1.5 border border-red-500/20">
                                                            <div className="flex items-baseline justify-between mb-0.5 gap-2">
                                                                <span className="text-red-400 font-bold truncate" title={change.remTitle}>{change.remTitle}</span>
                                                                <span className="text-red-500/50 text-[10px] whitespace-nowrap flex-shrink-0">{change.remDate}</span>
                                                            </div>
                                                            <div className="text-zinc-400 text-[10px] truncate" title={`${change.remArtist} • ${change.remAlbum}`}>
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

                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-orange-400 text-xs font-medium mb-1">DUPLICATE REMOVAL</div>
                                                    <div className="text-white">
                                                        Remove: <span className="text-red-400">{change.remTitle}</span>
                                                    </div>
                                                    <div className="text-zinc-400 text-sm">
                                                        {change.remArtist} • {change.remAlbum} ({change.remDate})
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between p-4 border-t border-zinc-700">
                    <button
                        onClick={onCancel}
                        className="bg-zinc-700 hover:bg-zinc-600 text-white px-6 py-2 rounded"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onApprove(checkedIds)}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-bold"
                    >
                        Apply {checkedIds.length} Changes
                    </button>
                </div>
            </div >
        </div >
    );
}
