use rspotify::prelude::*;
use rspotify::AuthCodeSpotify;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Emitter; // Import Emitter

/// Source type for dynamic playlist tracks
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Source {
    Playlist { id: String },
    LikedSongs,
}

/// How to update the target playlist
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum UpdateMode {
    Replace, // Clear and replace all tracks
    Merge,   // Add new tracks and re-sort
    Append,  // Add new tracks to top without removing
}

/// Filter configuration for excluding tracks
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FilterConfig {
    pub exclude_liked: bool,
    pub keyword_blacklist: Vec<String>,
}

/// Options for applying processing rules during update
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingOptions {
    pub apply_sort: bool,
    pub apply_dupes: bool,
    pub apply_versions: bool,
    #[serde(default)]
    pub sort_rules: Vec<crate::logic::SortRule>,
    #[serde(default)]
    pub dupe_preference: String,
    #[serde(default)]
    pub version_preference: String,
}

/// Full configuration for a dynamic playlist
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicPlaylistConfig {
    pub id: String,
    pub name: String, // Display name for the config
    pub target_playlist_id: String,
    pub sources: Vec<Source>,
    pub filters: FilterConfig,
    pub update_mode: UpdateMode,
    pub sample_per_source: Option<usize>,
    pub include_liked_songs: bool,
    #[serde(default)]
    pub processing: ProcessingOptions,
}

impl DynamicPlaylistConfig {
    pub fn new(name: String, target_playlist_id: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            target_playlist_id,
            sources: Vec::new(),
            filters: FilterConfig::default(),
            update_mode: UpdateMode::Replace,
            sample_per_source: None,
            include_liked_songs: false,
            processing: ProcessingOptions::default(),
        }
    }
}

/// Track info for deduplication and filtering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackInfo {
    pub uri: String,
    pub id: String,
    pub name: String,
    pub artist: String,
    pub album: String,
    pub album_type: String,
    pub release_date: String,
    pub duration_ms: u32,
}

// ... (skipping to line 291 in same file) or better to use separate chunks if far apart

impl TrackInfo {
    /// Convert to AppTrack for use with existing sort/dupe logic
    pub fn to_app_track(&self) -> crate::logic::AppTrack {
        crate::logic::AppTrack {
            id: self.id.clone(),
            name: self.name.clone(),
            artist_names: self.artist.clone(),
            album_name: self.album.clone(),
            album_type: self.album_type.clone(),
            release_date: self.release_date.clone(),
            uri: self.uri.clone(),
            duration_ms: self.duration_ms,
        }
    }

    /// Convert from AppTrack back to TrackInfo
    pub fn from_app_track(track: &crate::logic::AppTrack) -> Self {
        Self {
            uri: track.uri.clone(),
            id: track.id.clone(),
            name: track.name.clone(),
            artist: track.artist_names.clone(),
            album: track.album_name.clone(),
            album_type: track.album_type.clone(),
            release_date: track.release_date.clone(),
            duration_ms: track.duration_ms,
        }
    }
}

pub fn get_app_data_dir() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("Spotify Sorter");
    path
}

pub fn get_dynamic_configs_path() -> PathBuf {
    get_app_data_dir().join("dynamic_configs.json")
}

/// Load all saved dynamic playlist configurations
pub fn load_dynamic_configs() -> Vec<DynamicPlaylistConfig> {
    let path = get_dynamic_configs_path();
    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    }
}

/// Save dynamic playlist configurations to disk
pub fn save_dynamic_configs(configs: &[DynamicPlaylistConfig]) -> Result<(), String> {
    let path = get_dynamic_configs_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(configs).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Fetch tracks from a single source with rate limit handling
pub async fn fetch_tracks_from_source(
    spotify: &AuthCodeSpotify,
    source: &Source,
    app_handle: &tauri::AppHandle,
) -> Result<Vec<TrackInfo>, String> {
    match source {
        Source::Playlist { id } => fetch_playlist_tracks(spotify, id, app_handle).await,
        Source::LikedSongs => fetch_liked_songs(spotify).await,
    }
}

/// Fetch all tracks from a playlist
async fn fetch_playlist_tracks(
    spotify: &AuthCodeSpotify,
    playlist_id: &str,
    app_handle: &tauri::AppHandle,
) -> Result<Vec<TrackInfo>, String> {
    let mut tracks = Vec::new();
    let mut offset = 0;

    loop {
        let url = format!(
            "playlists/{}/tracks?limit=100&offset={}",
            playlist_id, offset
        );

        let mut attempts = 0;
        let mut loop_res = None;

        while attempts < 5 {
            match spotify
                .api_get(&url, &std::collections::HashMap::new())
                .await
            {
                Ok(res_str) => {
                    loop_res = Some(res_str);
                    break;
                }
                Err(e) => {
                    let err_str = e.to_string();
                    if err_str.contains("429") || err_str.to_lowercase().contains("rate limit") {
                        let sleep_duration = 2u64.pow(attempts + 1);
                        let msg = format!(
                            "Rate limit 429 (Dynamic). Retrying batch {} in {}s...",
                            offset / 100,
                            sleep_duration
                        );
                        println!("{}", msg);
                        let _ = app_handle.emit("status_update", &msg);
                        tokio::time::sleep(tokio::time::Duration::from_secs(sleep_duration)).await;
                        attempts += 1;
                    } else {
                        return Err(format!("Failed to fetch raw tracks: {}", e));
                    }
                }
            }
        }

        let res_str = loop_res.ok_or("Failed to fetch tracks batch after retries")?;

        let res: serde_json::Value = serde_json::from_str(&res_str)
            .map_err(|e| format!("Failed to parse tracks JSON: {}", e))?;

        if let Some(items) = res["items"].as_array() {
            for item in items {
                if let Some(track_val) = item["track"].as_object() {
                    if let Some(app_track) = crate::logic::AppTrack::from_json(track_val) {
                        tracks.push(TrackInfo::from_app_track(&app_track));
                    }
                }
            }
        }

        if res["next"].is_null() {
            break;
        }
        offset += 100;
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    Ok(tracks)
}

#[derive(Serialize, Deserialize, Debug)]
struct LikedSongsCacheEntry {
    total_count: u32,
    tracks: Vec<TrackInfo>,
    timestamp: i64,
}

/// Fetch user's liked songs with Smart Caching
async fn fetch_liked_songs(spotify: &AuthCodeSpotify) -> Result<Vec<TrackInfo>, String> {
    // 1. Light Check: Get total count (limit=1)
    let check_page = spotify
        .current_user_saved_tracks_manual(None, Some(1), Some(0))
        .await
        .map_err(|e| format!("Failed to check liked songs count: {}", e))?;

    let remote_total = check_page.total;

    // 2. Check Cache
    let path = get_app_data_dir().join("liked_cache.json");

    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(cache) = serde_json::from_str::<LikedSongsCacheEntry>(&content) {
                let now = chrono::Utc::now().timestamp();
                // 24 hour TTL, but strictly check count
                if cache.total_count == remote_total && (now - cache.timestamp) < 86400 {
                    println!(
                        "Liked songs Cache HIT: Count {} matches. Returning cached.",
                        remote_total
                    );
                    return Ok(cache.tracks);
                }
            }
        }
    }

    println!(
        "Liked songs Cache MISS (Remote: {}, Cache: ?). Fetching full list...",
        remote_total
    );

    // 3. Fetch Full List
    let mut tracks = Vec::new();
    let mut offset = 0;
    let limit = 50;

    loop {
        let page = spotify
            .current_user_saved_tracks_manual(None, Some(limit), Some(offset))
            .await
            .map_err(|e| format!("Failed to fetch liked songs: {}", e))?;

        for item in page.items {
            let track = item.track;
            if let Some(uri) = track.id.as_ref().map(|id| id.uri()) {
                // Handle optional artist/album
                let artist_name = track
                    .artists
                    .first()
                    .map(|a| a.name.clone())
                    .unwrap_or_default();
                let album_name = track.album.name.clone();
                let album_type = track
                    .album
                    .album_type
                    .as_ref()
                    .map(|t| format!("{:?}", t))
                    .unwrap_or_else(|| "unknown".to_string());
                let release_date = track.album.release_date.clone().unwrap_or_default();

                tracks.push(TrackInfo {
                    uri: uri.clone(),
                    id: track
                        .id
                        .map(|id| id.id().to_string())
                        .unwrap_or_else(|| uri.clone()),
                    name: track.name,
                    artist: artist_name,
                    album: album_name,
                    album_type,
                    release_date,
                    duration_ms: track.duration.num_milliseconds() as u32,
                });
            }
        }

        if page.next.is_none() {
            break;
        }
        offset += limit;

        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    // 4. Save Cache
    let entry = LikedSongsCacheEntry {
        total_count: remote_total,
        tracks: tracks.clone(),
        timestamp: chrono::Utc::now().timestamp(),
    };

    if let Ok(json) = serde_json::to_string(&entry) {
        let _ = fs::write(path, json);
    }

    Ok(tracks)
}

/// Get set of liked song URIs for filtering
pub async fn get_liked_song_uris(spotify: &AuthCodeSpotify) -> Result<HashSet<String>, String> {
    let tracks = fetch_liked_songs(spotify).await?;
    Ok(tracks.into_iter().map(|t| t.uri).collect())
}

/// Apply filters to a list of tracks
pub fn apply_filters(
    tracks: Vec<TrackInfo>,
    filters: &FilterConfig,
    liked_uris: Option<&HashSet<String>>,
) -> Vec<TrackInfo> {
    tracks
        .into_iter()
        .filter(|track| {
            // Exclude liked songs if configured
            if filters.exclude_liked {
                if let Some(liked) = liked_uris {
                    if liked.contains(&track.uri) {
                        return false;
                    }
                }
            }

            // Exclude by keyword blacklist
            for keyword in &filters.keyword_blacklist {
                let kw_lower = keyword.to_lowercase();
                if track.name.to_lowercase().contains(&kw_lower)
                    || track.artist.to_lowercase().contains(&kw_lower)
                    || track.album.to_lowercase().contains(&kw_lower)
                {
                    return false;
                }
            }

            true
        })
        .collect()
}

/// Sample tracks from a list (random selection)
pub fn sample_tracks(tracks: Vec<TrackInfo>, max_count: Option<usize>) -> Vec<TrackInfo> {
    match max_count {
        Some(n) if n < tracks.len() => {
            use rand::seq::SliceRandom;
            let mut rng = rand::thread_rng();
            let mut shuffled = tracks;
            shuffled.shuffle(&mut rng);
            shuffled.into_iter().take(n).collect()
        }
        _ => tracks,
    }
}

/// Deduplicate tracks by URI
pub fn deduplicate_tracks(tracks: Vec<TrackInfo>) -> Vec<TrackInfo> {
    let mut seen = HashSet::new();
    tracks
        .into_iter()
        .filter(|t| seen.insert(t.uri.clone()))
        .collect()
}

/// Execute a full dynamic playlist update
pub async fn update_dynamic_playlist(
    spotify: &AuthCodeSpotify,
    config: &DynamicPlaylistConfig,
    app_handle: &tauri::AppHandle,
) -> Result<usize, String> {
    // Step 1: Collect tracks from all sources
    let mut all_tracks = Vec::new();

    for source in config.sources.iter() {
        let mut source_tracks = fetch_tracks_from_source(spotify, source, app_handle).await?;

        // Sample if configured
        source_tracks = sample_tracks(source_tracks, config.sample_per_source);

        all_tracks.extend(source_tracks);

        // Delay between sources
        tokio::time::sleep(Duration::from_millis(200)).await;
    }

    // Include liked songs if configured
    if config.include_liked_songs {
        let liked = fetch_liked_songs(spotify).await?;
        let liked_sampled = sample_tracks(liked, config.sample_per_source);
        all_tracks.extend(liked_sampled);
    }

    // Step 2: Get liked songs for filtering (if needed)
    let liked_uris = if config.filters.exclude_liked {
        Some(get_liked_song_uris(spotify).await?)
    } else {
        None
    };

    // Step 3: Apply filters
    let filtered_tracks = apply_filters(all_tracks, &config.filters, liked_uris.as_ref());

    // Step 4: Deduplicate (our basic dedup)
    let unique_tracks = deduplicate_tracks(filtered_tracks);

    // Step 5: Apply processing options (sort/dupe using main app logic)
    let processed_tracks = if config.processing.apply_sort || config.processing.apply_dupes {
        // Convert to AppTrack for processing
        let mut app_tracks: Vec<crate::logic::AppTrack> =
            unique_tracks.iter().map(|t| t.to_app_track()).collect();

        // Apply sorting
        if config.processing.apply_sort && !config.processing.sort_rules.is_empty() {
            app_tracks = crate::logic::sort_tracks(app_tracks, &config.processing.sort_rules);
        }

        // Apply deduplication
        if config.processing.apply_dupes && !config.processing.dupe_preference.is_empty() {
            let (kept, _removed) =
                crate::logic::remove_duplicates(app_tracks, &config.processing.dupe_preference);
            app_tracks = kept;
        }

        // Convert back to TrackInfo
        app_tracks.iter().map(TrackInfo::from_app_track).collect()
    } else {
        unique_tracks
    };

    // Step 6: Generate final URI list
    let final_uris: Vec<String> = match config.update_mode {
        UpdateMode::Replace => processed_tracks.iter().map(|t| t.uri.clone()).collect(),

        UpdateMode::Merge => {
            let existing =
                fetch_playlist_tracks(spotify, &config.target_playlist_id, app_handle).await?;
            let mut combined = existing;
            combined.extend(processed_tracks);
            let deduped = deduplicate_tracks(combined);
            deduped.iter().map(|t| t.uri.clone()).collect()
        }

        UpdateMode::Append => {
            let existing =
                fetch_playlist_tracks(spotify, &config.target_playlist_id, app_handle).await?;
            let existing_uris: HashSet<_> = existing.iter().map(|t| t.uri.clone()).collect();

            // Only add truly new tracks
            let new_only: Vec<_> = processed_tracks
                .into_iter()
                .filter(|t| !existing_uris.contains(&t.uri))
                .map(|t| t.uri)
                .collect();

            // Prepend new tracks to existing
            let mut result = new_only;
            result.extend(existing.into_iter().map(|t| t.uri));
            result
        }
    };

    let track_count = final_uris.len();

    // Step 7: Update the playlist
    crate::spotify::update_playlist_items(
        spotify,
        &config.target_playlist_id,
        final_uris,
        None,
        app_handle,
    )
    .await?;

    Ok(track_count)
}
