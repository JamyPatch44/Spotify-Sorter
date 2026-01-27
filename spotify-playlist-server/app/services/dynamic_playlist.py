"""Dynamic playlist processing logic."""
from typing import List, Set, Optional
from datetime import datetime
import random
import uuid

from sqlalchemy.orm import Session

from app.models import (
    DynamicPlaylistConfig, DynamicPlaylistConfigDB,
    RunHistory, RunHistoryDB,
    TrackInfo, Source, FilterConfig, SortRule
)
from app.services.spotify_service import SpotifyService


def generate_id() -> str:
    """Generate a unique ID."""
    return str(uuid.uuid4())[:8]


def parse_date(date_str: str) -> str:
    """Normalize date string for comparison."""
    parts = date_str.split("-")
    if len(parts) == 1:
        return f"{parts[0]}-01-01"
    elif len(parts) == 2:
        return f"{parts[0]}-{parts[1]}-01"
    return date_str


def create_duplicate_key(track: TrackInfo) -> str:
    """Create a normalized key for duplicate detection."""
    name = "".join(c for c in track.name.lower() if c.isalnum() or c.isspace())
    artist = track.artist.split(",")[0].strip().lower()
    return f"{name}|{artist}"


def apply_filters(
    tracks: List[TrackInfo],
    filters: FilterConfig,
    liked_uris: Optional[Set[str]] = None
) -> List[TrackInfo]:
    """Apply filters to track list."""
    result = []
    
    for track in tracks:
        # Exclude liked songs if configured
        if filters.exclude_liked and liked_uris:
            if track.uri in liked_uris:
                continue
        
        # Exclude by keyword blacklist
        skip = False
        for keyword in filters.keyword_blacklist:
            kw_lower = keyword.lower()
            if (kw_lower in track.name.lower() or
                kw_lower in track.artist.lower() or
                kw_lower in track.album.lower()):
                skip = True
                break
        
        if not skip:
            result.append(track)
    
    return result


def sample_tracks(tracks: List[TrackInfo], max_count: Optional[int]) -> List[TrackInfo]:
    """Randomly sample tracks if max_count is set."""
    if max_count is None or max_count >= len(tracks):
        return tracks
    
    return random.sample(tracks, max_count)


def deduplicate_tracks(tracks: List[TrackInfo]) -> List[TrackInfo]:
    """Remove duplicate tracks by URI."""
    seen = set()
    result = []
    
    for track in tracks:
        if track.uri not in seen:
            seen.add(track.uri)
            result.append(track)
    
    return result


def sort_tracks(tracks: List[TrackInfo], rules: List[SortRule]) -> List[TrackInfo]:
    """Sort tracks by multiple criteria."""
    if not rules:
        return tracks
    
    def compare_key(track: TrackInfo):
        key = []
        for rule in rules:
            if rule.criteria == "Artist":
                val = track.artist.lower()
            elif rule.criteria == "Album":
                val = track.album.lower()
            elif rule.criteria == "Track Name":
                val = track.name.lower()
            elif rule.criteria == "Release Date":
                val = parse_date(track.release_date)
            else:
                val = ""
            
            # Reverse for descending
            if rule.descending:
                # For strings, we can't just negate, so we handle sort separately
                pass
            key.append((val, rule.descending))
        return key
    
    # Custom sort that handles descending
    def multi_sort_key(track: TrackInfo):
        keys = []
        for rule in rules:
            if rule.criteria == "Artist":
                val = track.artist.lower()
            elif rule.criteria == "Album":
                val = track.album.lower()
            elif rule.criteria == "Track Name":
                val = track.name.lower()
            elif rule.criteria == "Release Date":
                val = parse_date(track.release_date)
            else:
                val = ""
            keys.append(val)
        return keys
    
    # Sort with custom comparator
    from functools import cmp_to_key
    
    def compare(a: TrackInfo, b: TrackInfo) -> int:
        for rule in rules:
            if rule.criteria == "Artist":
                val_a, val_b = a.artist.lower(), b.artist.lower()
            elif rule.criteria == "Album":
                val_a, val_b = a.album.lower(), b.album.lower()
            elif rule.criteria == "Track Name":
                val_a, val_b = a.name.lower(), b.name.lower()
            elif rule.criteria == "Release Date":
                val_a, val_b = parse_date(a.release_date), parse_date(b.release_date)
            elif rule.criteria == "Duration":
                val_a, val_b = a.duration_ms, b.duration_ms
            elif rule.criteria == "Album Type":
                # Priority: album (0), single (1), compilation (2), unknown (3)
                priority = {"album": 0, "single": 1, "compilation": 2}
                val_a = priority.get((a.album_type or "").lower(), 3)
                val_b = priority.get((b.album_type or "").lower(), 3)
            else:
                continue
            
            if val_a < val_b:
                result = -1
            elif val_a > val_b:
                result = 1
            else:
                result = 0
            
            if result != 0:
                return -result if rule.descending else result
        
        return 0
    
    return sorted(tracks, key=cmp_to_key(compare))


def remove_duplicates(
    tracks: List[TrackInfo],
    preference: str
) -> List[TrackInfo]:
    """Remove duplicates based on preference."""
    from collections import defaultdict
    
    # Group by duplicate key
    groups: dict[str, List[tuple[int, TrackInfo]]] = defaultdict(list)
    for idx, track in enumerate(tracks):
        key = create_duplicate_key(track)
        groups[key].append((idx, track))
    
    kept = []
    
    for key, group in groups.items():
        if len(group) == 1:
            kept.append(group[0])
        else:
            # Sort based on preference
            if "Oldest" in preference and "Release" in preference:
                group.sort(key=lambda x: parse_date(x[1].release_date))
            elif "Newest" in preference and "Release" in preference:
                group.sort(key=lambda x: parse_date(x[1].release_date), reverse=True)
            elif "Oldest" in preference:
                group.sort(key=lambda x: x[0])
            elif "Newest" in preference:
                group.sort(key=lambda x: x[0], reverse=True)
            
            kept.append(group[0])
    
    # Sort by original index to maintain order
    kept.sort(key=lambda x: x[0])
    
    return [t for _, t in kept]


class DynamicPlaylistService:
    """Service for managing and executing dynamic playlists."""
    
    def __init__(self, db: Session):
        self.db = db
        self.spotify = SpotifyService(db)
    
    def get_all_configs(self) -> List[DynamicPlaylistConfig]:
        """Get all dynamic playlist configurations."""
        db_configs = self.db.query(DynamicPlaylistConfigDB).all()
        return [self._db_to_schema(c) for c in db_configs]
    
    def get_config(self, config_id: str) -> Optional[DynamicPlaylistConfig]:
        """Get a single configuration by ID."""
        db_config = self.db.query(DynamicPlaylistConfigDB).filter(
            DynamicPlaylistConfigDB.id == config_id
        ).first()
        
        if db_config:
            return self._db_to_schema(db_config)
        return None
    
    def save_config(self, config: DynamicPlaylistConfig) -> DynamicPlaylistConfig:
        """Create or update a configuration."""
        if not config.id:
            config.id = generate_id()
        
        # Check if exists
        existing = self.db.query(DynamicPlaylistConfigDB).filter(
            DynamicPlaylistConfigDB.id == config.id
        ).first()
        
        if existing:
            # Update
            existing.name = config.name
            existing.target_playlist_id = config.target_playlist_id
            existing.target_playlist_name = config.target_playlist_name
            existing.sources = [s.model_dump() for s in config.sources]
            existing.filters = config.filters.model_dump()
            existing.update_mode = config.update_mode
            existing.sample_per_source = config.sample_per_source
            existing.include_liked_songs = config.include_liked_songs
            existing.processing = config.processing.model_dump()
            existing.enabled = config.enabled
        else:
            # Create
            db_config = DynamicPlaylistConfigDB(
                id=config.id,
                name=config.name,
                target_playlist_id=config.target_playlist_id,
                target_playlist_name=config.target_playlist_name,
                sources=[s.model_dump() for s in config.sources],
                filters=config.filters.model_dump(),
                update_mode=config.update_mode,
                sample_per_source=config.sample_per_source,
                include_liked_songs=config.include_liked_songs,
                processing=config.processing.model_dump(),
                enabled=config.enabled,
            )
            self.db.add(db_config)
        
        self.db.commit()
        return config
    
    def delete_config(self, config_id: str) -> bool:
        """Delete a configuration."""
        result = self.db.query(DynamicPlaylistConfigDB).filter(
            DynamicPlaylistConfigDB.id == config_id
        ).delete()
        self.db.commit()
        return result > 0
    
    def initialize_run(self, config_id: str, triggered_by: str = "manual") -> RunHistoryDB:
        """Create the history entry and return it, ready for processing."""
        config = self.get_config(config_id)
        if not config:
            raise ValueError(f"Configuration not found: {config_id}")
        
        history_id = generate_id()
        history = RunHistoryDB(
            id=history_id,
            config_id=config_id,
            config_name=config.name,
            started_at=datetime.now(),
            status="running",
            triggered_by=triggered_by,
        )
        self.db.add(history)
        self.db.commit()
        return history

    def process_run(self, history_id: str):
        """Execute the run for an existing history entry."""
        # Re-fetch history to ensure attached to session
        history = self.db.query(RunHistoryDB).filter(RunHistoryDB.id == history_id).first()
        if not history:
            return

        try:
            config = self.get_config(history.config_id)
            if not config:
                raise ValueError("Config missing")

            track_count = self._execute_update(config, history=history)
            
            history.finished_at = datetime.now()
            history.status = "success"
            history.tracks_processed = track_count
            self.db.commit()
            
        except Exception as e:
            # Need to rollback/commit to safely write error
            self.db.rollback() 
            # Re-fetch to update error state
            history = self.db.query(RunHistoryDB).filter(RunHistoryDB.id == history_id).first()
            if history:
                history.finished_at = datetime.now()
                history.status = "failed"
                history.error_message = str(e)
                self.db.commit()
            print(f"[{datetime.now()}] Background run failed: {e}")

    def run_config(self, config_id: str, triggered_by: str = "manual") -> RunHistory:
        """Execute a dynamic playlist configuration synchronously (legacy/blocking)."""
        history = self.initialize_run(config_id, triggered_by)
        self.process_run(history.id)
        # Refresh to get latest state
        self.db.refresh(history)
        return self._history_to_schema(history)
    
    def _execute_update(self, config: DynamicPlaylistConfig, history: RunHistoryDB = None) -> int:
        """Execute the actual playlist update."""
        print(f"[{datetime.now()}] Starting update for '{config.name}' (ID: {config.id})")
        source_tracks: List[TrackInfo] = []
        
        # 1. Collect tracks from sources
        for source in config.sources:
            print(f"[{datetime.now()}] Fetching tracks from source: {source.type} (ID: {source.id})")
            if source.type == "playlist" and source.id:
                tr = self.spotify.get_playlist_tracks(source.id)
            elif source.type == "likedSongs":
                tr = self.spotify.get_liked_songs()
            else:
                continue
            
            before_sample = len(tr)
            tr = sample_tracks(tr, config.sample_per_source)
            print(f"[{datetime.now()}] Fetched {before_sample} tracks, sampled down to {len(tr)}")
            source_tracks.extend(tr)

        if config.include_liked_songs:
            print(f"[{datetime.now()}] Fetching Liked Songs (include_liked_songs=True)")
            liked = self.spotify.get_liked_songs()
            liked = sample_tracks(liked, config.sample_per_source)
            print(f"[{datetime.now()}] Fetched {len(liked)} Liked Songs")
            source_tracks.extend(liked)
        
        print(f"[{datetime.now()}] Total source tracks collected: {len(source_tracks)}")

        # 2. Apply Filters
        liked_uris = None
        if config.filters.exclude_liked:
            print(f"[{datetime.now()}] Fetching Liked Songs for exclusion filter")
            liked_uris = self.spotify.get_liked_song_uris()
        
        print(f"[{datetime.now()}] Applying filters...")
        filtered_candidates = apply_filters(source_tracks, config.filters, liked_uris)
        print(f"[{datetime.now()}] Tracks remaining after filters: {len(filtered_candidates)}")
        
        # 3. Combine with Target based on Mode
        final_pool: List[TrackInfo] = []
        
        if config.update_mode == "replace":
            final_pool = filtered_candidates
            
        elif config.update_mode in ["merge", "append"]:
            print(f"[{datetime.now()}] Update mode '{config.update_mode}': Fetching existing target tracks")
            existing = self.spotify.get_playlist_tracks(config.target_playlist_id)
            print(f"[{datetime.now()}] Target playlist currently has {len(existing)} tracks")
            final_pool = existing + filtered_candidates

        # 4. Basic Deduplication (URI based) - Keep first occurrence
        # For Merge/Append, this keeps Existing (since they are first in list)
        # For Replace, this keeps first in candidate list
        unique_pool = deduplicate_tracks(final_pool)
        
        # 5. Apply Processing (Sort & Advanced Dedup) to the WHOLE pool
        processed_tracks = unique_pool
        # 4. Sorting
        if config.processing.apply_sort and config.processing.sort_rules:
            print(f"[{datetime.now()}] Applying sort rules...")
            processed_tracks = sort_tracks(processed_tracks, config.processing.sort_rules)
            print(f"[{datetime.now()}] Sort complete")
        
        if config.processing.apply_dupes and config.processing.dupe_preference:
            print(f"[{datetime.now()}] Removing duplicates (preference: {config.processing.dupe_preference})...")
            processed_tracks = remove_duplicates(
                processed_tracks,
                config.processing.dupe_preference
            )
            print(f"[{datetime.now()}] Tracks remaining after deduplication: {len(processed_tracks)}")
            
        # 6. Extract URIs
        final_uris = [t.uri for t in processed_tracks]
        track_details = {t.uri: t for t in processed_tracks}
        
        # 7. Update Playlist
        # Note: even for Append/Merge, since we re-processed everything (sorted/deduped),
        # we should REPLACE the playlist content with the new state.
        
        def on_progress(current, total):
            if history:
                print(f"[{datetime.now()}] Progress: {current}/{total} tracks")
                history.tracks_processed = current
                self.db.commit()
                
        print(f"[{datetime.now()}] Handing over to Spotify service for final update (reorder strategy if local files present)...")
        warning = self.spotify.replace_playlist_tracks(
            config.target_playlist_id, 
            final_uris, 
            on_progress=on_progress,
            track_details=track_details
        )
        print(f"[{datetime.now()}] Update execution finished successfully.")
        
        if warning:
            history.warning_message = warning
            self.db.commit()
            
        return len(final_uris)
    
    def get_history(self, limit: int = 50) -> List[RunHistory]:
        """Get recent run history."""
        # ... (rest of method, no changes needed to query logic)
        query = self.db.query(RunHistoryDB).order_by(
            RunHistoryDB.started_at.desc()
        )
        # If limit is 0 or less, return all
        if limit > 0:
            db_history = query.limit(limit).all()
        else:
            db_history = query.all()
        
        return [self._history_to_schema(h) for h in db_history]

    def delete_history_item(self, history_id: str) -> bool:
        """Delete a single history entry."""
        count = self.db.query(RunHistoryDB).filter(
            RunHistoryDB.id == history_id
        ).delete()
        self.db.commit()
        return count > 0

    def delete_history(self) -> int:
        """Clear all execution history."""
        count = self.db.query(RunHistoryDB).delete()
        self.db.commit()
        return count
    
    def _db_to_schema(self, db: DynamicPlaylistConfigDB) -> DynamicPlaylistConfig:
        """Convert database model to Pydantic schema."""
        from app.models import Source, FilterConfig, ProcessingOptions, SortRule
        
        sources = [Source(**s) for s in (db.sources or [])]
        filters = FilterConfig(**(db.filters or {}))
        
        processing_data = db.processing or {}
        sort_rules = [SortRule(**r) for r in processing_data.get("sort_rules", [])]
        processing = ProcessingOptions(
            apply_sort=processing_data.get("apply_sort", False),
            apply_dupes=processing_data.get("apply_dupes", False),
            apply_versions=processing_data.get("apply_versions", False),
            sort_rules=sort_rules,
            dupe_preference=processing_data.get("dupe_preference", ""),
            version_preference=processing_data.get("version_preference", ""),
        )
        
        return DynamicPlaylistConfig(
            id=db.id,
            name=db.name,
            target_playlist_id=db.target_playlist_id,
            target_playlist_name=db.target_playlist_name or "",
            sources=[s.model_dump() for s in sources] if hasattr(sources[0], "model_dump") else sources,
            filters=filters,
            update_mode=db.update_mode,
            sample_per_source=db.sample_per_source,
            include_liked_songs=db.include_liked_songs,
            processing=processing,
            enabled=db.enabled,
        )
    
    def _history_to_schema(self, db: RunHistoryDB) -> RunHistory:
        """Convert history database model to schema."""
        return RunHistory(
            id=db.id,
            config_id=db.config_id,
            config_name=db.config_name or "",
            started_at=db.started_at,
            finished_at=db.finished_at,
            status=db.status,
            tracks_processed=db.tracks_processed or 0,
            error_message=db.error_message,
            warning_message=db.warning_message,
            triggered_by=db.triggered_by or "manual",
        )
