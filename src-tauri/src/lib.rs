#[macro_use]
pub mod debug_log;
pub mod commands;
pub mod dynamic;
pub mod logic;
pub mod scheduler;
pub mod spotify;
pub mod tray;

use spotify::SpotifyState;
use std::sync::Mutex;
use tauri::Manager;
// use tauri_plugin_store::StoreBuilder;
use tauri_plugin_store::StoreExt;

pub struct AppState {
    pub spotify: Mutex<SpotifyState>,
    pub history_lock: Mutex<()>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init()) // Add Shell Plugin
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        )) // Allow args
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState {
            spotify: Mutex::new(SpotifyState::default()),
            history_lock: Mutex::new(()),
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app_handle = window.app_handle();
                // Check close_to_tray setting
                if let Ok(store) = app_handle.store("settings.json") {
                    let close_to_tray = store
                        .get("close_to_tray")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                    if close_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .setup(|app| {
            let win = app.get_webview_window("main").unwrap();

            // Initialize Tray
            tray::create_tray(app.handle())?;

            // Check if we should start minimized
            if let Ok(store) = app.store("settings.json") {
                let start_minimized = store
                    .get("start_minimized")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                if !start_minimized {
                    win.show().unwrap();
                }
            } else {
                // If no store yet, just show it
                win.show().unwrap();
            }

            // Start Scheduler
            scheduler::start_scheduler_loop(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_auth,
            commands::initialize_spotify,
            commands::logout,
            commands::scan_playlist,
            commands::apply_changes,
            commands::open_url,
            commands::create_backup,
            commands::open_backup_folder,
            commands::restore_snapshot,
            commands::remove_ignored_tracks,
            commands::export_automation_config,
            commands::export_csv,
            commands::get_history,
            commands::delete_history_item,
            commands::clear_history,
            commands::get_ignored_tracks,
            commands::get_backups,
            commands::restore_from_file,
            commands::get_dynamic_configs,
            commands::save_dynamic_config,
            commands::delete_dynamic_config,
            commands::run_dynamic_update,
            commands::run_all_dynamic_updates,
            commands::compare_playlists,
            commands::remove_track_from_playlist,
            commands::export_m3u,
            // Desktop Schedule commands
            commands::get_desktop_schedules,
            commands::save_desktop_schedule,
            commands::delete_desktop_schedule,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
