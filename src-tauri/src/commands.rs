use crate::logic::{remove_duplicates, sort_tracks, AppTrack, ProcessingResult, SortRule};
use crate::spotify::{
    do_spotify_auth, fetch_all_playlists, fetch_playlist_tracks, Playlist, SpotifyState,
};
use crate::AppState;
use rspotify::model::{PlayableItem, PlaylistId};
use rspotify::prelude::*;
use rspotify::{AuthCodeSpotify, Credentials, OAuth};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::State;

// Debug log system is used from crate::debug_log via macros

#[derive(Serialize)]
pub struct AuthCheckResult {
    authenticated: bool,
    playlists: Option<Vec<Playlist>>,
}

#[derive(Serialize)]
pub struct InitResult {
    success: bool,
    playlists: Option<Vec<Playlist>>,
    error: Option<String>,
}

#[derive(Deserialize)]
pub struct AutomationConfig {
    #[serde(rename = "sortEnabled")]
    sort_enabled: bool,
    #[serde(rename = "sortRules")]
    sort_rules: Vec<SortRule>,
    #[serde(rename = "dupesEnabled")]
    dupes_enabled: bool,
    #[serde(rename = "dupePreference")]
    dupe_preference: String,
    #[serde(rename = "versionEnabled")]
    version_enabled: bool,
    #[serde(rename = "versionPreference")]
    version_preference: String,
    #[serde(rename = "playlistIds")]
    playlist_ids: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct SavedCredentials {
    client_id: String,
    client_secret: String,
    refresh_token: Option<String>,
}

pub fn get_app_data_dir() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("Spotify Sorter");
    fs::create_dir_all(&path).ok();
    path
}

pub fn get_backup_dir() -> PathBuf {
    let mut path = get_app_data_dir();
    path.push("backups");
    fs::create_dir_all(&path).ok();
    path
}

pub fn get_exports_dir() -> PathBuf {
    let mut path = get_app_data_dir();
    path.push("exports");
    fs::create_dir_all(&path).ok();
    path
}

fn get_credentials_path() -> PathBuf {
    let mut path = get_app_data_dir();
    path.push("credentials.json");
    path
}

fn get_history_path() -> PathBuf {
    let mut path = get_app_data_dir();
    path.push("history.json");
    path
}

fn get_ignored_tracks_path() -> PathBuf {
    let mut path = get_app_data_dir();
    path.push("ignored_tracks.json");
    path
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub playlist_name: String,
    pub playlist_id: String,
    pub action: String,
    pub time: String,
    pub backup_file: String,
    pub changes: Option<Vec<ReviewChange>>,
    #[serde(default)]
    pub ignored: Option<Vec<ReviewChange>>,
    #[serde(default)]
    pub dynamic_config_backup: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IgnoredTrack {
    id: String,
    title: String,
    artist: String,
    album: String,
    year: String,

    // Metadata for the track that was ignored/rejected (e.g. the duplicate or the new version)
    ignored_title: Option<String>,
    ignored_artist: Option<String>,
    ignored_album: Option<String>,
    ignored_year: Option<String>,

    source_playlist: String,
    #[serde(alias = "rejected_context")]
    rejected_context: String,
}

#[tauri::command]
pub async fn check_auth(state: State<'_, AppState>) -> Result<AuthCheckResult, String> {
    // Check if we're already in memory
    {
        let spotify = state.spotify.lock().unwrap();
        if spotify.is_authenticated() {
            return Ok(AuthCheckResult {
                authenticated: true,
                playlists: Some(spotify.playlists.clone()),
            });
        }
    }

    // Try to load from disk
    let creds_path = get_credentials_path();
    if creds_path.exists() {
        if let Ok(content) = fs::read_to_string(&creds_path) {
            if let Ok(creds) = serde_json::from_str::<SavedCredentials>(&content) {
                if let Some(refresh_token) = creds.refresh_token {
                    // Re-authenticate using refresh token
                    println!("Found saved credentials, refreshing token...");

                    let credentials = Credentials::new(&creds.client_id, &creds.client_secret);
                    let oauth = OAuth {
                        redirect_uri: crate::spotify::REDIRECT_URI.to_string(),
                        scopes: SpotifyState::get_scopes(),
                        ..Default::default()
                    };

                    let client = AuthCodeSpotify::new(credentials, oauth);

                    // Manually set the refresh token and request a new access token
                    // Note: rspotify doesn't expose a clean way to just inject a refresh token without a Token struct
                    // So we construct a dummy Token with the refresh token and let it refresh
                    let token = rspotify::Token {
                        access_token: "".to_string(), // Will be refreshed
                        refresh_token: Some(refresh_token.clone()),
                        expires_in: chrono::Duration::seconds(0),
                        expires_at: Some(chrono::Utc::now()),
                        scopes: SpotifyState::get_scopes(),
                    };

                    *client.token.lock().await.unwrap() = Some(token);

                    match client.refresh_token().await {
                        Ok(_) => {
                            // Success! Fetch user and playlists
                            match client.current_user().await {
                                Ok(user) => {
                                    let user_id = user.id.to_string();
                                    match fetch_all_playlists(&client, &user_id).await {
                                        Ok(playlists) => {
                                            let mut spotify = state.spotify.lock().unwrap();
                                            spotify.client_id = Some(creds.client_id);
                                            spotify.client_secret = Some(creds.client_secret);
                                            spotify.refresh_token = Some(refresh_token);
                                            spotify.user_id = Some(user_id);
                                            spotify.playlists = playlists.clone();
                                            spotify.client = Some(client);

                                            println!("Successfully restored session!");
                                            return Ok(AuthCheckResult {
                                                authenticated: true,
                                                playlists: Some(playlists),
                                            });
                                        }
                                        Err(e) => println!("Failed to fetch playlists: {}", e),
                                    }
                                }
                                Err(e) => println!("Failed to get user: {}", e),
                            }
                        }
                        Err(e) => println!("Failed to refresh token: {}", e),
                    }
                }
            }
        }
    }

    Ok(AuthCheckResult {
        authenticated: false,
        playlists: None,
    })
}

#[tauri::command]
pub async fn initialize_spotify(
    state: State<'_, AppState>,
    client_id: String,
    client_secret: String,
) -> Result<InitResult, String> {
    println!("Starting Spotify OAuth flow...");

    let (client, user_id, playlists) =
        do_spotify_auth(client_id.clone(), client_secret.clone()).await?;

    println!(
        "Successfully authenticated! Found {} playlists.",
        playlists.len()
    );

    // Save credentials
    let refresh_token = client
        .get_token()
        .lock()
        .await
        .unwrap()
        .as_ref()
        .and_then(|t| t.refresh_token.clone());

    if let Some(rt) = &refresh_token {
        let creds = SavedCredentials {
            client_id: client_id.clone(),
            client_secret: client_secret.clone(),
            refresh_token: Some(rt.clone()),
        };

        let creds_path = get_credentials_path();
        if let Ok(json) = serde_json::to_string_pretty(&creds) {
            fs::write(&creds_path, json).ok();
            println!("Credentials saved to {:?}", creds_path);
        }
    }

    {
        let mut spotify = state.spotify.lock().unwrap();
        spotify.client_id = Some(client_id);
        spotify.client_secret = Some(client_secret);
        spotify.refresh_token = refresh_token;
        spotify.user_id = Some(user_id);
        spotify.playlists = playlists.clone();
        spotify.client = Some(client);
    }

    Ok(InitResult {
        success: true,
        playlists: Some(playlists),
        error: None,
    })
}

#[tauri::command]
pub fn logout(state: State<AppState>) {
    let mut spotify = state.spotify.lock().unwrap();
    spotify.client_id = None;
    spotify.client_secret = None;
    spotify.access_token = None;
    spotify.refresh_token = None;
    spotify.user_id = None;
    spotify.playlists = Vec::new();
    spotify.client = None;

    // Remove saved credentials
    let creds_path = get_credentials_path();
    if creds_path.exists() {
        fs::remove_file(creds_path).ok();
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ReviewChange {
    pub id: String,
    #[serde(rename = "type")]
    pub change_type: String,

    // For replacements
    #[serde(rename = "newTitle")]
    pub new_title: Option<String>,
    #[serde(rename = "newArtist")]
    pub new_artist: Option<String>,
    #[serde(rename = "newAlbum")]
    pub new_album: Option<String>,
    #[serde(rename = "newDate")]
    pub new_date: Option<String>,

    // For duplicates
    #[serde(rename = "remTitle")]
    pub rem_title: Option<String>,
    #[serde(rename = "remArtist")]
    pub rem_artist: Option<String>,
    #[serde(rename = "remAlbum")]
    pub rem_album: Option<String>,
    #[serde(rename = "remDate")]
    pub rem_date: Option<String>,

    // Internal use for applying
    // Internal use for applying
    #[serde(default)]
    pub track_uri: String,
    #[serde(default)]
    pub original_index: usize,
    #[serde(default)]
    pub original_uri: String, // ID of the track currently in the playlist (to be ignored if rejected)
}

#[derive(Serialize, Clone, Debug)]
pub struct ScanResult {
    pub playlist_id: String,
    pub name: String,
    pub changes: Vec<ReviewChange>,
    pub stats: ProcessingResult,
}

#[tauri::command]
pub async fn scan_playlist(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    playlist_ids: Vec<String>,
    sort_rules: Vec<SortRule>,
    sort_enabled: bool,
    dupes_enabled: bool,
    dupe_preference: String,
    _version_enabled: bool,
    _version_preference: String,
) -> Result<Vec<ScanResult>, String> {
    println!("=== SCAN PLAYLIST ===");
    println!("Processing {} playlists", playlist_ids.len());

    // Get the Spotify client
    let client = {
        let spotify = state.spotify.lock().unwrap();
        spotify.client.clone()
    }
    .ok_or("Not authenticated")?;

    let mut scan_results: Vec<ScanResult> = Vec::new();

    for playlist_id in &playlist_ids {
        println!("\nScanning playlist: {}", playlist_id);

        // Fetch all tracks from the playlist
        // Fetch all tracks from the playlist (with caching)
        let (pl_name, mut tracks) = match fetch_playlist_tracks(&client, playlist_id).await {
            Ok(res) => res,
            Err(e) => {
                println!("Failed to fetch tracks for {}: {}", playlist_id, e);
                continue;
            }
        };

        let original_count = tracks.len();
        println!("  Fetched {} tracks (Name: {})", original_count, pl_name);

        let mut changes: Vec<ReviewChange> = Vec::new();
        let mut duplicates_count = 0;

        // 1. Identify Duplicates
        if dupes_enabled {
            let (kept, removed) = remove_duplicates(tracks.clone(), &dupe_preference);
            duplicates_count = removed.len();

            for track in removed {
                changes.push(ReviewChange {
                    id: uuid::Uuid::new_v4().to_string(),
                    change_type: "duplicate".to_string(),
                    new_title: None,
                    new_artist: None,
                    new_album: None,
                    new_date: None,
                    rem_title: Some(track.name.clone()),
                    rem_artist: Some(track.artist_names.clone()),
                    rem_album: Some(track.album_name.clone()),
                    rem_date: Some(track.release_date.clone()),
                    track_uri: track.uri.clone(),
                    original_index: 0,
                    original_uri: track.uri.clone(),
                });
            }

            // Update 'tracks' to reflect the state after deduping for sorting
            tracks = kept;
        }

        // 2. Version Replacement
        let mut versions_replaced = 0;
        if _version_enabled {
            println!(
                "  Checking for better versions (Preference: {})...",
                _version_preference
            );

            // limiting to avoids rate limits, but let's try sequential for safety first
            for (idx, track) in tracks.iter_mut().enumerate() {
                // Skip if this track was already marked for duplicate removal (not in this list, as we deduped tracks vec already)

                // Get all artists from the track
                let all_artists: Vec<&str> = track
                    .artist_names
                    .split(',')
                    .map(|a| a.trim())
                    .filter(|a| !a.is_empty())
                    .collect();

                let clean_name = clean_title(&track.name);

                debug_info!(
                    &app,
                    format!(
                        "Checking track: '{}' (cleaned: '{}')",
                        track.name, clean_name
                    ),
                    format!("Artists: {:?}", all_artists)
                );

                // Search for EACH artist to find versions credited differently
                let mut all_search_results: Vec<AppTrack> = Vec::new();

                for artist in &all_artists {
                    let query = format!("track:{} artist:{}", clean_name, artist);
                    debug_search!(&app, format!("Searching: {}", query));

                    match client
                        .search(
                            &query,
                            rspotify::model::SearchType::Track,
                            None,
                            None,
                            Some(10),
                            None,
                        )
                        .await
                    {
                        Ok(result) => {
                            if let rspotify::model::SearchResult::Tracks(page) = result {
                                debug_info!(
                                    &app,
                                    format!(
                                        "Found {} results for artist '{}'",
                                        page.items.len(),
                                        artist
                                    )
                                );
                                for t in &page.items {
                                    if let Some(app_track) = AppTrack::from_spotify(t) {
                                        // Avoid duplicates
                                        if !all_search_results.iter().any(|r| r.id == app_track.id)
                                        {
                                            all_search_results.push(app_track);
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            debug_error!(&app, format!("Search failed for '{}': {}", artist, e))
                        }
                    }
                }

                // FALLBACK: Also search without artist filter to catch edge cases
                let query_no_artist = format!("track:{}", clean_name);
                debug_search!(
                    &app,
                    format!("Fallback search (no artist): {}", query_no_artist)
                );

                match client
                    .search(
                        &query_no_artist,
                        rspotify::model::SearchType::Track,
                        None,
                        None,
                        Some(10),
                        None,
                    )
                    .await
                {
                    Ok(result) => {
                        if let rspotify::model::SearchResult::Tracks(page) = result {
                            debug_info!(
                                &app,
                                format!("Fallback found {} results", page.items.len())
                            );
                            for t in &page.items {
                                if let Some(app_track) = AppTrack::from_spotify(t) {
                                    if !all_search_results.iter().any(|r| r.id == app_track.id) {
                                        all_search_results.push(app_track);
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => debug_error!(&app, format!("Fallback search failed: {}", e)),
                }

                // ADDITIONAL: Search without "Original" suffix to find base album versions
                let base_name = strip_original_suffix(&clean_name);
                if base_name != clean_name {
                    for artist in &all_artists {
                        let query_base = format!("track:{} artist:{}", base_name, artist);
                        debug_search!(&app, format!("Base search (no 'Original'): {}", query_base));

                        match client
                            .search(
                                &query_base,
                                rspotify::model::SearchType::Track,
                                None,
                                None,
                                Some(10),
                                None,
                            )
                            .await
                        {
                            Ok(result) => {
                                if let rspotify::model::SearchResult::Tracks(page) = result {
                                    debug_info!(
                                        &app,
                                        format!(
                                            "Base search found {} results for artist '{}'",
                                            page.items.len(),
                                            artist
                                        )
                                    );
                                    for t in &page.items {
                                        if let Some(app_track) = AppTrack::from_spotify(t) {
                                            if !all_search_results
                                                .iter()
                                                .any(|r| r.id == app_track.id)
                                            {
                                                all_search_results.push(app_track);
                                            }
                                        }
                                    }
                                }
                            }
                            Err(e) => debug_error!(
                                &app,
                                format!("Base search failed for '{}': {}", artist, e)
                            ),
                        }
                    }
                }

                debug_info!(
                    &app,
                    format!("Total unique results: {}", all_search_results.len())
                );

                // Now filter and process results
                if all_search_results.is_empty() {
                    continue;
                }

                // Filter candidates from combined search results
                let original_artists: Vec<&str> =
                    track.artist_names.split(',').map(|a| a.trim()).collect();

                let mut candidates: Vec<AppTrack> = all_search_results
                    .into_iter()
                    .filter(|t| {
                        // Skip if this is the exact same track (same Spotify ID)
                        if t.id == track.id {
                            debug_skipped!(&app, format!("SKIPPED (same ID): {}", t.id));
                            return false;
                        }

                        // Title match (relaxed)
                        let title_match = match_titles_relaxed(&t.name, &track.name);
                        if !title_match {
                            debug_rejected!(
                                &app,
                                format!("REJECTED (title): '{}'", t.name),
                                format!(
                                    "'{}' vs '{}'",
                                    clean_title(&t.name),
                                    clean_title(&track.name)
                                )
                            );
                            return false;
                        }

                        // Artist match: Check if ANY original artist appears in candidate
                        let candidate_artists: Vec<&str> =
                            t.artist_names.split(',').map(|a| a.trim()).collect();

                        let artist_match = original_artists.iter().any(|orig| {
                            candidate_artists
                                .iter()
                                .any(|cand| orig.eq_ignore_ascii_case(cand))
                        });

                        if !artist_match {
                            debug_rejected!(
                                &app,
                                format!("REJECTED (artist): '{}'", t.artist_names),
                                format!("Expected one of: {:?}", original_artists)
                            );
                        } else {
                            debug_passed!(
                                &app,
                                format!("PASSED: '{}'", t.name),
                                format!(
                                    "Album: '{}' ({}, {})",
                                    t.album_name, t.release_date, t.album_type
                                )
                            );
                        }

                        artist_match
                    })
                    .collect();

                debug_info!(
                    &app,
                    format!("Candidates after filter: {}", candidates.len())
                );

                if candidates.is_empty() {
                    continue;
                }

                // Sort: Primary by date, Secondary by album_type (single > album > compilation)
                candidates.sort_by(|a, b| {
                    let date_a = crate::logic::parse_date_obj(&a.release_date);
                    let date_b = crate::logic::parse_date_obj(&b.release_date);

                    // Primary sort by date
                    let date_cmp = match _version_preference.as_str() {
                        "Artist Only: Oldest Version" | "Global: Oldest Version" => {
                            date_a.cmp(&date_b)
                        }
                        "Artist Only: Newest Version" | "Global: Newest Version" => {
                            date_b.cmp(&date_a)
                        }
                        _ => std::cmp::Ordering::Equal,
                    };

                    // If dates are equal, prefer by album_type: single > album > compilation
                    if date_cmp == std::cmp::Ordering::Equal {
                        // Assign priority: single=0, album=1, compilation=2
                        fn type_priority(t: &str) -> u8 {
                            match t.to_lowercase().as_str() {
                                "single" => 0,
                                "album" => 1,
                                "compilation" => 2,
                                _ => 3,
                            }
                        }
                        type_priority(&a.album_type).cmp(&type_priority(&b.album_type))
                    } else {
                        date_cmp
                    }
                });

                // Log sorted candidates
                println!("      Sorted candidates ({}):", _version_preference);
                for (i, c) in candidates.iter().enumerate() {
                    println!(
                        "        [{}] '{}' from '{}' ({}, type: '{}')",
                        i, c.name, c.album_name, c.release_date, c.album_type
                    );
                }

                if let Some(best) = candidates.first() {
                    // Compare with current
                    let current_date = crate::logic::parse_date_obj(&track.release_date);
                    let best_date = crate::logic::parse_date_obj(&best.release_date);

                    // Album type priority: single=0, album=1, compilation=2
                    fn type_priority(t: &str) -> u8 {
                        match t.to_lowercase().as_str() {
                            "single" => 0,
                            "album" => 1,
                            "compilation" => 2,
                            _ => 3,
                        }
                    }
                    let current_priority = type_priority(&track.album_type);
                    let best_priority = type_priority(&best.album_type);

                    debug_comparison!(
                        &app,
                        format!("Best: '{}' ({})", best.name, best.release_date),
                        format!("Type: {}, Priority: {}", best.album_type, best_priority)
                    );
                    debug_comparison!(
                        &app,
                        format!("Current: '{}' ({})", track.name, track.release_date),
                        format!("Type: {}, Priority: {}", track.album_type, current_priority)
                    );

                    debug_comparison!(
                        &app,
                        format!(
                            "Album types: current='{}' (priority {}), best='{}' (priority {})",
                            track.album_type, current_priority, best.album_type, best_priority
                        )
                    );

                    // NEVER downgrade (e.g. single→album, album→compilation)
                    if best_priority > current_priority {
                        debug_skipped!(
                            &app,
                            format!(
                                "SKIPPED: Won't downgrade from {} to {}",
                                track.album_type, best.album_type
                            )
                        );
                        continue;
                    }

                    // Replace if: better date OR same date but better album type (upgrade)
                    let should_replace = match _version_preference.as_str() {
                        p if p.contains("Oldest") => best_date < current_date,
                        p if p.contains("Newest") => best_date > current_date,
                        _ => false,
                    } || (best_date == current_date
                        && best_priority < current_priority);

                    println!("      should_replace: {}", should_replace);

                    if should_replace {
                        println!(
                            "    Found better version for '{}': {} ({}) -> {} ({})",
                            track.name, track.release_date, track.id, best.release_date, best.id
                        );

                        changes.push(ReviewChange {
                            id: uuid::Uuid::new_v4().to_string(),
                            change_type: "replace".to_string(),
                            // New Info
                            new_title: Some(best.name.clone()),
                            new_artist: Some(best.artist_names.clone()),
                            new_album: Some(best.album_name.clone()),
                            new_date: Some(best.release_date.clone()),
                            // Current (Old) Info
                            rem_title: Some(track.name.clone()),
                            rem_artist: Some(track.artist_names.clone()),
                            rem_album: Some(track.album_name.clone()),
                            rem_date: Some(track.release_date.clone()),
                            // Tech
                            track_uri: best.uri.clone(), // We want to ADD this one
                            original_index: idx,         // We want to REPLACE the one at this index
                            original_uri: track.uri.clone(),
                        });

                        // Update the track in our list so sorting uses the new one
                        *track = best.clone();
                        versions_replaced += 1;
                    }
                }

                // simple rate limit
                // std::thread::sleep(std::time::Duration::from_millis(50)); // async sleep?
                // tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
        }

        // 3. Sorting (No individual review changes, just stats)
        let sorted = sort_enabled && !sort_rules.is_empty();

        scan_results.push(ScanResult {
            playlist_id: playlist_id.clone(),
            name: pl_name,
            changes,
            stats: ProcessingResult {
                playlist_id: playlist_id.clone(),
                playlist_name: "".to_string(), // redundant in stats if in parent
                original_count,
                final_count: tracks.len(), // projected
                sorted,
                duplicates_removed: duplicates_count,
                versions_replaced,
            },
        });
    }

    Ok(scan_results)
}

#[tauri::command]
pub async fn apply_changes(
    state: State<'_, AppState>,
    playlist_id: String,
    approved_changes: Vec<ReviewChange>, // Only the changes the user approved
    rejected_changes: Vec<ReviewChange>,
    sort_rules: Vec<SortRule>,
    sort_enabled: bool,
) -> Result<String, String> {
    println!("=== APPLY CHANGES: {} ===", playlist_id);

    // Handle Rejections first (independent of Spotify ops)
    if !rejected_changes.is_empty() {
        println!(
            "  Processing {} rejections (adding to ignore list)...",
            rejected_changes.len()
        );
        let mut ignored = get_ignored_tracks().unwrap_or_default();

        for change in &rejected_changes {
            // We ignore the ORIGINAL track that was targeted
            // If original_uri is missing (old ScanResults?), fallback to track_uri which might be WRONG for replacements but OK for dupes
            let ignore_id = if !change.original_uri.is_empty() {
                change.original_uri.clone()
            } else {
                change.track_uri.clone()
            };

            // Check if already ignored to avoid duplicates
            if !ignored.iter().any(|t| t.id == ignore_id) {
                let context = if change.change_type == "replace" {
                    // Cleaner context string, though we now have structured data
                    "Replacement".to_string()
                } else {
                    "Duplicate Removal".to_string()
                };

                let (ignored_title, ignored_artist, ignored_album, ignored_year) =
                    if change.change_type == "replace" {
                        (
                            change.new_title.clone(),
                            change.new_artist.clone(),
                            change.new_album.clone(),
                            change.new_date.clone(),
                        )
                    } else {
                        // For duplicates, the "ignored" content IS the track itself, but we display that as KEPT.
                        // The "action" was ignored.
                        // So we leave these blank.
                        (None, None, None, None)
                    };

                ignored.push(IgnoredTrack {
                    id: ignore_id,
                    title: change.rem_title.clone().unwrap_or_default(),
                    artist: change.rem_artist.clone().unwrap_or_default(),
                    album: change.rem_album.clone().unwrap_or_default(),
                    year: change.rem_date.clone().unwrap_or_default(),

                    ignored_title,
                    ignored_artist,
                    ignored_album,
                    ignored_year,

                    source_playlist: playlist_id.clone(),
                    rejected_context: context,
                });
            }
        }

        if let Ok(json) = serde_json::to_string_pretty(&ignored) {
            fs::write(get_ignored_tracks_path(), json).ok();
            println!("  Saved ignored tracks to disk.");
        }
    }

    // Get the Spotify client
    let client = {
        let spotify = state.spotify.lock().unwrap();
        spotify.client.clone()
    }
    .ok_or("Not authenticated")?;

    // 1. Fetch latest tracks (to ensure we work on fresh state)
    let pid =
        PlaylistId::from_id(&playlist_id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

    let pl_name = match client.playlist(pid.clone(), None, None).await {
        Ok(p) => p.name,
        Err(_) => playlist_id.clone(),
    };

    // 1. Fetch latest tracks (using shared helper)
    let (_, fetched_tracks) = crate::spotify::fetch_playlist_tracks(&client, &playlist_id)
        .await
        .map_err(|e| format!("Failed to fetch tracks: {}", e))?;

    let mut tracks = fetched_tracks;
    let original_uris: Vec<String> = tracks.iter().map(|t| t.uri.clone()).collect();

    println!("  Fetched {} tracks", tracks.len());

    // 2. Create Backup & History Entry (Snapshot of state BEFORE change)
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_filename = format!("{}_{}.json", sanitize_filename(&pl_name), timestamp);
    let backup_path = get_backup_dir().join(&backup_filename);

    let backup_tracks: Vec<serde_json::Value> = tracks
        .iter()
        .map(|t| serde_json::to_value(t).unwrap())
        .collect();

    let backup_data = serde_json::json!({
        "playlist_id": playlist_id,
        "playlist_name": pl_name,
        "backup_time": timestamp,
        "tracks": backup_tracks
    });

    if let Ok(json) = serde_json::to_string_pretty(&backup_data) {
        fs::write(&backup_path, json).ok();
    }

    // Log History
    let action_desc = format!(
        "Applied {} changes ({} ignored)",
        approved_changes.len(),
        rejected_changes.len()
    );
    let entry = HistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        playlist_name: pl_name.clone(),
        playlist_id: playlist_id.clone(),
        action: action_desc,
        time: chrono::Local::now().format("%H:%M:%S").to_string(),
        backup_file: backup_filename,
        changes: Some(approved_changes.clone()),
        ignored: Some(rejected_changes.clone()),
        dynamic_config_backup: None,
    };

    // LOCK HISTORY ACCESS
    {
        let _lock = state.history_lock.lock().unwrap();

        // Safety logic: try to read, if fail, assume empty or error (but we propagate error now)
        // If read fails, WE DO NOT WRITE, to avoid overwriting with empty list if file is just locked or weird.
        // Wait, if we have the mutex, we shouldn't have file contention from OUR app.
        // But if read fails for other reasons, we probably shouldn't blindly overwrite.

        let mut hist = match get_history() {
            Ok(h) => h,
            Err(_) => Vec::new(), // If file missing or corrupted, start fresh? Or Error?
                                  // User wants PERSISTENCE. If read fails, and we write [entry], we lose old history.
                                  // BUT standard get_history() returns empty Vec if file doesn't exist.
                                  // If it exists but fails to read (e.g. valid lock but permission error?), we risk data loss.
                                  // Better to fallback to reading direct file if `get_history` (which is a command) does weird stuff?
                                  // `get_history` is just a function wrapper now.
                                  // Let's use the same logic as before but inside the lock.
        };

        // Actually, let's look at get_history implementation.
        // It's in commands.rs. It just reads the file.
        // Re-implementing read here inside lock to be safe/atomic?
        // Or just trust get_history?
        // Let's just call get_history but handle the result carefully.

        // Re-read history safely
        let history_path = get_history_path();
        if history_path.exists() {
            match fs::read_to_string(&history_path) {
                Ok(content) => {
                    match serde_json::from_str::<Vec<HistoryEntry>>(&content) {
                        Ok(h) => hist = h,
                        Err(_) => {} // Corrupt file? Append to new?
                    }
                }
                Err(e) => return Err(format!("Failed to read history file: {}", e)),
            }
        }

        hist.push(entry);
        if let Ok(json) = serde_json::to_string_pretty(&hist) {
            fs::write(&history_path, json)
                .map_err(|e| format!("Failed to write history: {}", e))?;
        }
    }

    // 3. Apply Removals
    // Filter out tracks that match the URI of any "duplicate" change in approved_changes
    let removal_uris: Vec<String> = approved_changes
        .iter()
        .filter(|c| c.change_type == "duplicate")
        .map(|c| c.track_uri.clone())
        .collect();

    if !removal_uris.is_empty() {
        let initial_count = tracks.len();
        // We only remove ONE instance per approved change.
        // Since `remove_duplicates` logic paired unique duplicates to specific indices/items,
        // we can assume the URIs are sufficient if we treat them carefully.
        // But wait, if a track is in the playlist twice, it has the same URI.
        // The `ReviewChange` should ideally handle instance specificity, but standard Duplicate Removal usually removes *all* extras.
        // Our logic finds *specific* items to remove.

        // Simpler approach: Filter out tracks where URI is in removal list.
        // But this removes ALL duplicates of that song.
        // If the user bad duplicates A and A, and wanted to keep one A, and our logic said "Remove one A", and user approved...
        // ...then "Remove one A" maps to URI(A).
        // If we filter, we remove Both A's.
        // We need to implement removal by *Count*.

        // Count how many times each URI is approved for removal
        let mut removal_counts = std::collections::HashMap::new();
        for uri in &removal_uris {
            *removal_counts.entry(uri.clone()).or_insert(0) += 1;
        }

        tracks.retain(|t| {
            if let Some(count) = removal_counts.get_mut(&t.uri) {
                if *count > 0 {
                    *count -= 1;
                    return false; // Remove this instance
                }
            }
            true // Keep
        });

        println!(
            "  Removed {} tracks (duplicates)",
            initial_count - tracks.len()
        );
    }

    // 4. Apply Replacements (New Logic)
    let mut replacements: Vec<ReviewChange> = approved_changes
        .iter()
        .filter(|c| c.change_type == "replace")
        .cloned()
        .collect();

    if !replacements.is_empty() {
        println!("  Applying {} replacements...", replacements.len());
        for track in tracks.iter_mut() {
            // Find a matching replacement request
            // We match strictly on metadata since that's what we saved
            if let Some(pos) = replacements.iter().position(|r| {
                r.rem_title.as_deref() == Some(&track.name)
                    && r.rem_artist.as_deref() == Some(&track.artist_names)
                    && r.rem_date.as_deref() == Some(&track.release_date)
            }) {
                let rep = replacements.remove(pos);

                // Update ID and URI (CRITICAL for Spotify update)
                // track_uri from rspotify is usually "spotify:track:ID"
                if let Some(id_part) = rep.track_uri.strip_prefix("spotify:track:") {
                    track.id = id_part.to_string();
                } else {
                    track.id = rep.track_uri.clone();
                }
                track.uri = rep.track_uri.clone();

                // Update Metadata (for Sorting)
                if let Some(val) = rep.new_title {
                    track.name = val;
                }
                if let Some(val) = rep.new_artist {
                    track.artist_names = val;
                }
                if let Some(val) = rep.new_album {
                    track.album_name = val;
                }
                if let Some(val) = rep.new_date {
                    track.release_date = val;
                }

                println!("  Replaced track with {}", track.uri);
            }
        }
    }

    // 5. Apply Sort
    if sort_enabled && !sort_rules.is_empty() {
        println!(
            "  Sorting {} tracks with {} rules...",
            tracks.len(),
            sort_rules.len()
        );
        for (i, rule) in sort_rules.iter().enumerate() {
            println!(
                "    Rule {}: {} ({})",
                i + 1,
                rule.criteria,
                if rule.descending { "DESC" } else { "ASC" }
            );
        }

        tracks = sort_tracks(tracks, &sort_rules);
        println!("  Sorted items successfully.");
    }

    // 5. Update Spotify
    let track_uris: Vec<String> = tracks.iter().map(|t| t.uri.clone()).collect();
    crate::spotify::update_playlist_items(&client, &playlist_id, track_uris, Some(original_uris))
        .await?;

    // 6. Update Cache with Sorted Tracks (Immediate Reflection)
    // We update the local cache so the UI reflects the changes instantly without a full scan
    {
        let mut path = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
        path.push("Spotify Sorter");
        path.push("spotify_cache.json");

        let mut cache = if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                serde_json::from_str::<crate::spotify::PlaylistCache>(&content).unwrap_or_default()
            } else {
                std::collections::HashMap::new()
            }
        } else {
            std::collections::HashMap::new()
        };

        // We use a dummy snapshot ID here because we just updated it, but don't have the new one from Spotify yet.
        // However, updating the tracks allows the UI to show the correct order immediately.
        // The next scan will fix the snapshot ID.
        cache.insert(
            playlist_id.clone(),
            crate::spotify::PlaylistCacheEntry {
                snapshot_id: "updated_locally".to_string(),
                tracks: tracks,
                timestamp: chrono::Utc::now().timestamp(),
            },
        );

        if let Ok(json) = serde_json::to_string(&cache) {
            let _ = fs::write(path, json);
            println!(
                "  Updated cache for {} with sorted local state",
                playlist_id
            );
        }
    }

    Ok("Playlist updated successfully".to_string())
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

#[derive(Clone, serde::Serialize)]
struct BackupProgress {
    current: usize,
    total: usize,
    playlist_name: String,
}

#[tauri::command]
pub async fn create_backup(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    playlist_ids: Vec<String>,
) -> Result<String, String> {
    use tauri::Emitter; // Ensure Emitter trait is available

    let backup_dir = get_backup_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();

    let client = {
        let spotify = state.spotify.lock().unwrap();
        (spotify.client.clone(), spotify.playlists.clone())
    };

    let (client, playlists) = client;
    let client = client.ok_or("Not authenticated")?;

    let selected_playlists: Vec<&Playlist> = playlists
        .iter()
        .filter(|p| playlist_ids.contains(&p.id))
        .collect();

    let total = selected_playlists.len();

    for (i, playlist) in selected_playlists.iter().enumerate() {
        // Emit progress
        let _ = app.emit(
            "backup-progress",
            BackupProgress {
                current: i + 1,
                total,
                playlist_name: playlist.name.clone(),
            },
        );

        // Fetch tracks for backup (using shared logic to ensure local tracks are included)
        let (_, pl_tracks) = match fetch_playlist_tracks(&client, &playlist.id).await {
            Ok(res) => res,
            Err(e) => {
                println!(
                    "Failed to fetch tracks for backup of {}: {}",
                    playlist.name, e
                );
                continue;
            }
        };

        let tracks: Vec<serde_json::Value> = pl_tracks
            .iter()
            .map(|t| serde_json::to_value(t).unwrap())
            .collect();

        let filename = format!("{}_{}.json", sanitize_filename(&playlist.name), timestamp);
        let filepath = backup_dir.join(&filename);

        let backup_data = serde_json::json!({
            "playlist_id": playlist.id,
            "playlist_name": playlist.name,
            "backup_time": timestamp,
            "track_count": tracks.len(),
            "tracks": tracks
        });

        fs::write(
            &filepath,
            serde_json::to_string_pretty(&backup_data).unwrap(),
        )
        .map_err(|e| format!("Failed to write backup: {}", e))?;

        println!("Backed up {} with {} tracks", playlist.name, tracks.len());
    }

    Ok(format!(
        "Created backup for {} playlists in {:?}",
        selected_playlists.len(),
        backup_dir
    ))
}

#[tauri::command]
pub fn get_backups() -> Result<Vec<String>, String> {
    let backup_dir = get_backup_dir();
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    if let Ok(entries) = fs::read_dir(backup_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    backups.push(name.to_string());
                }
            }
        }
    }

    // Sort newest first (by modification time usually, but here by name is prob enough if name has timestamp.
    // Actually typically we want modification time or filename sort (descending).
    // Filename format is Name_TIMESTAMP.json, so descending alpha sort works for timestamp if names are same.
    backups.sort_by(|a, b| b.cmp(a));

    Ok(backups)
}

#[tauri::command]
pub async fn restore_from_file(
    state: State<'_, AppState>,
    filename: String,
) -> Result<String, String> {
    let mut backup_path = get_backup_dir();
    backup_path.push(&filename);

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {:?}", filename));
    }

    let content =
        fs::read_to_string(&backup_path).map_err(|e| format!("Failed to read backup: {}", e))?;
    let backup_data: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid backup JSON: {}", e))?;

    let playlist_id = backup_data["playlist_id"]
        .as_str()
        .ok_or("Backup missing playlist ID")?;
    let playlist_name = backup_data["playlist_name"]
        .as_str()
        .unwrap_or("Unknown Playlist");

    let tracks = backup_data["tracks"]
        .as_array()
        .ok_or("Backup contains no tracks list")?;

    println!("Restoring manual backup for: {}", playlist_name);

    // Get Spotify Client
    let client = {
        let spotify = state.spotify.lock().unwrap();
        spotify.client.clone()
    }
    .ok_or("Not authenticated")?;

    // Extract Track IDs
    let mut track_ids = Vec::new();
    for t in tracks {
        if let Some(id) = t["id"].as_str() {
            if let Ok(tid) = rspotify::model::TrackId::from_id(id) {
                track_ids.push(tid);
            }
        }
    }

    // Restore
    let pid =
        PlaylistId::from_id(playlist_id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

    // Clear
    client
        .playlist_replace_items(pid.clone(), vec![])
        .await
        .map_err(|e| format!("Failed to clear playlist: {}", e))?;

    // Add in batches
    for chunk in track_ids.chunks(100) {
        let items: Vec<rspotify::model::PlayableId> = chunk
            .iter()
            .map(|id| rspotify::model::PlayableId::Track(id.clone()))
            .collect();
        client
            .playlist_add_items(pid.clone(), items, None)
            .await
            .map_err(|e| format!("Failed to restore tracks: {}", e))?;
    }

    Ok(format!("Restored '{}' from backup", playlist_name))
}

#[tauri::command]
pub fn open_backup_folder() -> Result<(), String> {
    let backup_dir = get_backup_dir();
    open::that(&backup_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_history() -> Result<Vec<HistoryEntry>, String> {
    let path = get_history_path();
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let history: Vec<HistoryEntry> = serde_json::from_str(&content).unwrap_or_default();
    // Return reversed (newest first)
    Ok(history.into_iter().rev().collect())
}

#[tauri::command]
pub fn delete_history_item(id: String) -> Result<(), String> {
    let path = get_history_path();
    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut history: Vec<HistoryEntry> = serde_json::from_str(&content).unwrap_or_default();

    let initial_len = history.len();
    history.retain(|entry| entry.id != id);

    if history.len() != initial_len {
        let json = serde_json::to_string_pretty(&history).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn clear_history() -> Result<(), String> {
    let path = get_history_path();
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_ignored_tracks() -> Result<Vec<IgnoredTrack>, String> {
    let path = get_ignored_tracks_path();
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let tracks: Vec<IgnoredTrack> = serde_json::from_str(&content).unwrap_or_default();
    Ok(tracks)
}

#[tauri::command]
pub async fn restore_snapshot(
    state: State<'_, AppState>,
    snapshot_id: String,
) -> Result<String, String> {
    // 1. Find history entry
    let history = get_history()?;
    let entry = history
        .iter()
        .find(|h| h.id == snapshot_id)
        .ok_or("Snapshot not found in history")?;

    // 1b. Check if it's a Dynamic Config restoration
    if let Some(config_json) = &entry.dynamic_config_backup {
        let config: DynamicPlaylistConfig = serde_json::from_str(config_json)
            .map_err(|e| format!("Failed to parse backup config: {}", e))?;

        save_dynamic_config(config)?;
        return Ok(format!(
            "Restored dynamic playlist '{}'",
            entry.playlist_name
        ));
    }

    println!("Restoring snapshot for playlist: {}", entry.playlist_name);

    // 2. Load backup
    let mut backup_path = get_backup_dir();
    backup_path.push(&entry.backup_file);

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {:?}", entry.backup_file));
    }

    let content =
        fs::read_to_string(&backup_path).map_err(|e| format!("Failed to read backup: {}", e))?;
    let backup_data: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid backup JSON: {}", e))?;

    let tracks = backup_data["tracks"]
        .as_array()
        .ok_or("Backup contains no tracks list")?;

    println!("Found {} tracks in backup", tracks.len());

    // 3. Get Spotify Client
    let client = {
        let spotify = state.spotify.lock().unwrap();
        spotify.client.clone()
    }
    .ok_or("Not authenticated")?;

    // 4. Extract Track IDs from backup
    let mut track_ids = Vec::new();
    for t in tracks {
        if let Some(id) = t["id"].as_str() {
            if let Ok(tid) = rspotify::model::TrackId::from_id(id) {
                track_ids.push(tid);
            }
        }
    }

    if track_ids.len() != tracks.len() {
        println!("Warning: Could not parse some track IDs from backup");
    }

    // 5. Restore to Spotify
    let pid = PlaylistId::from_id(&entry.playlist_id)
        .map_err(|e| format!("Invalid playlist ID: {}", e))?;

    // Clear
    client
        .playlist_replace_items(pid.clone(), vec![])
        .await
        .map_err(|e| format!("Failed to clear playlist: {}", e))?;

    // Add in batches
    for chunk in track_ids.chunks(100) {
        let items: Vec<rspotify::model::PlayableId> = chunk
            .iter()
            .map(|id| rspotify::model::PlayableId::Track(id.clone()))
            .collect();
        client
            .playlist_add_items(pid.clone(), items, None)
            .await
            .map_err(|e| format!("Failed to restore tracks: {}", e))?;
    }

    Ok(format!(
        "Restored {} to state from {}",
        entry.playlist_name, entry.time
    ))
}

#[tauri::command]
pub async fn remove_ignored_tracks(track_ids: Vec<String>) -> Result<(), String> {
    let path = get_ignored_tracks_path();
    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut tracks: Vec<IgnoredTrack> = serde_json::from_str(&content).unwrap_or_default();

    let initial_len = tracks.len();
    tracks.retain(|t| !track_ids.contains(&t.id));

    if tracks.len() != initial_len {
        let json = serde_json::to_string_pretty(&tracks).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn export_automation_config(config: AutomationConfig) -> Result<String, String> {
    let exports_dir = get_exports_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("automation_config_{}.json", timestamp);
    let filepath = exports_dir.join(&filename);

    let export_data = serde_json::json!({
        "sortEnabled": config.sort_enabled,
        "sortRules": config.sort_rules,
        "dupesEnabled": config.dupes_enabled,
        "dupePreference": config.dupe_preference,
        "versionEnabled": config.version_enabled,
        "versionPreference": config.version_preference,
        "playlistIds": config.playlist_ids,
        "exportTime": timestamp,
    });

    fs::write(
        &filepath,
        serde_json::to_string_pretty(&export_data).unwrap(),
    )
    .map_err(|e| format!("Failed to write config: {}", e))?;

    open::that(&exports_dir).ok();

    Ok(format!("Config exported to {:?}", filepath))
}

#[tauri::command]
pub async fn export_csv(
    state: State<'_, AppState>,
    playlist_ids: Vec<String>,
) -> Result<String, String> {
    let exports_dir = get_exports_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();

    let client = {
        let spotify = state.spotify.lock().unwrap();
        (spotify.client.clone(), spotify.playlists.clone())
    };

    let (client, playlists) = client;
    let client = client.ok_or("Not authenticated")?;

    let selected_playlists: Vec<&Playlist> = playlists
        .iter()
        .filter(|p| playlist_ids.contains(&p.id))
        .collect();

    for playlist in &selected_playlists {
        // Fetch tracks for export
        let (_, pl_tracks) = match fetch_playlist_tracks(&client, &playlist.id).await {
            Ok(res) => res,
            Err(e) => {
                println!(
                    "Failed to fetch tracks for export of {}: {}",
                    playlist.name, e
                );
                continue;
            }
        };

        let mut csv_lines = vec!["Track Name,Artist,Album,Release Date,Duration (ms)".to_string()];
        for app_track in pl_tracks {
            let line = format!(
                "\"{}\",\"{}\",\"{}\",\"{}\",{}",
                escape_csv(&app_track.name),
                escape_csv(&app_track.artist_names),
                escape_csv(&app_track.album_name),
                app_track.release_date,
                app_track.duration_ms
            );
            csv_lines.push(line);
        }

        let filename = format!("{}_{}.csv", sanitize_filename(&playlist.name), timestamp);
        let filepath = exports_dir.join(&filename);

        fs::write(&filepath, csv_lines.join("\n"))
            .map_err(|e| format!("Failed to write CSV: {}", e))?;

        println!(
            "Exported {} with {} tracks",
            playlist.name,
            csv_lines.len() - 1
        );
    }

    open::that(&exports_dir).ok();

    Ok(format!(
        "Exported {} playlists to CSV",
        selected_playlists.len()
    ))
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn escape_csv(s: &str) -> String {
    s.replace('"', "\"\"")
}

fn match_titles_relaxed(title1: &str, title2: &str) -> bool {
    let t1_lower = title1.to_lowercase();
    let t2_lower = title2.to_lowercase();

    // Special handling for "remix", "vip", "bootleg", "edit" keywords
    // These indicate fundamentally different versions
    let strict_keywords = ["remix", "vip", "bootleg", "edit"];

    for kw in strict_keywords {
        let h1 = t1_lower.contains(kw);
        let h2 = t2_lower.contains(kw);
        if h1 != h2 {
            // One is a remix/vip/etc and the other isn't -> different versions
            return false;
        }
    }

    // Clean both titles
    let t1 = clean_title(title1);
    let t2 = clean_title(title2);

    // If they match exactly, we're good
    if t1 == t2 {
        return true;
    }

    // Try stripping "original" and "original mix" from both and compare base titles
    let t1_base = strip_original_suffix(&t1);
    let t2_base = strip_original_suffix(&t2);

    t1_base == t2_base
}

/// Strips common "original" suffixes from a cleaned title
fn strip_original_suffix(s: &str) -> String {
    let s = s.trim();
    // Order matters - check longer patterns first
    let suffixes = [" original mix", " original"];
    let mut result = s.to_string();
    for suffix in suffixes {
        if result.ends_with(suffix) {
            result = result[..result.len() - suffix.len()].to_string();
            break;
        }
    }
    result.trim().to_string()
}

fn clean_title(s: &str) -> String {
    // Replace common separators with spaces
    let s = s.replace(['-', '(', ')', '[', ']', '_'], " ");

    // Remove punctuation and extra whitespace, lowercase
    s.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

// ========================
// Dynamic Playlists Commands
// ========================

use crate::dynamic::{
    load_dynamic_configs, save_dynamic_configs, update_dynamic_playlist, DynamicPlaylistConfig,
};

/// Get all saved dynamic playlist configurations
#[tauri::command]
pub fn get_dynamic_configs() -> Result<Vec<DynamicPlaylistConfig>, String> {
    Ok(load_dynamic_configs())
}

/// Save a new or updated dynamic playlist configuration
#[tauri::command]
pub fn save_dynamic_config(config: DynamicPlaylistConfig) -> Result<(), String> {
    let mut configs = load_dynamic_configs();

    // Update existing or add new
    if let Some(pos) = configs.iter().position(|c| c.id == config.id) {
        configs[pos] = config;
    } else {
        configs.push(config);
    }

    save_dynamic_configs(&configs)
}

/// Delete a dynamic playlist configuration by ID
#[tauri::command]
pub fn delete_dynamic_config(id: String) -> Result<(), String> {
    let mut configs = load_dynamic_configs();

    // Find the config to backup before deleting
    let config_idx = configs.iter().position(|c| c.id == id);

    if let Some(idx) = config_idx {
        let config = &configs[idx];

        // Log to history
        let entry = HistoryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            playlist_name: config.name.clone(),
            playlist_id: "dynamic_config".to_string(), // Virtual ID
            action: format!("Deleted dynamic playlist: {}", config.name),
            time: chrono::Local::now().format("%H:%M:%S").to_string(),
            backup_file: "".to_string(), // No file backup for this, data is inline
            changes: None,
            ignored: None,
            dynamic_config_backup: Some(serde_json::to_string(&config).unwrap_or_default()),
        };

        // Reuse get/save logic from apply_changes usually, but here we do it inline for simplicity
        // or helper function if available. Let's just read/write.
        let hist_path = get_history_path();
        let mut hist_entries: Vec<HistoryEntry> = if hist_path.exists() {
            serde_json::from_str(&fs::read_to_string(&hist_path).unwrap_or_default())
                .unwrap_or_default()
        } else {
            Vec::new()
        };
        hist_entries.push(entry);
        fs::write(
            hist_path,
            serde_json::to_string_pretty(&hist_entries).unwrap_or_default(),
        )
        .ok();

        // Now delete
        configs.remove(idx);
        save_dynamic_configs(&configs)?;
    }

    Ok(())
}

/// Run a single dynamic playlist update
/// Run a single dynamic playlist update
#[tauri::command]
pub async fn run_dynamic_update(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    config_id: String,
) -> Result<String, String> {
    run_dynamic_playlist_logic(&app, &state, &config_id).await
}

pub async fn run_dynamic_playlist_logic(
    _app: &tauri::AppHandle,
    state: &State<'_, AppState>,
    config_id: &String,
) -> Result<String, String> {
    let configs = load_dynamic_configs();
    let config = configs
        .into_iter()
        .find(|c| c.id == *config_id)
        .ok_or("Config not found")?;

    // Clone the spotify client before releasing the lock
    let spotify = {
        let spotify_state = state.spotify.lock().map_err(|e| e.to_string())?;
        spotify_state
            .client
            .as_ref()
            .ok_or("Not authenticated")?
            .clone()
    };

    match update_dynamic_playlist(&spotify, &config).await {
        Ok(count) => Ok(format!(
            "Updated playlist '{}': {} tracks",
            config.name, count
        )),
        Err(e) => Err(format!("Failed to update '{}': {}", config.name, e)),
    }
}

/// Run all dynamic playlist updates (for automation)
#[tauri::command]
pub async fn run_all_dynamic_updates(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let configs = load_dynamic_configs();

    // Clone the spotify client before releasing the lock
    let spotify = {
        let spotify_state = state.spotify.lock().map_err(|e| e.to_string())?;
        spotify_state
            .client
            .as_ref()
            .ok_or("Not authenticated")?
            .clone()
    };

    let mut results = Vec::new();

    for config in &configs {
        match update_dynamic_playlist(&spotify, config).await {
            Ok(count) => results.push(format!("{}: {} tracks", config.name, count)),
            Err(e) => results.push(format!("{}: Error - {}", config.name, e)),
        }
    }

    Ok(results)
}

// ============ COMPARE PLAYLISTS ============

/// Duplicate track found across playlists
#[derive(Serialize, Clone)]
pub struct DuplicateTrack {
    pub track_id: String,
    pub track_uri: String,
    pub name: String,
    pub artist: String,
    pub found_in_playlists: Vec<String>, // playlist IDs where this track appears
}

/// Result of comparing playlists
#[derive(Serialize)]
pub struct CompareResult {
    pub duplicates: Vec<DuplicateTrack>,
    pub playlists_compared: usize,
}

/// Compare selected playlists to find duplicate tracks
#[tauri::command]
pub async fn compare_playlists(
    state: State<'_, AppState>,
    playlist_ids: Vec<String>,
) -> Result<CompareResult, String> {
    if playlist_ids.len() < 2 {
        return Err("Please select at least 2 playlists to compare".to_string());
    }

    // No limit - rate limiting handles API constraints

    let (client, playlists) = {
        let spotify = state.spotify.lock().unwrap();
        (spotify.client.clone(), spotify.playlists.clone())
    };

    let client = client.ok_or("Not authenticated")?;

    // Map of track URI -> (track info, list of playlist IDs)
    let mut track_map: std::collections::HashMap<String, (String, String, String, Vec<String>)> =
        std::collections::HashMap::new();

    for (idx, playlist_id) in playlist_ids.iter().enumerate() {
        let playlist_name = playlists
            .iter()
            .find(|p| &p.id == playlist_id)
            .map(|p| p.name.clone())
            .unwrap_or_else(|| playlist_id.clone());

        println!(
            "Comparing playlist {}/{}: {}",
            idx + 1,
            playlist_ids.len(),
            playlist_name
        );

        let pid =
            PlaylistId::from_id(playlist_id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

        let mut offset = 0;

        loop {
            let page = client
                .playlist_items_manual(pid.clone(), None, None, Some(100), Some(offset))
                .await
                .map_err(|e| format!("Failed to fetch tracks from {}: {}", playlist_name, e))?;

            for item in &page.items {
                if let Some(PlayableItem::Track(track)) = &item.track {
                    if let Some(app_track) = AppTrack::from_spotify(track) {
                        let uri = app_track.uri.clone();
                        let entry = track_map.entry(uri.clone()).or_insert_with(|| {
                            (
                                app_track.id.clone(),
                                app_track.name.clone(),
                                app_track.artist_names.clone(),
                                Vec::new(),
                            )
                        });
                        if !entry.3.contains(&playlist_name) {
                            entry.3.push(playlist_name.clone());
                        }
                    }
                }
            }

            if page.next.is_none() {
                break;
            }
            offset += 100;

            // Small delay between pages to avoid rate limiting
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        }

        // Small delay between playlists
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    // Filter to only tracks that appear in 2+ playlists
    let duplicates: Vec<DuplicateTrack> = track_map
        .into_iter()
        .filter(|(_, (_, _, _, playlist_names))| playlist_names.len() > 1)
        .map(|(uri, (id, name, artist, playlist_names))| DuplicateTrack {
            track_id: id,
            track_uri: uri,
            name,
            artist,
            found_in_playlists: playlist_names,
        })
        .collect();

    println!("Compare complete: found {} duplicates", duplicates.len());

    Ok(CompareResult {
        duplicates,
        playlists_compared: playlist_ids.len(),
    })
}

/// Remove a track from a specific playlist
#[tauri::command]
pub async fn remove_track_from_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    track_uri: String,
) -> Result<String, String> {
    let client = {
        let spotify = state.spotify.lock().unwrap();
        spotify.client.clone()
    };

    let client = client.ok_or("Not authenticated")?;

    let pid =
        PlaylistId::from_id(&playlist_id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

    // Create track ID for removal
    let track_id = rspotify::model::TrackId::from_uri(&track_uri)
        .map_err(|e| format!("Invalid track URI: {}", e))?;

    let items = vec![rspotify::model::PlayableId::Track(track_id)];

    client
        .playlist_remove_all_occurrences_of_items(pid, items, None)
        .await
        .map_err(|e| format!("Failed to remove track: {}", e))?;

    Ok("Track removed".to_string())
}

// ============ M3U EXPORT ============

use walkdir::WalkDir;

/// Local track metadata
#[derive(Clone)]
struct LocalTrack {
    path: String,
    artist: String,
    title: String,
}

/// Normalize string for matching (lowercase, remove special chars)
fn normalize_for_match(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Scan music folder for audio files
fn scan_music_folder(folder: &str) -> Vec<LocalTrack> {
    let extensions = ["mp3", "flac", "wav", "m4a", "aac", "ogg", "wma"];
    let mut tracks = Vec::new();

    for entry in WalkDir::new(folder)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        if let Some(ext) = path.extension() {
            if extensions.contains(&ext.to_string_lossy().to_lowercase().as_str()) {
                // Try to parse filename as "Artist - Title"
                if let Some(stem) = path.file_stem() {
                    let filename = stem.to_string_lossy();
                    let parts: Vec<&str> = filename.splitn(2, " - ").collect();
                    let (artist, title) = if parts.len() == 2 {
                        (parts[0].trim().to_string(), parts[1].trim().to_string())
                    } else {
                        ("".to_string(), filename.to_string())
                    };

                    tracks.push(LocalTrack {
                        path: path.to_string_lossy().to_string(),
                        artist,
                        title,
                    });
                }
            }
        }
    }

    tracks
}

/// Calculate similarity between two strings (0.0 to 1.0)
fn string_similarity(a: &str, b: &str) -> f64 {
    let a_norm = normalize_for_match(a);
    let b_norm = normalize_for_match(b);

    if a_norm == b_norm {
        return 1.0;
    }

    // Simple containment check
    if a_norm.contains(&b_norm) || b_norm.contains(&a_norm) {
        return 0.8;
    }

    // Count matching words
    let a_words: std::collections::HashSet<_> = a_norm.split_whitespace().collect();
    let b_words: std::collections::HashSet<_> = b_norm.split_whitespace().collect();

    let intersection = a_words.intersection(&b_words).count();
    let union = a_words.union(&b_words).count();

    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}

/// Find best matching local track
fn find_best_match<'a>(
    artist: &str,
    title: &str,
    local_tracks: &'a [LocalTrack],
    threshold: f64,
) -> Option<&'a LocalTrack> {
    let mut best_match: Option<&LocalTrack> = None;
    let mut best_score = threshold;

    for track in local_tracks {
        let artist_sim = string_similarity(artist, &track.artist);
        let title_sim = string_similarity(title, &track.title);
        let combined = (artist_sim * 0.4) + (title_sim * 0.6);

        if combined > best_score {
            best_score = combined;
            best_match = Some(track);
        }
    }

    best_match
}

/// Result of M3U export
#[derive(Serialize)]
pub struct M3uExportResult {
    pub total_tracks: usize,
    pub matched_tracks: usize,
    pub unmatched_tracks: usize,
    pub output_path: String,
}

/// Export playlist to M3U with local file matching
#[tauri::command]
pub async fn export_m3u(
    state: State<'_, AppState>,
    playlist_ids: Vec<String>,
    music_folder: String,
    output_folder: Option<String>,
    include_unmatched: bool,
) -> Result<M3uExportResult, String> {
    if playlist_ids.is_empty() {
        return Err("Please select playlists to export".to_string());
    }

    // Scan local music files
    println!("Scanning music folder: {}", music_folder);
    let local_tracks = scan_music_folder(&music_folder);
    println!("Found {} local audio files", local_tracks.len());

    let (client, playlists) = {
        let spotify = state.spotify.lock().unwrap();
        (spotify.client.clone(), spotify.playlists.clone())
    };

    let client = client.ok_or("Not authenticated")?;

    let exports_dir = match &output_folder {
        Some(folder) if !folder.is_empty() => PathBuf::from(folder),
        _ => get_exports_dir(),
    };
    fs::create_dir_all(&exports_dir).ok();

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let mut total_tracks = 0;
    let mut total_matched = 0;
    let mut total_unmatched = 0;
    let mut last_output = String::new();

    // Build lookup map
    let local_map: std::collections::HashMap<String, &LocalTrack> = local_tracks
        .iter()
        .map(|t| {
            let key = format!(
                "{}|{}",
                normalize_for_match(&t.artist),
                normalize_for_match(&t.title)
            );
            (key, t)
        })
        .collect();

    for playlist_id in &playlist_ids {
        let playlist = playlists.iter().find(|p| p.id == *playlist_id);
        let playlist_name = playlist.map(|p| p.name.as_str()).unwrap_or("Unknown");

        let pid =
            PlaylistId::from_id(playlist_id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

        let mut m3u_lines = vec![
            "#EXTM3U".to_string(),
            format!("# Playlist: {}", playlist_name),
            format!(
                "# Exported from Spotify Sorter - {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
            ),
            "".to_string(),
        ];

        let mut offset = 0;
        let mut matched = 0;
        let mut unmatched = 0;

        loop {
            let page = client
                .playlist_items_manual(pid.clone(), None, None, Some(100), Some(offset))
                .await
                .map_err(|e| format!("Failed to fetch tracks: {}", e))?;

            for item in &page.items {
                if let Some(PlayableItem::Track(track)) = &item.track {
                    if let Some(app_track) = AppTrack::from_spotify(track) {
                        total_tracks += 1;
                        let first_artist = app_track
                            .artist_names
                            .split(',')
                            .next()
                            .unwrap_or("")
                            .trim();

                        let lookup_key = format!(
                            "{}|{}",
                            normalize_for_match(first_artist),
                            normalize_for_match(&app_track.name)
                        );

                        // Try exact match first, then fuzzy
                        let local_match = local_map.get(&lookup_key).copied().or_else(|| {
                            find_best_match(first_artist, &app_track.name, &local_tracks, 0.6)
                        });

                        if let Some(local) = local_match {
                            m3u_lines.push(format!(
                                "#EXTINF:{},{} - {}",
                                app_track.duration_ms / 1000,
                                first_artist,
                                app_track.name
                            ));
                            m3u_lines.push(local.path.clone());
                            matched += 1;
                            total_matched += 1;
                        } else if include_unmatched {
                            m3u_lines.push(format!(
                                "# UNMATCHED: {} - {}",
                                first_artist, app_track.name
                            ));
                            unmatched += 1;
                            total_unmatched += 1;
                        } else {
                            unmatched += 1;
                            total_unmatched += 1;
                        }
                    }
                }
            }

            if page.next.is_none() {
                break;
            }
            offset += 100;
        }

        // Write M3U file
        let filename = format!("{}_{}.m3u", sanitize_filename(playlist_name), timestamp);
        let filepath = exports_dir.join(&filename);

        fs::write(&filepath, m3u_lines.join("\n"))
            .map_err(|e| format!("Failed to write M3U: {}", e))?;

        last_output = filepath.to_string_lossy().to_string();
        println!(
            "Exported {} with {} matched, {} unmatched",
            playlist_name, matched, unmatched
        );
    }

    open::that(&exports_dir).ok();

    Ok(M3uExportResult {
        total_tracks,
        matched_tracks: total_matched,
        unmatched_tracks: total_unmatched,
        output_path: last_output,
    })
}

// ========================
// Desktop Schedule Commands
// ========================

#[tauri::command]
pub async fn get_desktop_schedules() -> Result<Vec<crate::scheduler::DesktopSchedule>, String> {
    Ok(crate::scheduler::load_schedules())
}

#[tauri::command]
pub async fn save_desktop_schedule(
    schedule: crate::scheduler::DesktopSchedule,
) -> Result<(), String> {
    let mut schedules = crate::scheduler::load_schedules();

    // Update or Add
    if let Some(pos) = schedules.iter().position(|s| s.id == schedule.id) {
        schedules[pos] = schedule;
    } else {
        schedules.push(schedule);
    }

    crate::scheduler::save_schedules(&schedules);
    Ok(())
}

#[tauri::command]
pub async fn delete_desktop_schedule(id: String) -> Result<(), String> {
    let mut schedules = crate::scheduler::load_schedules();
    schedules.retain(|s| s.id != id);
    crate::scheduler::save_schedules(&schedules);
    Ok(())
}
