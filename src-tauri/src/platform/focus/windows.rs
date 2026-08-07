use std::sync::atomic::{AtomicI64, Ordering};

/// Stored as i64 so HWND works on both 32-bit and 64-bit Windows targets.
static PREVIOUS_HWND: AtomicI64 = AtomicI64::new(0);

pub(super) fn capture() {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            tracing::debug!("focus capture: Windows has no foreground window");
            return;
        }

        let mut pid = 0;
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == std::process::id() {
            tracing::debug!("focus capture: foreground belongs to Klip; retaining target");
            return;
        }

        let raw = hwnd.0 as i64;
        PREVIOUS_HWND.store(raw, Ordering::Relaxed);
        tracing::info!("focus capture: saved Windows hwnd={raw:#x} pid={pid}");
    }
}

pub(super) fn restore() -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{IsWindow, SetForegroundWindow};

    let raw = PREVIOUS_HWND.load(Ordering::Relaxed);
    if raw == 0 {
        tracing::debug!("focus restore: no saved Windows hwnd");
        return false;
    }

    let hwnd = HWND(raw as *mut _);
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            tracing::warn!("focus restore: saved Windows hwnd={raw:#x} is invalid");
            PREVIOUS_HWND.store(0, Ordering::Relaxed);
            return false;
        }

        if SetForegroundWindow(hwnd).as_bool() {
            tracing::info!("focus restore: restored Windows hwnd={raw:#x}");
            true
        } else {
            tracing::warn!("focus restore: SetForegroundWindow failed for hwnd={raw:#x}");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_without_a_saved_window_is_a_noop() {
        let previous = PREVIOUS_HWND.swap(0, Ordering::Relaxed);
        assert!(!restore());
        PREVIOUS_HWND.store(previous, Ordering::Relaxed);
    }
}
