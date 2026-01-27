import { useState } from 'react';
import { X, Download } from 'lucide-react';
import { useAppStore } from '../store';
import { invoke } from '../tauri-api';

interface ExportModalProps {
    type: 'automation' | 'csv';
    onClose: () => void;
}

export function ExportModal({ type, onClose }: ExportModalProps) {
    const { selectedPlaylistIds, sortRules, sortEnabled, dupesEnabled, dupePreference, versionEnabled, versionPreference } = useAppStore();
    const [isExporting, setIsExporting] = useState(false);
    const [status, setStatus] = useState('');

    const handleExport = async () => {
        if (type === 'csv' && selectedPlaylistIds.length === 0) {
            setStatus('Please select playlists to export');
            return;
        }

        setIsExporting(true);
        setStatus('Exporting...');

        try {
            if (type === 'automation') {
                const config = {
                    sortEnabled,
                    sortRules,
                    dupesEnabled,
                    dupePreference,
                    versionEnabled,
                    versionPreference,
                    playlistIds: selectedPlaylistIds,
                };
                await invoke('export_automation_config', { config });
                setStatus('Automation config exported!');
            } else {
                await invoke('export_csv', { playlistIds: selectedPlaylistIds });
                setStatus(`Exported ${selectedPlaylistIds.length} playlists to CSV!`);
            }
        } catch (e: any) {
            setStatus(`Error: ${e}`);
        }

        setIsExporting(false);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-md mx-4 shadow-2xl">
                {/* Header */}
                <div data-tauri-drag-region="true" className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-800/50 rounded-t-lg">
                    <h2 className="text-xl font-bold text-white pointer-events-none">
                        {type === 'automation' ? 'Export Automation Config' : 'Export CSV'}
                    </h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {type === 'automation' ? (
                        <div className="space-y-4">
                            <p className="text-zinc-400">
                                Export your current settings to a JSON file for automation or sharing.
                            </p>
                            <div className="bg-zinc-800 rounded p-3 text-sm">
                                <div className="text-zinc-400">Current Settings:</div>
                                <div className="text-white mt-2">
                                    • Sort: {sortEnabled ? `${sortRules.length} rules` : 'Disabled'}
                                </div>
                                <div className="text-white">
                                    • Duplicates: {dupesEnabled ? dupePreference : 'Disabled'}
                                </div>
                                <div className="text-white">
                                    • Version Replacer: {versionEnabled ? versionPreference : 'Disabled'}
                                </div>
                                <div className="text-white">
                                    • Playlists: {selectedPlaylistIds.length} selected
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-zinc-400">
                                Export selected playlists to CSV files.
                            </p>
                            <div className="bg-zinc-800 rounded p-3">
                                <div className="text-white">
                                    {selectedPlaylistIds.length} playlists selected
                                </div>
                                {selectedPlaylistIds.length === 0 && (
                                    <div className="text-red-400 text-sm mt-1">
                                        Please select playlists first
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {status && (
                        <div className="mt-4 text-sm text-zinc-400">
                            {status}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-4 border-t border-zinc-700">
                    <button
                        onClick={onClose}
                        className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={isExporting || (type === 'csv' && selectedPlaylistIds.length === 0)}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-4 py-2 rounded flex items-center gap-2"
                    >
                        <Download size={16} />
                        Export
                    </button>
                </div>
            </div>
        </div>
    );
}
