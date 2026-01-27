"""Playlists router for fetching Spotify playlists."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import PlaylistInfo, TrackInfo
from app.services.spotify_service import SpotifyService

router = APIRouter(prefix="/api/playlists", tags=["playlists"])


@router.get("", response_model=List[PlaylistInfo])
def get_playlists(refresh: bool = False, db: Session = Depends(get_db)):
    """Get all user playlists."""
    service = SpotifyService(db)
    
    if not service.is_authenticated():
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        return service.get_playlists(force_refresh=refresh)
    except Exception as e:
        import spotipy
        if (isinstance(e, spotipy.exceptions.SpotifyException) and e.http_status == 429) or "Rate limited" in str(e):
            raise HTTPException(
                status_code=429, 
                detail=str(e) if "Rate limited" in str(e) else "Spotify is rate limiting requests. Please try again in a minute."
            )
        raise e


@router.get("/{playlist_id}/tracks", response_model=List[TrackInfo])
def get_playlist_tracks(
    playlist_id: str,
    db: Session = Depends(get_db)
):
    """Get tracks from a specific playlist."""
    service = SpotifyService(db)
    
    if not service.is_authenticated():
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    return service.get_playlist_tracks(playlist_id)


@router.get("/liked", response_model=List[TrackInfo])
def get_liked_songs(db: Session = Depends(get_db)):
    """Get user's liked songs."""
    service = SpotifyService(db)
    
    if not service.is_authenticated():
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    return service.get_liked_songs()
