"""History router for execution logs."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import RunHistory
from app.services.dynamic_playlist import DynamicPlaylistService

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=List[RunHistory])
def get_history(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get recent execution history."""
    service = DynamicPlaylistService(db)
    return service.get_history(limit)


@router.delete("")
def delete_history(
    db: Session = Depends(get_db)
):
    """Clear all execution history."""
    service = DynamicPlaylistService(db)
    count = service.delete_history()
    return {"message": f"Deleted {count} history entries"}


@router.delete("/{history_id}")
def delete_history_item(
    history_id: str,
    db: Session = Depends(get_db)
):
    """Delete a single history entry."""
    service = DynamicPlaylistService(db)
    success = service.delete_history_item(history_id)
    if not success:
        raise HTTPException(status_code=404, detail="History item not found")
    return {"message": "Deleted"}
