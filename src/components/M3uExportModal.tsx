import { useState } from 'react';
import { X, Download, FolderOpen, Music, AlertCircle, CheckSquare, Square } from 'lucide-react';
import { useAppStore } from '../store';
import { invoke } from '../tauri-api';
import { open } from '@tauri-apps/plugin-dialog';

interface M3uExportResult {
    matched_count: number;
    unmatched_count: number;
    unmatched_tracks: string[];
    output_path: string;
}

interface M3uExportModalProps {
    onClose: () => void;
}

export function M3uExportModal({ onClose }: M3uExportModalProps) {
    const { selectedPlaylistIds, playlists } = useAppStore();
    const [musicFolder, setMusicFolder] = useState('');
    const [outputFolder, setOutputFolder] = useState('');
    const [includeUnmatched, setIncludeUnmatched] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [result, setResult] = useState<M3uExportResult | null>(null);
    const [error, setError] = useState('');

    const selectedPlaylistNames = selectedPlaylistIds
        .map(id => playlists.find(p => p.id === id)?.name)
        .filter(Boolean);

    const handlePickMusicFolder = async () => {
        const folder = await open({
            directory: true,
            multiple: false,
            title: 'Select your music folder',
        });
        if (folder && typeof folder === 'string') {
            setMusicFolder(folder);
        }
    };

    const handlePickOutputFolder = async () => {
        const folder = await open({
            directory: true,
            multiple: false,
            title: 'Select output folder for M3U files',
        });
        if (folder && typeof folder === 'string') {
            setOutputFolder(folder);
        }
    };

    const handleExport = async () => {
        if (selectedPlaylistIds.length === 0) {
            setError('Please select playlists to export');
            return;
        }
        if (!musicFolder) {
            setError('Please select your music folder');
            return;
        }

        setIsExporting(true);
        setError('');
        setResult(null);

        try {
            const res = await invoke<M3uExportResult>('export_m3u', {
                playlistIds: selectedPlaylistIds,
                musicFolder,
                outputFolder: outputFolder || null,
                includeUnmatched,
            });
            setResult(res);
        } catch (e: any) {
            setError(String(e));
        }

        setIsExporting(false);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl mx-4 shadow-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div data-tauri-drag-region="true" className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-800/50 rounded-t-lg shrink-0">
                    <h2 className="text-xl font-bold text-white pointer-events-none flex items-center gap-2">
                        <Music size={20} />
                        Export M3U
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
                                Export playlists to M3U format by matching Spotify tracks with your local music files.
                                Uses ID3 tags and fuzzy matching for best results.
                            </p>

                            {/* Music Folder Picker */}
                            <div className="bg-zinc-800 rounded p-3">
                                <div className="text-zinc-400 text-sm mb-2">Music Folder (required):</div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={musicFolder}
                                        readOnly
                                        placeholder="Select your music folder..."
                                        className="flex-1 bg-zinc-700 text-white px-3 py-2 rounded text-sm"
                                    />
                                    <button
                                        onClick={handlePickMusicFolder}
                                        className="bg-zinc-600 hover:bg-zinc-500 text-white px-3 py-2 rounded flex items-center gap-2"
                                    >
                                        <FolderOpen size={16} />
                                        Browse
                                    </button>
                                </div>
                            </div>

                            {/* Output Folder Picker */}
                            <div className="bg-zinc-800 rounded p-3">
                                <div className="text-zinc-400 text-sm mb-2">Output Folder (optional):</div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={outputFolder}
                                        readOnly
                                        placeholder="Default: app exports folder"
                                        className="flex-1 bg-zinc-700 text-white px-3 py-2 rounded text-sm"
                                    />
                                    <button
                                        onClick={handlePickOutputFolder}
                                        className="bg-zinc-600 hover:bg-zinc-500 text-white px-3 py-2 rounded flex items-center gap-2"
                                    >
                                        <FolderOpen size={16} />
                                        Browse
                                    </button>
                                </div>
                            </div>

                            {/* Options */}
                            <div className="bg-zinc-800 rounded p-3">
                                <button
                                    onClick={() => setIncludeUnmatched(!includeUnmatched)}
                                    className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors"
                                >
                                    {includeUnmatched ? (
                                        <CheckSquare size={18} className="text-green-500" />
                                    ) : (
                                        <Square size={18} className="text-zinc-500" />
                                    )}
                                    Include unmatched tracks as comments in M3U
                                </button>
                                <p className="text-zinc-500 text-xs mt-1.5 ml-6">
                                    Helps you see what's missing from your local library
                                </p>
                            </div>

                            {/* Selected Playlists */}
                            <div className="bg-zinc-800 rounded p-3">
                                <div className="text-zinc-400 text-sm mb-2">Selected Playlists ({selectedPlaylistIds.length}):</div>
                                {selectedPlaylistNames.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {selectedPlaylistNames.slice(0, 8).map((name, i) => (
                                            <span key={i} className="bg-zinc-700 text-white px-2 py-1 rounded text-sm">
                                                {name}
                                            </span>
                                        ))}
                                        {selectedPlaylistNames.length > 8 && (
                                            <span className="text-zinc-400 text-sm">+{selectedPlaylistNames.length - 8} more</span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-red-400 text-sm">No playlists selected</div>
                                )}
                            </div>

                            {error && (
                                <div className="bg-red-900/30 border border-red-700 rounded p-3 text-red-400 flex items-center gap-2">
                                    <AlertCircle size={16} />
                                    {error}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="bg-green-900/30 border border-green-700 rounded p-4">
                                <div className="text-green-400 font-medium mb-2">Export Complete!</div>
                                <div className="text-white">
                                    <span className="font-bold">{result.matched_count}</span> tracks matched
                                    {result.unmatched_count > 0 && (
                                        <span className="text-zinc-400"> • {result.unmatched_count} unmatched</span>
                                    )}
                                </div>
                                <div className="text-zinc-400 text-sm mt-2">
                                    Saved to: {result.output_path}
                                </div>
                            </div>

                            {result.unmatched_tracks.length > 0 && (
                                <div className="bg-zinc-800 rounded p-3">
                                    <div className="text-zinc-400 text-sm mb-2 flex items-center gap-2">
                                        <AlertCircle size={14} />
                                        Unmatched Tracks (not found locally):
                                    </div>
                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                        {result.unmatched_tracks.map((track, i) => (
                                            <div key={i} className="text-zinc-500 text-sm">
                                                {track}
                                            </div>
                                        ))}
                                        {result.unmatched_count > 50 && (
                                            <div className="text-zinc-600 text-xs mt-2">
                                                ...and {result.unmatched_count - 50} more
                                            </div>
                                        )}
                                    </div>
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
                            onClick={handleExport}
                            disabled={isExporting || selectedPlaylistIds.length === 0 || !musicFolder}
                            className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 text-white px-4 py-2 rounded flex items-center gap-2"
                        >
                            <Download size={16} />
                            {isExporting ? 'Exporting...' : 'Export M3U'}
                        </button>
                    )}
                    {result && (
                        <button
                            onClick={() => setResult(null)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                        >
                            Export Again
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
