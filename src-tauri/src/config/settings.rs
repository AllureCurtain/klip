pub const MAX_HISTORY_COUNT: i64 = 100;
pub const DEFAULT_WINDOW_WIDTH: u32 = 680;
pub const DEFAULT_WINDOW_HEIGHT: u32 = 720;
pub const MIN_WINDOW_WIDTH: u32 = 360;
pub const MIN_WINDOW_HEIGHT: u32 = 480;
pub const SEARCH_DEBOUNCE_MS: u64 = 150;
pub const CLIPBOARD_POLL_INTERVAL_MS: u64 = 100;

pub fn clamp_window_width(value: u32) -> u32 {
    value.max(MIN_WINDOW_WIDTH)
}

pub fn clamp_window_height(value: u32) -> u32 {
    value.max(MIN_WINDOW_HEIGHT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_size_constants_match_packaged_window_bounds() {
        assert_eq!(DEFAULT_WINDOW_WIDTH, 680);
        assert_eq!(DEFAULT_WINDOW_HEIGHT, 720);
        assert_eq!(MIN_WINDOW_WIDTH, 360);
        assert_eq!(MIN_WINDOW_HEIGHT, 480);
    }

    #[test]
    fn window_size_helpers_clamp_to_packaged_minimums() {
        assert_eq!(clamp_window_width(300), 360);
        assert_eq!(clamp_window_width(800), 800);
        assert_eq!(clamp_window_height(400), 480);
        assert_eq!(clamp_window_height(900), 900);
    }
}
