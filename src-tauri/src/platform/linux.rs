use crate::AppError;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const AUTOSTART_FILE: &str = "klip.desktop";

pub fn data_dir() -> PathBuf {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".local/share")))
        .unwrap_or_else(std::env::temp_dir)
        .join("klip")
}

pub fn log_dir() -> PathBuf {
    data_dir().join("logs")
}

pub fn set_text(text: &str) -> Result<(), String> {
    if is_wayland_session() && command_exists("wl-copy") {
        return write_stdin("wl-copy", &[], text.as_bytes());
    }
    if command_exists("xclip") {
        return write_stdin("xclip", &["-selection", "clipboard"], text.as_bytes());
    }
    if command_exists("xsel") {
        return write_stdin("xsel", &["--clipboard", "--input"], text.as_bytes());
    }

    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())
}

pub fn get_text() -> Result<String, String> {
    if is_wayland_session() && command_exists("wl-paste") {
        return read_stdout("wl-paste", &["--no-newline"]);
    }
    if command_exists("xclip") {
        return read_stdout("xclip", &["-selection", "clipboard", "-o"]);
    }
    if command_exists("xsel") {
        return read_stdout("xsel", &["--clipboard", "--output"]);
    }

    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.get_text().map_err(|e| e.to_string())
}

pub fn set_file_list(paths: &[&str]) -> Result<(), String> {
    let uri_list = paths
        .iter()
        .map(|path| format!("file://{}", path))
        .collect::<Vec<_>>()
        .join("\n");

    if is_wayland_session() && command_exists("wl-copy") {
        return write_stdin("wl-copy", &["--type", "text/uri-list"], uri_list.as_bytes());
    }
    if command_exists("xclip") {
        return write_stdin(
            "xclip",
            &["-selection", "clipboard", "-t", "text/uri-list"],
            uri_list.as_bytes(),
        );
    }
    if command_exists("xsel") {
        return write_stdin("xsel", &["--clipboard", "--input"], uri_list.as_bytes());
    }

    Err("file copy back requires wl-copy, xclip, or xsel on Linux".to_string())
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
    let config_home = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".config")))
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

fn is_wayland_session() -> bool {
    std::env::var("XDG_SESSION_TYPE")
        .map(|value| value.eq_ignore_ascii_case("wayland"))
        .unwrap_or(false)
        || std::env::var_os("WAYLAND_DISPLAY").is_some()
}

fn write_stdin(command: &str, args: &[&str], data: &[u8]) -> Result<(), String> {
    let mut child = Command::new(command)
        .args(args)
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run {}: {}", command, e))?;
    if let Some(stdin) = child.stdin.as_mut() {
        use std::io::Write;
        stdin.write_all(data).map_err(|e| e.to_string())?;
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{} exited with status {}", command, status))
    }
}

fn read_stdout(command: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(command)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run {}: {}", command, e))?;
    if !output.status.success() {
        return Err(format!("{} exited with status {}", command, output.status));
    }
    String::from_utf8(output.stdout).map_err(|e| e.to_string())
}
