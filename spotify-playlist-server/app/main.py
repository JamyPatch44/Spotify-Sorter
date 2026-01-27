"""FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import os
import sys

from app.config import get_settings
from app.database import init_db, SessionLocal
from app.routers import auth, playlists, configs, scheduler, history
from app.services.scheduler_service import SchedulerService

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    print("Initializing database...")
    init_db()
    
    print("Loading scheduled jobs...")
    db = SessionLocal()
    try:
        scheduler_service = SchedulerService(db)
        scheduler_service.load_all_schedules()
    finally:
        db.close()
    
    print("Spotify Playlist Automation Server started!")
    
    yield
    
    # Shutdown
    print("Shutting down scheduler...")
    from app.services.scheduler_service import get_scheduler
    scheduler = get_scheduler()
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="Spotify Playlist Automation Server",
    description="Self-hosted dynamic playlist management with scheduling",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(playlists.router)
app.include_router(configs.router)
app.include_router(scheduler.router)
app.include_router(history.router)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# Serve static frontend files
# Handle path for PyInstaller (frozen) vs Dev
if getattr(sys, 'frozen', False):
    # Running in a bundle
    basedir = sys._MEIPASS
    frontend_path = os.path.join(basedir, "frontend", "dist")
else:
    # Running in a normal Python environment
    frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.exists(frontend_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")
    
    @app.get("/")
    async def serve_frontend():
        return FileResponse(os.path.join(frontend_path, "index.html"))
    
    @app.get("/{path:path}")
    async def serve_frontend_routes(path: str):
        # Try to serve static file first
        file_path = os.path.join(frontend_path, path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        # Fall back to index.html for SPA routing
        return FileResponse(os.path.join(frontend_path, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
