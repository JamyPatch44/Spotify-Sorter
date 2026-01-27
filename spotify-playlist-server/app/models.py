"""Pydantic models and SQLAlchemy ORM models."""
from sqlalchemy import Column, String, Boolean, Integer, DateTime, Text, JSON
from sqlalchemy.sql import func
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime
from app.database import Base


# ============================================================================
# SQLAlchemy ORM Models
# ============================================================================

class DynamicPlaylistConfigDB(Base):
    """Database model for dynamic playlist configurations."""
    __tablename__ = "configs"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    target_playlist_id = Column(String, nullable=False)
    target_playlist_name = Column(String, default="")
    sources = Column(JSON, default=list)  # List of source objects
    filters = Column(JSON, default=dict)  # Filter configuration
    update_mode = Column(String, default="replace")
    sample_per_source = Column(Integer, nullable=True)
    include_liked_songs = Column(Boolean, default=False)
    processing = Column(JSON, default=dict)  # Sort/dupe options
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())


class ScheduleDB(Base):
    """Database model for scheduled jobs."""
    __tablename__ = "schedules"
    
    id = Column(String, primary_key=True, index=True)
    config_id = Column(String, nullable=False)  # FK to configs
    cron_expression = Column(String, nullable=False)
    enabled = Column(Boolean, default=True)
    last_run = Column(DateTime, nullable=True)
    next_run = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class RunHistoryDB(Base):
    """Database model for execution history."""
    __tablename__ = "run_history"
    
    id = Column(String, primary_key=True, index=True)
    config_id = Column(String, nullable=False)
    config_name = Column(String, default="")
    started_at = Column(DateTime, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String, default="running")  # running, success, failed
    tracks_processed = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    warning_message = Column(Text, nullable=True)
    triggered_by = Column(String, default="manual")  # manual, schedule



class PlaylistCacheDB(Base):
    """Cache for playlist tracks to minimize API calls."""
    __tablename__ = "playlist_cache"
    
    playlist_id = Column(String, primary_key=True, index=True)
    snapshot_id = Column(String, nullable=False)
    tracks = Column(JSON, nullable=False)  # List of serialized TrackInfo
    last_updated = Column(DateTime, server_default=func.now(), onupdate=func.now())


class UserPlaylistsCacheDB(Base):
    """Cache for the list of user playlists."""
    __tablename__ = "user_playlists_cache"
    
    key = Column(String, primary_key=True, default="all_playlists")
    playlists = Column(JSON, nullable=False)  # List of serialized PlaylistInfo
    last_updated = Column(DateTime, server_default=func.now(), onupdate=func.now())

    last_updated = Column(DateTime, server_default=func.now(), onupdate=func.now())


class LikedSongsCacheDB(Base):
    """Cache for user's liked songs (Library)."""
    __tablename__ = "liked_songs_cache"
    
    user_id = Column(String, primary_key=True, default="current_user")
    total_count = Column(Integer, default=0)
    tracks = Column(JSON, nullable=False)  # List of serialized TrackInfo
    last_updated = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SpotifyTokenDB(Base):
    """Database model for Spotify OAuth tokens."""
    __tablename__ = "spotify_tokens"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=False)
    token_type = Column(String, default="Bearer")
    expires_at = Column(DateTime, nullable=False)
    scope = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())


class SystemConfigDB(Base):
    """Database model for system configuration (client id, secret)."""
    __tablename__ = "system_config"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)


# ============================================================================
# Pydantic Schemas
# ============================================================================

class Source(BaseModel):
    """Source for tracks in a dynamic playlist."""
    type: Literal["playlist", "likedSongs"]
    id: Optional[str] = None  # Required for playlist type


class FilterConfig(BaseModel):
    """Filter configuration for dynamic playlists."""
    exclude_liked: bool = False
    keyword_blacklist: List[str] = Field(default_factory=list)


class SortRule(BaseModel):
    """Sort rule configuration."""
    criteria: str  # Artist, Album, Track Name, Release Date, Duration
    descending: bool = False


class ProcessingOptions(BaseModel):
    """Processing options applied during playlist update."""
    apply_sort: bool = False
    apply_dupes: bool = False
    apply_versions: bool = False
    sort_rules: List[SortRule] = Field(default_factory=list)
    dupe_preference: str = ""
    version_preference: str = ""


class DynamicPlaylistConfig(BaseModel):
    """Schema for dynamic playlist configuration."""
    id: Optional[str] = None
    name: str
    target_playlist_id: str
    target_playlist_name: str = ""
    sources: List[Source]
    filters: FilterConfig = Field(default_factory=FilterConfig)
    update_mode: Literal["replace", "merge", "append"] = "replace"
    sample_per_source: Optional[int] = None
    include_liked_songs: bool = False
    processing: ProcessingOptions = Field(default_factory=ProcessingOptions)
    enabled: bool = True
    
    class Config:
        from_attributes = True


class Schedule(BaseModel):
    """Schema for schedule configuration."""
    id: Optional[str] = None
    config_id: str
    cron_expression: str
    enabled: bool = True
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class RunHistory(BaseModel):
    """Schema for run history entry."""
    id: str
    config_id: str
    config_name: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str
    tracks_processed: int = 0
    tracks_processed: int = 0
    error_message: Optional[str] = None
    warning_message: Optional[str] = None  # For partial successes (e.g. skipped local files)
    triggered_by: str = "manual"
    
    class Config:
        from_attributes = True


class PlaylistInfo(BaseModel):
    """Basic playlist information from Spotify."""
    id: str
    name: str
    owner: str
    editable: bool
    track_count: int
    image_url: Optional[str] = None


class TrackInfo(BaseModel):
    """Track information for display."""
    id: str
    uri: str
    name: str
    artist: str
    album: str
    album_type: Optional[str] = "unknown"
    release_date: Optional[str] = ""
    duration_ms: int


class AuthStatus(BaseModel):
    """Authentication status response."""
    authenticated: bool
    user_name: Optional[str] = None
    user_id: Optional[str] = None
