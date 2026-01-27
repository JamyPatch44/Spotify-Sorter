import { useState } from 'react';
import { Info } from 'lucide-react';
import { useAppStore } from '../store';
import { Dropdown } from './ui/Dropdown';

const DUPE_OPTIONS = [
    'Keep Oldest (Release Date)',
    'Keep Newest (Release Date)',
    'Keep Oldest (Playlist Order)',
    'Keep Newest (Playlist Order)',
];

const DUPES_INFO = (
    <div className="space-y-3 text-sm text-green-400">
        <p className="font-bold">AUTOMATIC DEDUPLICATION:</p>
        <p>When duplicates are found (same track appearing multiple times), you can choose which one to keep:</p>
        <ul className="list-disc pl-4 space-y-1">
            <li><span className="font-semibold">Keep Oldest (Release Date):</span> Keep the version that was released first.</li>
            <li><span className="font-semibold">Keep Newest (Release Date):</span> Keep the most recently released version.</li>
            <li><span className="font-semibold">Keep Oldest (Playlist Order):</span> Keep the one that appears first in the playlist.</li>
            <li><span className="font-semibold">Keep Newest (Playlist Order):</span> Keep the one that appears last in the playlist.</li>
        </ul>
        <p className="text-zinc-500 italic">Duplicates are detected by matching both the track name and primary artist.</p>
    </div>
);

export function DuplicatesSection() {
    const { dupesEnabled, setDupesEnabled, dupePreference, setDupePreference } = useAppStore();
    const [showHelp, setShowHelp] = useState(false); // Make sure to import useState if not already available, or use React.useState

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={dupesEnabled}
                        onChange={(e) => setDupesEnabled(e.target.checked)}
                        className="w-3.5 h-3.5 accent-green-500"
                    />
                    <span className="text-green-500 font-semibold text-sm tracking-tight">2. Manage duplicates</span>
                </label>
                <button
                    onClick={() => setShowHelp(!showHelp)}
                    className={`transition-colors p-1 rounded-full hover:bg-zinc-800 ${showHelp ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                    <Info size={16} />
                </button>
            </div>

            {showHelp && (
                <div className="mb-6 p-4 bg-zinc-900/80 border border-t-0 border-x-0 border-b-0 border-l-4 border-l-green-500 rounded-r-lg">
                    {DUPES_INFO}
                </div>
            )}

            {dupesEnabled && (
                <Dropdown
                    value={dupePreference}
                    onChange={(val) => setDupePreference(val)}
                    options={DUPE_OPTIONS}
                    className="w-full"
                />
            )}
        </div>
    );
}
