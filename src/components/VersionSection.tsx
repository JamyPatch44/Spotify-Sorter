
import { useState } from 'react';
import { Info } from 'lucide-react';
import { useAppStore } from '../store';
import { Dropdown } from './ui/Dropdown';

const VERSION_OPTIONS = [
    'Artist Only: Oldest Version',
    'Artist Only: Newest Version',
    'Global: Oldest Version',
    'Global: Newest Version',
];

const VERSION_INFO = (
    <div className="space-y-3 text-sm text-green-400">
        <p className="font-bold">VERSION REPLACEMENT:</p>
        <p>Find alternative versions of tracks (remasters, remixes, etc) and replace them.</p>

        <p className="font-semibold mt-2">Search Modes:</p>
        <ul className="list-disc pl-4 space-y-1">
            <li><span className="font-semibold">Artist Only:</span> Only search for versions by the same artist.</li>
            <li><span className="font-semibold">Global:</span> Search all of Spotify for alternative versions.</li>
        </ul>

        <p className="font-semibold mt-2">Preference:</p>
        <ul className="list-disc pl-4 space-y-1">
            <li><span className="font-semibold">Oldest Version:</span> Prefer the original/earliest release.</li>
            <li><span className="font-semibold">Newest Version:</span> Prefer remasters or latest releases.</li>
        </ul>

        <p className="text-zinc-500 italic">Use "Manage Ignored" to prevent specific tracks from being replaced.</p>
    </div>
);

interface VersionSectionProps {
}

export function VersionSection({ }: VersionSectionProps) {
    const { versionEnabled, setVersionEnabled, versionPreference, setVersionPreference } = useAppStore();
    const [showHelp, setShowHelp] = useState(false);

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={versionEnabled}
                        onChange={(e) => setVersionEnabled(e.target.checked)}
                        className="w-3.5 h-3.5 accent-green-500"
                    />
                    <span className="text-green-500 font-semibold text-sm tracking-tight">3. Version replacer</span>
                </label>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setShowHelp(!showHelp)}
                        className={`transition-colors p-1 rounded-full hover:bg-zinc-800 ${showHelp ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <Info size={16} />
                    </button>
                </div>
            </div>

            {showHelp && (
                <div className="mb-6 p-4 bg-zinc-900/80 border border-t-0 border-x-0 border-b-0 border-l-4 border-l-green-500 rounded-r-lg">
                    {VERSION_INFO}
                </div>
            )}

            {versionEnabled && (
                <Dropdown
                    value={versionPreference}
                    onChange={(val) => setVersionPreference(val)}
                    options={VERSION_OPTIONS}
                    className="w-full"
                />
            )}
        </div>
    );
}
