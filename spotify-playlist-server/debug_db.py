from app.database import SessionLocal
from app.models import RunHistoryDB
import time

db = SessionLocal()
last_run = db.query(RunHistoryDB).order_by(RunHistoryDB.started_at.desc()).first()
print("="*50)
print("DEBUG RESULT:")
if last_run:
    print(f"ID: {last_run.id}")
    print(f"Status: {last_run.status}")
    print(f"Warning: {last_run.warning_message}")
else:
    print("No history found")
print("="*50)
db.close()
