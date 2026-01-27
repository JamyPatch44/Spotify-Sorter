# Spotify Sorter - User Manual (Windows)

## Getting Started

### First-Time Setup

1. **Get Spotify API Credentials**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Click "Create App"
   - Fill in app name (e.g., "My Spotify Sorter") and description
   - Set Redirect URI to: `http://127.0.0.1:27196`
   - Check "Web API" under APIs
   - Click "Save"
   - Copy your **Client ID** and **Client Secret**

2. **Connect to Spotify**
   - Launch Spotify Sorter
   - Enter your Client ID and Client Secret
   - Click "Connect to Spotify"
   - Your browser will open for authorization
   - After authorizing, return to the app

> **Note**: Your credentials are saved locally and will be remembered for future sessions.

---

## Features

### 1. Playlist Selection
- Select one or more playlists to process
- Use **Ctrl+Click** to select multiple playlists
- Use **Shift+Click** to select a range
- Filter by "Editable Only" to show only playlists you can modify

### 2. Sort Tracks
Enable sorting and add rules to organize your playlist:

| Criteria | Description |
|----------|-------------|
| Release Date | Sort by when the track was released |
| Artist | Alphabetically by artist name |
| Album | Alphabetically by album name |
| Track Name | Alphabetically by song title |
| BPM | By tempo (beats per minute) |
| Energy | By energy level (0-100) |
| Danceability | By how danceable the track is |
| Valence | By musical positivity/mood |

- Drag the **grip handle** (⋮⋮) to reorder rules
- Toggle between Ascending/Descending for each rule

### 3. Manage Duplicates
Automatically detect and remove duplicate tracks:

| Preference | Keeps |
|------------|-------|
| Keep Oldest | The earliest version of the track |
| Keep Newest | The most recent version |

### 4. Version Replacer
Find and replace tracks with alternate versions (remasters, originals, etc.):

| Preference | Action |
|------------|--------|
| Newest Version | Replace with the most recent version |
 
 ### 5. Compare Playlists
 Identify differences between playlists (e.g., finding tracks in Playlist A that are missing from Playlist B).
 
  1. Select **2 or more** playlists in the list.
  2. Click the **"Compare"** button in the footer.
  3. If you haven't selected enough playlists, the button will explicitly show **"Select 2+"**.
  4. View the results to see which tracks are common across all selections.
  5. **Instant Cleanup**: Click the "Trash" icon next to a track under a specific playlist name to remove it immediately.
  
  ---
  
  ### 6. Dynamic Playlists
  Build living playlists that update themselves based on your criteria.
  
  - **Sources**: Select multiple playlists or your "Liked Songs" as the data source.
  - **Filters**: 
    - **Exclude Liked**: Automatically remove songs you've already "Liked".
    - **Keyword Blacklist**: Skip songs containing specific words in the title/artist.
  - **Rules**: Apply Sorting, Duplicates, and Version replacement logic to the result.
  - **Sync**: Click the "Play" icon to run a sync manually, or "Edit" to change rules.
  
  ---
  
  ### 7. Automation Server
  For 24/7 background updates, you can run the standalone Server application (or Docker container).
  
  1. **Dashboard**: View upcoming runs and execution history.
  2. **Schedules**: Set your dynamic playlists to run on a timer (Daily, Weekly, etc.).
  3. **Auto-Run**: The server will wake up, process your rules, and update Spotify without you needing to open the app.
 
 ---
 
 ## Running the Process
 
 1. Select your playlists
 2. Configure sorting rules, duplicate handling, and version options
 3. Click **"Run Process"**
 4. Review proposed changes
 5. Approve or reject individual changes
 6. Changes are applied to Spotify
 
 ---
 
 ## Backup & Restore
 
 - **Automatic Backups**: Created before every change
 - **Manual Backup**: Use "Backup / Restore" to create a snapshot
 - **Restore**: Select a backup to restore a playlist to its previous state
 
 Backups are stored locally in `%LOCALAPPDATA%\Spotify Sorter\backups\`
 
 ---
 
 View and manage all past operations.
- **Details**: Click an entry to see exactly which tracks were moved or changed.
- **Undo (Restore)**: Click 'Undo' to roll back a specific session.
- **Delete**: Remove a single history entry to keep your logs clean.
- **Clear All**: Reset your entire history for a fresh start.
- **Persistent Backups**: The history is synchronized with your local backups folder.
 
 ---
 
 ## Export Options
 
 ### Automation Config
 Export your current settings (sort rules, preferences) as a JSON file for reuse.
 
 ### CSV Export
 Export playlist track data as a spreadsheet-compatible CSV file.
 
 ### M3U Export
 Export playlist metadata as `.m3u` files. 
 - Useful for importing your Spotify playlists into local music players or DJ software (like Rekordbox).
 - **Note**: This only exports track information; it does not download audio files.

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Select multiple playlists | Ctrl + Click |
| Select range | Shift + Click |

---

---

## System Tray Integration

Spotify Sorter includes a powerful system tray icon for quick access and background automation.

### 1. Quick Actions
Right-click the Spotify Sorter icon in your system tray to:
- **Show Window**: Quickly bring the main application to the front.
- **Manage Schedules...**: Open the native Desktop Scheduling manager directly.
- **Open Backups Folder**: Jump straight to your playlist database snapshots.
- **Open Exports Folder**: Access your exported CSV and M3U files instantly.
- **Run All Dynamic Updates**: Trigger a sync for all your dynamic playlists at once.
- **Individual Updates**: You will see a list of your dynamic playlists (e.g., "Update: My Summer Mix"). Click any of them to run just that specific update.

### 2. Desktop Background Automation
The application can run minimized in the tray while your schedules are active. 
- **Manage Schedules**: Click the "Calendar" icon next to the "Dynamic Playlists" section (or access via Tray) to set specific timers for each playlist.
- **Background Persistence**: As long as the tray icon is present, your **Desktop Schedules** will continue to run in the background.
- **Launch on Startup**: Enable this in the **App Settings (Cog icon)** to ensure automation starts as soon as you log in to Windows.

---

## Application Settings

Access global behavior rules by clicking the **Cog (⚙️) icon** in the top-right title bar.

| Setting | Effect |
|---------|--------|
| **Launch on Startup** | Automatically starts the application when you log into Windows. |
| **Start Minimized** | Launches the app directly into the system tray without showing the main window. |
| **Close to Tray** | Clicking the 'X' button hides the app to the tray instead of exiting entirely. |

---

## Troubleshooting

### "Failed to connect"
- Verify your Client ID and Client Secret are correct
- Ensure `http://127.0.0.1:27196` is in your Spotify app's Redirect URIs

### "Port 27196 in use"
- Close any other applications using port 27196
- Restart Spotify Sorter

### Changes not appearing in Spotify
- Changes may take a few seconds to sync
- Try refreshing your Spotify client
