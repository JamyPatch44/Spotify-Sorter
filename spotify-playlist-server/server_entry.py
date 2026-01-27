import os
import sys
import uvicorn
from app.main import app
from app.config import get_settings

if __name__ == "__main__":
    import argparse

    print(f"Starting server... Args: {sys.argv}")

    parser = argparse.ArgumentParser(description="Spotify Sorter Server")
    parser.add_argument("--port", type=int, default=27196, help="Port to run the server on")
    args = parser.parse_args()

    # Fix for PyInstaller noconsole/windowed mode where stdout/stderr might be None
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")

    settings = get_settings()
    # Start the server
    # use_colors=False is required to avoid 'isatty' check on None streams
    uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="info", use_colors=False)
