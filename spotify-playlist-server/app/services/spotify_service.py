"""Spotify API service using spotipy."""
import spotipy
from spotipy.oauth2 import SpotifyOAuth
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from datetime import datetime, timedelta
from typing import Optional, List, Set
from functools import lru_cache
from sqlalchemy.orm import Session
import json
import os
import time

from urllib.parse import unquote
from app.config import get_settings
from app.models import PlaylistInfo, TrackInfo, SpotifyTokenDB

settings = get_settings()

# Spotify API scopes needed
SCOPES = [
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-public",
    "playlist-modify-private",
    "user-library-read",
]


class SpotifyService:
    """Service for interacting with Spotify API."""
    
    _last_429_time = 0.0 # Global circuit breaker
    _retry_after = 60 # Seconds to wait
    
    def __init__(self, db: Session):
        self.db = db
        self._sp: Optional[spotipy.Spotify] = None
        self._user_info: Optional[dict] = None
    
    def get_auth_manager(self) -> SpotifyOAuth:
        """Get Spotify OAuth manager."""
        # Use credentials from environment (Docker config) by default
        client_id = settings.spotify_client_id
        client_secret = settings.spotify_client_secret
        
        # If they aren't in the environment, try to get them from DB
        if not client_id or not client_secret:
            try:
                # Fallback A: Check internal DB
                from app.models import SystemConfigDB
                db_client_id = self.db.query(SystemConfigDB).filter(SystemConfigDB.key == "spotify_client_id").first()
                db_client_secret = self.db.query(SystemConfigDB).filter(SystemConfigDB.key == "spotify_client_secret").first()
                
                if db_client_id and db_client_id.value:
                    client_id = db_client_id.value
                if db_client_secret and db_client_secret.value:
                    client_secret = db_client_secret.value
                
                # Fallback B: Check for credentials.json from the Desktop app (if in same DATA_DIR)
                if not client_id or not client_secret:
                    creds_path = os.path.join(settings.data_dir, "credentials.json")
                    if os.path.exists(creds_path):
                        print(f"[Auth] Found desktop credentials at {creds_path}, importing...")
                        with open(creds_path, 'r') as f:
                            creds_data = json.load(f)
                            client_id = creds_data.get("client_id")
                            client_secret = creds_data.get("client_secret")
            except Exception as e:
                print(f"Error loading system config: {e}")
            
        cache_path = os.path.join(settings.data_dir, ".spotify_cache")
        return SpotifyOAuth(
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=settings.spotify_redirect_uri,
            scope=" ".join(SCOPES),
            cache_path=cache_path,
            open_browser=False,
        )
    
    def get_auth_url(self) -> str:
        """Get Spotify authorization URL."""
        auth_manager = self.get_auth_manager()
        return auth_manager.get_authorize_url()
    
    def handle_callback(self, code: str) -> bool:
        """Handle OAuth callback and store tokens."""
        try:
            auth_manager = self.get_auth_manager()
            token_info = auth_manager.get_access_token(code, as_dict=True)
            
            if token_info:
                self._save_tokens(token_info)
                return True
            return False
        except Exception as e:
            print(f"OAuth callback error: {e}")
            return False
    
    def _save_tokens(self, token_info: dict):
        """Save tokens to database."""
        # Clear existing tokens
        self.db.query(SpotifyTokenDB).delete()
        
        # Calculate expiration time
        expires_at = datetime.now() + timedelta(seconds=token_info.get("expires_in", 3600))
        
        # Save new token
        token = SpotifyTokenDB(
            access_token=token_info["access_token"],
            refresh_token=token_info.get("refresh_token", ""),
            token_type=token_info.get("token_type", "Bearer"),
            expires_at=expires_at,
            scope=token_info.get("scope", ""),
        )
        self.db.add(token)
        self.db.commit()
    
    def _get_tokens(self) -> Optional[SpotifyTokenDB]:
        """Get stored tokens from database."""
        return self.db.query(SpotifyTokenDB).first()
    
    def _refresh_if_needed(self, token: SpotifyTokenDB) -> Optional[str]:
        """Refresh access token if expired."""
        if datetime.now() >= token.expires_at - timedelta(minutes=5):
            # Token is expired or about to expire
            auth_manager = self.get_auth_manager()
            try:
                token_info = auth_manager.refresh_access_token(token.refresh_token)
                if token_info:
                    self._save_tokens(token_info)
                    return token_info["access_token"]
            except Exception as e:
                print(f"Token refresh error: {e}")
                return None
        return token.access_token
    
    def get_spotify_client(self) -> Optional[spotipy.Spotify]:
        """Get authenticated Spotify client."""
        if self._sp:
            return self._sp
        
        token = self._get_tokens()
        
        # Fallback: If no token in DB, see if we can import the refresh token from the Desktop app
        if not token:
            try:
                creds_path = os.path.join(settings.data_dir, "credentials.json")
                if os.path.exists(creds_path):
                    with open(creds_path, 'r') as f:
                        creds_data = json.load(f)
                        refresh_token = creds_data.get("refresh_token")
                        if refresh_token:
                            print(f"[Auth] Importing session from desktop app...")
                            # Create a temporary token entry in the DB
                            token_info = {
                                "access_token": "", # Will be refreshed immediately
                                "refresh_token": refresh_token,
                                "expires_in": 0,
                                "token_type": "Bearer",
                                "scope": " ".join(SCOPES)
                            }
                            self._save_tokens(token_info)
                            token = self._get_tokens()
            except Exception as e:
                print(f"Error importing session: {e}")

        if not token:
            return None
        
        access_token = self._refresh_if_needed(token)
        if not access_token:
            return None
        
        # Use a custom session with a browser-like User-Agent to bypass potential script-blocks
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SpotifySorter/1.3.5'
        })
        
        self._sp = spotipy.Spotify(
            auth=access_token, 
            requests_session=session,
            requests_timeout=5,
            status_retries=0,
            retries=0
        )
        return self._sp
    
    def is_authenticated(self) -> bool:
        """Check if we have valid authentication."""
        return self.get_spotify_client() is not None
    
    def get_user_info(self) -> Optional[dict]:
        """Get current user's profile."""
        sp = self.get_spotify_client()
        if not sp:
            return None
        
        if not self._user_info:
            try:
                print(f"[{datetime.now()}] [Auth] Fetching current user profile...")
                self._user_info = sp.current_user()
                print(f"[{datetime.now()}] [Auth] Profile fetched: {self._user_info.get('display_name')}")
            except Exception as e:
                print(f"[{datetime.now()}] [Auth] Error fetching user profile: {e}")
                return None
        
        return self._user_info
    
    def logout(self):
        """Clear authentication."""
        self.db.query(SpotifyTokenDB).delete()
        self.db.commit()
        self._sp = None
        self._user_info = None
        
        # Also clear cache file
        cache_path = os.path.join(settings.data_dir, ".spotify_cache")
        if os.path.exists(cache_path):
            os.remove(cache_path)
    
    def get_playlists(self, force_refresh: bool = False) -> List[PlaylistInfo]:
        """Fetch all user's playlists with circuit breaker, caching, and fresh connection."""
        
        # 0. Check Cache (TTL: 60 minutes)
        if not force_refresh:
            try:
                from app.models import UserPlaylistsCacheDB
                cached = self.db.query(UserPlaylistsCacheDB).filter(UserPlaylistsCacheDB.key == "all_playlists").first()
                if cached and (datetime.now() - cached.last_updated) < timedelta(minutes=60):
                    print(f"[{datetime.now()}] [Playlists] Cache HIT: Returning {len(cached.playlists)} playlists.")
                    # Deserialize JSON back to Pydantic models
                    return [PlaylistInfo(**p) for p in cached.playlists]
            except Exception as e:
                print(f"[{datetime.now()}] [Playlists] Cache check failed: {e}")

        # 1. Circuit Breaker Check
        now = time.time()
        elapsed = now - SpotifyService._last_429_time
        if elapsed < SpotifyService._retry_after:
            wait_time = int(SpotifyService._retry_after - elapsed)
            print(f"[{datetime.now()}] [Playlists] Circuit breaker active! Waiting {wait_time}s for rate limit to clear...")
            raise Exception(f"Rate limited by Spotify. Please wait {wait_time}s.")

        print(f"[{datetime.now()}] [Playlists] Starting playlist fetch process (Refresh={force_refresh})...")
        
        # 2. Force fresh connection to apply new timeout settings
        self._sp = None 
        user = self.get_user_info()
        if not user:
            print(f"[{datetime.now()}] [Playlists] User info not found.")
            return []
        
        user_id = user["id"]
        print(f"[{datetime.now()}] [Playlists] Fetching playlists for {user.get('display_name')}...")
        
        sp = self.get_spotify_client()
        if not sp:
            return []
        
        playlists = []
        offset = 0
        limit = 50 # Standard batch size
        
        while True:
            try:
                print(f"[{datetime.now()}] [Playlists] Requesting offset {offset} (limit={limit})...")
                results = sp.current_user_playlists(limit=limit, offset=offset)
                
                if not results or "items" not in results:
                    print(f"[{datetime.now()}] [Playlists] Received empty or invalid response.")
                    break
                    
                # print(f"[{datetime.now()}] [Playlists] Batch received with {len(results['items'])} items.")
                
                for i, item in enumerate(results["items"]):
                    if i % 25 == 0:
                        # print(f"[{datetime.now()}] [Playlists] Processing item {offset + i} ('{item['name']}')")
                        pass
                    
                    owner_id = item["owner"]["id"]
                    is_collaborative = item.get("collaborative", False)
                    editable = owner_id == user_id or is_collaborative
                    
                    # Safety check for images
                    images = item.get("images") or []
                    image_url = images[0]["url"] if len(images) > 0 else None

                    playlists.append(PlaylistInfo(
                        id=item["id"],
                        name=item["name"],
                        owner=item["owner"]["display_name"] or owner_id,
                        editable=editable,
                        track_count=item["tracks"]["total"],
                        image_url=image_url,
                    ))
                
                if results["next"] is None:
                    break
                offset += limit
                
                # Safety buffer to avoid hitting 429 again
                time.sleep(1.0)
            except Exception as e:
                import spotipy
                if isinstance(e, spotipy.exceptions.SpotifyException) and e.http_status == 429:
                    SpotifyService._last_429_time = time.time()
                    # Try different header cases
                    headers = {k.lower(): v for k, v in e.headers.items()} if e.headers else {}
                    retry_val = headers.get("retry-after")
                    try:
                        SpotifyService._retry_after = int(retry_val) if retry_val else 60
                    except:
                        SpotifyService._retry_after = 60

                    print(f"[{datetime.now()}] [Playlists] !!! RATE LIMIT HIT (429) !!!")
                    print(f"[{datetime.now()}] [Playlists] Spotify header says: Retry after {retry_val or 'Unknown'} seconds.")
                    print(f"[{datetime.now()}] [Playlists] Raw Error: {e.msg}")
                    print(f"[{datetime.now()}] [Playlists] Circuit breaker engaged for {SpotifyService._retry_after}s.")
                    # Force a total client reset for next time
                    self._sp = None
                else:
                    print(f"[{datetime.now()}] [Playlists] ERROR during batch fetch: {e}")
                
                # If we have some playlists, return what we have instead of crashing
                if playlists:
                    print(f"[{datetime.now()}] [Playlists] Returning partial list ({len(playlists)} items)")
                    return playlists
                raise

        # 3. Update Cache
        if playlists:
            try:
                from app.models import UserPlaylistsCacheDB
                # Serialize to JSON-compatible dicts
                playlists_json = [p.model_dump() for p in playlists]
                
                # Check for existing cache
                cached = self.db.query(UserPlaylistsCacheDB).filter(UserPlaylistsCacheDB.key == "all_playlists").first()
                if not cached:
                    cached = UserPlaylistsCacheDB(key="all_playlists", playlists=playlists_json)
                    self.db.add(cached)
                else:
                    cached.playlists = playlists_json
                    cached.last_updated = datetime.now()
                
                self.db.commit()
                print(f"[{datetime.now()}] [Playlists] Cache updated with {len(playlists)} items.")
            except Exception as e:
                print(f"[{datetime.now()}] [Playlists] Failed to update cache: {e}")
                self.db.rollback()
        
        return playlists

    
    def get_playlist_tracks(self, playlist_id: str) -> List[TrackInfo]:
        """Fetch all tracks from a playlist, using cache if snapshot_id matches."""
        sp = self.get_spotify_client()
        if not sp:
            return []
        
        try:
            # 1. Get lightweight metadata to check snapshot_id
            # fields="snapshot_id" minimizes data transfer
            playlist_meta = sp.playlist(playlist_id, fields="snapshot_id")
            current_snapshot_id = playlist_meta["snapshot_id"]
            
            # 2. Check Cache
            from app.models import PlaylistCacheDB
            cached = self.db.query(PlaylistCacheDB).filter(
                PlaylistCacheDB.playlist_id == playlist_id
            ).first()
            
            if cached and cached.snapshot_id == current_snapshot_id:
                # HIT: Return cached tracks
                # print(f"Cache HIT for playlist {playlist_id}")
                return [TrackInfo(**t) for t in cached.tracks]
            
            # MISS: Fetch fresh tracks
            # print(f"Cache MISS for playlist {playlist_id} (New Snapshot: {current_snapshot_id})")
            
        except Exception as e:
            print(f"Error checking cache/snapshot: {e}")
            # Fallback to fetching if something fails
            current_snapshot_id = None

        # Fetch logic (Pagination)
        tracks = []
        offset = 0
        limit = 100
        
        while True:
            try:
                results = sp.playlist_items(
                    playlist_id,
                    limit=limit,
                    offset=offset,
                    fields="items(track(id,uri,name,artists,album(name,release_date,album_type),duration_ms)),next",
                    additional_types=("track", "episode")
                )
            except Exception as e:
                # Capture 429 Rate Limit
                if "429" in str(e):
                    SpotifyService._last_429_time = time.time()
                    SpotifyService._retry_after = 60 # Default to 60s
                    print(f"[{datetime.now()}] [Rate Limit] Hit 429 in get_playlist_tracks. Activating circuit breaker.")
                raise
            
            for item in results["items"]:
                track = item.get("track")
                # Handle cases where track might be None (local files or removed)
                if not track:
                    continue
                
                uri = track.get("uri", "")
                track_id = track.get("id") or uri # Use URI as ID for local files
                
                if not track.get("id") and not uri.startswith("spotify:local"):
                    continue
                
                name = track.get("name") or "Unknown"
                artist = ", ".join(a["name"] for a in track["artists"]) if track.get("artists") else "Unknown Artist"
                album = (track["album"].get("name") or "Unknown Album") if track.get("album") else "Unknown Album"
                album_type = (track["album"].get("album_type") or "unknown") if track.get("album") else "unknown"
                release_date = (track["album"].get("release_date") or "") if track.get("album") else ""
                
                # Fallback for Local Files: Parse from URI if metadata is missing
                if uri.startswith("spotify:local"):
                    parts = uri.split(":")
                    if len(parts) >= 6:
                        # Expected parts: ["spotify", "local", "Artist", "Album", "Title", "Duration"]
                        if not artist or artist == "Unknown Artist":
                            artist = unquote(parts[2].replace("+", " "))
                        if not album or album == "Unknown Album":
                            album = unquote(parts[3].replace("+", " "))
                        if not name or name == "Unknown":
                            name = unquote(parts[4].replace("+", " "))
                    
                    # Apply general decoding to ensure correctness
                    artist = unquote(artist.replace("+", " "))
                    name = unquote(name.replace("+", " "))
                    album = unquote(album.replace("+", " "))
                
                tracks.append(TrackInfo(
                    id=track_id,
                    uri=uri,
                    name=name,
                    artist=artist,
                    album=album,
                    album_type=album_type,
                    release_date=release_date,
                    duration_ms=track.get("duration_ms", 0),
                ))
            
            if results["next"] is None:
                break
            offset += limit
        
        # 3. Update Cache
        if current_snapshot_id:
            try:
                # Serialize tracks to dicts for JSON storage
                tracks_json = [t.model_dump() for t in tracks]
                
                if cached:
                    cached.snapshot_id = current_snapshot_id
                    cached.tracks = tracks_json
                else:
                    new_cache = PlaylistCacheDB(
                        playlist_id=playlist_id,
                        snapshot_id=current_snapshot_id,
                        tracks=tracks_json
                    )
                    self.db.add(new_cache)
                
                self.db.commit()
            except Exception as e:
                print(f"Failed to update playlist cache: {e}")
                self.db.rollback()
        
        return tracks
    
    def get_liked_songs(self) -> List[TrackInfo]:
        """Fetch user's liked songs with smart caching (Check count first)."""
        sp = self.get_spotify_client()
        if not sp:
            return []
        
        try:
            # 1. Light check: Get total count only (limit=1)
            # This costs 1 API call but saves dozens if the list hasn't changed.
            check = sp.current_user_saved_tracks(limit=1, offset=0)
            remote_total = check["total"]
            
            # 2. Check Cache
            from app.models import LikedSongsCacheDB
            # We use a fixed key since we assumed single-user for now, or match on authenticated user ID
            user = self.get_user_info() 
            uid = user["id"] if user else "current_user"
            
            cached = self.db.query(LikedSongsCacheDB).filter(LikedSongsCacheDB.user_id == uid).first()
            
            if cached:
                # If counts match and not too old (24h), assume valid
                # We trust the count because 'Liked Songs' is an append-mostly log.
                # Even if user deleted 1 and added 1 (rare exact timing), the consequence is just missing 1 ignore rule.
                if cached.total_count == remote_total and (datetime.now() - cached.last_updated) < timedelta(hours=24):
                    print(f"[{datetime.now()}] [LikedSongs] Smart Cache HIT: Count {remote_total} matches. Returning cached.")
                    return [TrackInfo(**t) for t in cached.tracks]
            
            print(f"[{datetime.now()}] [LikedSongs] Cache MISS (Remote: {remote_total}, Cached: {cached.total_count if cached else 'None'}). Fetching full list...")
            
        except Exception as e:
            print(f"[{datetime.now()}] [LikedSongs] Cache check failed: {e}")

        # 3. Fetch Full List (Pagination)
        tracks = []
        offset = 0
        limit = 50
        
        while True:
            try:
                # We can skip the first call if we already did it for the check? 
                # Actually simpler to just restart loop cleanly or optimize later.
                results = sp.current_user_saved_tracks(limit=limit, offset=offset)
                
                if not results or "items" not in results:
                    break
                    
                for item in results["items"]:
                    track = item["track"]
                    if not track:
                        continue
                    
                    uri = track.get("uri", "")
                    track_id = track.get("id") or uri
                    
                    if not track.get("id") and not uri.startswith("spotify:local"):
                        continue
                    
                    name = track.get("name") or "Unknown"
                    artist = ", ".join(a["name"] for a in track["artists"]) if track.get("artists") else "Unknown Artist"
                    album = (track["album"].get("name") or "Unknown Album") if track.get("album") else "Unknown Album"
                    album_type = (track["album"].get("album_type") or "unknown") if track.get("album") else "unknown"
                    release_date = (track["album"].get("release_date") or "") if track.get("album") else ""

                    if uri.startswith("spotify:local"):
                        parts = uri.split(":")
                        if len(parts) >= 6:
                            if not artist or artist == "Unknown Artist":
                                artist = unquote(parts[2].replace("+", " "))
                            if not album or album == "Unknown Album":
                                album = unquote(parts[3].replace("+", " "))
                            if not name or name == "Unknown":
                                name = unquote(parts[4].replace("+", " "))
                        
                        artist = unquote(artist.replace("+", " "))
                        name = unquote(name.replace("+", " "))
                        album = unquote(album.replace("+", " "))

                    tracks.append(TrackInfo(
                        id=track_id,
                        uri=uri,
                        name=name,
                        artist=artist,
                        album=album,
                        album_type=album_type,
                        release_date=release_date,
                        duration_ms=track.get("duration_ms", 0),
                    ))
                
                if results["next"] is None:
                    break
                offset += limit
                
                # Safety throttling
                time.sleep(1.0)
            except Exception as e:
                print(f"Error fetching liked songs batch: {e}")
                # Return what we have
                break
        
        # 4. Save to Cache
        if tracks:
            try:
                from app.models import LikedSongsCacheDB
                tracks_json = [t.model_dump() for t in tracks]
                
                user = self.get_user_info() 
                uid = user["id"] if user else "current_user"
                
                cached = self.db.query(LikedSongsCacheDB).filter(LikedSongsCacheDB.user_id == uid).first()
                if not cached:
                    cached = LikedSongsCacheDB(
                        user_id=uid,
                        total_count=len(tracks),
                        tracks=tracks_json
                    )
                    self.db.add(cached)
                else:
                    cached.total_count = len(tracks)
                    cached.tracks = tracks_json
                    cached.last_updated = datetime.now()
                
                self.db.commit()
                print(f"[{datetime.now()}] [LikedSongs] Cache updated ({len(tracks)} tracks).")
            except Exception as e:
                print(f"Failed to update liked songs cache: {e}")
                self.db.rollback()

        return tracks
    
    def get_liked_song_uris(self) -> Set[str]:
        """Get set of liked song URIs for filtering."""
        tracks = self.get_liked_songs()
        return {t.uri for t in tracks}
    
    def clear_playlist(self, playlist_id: str):
        """Remove all tracks from a playlist."""
        sp = self.get_spotify_client()
        if not sp:
            raise Exception("Not authenticated")
        
        # Get all track URIs first
        tracks = self.get_playlist_tracks(playlist_id)
        if not tracks:
            return
        
        # Remove in batches of 100
        for i in range(0, len(tracks), 100):
            batch = tracks[i:i+100]
            sp.playlist_remove_all_occurrences_of_items(
                playlist_id,
                [t.uri for t in batch]
            )
    
    def add_tracks_to_playlist(self, playlist_id: str, uris: List[str]):
        """Add tracks to a playlist (excluding local files and malformed URIs)."""
        sp = self.get_spotify_client()
        if not sp or not uris:
            return
        
        # Filter for valid Spotify URIs (must be track or episode, non-empty, and NOT local)
        spotify_uris = [
            u for u in uris 
            if u and isinstance(u, str) and 
            (u.startswith("spotify:track:") or u.startswith("spotify:episode:"))
        ]
        
        if not spotify_uris:
            return
            
        # Batch in 100s
        for i in range(0, len(spotify_uris), 100):
            try:
                sp.playlist_add_items(playlist_id, spotify_uris[i:i+100])
            except Exception as e:
                print(f"[{datetime.now()}] [Error] Failed to add tracks batch {i}-{i+100}: {e}")
                raise

    def reorder_playlist_tracks(self, playlist_id: str, uris: List[str], on_progress=None, track_details: dict = None):
        """
        Reorder tracks in a playlist to match the given list of URIs exactly.
        
        Note: Local files (spotify:local:...) CANNOT be added or removed via API.
        They can only be reordered (moved) internally.
        """
        sp = self.get_spotify_client()
        if not sp:
            raise Exception("Not authenticated")

        if track_details is None:
            track_details = {}

        # 1. Sanitize input URIs (Filter out None, empty strings, etc.)
        target_uris = [u for u in uris if u and isinstance(u, str) and ":" in u]

        if on_progress:
            on_progress(0, len(target_uris))

        # 2. Fetch current state
        print(f"[{datetime.now()}] [REORDER] Fetching current playlist state...")
        current_tracks = self.get_playlist_tracks(playlist_id)
        current_uris = [t.uri for t in current_tracks]
        
        print(f"[{datetime.now()}] [REORDER] Playlist state: {len(current_uris)} current, {len(target_uris)} target.")
        
        # 3. Handle Local Files (API Restrictions)
        target_local = [u for u in target_uris if u.startswith("spotify:local")]
        current_local = [u for u in current_uris if u.startswith("spotify:local")]
        missing_local = [u for u in target_local if u not in set(current_local)]
        
        warning_msg = None
        if missing_local:
            print(f"[{datetime.now()}] [REORDER] Warning: {len(missing_local)} local files missing. API cannot add these.")
            missing_lines = []
            for uri in missing_local[:100]:
                info = track_details.get(uri)
                if info:
                    if hasattr(info, 'artist'):
                        line = f"- {info.artist} - {info.name} • {info.album} ({info.release_date or 'No Date'})"
                    else:
                        line = f"- {info.get('artist')} - {info.get('name')} • {info.get('album')} ({info.get('release_date') or 'No Date'})"
                else:
                    parts = uri.split(":")
                    if len(parts) >= 6:
                        line = f"- {unquote(parts[2])} - {unquote(parts[4])} • {unquote(parts[3])}"
                    else:
                        line = f"- {uri}"
                missing_lines.append(line)

            suffix = f"\n... ({len(missing_local) - 100} more)" if len(missing_local) > 100 else ""
            formatted_list = "\n".join(missing_lines)
            warning_msg = f"Skipped {len(missing_local)} local files (API restriction):\n{formatted_list}{suffix}\n\nPlease manually copy these files to the target device/playlist."

        # 4. ADD Phase (Standard tracks only)
        target_standard = [u for u in target_uris if not u.startswith("spotify:local")]
        current_uris_set = set(current_uris)
        missing_standard = [u for u in target_standard if u not in current_uris_set]

        if missing_standard:
            print(f"[{datetime.now()}] [REORDER] ADD Phase: Adding {len(missing_standard)} standard tracks...")
            self.add_tracks_to_playlist(playlist_id, missing_standard)
            # Optimization: Manually update local state instead of re-fetching from Spotify
            current_uris.extend(missing_standard)
            current_uris_set = set(current_uris)

        # 5. DELETE Phase (Standard tracks only)
        # Note: We CANNOT remove local files via API. They will persist in the playlist.
        target_counts = {}
        for uri in target_uris:
            target_counts[uri] = target_counts.get(uri, 0) + 1
            
        to_remove = []
        kept_mask = [True] * len(current_uris)
        current_kept_counts = {}
        
        for i, uri in enumerate(current_uris):
            count = current_kept_counts.get(uri, 0)
            max_allowed = target_counts.get(uri, 0)
            
            if count < max_allowed:
                current_kept_counts[uri] = count + 1
            else:
                # If it's a local file, we CAN'T delete it. We must leave it and just reorder it to the bottom?
                # For now, we skip it to avoid the 400 error.
                if uri.startswith("spotify:local"):
                    continue
                    
                kept_mask[i] = False
                to_remove.append({"uri": uri, "positions": [i]})

        if to_remove:
            print(f"[{datetime.now()}] [REORDER] DELETE Phase: Removing {len(to_remove)} excess standard tracks...")
            # Batch in 100s
            for i in range(0, len(to_remove), 100):
                batch = to_remove[i:i+100]
                try:
                    sp.playlist_remove_specific_occurrences_of_items(playlist_id, batch)
                except Exception as e:
                    print(f"[{datetime.now()}] [Error] Failed removal batch: {e}")
            
            # Optimization: Manually update local state
            current_uris = [uri for i, uri in enumerate(current_uris) if kept_mask[i]]

        # 6. REORDER Phase
        # We try to match target_uris as closely as possible. 
        # Local files that couldn't be removed will be pushed to the bottom.
        actual_target = []
        pool_counts = {}
        for u in current_uris:
            pool_counts[u] = pool_counts.get(u, 0) + 1
            
        for u in target_uris:
            if pool_counts.get(u, 0) > 0:
                actual_target.append(u)
                pool_counts[u] -= 1

        total_to_check = len(actual_target)
        print(f"[{datetime.now()}] [REORDER] REORDER Phase: Moving {total_to_check} items into place...")
        
        for i in range(total_to_check):
            if on_progress and (i % 20 == 0 or i == total_to_check - 1):
                on_progress(i, total_to_check)

            if i >= len(current_uris): break
                
            wanted_uri = actual_target[i]
            if current_uris[i] == wanted_uri:
                continue
                
            # Find it later in the list
            found_idx = -1
            for j in range(i + 1, len(current_uris)):
                if current_uris[j] == wanted_uri:
                    found_idx = j
                    break
            
            if found_idx != -1:
                try:
                    sp.playlist_reorder_items(
                        playlist_id,
                        range_start=found_idx,
                        insert_before=i,
                        range_length=1
                    )
                    item = current_uris.pop(found_idx)
                    current_uris.insert(i, item)
                except Exception as e:
                    print(f"[{datetime.now()}] [REORDER] Reorder failed at index {i}: {e}")
                    if "400" in str(e): # Stop if we hit 400s here too
                        break
        
        if on_progress:
            on_progress(len(target_uris), len(target_uris))
            
        return warning_msg

    def replace_playlist_tracks(self, playlist_id: str, uris: List[str], on_progress=None, track_details: dict = None):
        """Replace or Reorder tracks in a playlist to update its state."""
        # 0. Sanitize input URIs (Filter out None, empty strings, etc.)
        uris = [u for u in uris if u and isinstance(u, str) and ":" in u]
        
        # 1. Check if any local files are in the list. 
        # If so, we MUST use reorder to avoid deleting them permanently.
        has_local = any(u.startswith("spotify:local") for u in uris)
        
        if has_local:
            print(f"[{datetime.now()}] Local files detected. Using reorder strategy for {playlist_id}")
            return self.reorder_playlist_tracks(playlist_id, uris, on_progress=on_progress, track_details=track_details)
            
        # 2. Standard replace logic for pure-Spotify playlists (faster)
        sp = self.get_spotify_client()
        if not sp:
            raise Exception("Not authenticated")
        
        if not uris:
            sp.playlist_replace_items(playlist_id, [])
            return
            
        # 3. Filter for URIs Spotify actually supports for modification (track and episode)
        # We also ensure no whitespace snuck in
        spotify_uris = [u.strip() for u in uris if u.startswith("spotify:track:") or u.startswith("spotify:episode:")]
        
        if not spotify_uris and uris:
            print(f"[{datetime.now()}] Warning: All {len(uris)} tracks were filtered out as invalid or unsupported URIs.")
            return "No valid Spotify tracks found to update (all were local or malformed)."

        # Batch 1: Replace existing with these
        try:
            sp.playlist_replace_items(playlist_id, spotify_uris[:100])
            
            # Remaining Batches: Add them
            if len(spotify_uris) > 100:
                self.add_tracks_to_playlist(playlist_id, spotify_uris[100:])
        except Exception as e:
            print(f"[{datetime.now()}] [Error] API failure during playlist replace for {playlist_id}: {e}")
            # Identify the problematic URI if possible in logs
            if "Unsupported URL" in str(e):
                sample = spotify_uris[:5]
                print(f"[{datetime.now()}] Troubeshooting: First 5 URIs were: {sample}")
            raise
        
        # Invalidate Cache
        from app.models import PlaylistCacheDB
        self.db.query(PlaylistCacheDB).filter(PlaylistCacheDB.playlist_id == playlist_id).delete()
        self.db.commit()
