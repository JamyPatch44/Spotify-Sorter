import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Settings } from 'lucide-react';


export function TitleBar({ onSettingsClick }: { onSettingsClick?: () => void }) {
    const appWindow = getCurrentWindow();

    const handleMinimize = async () => {
        try {
            await appWindow.minimize();
        } catch {
            // Silently handle minimize errors
        }
    };

    const handleMaximize = async () => {
        try {
            await appWindow.toggleMaximize();
        } catch {
            // Silently handle maximize errors
        }
    };

    const handleClose = async () => {
        try {
            await appWindow.close();
        } catch {
            // Silently handle close errors
        }
    };

    return (
        <div className="h-10 flex items-center justify-between bg-black/30 z-50 text-white border-b border-white/5 flex-shrink-0">
            {/* Drag Region */}
            <div
                data-tauri-drag-region
                className="flex-1 h-full flex items-center px-4"
            >
                <span className="font-bold text-sm tracking-wide text-green-500">Spotify Sorter</span>
            </div>

            {/* Window Controls */}
            <div className="flex h-full items-center">
                {onSettingsClick && (
                    <button
                        type="button"
                        onClick={onSettingsClick}
                        className="w-10 h-10 flex items-center justify-center hover:text-green-500 transition-colors cursor-pointer mr-2"
                        title="Application Settings"
                    >
                        <Settings size={18} strokeWidth={2} />
                    </button>
                )}
                <div className="flex h-full">
                    <button
                        type="button"
                        onClick={handleMinimize}
                        className="w-12 h-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
                    >
                        <Minus size={16} strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={handleMaximize}
                        className="w-12 h-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
                    >
                        <Square size={14} strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="w-12 h-full flex items-center justify-center hover:bg-red-500/80 transition-colors cursor-pointer"
                    >
                        <X size={16} strokeWidth={2} />
                    </button>
                </div>
            </div>
        </div>
    );
}
