import { useState, useEffect, useRef } from 'react';
import { SortSection } from './components/SortSection';
import { DuplicatesSection } from './components/DuplicatesSection';
import { VersionSection } from './components/VersionSection';
import { DynamicPlaylistSection, DynamicPlaylistConfig } from './components/DynamicPlaylistSection';
import { DynamicPlaylistModal } from './components/DynamicPlaylistModal';
import { PlaylistSection } from './components/PlaylistSection';
import { ActionButtons } from './components/ActionButtons';
import { StatusBar } from './components/StatusBar';
import { SetupScreen } from './components/SetupScreen';
import { BackupRestoreModal } from './components/BackupRestoreModal';
import { HistoryModal } from './components/HistoryModal';
import { IgnoredTracksModal } from './components/IgnoredTracksModal';
import { ExportModal } from './components/ExportModal';
import { ReviewModal } from './components/ReviewModal';
import { ComparePlaylistsModal } from './components/ComparePlaylistsModal';
import { M3uExportModal } from './components/M3uExportModal';
import { DesktopSchedulesModal } from './components/DesktopSchedulesModal';
import { AppSettingsModal } from './components/AppSettingsModal';
import { ChangePortModal } from './components/ChangePortModal';


import { useAppStore } from './store';
import { invoke } from './tauri-api';
import { listen } from '@tauri-apps/api/event';

// Types for Scan Result
interface ReviewChange {
    id: string;
    type: 'replace' | 'duplicate';
    newTitle?: string;
    newArtist?: string;
    newAlbum?: string;
    newDate?: string;
    remTitle?: string;
    remArtist?: string;
    remAlbum?: string;
    remDate?: string;
    track_uri?: string; // Internal
}

interface ScanResult {
    playlist_id: string;
    name: string;
    changes: ReviewChange[];
    stats: {
        original_count: number;
        duplicates_removed: number;
        versions_replaced: number;
        sorted: boolean;
    };
}

type ModalType = 'backup' | 'history' | 'ignored' | 'exportAuto' | 'exportCsv' | 'review' | 'compare' | 'm3u' | 'schedules' | 'dynamic_edit' | 'app_settings' | 'change_port' | null;

function App() {
    const {
        isLoggedIn,
        isProcessing,
        selectedPlaylistIds,
        setStatus
    } = useAppStore();
    const [activeModal, setActiveModal] = useState<ModalType>(null);
    const [scheduleInitialConfigId, setScheduleInitialConfigId] = useState<string | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);

    // Processing State
    const [reviewQueue, setReviewQueue] = useState<ScanResult[]>([]);
    const [activeReview, setActiveReview] = useState<ScanResult | null>(null);

    // Dynamic Playlist State
    const [dynamicConfigs, setDynamicConfigs] = useState<DynamicPlaylistConfig[]>([]);
    const [editingDynamicConfig, setEditingDynamicConfig] = useState<DynamicPlaylistConfig | null>(null);

    const reviewQueueRef = useRef<ScanResult[]>([]); // Ref to access latest queue in async loop

    // Keep ref in sync
    useEffect(() => {
        reviewQueueRef.current = reviewQueue;
    }, [reviewQueue]);

    useEffect(() => {
        checkAuth();
        loadDynamicConfigs();

        // Listen for tray events
        const unlisten = listen('open-schedules', () => {
            setActiveModal('schedules');
        });

        const unlistenPort = listen('open-change-port', () => {
            setActiveModal('change_port');
        });

        return () => {
            unlisten.then(f => f());
            unlistenPort.then(f => f());
        };
    }, []);

    const loadDynamicConfigs = async () => {
        try {
            const data = await invoke<DynamicPlaylistConfig[]>('get_dynamic_configs');
            setDynamicConfigs(data);
        } catch (e) {
            console.error('Failed to load dynamic configs:', e);
        }
    };

    const handleSaveDynamicConfig = async (config: DynamicPlaylistConfig) => {
        try {
            await invoke('save_dynamic_config', { config });
            await loadDynamicConfigs();
            setActiveModal(null);
            setEditingDynamicConfig(null);
        } catch (e) {
            console.error('Failed to save config:', e);
            setStatus(`Error saving: ${e}`);
        }
    };

    const handleDeleteDynamicConfig = async (id: string) => {
        try {
            await invoke('delete_dynamic_config', { id });
            await loadDynamicConfigs();
        } catch (e) {
            console.error('Failed to delete config:', e);
            setStatus(`Error deleting: ${e}`);
        }
    };

    const checkAuth = async () => {
        try {
            const result = await invoke<{ authenticated: boolean; playlists?: any[] }>('check_auth');
            if (result.authenticated && result.playlists) {
                useAppStore.getState().setPlaylists(result.playlists);
                useAppStore.setState({ isLoggedIn: true });
            }
        } catch {
            // Not authenticated yet - expected on first load
        }
        setIsLoading(false);
    };

    // Consumer: Checks if we can show the next review
    useEffect(() => {
        // If no active review and we have items waiting...
        if (!activeReview && reviewQueue.length > 0 && activeModal !== 'review') {
            const next = reviewQueue[0];
            setReviewQueue(prev => prev.slice(1));
            setActiveReview(next);
            setActiveModal('review');
        }
    }, [activeReview, reviewQueue, activeModal]);

    const performScanLoop = async (playlistIds: string[]) => {
        let currentIndex = 0;
        const total = playlistIds.length;

        for (const playlistId of playlistIds) {
            // Check cancellation logic
            if (useAppStore.getState().shouldCancel) {
                setStatus("Cancelled execution.");
                break;
            }

            const state = useAppStore.getState();
            // Define plName here so it's available in the entire block if needed, 
            // but effectively we need it for the status update and error logging.
            const plName = state.playlists.find(p => p.id === playlistId)?.name || playlistId;

            try {
                setStatus(`Scanning ${currentIndex + 1}/${total}: ${plName} (${reviewQueueRef.current.length} reviews pending)...`);

                const results = await invoke<ScanResult[]>('scan_playlist', {
                    playlistIds: [playlistId],
                    sortRules: state.sortRules,
                    sortEnabled: state.sortEnabled,
                    dupesEnabled: state.dupesEnabled,
                    dupePreference: state.dupePreference,
                    versionEnabled: state.versionEnabled,
                    versionPreference: state.versionPreference,
                });

                if (results.length > 0) {
                    const result = results[0];
                    if (result.changes.length > 0) {
                        // Push to review queue
                        setReviewQueue(prev => [...prev, result]);
                    } else {
                        // Auto-apply sort
                        if (result.stats.sorted && state.sortEnabled) {
                            await invoke('apply_changes', {
                                playlistId: result.playlist_id,
                                approvedChanges: [],
                                rejectedChanges: [],
                                sortRules: state.sortRules,
                                sortEnabled: state.sortEnabled,
                            });
                        }
                    }
                }
            } catch (e: any) {
                const diff = String(e); // Ensure string
                if (diff.includes('429')) {
                    setStatus('Rate limit hit (429). Pausing for 5 seconds...');
                    await new Promise(r => setTimeout(r, 5000));
                } else {
                    console.error(`Error scanning ${playlistId} (Name lookup failed in error handler):`, e);
                }
                // Choose to continue scanning others
            }

            currentIndex++;
        }


        useAppStore.setState({ isProcessing: false });

        if (reviewQueueRef.current.length > 0) {
            setStatus('Scanning complete. Please finish pending reviews.');
        } else {
            setStatus('Scanning complete.');
            // Optionally clear status after a delay
            setTimeout(() => setStatus(''), 3000);
        }
    };

    const handleRunProcess = () => {
        const state = useAppStore.getState();
        if (state.selectedPlaylistIds.length === 0) return;

        // Reset cancellation state before starting
        useAppStore.getState().resetCancel();

        // Check if there are active rules
        if (state.sortEnabled && state.sortRules.length === 0) {
            setStatus("No sort rules defined! Please add rules or disable sorting.");
            return;
        }

        useAppStore.setState({ isProcessing: true });

        // Start background scan loop with a copy of the IDs to respect order
        performScanLoop([...state.selectedPlaylistIds]);
    };

    const handleCancelProcess = () => {
        useAppStore.getState().cancelProcessing();
        setStatus("Cancelling...");
    };

    const handleApplyReview = async (approvedIds: string[]) => {
        if (!activeReview) return;

        const state = useAppStore.getState();
        setStatus(`Applying changes to ${activeReview.name}...`);

        try {
            const approvedChanges = activeReview.changes.filter(c => approvedIds.includes(c.id));
            const rejectedChanges = activeReview.changes.filter(c => !approvedIds.includes(c.id));

            await invoke('apply_changes', {
                playlistId: activeReview.playlist_id,
                approvedChanges: approvedChanges,
                rejectedChanges: rejectedChanges,
                sortRules: state.sortRules,
                sortEnabled: state.sortEnabled,
            });

            // If we are done scanning and this was the last review in the queue
            if (!isProcessing && reviewQueue.length === 0) {
                setStatus('All reviews completed and changes applied.');
            } else {
                setStatus(`Saved changes to ${activeReview.name}`);
            }

            // Close current
            closeReviewModal();

        } catch (e: unknown) {
            console.error(`Error applying changes: ${e}`);
            setStatus(`Error applying changes: ${e}`);
            closeReviewModal();
        }
    };

    const handleCancelReview = () => {
        closeReviewModal();
    };

    const closeReviewModal = () => {
        setActiveReview(null);
        setActiveModal(null);
        // The useEffect will automatically pick up the next one from reviewQueue
    };



    if (isLoading) {
        return (
            <div className="h-screen w-screen overflow-hidden flex flex-col font-sans text-stone-200">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-green-500 mb-4">SPOTIFY SORTER</h1>
                        <p className="text-zinc-400">Initializing...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!isLoggedIn) {
        return (
            <div className="h-screen w-screen overflow-hidden flex flex-col font-sans text-stone-200">
                <SetupScreen />
            </div>
        );
    }

    return (
        <div className="h-screen w-screen overflow-hidden flex flex-col font-sans text-stone-200">
            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-4 py-2 mb-0 scroll-p-4">

                {/* Settings Sections */}
                <div className="space-y-2 mb-3 flex-shrink-0">
                    <SortSection />
                    <DuplicatesSection />

                    <div className="flex justify-end px-1">
                        <button
                            onClick={() => setActiveModal('ignored')}
                            className="text-[10px] font-medium text-zinc-500 hover:text-green-400 transition-colors flex items-center gap-1"
                        >
                            Manage ignored tracks
                        </button>
                    </div>

                    <VersionSection />
                    <DynamicPlaylistSection
                        configs={dynamicConfigs}
                        onEdit={(config) => {
                            setEditingDynamicConfig(config);
                            setActiveModal('dynamic_edit');
                        }}
                        onAdd={() => {
                            setEditingDynamicConfig(null);
                            setActiveModal('dynamic_edit');
                        }}
                        onDelete={handleDeleteDynamicConfig}
                        onManageSchedules={(id) => {
                            setScheduleInitialConfigId(id);
                            setActiveModal('schedules');
                        }}
                    />
                </div>

                {/* Playlist Selection */}
                <PlaylistSection />

                {/* Action Bar */}
                <ActionButtons
                    onRun={handleRunProcess}
                    onCancel={handleCancelProcess}
                    onBackupRestore={() => setActiveModal('backup')}
                    onHistoryUndo={() => setActiveModal('history')}
                    onExportAutomation={() => setActiveModal('exportAuto')}
                    onExportCsv={() => setActiveModal('exportCsv')}
                    onCompare={() => setActiveModal('compare')}
                    onExportM3u={() => setActiveModal('m3u')}

                    isProcessing={isProcessing}
                    selectedCount={selectedPlaylistIds.length}
                />
            </div>

            <StatusBar onSettingsClick={() => setActiveModal('app_settings')} />

            {/* Rate Limit Warning */}
            {status.includes('429') && (
                <div className="bg-orange-500 text-black px-4 py-2 text-center text-sm font-bold animate-pulse">
                    ⚠️ Spotify Rate Limit Exceeded - Pausing for a moment...
                </div>
            )}

            {/* Modals */}
            {activeModal === 'review' && activeReview && (
                <ReviewModal
                    playlistName={activeReview.name}
                    changes={activeReview.changes}
                    stats={{
                        total: activeReview.stats.original_count,
                        removed: activeReview.stats.duplicates_removed,
                        replaced: activeReview.stats.versions_replaced,
                    }}
                    onApprove={handleApplyReview}
                    onCancel={handleCancelReview}
                />
            )}
            {activeModal === 'backup' && (
                <BackupRestoreModal onClose={() => setActiveModal(null)} />
            )}
            {activeModal === 'history' && (
                <HistoryModal
                    onClose={() => setActiveModal(null)}
                    onRestore={loadDynamicConfigs}
                />
            )}
            {activeModal === 'ignored' && (
                <IgnoredTracksModal onClose={() => setActiveModal(null)} />
            )}
            {activeModal === 'exportAuto' && (
                <ExportModal type="automation" onClose={() => setActiveModal(null)} />
            )}
            {activeModal === 'exportCsv' && (
                <ExportModal type="csv" onClose={() => setActiveModal(null)} />
            )}
            {activeModal === 'compare' && (
                <ComparePlaylistsModal onClose={() => setActiveModal(null)} />
            )}
            {activeModal === 'm3u' && (
                <M3uExportModal onClose={() => setActiveModal(null)} />
            )}
            {activeModal === 'schedules' && (
                <DesktopSchedulesModal
                    key={`schedules-${scheduleInitialConfigId || 'main'}`}
                    initialConfigId={scheduleInitialConfigId}
                    onClose={() => {
                        setActiveModal(null);
                        setScheduleInitialConfigId(undefined);
                    }}
                />
            )}
            {activeModal === 'app_settings' && (
                <AppSettingsModal onClose={() => setActiveModal(null)} />
            )}
            {activeModal === 'change_port' && (
                <ChangePortModal onClose={() => setActiveModal(null)} />
            )}
            {activeModal === 'dynamic_edit' && (
                <DynamicPlaylistModal
                    config={editingDynamicConfig}
                    onSave={handleSaveDynamicConfig}
                    onCancel={() => {
                        setActiveModal(null);
                        setEditingDynamicConfig(null);
                    }}
                />
            )}
        </div>
    );
}

export default App;
