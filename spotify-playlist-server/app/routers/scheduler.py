"""Scheduler router for managing scheduled jobs."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.models import Schedule
from app.services.scheduler_service import SchedulerService

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


class CreateScheduleRequest(BaseModel):
    config_id: str
    cron_expression: str
    enabled: bool = True


class UpdateScheduleRequest(BaseModel):
    cron_expression: Optional[str] = None
    enabled: Optional[bool] = None


@router.get("", response_model=List[Schedule])
def get_schedules(db: Session = Depends(get_db)):
    """Get all schedules."""
    service = SchedulerService(db)
    return service.get_all_schedules()


@router.get("/next-runs")
def get_next_runs(
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Get upcoming scheduled runs."""
    service = SchedulerService(db)
    return service.get_next_runs(limit)


@router.get("/config/{config_id}", response_model=List[Schedule])
def get_schedules_for_config(
    config_id: str,
    db: Session = Depends(get_db)
):
    """Get schedules for a specific config."""
    service = SchedulerService(db)
    return service.get_schedules_for_config(config_id)


@router.get("/{schedule_id}", response_model=Schedule)
def get_schedule(schedule_id: str, db: Session = Depends(get_db)):
    """Get a specific schedule."""
    service = SchedulerService(db)
    schedule = service.get_schedule(schedule_id)
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return schedule


@router.post("", response_model=Schedule)
def create_schedule(
    request: CreateScheduleRequest,
    db: Session = Depends(get_db)
):
    """Create a new schedule."""
    service = SchedulerService(db)
    
    try:
        return service.create_schedule(
            config_id=request.config_id,
            cron_expression=request.cron_expression,
            enabled=request.enabled,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{schedule_id}", response_model=Schedule)
def update_schedule(
    schedule_id: str,
    request: UpdateScheduleRequest,
    db: Session = Depends(get_db)
):
    """Update a schedule."""
    service = SchedulerService(db)
    
    try:
        schedule = service.update_schedule(
            schedule_id=schedule_id,
            cron_expression=request.cron_expression,
            enabled=request.enabled,
        )
        
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        
        return schedule
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: str, db: Session = Depends(get_db)):
    """Delete a schedule."""
    service = SchedulerService(db)
    
    if not service.delete_schedule(schedule_id):
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return {"message": "Schedule deleted"}
