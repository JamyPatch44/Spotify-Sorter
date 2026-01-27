use crate::AppState;
use chrono::Local;
use cron::Schedule as CronSchedule;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DesktopSchedule {
    pub id: String,
    pub config_id: String,
    pub cron_expression: String,
    pub enabled: bool,
    pub last_run: Option<String>,
}

fn get_schedules_path() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("Spotify Sorter");
    path.push("schedules.json");
    path
}

pub fn load_schedules() -> Vec<DesktopSchedule> {
    let path = get_schedules_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(schedules) = serde_json::from_str(&content) {
                return schedules;
            }
        }
    }
    Vec::new()
}

pub fn save_schedules(schedules: &Vec<DesktopSchedule>) {
    let path = get_schedules_path();
    if let Ok(json) = serde_json::to_string_pretty(schedules) {
        let _ = fs::write(path, json);
    }
}

pub fn start_scheduler_loop(app: AppHandle) {
    thread::spawn(move || {
        println!("Scheduler loop started...");
        loop {
            // Check every minute
            thread::sleep(Duration::from_secs(60));

            let schedules = load_schedules();
            let now = Local::now();

            for schedule in schedules {
                if !schedule.enabled {
                    continue;
                }

                if let Ok(cron) = CronSchedule::from_str(&schedule.cron_expression) {
                    // Check if the schedule should run in the current minute window

                    let check_base = now - chrono::Duration::seconds(61);
                    if let Some(next_run) = cron.after(&check_base).next() {
                        let next_run_local = next_run.with_timezone(&Local);

                        // If the schedule matches the current time window
                        if next_run_local <= now && next_run_local > check_base {
                            println!("Running schedule for config: {}", schedule.config_id);

                            // EXECUTE
                            let app_handle = app.clone();
                            let config_id = schedule.config_id.clone();
                            let schedule_id = schedule.id.clone();

                            // Update last_run immediately
                            let mut all_schedules = load_schedules();
                            if let Some(s) = all_schedules.iter_mut().find(|x| x.id == schedule_id)
                            {
                                s.last_run = Some(now.to_rfc3339());
                            }
                            save_schedules(&all_schedules);

                            tauri::async_runtime::spawn(async move {
                                let state = app_handle.state::<AppState>();

                                match crate::commands::run_dynamic_playlist_logic(
                                    &app_handle,
                                    &state,
                                    &config_id,
                                )
                                .await
                                {
                                    Ok(_) => println!("Scheduled run success: {}", config_id),
                                    Err(e) => {
                                        println!("Scheduled run failed: {} - {}", config_id, e)
                                    }
                                }
                            });
                        }
                    }
                }
            }
        }
    });
}
