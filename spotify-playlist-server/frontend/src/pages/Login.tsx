import { useState, useEffect } from 'react'
import { Music, ExternalLink, Settings } from 'lucide-react'
import './Login.css'

export default function Login() {
    const [clientId, setClientId] = useState('')
    const [clientSecret, setClientSecret] = useState('')
    const [configLoaded, setConfigLoaded] = useState(false)
    const [isConfigured, setIsConfigured] = useState(false)
    const [showConfig, setShowConfig] = useState(false)
    const [error, setError] = useState('')
    const [isConfiguring, setIsConfiguring] = useState(false)

    useEffect(() => {
        // Check if server is configured
        fetch('/auth/config-status')
            .then(res => res.json())
            .then(data => {
                setIsConfigured(data.configured)
                // If not configured, show the config form by default
                if (!data.configured) {
                    setShowConfig(true)
                }
                setConfigLoaded(true)
            })
            .catch(() => {
                setConfigLoaded(true)
            })
    }, [])

    const handleLogin = async () => {
        if (showConfig && clientId && clientSecret) {
            setIsConfiguring(true)
            try {
                const res = await fetch('/auth/configure', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret })
                })
                if (!res.ok) throw new Error('Failed to save credentials')
            } catch (e) {
                setError('Failed to configure server. Is it running?')
                setIsConfiguring(false)
                return
            }
        }

        // Redirect to login
        window.location.href = '/auth/login'
    }

    const openDeveloperDashboard = () => {
        window.open('https://developer.spotify.com/dashboard', '_blank')
    }

    if (!configLoaded) return null

    // If configured and not showing config explicitly, show simple connect screen
    const showSimpleConnect = isConfigured && !showConfig

    return (
        <div className="flex items-center justify-center min-h-screen bg-[#121212] font-sans text-white p-6 login-bg">
            <div className="max-w-md w-full">
                <div className="text-center mb-8">
                    <Music size={48} className="mx-auto text-green-500 mb-4" />
                    <h2 className="text-3xl font-bold mb-2">Spotify Playlist Automation</h2>
                    <p className="text-zinc-400">Connect your Spotify account to get started</p>
                </div>

                {error && (
                    <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-400 text-sm mb-6 text-center">
                        {error}
                    </div>
                )}

                {!showSimpleConnect ? (
                    <>
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5 mb-6">
                            <h3 className="text-green-500 font-bold mb-4 uppercase text-xs tracking-wider">Setup Instructions:</h3>
                            <ol className="text-zinc-400 text-sm space-y-3 list-decimal list-inside mb-5">
                                <li>Go to the Spotify Developer Dashboard</li>
                                <li>Create a new App (or use an existing one)</li>
                                <li>In Settings, add this Redirect URI:
                                    <code className="block mt-2 bg-zinc-950 text-green-400 px-3 py-2 rounded text-xs font-mono border border-zinc-900">
                                        {window.location.origin}/auth/callback
                                    </code>
                                </li>
                                <li>Copy your Client ID and Client Secret below</li>
                            </ol>
                            <button
                                onClick={openDeveloperDashboard}
                                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2.5 rounded font-medium transition-colors flex items-center justify-center gap-2 text-sm border border-zinc-700"
                            >
                                <ExternalLink size={14} />
                                OPEN DEVELOPER DASHBOARD
                            </button>
                        </div>

                        <div className="space-y-5 mb-8">
                            <div>
                                <label className="block text-zinc-500 text-xs font-bold mb-1.5 uppercase">CLIENT ID</label>
                                <input
                                    type="text"
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                    className="w-full bg-zinc-900/80 text-white border border-zinc-800 rounded-md px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all placeholder:text-zinc-700"
                                    placeholder="Paste your Client ID here"
                                />
                            </div>

                            <div>
                                <label className="block text-zinc-500 text-xs font-bold mb-1.5 uppercase">CLIENT SECRET</label>
                                <input
                                    type="password"
                                    value={clientSecret}
                                    onChange={(e) => setClientSecret(e.target.value)}
                                    className="w-full bg-zinc-900/80 text-white border border-zinc-800 rounded-md px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all placeholder:text-zinc-700"
                                    placeholder="Paste your Client Secret here"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleLogin}
                            disabled={isConfiguring || !clientId || !clientSecret}
                            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold py-3.5 rounded-full transition-all transform active:scale-95 uppercase tracking-wide text-sm"
                        >
                            {isConfiguring ? 'SAVING CONFIGURATION...' : 'CONNECT TO SPOTIFY'}
                        </button>
                    </>
                ) : (
                    <div className="space-y-6">
                        <button
                            onClick={handleLogin}
                            className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-4 rounded-full transition-all transform hover:scale-105 active:scale-95 uppercase tracking-wide text-sm"
                        >
                            CONNECT TO SPOTIFY
                        </button>

                        <div className="text-center">
                            <button
                                onClick={() => setShowConfig(true)}
                                className="text-zinc-600 hover:text-zinc-400 text-xs flex items-center justify-center gap-1 mx-auto transition-colors"
                            >
                                <Settings size={12} /> Configure Credentials
                            </button>
                        </div>
                    </div>
                )}


            </div>
        </div>
    )
}
