use crate::AppError;
use std::path::Path;
use std::process::Command;

pub fn reveal_path(path: &Path) -> Result<(), AppError> {
    let target = if path.is_dir() {
        path
    } else {
        path.parent().unwrap_or(path)
    };
    Command::new("xdg-open")
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| AppError::System(format!("failed to reveal path: {error}")))
}
