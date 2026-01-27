import { useState } from 'react';
import { invoke } from '../tauri-api';

interface ChangePortModalProps {
    onClose: () => void;
}

export function ChangePortModal({ onClose }: ChangePortModalProps) {
    const [port, setPort] = useState(27196);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            await invoke('change_server_port', { port: Number(port) });
            onClose();
        } catch (err) {
            setError(String(err));
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-800/50">
                    <h3 className="font-semibold text-stone-200">Change Server Port</h3>
                    <button
                        onClick={onClose}
                        className="text-zinc-400 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">
                            New Port Number
                        </label>
                        <input
                            type="number"
                            min="1024"
                            max="65535"
                            value={port}
                            onChange={(e) => setPort(parseInt(e.target.value))}
                            className="w-full bg-black/40 border border-zinc-700 rounded p-2 text-stone-200 focus:border-green-500 focus:outline-none transition-colors"
                        />
                        <p className="text-[10px] text-zinc-500 mt-1">Default is 27196. Requires restart.</p>
                    </div>

                    {error && (
                        <div className="text-red-400 text-xs bg-red-900/20 border border-red-900/50 p-2 rounded">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-2 justify-end pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs font-medium text-stone-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-3 py-1.5 text-xs font-bold text-black bg-green-500 hover:bg-green-400 disabled:opacity-50 rounded transition-colors"
                        >
                            {isLoading ? 'Restarting...' : 'Restart Server'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
