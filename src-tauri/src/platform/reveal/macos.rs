use crate::AppError;
use std::path::Path;
use std::process::Command;

pub fn reveal_path(path: &Path) -> Result<(), AppError> {
    Command::new("open")
        .arg("-R")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| AppError::System(format!("failed to reveal path: {error}")))
}
