use serde::{Deserialize, Serialize};
use tauri::Emitter;

/// Log types for debug console
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogType {
    Info,
    Search,
    Passed,
    Rejected,
    Skipped,
    Found,
    Error,
    Comparison,
}

/// A structured debug log message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugLog {
    pub log_type: LogType,
    pub message: String,
    pub details: Option<String>,
    pub timestamp: String,
}

impl DebugLog {
    pub fn new(log_type: LogType, message: impl Into<String>) -> Self {
        Self {
            log_type,
            message: message.into(),
            details: None,
            timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
        }
    }

    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }
}

/// Emit a debug log to the frontend
pub fn emit_log(app: &tauri::AppHandle, log: DebugLog) {
    // Also print to console for development
    let prefix = match log.log_type {
        LogType::Info => "[INFO]",
        LogType::Search => "[SEARCH]",
        LogType::Passed => "[PASSED]",
        LogType::Rejected => "[REJECTED]",
        LogType::Skipped => "[SKIPPED]",
        LogType::Found => "[FOUND]",
        LogType::Error => "[ERROR]",
        LogType::Comparison => "[COMPARE]",
    };

    if let Some(ref details) = log.details {
        println!("{} {} - {}", prefix, log.message, details);
    } else {
        println!("{} {}", prefix, log.message);
    }

    // Emit to frontend
    let _ = app.emit("debug-log", &log);
}

/// Helper macros for common log types
#[macro_export]
macro_rules! debug_info {
    ($app:expr, $msg:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Info, $msg),
        )
    };
    ($app:expr, $msg:expr, $details:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Info, $msg)
                .with_details($details),
        )
    };
}

#[macro_export]
macro_rules! debug_search {
    ($app:expr, $msg:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Search, $msg),
        )
    };
    ($app:expr, $msg:expr, $details:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Search, $msg)
                .with_details($details),
        )
    };
}

#[macro_export]
macro_rules! debug_passed {
    ($app:expr, $msg:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Passed, $msg),
        )
    };
    ($app:expr, $msg:expr, $details:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Passed, $msg)
                .with_details($details),
        )
    };
}

#[macro_export]
macro_rules! debug_rejected {
    ($app:expr, $msg:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Rejected, $msg),
        )
    };
    ($app:expr, $msg:expr, $details:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Rejected, $msg)
                .with_details($details),
        )
    };
}

#[macro_export]
macro_rules! debug_skipped {
    ($app:expr, $msg:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Skipped, $msg),
        )
    };
    ($app:expr, $msg:expr, $details:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Skipped, $msg)
                .with_details($details),
        )
    };
}

#[macro_export]
macro_rules! debug_found {
    ($app:expr, $msg:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Found, $msg),
        )
    };
    ($app:expr, $msg:expr, $details:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Found, $msg)
                .with_details($details),
        )
    };
}

#[macro_export]
macro_rules! debug_error {
    ($app:expr, $msg:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Error, $msg),
        )
    };
    ($app:expr, $msg:expr, $details:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Error, $msg)
                .with_details($details),
        )
    };
}

#[macro_export]
macro_rules! debug_comparison {
    ($app:expr, $msg:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Comparison, $msg),
        )
    };
    ($app:expr, $msg:expr, $details:expr) => {
        $crate::debug_log::emit_log(
            $app,
            $crate::debug_log::DebugLog::new($crate::debug_log::LogType::Comparison, $msg)
                .with_details($details),
        )
    };
}
