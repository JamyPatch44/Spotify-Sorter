import { useState, useRef } from 'react';

interface ActionButtonsProps {
    onRun: () => void;
    onCancel: () => void;
    onBackupRestore: () => void;
    onHistoryUndo: () => void;
    onExportAutomation: () => void;
    onExportCsv: () => void;
    onCompare: () => void;
    onExportM3u: () => void;

    isProcessing: boolean;
    selectedCount: number;
}

export function ActionButtons({
    onRun,
    onCancel,
    onBackupRestore,
    onHistoryUndo,
    onExportAutomation,
    onExportCsv,
    onCompare,
    onExportM3u,

    isProcessing,
    selectedCount,
}: ActionButtonsProps) {
    const [compareFeedback, setCompareFeedback] = useState<string | null>(null);
    const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    return (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-zinc-800">
            {isProcessing ? (
                <button
                    onClick={onCancel}
                    className="flex-grow min-w-[180px] bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold py-2 rounded text-sm transition-colors flex items-center justify-center gap-2"
                >
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    STOP / CANCEL
                </button>
            ) : (
                <button
                    onClick={onRun}
                    disabled={selectedCount === 0}
                    className="flex-grow min-w-[180px] bg-green-600 hover:bg-green-700 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-bold py-2 rounded text-sm transition-colors disabled:shadow-none shadow-lg shadow-green-900/20"
                >
                    {selectedCount === 0 ? 'SELECT PLAYLISTS' : `PROCESS ${selectedCount} PLAYLIST${selectedCount !== 1 ? 'S' : ''}`}
                </button>
            )}

            <div className="flex flex-wrap gap-1.5 flex-grow w-full sm:w-auto">
                <div className="flex flex-col gap-1 flex-1 min-w-[80px]">
                    <button
                        onClick={onBackupRestore}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] px-3 py-1 rounded transition-colors whitespace-nowrap text-center"
                    >
                        Backup / Restore
                    </button>
                    <button
                        onClick={onHistoryUndo}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] px-3 py-1 rounded transition-colors whitespace-nowrap text-center"
                    >
                        History / Undo
                    </button>
                </div>

                <div className="flex flex-col gap-1 flex-1 min-w-[80px]">
                    <button
                        onClick={onExportAutomation}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] px-3 py-1 rounded transition-colors whitespace-nowrap text-center"
                    >
                        Export Config
                    </button>
                    <button
                        onClick={onExportCsv}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] px-3 py-1 rounded transition-colors whitespace-nowrap text-center"
                    >
                        Export CSV
                    </button>
                </div>

                <div className="flex flex-col gap-1 flex-1 min-w-[80px]">
                    <button
                        onClick={() => {
                            if (selectedCount < 2) {
                                if (feedbackTimeoutRef.current) {
                                    clearTimeout(feedbackTimeoutRef.current);
                                }
                                setCompareFeedback('Select 2+');
                                feedbackTimeoutRef.current = setTimeout(() => {
                                    setCompareFeedback(null);
                                    feedbackTimeoutRef.current = null;
                                }, 3000);
                            } else {
                                onCompare();
                            }
                        }}
                        className={`text-[10px] px-3 py-1 rounded transition-colors whitespace-nowrap text-center ${compareFeedback
                            ? 'bg-red-900/30 text-red-400 ring-1 ring-red-900/50 ring-inset'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white'
                            }`}
                    >
                        {compareFeedback || 'Compare'}
                    </button>
                    <button
                        onClick={onExportM3u}
                        disabled={selectedCount === 0}
                        className="bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-300 hover:text-white text-[10px] px-3 py-1 rounded transition-colors whitespace-nowrap text-center"
                    >
                        Export M3U
                    </button>

                </div>
            </div>
        </div>
    );
}
