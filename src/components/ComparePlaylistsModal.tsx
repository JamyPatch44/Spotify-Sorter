import { useState } from 'react';
import { X, GitCompare, Music, Trash2, Download, ExternalLink } from 'lucide-react';
import { useAppStore } from '../store';
import { invoke } from '../tauri-api';

interface DuplicateTrack {
    track_id: string;
    track_uri: string;
    name: string;
    artist: string;
    found_in_playlists: string[];
}

interface CompareResult {
    duplicates: DuplicateTrack[];
    playlists_compared: number;
}

interface ComparePlaylistsModalProps {
    onClose: () => void;
}

const PAGE_SIZE = 50;

export function ComparePlaylistsModal({ onClose }: ComparePlaylistsModalProps) {
    const { selectedPlaylistIds, playlists } = useAppStore();
    const [isComparing, setIsComparing] = useState(false);
    const [result, setResult] = useState<CompareResult | null>(null);
    const [error, setError] = useState('');
    const [removeStatus, setRemoveStatus] = useState<Record<string, string>>({});
    const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

    const selectedPlaylistNames = selectedPlaylistIds
        .map(id => playlists.find(p => p.id === id)?.name)
        .filter(Boolean);

    const handleCompare = async () => {
        if (selectedPlaylistIds.length < 2) {
            setError('Please select at least 2 playlists to compare');
            return;
        }

        setIsComparing(true);
        setError('');
        setResult(null);
        setRemoveStatus({});
        setDisplayCount(PAGE_SIZE);

        try {
            const res = await invoke<CompareResult>('compare_playlists', {
                playlistIds: selectedPlaylistIds
            });
            setResult(res);
        } catch (e: any) {
            setError(String(e));
        }

        setIsComparing(false);
    };

    const openInSpotify = async (trackId: string) => {
        const url = `https://open.spotify.com/track/${trackId}`;
        await invoke('open_url', { url });
    };

    const handleRemoveFromPlaylist = async (trackId: string, playlistName: string) => {
        const playlist = playlists.find(p => p.name === playlistName);
        if (!playlist) {
            setRemoveStatus(prev => ({ ...prev, [trackId + playlistName]: 'Playlist not found' }));
            return;
        }

        setRemoveStatus(prev => ({ ...prev, [trackId + playlistName]: 'Removing...' }));

        try {
            await invoke('remove_track_from_playlist', {
                playlistId: playlist.id,
                trackUri: `spotify:track:${trackId}`,
            });
            setRemoveStatus(prev => ({ ...prev, [trackId + playlistName]: '✓ Removed' }));

            // Update the result to reflect the removal
            if (result) {
                setResult({
                    ...result,
                    duplicates: result.duplicates.map(t => {
                        if (t.track_id === trackId) {
                            return {
                                ...t,
                                found_in_playlists: t.found_in_playlists.filter((p: string) => p !== playlistName)
                            };
                        }
                        return t;
                    }).filter(t => t.found_in_playlists.length >= 2)
                });
            }
        } catch (e: any) {
            setRemoveStatus(prev => ({ ...prev, [trackId + playlistName]: `Error: ${e}` }));
        }
    };

    const exportToCsv = () => {
        if (!result || result.duplicates.length === 0) return;

        const csvLines = [
            'Track Name,Artist,Track ID,Playlists'
        ];

        for (const track of result.duplicates) {
            const line = `"${track.name.replace(/"/g, '""')}","${track.artist.replace(/"/g, '""')}","${track.track_id}","${track.found_in_playlists.join('; ')}"`;
            csvLines.push(line);
        }

        const csvContent = csvLines.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `duplicate_tracks_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Paginated duplicates
    const displayedDuplicates = result?.duplicates.slice(0, displayCount) ?? [];
    const hasMore = result ? displayCount < result.duplicates.length : false;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-3xl mx-4 shadow-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div data-tauri-drag-region="true" className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-800/50 rounded-t-lg shrink-0">
                    <h2 className="text-xl font-bold text-white pointer-events-none flex items-center gap-2">
                        <GitCompare size={20} />
                        Compare Playlists
                    </h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto flex-1">
                    {!result ? (
                        <div className="space-y-4">
                            <p className="text-zinc-400">
                                Find tracks that appear in multiple playlists. Select at least 2 playlists to <span className="text-white font-medium">compare</span> and instantly <span className="text-red-400 font-medium">remove</span> duplicates.
                            </p>
                            <div className="bg-zinc-800 rounded p-3">
                                <div className="text-zinc-400 text-sm mb-2">Selected Playlists ({selectedPlaylistIds.length}):</div>
                                {selectedPlaylistNames.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {selectedPlaylistNames.slice(0, 10).map((name, i) => (
                                            <span key={i} className="bg-zinc-700 text-white px-2 py-1 rounded text-sm">
                                                {name}
                                            </span>
                                        ))}
                                        {selectedPlaylistNames.length > 10 && (
                                            <span className="text-zinc-400 text-sm">+{selectedPlaylistNames.length - 10} more</span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-red-400 text-sm">No playlists selected</div>
                                )}
                            </div>

                            {error && (
                                <div className="bg-red-900/30 border border-red-700 rounded p-3 text-red-400">
                                    {error}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="bg-zinc-800 rounded p-3 flex items-center justify-between">
                                <div>
                                    <span className="text-white font-medium">{result.duplicates.length}</span>
                                    <span className="text-zinc-400"> tracks found in multiple playlists</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-zinc-500 text-sm">
                                        {result.playlists_compared} playlists compared
                                    </div>
                                    {result.duplicates.length > 0 && (
                                        <button
                                            onClick={exportToCsv}
                                            className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1.5"
                                            title="Export to CSV"
                                        >
                                            <Download size={14} />
                                            Export CSV
                                        </button>
                                    )}
                                </div>
                            </div>

                            {result.duplicates.length > 0 ? (
                                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                                    {displayedDuplicates.map((track) => (
                                        <div key={track.track_id} className="bg-zinc-800 rounded p-3">
                                            <div className="flex items-start gap-3">
                                                <Music size={16} className="text-green-500 mt-1 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-white font-medium truncate">{track.name}</div>
                                                        <button
                                                            onClick={() => openInSpotify(track.track_id)}
                                                            className="text-green-500 hover:text-green-400 shrink-0"
                                                            title="Open in Spotify"
                                                        >
                                                            <ExternalLink size={14} />
                                                        </button>
                                                    </div>
                                                    <div className="text-zinc-400 text-sm truncate">{track.artist}</div>
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {track.found_in_playlists.map((pl: string, i: number) => {
                                                            const statusKey = track.track_id + pl;
                                                            const status = removeStatus[statusKey];
                                                            const isRemoved = status === '✓ Removed';

                                                            return (
                                                                <div key={i} className="flex items-center gap-1 bg-zinc-700 rounded text-xs group">
                                                                    <span className={`px-2 py-0.5 ${isRemoved ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                                                                        {pl}
                                                                    </span>
                                                                    {!isRemoved && (
                                                                        <button
                                                                            onClick={() => handleRemoveFromPlaylist(track.track_id, pl)}
                                                                            disabled={status === 'Removing...'}
                                                                            className="px-1.5 py-0.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-r transition-colors"
                                                                            title={`Remove from ${pl}`}
                                                                        >
                                                                            {status === 'Removing...' ? '...' : <Trash2 size={12} />}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {hasMore && (
                                        <button
                                            onClick={() => setDisplayCount(prev => prev + PAGE_SIZE)}
                                            className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm"
                                        >
                                            Load More ({result.duplicates.length - displayCount} remaining)
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-zinc-400">
                                    No duplicate tracks found across the selected playlists!
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-4 border-t border-zinc-700 shrink-0">
                    <button
                        onClick={onClose}
                        className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded"
                    >
                        Close
                    </button>
                    {!result && (
                        <button
                            onClick={handleCompare}
                            disabled={isComparing || selectedPlaylistIds.length < 2}
                            className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-4 py-2 rounded flex items-center gap-2"
                        >
                            <GitCompare size={16} />
                            {isComparing ? 'Comparing...' : 'Compare'}
                        </button>
                    )}
                    {result && (
                        <button
                            onClick={() => { setResult(null); setRemoveStatus({}); setDisplayCount(PAGE_SIZE); }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                        >
                            Compare Again
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
