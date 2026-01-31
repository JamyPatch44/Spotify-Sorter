use crate::commands::{get_backup_dir, get_exports_dir};
use crate::dynamic::load_dynamic_configs;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .show_menu_on_left_click(false)
        .on_menu_event(move |app: &AppHandle, event| {
            let id = event.id.as_ref();
            match id {
                "quit" => {
                    app.exit(0);
                }
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "manage_schedules" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.emit("open-schedules", ());
                    }
                }
                "open_backups" => {
                    let _ = open::that(get_backup_dir());
                }
                "open_exports" => {
                    let _ = open::that(get_exports_dir());
                }
                "open_dashboard" => {
                    let _ = open::that("http://127.0.0.1:27196");
                }
                "run_all" => {
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let state = app_handle.state::<crate::AppState>();
                        let _ = crate::commands::run_all_dynamic_updates(app_handle.clone(), state)
                            .await;
                    });
                }
                id if id.starts_with("run_") => {
                    let config_id = id.trim_start_matches("run_").to_string();
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let state = app_handle.state::<crate::AppState>();
                        let _ = crate::commands::run_dynamic_update(
                            app_handle.clone(),
                            state,
                            config_id,
                        )
                        .await;
                    });
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } => {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        .build(app)?;

    refresh_tray(app)?;
    Ok(())
}

pub fn refresh_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_i = MenuItem::with_id(app, "show", "Show Spotify Sorter", true, None::<&str>)?;
    let schedules_i = MenuItem::with_id(
        app,
        "manage_schedules",
        "Manage Schedules...",
        true,
        None::<&str>,
    )?;
    let backups_i = MenuItem::with_id(
        app,
        "open_backups",
        "Open Backups Folder",
        true,
        None::<&str>,
    )?;
    let exports_i = MenuItem::with_id(
        app,
        "open_exports",
        "Open Exports Folder",
        true,
        None::<&str>,
    )?;
    let dashboard_i = MenuItem::with_id(
        app,
        "open_dashboard",
        "Open Web Dashboard",
        true,
        None::<&str>,
    )?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let run_all_i = MenuItem::with_id(
        app,
        "run_all",
        "Run All Dynamic Updates",
        true,
        None::<&str>,
    )?;
    // We'll build the menu more traditionally to avoid lifetime issues in the loop
    let configs = load_dynamic_configs();
    let menu = Menu::with_id(app, "main-menu")?;
    menu.append(&show_i)?;

    menu.append(&schedules_i)?;
    menu.append(&dashboard_i)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    menu.append(&backups_i)?;
    menu.append(&exports_i)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    if !configs.is_empty() {
        menu.append(&run_all_i)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;

        for config in configs {
            let label = format!("Update: {}", config.name);
            let id = format!("run_{}", config.id);
            let item = MenuItem::with_id(app, id, label, true, None::<&str>)?;
            menu.append(&item)?;
        }
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }

    menu.append(&quit_i)?;

    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_menu(Some(menu));
    }

    Ok(())
}
