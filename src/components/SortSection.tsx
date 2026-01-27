import * as React from 'react';
import { X, GripVertical, Info } from 'lucide-react';
import { useAppStore } from '../store';
import { Dropdown } from './ui/Dropdown';

const SORT_CRITERIA = ['Release Date', 'Artist', 'Album', 'Track Name', 'BPM', 'Energy', 'Danceability', 'Valence'];

function getSortOptions(criteria: string) {
    if (criteria === 'Release Date') {
        return [
            { value: 'Ascending', label: 'Oldest First' },
            { value: 'Descending', label: 'Newest First' }
        ];
    }
    if (['BPM', 'Energy', 'Danceability', 'Valence'].includes(criteria)) {
        return [
            { value: 'Ascending', label: 'Low to High' },
            { value: 'Descending', label: 'High to Low' }
        ];
    }
    return [
        { value: 'Ascending', label: 'Ascending (A-Z)' },
        { value: 'Descending', label: 'Descending (Z-A)' }
    ];
}



const SORT_INFO = (
    <div className="space-y-3 text-sm text-green-400">
        <p className="font-bold">HOW SORTING WORKS:</p>
        <ul className="list-disc pl-4 space-y-1">
            <li><span className="font-semibold">Priority Levels:</span> The app sorts by Level 1 first. If two tracks are equal (e.g. same Artist), it looks at Level 2, and so on.</li>
            <li><span className="font-semibold">Dynamic Rules:</span> Use '+ ADD RULE' to chain multiple criteria.</li>
            <li><span className="font-semibold">Checkbox Behavior:</span>
                <ul className="list-disc pl-4 mt-1 text-zinc-400">
                    <li>Text (Artist, Name, Album): Unchecked = A-Z, Checked = Z-A</li>
                    <li>Date: Unchecked = Newest First, Checked = Oldest First</li>
                    <li>Audio (BPM, Energy, etc): Unchecked = Low-to-High, Checked = High-to-Low</li>
                </ul>
            </li>
        </ul>
        <p className="text-zinc-500 italic">Note: Audio sorting requires fetching data from Spotify, which may take a few extra seconds.</p>
    </div>
);

export function SortSection() {
    const {
        sortRules, reorderSortRules, removeSortRule, updateSortRule,
        sortEnabled, setSortEnabled, isProcessing, addSortRule
    } = useAppStore();
    const [showHelp, setShowHelp] = React.useState(false);
    const [dragState, setDragState] = React.useState<{ sourceIndex: number; currentIndex: number; mouseY: number } | null>(null);

    const handleMouseDown = (e: React.MouseEvent, index: number) => {
        if (isProcessing) return;
        e.preventDefault();
        setDragState({ sourceIndex: index, currentIndex: index, mouseY: e.clientY });

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const elements = document.querySelectorAll('[data-rule-row]');
            let newIndex = index;
            elements.forEach((el, i) => {
                const rect = el.getBoundingClientRect();
                if (moveEvent.clientY > rect.top && moveEvent.clientY < rect.bottom) {
                    newIndex = i;
                }
            });
            setDragState(prev => prev ? { ...prev, currentIndex: newIndex, mouseY: moveEvent.clientY } : null);
        };

        const handleMouseUp = () => {
            setDragState(prev => {
                if (prev && prev.sourceIndex !== prev.currentIndex) {
                    const newRules = [...sortRules];
                    const [movedRule] = newRules.splice(prev.sourceIndex, 1);
                    newRules.splice(prev.currentIndex, 0, movedRule);
                    reorderSortRules(newRules);
                }
                return null;
            });
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    if (!sortEnabled) {
        return (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2.5 opacity-75">
                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={sortEnabled}
                            onChange={(e) => setSortEnabled(e.target.checked)}
                            className="w-3.5 h-3.5 accent-green-500"
                        />
                        <span className="text-zinc-500 font-semibold text-sm tracking-tight">1. Sort tracks</span>
                    </label>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={sortEnabled}
                        onChange={(e) => setSortEnabled(e.target.checked)}
                        className="w-3.5 h-3.5 accent-green-500"
                    />
                    <span className="text-green-500 font-semibold text-sm tracking-tight">1. Sort tracks</span>
                </label>
                <div className="flex items-center gap-1.5 ml-auto">
                    <Dropdown
                        value=""
                        onChange={(val) => {
                            if (val) {
                                // Add new rule
                                addSortRule({
                                    id: crypto.randomUUID(),
                                    criteria: val,
                                    descending: false
                                });
                            }
                        }}
                        options={[
                            { value: '', label: '+ Add rule' },
                            ...SORT_CRITERIA.map(f => ({ value: f, label: f }))
                        ]}
                        className="w-32"
                    />
                    <div className="w-7 h-7 flex items-center justify-center">
                        <button
                            onClick={() => setShowHelp(!showHelp)}
                            className={`transition-colors p-1 rounded-full hover:bg-zinc-800 ${showHelp ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            <Info size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {showHelp && (
                <div className="mb-4 p-4 bg-zinc-900/80 border border-t-0 border-x-0 border-b-0 border-l-4 border-l-green-500 rounded-r-lg">
                    {SORT_INFO}
                </div>
            )}

            <div className="space-y-2">
                {sortRules.length === 0 ? (
                    <div className="text-center text-zinc-600 py-4 italic border-2 border-dashed border-zinc-800 rounded-lg">
                        No sort rules added. Playlist will remain in original order.
                    </div>
                ) : (
                    sortRules.map((rule, index) => (
                        <div
                            key={rule.id}
                            data-rule-row
                            className={`flex flex-wrap items-center gap-2 bg-zinc-800 px-2 py-1.5 rounded border ${dragState?.currentIndex === index ? 'border-green-500' : 'border-zinc-700'} ${dragState?.sourceIndex === index ? 'opacity-50' : ''} ${!isProcessing ? 'hover:border-zinc-500 transition-colors' : 'opacity-50'}`}
                        >
                            {/* Left part: Handle, Index, Criteria */}
                            <div className="flex items-center gap-2 flex-1 min-w-[120px]">
                                <div
                                    onMouseDown={(e) => handleMouseDown(e, index)}
                                    className="text-zinc-500 p-1 hover:text-zinc-300 hover:bg-zinc-700/50 rounded cursor-grab active:cursor-grabbing transition-colors select-none"
                                >
                                    <GripVertical size={16} />
                                </div>
                                <span className="text-zinc-400 text-[10px] w-3 flex-shrink-0">{index + 1}.</span>
                                <div className="font-medium text-white text-xs truncate">
                                    {rule.criteria}
                                </div>
                            </div>

                            {/* Right part: Dropdown & Remove */}
                            <div className="flex items-center gap-1.5 ml-auto">
                                <Dropdown
                                    value={rule.descending ? 'Descending' : 'Ascending'}
                                    onChange={(val) => updateSortRule(rule.id, { descending: val === 'Descending' })}
                                    options={getSortOptions(rule.criteria)}
                                    className="w-32"
                                />

                                <div className="w-7 h-7 flex items-center justify-center">
                                    <button
                                        onClick={() => removeSortRule(rule.id)}
                                        className="text-zinc-500 hover:text-red-400 transition-colors p-1 flex-shrink-0"
                                        title="Remove Rule"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Drag Ghost - Full Row Clone */}
            {dragState && sortRules[dragState.sourceIndex] && (
                <div
                    className="fixed pointer-events-none z-50 shadow-2xl"
                    style={{
                        left: 20,
                        right: 20,
                        top: dragState.mouseY - 20,
                    }}
                >
                    <div className="flex items-center gap-2 bg-zinc-800 px-2 py-1.5 rounded border-2 border-green-500">
                        <div className="flex items-center gap-2 flex-1">
                            <div className="text-green-400 p-1">
                                <GripVertical size={16} />
                            </div>
                            <span className="text-zinc-400 text-[10px]">{dragState.sourceIndex + 1}.</span>
                            <div className="font-medium text-white text-xs">
                                {sortRules[dragState.sourceIndex].criteria}
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="bg-zinc-700 px-2 py-1 rounded text-xs text-zinc-300">
                                {sortRules[dragState.sourceIndex].descending
                                    ? (sortRules[dragState.sourceIndex].criteria === 'Release Date' ? 'Oldest First' : 'Descending')
                                    : (sortRules[dragState.sourceIndex].criteria === 'Release Date' ? 'Newest First' : 'Ascending')
                                }
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
