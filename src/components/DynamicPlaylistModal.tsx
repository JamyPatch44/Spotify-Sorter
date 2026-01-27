import { useState } from 'react';
import { X, Search, Check } from 'lucide-react';
import { useAppStore } from '../store';
import { DynamicPlaylistConfig, Source, FilterConfig } from './DynamicPlaylistSection';

// Filter constants and component
const FILTER_OPTIONS = ['All', 'Editable Only', 'Owned by Me', 'Public', 'Private'];

function FilterDropdown({ value, onChange }: { value: string, onChange: (v: string) => void }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-white px-2 py-1 rounded border border-zinc-700 flex items-center gap-1 min-w-[90px] justify-between"
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

interface Props {
    config: DynamicPlaylistConfig | null;
    onSave: (config: DynamicPlaylistConfig) => void;
    onCancel: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

export function DynamicPlaylistModal({ config, onSave, onCancel }: Props) {
    const { playlists, sortEnabled, sortRules, dupesEnabled, dupePreference, versionEnabled, versionPreference } = useAppStore();

    const [name, setName] = useState(config?.name || '');
    const [targetPlaylistId, setTargetPlaylistId] = useState(config?.targetPlaylistId || '');
    const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(
        config?.sources.filter(s => s.type === 'playlist').map(s => s.id!) || []
    );
    const [includeLikedSongs, setIncludeLikedSongs] = useState(config?.includeLikedSongs || false);
    const [excludeLiked, setExcludeLiked] = useState(config?.filters.excludeLiked || false);
    const [keywordBlacklist, setKeywordBlacklist] = useState(
        config?.filters.keywordBlacklist.join(', ') || ''
    );
    const [updateMode, setUpdateMode] = useState<'replace' | 'merge' | 'append'>(
        config?.updateMode || 'replace'
    );
    const [samplePerSource, setSamplePerSource] = useState<string>(
        config?.samplePerSource?.toString() || ''
    );

    // Processing options - load from config if editing, otherwise use app defaults
    const [applySort, setApplySort] = useState(config?.processing?.applySort ?? sortEnabled);
    const [applyDupes, setApplyDupes] = useState(config?.processing?.applyDupes ?? dupesEnabled);
    const [applyVersions, setApplyVersions] = useState(config?.processing?.applyVersions ?? versionEnabled);

    // Search states
    const [targetSearch, setTargetSearch] = useState('');
    const [sourceSearch, setSourceSearch] = useState('');
    const [sourceFilter, setSourceFilter] = useState('All');
    const [targetFilter, setTargetFilter] = useState('Editable Only');
    const [error, setError] = useState<string | null>(null);

    const getFilteredPlaylists = (filter: string, search: string, onlyEditable = false) => {
        let filtered = playlists;
        if (onlyEditable) filtered = filtered.filter(p => p.editable);

        switch (filter) {
            case 'Editable Only': filtered = filtered.filter(p => p.editable); break;
            case 'Owned by Me': filtered = filtered.filter(p => p.owner === 'me' || p.editable); break;
            case 'Public': filtered = filtered.filter(p => p.isPublic); break;
            case 'Private': filtered = filtered.filter(p => !p.isPublic); break;
        }

        if (search) {
            const query = search.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(query));
        }
        return filtered;
    };

    const filteredTargetPlaylists = getFilteredPlaylists(targetFilter, targetSearch, true);
    const filteredSourcePlaylists = getFilteredPlaylists(sourceFilter, sourceSearch);

    const toggleSource = (id: string) => {
        setSelectedSourceIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const selectAllVisible = () => {
        const visibleIds = filteredSourcePlaylists.map(p => p.id);
        setSelectedSourceIds(prev => [...new Set([...prev, ...visibleIds])]);
    };

    const deselectAllVisible = () => {
        const visibleIds = new Set(filteredSourcePlaylists.map(p => p.id));
        setSelectedSourceIds(prev => prev.filter(id => !visibleIds.has(id)));
    };

    const handleSubmit = () => {
        if (!name.trim()) {
            setError('Please enter a name for this dynamic playlist.');
            return;
        }
        if (!targetPlaylistId) {
            setError('Please select a target playlist.');
            return;
        }
        if (selectedSourceIds.length === 0 && !includeLikedSongs) {
            setError('Please select at least one source playlist or include Liked Songs.');
            return;
        }
        setError(null);

        const sources: Source[] = selectedSourceIds.map(id => ({ type: 'playlist', id }));
        if (includeLikedSongs) {
            sources.push({ type: 'likedSongs' });
        }

        const filters: FilterConfig = {
            excludeLiked,
            keywordBlacklist: keywordBlacklist.split(',').map(k => k.trim()).filter(Boolean),
        };

        const newConfig: DynamicPlaylistConfig = {
            id: config?.id || generateId(),
            name: name.trim(),
            targetPlaylistId,
            sources,
            filters,
            updateMode,
            samplePerSource: samplePerSource ? parseInt(samplePerSource) : null,
            includeLikedSongs,
            processing: {
                applySort,
                applyDupes,
                applyVersions,
                sortRules: sortRules,
                dupePreference: dupePreference,
                versionPreference: versionPreference,
            },
        };

        onSave(newConfig);
    };

    const selectedTarget = playlists.find(p => p.id === targetPlaylistId);

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-[1000px] max-h-[90vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div
                    className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-800/50"
                    data-tauri-drag-region
                >
                    <h2 className="text-lg font-bold text-green-500 tracking-tight">
                        {config ? 'Edit Dynamic Playlist' : 'New Dynamic Playlist'}
                    </h2>
                    <button onClick={onCancel} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Name */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Configuration Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="My Dynamic Playlist"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white text-sm focus:border-green-500/50 focus:outline-none transition-colors"
                        />
                    </div>

                    {/* Two-column layout for Target and Sources */}
                    <div className="grid grid-cols-2 gap-5">
                        {/* Target Playlist */}
                        <div className="bg-zinc-800/20 rounded-lg p-3 border border-zinc-800/50">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Target Playlist</label>
                                <FilterDropdown value={targetFilter} onChange={setTargetFilter} />
                            </div>
                            <div className="relative mb-2">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                <input
                                    type="text"
                                    value={targetSearch}
                                    onChange={(e) => setTargetSearch(e.target.value)}
                                    placeholder="Search..."
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-white text-xs focus:border-green-500/50 focus:outline-none"
                                />
                            </div>
                            <div className="h-40 overflow-y-auto bg-zinc-950/50 rounded border border-zinc-800 p-1">
                                {filteredTargetPlaylists.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setTargetPlaylistId(p.id)}
                                        className={`w-full text-left px-3 py-1.5 text-sm truncate transition-colors ${targetPlaylistId === p.id
                                            ? 'bg-green-500/20 text-green-400'
                                            : 'text-white hover:bg-zinc-700/50'
                                            }`}
                                    >
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                            {selectedTarget && (
                                <div className="mt-2 text-xs text-green-400 truncate">
                                    Selected: {selectedTarget.name}
                                </div>
                            )}
                        </div>

                        {/* Source Playlists */}
                        <div className="bg-zinc-800/20 rounded-lg p-3 border border-zinc-800/50">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <label
                                        className="text-xs font-medium text-zinc-500 uppercase tracking-wide cursor-help"
                                        title={playlists.filter(p => selectedSourceIds.includes(p.id)).map(p => p.name).join('\n')}
                                    >
                                        Source Playlists <span className="text-green-500">({selectedSourceIds.length})</span>
                                    </label>
                                    <FilterDropdown value={sourceFilter} onChange={setSourceFilter} />
                                </div>
                                <div className="flex gap-1 text-[10px] uppercase font-bold tracking-wider">
                                    <button onClick={selectAllVisible} className="text-zinc-500 hover:text-green-400 transition-colors">All</button>
                                    <span className="text-zinc-700">|</span>
                                    <button onClick={deselectAllVisible} className="text-zinc-500 hover:text-red-400 transition-colors">None</button>
                                </div>
                            </div>
                            <div className="relative mb-2">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                <input
                                    type="text"
                                    value={sourceSearch}
                                    onChange={(e) => setSourceSearch(e.target.value)}
                                    placeholder="Search..."
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-white text-xs focus:border-green-500/50 focus:outline-none"
                                />
                            </div>
                            <div className="h-40 overflow-y-auto bg-zinc-950/50 rounded border border-zinc-800 p-1">
                                {filteredSourcePlaylists
                                    .sort((a, b) => {
                                        const aSelected = selectedSourceIds.includes(a.id);
                                        const bSelected = selectedSourceIds.includes(b.id);
                                        if (aSelected && !bSelected) return -1;
                                        if (!aSelected && bSelected) return 1;
                                        return 0;
                                    })
                                    .map(p => (
                                        <div
                                            key={p.id}
                                            onClick={() => toggleSource(p.id)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors mb-0.5 ${selectedSourceIds.includes(p.id) ? 'bg-green-600/20 text-green-400' : 'hover:bg-zinc-700/50 text-zinc-300'
                                                }`}
                                        >
                                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${selectedSourceIds.includes(p.id)
                                                ? 'bg-green-500 border-green-500'
                                                : 'border-zinc-700 bg-zinc-900'
                                                }`}>
                                                {selectedSourceIds.includes(p.id) && <Check size={10} className="text-black" strokeWidth={3} />}
                                            </div>
                                            <span className={`text-xs truncate flex-1 ${selectedSourceIds.includes(p.id) ? 'text-green-100' : 'text-zinc-300 group-hover:text-white'}`}>{p.name}</span>
                                        </div>
                                    ))}
                            </div>
                            <label className="flex items-center gap-2 mt-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={includeLikedSongs}
                                    onChange={(e) => setIncludeLikedSongs(e.target.checked)}
                                    className="accent-green-500 rounded-sm"
                                />
                                <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">Include Liked Songs as Source</span>
                            </label>
                        </div>
                    </div>

                    {/* Processing Options */}
                    <div className="bg-zinc-800/20 rounded-lg p-3 border border-zinc-800/50">
                        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Processing Options</h3>
                        <p className="text-[10px] text-zinc-600 mb-3">Apply your global rules for sorting and deduplication.</p>
                        <div className="grid grid-cols-3 gap-3">
                            <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${applySort ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-900/30 border-zinc-800 hover:border-zinc-700'
                                }`}>
                                <input
                                    type="checkbox"
                                    checked={applySort}
                                    onChange={(e) => setApplySort(e.target.checked)}
                                    className="accent-green-500"
                                />
                                <div>
                                    <div className={`text-xs font-medium ${applySort ? 'text-green-400' : 'text-zinc-400'}`}>Sort</div>
                                    <div className="text-[10px] text-zinc-600">{sortEnabled ? `${sortRules.length} rules configured` : 'Rules disabled'}</div>
                                </div>
                            </label>
                            <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${applyDupes ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-900/30 border-zinc-800 hover:border-zinc-700'
                                }`}>
                                <input
                                    type="checkbox"
                                    checked={applyDupes}
                                    onChange={(e) => setApplyDupes(e.target.checked)}
                                    className="accent-green-500"
                                />
                                <div>
                                    <div className={`text-xs font-medium ${applyDupes ? 'text-green-400' : 'text-zinc-400'}`}>Dedup</div>
                                    <div className="text-[10px] text-zinc-600 truncate max-w-[80px]">{dupesEnabled ? 'Enabled' : 'Disabled'}</div>
                                </div>
                            </label>
                            <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${applyVersions ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-900/30 border-zinc-800 hover:border-zinc-700'
                                }`}>
                                <input
                                    type="checkbox"
                                    checked={applyVersions}
                                    onChange={(e) => setApplyVersions(e.target.checked)}
                                    className="accent-green-500"
                                />
                                <div>
                                    <div className={`text-xs font-medium ${applyVersions ? 'text-green-400' : 'text-zinc-400'}`}>Versions</div>
                                    <div className="text-[10px] text-zinc-600 truncate">{versionEnabled ? 'Enabled' : 'Disabled'}</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Filters and Options Row */}
                    <div className="grid grid-cols-2 gap-5">
                        {/* Filters */}
                        <div className="bg-zinc-800/20 rounded-lg p-3 border border-zinc-800/50 flex flex-col h-full">
                            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Filters</h3>
                            <label className="flex items-center gap-2 cursor-pointer mb-3 group">
                                <input
                                    type="checkbox"
                                    checked={excludeLiked}
                                    onChange={(e) => setExcludeLiked(e.target.checked)}
                                    className="accent-green-500"
                                />
                                <span className="text-xs text-zinc-400 group-hover:text-zinc-300">Exclude liked songs</span>
                            </label>
                            <div className="mt-auto">
                                <label className="block text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Exclude keywords (comma separated)</label>
                                <input
                                    type="text"
                                    value={keywordBlacklist}
                                    onChange={(e) => setKeywordBlacklist(e.target.value)}
                                    placeholder="remix, instrumental"
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-white text-xs focus:border-green-500/50 focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* Update Mode & Sample */}
                        <div className="bg-zinc-800/20 rounded-lg p-3 border border-zinc-800/50 flex flex-col h-full">
                            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Update Mode</h3>
                            <div className="flex gap-1 mb-3 bg-zinc-900 p-0.5 rounded border border-zinc-800">
                                {(['replace', 'merge', 'append'] as const).map(mode => (
                                    <button
                                        key={mode}
                                        title={{
                                            replace: "Overwrites the target playlist completely.",
                                            merge: "Adds missing tracks to the target (prevents duplicates).",
                                            append: "Adds tracks to the end of the target (may create duplicates)."
                                        }[mode]}
                                        onClick={() => setUpdateMode(mode)}
                                        className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium uppercase tracking-wide transition-all ${updateMode === mode
                                            ? 'bg-green-600 text-white shadow-sm'
                                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                                            }`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-auto">
                                <label className="block text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Sample Limit (per source)</label>
                                <input
                                    type="number"
                                    value={samplePerSource}
                                    onChange={(e) => setSamplePerSource(e.target.value)}
                                    placeholder="No limit"
                                    min={1}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-white text-xs focus:border-green-500/50 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center bg-zinc-800/30 p-4 border-t border-zinc-700 rounded-b-lg">
                    <div className="flex flex-col gap-1">
                        {error ? (
                            <div className="text-red-400 text-xs font-semibold animate-pulse">
                                ⚠️ {error}
                            </div>
                        ) : (
                            <div className="text-xs text-zinc-600 italic">
                                Updates happen automatically on schedule or manually.
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            className="px-4 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700 hover:border-zinc-600 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="px-5 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-bold uppercase tracking-wide shadow-lg shadow-green-900/20 transition-all hover:scale-105"
                        >
                            {config ? 'Save Changes' : 'Create Playlist'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
