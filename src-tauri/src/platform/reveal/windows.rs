use crate::AppError;
use std::path::Path;
use std::process::Command;

pub fn reveal_path(path: &Path) -> Result<(), AppError> {
    let (flag, target) = select_arguments(path);
    Command::new("explorer.exe")
        .arg(flag)
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| AppError::System(format!("failed to reveal path: {error}")))
}

fn select_arguments(path: &Path) -> (&'static str, &std::ffi::OsStr) {
    ("/select,", path.as_os_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explorer_select_keeps_the_path_as_a_separate_os_argument() {
        let path = Path::new(r"C:\资料\folder with spaces\report.txt");
        let (flag, target) = select_arguments(path);

        assert_eq!(flag, "/select,");
        assert_eq!(target, path.as_os_str());
    }
}
