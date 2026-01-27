use rspotify::model::FullTrack;
use rspotify::prelude::Id;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppTrack {
    pub id: String,
    pub name: String,
    pub artist_names: String,
    pub album_name: String,
    pub album_type: String, // New field for prioritization
    pub release_date: String,
    pub uri: String,
    pub duration_ms: u32,
}

// Helper for decoding URI components
fn percent_decode(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(val) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                output.push(val as char);
                i += 3;
                continue;
            }
        }
        output.push(bytes[i] as char);
        i += 1;
    }
    output
}

impl AppTrack {
    pub fn from_json(track_val: &serde_json::Map<String, serde_json::Value>) -> Option<Self> {
        // More robust type check
        let track_type = track_val.get("type").and_then(|t| t.as_str());
        if track_type != Some("track") {
            return None;
        }

        let uri = track_val
            .get("uri")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();

        if uri.is_empty() {
            return None;
        }

        let id = track_val
            .get("id")
            .and_then(|t| t.as_str())
            .unwrap_or(&uri)
            .to_string();

        let name = track_val
            .get("name")
            .and_then(|t| t.as_str())
            .unwrap_or("Unknown")
            .to_string();

        let album_val = track_val.get("album").and_then(|t| t.as_object());
        let album_name = album_val
            .and_then(|a| a.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("Unknown Album")
            .to_string();
        let album_type = album_val
            .and_then(|a| a.get("album_type"))
            .and_then(|n| n.as_str())
            .unwrap_or("unknown")
            .to_string();
        let release_date = album_val
            .and_then(|a| a.get("release_date"))
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string();
        let duration_ms = track_val
            .get("duration_ms")
            .and_then(|t| t.as_u64())
            .unwrap_or(0) as u32;

        let mut artists =
            if let Some(artist_list) = track_val.get("artists").and_then(|a| a.as_array()) {
                artist_list
                    .iter()
                    .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                    .collect::<Vec<_>>()
                    .join(", ")
            } else {
                String::new()
            };

        // Fallback for Local Files: Parse from URI if metadata is missing
        // URI format: spotify:local:Artist:Album:Title:Duration
        if uri.starts_with("spotify:local") {
            let parts: Vec<&str> = uri.split(':').collect();
            // Expected parts: ["spotify", "local", "Artist", "Album", "Title", "Duration"]
            if parts.len() >= 6 {
                if artists.is_empty() || artists == "Unknown Artist" {
                    artists = parts[2].replace('+', " ");
                }
            }
        }

        if artists.is_empty() {
            artists = "Unknown Artist".to_string();
        }

        let mut final_name = name;
        if (final_name == "Unknown" || final_name.is_empty()) && uri.starts_with("spotify:local") {
            let parts: Vec<&str> = uri.split(':').collect();
            if parts.len() >= 6 {
                final_name = parts[4].replace('+', " ");
            }
        }

        let mut final_album = album_name;
        if (final_album == "Unknown Album" || final_album.is_empty())
            && uri.starts_with("spotify:local")
        {
            let parts: Vec<&str> = uri.split(':').collect();
            if parts.len() >= 6 {
                final_album = parts[3].replace('+', " ");
            }
        }

        // Apply Percent Decoding to Local File Parts to ensure correct sorting
        if uri.starts_with("spotify:local") {
            artists = percent_decode(&artists);
            final_name = percent_decode(&final_name);
            final_album = percent_decode(&final_album);
        }

        Some(AppTrack {
            id,
            name: final_name,
            artist_names: artists,
            album_name: final_album,
            album_type,
            release_date,
            uri,
            duration_ms,
        })
    }

    pub fn from_spotify(item: &FullTrack) -> Option<Self> {
        let (id, uri) = match &item.id {
            Some(track_id) => (track_id.id().to_string(), track_id.uri()),
            None => {
                if item.is_local {
                    // constructed URI: spotify:local:artist:album:name:duration
                    let artists = item
                        .artists
                        .iter()
                        .map(|a| a.name.clone())
                        .collect::<Vec<_>>()
                        .join(", ");

                    let artists_enc = percent_encode(&artists);
                    let album_enc = percent_encode(&item.album.name);
                    let name_enc = percent_encode(&item.name);

                    let pseudo_uri = format!(
                        "spotify:local:{}:{}:{}:{}",
                        artists_enc,
                        album_enc,
                        name_enc,
                        item.duration.num_seconds()
                    );
                    (String::new(), pseudo_uri)
                } else {
                    (String::new(), String::new())
                }
            }
        };

        Self::from_json(
            &serde_json::to_value(AppTrack {
                id: id.clone(),
                name: item.name.clone(),
                artist_names: item
                    .artists
                    .iter()
                    .map(|a| a.name.clone())
                    .collect::<Vec<_>>()
                    .join(", "),
                album_name: item.album.name.clone(),
                album_type: item
                    .album
                    .album_type
                    .as_deref()
                    .unwrap_or("unknown")
                    .to_string(),
                release_date: item.album.release_date.clone().unwrap_or_default(),
                uri: uri.clone(),
                duration_ms: item.duration.num_milliseconds() as u32,
            })
            .unwrap()
            .as_object()
            .unwrap(),
        )
    }

    /// Create a normalized key for duplicate detection
    pub fn duplicate_key(&self) -> String {
        // Normalize: lowercase, remove special chars, take first artist
        let name = self
            .name
            .to_lowercase()
            .chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace())
            .collect::<String>();
        let artist = self
            .artist_names
            .split(',')
            .next()
            .unwrap_or("")
            .trim()
            .to_lowercase();
        format!("{}|{}", name, artist)
    }
}

// Helper for encoding URI components (Strict)
pub fn percent_encode(input: &str) -> String {
    let mut output = String::with_capacity(input.len() * 2);
    for c in input.chars() {
        match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | ':' => output.push(c),
            ' ' => output.push_str("%20"),
            _ => {
                let bytes = c.to_string();
                for b in bytes.bytes() {
                    output.push_str(&format!("%{:02X}", b));
                }
            }
        }
    }
    output
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SortRule {
    pub id: String,
    pub criteria: String,
    pub descending: bool,
}

/// Sort tracks by multiple criteria
pub fn sort_tracks(mut tracks: Vec<AppTrack>, rules: &[SortRule]) -> Vec<AppTrack> {
    if rules.is_empty() {
        return tracks;
    }

    tracks.sort_by(|a, b| {
        for rule in rules {
            let ordering = match rule.criteria.as_str() {
                "Artist" => a
                    .artist_names
                    .to_lowercase()
                    .cmp(&b.artist_names.to_lowercase()),
                "Album" => a
                    .album_name
                    .to_lowercase()
                    .cmp(&b.album_name.to_lowercase()),
                "Track Name" | "Name" => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                "Release Date" | "Date" => {
                    // Parse dates for proper comparison
                    let date_a = parse_date(&a.release_date);
                    let date_b = parse_date(&b.release_date);
                    date_a.cmp(&date_b)
                }
                "Duration" => a.duration_ms.cmp(&b.duration_ms),
                _ => std::cmp::Ordering::Equal,
            };

            if ordering != std::cmp::Ordering::Equal {
                return if rule.descending {
                    ordering.reverse()
                } else {
                    ordering
                };
            }
        }
        std::cmp::Ordering::Equal
    });

    tracks
}

/// Parse date string to comparable format (handles YYYY, YYYY-MM, YYYY-MM-DD)
pub fn parse_date(date: &str) -> String {
    if date.is_empty() {
        return "0000-01-01".to_string();
    }
    // Pad incomplete dates to ensure proper comparison
    let parts: Vec<&str> = date.split('-').collect();
    match parts.len() {
        1 => format!("{}-01-01", parts[0]),
        2 => format!("{}-{}-01", parts[0], parts[1]),
        _ => date.to_string(),
    }
}

/// Find and remove duplicates based on preference
pub fn remove_duplicates(
    tracks: Vec<AppTrack>,
    preference: &str,
) -> (Vec<AppTrack>, Vec<AppTrack>) {
    use std::collections::HashMap;

    let mut groups: HashMap<String, Vec<(usize, AppTrack)>> = HashMap::new();

    for (idx, track) in tracks.into_iter().enumerate() {
        let key = track.duplicate_key();
        groups.entry(key).or_default().push((idx, track));
    }

    let mut kept_with_idx: Vec<(usize, AppTrack)> = Vec::new();
    let mut removed: Vec<AppTrack> = Vec::new();

    for (_key, mut group) in groups {
        if group.len() == 1 {
            kept_with_idx.push(group.remove(0));
        } else {
            // Sort group based on preference
            match preference {
                "Keep Oldest (Release Date)" => {
                    group.sort_by(|a, b| {
                        parse_date(&a.1.release_date).cmp(&parse_date(&b.1.release_date))
                    });
                }
                "Keep Newest (Release Date)" => {
                    group.sort_by(|a, b| {
                        parse_date(&b.1.release_date).cmp(&parse_date(&a.1.release_date))
                    });
                }
                "Keep Oldest (Playlist Order)" => {
                    group.sort_by_key(|t| t.0);
                }
                "Keep Newest (Playlist Order)" => {
                    group.sort_by_key(|t| std::cmp::Reverse(t.0));
                }
                _ => {}
            }

            // Keep first, remove rest
            let (idx, keeper) = group.remove(0);
            kept_with_idx.push((idx, keeper));
            for (_, dupe) in group {
                removed.push(dupe);
            }
        }
    }

    // Sort kept tracks by original index to ensure stability
    kept_with_idx.sort_by_key(|t| t.0);

    let kept: Vec<AppTrack> = kept_with_idx.into_iter().map(|(_, t)| t).collect();

    (kept, removed)
}

#[derive(Serialize, Clone, Debug)]
pub struct ProcessingResult {
    pub playlist_id: String,
    pub playlist_name: String,
    pub original_count: usize,
    pub final_count: usize,
    pub sorted: bool,
    pub duplicates_removed: usize,
    pub versions_replaced: usize,
}

pub fn parse_date_obj(date: &str) -> chrono::NaiveDate {
    let d = parse_date(date);
    chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").unwrap_or_default()
}
