import { useState, useEffect } from 'react'
import { X, Settings, Monitor, ExternalLink } from 'lucide-react'
import { isEnabled, enable, disable } from '@tauri-apps/plugin-autostart'
import { load } from '@tauri-apps/plugin-store'
import { invoke } from '../tauri-api';

interface AppSettingsModalProps {
    onClose: () => void;
}

export function AppSettingsModal({ onClose }: AppSettingsModalProps) {
    const [startAtLogin, setStartAtLogin] = useState(false)
    const [startMinimized, setStartMinimized] = useState(false)
    const [closeToTray, setCloseToTray] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        loadSettings()
    }, [])

    const handleOpenServer = async () => {
        try {
            await invoke('open_url', { url: `http://127.0.0.1:27196` });
        } catch (e) {
            console.error('Failed to open server:', e);
        }
    }

    const loadSettings = async () => {
        try {
            // Check Autostart
            const autostartEnabled = await isEnabled();
            setStartAtLogin(autostartEnabled);

            // Check Settings from Store
            const store = await load('settings.json');
            const minimized = await store.get<boolean>('start_minimized');
            const toTray = await store.get<boolean>('close_to_tray');

            setStartMinimized(minimized || false);
            setCloseToTray(toTray || false);
        } catch (e) {
            console.error('Failed to load settings:', e);
        } finally {
            setIsLoading(false);
        }
    }

    const toggleAutostart = async () => {
        try {
            if (startAtLogin) {
                await disable();
                setStartAtLogin(false);
            } else {
                await enable();
                setStartAtLogin(true);
            }
        } catch (e) {
            console.error('Failed to toggle autostart:', e);
        }
    }

    const toggleMinimized = async () => {
        try {
            const store = await load('settings.json');
            const newVal = !startMinimized;
            await store.set('start_minimized', newVal);
            await store.save();
            setStartMinimized(newVal);
        } catch (e) {
            console.error('Failed to toggle minimized:', e);
        }
    }

    const toggleCloseToTray = async () => {
        try {
            const store = await load('settings.json');
            const newVal = !closeToTray;
            await store.set('close_to_tray', newVal);
            await store.save();
            setCloseToTray(newVal);
        } catch (e) {
            console.error('Failed to toggle close to tray:', e);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div
                className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-800/50">
                    <div className="flex items-center gap-2 text-white">
                        <Settings size={20} className="text-green-500" />
                        <h2 className="text-lg font-bold">Application Settings</h2>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1 hover:bg-zinc-700 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {isLoading ? (
                        <div className="py-8 text-center text-zinc-500 text-sm">Loading settings...</div>
                    ) : (
                        <>
                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                    <Monitor size={14} /> Desktop Behavior
                                </h3>

                                <div className="space-y-3">
                                    {/* Launch on Startup */}
                                    <div className="flex items-center justify-between bg-zinc-800/40 p-4 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors group">
                                        <div>
                                            <div className="text-sm font-medium text-white">Launch on Startup</div>
                                            <div className="text-xs text-zinc-500">Automatically start app when you log in</div>
                                        </div>
                                        <label className="relative flex items-center cursor-pointer">
                                            <input type="checkbox" checked={startAtLogin} onChange={toggleAutostart} className="peer sr-only" />
                                            <div className="w-10 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                                        </label>
                                    </div>

                                    {/* Start Minimized */}
                                    <div className="flex items-center justify-between bg-zinc-800/40 p-4 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors group">
                                        <div>
                                            <div className="text-sm font-medium text-white">Start Minimized</div>
                                            <div className="text-xs text-zinc-500">Launch into system tray without showing window</div>
                                        </div>
                                        <label className="relative flex items-center cursor-pointer">
                                            <input type="checkbox" checked={startMinimized} onChange={toggleMinimized} className="peer sr-only" />
                                            <div className="w-10 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                                        </label>
                                    </div>

                                    {/* Close to Tray */}
                                    <div className="flex items-center justify-between bg-zinc-800/40 p-4 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors group">
                                        <div>
                                            <div className="text-sm font-medium text-white">Close to Tray</div>
                                            <div className="text-xs text-zinc-500">Pressing 'X' hides the window instead of quitting</div>
                                        </div>
                                        <label className="relative flex items-center cursor-pointer">
                                            <input type="checkbox" checked={closeToTray} onChange={toggleCloseToTray} className="peer sr-only" />
                                            <div className="w-10 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                    <ExternalLink size={14} /> Automation Server
                                </h3>
                                <button
                                    onClick={handleOpenServer}
                                    className="w-full flex items-center justify-between bg-zinc-800/40 p-4 rounded-lg border border-zinc-800 hover:border-green-500/50 hover:bg-green-500/5 transition-all group"
                                >
                                    <div className="text-left">
                                        <div className="text-sm font-medium text-white group-hover:text-green-400 transition-colors">Open Web Dashboard</div>
                                        <div className="text-xs text-zinc-500">Manage 24/7 automation and schedules</div>
                                    </div>
                                    <ExternalLink size={16} className="text-zinc-600 group-hover:text-green-500 transition-colors" />
                                </button>
                            </div>




                            <div className="pt-2">
                                <p className="text-[10px] text-zinc-600 px-2 italic text-center">
                                    Tip: Right-click the system tray icon for quick manual updates and background sync indicators.
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-zinc-800/30 border-t border-zinc-800 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
