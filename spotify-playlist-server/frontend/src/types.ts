// Type definitions

export interface AuthStatus {
    authenticated: boolean
    user_name?: string
    user_id?: string
}

export interface PlaylistInfo {
    id: string
    name: string
    owner: string
    editable: boolean
    track_count: number
    image_url?: string
}

export interface TrackInfo {
    id: string
    uri: string
    name: string
    artist: string
    album: string
    release_date: string
    duration_ms: number
}

export interface Source {
    type: 'playlist' | 'likedSongs'
    id?: string
}

export interface FilterConfig {
    exclude_liked: boolean
    keyword_blacklist: string[]
}

export interface SortRule {
    criteria: string
    descending: boolean
}

export interface ProcessingOptions {
    apply_sort: boolean
    apply_dupes: boolean
    apply_versions: boolean
    sort_rules: SortRule[]
    dupe_preference: string
    version_preference: string
}

export interface DynamicPlaylistConfig {
    id?: string
    name: string
    target_playlist_id: string
    target_playlist_name: string
    sources: Source[]
    filters: FilterConfig
    update_mode: 'replace' | 'merge' | 'append'
    sample_per_source?: number | null
    include_liked_songs: boolean
    processing: ProcessingOptions
    enabled: boolean
}

export interface Schedule {
    id?: string
    config_id: string
    cron_expression: string
    enabled: boolean
    last_run?: string
    next_run?: string
}

export interface RunHistory {
    id: string
    config_id: string
    config_name: string
    started_at: string
    finished_at?: string
    status: string
    tracks_processed: number
    error_message?: string
    warning_message?: string
    triggered_by: string
}

export interface NextRun {
    schedule_id: string
    config_id: string
    config_name: string
    cron_expression: string
    next_run: string
}
