use rspotify::{
    model::SimplifiedPlaylist, prelude::*, scopes, AuthCodeSpotify, Credentials, OAuth,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const REDIRECT_URI: &str = "http://127.0.0.1:27196";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub owner: String,
    pub editable: bool,
    pub collaborative: bool,
    #[serde(rename = "isPublic")]
    pub is_public: bool,
}

impl Playlist {
    pub fn from_simplified(item: &SimplifiedPlaylist, user_id: &str) -> Self {
        let owner_id = item.owner.id.to_string();
        let can_edit = owner_id == user_id || item.collaborative;

        Playlist {
            id: item.id.id().to_string(), // Use .id() to get just the ID part, not the full URI
            name: item.name.clone(),
            owner: owner_id,
            editable: can_edit,
            collaborative: item.collaborative,
            is_public: item.public.unwrap_or(false),
        }
    }
}

#[derive(Default)]
pub struct SpotifyState {
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub user_id: Option<String>,
    pub playlists: Vec<Playlist>,
    pub client: Option<AuthCodeSpotify>,
}

impl SpotifyState {
    pub fn is_authenticated(&self) -> bool {
        self.client.is_some()
    }

    pub fn get_scopes() -> HashSet<String> {
        scopes!(
            "playlist-read-private",
            "playlist-read-collaborative",
            "playlist-modify-public",
            "playlist-modify-private",
            "user-library-read"
        )
    }
}

pub async fn do_spotify_auth(
    client_id: String,
    client_secret: String,
) -> Result<(AuthCodeSpotify, String, Vec<Playlist>), String> {
    let creds = Credentials::new(&client_id, &client_secret);
    let oauth = OAuth {
        redirect_uri: REDIRECT_URI.to_string(),
        scopes: SpotifyState::get_scopes(),
        ..Default::default()
    };

    let spotify = AuthCodeSpotify::new(creds, oauth);

    // Get the authorization URL
    let auth_url = spotify
        .get_authorize_url(false)
        .map_err(|e| format!("Failed to get auth URL: {}", e))?;

    // Open browser for user to authorize
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    // Start a simple HTTP server to receive the callback
    let code = wait_for_callback().await?;

    // Exchange code for token
    spotify
        .request_token(&code)
        .await
        .map_err(|e| format!("Failed to get token: {}", e))?;

    // Get user info
    let user = spotify
        .current_user()
        .await
        .map_err(|e| format!("Failed to get user: {}", e))?;
    let user_id = user.id.to_string();

    // Fetch all playlists
    let playlists = fetch_all_playlists(&spotify, &user_id).await?;

    Ok((spotify, user_id, playlists))
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PlaylistsCacheEntry {
    pub user_id: String,
    pub playlists: Vec<Playlist>,
    pub timestamp: i64,
}

pub async fn fetch_all_playlists(
    spotify: &AuthCodeSpotify,
    user_id: &str,
) -> Result<Vec<Playlist>, String> {
    use std::fs;
    let mut path = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("Spotify Sorter");
    fs::create_dir_all(&path).ok();
    path.push("playlists_cache.json");

    // 1. Check Cache
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(cache) = serde_json::from_str::<PlaylistsCacheEntry>(&content) {
                let now = chrono::Utc::now().timestamp();
                // 60 minute TTL
                if cache.user_id == user_id && (now - cache.timestamp) < 3600 {
                    println!(
                        "Playlist list Cache HIT: Returning {} playlists",
                        cache.playlists.len()
                    );
                    return Ok(cache.playlists);
                }
            }
        }
    }

    println!("Playlist list Cache MISS. Fetching from API...");

    let mut playlists = Vec::new();
    let mut offset = 0;
    let mut seen_ids = std::collections::HashSet::new();

    loop {
        let page = spotify
            .current_user_playlists_manual(Some(50), Some(offset))
            .await
            .map_err(|e| format!("Failed to get playlists: {}", e))?;

        for item in &page.items {
            // Deduplicate by ID
            if !seen_ids.contains(&item.id.id().to_string()) {
                seen_ids.insert(item.id.id().to_string());
                playlists.push(Playlist::from_simplified(item, user_id));
            }
        }

        if page.next.is_none() || page.items.is_empty() {
            break;
        }
        offset += 50;
    }

    // 2. Save Cache
    let cache_entry = PlaylistsCacheEntry {
        user_id: user_id.to_string(),
        playlists: playlists.clone(),
        timestamp: chrono::Utc::now().timestamp(),
    };

    if let Ok(json) = serde_json::to_string(&cache_entry) {
        let _ = fs::write(path, json);
    }

    Ok(playlists)
}

async fn wait_for_callback() -> Result<String, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:27196").await.map_err(|e| {
        format!(
            "Failed to start callback server: {}. Make sure port 27196 is not in use.",
            e
        )
    })?;

    println!("Waiting for Spotify callback on http://127.0.0.1:27196/callback ...");

    let (mut socket, _) = listener
        .accept()
        .await
        .map_err(|e| format!("Failed to accept connection: {}", e))?;

    let mut buffer = [0u8; 4096];
    let n = socket
        .read(&mut buffer)
        .await
        .map_err(|e| format!("Failed to read request: {}", e))?;

    let request = String::from_utf8_lossy(&buffer[..n]);

    // Extract code from URL like: GET /callback?code=XXXX HTTP/1.1
    let code = request
        .lines()
        .next()
        .and_then(|line| {
            // Parse: GET /callback?code=XXX&state=YYY HTTP/1.1
            line.split_whitespace().nth(1)
        })
        .and_then(|path| {
            // Parse: /callback?code=XXX&state=YYY
            if let Some(query_start) = path.find('?') {
                let query = &path[query_start + 1..];
                for param in query.split('&') {
                    if let Some(code) = param.strip_prefix("code=") {
                        return Some(code.to_string());
                    }
                }
            }
            None
        })
        .ok_or_else(|| "No authorization code in callback URL".to_string())?;

    // Send success response
    let response = r#"HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Connection: close

<!DOCTYPE html>
<html>
<head>
    <title>Spotify Sorter - Connected!</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #121212; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .container { text-align: center; }
        h1 { color: #1DB954; margin-bottom: 10px; }
        p { color: #b3b3b3; }
    </style>
</head>
<body>
    <div class="container">
        <h1>✓ Connected to Spotify!</h1>
        <p>You can close this window and return to Spotify Sorter.</p>
    </div>
</body>
</html>"#;

    socket.write_all(response.as_bytes()).await.ok();
    socket.flush().await.ok();

    println!("Authorization code received!");

    Ok(code)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PlaylistCacheEntry {
    pub snapshot_id: String,
    pub tracks: Vec<crate::logic::AppTrack>,
    pub timestamp: i64,
}

pub type PlaylistCache = std::collections::HashMap<String, PlaylistCacheEntry>;

pub async fn fetch_playlist_tracks(
    client: &AuthCodeSpotify,
    playlist_id: &str,
) -> Result<(String, Vec<crate::logic::AppTrack>), String> {
    use crate::logic::AppTrack;
    use rspotify::model::PlaylistId;
    use std::fs;

    // 1. Get Playlist Metadata (snapshot_id)
    let pid = PlaylistId::from_id(playlist_id).map_err(|e| format!("Invalid ID: {}", e))?;

    let playlist = client
        .playlist(pid.clone(), None, None)
        .await
        .map_err(|e| format!("Failed to fetch playlist meta: {}", e))?;

    let current_snapshot_id = playlist.snapshot_id;
    let playlist_name = playlist.name;

    // 2. Check Cache
    let mut path = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("Spotify Sorter");
    fs::create_dir_all(&path).ok();
    path.push("spotify_cache.json");

    let mut cache: PlaylistCache = if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };

    if let Some(entry) = cache.get(playlist_id) {
        if entry.snapshot_id == current_snapshot_id {
            println!("Cache HIT for {}", playlist_id);
            return Ok((playlist_name, entry.tracks.clone()));
        }
    }

    println!("Cache MISS for {}", playlist_id);

    // 3. Fetch Tracks (Pagination)
    let mut tracks: Vec<AppTrack> = Vec::new();
    let mut offset = 0;
    loop {
        // Use a raw request to ensure we get the URIs for local tracks
        let url = format!("playlists/{}/tracks?limit=100&offset={}", pid.id(), offset);
        let res_str = client
            .api_get(&url, &std::collections::HashMap::new())
            .await
            .map_err(|e| format!("Failed to fetch tracks raw: {}", e))?;

        let res: serde_json::Value = serde_json::from_str(&res_str)
            .map_err(|e| format!("Failed to parse tracks JSON: {}", e))?;

        if let Some(items) = res["items"].as_array() {
            for item in items {
                if let Some(track_val) = item["track"].as_object() {
                    let is_local = track_val
                        .get("is_local")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    if let Some(app_track) = AppTrack::from_json(track_val) {
                        tracks.push(app_track);
                    } else {
                        println!(
                            "    Warning: Failed to parse track (is_local={}). URI: {:?}",
                            is_local,
                            track_val.get("uri")
                        );
                    }
                }
            }
        }

        if res["next"].is_null() {
            break;
        }
        offset += 100;
    }

    // 4. Update Cache
    cache.insert(
        playlist_id.to_string(),
        PlaylistCacheEntry {
            snapshot_id: current_snapshot_id,
            tracks: tracks.clone(),
            timestamp: chrono::Utc::now().timestamp(),
        },
    );

    if let Ok(json) = serde_json::to_string(&cache) {
        let _ = fs::write(path, json);
    }

    Ok((playlist_name, tracks))
}

pub async fn update_playlist_items(
    client: &AuthCodeSpotify,
    playlist_id: &str,
    new_uris: Vec<String>,
    old_uris: Option<Vec<String>>,
) -> Result<(), String> {
    use rspotify::model::PlaylistId;

    let pid = PlaylistId::from_id(playlist_id).map_err(|e| format!("Invalid ID: {}", e))?;

    // Check if we can use the Reorder Strategy (preferred for local files)
    if let Some(current) = old_uris {
        if !current.is_empty() {
            println!("  Using REORDER strategy to preserve local files...");
            return reorder_strategy(client, pid, current, new_uris).await;
        }
    }

    // Fallback to Replace Strategy (DELETE + POST)
    // Only used for completely new lists or if old state is unknown
    replace_strategy(client, pid, new_uris).await
}

async fn reorder_strategy(
    client: &AuthCodeSpotify,
    pid: rspotify::model::PlaylistId<'_>,
    mut current: Vec<String>,
    target: Vec<String>,
) -> Result<(), String> {
    // 1. DELETE Phase: Remove items from 'current' that are not in 'target' (or excess duplicates)
    // We need to match counts. exact same instances.
    // Naive approach: Count occurrences in Target. Keep that many in Current. Remove excess.

    let mut to_remove_indices = Vec::new();
    let mut target_counts = std::collections::HashMap::new();
    for uri in &target {
        *target_counts.entry(uri).or_insert(0) += 1;
    }

    let mut current_kept_counts = std::collections::HashMap::new();
    let mut kept_mask = vec![true; current.len()];

    // Mark items to keep/delete
    for (i, uri) in current.iter().enumerate() {
        let count = current_kept_counts.entry(uri).or_insert(0);
        let max_allowed = target_counts.get(uri).unwrap_or(&0);

        if *count < *max_allowed {
            *count += 1;
        } else {
            kept_mask[i] = false;
            to_remove_indices.push(i);
        }
    }

    // Perform Deletions (Batched)
    if !to_remove_indices.is_empty() {
        println!("  Removing {} items...", to_remove_indices.len());

        let mut grouped_removals: std::collections::HashMap<String, Vec<u32>> =
            std::collections::HashMap::new();
        for &idx in &to_remove_indices {
            grouped_removals
                .entry(current[idx].clone())
                .or_default()
                .push(idx as u32);
        }

        let removal_batch: Vec<_> = grouped_removals
            .iter()
            .map(|(uri, pos)| {
                let id = rspotify::model::PlayableId::from(
                    rspotify::model::TrackId::from_uri(uri).expect("Valid URI"),
                );
                rspotify::model::ItemPositions {
                    id,
                    positions: pos.as_slice(),
                }
            })
            .collect();

        // chunk removals
        let mut removal_items = removal_batch;
        while !removal_items.is_empty() {
            let limit = std::cmp::min(100, removal_items.len());
            let chunk: Vec<_> = removal_items.drain(..limit).collect();
            let _ = client
                .playlist_remove_specific_occurrences_of_items(pid.clone(), chunk, None)
                .await;
        }

        // Update local 'current' list to match reality
        let mut new_current = Vec::new();
        for (i, kept) in kept_mask.iter().enumerate() {
            if *kept {
                new_current.push(current[i].clone());
            }
        }
        current = new_current;
    } else {
        println!("  No items to remove.");
    }

    // 2. REORDER Phase: Selection Sort
    println!("  Reordering {} items...", target.len());

    if current.len() != target.len() {
        println!("  Warning: Mismatch after pruning. Current: {}, Target: {}. Local files might result in mismatch.", current.len(), target.len());
    }

    for i in 0..target.len() {
        if i >= current.len() {
            break;
        } // Safety

        let wanted_uri = &target[i];

        // Check if already correct
        if &current[i] == wanted_uri {
            continue;
        }

        // Find 'wanted_uri' in current[i+1..]
        let mut found_idx = None;
        for j in (i + 1)..current.len() {
            if &current[j] == wanted_uri {
                found_idx = Some(j);
                break;
            }
        }

        if let Some(src_idx) = found_idx {
            // Move item from src_idx to i
            match client
                .playlist_reorder_items(
                    pid.clone(),
                    Some(src_idx as i32),
                    Some(i as i32),
                    Some(1),
                    None,
                )
                .await
            {
                Ok(_) => {
                    // Simulate move
                    let item = current.remove(src_idx);
                    current.insert(i, item);
                }
                Err(e) => {
                    println!("    Failed to move item: {}", e);
                }
            }
        } else {
            // If not found, maybe it's just missing. Skip or warn.
        }
    }

    println!("  Reorder complete.");
    invalidate_playlist_cache(pid.id());
    Ok(())
}

async fn replace_strategy(
    client: &AuthCodeSpotify,
    pid: rspotify::model::PlaylistId<'_>,
    new_uris: Vec<String>,
) -> Result<(), String> {
    println!("  Using REPLACE strategy...");
    let playlist_id_clean = pid.id().to_string();

    let valid_uris: Vec<String> = new_uris
        .into_iter()
        .filter(|u| u.contains(':') && !u.is_empty())
        .collect();

    if valid_uris.is_empty() {
        println!("  Warning: No valid URIs content to update.");
        return Ok(());
    }

    println!(
        "  Updating playlist {} with {} items...",
        playlist_id_clean,
        valid_uris.len()
    );

    let chunk_size = 50;
    let chunks: Vec<&[String]> = valid_uris.chunks(chunk_size).collect();
    let total_chunks = chunks.len();
    let mut resize_errors = 0;

    for (i, chunk) in chunks.iter().enumerate() {
        let is_first = i == 0;
        let url = format!("playlists/{}/tracks", playlist_id_clean);

        // Try batch
        let body = serde_json::json!({ "uris": chunk });
        let res = if is_first {
            client.api_put(&url, &body).await
        } else {
            client.api_post(&url, &body).await
        };

        if let Err(e) = res {
            println!("    Batch {}/{} failed: {}. Skipping batch (Local files not supported in Replace mode).", i + 1, total_chunks, e);
            resize_errors += 1;
        } else {
            println!("    Batch {}/{} success.", i + 1, total_chunks);
        }
    }

    if resize_errors > 0 {
        println!(
            "  Spotify update completed with {} failures.",
            resize_errors
        );
    } else {
        println!("  Spotify update successful.");
    }

    invalidate_playlist_cache(playlist_id_clean.as_str());
    Ok(())
}

pub fn invalidate_playlist_cache(playlist_id: &str) {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("Spotify Sorter");
    path.push("spotify_cache.json");

    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(mut cache) = serde_json::from_str::<PlaylistCache>(&content) {
                if cache.remove(playlist_id).is_some() {
                    if let Ok(json) = serde_json::to_string(&cache) {
                        let _ = std::fs::write(path, json);
                        println!("  Invalidated cache for {}", playlist_id);
                    }
                }
            }
        }
    }
}
