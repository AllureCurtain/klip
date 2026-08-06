use std::sync::atomic::{AtomicU32, Ordering};

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    Atom, AtomEnum, ClientMessageEvent, ConnectionExt, EventMask, Window,
};

static PREVIOUS_X11_WINDOW: AtomicU32 = AtomicU32::new(0);

pub(super) fn capture() {
    if crate::platform::linux::is_wayland_session() {
        tracing::debug!("focus capture: Wayland does not expose a portable active window");
        return;
    }
    if let Err(error) = capture_x11() {
        tracing::debug!("focus capture: X11 active window unavailable: {error}");
    }
}

pub(super) fn restore() -> bool {
    if crate::platform::linux::is_wayland_session() {
        tracing::debug!("focus restore: skipped on Wayland");
        return false;
    }
    match restore_x11() {
        Ok(restored) => restored,
        Err(error) => {
            tracing::warn!("focus restore: X11 request failed: {error}");
            false
        }
    }
}

fn capture_x11() -> Result<(), String> {
    let (connection, screen_index) =
        x11rb::connect(None).map_err(|error| format!("connect failed: {error}"))?;
    let root = root_window(&connection, screen_index)?;
    let active_window_atom = intern_atom(&connection, b"_NET_ACTIVE_WINDOW")?;
    let active = connection
        .get_property(false, root, active_window_atom, AtomEnum::WINDOW, 0, 1)
        .map_err(|error| format!("active-window query failed: {error}"))?
        .reply()
        .map_err(|error| format!("active-window reply failed: {error}"))?
        .value32()
        .and_then(|mut values| values.next())
        .unwrap_or(0);
    if active == 0 {
        return Ok(());
    }

    if window_pid(&connection, active)? == Some(std::process::id()) {
        tracing::debug!("focus capture: X11 foreground belongs to Klip; retaining target");
        return Ok(());
    }

    PREVIOUS_X11_WINDOW.store(active, Ordering::Relaxed);
    tracing::info!("focus capture: saved X11 window={active:#x}");
    Ok(())
}

fn restore_x11() -> Result<bool, String> {
    let window = PREVIOUS_X11_WINDOW.load(Ordering::Relaxed);
    if window == 0 {
        tracing::debug!("focus restore: no saved X11 window");
        return Ok(false);
    }

    let (connection, screen_index) =
        x11rb::connect(None).map_err(|error| format!("connect failed: {error}"))?;
    let root = root_window(&connection, screen_index)?;
    if connection
        .get_window_attributes(window)
        .map_err(|error| format!("window validation failed: {error}"))?
        .reply()
        .is_err()
    {
        PREVIOUS_X11_WINDOW.store(0, Ordering::Relaxed);
        tracing::warn!("focus restore: saved X11 window={window:#x} is invalid");
        return Ok(false);
    }

    let active_window_atom = intern_atom(&connection, b"_NET_ACTIVE_WINDOW")?;
    let event = ClientMessageEvent::new(32, window, active_window_atom, [1, 0, 0, 0, 0]);
    connection
        .send_event(
            false,
            root,
            EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
            event,
        )
        .map_err(|error| format!("send active-window event failed: {error}"))?
        .check()
        .map_err(|error| format!("window manager rejected active-window event: {error}"))?;
    connection
        .flush()
        .map_err(|error| format!("flush failed: {error}"))?;
    tracing::info!("focus restore: requested X11 window={window:#x}");
    Ok(true)
}

fn root_window<C: Connection>(connection: &C, screen_index: usize) -> Result<Window, String> {
    connection
        .setup()
        .roots
        .get(screen_index)
        .map(|screen| screen.root)
        .ok_or_else(|| format!("X11 screen index {screen_index} is unavailable"))
}

fn intern_atom<C: Connection>(connection: &C, name: &[u8]) -> Result<Atom, String> {
    connection
        .intern_atom(false, name)
        .map_err(|error| format!("atom request failed: {error}"))?
        .reply()
        .map(|reply| reply.atom)
        .map_err(|error| format!("atom reply failed: {error}"))
}

fn window_pid<C: Connection>(connection: &C, window: Window) -> Result<Option<u32>, String> {
    let pid_atom = intern_atom(connection, b"_NET_WM_PID")?;
    let reply = connection
        .get_property(false, window, pid_atom, AtomEnum::CARDINAL, 0, 1)
        .map_err(|error| format!("window pid query failed: {error}"))?
        .reply()
        .map_err(|error| format!("window pid reply failed: {error}"))?;
    Ok(reply.value32().and_then(|mut values| values.next()))
}
