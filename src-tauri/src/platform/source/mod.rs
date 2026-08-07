//! Best-effort attribution for the application that owns the foreground window.
//!
//! Clipboard capture must never depend on this information. Every backend
//! therefore returns an empty source when the desktop or OS does not expose it.

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
mod unsupported;
#[cfg(target_os = "windows")]
mod windows;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ClipboardSource {
    application: Option<String>,
    window_title: Option<String>,
}

impl ClipboardSource {
    pub(super) fn new(application: Option<String>, window_title: Option<String>) -> Self {
        Self {
            application: normalize(application),
            window_title: normalize(window_title),
        }
    }

    pub fn application(&self) -> Option<&str> {
        self.application.as_deref()
    }

    pub fn window_title(&self) -> Option<&str> {
        self.window_title.as_deref()
    }
}

pub fn current() -> ClipboardSource {
    imp::current()
}

fn normalize(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
}

#[cfg(target_os = "linux")]
use linux as imp;
#[cfg(target_os = "macos")]
use macos as imp;
#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
use unsupported as imp;
#[cfg(target_os = "windows")]
use windows as imp;

#[cfg(test)]
mod tests {
    use super::ClipboardSource;

    #[test]
    fn source_normalizes_whitespace_and_discards_blank_values() {
        let source = ClipboardSource::new(Some("  Example.exe  ".into()), Some("   ".into()));

        assert_eq!(source.application(), Some("Example.exe"));
        assert_eq!(source.window_title(), None);
    }
}
