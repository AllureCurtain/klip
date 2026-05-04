pub mod clipboard;
pub mod commands;
pub mod config;
pub mod database;
pub mod hotkey;
pub mod tray;
pub mod utils;

pub use commands::*;
pub use database::Database;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

/// Timestamp of the last tray click (ms since epoch).
/// Used by the focus-lost handler to avoid racing with tray toggle.
static LAST_TRAY_CLICK_MS: std::sync::OnceLock<Arc<AtomicU64>> = std::sync::OnceLock::new();

const TRAY_CLICK_GUARD_MS: u64 = 300;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Called from the tray click handler to record the click timestamp.
/// The focus-lost handler reads this to suppress auto-hide during tray toggle.
pub fn notify_tray_click() {
    if let Some(ts) = LAST_TRAY_CLICK_MS.get() {
        ts.store(now_ms(), Ordering::Relaxed);
    }
}

/// Returns the shared tray-click timestamp for the focus-lost guard.
pub fn get_tray_click_guard() -> Arc<AtomicU64> {
    LAST_TRAY_CLICK_MS
        .get_or_init(|| Arc::new(AtomicU64::new(0)))
        .clone()
}

/// Duration (ms) after a tray click during which focus-lost auto-hide is suppressed.
pub fn tray_click_guard_ms() -> u64 {
    TRAY_CLICK_GUARD_MS
}

/// Returns current time in ms since epoch (for the focus-lost guard).
pub fn now_millis() -> u64 {
    now_ms()
}
