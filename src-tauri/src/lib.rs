pub mod clipboard;
pub mod commands;
pub mod config;
pub mod database;
pub mod error;
pub mod hotkey;
pub mod http;
pub mod llm;
pub mod platform;
pub mod qa;
pub mod search;
pub mod tray;
pub mod window;

pub use error::AppError;

pub use commands::*;
pub use database::Database;

#[cfg(target_os = "windows")]
use std::sync::atomic::AtomicI64;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

/// Timestamp of the last tray click (ms since epoch).
/// Used by the focus-lost handler to avoid racing with tray toggle.
static LAST_TRAY_CLICK_MS: std::sync::OnceLock<Arc<AtomicU64>> = std::sync::OnceLock::new();

const TRAY_CLICK_GUARD_MS: u64 = 300;

/// HWND (as isize) of the foreground window right BEFORE Klip was shown.
/// Used by paste handlers to restore focus to the user's intended target
/// after `window.hide()`, otherwise Ctrl+V is sent to whatever window the
/// OS happens to pick (often the desktop on Win11 → silent paste failure).
/// Stored as i64 so we can use `AtomicI64::new(0)` in a const context;
/// HWND fits in an isize / i64 on both x86 and x64.
#[cfg(target_os = "windows")]
static PREV_FOREGROUND_HWND: AtomicI64 = AtomicI64::new(0);

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

#[derive(Debug, PartialEq, Eq)]
pub enum WindowCloseDecision {
    HideToTray,
    Quit,
}

pub fn window_close_decision(close_to_tray: bool) -> WindowCloseDecision {
    window::controller::close_decision(close_to_tray)
}

/// Returns current time in ms since epoch (for the focus-lost guard).
pub fn now_millis() -> u64 {
    now_ms()
}

/// Capture the current foreground window so we can restore focus to it after
/// the user picks a clipboard item. MUST be called BEFORE Klip's window is
/// shown — once Klip is foreground, GetForegroundWindow returns Klip itself.
///
/// Skips the capture if the current foreground belongs to Klip's own process,
/// so re-showing the window (e.g. tray click while already focused) doesn't
/// overwrite a previously saved external HWND.
#[cfg(target_os = "windows")]
pub fn capture_previous_foreground() {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            tracing::debug!("capture_previous_foreground: no foreground window");
            return;
        }

        // If the foreground window already belongs to us, don't overwrite a
        // previously captured external HWND — the real target was saved earlier.
        let mut pid: u32 = 0;
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let our_pid = std::process::id();
        if pid == our_pid {
            tracing::debug!(
                "capture_previous_foreground: foreground belongs to Klip (pid={}), skipping",
                pid
            );
            return;
        }

        let raw = hwnd.0 as i64;
        PREV_FOREGROUND_HWND.store(raw, Ordering::Relaxed);
        tracing::info!(
            "capture_previous_foreground: saved hwnd={:#x} pid={}",
            raw,
            pid
        );
    }
}

#[cfg(not(target_os = "windows"))]
pub fn capture_previous_foreground() {}

/// Restore focus to the window captured by `capture_previous_foreground`.
/// Returns true if a foreground change was attempted.
///
/// Note: Windows only allows the current foreground process to call
/// `SetForegroundWindow` reliably. Klip just lost focus via `window.hide()`,
/// which gives us a brief grace period during which this still works.
#[cfg(target_os = "windows")]
pub fn restore_previous_foreground() -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{IsWindow, SetForegroundWindow};

    let raw = PREV_FOREGROUND_HWND.load(Ordering::Relaxed);
    if raw == 0 {
        tracing::debug!("restore_previous_foreground: no saved hwnd");
        return false;
    }

    let hwnd = HWND(raw as *mut _);
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            tracing::warn!(
                "restore_previous_foreground: saved hwnd={:#x} no longer valid",
                raw
            );
            PREV_FOREGROUND_HWND.store(0, Ordering::Relaxed);
            return false;
        }

        let result = SetForegroundWindow(hwnd);
        if result.as_bool() {
            tracing::info!("restore_previous_foreground: restored hwnd={:#x}", raw);
            true
        } else {
            tracing::warn!(
                "restore_previous_foreground: SetForegroundWindow failed for hwnd={:#x}",
                raw
            );
            false
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn restore_previous_foreground() -> bool {
    false
}

#[cfg(test)]
mod tests {
    #[test]
    fn close_request_respects_close_to_tray_config() {
        assert_eq!(
            super::window_close_decision(true),
            super::WindowCloseDecision::HideToTray
        );
        assert_eq!(
            super::window_close_decision(false),
            super::WindowCloseDecision::Quit
        );
    }
}
