import { create } from 'zustand';

export interface SortRule {
    id: string;
    criteria: string;
    descending: boolean;
}

export interface Playlist {
    id: string;
    name: string;
    owner: string;
    editable: boolean;
    collaborative: boolean;
    isPublic: boolean;
}

export interface AppState {
    // Auth
    isLoggedIn: boolean;
    userName: string;

    // Sort Rules
    sortEnabled: boolean;
    sortRules: SortRule[];

    // Duplicates
    dupesEnabled: boolean;
    dupePreference: string;

    // Version Replacer
    versionEnabled: boolean;
    versionPreference: string;

    // Playlists
    playlists: Playlist[];
    selectedPlaylistIds: string[];
    filterType: string;
    searchQuery: string;

    // UI State
    isProcessing: boolean;
    statusText: string;

    // Actions
    setSortEnabled: (enabled: boolean) => void;
    addSortRule: (rule?: Partial<SortRule>) => void;
    removeSortRule: (id: string) => void;
    updateSortRule: (id: string, updates: Partial<SortRule>) => void;
    reorderSortRules: (newOrder: SortRule[]) => void;
    setDupesEnabled: (enabled: boolean) => void;
    setDupePreference: (pref: string) => void;
    setVersionEnabled: (enabled: boolean) => void;
    setVersionPreference: (pref: string) => void;
    setFilterType: (filter: string) => void;
    setSearchQuery: (query: string) => void;
    togglePlaylistSelection: (id: string) => void;
    selectAllPlaylists: () => void;
    deselectAllPlaylists: () => void;
    setSelectedPlaylistIds: (ids: string[]) => void;
    setStatus: (text: string) => void;
    setPlaylists: (playlists: Playlist[]) => void;
    shouldCancel: boolean;
    cancelProcessing: () => void;
    resetCancel: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

import { persist } from 'zustand/middleware';

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            // Initial State
            isLoggedIn: false,
            userName: '',

            sortEnabled: true,
            sortRules: [
                { id: generateId(), criteria: 'Release Date', descending: true },
                { id: generateId(), criteria: 'Artist', descending: false },
                { id: generateId(), criteria: 'Album', descending: false },
                { id: generateId(), criteria: 'Track Name', descending: false },
            ],

            dupesEnabled: false,
            dupePreference: 'Keep Oldest (Release Date)',

            versionEnabled: false,
            versionPreference: 'Artist Only: Oldest Version',

            playlists: [],
            selectedPlaylistIds: [],
            filterType: 'Editable Only',
            searchQuery: '',

            isProcessing: false,
            statusText: 'Ready',

            // Actions
            setSortEnabled: (enabled) => set({ sortEnabled: enabled }),

            addSortRule: (rule) => {
                const { sortRules } = get();
                if (sortRules.length >= 8) return;
                const newRule = {
                    id: generateId(),
                    criteria: rule?.criteria || 'Artist',
                    descending: rule?.descending ?? false
                };
                set({
                    sortRules: [...sortRules, newRule]
                });
            },

            removeSortRule: (id) => {
                const { sortRules } = get();
                if (sortRules.length <= 1) return;
                set({ sortRules: sortRules.filter(r => r.id !== id) });
            },

            updateSortRule: (id, updates) => {
                const { sortRules } = get();
                set({
                    sortRules: sortRules.map(r => r.id === id ? { ...r, ...updates } : r)
                });
            },

            reorderSortRules: (newOrder) => set({ sortRules: newOrder }),

            setDupesEnabled: (enabled) => set({ dupesEnabled: enabled }),
            setDupePreference: (pref) => set({ dupePreference: pref }),
            setVersionEnabled: (enabled) => set({ versionEnabled: enabled }),
            setVersionPreference: (pref) => set({ versionPreference: pref }),
            setFilterType: (filter) => set({ filterType: filter }),
            setSearchQuery: (query) => set({ searchQuery: query }),

            togglePlaylistSelection: (id) => {
                const { selectedPlaylistIds } = get();
                if (selectedPlaylistIds.includes(id)) {
                    set({ selectedPlaylistIds: selectedPlaylistIds.filter(pid => pid !== id) });
                } else {
                    set({ selectedPlaylistIds: [...selectedPlaylistIds, id] });
                }
            },

            selectAllPlaylists: () => {
                const { playlists } = get();
                set({ selectedPlaylistIds: playlists.map(p => p.id) });
            },

            deselectAllPlaylists: () => set({ selectedPlaylistIds: [] }),
            setSelectedPlaylistIds: (ids) => set({ selectedPlaylistIds: ids }),
            setStatus: (text) => set({ statusText: text }),
            setPlaylists: (playlists) => set({ playlists }),

            // Cancellation logic
            shouldCancel: false,
            cancelProcessing: () => set({ shouldCancel: true }),
            resetCancel: () => set({ shouldCancel: false }),
        }),
        {
            name: 'spotify-sorter-storage-v2',
            partialize: (state) => ({
                sortEnabled: state.sortEnabled,
                sortRules: state.sortRules,
                dupesEnabled: state.dupesEnabled,
                dupePreference: state.dupePreference,
                versionEnabled: state.versionEnabled,
                versionPreference: state.versionPreference,
                filterType: state.filterType,
                selectedPlaylistIds: state.selectedPlaylistIds,
            }),
        }
    )
);
