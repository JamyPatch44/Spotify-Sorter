"""Scheduler service using APScheduler."""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from datetime import datetime
from typing import List, Optional
import uuid

from sqlalchemy.orm import Session
from croniter import croniter

from app.config import get_settings
from app.database import SessionLocal
from app.models import Schedule, ScheduleDB

settings = get_settings()

# Global scheduler instance
_scheduler: Optional[BackgroundScheduler] = None


def get_scheduler() -> BackgroundScheduler:
    """Get or create the scheduler instance."""
    global _scheduler
    
    if _scheduler is None:
        jobstores = {
            'default': SQLAlchemyJobStore(url=settings.database_url)
        }
        
        _scheduler = BackgroundScheduler(jobstores=jobstores)
        _scheduler.start()
    
    return _scheduler


def run_scheduled_job(config_id: str):
    """Job function that runs a dynamic playlist config."""
    from app.services.dynamic_playlist import DynamicPlaylistService
    
    db = SessionLocal()
    try:
        service = DynamicPlaylistService(db)
        service.run_config(config_id, triggered_by="schedule")
        
        # Update last_run in schedule
        schedule = db.query(ScheduleDB).filter(
            ScheduleDB.config_id == config_id
        ).first()
        if schedule:
            schedule.last_run = datetime.now()
            # Calculate next run
            cron = croniter(schedule.cron_expression, datetime.now())
            schedule.next_run = cron.get_next(datetime)
            db.commit()
            
    except Exception as e:
        print(f"Scheduled job error for {config_id}: {e}")
    finally:
        db.close()


class SchedulerService:
    """Service for managing scheduled jobs."""
    
    def __init__(self, db: Session):
        self.db = db
        self.scheduler = get_scheduler()
    
    def get_all_schedules(self) -> List[Schedule]:
        """Get all schedules."""
        db_schedules = self.db.query(ScheduleDB).all()
        return [self._db_to_schema(s) for s in db_schedules]
    
    def get_schedule(self, schedule_id: str) -> Optional[Schedule]:
        """Get a schedule by ID."""
        db_schedule = self.db.query(ScheduleDB).filter(
            ScheduleDB.id == schedule_id
        ).first()
        
        if db_schedule:
            return self._db_to_schema(db_schedule)
        return None
    
    def get_schedules_for_config(self, config_id: str) -> List[Schedule]:
        """Get all schedules for a config."""
        db_schedules = self.db.query(ScheduleDB).filter(
            ScheduleDB.config_id == config_id
        ).all()
        return [self._db_to_schema(s) for s in db_schedules]
    
    def create_schedule(
        self,
        config_id: str,
        cron_expression: str,
        enabled: bool = True
    ) -> Schedule:
        """Create a new schedule."""
        # Validate cron expression
        try:
            cron = croniter(cron_expression)
            next_run = cron.get_next(datetime)
        except Exception as e:
            raise ValueError(f"Invalid cron expression: {e}")
        
        schedule_id = str(uuid.uuid4())[:8]
        
        # Create database entry
        db_schedule = ScheduleDB(
            id=schedule_id,
            config_id=config_id,
            cron_expression=cron_expression,
            enabled=enabled,
            next_run=next_run,
        )
        self.db.add(db_schedule)
        self.db.commit()
        
        # Add to scheduler if enabled
        if enabled:
            self._add_job(schedule_id, config_id, cron_expression)
        
        return self._db_to_schema(db_schedule)
    
    def update_schedule(
        self,
        schedule_id: str,
        cron_expression: Optional[str] = None,
        enabled: Optional[bool] = None
    ) -> Optional[Schedule]:
        """Update a schedule."""
        db_schedule = self.db.query(ScheduleDB).filter(
            ScheduleDB.id == schedule_id
        ).first()
        
        if not db_schedule:
            return None
        
        # Remove old job
        self._remove_job(schedule_id)
        
        # Update fields
        if cron_expression is not None:
            try:
                cron = croniter(cron_expression)
                db_schedule.cron_expression = cron_expression
                db_schedule.next_run = cron.get_next(datetime)
            except Exception as e:
                raise ValueError(f"Invalid cron expression: {e}")
        
        if enabled is not None:
            db_schedule.enabled = enabled
        
        self.db.commit()
        
        # Re-add job if enabled
        if db_schedule.enabled:
            self._add_job(
                schedule_id,
                db_schedule.config_id,
                db_schedule.cron_expression
            )
        
        return self._db_to_schema(db_schedule)
    
    def delete_schedule(self, schedule_id: str) -> bool:
        """Delete a schedule."""
        self._remove_job(schedule_id)
        
        result = self.db.query(ScheduleDB).filter(
            ScheduleDB.id == schedule_id
        ).delete()
        self.db.commit()
        
        return result > 0
    
    def load_all_schedules(self):
        """Load all enabled schedules into the scheduler (called on startup)."""
        schedules = self.db.query(ScheduleDB).filter(
            ScheduleDB.enabled == True
        ).all()
        
        for schedule in schedules:
            self._add_job(
                schedule.id,
                schedule.config_id,
                schedule.cron_expression
            )
            
            # Update next_run
            try:
                cron = croniter(schedule.cron_expression, datetime.now())
                schedule.next_run = cron.get_next(datetime)
            except:
                pass
        
        self.db.commit()
        print(f"Loaded {len(schedules)} schedules")
    
    def get_next_runs(self, limit: int = 10) -> List[dict]:
        """Get upcoming scheduled runs."""
        schedules = self.db.query(ScheduleDB).filter(
            ScheduleDB.enabled == True
        ).order_by(ScheduleDB.next_run).limit(limit).all()
        
        result = []
        for s in schedules:
            # Get config name
            from app.models import DynamicPlaylistConfigDB
            config = self.db.query(DynamicPlaylistConfigDB).filter(
                DynamicPlaylistConfigDB.id == s.config_id
            ).first()
            
            result.append({
                "schedule_id": s.id,
                "config_id": s.config_id,
                "config_name": config.name if config else "Unknown",
                "cron_expression": s.cron_expression,
                "next_run": s.next_run.isoformat() if s.next_run else None,
            })
        
        return result
    
    def _add_job(self, schedule_id: str, config_id: str, cron_expression: str):
        """Add a job to the scheduler."""
        try:
            # Parse cron expression (APScheduler format)
            parts = cron_expression.split()
            if len(parts) == 5:
                minute, hour, day, month, day_of_week = parts
                
                self.scheduler.add_job(
                    run_scheduled_job,
                    CronTrigger(
                        minute=minute,
                        hour=hour,
                        day=day,
                        month=month,
                        day_of_week=day_of_week,
                    ),
                    id=f"schedule_{schedule_id}",
                    args=[config_id],
                    replace_existing=True,
                )
        except Exception as e:
            print(f"Failed to add job {schedule_id}: {e}")
    
    def _remove_job(self, schedule_id: str):
        """Remove a job from the scheduler."""
        job_id = f"schedule_{schedule_id}"
        try:
            self.scheduler.remove_job(job_id)
        except:
            pass  # Job might not exist
    
    def _db_to_schema(self, db: ScheduleDB) -> Schedule:
        """Convert database model to schema."""
        return Schedule(
            id=db.id,
            config_id=db.config_id,
            cron_expression=db.cron_expression,
            enabled=db.enabled,
            last_run=db.last_run,
            next_run=db.next_run,
        )
