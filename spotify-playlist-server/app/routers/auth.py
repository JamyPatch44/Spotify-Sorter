"""Authentication router for Spotify OAuth."""
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuthStatus
from app.services.spotify_service import SpotifyService
from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.get("/login")
def login(db: Session = Depends(get_db)):
    """Redirect to Spotify authorization page."""
    service = SpotifyService(db)
    auth_url = service.get_auth_url()
    return RedirectResponse(url=auth_url)


@router.get("/callback")
def callback(
    code: str = Query(...),
    db: Session = Depends(get_db)
):
    """Handle OAuth callback from Spotify."""
    service = SpotifyService(db)
    success = service.handle_callback(code)
    
    if success:
        # Redirect to frontend dashboard
        # In debug mode, redirect to the Vite dev server
        if settings.debug:
            return RedirectResponse(url="http://localhost:5173")
        return RedirectResponse(url="/")
    else:
        url = "http://localhost:5173/?error=auth_failed" if settings.debug else "/?error=auth_failed"
        return RedirectResponse(url=url)


@router.get("/status", response_model=AuthStatus)
def get_status(db: Session = Depends(get_db)):
    """Check authentication status."""
    service = SpotifyService(db)
    
    if not service.is_authenticated():
        return AuthStatus(authenticated=False)
    
    user = service.get_user_info()
    if user:
        return AuthStatus(
            authenticated=True,
            user_name=user.get("display_name"),
            user_id=user.get("id"),
        )
    
    return AuthStatus(authenticated=False)


@router.post("/logout")
def logout(db: Session = Depends(get_db)):
    """Log out and clear tokens."""
    service = SpotifyService(db)
    service.logout()
    return {"message": "Logged out"}


from pydantic import BaseModel

class SystemConfig(BaseModel):
    client_id: str
    client_secret: str

@router.post("/configure")
def configure(config: SystemConfig, db: Session = Depends(get_db)):
    """Configure system credentials."""
    from app.models import SystemConfigDB
    
    # Update Client ID
    cid = db.query(SystemConfigDB).filter(SystemConfigDB.key == "spotify_client_id").first()
    if not cid:
        cid = SystemConfigDB(key="spotify_client_id", value=config.client_id)
        db.add(cid)
    else:
        cid.value = config.client_id
        
    # Update Client Secret
    csecret = db.query(SystemConfigDB).filter(SystemConfigDB.key == "spotify_client_secret").first()
    if not csecret:
        csecret = SystemConfigDB(key="spotify_client_secret", value=config.client_secret)
        db.add(csecret)
    else:
        csecret.value = config.client_secret
        
    db.commit()
    return {"status": "configured"}


@router.get("/config-status")
def get_config_status(db: Session = Depends(get_db)):
    """Check if system credentials are configured."""
    from app.models import SystemConfigDB
    cid = db.query(SystemConfigDB).filter(SystemConfigDB.key == "spotify_client_id").first()
    csecret = db.query(SystemConfigDB).filter(SystemConfigDB.key == "spotify_client_secret").first()
    
    return {
        "configured": bool(cid and cid.value and csecret and csecret.value),
        "has_client_id": bool(cid and cid.value)
    }
