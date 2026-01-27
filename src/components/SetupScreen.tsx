import { useState } from 'react';
import { invoke } from '../tauri-api';
import { useAppStore } from '../store';
import { ExternalLink, Music } from 'lucide-react';

export function SetupScreen() {
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');

    const handleConnect = async () => {
        if (!clientId.trim() || !clientSecret.trim()) {
            setError('Please enter both Client ID and Client Secret');
            return;
        }

        setIsConnecting(true);
        setError('');
        setStatus('Opening browser for Spotify authorization...');

        try {
            const result = await invoke<{ success: boolean; playlists?: any[]; error?: string }>('initialize_spotify', {
                clientId: clientId.trim(),
                clientSecret: clientSecret.trim(),
            });

            if (result.success && result.playlists) {
                setStatus(`Success! Found ${result.playlists.length} playlists.`);
                useAppStore.getState().setPlaylists(result.playlists);
                useAppStore.setState({ isLoggedIn: true });
            } else {
                setError(result.error || 'Failed to connect');
            }
        } catch (e: any) {
            setError(String(e));
        }

        setIsConnecting(false);
    };

    const openDeveloperDashboard = async () => {
        try {
            await invoke('open_url', { url: 'https://developer.spotify.com/dashboard' });
        } catch (e) {
            window.open('https://developer.spotify.com/dashboard', '_blank');
        }
    };

    return (
        <div className="flex-1 flex items-center justify-center p-6 mt-10">
            <div className="max-w-md w-full">
                <div className="text-center mb-8">
                    <Music size={48} className="mx-auto text-green-500 mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">Spotify Sorter</h2>
                    <p className="text-zinc-400">Connect your Spotify account to get started</p>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 mb-6">
                    <h3 className="text-green-500 font-semibold mb-3">Setup Instructions:</h3>
                    <ol className="text-zinc-400 text-sm space-y-2 list-decimal list-inside mb-4">
                        <li>Go to the Spotify Developer Dashboard</li>
                        <li>Create a new App (or use an existing one)</li>
                        <li>In Settings, add this Redirect URI:
                            <code className="block mt-1 bg-zinc-800 text-green-400 px-2 py-1 rounded text-xs select-all">
                                http://127.0.0.1:27196/callback
                            </code>
                        </li>
                        <li>Copy your Client ID and Client Secret below</li>
                    </ol>
                    <button
                        onClick={openDeveloperDashboard}
                        className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-2 rounded transition-colors flex items-center justify-center gap-2"
                    >
                        <ExternalLink size={16} />
                        OPEN DEVELOPER DASHBOARD
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-zinc-400 text-sm font-semibold mb-1">CLIENT ID</label>
                        <input
                            type="text"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            disabled={isConnecting}
                            className="w-full bg-zinc-800 text-white border border-zinc-700 rounded px-3 py-2 disabled:opacity-50"
                            placeholder="Paste your Client ID here"
                        />
                    </div>

                    <div>
                        <label className="block text-zinc-400 text-sm font-semibold mb-1">CLIENT SECRET</label>
                        <input
                            type="password"
                            value={clientSecret}
                            onChange={(e) => setClientSecret(e.target.value)}
                            disabled={isConnecting}
                            className="w-full bg-zinc-800 text-white border border-zinc-700 rounded px-3 py-2 disabled:opacity-50"
                            placeholder="Paste your Client Secret here"
                        />
                    </div>

                    {status && !error && (
                        <div className="bg-blue-900/30 border border-blue-700 rounded p-3 text-blue-400 text-sm">
                            {status}
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <button
                        onClick={handleConnect}
                        disabled={isConnecting}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-bold py-3 rounded transition-colors"
                    >
                        {isConnecting ? 'CONNECTING... (Check your browser)' : 'CONNECT TO SPOTIFY'}
                    </button>

                    {isConnecting && (
                        <p className="text-zinc-500 text-xs text-center">
                            A browser window should open for you to authorize with Spotify.
                            After authorizing, you'll be redirected back automatically.
                        </p>
                    )}
                    <div className="mt-8 text-center">
                        <button
                            onClick={() => useAppStore.setState({ isLoggedIn: true })}
                            className="text-zinc-600 hover:text-zinc-400 text-[10px] uppercase tracking-widest transition-colors"
                        >
                            Bypass to Main UI (Forced)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
