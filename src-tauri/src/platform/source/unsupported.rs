use super::ClipboardSource;
use std::sync::Once;

static UNSUPPORTED_NOTICE: Once = Once::new();

pub(super) fn current() -> ClipboardSource {
    UNSUPPORTED_NOTICE.call_once(|| {
        tracing::info!(
            "clipboard source attribution is unavailable on this platform; capture remains enabled"
        );
    });
    ClipboardSource::default()
}
