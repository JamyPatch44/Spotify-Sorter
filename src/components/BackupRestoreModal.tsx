import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import { useAppStore } from '../store';
import { invoke } from '../tauri-api';
import { listen } from '@tauri-apps/api/event';
// import { Dropdown } from './ui/Dropdown';

interface BackupRestoreModalProps {
    onClose: () => void;
}

interface BackupProgress {
    current: number;
    total: number;
    playlist_name: string;
}

// Inline FilterDropdown since imports might be tricky relative-wise or we just reuse logic
const FILTER_OPTIONS = ['All', 'Editable Only', 'Owned by Me', 'Public', 'Private'];

function FilterDropdown({ value, onChange }: { value: string, onChange: (v: string) => void }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-2 py-1 rounded border border-zinc-700 flex items-center gap-1 min-w-[100px] justify-between"
            >
                <span className="truncate">{value}</span>
                <span className="text-zinc-500">▼</span>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full left-0 mt-1 w-32 bg-zinc-800 border border-zinc-700 rounded shadow-xl z-50 py-1">
                        {FILTER_OPTIONS.map(opt => (
                            <button
                                key={opt}
                                onClick={() => { onChange(opt); setIsOpen(false); }}
                                className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center justify-between"
                            >
                                {opt}
                                {value === opt && <Check size={12} className="text-green-500" />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export function BackupRestoreModal({ onClose }: BackupRestoreModalProps) {
    const [activeTab, setActiveTab] = useState<'backup' | 'restore'>('backup');
    const {
        playlists,
        selectedPlaylistIds,
        setSelectedPlaylistIds,
        searchQuery,
        setSearchQuery,
        filterType,
        setFilterType
    } = useAppStore();

    const [backups, setBackups] = useState<string[]>([]);
    const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');

    // --- Playlist Selection Logic (Copied/Adapted from PlaylistSection) ---
    const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);

    const filteredPlaylists = useMemo(() => {
        let filtered = playlists;

        switch (filterType) {
            case 'Editable Only': filtered = filtered.filter(p => p.editable); break;
            case 'Owned by Me': filtered = filtered.filter(p => p.owner === 'me' || p.editable); break;
            case 'Public': filtered = filtered.filter(p => p.isPublic); break;
            case 'Private': filtered = filtered.filter(p => !p.isPublic); break;
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(query));
        }
        return filtered;
    }, [playlists, filterType, searchQuery]);

    const handleMouseDown = useCallback((index: number, event: React.MouseEvent) => {
        if (event.button !== 0) return;
        event.preventDefault(); // Prevent text selection

        setIsDragging(true);
        setDragStartIndex(index);

        const playlistId = filteredPlaylists[index].id;

        if (event.shiftKey && lastClickedIndex !== null) {
            // Range select
            const start = Math.min(lastClickedIndex, index);
            const end = Math.max(lastClickedIndex, index);
            const rangeIds = filteredPlaylists.slice(start, end + 1).map(p => p.id);
            setSelectedPlaylistIds(rangeIds);
        } else if (event.ctrlKey || event.metaKey) {
            // Toggle
            if (selectedPlaylistIds.includes(playlistId)) {
                setSelectedPlaylistIds(selectedPlaylistIds.filter(id => id !== playlistId));
            } else {
                setSelectedPlaylistIds([...selectedPlaylistIds, playlistId]);
            }
        } else {
            // Single select
            setSelectedPlaylistIds([playlistId]);
        }
        setLastClickedIndex(index);
    }, [selectedPlaylistIds, lastClickedIndex, filteredPlaylists, setSelectedPlaylistIds]);

    const handleMouseEnter = useCallback((index: number) => {
        if (!isDragging || dragStartIndex === null) return;

        const start = Math.min(dragStartIndex, index);
        const end = Math.max(dragStartIndex, index);
        // During drag, we just select the range from start to current
        // This is a simple implementation; complex one would merging with initial selection
        const rangeIds = filteredPlaylists.slice(start, end + 1).map(p => p.id);
        setSelectedPlaylistIds(rangeIds);
    }, [isDragging, dragStartIndex, filteredPlaylists, setSelectedPlaylistIds]);

    useEffect(() => {
        if (isDragging) {
            const handleGlobalMouseUp = () => {
                setIsDragging(false);
                setDragStartIndex(null);
            };
            window.addEventListener('mouseup', handleGlobalMouseUp);
            return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
        }
    }, [isDragging]);
    // ------------------------------------------------------------------


    useEffect(() => {
        if (activeTab === 'restore') {
            loadBackups();
        }
    }, [activeTab]);

    const loadBackups = async () => {
        try {
            const list = await invoke<string[]>('get_backups');
            setBackups(list);
        } catch (e) {
            console.error('Failed to load backups:', e);
            setStatus('Failed to load backups');
        }
    };

    const handleCreateBackup = async () => {
        if (selectedPlaylistIds.length === 0) {
            setStatus('Please select playlists to backup');
            return;
        }

        setIsLoading(true);
        setStatus('Starting backup...');

        // Listen for progress
        const unlisten = await listen<BackupProgress>('backup-progress', (event) => {
            const { current, total, playlist_name } = event.payload;
            setStatus(`Backing up (${current}/${total}): ${playlist_name}`);
        });

        try {
            await invoke('create_backup', { playlistIds: selectedPlaylistIds });
            setStatus(`Backup created for ${selectedPlaylistIds.length} playlists!`);
            if (activeTab === 'restore') loadBackups();
        } catch (e: any) {
            setStatus(`Error: ${e}`);
        } finally {
            unlisten();
            setIsLoading(false);
        }
    };
    const handleRestore = async () => {
        if (!selectedBackup) return;

        if (!confirm(`Are you sure you want to restore "${selectedBackup}"? This will replace the current playlist content.`)) {
            return;
        }

        setIsLoading(true);
        setStatus('Restoring backup...');

        try {
            await invoke('restore_from_file', { filename: selectedBackup });
            setStatus('Restore complete!');
        } catch (e: any) {
            setStatus(`Error restoring: ${e}`);
        }
        setIsLoading(false);
    };

    const handleOpenFolder = async () => {
        try {
            await invoke('open_backup_folder');
        } catch (e) {
            console.error('Failed to open folder:', e);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div data-tauri-drag-region="true" className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-800/50 rounded-t-lg">
                    <h2 className="text-xl font-bold text-white pointer-events-none">Backup & Restore</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-zinc-700">
                    <button
                        onClick={() => setActiveTab('backup')}
                        className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'backup'
                            ? 'text-white border-green-500 bg-white/5'
                            : 'text-zinc-400 border-transparent hover:text-white hover:bg-white/5'
                            }`}
                    >
                        Create Backup
                    </button>
                    <button
                        onClick={() => setActiveTab('restore')}
                        className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'restore'
                            ? 'text-white border-green-500 bg-white/5'
                            : 'text-zinc-400 border-transparent hover:text-white hover:bg-white/5'
                            }`}
                    >
                        Restore Playlist
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-visible p-4 flex flex-col min-h-0 relative">
                    {activeTab === 'backup' ? (
                        <div className="flex flex-col h-full min-h-0">
                            <h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wider flex-shrink-0">
                                Select Playlists to Backup
                            </h3>

                            {/* Filter Bar */}
                            <div className="flex flex-col gap-2 mb-3 z-10 relative">
                                <div className="flex items-center gap-2">
                                    <span className="text-zinc-500 text-xs">Filter:</span>
                                    <FilterDropdown
                                        value={filterType}
                                        onChange={setFilterType}
                                    />
                                    <span className="text-zinc-500 text-[10px] whitespace-nowrap ml-auto">
                                        {filteredPlaylists.length} of {playlists.length}
                                    </span>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search playlists..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-zinc-800 text-white border border-zinc-700 rounded px-2.5 py-1.5 text-xs placeholder-zinc-500 focus:outline-none focus:border-green-500/50"
                                />
                            </div>

                            {/* Playlist List */}
                            <div
                                className="flex-1 bg-zinc-800/50 border border-zinc-800 rounded-lg overflow-auto min-h-0 custom-scrollbar"
                                style={{ transform: 'translateZ(0)' }}
                            >
                                <div className="divide-y divide-zinc-800">
                                    {filteredPlaylists.map((playlist, index) => (
                                        <div
                                            key={playlist.id}
                                            onMouseDown={(e) => handleMouseDown(index, e)}
                                            onMouseEnter={() => handleMouseEnter(index)}
                                            className={`px-3 py-2 cursor-pointer transition-colors flex items-center gap-2 ${selectedPlaylistIds.includes(playlist.id)
                                                ? 'bg-green-600/20 text-green-400'
                                                : 'hover:bg-zinc-700/50 text-zinc-300'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedPlaylistIds.includes(playlist.id)}
                                                readOnly
                                                className="w-3.5 h-3.5 accent-green-500 pointer-events-none"
                                            />
                                            <span className="flex-1 truncate text-xs">{playlist.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="text-[10px] text-zinc-500 mt-2 text-center">
                                Shift+Click for range • Drag to select
                            </div>
                        </div>
                    ) : (
                        <div>
                            <h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wider">
                                Select Backup to Restore
                            </h3>
                            <div className="bg-zinc-800/50 rounded border border-zinc-700 overflow-hidden">
                                <div className="max-h-64 overflow-y-auto custom-scrollbar p-1">
                                    {backups.length === 0 ? (
                                        <div className="p-8 text-center text-zinc-500 italic">No backups found</div>
                                    ) : (
                                        backups.map((backup, i) => (
                                            <div
                                                key={i}
                                                onClick={() => setSelectedBackup(backup)}
                                                className={`px-3 py-2 cursor-pointer transition-all rounded mb-0.5 text-sm ${selectedBackup === backup
                                                    ? 'bg-green-600/20 text-green-400 ring-1 ring-green-600/50'
                                                    : 'hover:bg-zinc-700 text-zinc-300'
                                                    }`}
                                            >
                                                {backup}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Status */}
                {status && (
                    <div className="px-4 py-2 text-xs font-mono text-zinc-400 border-t border-zinc-800 bg-black/20">
                        {status}
                    </div>
                )}

                {/* Footer */}
                <div className="flex justify-between p-4 border-t border-zinc-700 bg-zinc-800/30">
                    <button
                        onClick={handleOpenFolder}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded text-sm font-medium transition-colors border border-zinc-700"
                    >
                        Open Backup Folder
                    </button>
                    <div className="flex gap-2">
                        {!isLoading && (
                            <button
                                onClick={onClose}
                                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded text-sm font-medium transition-colors border border-zinc-700"
                            >
                                Cancel
                            </button>
                        )}
                        {isLoading ? (
                            <button
                                onClick={onClose}
                                className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm font-bold transition-colors"
                            >
                                Cancel
                            </button>
                        ) : (
                            <button
                                onClick={activeTab === 'backup' ? handleCreateBackup : handleRestore}
                                disabled={activeTab === 'restore' && !selectedBackup}
                                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {activeTab === 'backup' ? 'Create Backup' : 'Restore Selected'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
