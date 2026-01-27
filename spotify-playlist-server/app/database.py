"""Database setup and session management."""
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import get_settings
import os

settings = get_settings()

# Ensure data directory exists
os.makedirs(settings.data_dir, exist_ok=True)

# Create engine - use check_same_thread=False for SQLite with async
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False}
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables and perform migrations."""
    Base.metadata.create_all(bind=engine)
    
    # Simple migration: add warning_message column to run_history if missing
    with engine.connect() as conn:
        cursor = conn.execute(text("PRAGMA table_info(run_history)"))
        columns = [row[1] for row in cursor.fetchall()]
        if "warning_message" not in columns:
            print("Migration: Adding warning_message column to run_history table")
            conn.execute(text("ALTER TABLE run_history ADD COLUMN warning_message TEXT"))
            conn.commit()
