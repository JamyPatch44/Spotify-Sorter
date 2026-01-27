"""Configs router for dynamic playlist configurations."""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import DynamicPlaylistConfig, RunHistory
from app.services.dynamic_playlist import DynamicPlaylistService

router = APIRouter(prefix="/api/configs", tags=["configs"])


@router.get("", response_model=List[DynamicPlaylistConfig])
def get_configs(db: Session = Depends(get_db)):
    """Get all dynamic playlist configurations."""
    service = DynamicPlaylistService(db)
    return service.get_all_configs()


@router.get("/{config_id}", response_model=DynamicPlaylistConfig)
def get_config(config_id: str, db: Session = Depends(get_db)):
    """Get a specific configuration."""
    service = DynamicPlaylistService(db)
    config = service.get_config(config_id)
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    return config


@router.post("", response_model=DynamicPlaylistConfig)
def create_config(
    config: DynamicPlaylistConfig,
    db: Session = Depends(get_db)
):
    """Create a new configuration."""
    service = DynamicPlaylistService(db)
    return service.save_config(config)


@router.put("/{config_id}", response_model=DynamicPlaylistConfig)
def update_config(
    config_id: str,
    config: DynamicPlaylistConfig,
    db: Session = Depends(get_db)
):
    """Update an existing configuration."""
    service = DynamicPlaylistService(db)
    
    existing = service.get_config(config_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    config.id = config_id
    return service.save_config(config)


@router.delete("/{config_id}")
def delete_config(config_id: str, db: Session = Depends(get_db)):
    """Delete a configuration."""
    service = DynamicPlaylistService(db)
    
    if not service.delete_config(config_id):
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    return {"message": "Configuration deleted"}


@router.post("/{config_id}/run", response_model=RunHistory)
def run_config(
    config_id: str, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Execute a configuration in the background."""
    service = DynamicPlaylistService(db)
    
    try:
        # Create the record synchronously so we have an ID
        history_db = service.initialize_run(config_id, triggered_by="manual")
        
        # Pass the ID to the background task (it will re-fetch)
        # We must use a fresh DB session for the background task if we were passing the service, 
        # but since 'service.process_run' uses self.db, and self.db is 'db' from Depends(get_db),
        # that session closes when request ends.
        #
        # CRITICAL: BackgroundTasks run AFTER the response is sent. The 'db' session will be closed.
        # We need the background task to create its OWN session.
        # 
        # So we cannot call service.process_run directly if it relies on 'db'.
        # We need a wrapper function that creates a new session.
        
        background_tasks.add_task(run_background_process, history_db.id)
        
        return service._history_to_schema(history_db)
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def run_background_process(history_id: str):
    """Helper to run process with its own DB session."""
    # We need to manually get a new session here
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        service = DynamicPlaylistService(db)
        service.process_run(history_id)
    finally:
        db.close()
