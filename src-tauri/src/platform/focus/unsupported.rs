pub(super) fn capture() {
    tracing::debug!("focus capture: unsupported platform");
}

pub(super) fn restore() -> bool {
    tracing::debug!("focus restore: unsupported platform");
    false
}
