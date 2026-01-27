import { useState, useEffect } from 'react';
import { Download, X, ExternalLink, RefreshCw } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';

// Current fallback app version - now used primarily as a fallback
export const APP_VERSION = '1.0.0';

// GitHub repository info
const GITHUB_OWNER = 'JamyPatch44';
const GITHUB_REPO = 'Spotify-Sorter';

interface ReleaseInfo {
    version: string;
    name: string;
    body: string;
    downloadUrl: string;
    publishedAt: string;
}

interface UpdateCheckerProps {
    showButton?: boolean;
}

export function UpdateChecker({ showButton = true }: UpdateCheckerProps) {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [currentAppVersion, setCurrentAppVersion] = useState(APP_VERSION);

    // Get the actual app version on mount
    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const version = await getVersion();
                setCurrentAppVersion(version);
            } catch (e) {
                console.error('Failed to get app version:', e);
            }
        };
        fetchVersion();
    }, []);

    const checkForUpdates = async (silent = false) => {
        setChecking(true);
        setError(null);

        try {
            // Add cache busting to ensure we get the latest info
            const response = await fetch(
                `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest?t=${Date.now()}`,
                {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                    },
                }
            );

            if (!response.ok) {
                if (response.status === 404) {
                    if (!silent) setError('No releases found');
                    return;
                }
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const data = await response.json();
            if (!data.tag_name) {
                throw new Error('Invalid release data from GitHub');
            }

            const latestVersion = data.tag_name.replace(/^v/, '');

            // Find the best Windows download asset
            // Prioritize Setup.exe or .msi over the raw server binary
            const assets = data.assets || [];
            const windowsAsset =
                assets.find((a: any) => a.name.toLowerCase().includes('setup.exe')) ||
                assets.find((a: any) => a.name.toLowerCase().endsWith('.msi')) ||
                assets.find((a: any) => a.name.toLowerCase().endsWith('.exe') && !a.name.includes('server')) ||
                assets.find((a: any) => a.name.toLowerCase().includes('windows'));

            const release: ReleaseInfo = {
                version: latestVersion,
                name: data.name || `Version ${latestVersion}`,
                body: data.body || 'No release notes available.',
                downloadUrl: windowsAsset?.browser_download_url || data.html_url,
                publishedAt: data.published_at,
            };

            setReleaseInfo(release);

            if (isNewerVersion(latestVersion, currentAppVersion)) {
                setUpdateAvailable(true);
                if (!silent) setShowModal(true);
            } else if (!silent) {
                setError(`v${currentAppVersion} is the latest version!`);
            }
        } catch (err) {
            console.error('Update check failed:', err);
            if (!silent) {
                setError('Failed to check for updates. Check your connection.');
            }
        } finally {
            setChecking(false);
        }
    };

    // Compare semantic versions
    const isNewerVersion = (latest: string, current: string): boolean => {
        const latestParts = latest.split('.').map(part => parseInt(part, 10));
        const currentParts = current.split('.').map(part => parseInt(part, 10));

        for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
            const latestPart = latestParts[i] || 0;
            const currentPart = currentParts[i] || 0;

            if (isNaN(latestPart) || isNaN(currentPart)) continue;

            if (latestPart > currentPart) return true;
            if (latestPart < currentPart) return false;
        }
        return false;
    };

    // Check for updates on mount (silently)
    useEffect(() => {
        const timer = setTimeout(() => {
            checkForUpdates(true);
        }, 3000);

        return () => clearTimeout(timer);
    }, [currentAppVersion]);

    const handleDownload = async () => {
        if (releaseInfo?.downloadUrl) {
            try {
                // Use the Tauri opener plugin to open the URL
                // If it's a direct browser_download_url, it will start the download in the default browser
                await openUrl(releaseInfo.downloadUrl);
            } catch (e) {
                console.error('Failed to open download link:', e);
                // Fallback attempt
                window.open(releaseInfo.downloadUrl, '_blank');
            }
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    return (
        <>
            {/* Update Available Badge */}
            {updateAvailable && !dismissed && (
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white text-[10px] font-semibold px-2 py-1 rounded-full transition-all animate-pulse"
                >
                    <Download size={12} />
                    Update Available
                </button>
            )}

            {/* Manual Check Button */}
            {showButton && !updateAvailable && (
                <button
                    onClick={() => checkForUpdates(false)}
                    disabled={checking}
                    className="text-[10px] text-zinc-500 hover:text-green-400 transition-colors flex items-center gap-1"
                    title="Check for updates"
                >
                    <RefreshCw size={10} className={checking ? 'animate-spin' : ''} />
                    {checking ? 'Checking...' : 'Check updates'}
                </button>
            )}

            {/* Error Toast */}
            {error && (
                <div className="fixed bottom-16 right-4 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 shadow-xl z-50 animate-fade-in">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-300">{error}</span>
                        <button
                            onClick={() => setError(null)}
                            className="text-zinc-500 hover:text-zinc-300"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Update Modal */}
            {showModal && releaseInfo && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md shadow-2xl">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                                    <Download size={18} className="text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">Update Available</h2>
                                    <p className="text-xs text-zinc-500">
                                        v{releaseInfo.version} • Released {formatDate(releaseInfo.publishedAt)}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-zinc-500 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4">
                            {/* Version Comparison */}
                            <div className="flex items-center justify-center gap-4 mb-4 py-3 bg-zinc-800/50 rounded-lg">
                                <div className="text-center">
                                    <p className="text-xs text-zinc-500 mb-1">Current</p>
                                    <p className="text-sm font-mono text-zinc-400">v{currentAppVersion}</p>
                                </div>
                                <div className="text-green-500">→</div>
                                <div className="text-center">
                                    <p className="text-xs text-zinc-500 mb-1">Latest</p>
                                    <p className="text-sm font-mono text-green-400 font-semibold">v{releaseInfo.version}</p>
                                </div>
                            </div>

                            {/* Release Notes */}
                            <div className="mb-4">
                                <h3 className="text-sm font-semibold text-zinc-300 mb-2">What's New</h3>
                                <div className="bg-zinc-800/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                                    <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">
                                        {releaseInfo.body}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex gap-2 p-4 border-t border-zinc-800">
                            <button
                                onClick={() => {
                                    setShowModal(false);
                                    setDismissed(true);
                                }}
                                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                            >
                                Later
                            </button>
                            <button
                                onClick={handleDownload}
                                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2"
                            >
                                <ExternalLink size={16} />
                                Download
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
