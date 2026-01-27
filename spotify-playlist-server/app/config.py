"""Configuration settings for the application."""
from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Spotify OAuth
    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    spotify_redirect_uri: str = "http://localhost:27196/auth/callback"
    
    # Application
    app_name: str = "Spotify Playlist Automation Server"
    debug: bool = False
    
    # Database
    database_url: str = "sqlite:///./data/spas.db"
    
    # Paths
    data_dir: str = "./data"
    
    # Server
    host: str = "0.0.0.0"
    port: int = 27196
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    settings = Settings()
    
    # Update database_url to match actual data_dir (which might be from env var)
    # This ensures we don't write to ./data when DATA_DIR is set (e.g. by Electron/Tauri)
    env_data_dir = os.getenv("DATA_DIR")
    if env_data_dir:
         print(f"[Config] Found DATA_DIR env var: {env_data_dir}")
         settings.data_dir = env_data_dir
         
         import pathlib
         path = pathlib.Path(settings.data_dir).absolute() / "spas.db"
         # SQLite URLs need forward slashes even on Windows
         settings.database_url = f"sqlite:///{path.as_posix()}"
         print(f"[Config] Updated database_url to: {settings.database_url}")
    else:
         print("[Config] No DATA_DIR env var found, using default.")
         
    return settings
