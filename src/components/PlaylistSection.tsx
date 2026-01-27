import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { Dropdown } from './ui/Dropdown';

const FILTER_OPTIONS = ['All', 'Editable Only', 'Owned by Me', 'Collaborative', 'Public', 'Private'];

export function PlaylistSection() {
    const {
        playlists,
        selectedPlaylistIds,
        filterType,
        searchQuery,
        setFilterType,
        setSearchQuery,
        setSelectedPlaylistIds,
    } = useAppStore();

    const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);

    const filteredPlaylists = useMemo(() => {
        // First deduplicate by ID to prevent "ghost" selection issues
        const unique = new Map();
        playlists.forEach(p => {
            if (!unique.has(p.id)) {
                unique.set(p.id, p);
            }
        });
        const deduped = Array.from(unique.values());

        let filtered = deduped;

        switch (filterType) {
            case 'Editable Only':
                filtered = filtered.filter(p => p.editable);
                break;
            case 'Owned by Me':
                filtered = filtered.filter(p => p.owner === 'me' || p.editable);
                break;
            case 'Collaborative':
                filtered = filtered.filter(p => p.collaborative);
                break;
            case 'Public':
                filtered = filtered.filter(p => p.isPublic);
                break;
            case 'Private':
                filtered = filtered.filter(p => !p.isPublic);
                break;
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(query));
        }

        return filtered;
        return filtered;
    }, [playlists, filterType, searchQuery]);

    // Reset selection state when the list changes to prevent index mismatch bugs
    useEffect(() => {
        setLastClickedIndex(null);
        setDragStartIndex(null);
        setIsDragging(false);
    }, [filterType, searchQuery, playlists.length]);

    const dragSnapshotRef = useRef<string[]>([]);
    const dragModeRef = useRef<boolean>(true); // true = selecting, false = deselecting

    const handleMouseDown = useCallback((index: number, event: React.MouseEvent) => {
        if (event.button !== 0) return;
        event.preventDefault();

        setIsDragging(true);
        setDragStartIndex(index);

        const playlistId = filteredPlaylists[index].id;
        const isSelected = selectedPlaylistIds.includes(playlistId);

        // Store state at start of drag
        dragSnapshotRef.current = selectedPlaylistIds;
        // Determine mode: If starting on selected, we are deselecting. Else selecting.
        dragModeRef.current = !isSelected;

        if (event.shiftKey && lastClickedIndex !== null) {
            // Shift+click: Select range (REPLACE current selection)
            const start = Math.min(lastClickedIndex, index);
            const end = Math.max(lastClickedIndex, index);
            const rangeIds = filteredPlaylists.slice(start, end + 1).map(p => p.id);
            setSelectedPlaylistIds(rangeIds);
        } else {
            // Regular click OR Ctrl/Cmd+click: Toggle this item
            // We follow the drag mode for the initial click too
            if (dragModeRef.current) {
                // Add
                setSelectedPlaylistIds([...selectedPlaylistIds, playlistId]);
            } else {
                // Remove
                setSelectedPlaylistIds(selectedPlaylistIds.filter(id => id !== playlistId));
            }
        }

        setLastClickedIndex(index);
    }, [selectedPlaylistIds, lastClickedIndex, filteredPlaylists, setSelectedPlaylistIds]);

    const handleMouseEnter = useCallback((index: number) => {
        if (!isDragging || dragStartIndex === null) return;

        const start = Math.min(dragStartIndex, index);
        const end = Math.max(dragStartIndex, index);
        const rangeIds = filteredPlaylists.slice(start, end + 1).map(p => p.id);

        if (dragModeRef.current) {
            // ADD mode: Combine snapshot + new range
            // We use Set to dedup
            setSelectedPlaylistIds(Array.from(new Set([...dragSnapshotRef.current, ...rangeIds])));
        } else {
            // REMOVE mode: Snapshot - new range
            setSelectedPlaylistIds(dragSnapshotRef.current.filter(id => !rangeIds.includes(id)));
        }
    }, [isDragging, dragStartIndex, filteredPlaylists, setSelectedPlaylistIds]);

    // Global mouse up handler to catch drag releases anywhere
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

    const handleSelectAll = () => {
        const allFilteredIds = filteredPlaylists.map(p => p.id);
        setSelectedPlaylistIds([...new Set([...selectedPlaylistIds, ...allFilteredIds])]);
    };

    const handleDeselectAll = () => {
        setSelectedPlaylistIds([]);
    };

    // Get names of selected playlists for display
    const selectedNames = useMemo(() => {
        return playlists
            .filter(p => selectedPlaylistIds.includes(p.id))
            .map(p => p.name);
    }, [playlists, selectedPlaylistIds]);



    const tooltipRef = useRef<HTMLDivElement>(null);

    const handleWheel = (e: React.WheelEvent) => {
        // Allow scrolling the tooltip even when hovering the parent badge
        if (tooltipRef.current) {
            tooltipRef.current.scrollTop += e.deltaY;
        }
    };

    return (
        <div
            className="flex flex-col flex-1 min-h-[140px]"
        >
            {/* Top Summary Removed */}

            <div className="flex items-center justify-between mb-1.5 h-5">
                <span className="text-zinc-400 text-xs font-semibold tracking-tight">Playlist selection</span>

                {selectedPlaylistIds.length > 0 && (
                    <div
                        className="group relative flex items-center gap-1.5 bg-green-900/20 px-2.5 py-1 rounded-full border border-green-900/50 max-w-[60%] z-20"
                        onWheel={handleWheel}
                    >
                        <span className="text-green-400 text-[10px] font-bold whitespace-nowrap">
                            {selectedPlaylistIds.length} selected
                        </span>

                        <div className="h-3 w-px bg-green-500/30 flex-shrink-0"></div>

                        <div className="text-green-300/80 text-[10px] truncate min-w-0 flex-1 cursor-help">
                            {selectedNames.join(', ')}
                        </div>

                        <div className="h-3 w-px bg-green-500/30 flex-shrink-0"></div>

                        <button
                            onClick={handleDeselectAll}
                            className="text-[10px] text-green-400 hover:text-green-300 font-bold hover:underline whitespace-nowrap"
                        >
                            Clear
                        </button>

                        {/* Hover Tooltip with Bridge (pt-2 instead of mt-2) */}
                        <div className="absolute top-full right-0 pt-2 hidden group-hover:block w-64 z-50">
                            <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2">
                                <div className="text-xs text-zinc-400 mb-2 font-medium px-1">Selected Playlists:</div>
                                <div ref={tooltipRef} className="max-h-48 overflow-y-auto space-y-1">
                                    {selectedNames.map((name, i) => (
                                        <div key={i} className="text-xs text-zinc-300 px-1 py-0.5 hover:bg-zinc-800 rounded truncate">
                                            {name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ... controls ... */}
            <div className="flex items-center gap-2 mb-2">
                <button
                    onClick={handleSelectAll}
                    className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-2 py-1 rounded border border-zinc-700"
                >
                    Select all
                </button>
                <button
                    onClick={handleDeselectAll}
                    className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-2 py-1 rounded border border-zinc-700"
                >
                    Deselect all
                </button>
                <span className="text-zinc-600 text-xs ml-2">
                    Click • Ctrl+click to add • Shift for range • Drag to select
                </span>
            </div>

            <div className="flex flex-col gap-1.5 mb-1.5">
                <div className="flex items-center gap-1.5">
                    <span className="text-zinc-500 text-xs">Filter:</span>
                    <Dropdown
                        value={filterType}
                        onChange={(val) => setFilterType(val)}
                        options={FILTER_OPTIONS}
                        className="w-36"
                    />
                    <span className="text-zinc-500 text-[10px] whitespace-nowrap ml-auto hidden sm:block">
                        {filteredPlaylists.length} of {playlists.length}
                    </span>
                </div>
                <input
                    type="text"
                    placeholder="Search playlists..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-800 text-white border border-zinc-700 rounded px-2.5 py-1.5 text-xs placeholder-zinc-500"
                />
            </div>

            <div
                className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-auto min-h-0"
                style={{
                    userSelect: 'none',
                    willChange: 'transform',  // Promote to own layer to prevent WebView2 popup dismissal bugs
                    transform: 'translateZ(0)'
                }}
            >
                {filteredPlaylists.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500">
                        {playlists.length === 0
                            ? 'Connect to Spotify to load playlists'
                            : 'No playlists match your filter'}
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800">
                        {filteredPlaylists.map((playlist, index) => (
                            <div
                                key={playlist.id}
                                onMouseDown={(e) => handleMouseDown(index, e)}
                                onMouseEnter={() => handleMouseEnter(index)}
                                className={`px-2.5 py-1 cursor-pointer transition-colors flex items-center gap-2 ${selectedPlaylistIds.includes(playlist.id)
                                    ? 'bg-green-600/20 text-green-400'
                                    : 'hover:bg-zinc-800 text-zinc-300'
                                    }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedPlaylistIds.includes(playlist.id)}
                                    onChange={() => { }} // Handled by onMouseDown to preempt row click
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        if (selectedPlaylistIds.includes(playlist.id)) {
                                            setSelectedPlaylistIds(selectedPlaylistIds.filter(id => id !== playlist.id));
                                        } else {
                                            setSelectedPlaylistIds([...selectedPlaylistIds, playlist.id]);
                                        }
                                    }}
                                    className="w-3.5 h-3.5 accent-green-500 cursor-pointer"
                                />
                                <span className="flex-1 truncate text-xs">{playlist.name}</span>
                                {!playlist.editable && (
                                    <span className="text-[10px] bg-zinc-600/50 text-zinc-400 px-1 py-0.5 rounded flex-shrink-0 hidden sm:block">Read-only</span>
                                )}
                                {playlist.collaborative && (
                                    <span className="text-[10px] bg-blue-600/30 text-blue-400 px-1 py-0.5 rounded flex-shrink-0 hidden sm:block">Collab</span>
                                )}
                                {playlist.isPublic && (
                                    <span className="text-[10px] bg-purple-600/30 text-purple-400 px-1 py-0.5 rounded flex-shrink-0 hidden sm:block">Public</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
