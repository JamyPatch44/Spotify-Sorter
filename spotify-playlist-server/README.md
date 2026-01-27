# Spotify Playlist Automation Server (Web)

The headless companion to the Spotify Sorter desktop app. This service is designed to run 24/7 on a home server or cloud instance to keep your dynamic playlists updated automatically.

## Features

- **Web Dashboard**: Monitor your automation status from any device.
- **Automated Scheduling**: Set playlists to sync on a recurring schedule (Daily, Weekly, etc.).
- **Headless Execution**: Once configured, it runs entirely in the background without user intervention.
- **Docker Ready**: Easy deployment on Unraid, Synology, or any Docker-compatible system.
- **History Logs**: Detailed execution history for every scheduled run.

## Setup & Deployment

### 1. Environment Configuration
Copy `.env.example` to `.env` and provide your Spotify API credentials:

```env
SPOTIFY_CLIENT_ID=your_id
SPOTIFY_CLIENT_SECRET=your_secret
SPOTIFY_REDIRECT_URI=http://your-server-ip:27196/auth/callback
```

### 2. Run with Docker
The easiest way to run the server is using the provided Docker configuration.

```bash
docker build -t spotify-sorter-web .
docker run -p 27196:27196 \
  --env-file .env \
  -v ./data:/app/data \
  spotify-sorter-web
```

### 3. Unraid Integration
An `unraid-template.xml` is provided in this directory for easy installation via the Unraid "Docker" tab (Add Container > Advanced View > Upload Template).

## Authentication Flow

1. Access the web UI at `http://your-server-ip:27196`.
2. Click **Login with Spotify**.
3. After authorization, your session will be saved to the database in the `/app/data` volume.
4. Configure your Dynamic Playlists and Schedules via the web interface.

## Tech Stack
- **Backend**: FastAPI (Python 3.11)
- **Frontend**: React, Vite, Tailwind CSS
- **Database**: SQLite (SQLAlchemy)
- **Task Runner**: APScheduler
