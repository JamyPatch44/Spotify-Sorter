import { useState } from 'react';
import { Info, Plus, Trash2, Play, Edit2, Calendar } from 'lucide-react';
import { invoke } from '../tauri-api';


// Types matching backend
export interface Source {
    type: 'playlist' | 'likedSongs';
    id?: string;
}

export interface FilterConfig {
    excludeLiked: boolean;
    keywordBlacklist: string[];
}

export interface SortRule {
    id: string;
    criteria: string;
    descending: boolean;
}

export interface ProcessingOptions {
    applySort: boolean;
    applyDupes: boolean;
    applyVersions: boolean;
    sortRules: SortRule[];
    dupePreference: string;
    versionPreference: string;
}

export interface DynamicPlaylistConfig {
    id: string;
    name: string;
    targetPlaylistId: string;
    sources: Source[];
    filters: FilterConfig;
    updateMode: 'replace' | 'merge' | 'append';
    samplePerSource: number | null;
    includeLikedSongs: boolean;
    processing: ProcessingOptions;
}

const INFO_CONTENT = (
    <div className="space-y-3 text-sm text-green-400">
        <p className="font-bold">DYNAMIC PLAYLISTS:</p>
        <p>Create playlists that automatically update from multiple sources.</p>
        <ul className="list-disc pl-4 space-y-1">
            <li><span className="font-semibold">Sources:</span> Pull tracks from multiple playlists.</li>
            <li><span className="font-semibold">Filters:</span> Exclude liked songs or tracks with specific keywords.</li>
            <li><span className="font-semibold">Update Modes:</span> Replace, Merge, or Append new tracks.</li>
            <li><span className="font-semibold">Sampling:</span> Optionally limit tracks per source for variety.</li>
        </ul>
        <p className="text-zinc-500 italic">Click "Update Now" to refresh a playlist or run all during automation.</p>
    </div>
);

export function DynamicPlaylistSection({
    configs,
    onManageSchedules,
    onEdit,
    onAdd,
    onDelete
}: {
    configs: DynamicPlaylistConfig[],
    onManageSchedules: (id?: string) => void,
    onEdit: (config: DynamicPlaylistConfig) => void,
    onAdd: () => void,
    onDelete: (id: string) => void
}) {
    const [showHelp, setShowHelp] = useState(false);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const handleUpdate = async (id: string) => {
        setUpdatingId(id);
        try {
            const count = await invoke<number>('run_dynamic_update', { configId: id });
            const { message } = await import('@tauri-apps/plugin-dialog');
            await message(`Updated! ${count} tracks in playlist.`, { title: 'Dynamic Playlist', kind: 'info' });
        } catch (e) {
            console.error('Failed to update:', e);
            const { message } = await import('@tauri-apps/plugin-dialog');
            await message(`Error: ${e}`, { title: 'Error', kind: 'error' });
        } finally {
            setUpdatingId(null);
        }
    };

    const handleDelete = (id: string) => {
        onDelete(id);
        setConfirmDeleteId(null);
    };

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-2">
                <span className="text-green-500 font-semibold text-sm tracking-tight flex items-center gap-2">
                    ➕ Dynamic Playlists
                    <span className="text-zinc-500 font-normal">({configs.length})</span>
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onManageSchedules()}
                        className="p-1 rounded hover:bg-zinc-800 text-yellow-500 hover:text-yellow-400 transition-colors"
                        title="Manage Schedules"
                    >
                        <Calendar size={16} />
                    </button>
                    <button
                        onClick={onAdd}
                        className="p-1 rounded hover:bg-zinc-800 text-green-500 hover:text-green-400 transition-colors"
                        title="Add new dynamic playlist"
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        onClick={() => setShowHelp(!showHelp)}
                        className={`transition-colors p-1 rounded-full hover:bg-zinc-800 ${showHelp ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <Info size={16} />
                    </button>
                </div>
            </div>

            {showHelp && (
                <div className="mb-3 p-3 bg-zinc-900/80 border border-t-0 border-x-0 border-b-0 border-l-4 border-l-green-500 rounded-r-lg">
                    {INFO_CONTENT}
                </div>
            )}

            {configs.length === 0 ? (
                <div className="text-zinc-500 text-sm py-3 text-center">
                    No dynamic playlists configured. Click + to create one.
                </div>
            ) : (
                <div className="space-y-1">
                    {configs.map((config) => (
                        <div
                            key={config.id}
                            className="flex items-center justify-between bg-zinc-800/50 rounded px-2 py-1.5 group"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-sm text-white truncate">{config.name}</div>
                                <div className="text-xs text-zinc-500 truncate">
                                    {config.sources.length} source{config.sources.length !== 1 ? 's' : ''} •{' '}
                                    {config.updateMode}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleUpdate(config.id)}
                                    disabled={updatingId !== null}
                                    className="p-1 rounded hover:bg-zinc-700 text-green-500 disabled:opacity-50"
                                    title="Update Now"
                                >
                                    {updatingId === config.id ? (
                                        <span className="animate-spin">⟳</span>
                                    ) : (
                                        <Play size={14} />
                                    )}
                                </button>
                                <button
                                    onClick={() => onManageSchedules(config.id)}
                                    className="p-1 rounded hover:bg-zinc-700 text-yellow-500 hover:text-yellow-400"
                                    title="Schedule"
                                >
                                    <Calendar size={14} />
                                </button>

                                <button
                                    onClick={() => onEdit(config)}
                                    className="p-1 rounded hover:bg-zinc-700 text-zinc-400"
                                    title="Edit"
                                >
                                    <Edit2 size={14} />
                                </button>
                                {confirmDeleteId === config.id ? (
                                    <div className="flex items-center gap-1 bg-red-900/20 px-2 py-0.5 rounded border border-red-900/30">
                                        <span className="text-red-400 text-[10px] mr-1">Sure?</span>
                                        <button
                                            onClick={() => handleDelete(config.id)}
                                            className="text-red-400 hover:text-red-300 p-0.5 hover:bg-white/10 rounded"
                                        >
                                            <div className="text-[10px] font-bold">YES</div>
                                        </button>
                                        <button
                                            onClick={() => setConfirmDeleteId(null)}
                                            className="text-zinc-400 hover:text-zinc-300 p-0.5 hover:bg-white/10 rounded"
                                        >
                                            <div className="text-[10px] font-bold">NO</div>
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setConfirmDeleteId(config.id)}
                                        className="p-1 rounded hover:bg-zinc-700 text-red-400"
                                        title="Delete"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}


        </div>
    );
}
