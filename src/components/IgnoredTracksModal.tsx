import { useState, useEffect } from 'react';
import { X, Trash2, Filter, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { invoke } from '../tauri-api';
import { useAppStore } from '../store';

interface IgnoredTrack {
    id: string;
    title: string;
    artist: string;
    album: string;
    year: string;
    sourcePlaylist: string;
    rejectedContext: string;
    ignoredTitle?: string;
    ignoredArtist?: string;
    ignoredAlbum?: string;
    ignoredYear?: string;
}

interface IgnoredTracksModalProps {
    onClose: () => void;
}

export function IgnoredTracksModal({ onClose }: IgnoredTracksModalProps) {
    const { playlists } = useAppStore();
    const [tracks, setTracks] = useState<IgnoredTrack[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [filterPlaylist, setFilterPlaylist] = useState<string>('all');
    const [sortBy, setBy] = useState<'artist' | 'title' | 'album' | 'playlist'>('artist');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    useEffect(() => {
        invoke<IgnoredTrack[]>('get_ignored_tracks')
            .then(setTracks)
            .catch(console.error);
    }, []);

    const getPlaylistName = (id: string) => {
        const pl = playlists.find(p => p.id === id);
        return pl ? pl.name : id;
    };

    const toggleSelection = (id: string) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleRemoveSelected = async () => {
        try {
            await invoke('remove_ignored_tracks', { trackIds: selectedIds });
            setTracks(tracks.filter(t => !selectedIds.includes(t.id)));
            setSelectedIds([]);
        } catch (e: any) {
            alert(`Error: ${e}`);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
                {/* Header */}
                <div data-tauri-drag-region="true" className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-800/50 rounded-t-lg">
                    <h2 className="text-xl font-bold text-white pointer-events-none">Ignored Tracks</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Filters & Sorting */}
                <div className="p-4 border-b border-zinc-800 bg-zinc-900/30 flex flex-wrap gap-4 items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                        <Filter size={14} className="text-zinc-500" />
                        <span className="text-zinc-400 font-medium">Filter by Playlist:</span>
                        <select
                            value={filterPlaylist}
                            onChange={(e) => setFilterPlaylist(e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 outline-none focus:border-green-500/50"
                        >
                            <option value="all">All Playlists</option>
                            {Array.from(new Set(tracks.map(t => t.sourcePlaylist))).map(pid => (
                                <option key={pid} value={pid}>{getPlaylistName(pid)}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <ArrowUpDown size={14} className="text-zinc-500" />
                        <span className="text-zinc-400 font-medium">Sort by:</span>
                        <div className="flex bg-zinc-800 border border-zinc-700 rounded overflow-hidden">
                            {(['artist', 'title', 'album', 'playlist'] as const).map(key => (
                                <button
                                    key={key}
                                    onClick={() => {
                                        if (sortBy === key) {
                                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                        } else {
                                            setBy(key);
                                            setSortOrder('asc');
                                        }
                                    }}
                                    className={`px-3 py-1 capitalize transition-colors flex items-center gap-1 ${sortBy === key ? 'bg-green-600/20 text-green-400' : 'text-zinc-400 hover:bg-zinc-700'}`}
                                >
                                    {key}
                                    {sortBy === key && (
                                        sortOrder === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4">
                    {tracks.length === 0 ? (
                        <div className="text-center text-zinc-500 py-8">
                            No ignored tracks yet.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {tracks
                                .filter(track => filterPlaylist === 'all' || track.sourcePlaylist === filterPlaylist)
                                .sort((a, b) => {
                                    let fieldA = '';
                                    let fieldB = '';

                                    switch (sortBy) {
                                        case 'artist': fieldA = a.artist; fieldB = b.artist; break;
                                        case 'title': fieldA = a.title; fieldB = b.title; break;
                                        case 'album': fieldA = a.album; fieldB = b.album; break;
                                        case 'playlist': fieldA = getPlaylistName(a.sourcePlaylist); fieldB = getPlaylistName(b.sourcePlaylist); break;
                                    }

                                    const cmp = fieldA.toLowerCase().localeCompare(fieldB.toLowerCase());
                                    return sortOrder === 'asc' ? cmp : -cmp;
                                })
                                .map(track => (
                                    <div
                                        key={track.id}
                                        onClick={() => toggleSelection(track.id)}
                                        className={`border rounded-lg p-2 cursor-pointer transition-colors ${selectedIds.includes(track.id)
                                            ? 'bg-red-900/20 border-red-700/50'
                                            : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(track.id)}
                                                onChange={() => toggleSelection(track.id)}
                                                className="w-4 h-4 accent-red-500 flex-shrink-0"
                                            />

                                            <div className="flex-1 min-w-0 flex items-center gap-2">
                                                {/* Left: Kept Track */}
                                                <div className="flex-1 min-w-0 bg-black/40 rounded p-1.5 border border-green-500/20">
                                                    <div className="text-[10px] text-zinc-500 mb-0.5 max-w-full truncate">
                                                        Playlist: {getPlaylistName(track.sourcePlaylist)}
                                                    </div>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-green-400 font-bold text-xs truncate" title={track.title}>{track.title}</span>
                                                        <span className="text-zinc-500 text-[10px] whitespace-nowrap">{track.year}</span>
                                                    </div>
                                                    <div className="text-zinc-400 text-[10px] truncate" title={`${track.artist} • ${track.album}`}>
                                                        {track.artist} • {track.album}
                                                    </div>
                                                </div>

                                                {/* Right: Ignored Track */}
                                                <div className="flex-1 min-w-0 bg-black/40 rounded p-1.5 border border-red-500/20">
                                                    {track.ignoredTitle ? (
                                                        <>
                                                            <div className="text-[10px] text-red-400 font-bold mb-0.5">IGNORED MATCH</div>
                                                            <div className="flex items-baseline gap-2">
                                                                <span className="text-zinc-300 font-bold text-xs truncate" title={track.ignoredTitle}>{track.ignoredTitle}</span>
                                                                <span className="text-zinc-600 text-[10px] whitespace-nowrap">{track.ignoredYear}</span>
                                                            </div>
                                                            <div className="text-zinc-500 text-[10px] truncate" title={`${track.ignoredArtist} • ${track.ignoredAlbum}`}>
                                                                {track.ignoredArtist} • {track.ignoredAlbum}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="text-[10px] text-red-400 font-bold mb-0.5">IGNORED REASON</div>
                                                            <div className="text-zinc-400 text-xs italic truncate" title={track.rejectedContext}>
                                                                {track.rejectedContext}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between p-4 border-t border-zinc-700">
                    <div className="text-zinc-400 text-sm">
                        {selectedIds.length > 0 && `${selectedIds.length} selected`}
                    </div>
                    <div className="flex gap-2">
                        {selectedIds.length > 0 && (
                            <button
                                onClick={handleRemoveSelected}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded flex items-center gap-1"
                            >
                                <Trash2 size={16} />
                                Remove Selected
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
