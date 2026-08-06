//! Capture and restore the external application that owned focus before Klip.
//!
//! Window display code calls `capture_previous_foreground` before showing Klip.
//! Paste code hides Klip, calls `restore_previous_foreground`, then emits the
//! platform paste shortcut. Unsupported sessions are a deliberate no-op.

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
mod unsupported;
#[cfg(target_os = "windows")]
mod windows;

/// Capture the current external foreground application.
///
/// This must run before Klip is shown. Implementations retain the last external
/// target when Klip itself is already focused.
pub fn capture_previous_foreground() {
    imp::capture();
}

/// Ask the platform to restore the foreground application captured earlier.
///
/// Returns `true` only when a platform focus request was issued successfully.
/// Missing targets, Wayland, and unsupported platforms return `false`.
pub fn restore_previous_foreground() -> bool {
    imp::restore()
}

#[cfg(target_os = "linux")]
use linux as imp;
#[cfg(target_os = "macos")]
use macos as imp;
#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
use unsupported as imp;
#[cfg(target_os = "windows")]
use windows as imp;
