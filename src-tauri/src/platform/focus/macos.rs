use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication, NSWorkspace};
use std::sync::atomic::{AtomicI32, Ordering};

static PREVIOUS_APP_PID: AtomicI32 = AtomicI32::new(0);

pub(super) fn capture() {
    let workspace = NSWorkspace::sharedWorkspace();
    let Some(application) = workspace.frontmostApplication() else {
        tracing::debug!("focus capture: macOS has no frontmost application");
        return;
    };
    let pid = application.processIdentifier();
    if pid <= 0 {
        tracing::debug!("focus capture: macOS frontmost application has no pid");
        return;
    }
    if pid as u32 == std::process::id() {
        tracing::debug!("focus capture: foreground belongs to Klip; retaining target");
        return;
    }

    PREVIOUS_APP_PID.store(pid, Ordering::Relaxed);
    tracing::info!("focus capture: saved macOS application pid={pid}");
}

pub(super) fn restore() -> bool {
    let pid = PREVIOUS_APP_PID.load(Ordering::Relaxed);
    if pid <= 0 {
        tracing::debug!("focus restore: no saved macOS application");
        return false;
    }

    let Some(application) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid)
    else {
        tracing::warn!("focus restore: macOS application pid={pid} is no longer running");
        PREVIOUS_APP_PID.store(0, Ordering::Relaxed);
        return false;
    };
    if application.isTerminated() {
        tracing::warn!("focus restore: macOS application pid={pid} has terminated");
        PREVIOUS_APP_PID.store(0, Ordering::Relaxed);
        return false;
    }

    #[allow(deprecated)]
    let options = NSApplicationActivationOptions::ActivateAllWindows
        | NSApplicationActivationOptions::ActivateIgnoringOtherApps;
    if application.activateWithOptions(options) {
        tracing::info!("focus restore: activated macOS application pid={pid}");
        true
    } else {
        tracing::warn!("focus restore: macOS rejected activation for pid={pid}");
        false
    }
}
