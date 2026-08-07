use super::ClipboardSource;
use std::sync::Once;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{Atom, AtomEnum, ConnectionExt, Window};

static WAYLAND_NOTICE: Once = Once::new();

pub(super) fn current() -> ClipboardSource {
    if crate::platform::linux::is_wayland_session() {
        WAYLAND_NOTICE.call_once(|| {
            tracing::info!(
                "clipboard source attribution is unavailable on Wayland; capture remains enabled"
            );
        });
        return ClipboardSource::default();
    }

    match current_x11() {
        Ok(source) => source,
        Err(error) => {
            tracing::debug!("clipboard source attribution unavailable on X11: {error}");
            ClipboardSource::default()
        }
    }
}

fn current_x11() -> Result<ClipboardSource, String> {
    let (connection, screen_index) =
        x11rb::connect(None).map_err(|error| format!("connect failed: {error}"))?;
    let root = connection
        .setup()
        .roots
        .get(screen_index)
        .map(|screen| screen.root)
        .ok_or_else(|| format!("screen index {screen_index} is unavailable"))?;
    let active_window_atom = intern_atom(&connection, b"_NET_ACTIVE_WINDOW")?;
    let window = connection
        .get_property(false, root, active_window_atom, AtomEnum::WINDOW, 0, 1)
        .map_err(|error| format!("active-window query failed: {error}"))?
        .reply()
        .map_err(|error| format!("active-window reply failed: {error}"))?
        .value32()
        .and_then(|mut values| values.next())
        .unwrap_or(0);
    if window == 0 {
        return Ok(ClipboardSource::default());
    }

    let pid = window_pid(&connection, window)?;
    let application = pid.and_then(application_name);
    let title = window_title(&connection, window)?;
    Ok(ClipboardSource::new(application, title))
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

fn window_title<C: Connection>(connection: &C, window: Window) -> Result<Option<String>, String> {
    let net_wm_name = intern_atom(connection, b"_NET_WM_NAME")?;
    let utf8_string = intern_atom(connection, b"UTF8_STRING")?;
    if let Some(title) = read_text_property(connection, window, net_wm_name, utf8_string)? {
        return Ok(Some(title));
    }

    read_text_property(
        connection,
        window,
        AtomEnum::WM_NAME.into(),
        AtomEnum::STRING.into(),
    )
}

fn read_text_property<C: Connection>(
    connection: &C,
    window: Window,
    property: Atom,
    property_type: Atom,
) -> Result<Option<String>, String> {
    let reply = connection
        .get_property(false, window, property, property_type, 0, 4096)
        .map_err(|error| format!("window title query failed: {error}"))?
        .reply()
        .map_err(|error| format!("window title reply failed: {error}"))?;
    let value = String::from_utf8_lossy(&reply.value)
        .trim_matches('\0')
        .trim()
        .to_string();
    Ok((!value.is_empty()).then_some(value))
}

fn application_name(pid: u32) -> Option<String> {
    let comm = std::fs::read_to_string(format!("/proc/{pid}/comm"))
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    comm.or_else(|| {
        std::fs::read_link(format!("/proc/{pid}/exe"))
            .ok()
            .and_then(|path| {
                path.file_name()
                    .map(|name| name.to_string_lossy().into_owned())
            })
    })
}

#[cfg(test)]
mod tests {
    use super::application_name;

    #[test]
    fn resolves_the_current_process_name_from_proc() {
        assert!(application_name(std::process::id()).is_some());
    }
}
