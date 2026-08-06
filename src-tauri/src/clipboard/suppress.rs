//! Stops Klip from re-capturing its own clipboard writes.
//!
//! # Why hashes and not a custom clipboard format
//!
//! Klip used to mark its own writes with the Windows custom clipboard format
//! `"Clipboard Viewer Ignore"` and have the monitor skip anything carrying it.
//! That mechanism cannot survive the move to a single cross-platform library,
//! because on Windows `clipboard-rs` cannot put a custom format and an image
//! on the clipboard together. Measured against 0.3.5, all five orderings the
//! public API allows fail:
//!
//! | attempt                          | image | marker |
//! |----------------------------------|-------|--------|
//! | `set(vec![Image, Other])`        | yes   | no     |
//! | `set(vec![Other, Image])`        | yes   | no     |
//! | `set_image` then `set_buffer`    | no    | yes    |
//! | `set_buffer` then `set_image`    | yes   | no     |
//! | `set(vec![Text, Image, Other])`  | yes   | no     |
//!
//! The cause is structural, not a tuning problem. `set_image` empties the
//! clipboard on entry and opens its own clipboard handle; when that handle
//! drops, the clipboard closes. Any later write in the same `set()` loop then
//! fails, and `set()` swallows per-item errors and still returns `Ok`. So the
//! marker silently vanishes exactly when an image is involved. `set_buffer`
//! is no escape hatch either -- it clears the clipboard too, which is why
//! attempt three loses the image instead.
//!
//! Text and file lists *can* carry the marker. Using it there and hashes for
//! images would mean two mechanisms for one job, split by content type -- the
//! kind of implicit knowledge this migration exists to remove. So hashing is
//! used for everything.
//!
//! # How it works
//!
//! Before writing, the writer arms this module with the hash the monitor would
//! compute if it read that content back. When the monitor extracts something,
//! it asks whether that hash is armed; if so it drops the event. Arming
//! happens *before* the write so there is no window where the clipboard has
//! changed but the suppression is not yet in place.
//!
//! Two bounds keep an armed hash from eating a real user copy:
//!
//! - **One shot.** A match consumes the armed hash.
//! - **Time limited.** An armed hash older than [`SUPPRESS_TTL`] is ignored.
//!   Without this, writing X and never seeing the event (monitoring disabled,
//!   privacy mode, a dropped OS notification) would leave X armed
//!   indefinitely, and a genuine copy of X minutes later would be swallowed.
//!
//! The residual false negative: if the user copies byte-identical content from
//! another application within [`SUPPRESS_TTL`] of Klip writing it, that copy
//! is skipped. The item is already at the top of the history, so what is lost
//! is a `last_used_at` bump, not data.

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// How long an armed hash stays valid.
///
/// Covers the clipboard-change notification plus the monitor's settle delay
/// and extraction, with room for a slow machine. Short enough that a stale arm
/// cannot plausibly collide with a deliberate user copy of the same content.
pub const SUPPRESS_TTL: Duration = Duration::from_secs(3);

struct Armed {
    hash: String,
    at: Instant,
}

static ARMED: OnceLock<Mutex<Option<Armed>>> = OnceLock::new();

fn slot() -> &'static Mutex<Option<Armed>> {
    ARMED.get_or_init(|| Mutex::new(None))
}

/// Declare that Klip is about to write content with this hash, so the
/// resulting clipboard-change event is not captured as a user copy.
///
/// Call this *before* the write.
pub fn arm(hash: String) {
    arm_at(hash, Instant::now())
}

/// Returns whether `hash` was armed, consuming it if so.
///
/// A lock that has been poisoned by a panic in another thread degrades to "not
/// suppressed": re-capturing one item is a far better failure mode than
/// propagating a panic into the monitor thread, which under the release
/// profile's `panic = "abort"` would take the whole process down.
pub fn should_suppress(hash: &str) -> bool {
    should_suppress_at(hash, Instant::now())
}

/// Drop any armed hash. Used when a write fails, so a hash that never reached
/// the clipboard cannot suppress a later genuine copy.
pub fn disarm() {
    if let Ok(mut guard) = slot().lock() {
        *guard = None;
    }
}

// --- Time-injected internals, so the TTL is testable without sleeping ---

fn arm_at(hash: String, at: Instant) {
    match slot().lock() {
        Ok(mut guard) => *guard = Some(Armed { hash, at }),
        Err(_) => tracing::warn!("Self-copy suppression lock poisoned; skipping arm"),
    }
}

fn should_suppress_at(hash: &str, now: Instant) -> bool {
    let mut guard = match slot().lock() {
        Ok(guard) => guard,
        Err(_) => {
            tracing::warn!("Self-copy suppression lock poisoned; treating as not suppressed");
            return false;
        }
    };

    match guard.as_ref() {
        Some(armed) if now.duration_since(armed.at) > SUPPRESS_TTL => {
            *guard = None;
            false
        }
        Some(armed) if armed.hash == hash => {
            *guard = None;
            true
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The armed slot is process-global, so tests that touch it must not run
    /// concurrently with each other.
    static SERIAL: Mutex<()> = Mutex::new(());

    fn guard() -> std::sync::MutexGuard<'static, ()> {
        let g = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        disarm();
        g
    }

    #[test]
    fn suppresses_the_hash_that_was_armed() {
        let _g = guard();
        arm("abc".to_string());
        assert!(should_suppress("abc"));
    }

    #[test]
    fn does_not_suppress_a_different_hash() {
        let _g = guard();
        arm("abc".to_string());
        assert!(!should_suppress("def"));
    }

    #[test]
    fn suppression_is_one_shot() {
        let _g = guard();
        arm("abc".to_string());
        assert!(should_suppress("abc"));
        assert!(
            !should_suppress("abc"),
            "a second identical copy is a real user action and must be captured"
        );
    }

    #[test]
    fn nothing_is_suppressed_when_nothing_was_armed() {
        let _g = guard();
        assert!(!should_suppress("abc"));
    }

    #[test]
    fn an_expired_arm_does_not_suppress() {
        let _g = guard();
        let long_ago = Instant::now() - (SUPPRESS_TTL + Duration::from_millis(1));
        arm_at("abc".to_string(), long_ago);
        assert!(!should_suppress_at("abc", Instant::now()));
    }

    #[test]
    fn an_arm_inside_the_ttl_still_suppresses() {
        let _g = guard();
        let recent = Instant::now() - (SUPPRESS_TTL - Duration::from_millis(50));
        arm_at("abc".to_string(), recent);
        assert!(should_suppress_at("abc", Instant::now()));
    }

    #[test]
    fn an_expired_arm_is_cleared_rather_than_left_behind() {
        let _g = guard();
        let long_ago = Instant::now() - (SUPPRESS_TTL + Duration::from_millis(1));
        arm_at("abc".to_string(), long_ago);

        // Probing with a non-matching hash must still evict the stale entry,
        // otherwise it lingers until something happens to match it.
        assert!(!should_suppress_at("other", Instant::now()));
        assert!(!should_suppress_at("abc", Instant::now()));
    }

    #[test]
    fn arming_again_replaces_the_previous_hash() {
        let _g = guard();
        arm("first".to_string());
        arm("second".to_string());
        assert!(!should_suppress("first"));
        assert!(should_suppress("second"));
    }

    #[test]
    fn disarm_clears_a_pending_arm() {
        let _g = guard();
        arm("abc".to_string());
        disarm();
        assert!(!should_suppress("abc"));
    }
}
