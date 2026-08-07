//! Linux-specific behaviour that is not clipboard I/O.
//!
//! Reading and writing the clipboard used to live here, shelling out to
//! `wl-copy`/`xclip`/`xsel` with an `arboard` fallback. `clipboard/backend.rs`
//! now owns that for every platform, so what remains is the genuinely
//! Linux-shaped work: XDG directories, `.desktop` autostart entries, and
//! synthetic paste, which still has no portable implementation.

use crate::AppError;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

const AUTOSTART_FILE: &str = "klip.desktop";

pub fn data_dir() -> PathBuf {
    data_dir_from_env(
        std::env::var_os("XDG_DATA_HOME"),
        dirs::home_dir(),
        std::env::temp_dir(),
    )
}

pub fn log_dir() -> PathBuf {
    data_dir().join("logs")
}

pub fn simulate_paste() -> Result<(), AppError> {
    std::thread::sleep(std::time::Duration::from_millis(80));
    if is_wayland_session() {
        tracing::warn!("Wayland may block synthetic paste; trying ydotool/wtype/Enigo fallbacks");
        if command_exists("ydotool")
            && Command::new("ydotool")
                .args(["key", "29:1", "47:1", "47:0", "29:0"])
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
        {
            return Ok(());
        }
        if command_exists("wtype")
            && Command::new("wtype")
                .args(["-M", "ctrl", "v", "-m", "ctrl"])
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
        {
            return Ok(());
        }
    } else if command_exists("xdotool")
        && Command::new("xdotool")
            .args(["key", "--clearmodifiers", "ctrl+v"])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    {
        return Ok(());
    }

    if let Ok(mut enigo) = enigo::Enigo::new(&enigo::Settings::default()) {
        use enigo::Keyboard;
        let _ = enigo.key(enigo::Key::Control, enigo::Direction::Press);
        let _ = enigo.key(enigo::Key::Unicode('v'), enigo::Direction::Click);
        let _ = enigo.key(enigo::Key::Control, enigo::Direction::Release);
        return Ok(());
    }

    Err(AppError::System(
        "failed to simulate paste on Linux; install xdotool on X11 or ydotool/wtype on Wayland"
            .to_string(),
    ))
}

pub fn set_autostart(enabled: bool, app_exe: &Path) -> Result<(), AppError> {
    if enabled {
        let path = autostart_file_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| AppError::System(e.to_string()))?;
        }
        std::fs::write(&path, desktop_entry(app_exe))
            .map_err(|e| AppError::System(format!("failed to write autostart file: {}", e)))?;
    } else {
        let path = autostart_file_path()?;
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| AppError::System(format!("failed to remove autostart file: {}", e)))?;
        }
    }
    Ok(())
}

pub fn is_autostart_enabled() -> Result<bool, AppError> {
    Ok(autostart_file_path()?.exists())
}

fn autostart_file_path() -> Result<PathBuf, AppError> {
    autostart_file_path_from_env(std::env::var_os("XDG_CONFIG_HOME"), dirs::home_dir())
}

fn data_dir_from_env(
    xdg_data_home: Option<OsString>,
    home_dir: Option<PathBuf>,
    temp_dir: PathBuf,
) -> PathBuf {
    xdg_data_home
        .map(PathBuf::from)
        .or_else(|| home_dir.map(|home| home.join(".local/share")))
        .unwrap_or(temp_dir)
        .join("klip")
}

fn autostart_file_path_from_env(
    xdg_config_home: Option<OsString>,
    home_dir: Option<PathBuf>,
) -> Result<PathBuf, AppError> {
    let config_home = xdg_config_home
        .map(PathBuf::from)
        .or_else(|| home_dir.map(|home| home.join(".config")))
        .ok_or_else(|| AppError::System("failed to resolve Linux config directory".into()))?;
    Ok(config_home.join("autostart").join(AUTOSTART_FILE))
}

fn desktop_entry(app_exe: &Path) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=Klip\nComment=Clipboard manager\nExec={}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
        shell_escape(app_exe)
    )
}

fn shell_escape(path: &Path) -> String {
    let value = path.to_string_lossy();
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn command_exists(command: &str) -> bool {
    Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {} >/dev/null 2>&1", command))
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub(crate) fn is_wayland_session() -> bool {
    std::env::var("XDG_SESSION_TYPE")
        .map(|value| value.eq_ignore_ascii_case("wayland"))
        .unwrap_or(false)
        || std::env::var_os("WAYLAND_DISPLAY").is_some()
}

#[cfg(test)]
mod tests {
    use super::{autostart_file_path_from_env, data_dir_from_env, desktop_entry, shell_escape};
    use std::ffi::OsString;
    use std::path::{Path, PathBuf};

    #[test]
    fn shell_escape_wraps_and_escapes_single_quotes() {
        assert_eq!(
            shell_escape(Path::new("/opt/Klip's App/klip")),
            "'/opt/Klip'\\''s App/klip'"
        );
    }

    #[test]
    fn desktop_entry_uses_escaped_exec_path() {
        let entry = desktop_entry(Path::new("/opt/Klip App/klip"));
        assert!(entry.contains("Exec='/opt/Klip App/klip'\n"));
    }

    #[test]
    fn autostart_path_uses_xdg_config_home() {
        let path = autostart_file_path_from_env(
            Some(OsString::from("/tmp/xdg-config")),
            Some(PathBuf::from("/home/me")),
        )
        .unwrap();

        assert_eq!(
            path,
            PathBuf::from("/tmp/xdg-config/autostart/klip.desktop")
        );
    }

    #[test]
    fn autostart_path_falls_back_to_home_config() {
        let path = autostart_file_path_from_env(None, Some(PathBuf::from("/home/me"))).unwrap();

        assert_eq!(
            path,
            PathBuf::from("/home/me/.config/autostart/klip.desktop")
        );
    }

    #[test]
    fn data_dir_uses_xdg_data_home() {
        let path = data_dir_from_env(
            Some(OsString::from("/tmp/xdg-data")),
            Some(PathBuf::from("/home/me")),
            PathBuf::from("/tmp"),
        );

        assert_eq!(path, PathBuf::from("/tmp/xdg-data/klip"));
    }

    #[test]
    fn data_dir_falls_back_to_home_local_share() {
        let path = data_dir_from_env(None, Some(PathBuf::from("/home/me")), PathBuf::from("/tmp"));

        assert_eq!(path, PathBuf::from("/home/me/.local/share/klip"));
        assert_eq!(
            path.join("logs"),
            PathBuf::from("/home/me/.local/share/klip/logs")
        );
    }
}
