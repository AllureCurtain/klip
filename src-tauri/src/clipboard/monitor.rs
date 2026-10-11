//! Watches the OS clipboard and turns changes into stored history items.
//!
//! # One trigger path for every platform
//!
//! This used to be two implementations: an event-driven watcher on Windows and
//! a 500ms polling loop everywhere else that could only ever see text.
//! `clipboard-rs` ships a watcher for Windows, macOS, X11 and
//! Wayland, so there is now a single event-driven path, and every platform gets
//! image and file capture rather than text only.
//!
//! Polling survives only as a fallback for when the watcher cannot start at
//! all -- some Linux compositors, or a missing X11 connection. It reads through
//! the same [`backend`], so this is one clipboard abstraction with a degraded
//! trigger, not a second implementation.
//!
//! # Event handling
//!
//! Clipboard changes arrive in bursts: an application writing several formats
//! can produce one notification per format. Handling each would extract the
//! same content repeatedly. So notifications go through a
//! [`ClipboardEventQueue`] with a single slot -- extra notifications collapse
//! into the pending one -- and the worker waits for a quiet period before
//! reading.
//!
//! The worker owns all extraction and database work. The watcher callback only
//! enqueues, because it runs on a thread the OS controls and must return fast.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender, TryRecvError, TrySendError};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

use clipboard_rs::{ClipboardHandler, ClipboardWatcher, ClipboardWatcherContext};

use crate::clipboard::backend;
use crate::clipboard::format::{ExtractedContent, FormatStrategyRegistry};
use crate::clipboard::suppress;
use crate::config::registry;
use crate::database::{self, ClipboardItem, NewClipboardItem};
use crate::{AppError, Database};

/// Hash of the most recently captured content, so a clipboard that reports a
/// change without its content actually differing does not create a duplicate.
///
/// This is distinct from [`suppress`], which handles Klip's *own* writes.
/// `LAST_HASH` cannot do that job: it holds the last thing captured, so
/// pasting an older item produces a hash that does not match it and would be
/// captured again.
static LAST_HASH: OnceLock<Mutex<String>> = OnceLock::new();

/// How long the capture-gate inputs may be reused before they are re-read
/// from the database. Clipboard changes arrive in bursts; three reads per
/// event on the hot path is wasted work when nothing has changed.
const GATE_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(2);

/// The three database values the capture gate consults on every event,
/// bundled so a burst of notifications costs one read instead of three.
struct GateInputs {
    enabled: bool,
    privacy_until: i64,
    rules: Vec<crate::database::types::SourceRule>,
    fetched_at: Instant,
}

static GATE_INPUTS: OnceLock<Mutex<Option<GateInputs>>> = OnceLock::new();

fn gate_inputs_slot() -> &'static Mutex<Option<GateInputs>> {
    GATE_INPUTS.get_or_init(|| Mutex::new(None))
}

/// Forget cached capture-gate inputs. Called by the config and source-rule
/// mutation commands so changes take effect on the next event rather than up
/// to [`GATE_CACHE_TTL`] later, and by tests that need a clean slate.
pub fn invalidate_capture_gate_cache() {
    if let Ok(mut guard) = gate_inputs_slot().lock() {
        *guard = None;
    }
}

/// How long to wait for a burst of change notifications to go quiet before
/// reading the clipboard.
const CLIPBOARD_SETTLE_DELAY: std::time::Duration = std::time::Duration::from_millis(150);

/// Interval for the fallback polling loop, used only when no watcher could be
/// started.
const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(500);

/// Attempts made to detect and extract a format before giving up on a change.
const MAX_EXTRACT_ATTEMPTS: u32 = 3;

/// Delay between extraction attempts, for content that is still being written.
const EXTRACT_RETRY_DELAY: std::time::Duration = std::time::Duration::from_millis(100);

/// Above this, processing a single change is logged as slow.
const SLOW_PROCESSING_MS: u128 = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureGateDecision {
    Capture,
    SkipMonitoringDisabled,
    SkipPrivacyMode,
    SkipSourceRule,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EnqueueResult {
    Enqueued,
    AlreadyPending,
    Disconnected,
}

/// A one-slot channel. A change that arrives while one is already pending is
/// dropped, because the worker will read the latest clipboard state anyway.
#[derive(Clone)]
struct ClipboardEventQueue {
    tx: SyncSender<()>,
}

impl ClipboardEventQueue {
    fn new() -> (Self, Receiver<()>) {
        let (tx, rx) = mpsc::sync_channel(1);
        (Self { tx }, rx)
    }

    fn enqueue(&self) -> EnqueueResult {
        match self.tx.try_send(()) {
            Ok(()) => EnqueueResult::Enqueued,
            Err(TrySendError::Full(())) => EnqueueResult::AlreadyPending,
            Err(TrySendError::Disconnected(())) => EnqueueResult::Disconnected,
        }
    }
}

fn drain_pending_events(rx: &Receiver<()>) -> usize {
    let mut drained = 0;
    loop {
        match rx.try_recv() {
            Ok(()) => drained += 1,
            Err(TryRecvError::Empty) | Err(TryRecvError::Disconnected) => return drained,
        }
    }
}

// --- Monitor ------------------------------------------------------------

pub struct ClipboardMonitor {
    app_handle: AppHandle,
    running: Arc<AtomicBool>,
}

impl ClipboardMonitor {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            running: Arc::new(AtomicBool::new(true)),
        }
    }

    pub fn start(self) -> Result<(), String> {
        LAST_HASH.get_or_init(|| Mutex::new(String::new()));

        // Build the watcher before spawning anything, so a platform that
        // cannot support one falls back without leaving a worker behind.
        match ClipboardWatcherContext::new() {
            Ok(watcher) => {
                self.start_event_based(watcher);
                Ok(())
            }
            Err(e) => {
                tracing::warn!(
                    "Clipboard watcher unavailable ({}); falling back to {}ms polling",
                    e,
                    POLL_INTERVAL.as_millis()
                );
                self.start_polling();
                Ok(())
            }
        }
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }

    fn start_event_based(self, mut watcher: ClipboardWatcherContext<WatcherHandler>) {
        let (event_queue, rx) = ClipboardEventQueue::new();
        self.spawn_worker(rx);

        let running = self.running.clone();
        watcher.add_handler(WatcherHandler {
            running: running.clone(),
            event_queue,
        });
        let shutdown = watcher.get_shutdown_channel();

        // `start_watch` blocks, so it needs its own thread.
        thread::spawn(move || {
            tracing::info!("Starting clipboard monitor (event-based)");
            let mut watcher = watcher;
            watcher.start_watch();
            tracing::info!("Clipboard watcher stopped");
        });

        // The watcher has no way to notice `running` going false on its own --
        // its callback only fires on clipboard activity, which may never come.
        // This thread turns `stop()` into an actual shutdown.
        thread::spawn(move || {
            while running.load(Ordering::Relaxed) {
                thread::sleep(POLL_INTERVAL);
            }
            shutdown.stop();
        });
    }

    /// Worker thread: waits for a coalesced change, lets the burst settle, then
    /// extracts and stores.
    fn spawn_worker(&self, rx: Receiver<()>) {
        let running = self.running.clone();
        let app_handle = self.app_handle.clone();

        thread::spawn(move || {
            while running.load(Ordering::Relaxed) {
                if rx.recv().is_err() {
                    break;
                }

                // Wait for a quiet period so a burst of notifications settles
                // before reading.
                loop {
                    thread::sleep(CLIPBOARD_SETTLE_DELAY);
                    if drain_pending_events(&rx) == 0 {
                        break;
                    }
                }

                let start = std::time::Instant::now();
                handle_clipboard_change(&app_handle);
                let elapsed = start.elapsed();
                if elapsed.as_millis() > SLOW_PROCESSING_MS {
                    tracing::warn!("Slow clipboard processing: {}ms", elapsed.as_millis());
                }
            }
            tracing::info!("Clipboard worker stopped");
        });
    }

    /// Fallback for platforms where no watcher could be created. Reads through
    /// the same backend as the event path, just on a timer.
    fn start_polling(self) {
        let running = self.running.clone();
        let app_handle = self.app_handle.clone();

        thread::spawn(move || {
            tracing::info!("Starting clipboard monitor (polling)");
            while running.load(Ordering::Relaxed) {
                handle_clipboard_change(&app_handle);
                thread::sleep(POLL_INTERVAL);
            }
            tracing::info!("Clipboard polling stopped");
        });
    }
}

// --- Watcher handler ----------------------------------------------------

struct WatcherHandler {
    running: Arc<AtomicBool>,
    event_queue: ClipboardEventQueue,
}

impl ClipboardHandler for WatcherHandler {
    fn on_clipboard_change(&mut self) {
        if !self.running.load(Ordering::Relaxed) {
            return;
        }

        match self.event_queue.enqueue() {
            EnqueueResult::Enqueued => {}
            EnqueueResult::AlreadyPending => {
                tracing::debug!("Clipboard event coalesced while worker is still processing");
            }
            EnqueueResult::Disconnected => {
                tracing::warn!("Clipboard worker channel disconnected; stopping monitor");
                self.running.store(false, Ordering::Relaxed);
            }
        }
    }
}

// --- Change handling ----------------------------------------------------

/// Read the clipboard and store what is there, subject to the capture gate,
/// self-copy suppression and duplicate detection.
///
/// The order matters. The capture gate runs first because it is cheap and can
/// reject without touching the clipboard. Suppression can only run after
/// extraction, since the hash is what identifies Klip's own write -- which
/// means Klip pays extraction cost on its own writes. That is the price of a
/// platform-neutral mechanism, and it is bounded: it happens once per paste, on
/// the worker thread.
fn handle_clipboard_change(app_handle: &AppHandle) {
    let source = crate::platform::source::current();
    if let Some(reason) =
        should_skip_capture(app_handle, source.application(), source.window_title())
    {
        tracing::debug!("Clipboard capture skipped: {:?}", reason);
        return;
    }

    if crate::clipboard::backend::is_klip_owned() {
        tracing::info!("Self-copy suppressed (Klip clipboard marker present)");
        return;
    }

    let extracted = match extract_clipboard_content_with_retry() {
        Some(extracted) => extracted,
        None => return,
    };

    // Record what the clipboard now holds before any of the skip paths below
    // return. Suppression is one-shot: when a suppressed own-write produced a
    // second notification, the arm is already consumed, so only this hash
    // check stops the same content from being saved as new history.
    if remember_clipboard_hash(&extracted.hash) {
        return;
    }

    if suppress::should_suppress(&extracted.hash) {
        tracing::info!("Self-copy suppressed (hash matches Klip's own write)");
        return;
    }

    let item = new_clipboard_item(extracted);
    if save_clipboard_item(
        app_handle,
        &item,
        source.application(),
        source.window_title(),
    )
    .is_err()
    {
        // The insert failed, so LAST_HASH must not keep this hash: the next
        // time the same content lands on the clipboard it should be treated
        // as new, not deduplicated against a save that never happened.
        forget_clipboard_hash(&item.hash);
        tracing::debug!("Rolled back remembered clipboard hash after failed save");
    }
}

/// Store `hash` as the clipboard's current content. Returns true when it is
/// already the recorded hash, i.e. this notification reported unchanged
/// content and nothing further should happen.
///
/// This runs for every extracted change -- including ones suppression later
/// drops -- because its job is tracking what the clipboard holds, not what
/// was saved.
fn remember_clipboard_hash(hash: &str) -> bool {
    let Some(last_hash) = LAST_HASH.get() else {
        return false;
    };
    let mut last = match last_hash.lock() {
        Ok(last) => last,
        Err(_) => return false,
    };
    if *last == hash {
        return true;
    }
    *last = hash.to_string();
    false
}

/// Clear the remembered clipboard hash when it still equals `hash`. Called
/// when persisting the extracted content failed so a later copy of the same
/// payload is not silently deduplicated.
fn forget_clipboard_hash(hash: &str) {
    let Some(last_hash) = LAST_HASH.get() else {
        return;
    };
    if let Ok(mut last) = last_hash.lock() {
        if *last == hash {
            last.clear();
        }
    }
}

fn extract_clipboard_content_with_retry() -> Option<ExtractedContent> {
    let registry = FormatStrategyRegistry::new();

    for attempt in 1..=MAX_EXTRACT_ATTEMPTS {
        // Re-detect on each attempt: the clipboard can change between
        // detection and extraction.
        let outcome = match registry.detect_format() {
            Some((strategy, _)) => strategy.extract().map_err(|e| e.to_string()),
            None => Err("no format detected".to_string()),
        };

        match outcome {
            Ok(extracted) => return Some(extracted),
            Err(e) if attempt == MAX_EXTRACT_ATTEMPTS => {
                tracing::warn!(
                    "Clipboard extraction failed after {} attempts: {}",
                    attempt,
                    e
                );
                return None;
            }
            Err(_) => thread::sleep(EXTRACT_RETRY_DELAY),
        }
    }

    None
}

fn new_clipboard_item(extracted: ExtractedContent) -> NewClipboardItem {
    NewClipboardItem {
        content_type: extracted.content_type,
        data: extracted.data,
        preview: Some(extracted.preview),
        hash: extracted.hash,
        size: extracted.size,
        metadata: extracted.metadata,
        formats: extracted.formats,
        image_sources: extracted.image_sources,
    }
}

fn save_clipboard_item(
    app_handle: &AppHandle,
    item: &NewClipboardItem,
    process_name: Option<&str>,
    window_title: Option<&str>,
) -> Result<(), AppError> {
    tracing::info!("Saving clipboard item to database...");
    let db = app_handle.state::<database::Database>();

    let outcome =
        database::clipboard::insert_with_source_outcome(&db, item, process_name, window_title);

    match outcome {
        Ok(outcome) => {
            let saved_item = outcome.item;
            tracing::info!("Clipboard item saved, id: {}", saved_item.id);
            if !outcome.evicted_image_ids.is_empty() {
                let payload = serde_json::json!({
                    "code": "capacity_cleanup",
                    "message": "Oldest unfavorited images were removed to stay within the image storage budget.",
                    "itemIds": outcome.evicted_image_ids,
                });
                let _ = app_handle.emit("image-storage-warning", payload);
            }
            if let Err(e) = app_handle.emit("clipboard-updated", &saved_item) {
                tracing::warn!("Failed to emit clipboard-updated event: {}", e);
            } else {
                tracing::info!("clipboard-updated event emitted");
            }

            if saved_item.content_type == database::ContentType::Image
                && saved_item.ocr.as_ref().map(|ocr| ocr.status)
                    == Some(database::OcrStatus::Pending)
            {
                if let Some(service) = app_handle.try_state::<crate::ocr::OcrService>() {
                    if let Err(error) = service.enqueue(saved_item.id) {
                        tracing::warn!(
                            "Failed to enqueue OCR for clipboard item {}: {}",
                            saved_item.id,
                            error
                        );
                    }
                } else {
                    tracing::warn!(
                        "OCR worker is unavailable; item {} remains pending",
                        saved_item.id
                    );
                }
            }

            if let Ok(max_count_str) = database::config::get(&db, registry::KEY_MAX_HISTORY_COUNT) {
                if let Ok(max_count) = max_count_str.unwrap_or_default().parse::<i64>() {
                    if max_count > 0 {
                        let _ = database::clipboard::cleanup_old_records(&db, max_count);
                    }
                }
            }
            Ok(())
        }
        Err(e) => {
            tracing::error!("Failed to save clipboard item: {}", e);
            if item.content_type == database::ContentType::Image {
                let message = e.to_string();
                let code = if message.contains("capacity exceeded") {
                    "capacity_exceeded"
                } else if message.contains("128 MiB") || message.contains("above the") {
                    "representation_too_large"
                } else {
                    "capture_failed"
                };
                let _ = app_handle.emit(
                    "image-storage-warning",
                    serde_json::json!({ "code": code, "message": message, "itemIds": [] }),
                );
            }
            Err(e)
        }
    }
}

pub fn insert_from_monitor(
    db: &Database,
    item: &NewClipboardItem,
    process_name: Option<&str>,
    window_title: Option<&str>,
) -> Result<Option<ClipboardItem>, AppError> {
    if capture_gate_decision(db, process_name, window_title)? != CaptureGateDecision::Capture {
        return Ok(None);
    }

    database::clipboard::insert_with_source(db, item, process_name, window_title).map(Some)
}

pub fn capture_gate_decision(
    db: &Database,
    process_name: Option<&str>,
    window_title: Option<&str>,
) -> Result<CaptureGateDecision, AppError> {
    let inputs = fetch_gate_inputs(db)?;
    Ok(decide_gate(&inputs, process_name, window_title))
}

/// The gate as the monitor hot path sees it: identical decision to
/// [`capture_gate_decision`], but the three inputs it reads (monitor-enabled,
/// privacy deadline, source rules) are served from a [`GATE_CACHE_TTL`] cache
/// so a burst of clipboard notifications costs one database read instead of
/// three per event. Writes invalidate the cache via
/// [`invalidate_capture_gate_cache`]; the TTL bounds staleness for writes
/// that bypass those code paths.
fn capture_gate_decision_cached(
    db: &Database,
    process_name: Option<&str>,
    window_title: Option<&str>,
) -> Result<CaptureGateDecision, AppError> {
    let cached = gate_inputs_slot()
        .lock()
        .ok()
        .and_then(|guard| {
            guard.as_ref().and_then(|inputs| {
                (inputs.fetched_at.elapsed() < GATE_CACHE_TTL).then(|| {
                    (
                        inputs.enabled,
                        inputs.privacy_until,
                        inputs.rules.clone(),
                    )
                })
            })
        });

    let (enabled, privacy_until, rules) = match cached {
        Some(inputs) => inputs,
        None => {
            let inputs = fetch_gate_inputs(db)?;
            let snapshot = (
                inputs.enabled,
                inputs.privacy_until,
                inputs.rules.clone(),
            );
            if let Ok(mut guard) = gate_inputs_slot().lock() {
                *guard = Some(inputs);
            }
            snapshot
        }
    };

    let inputs = GateInputs {
        enabled,
        privacy_until,
        rules,
        fetched_at: Instant::now(),
    };
    Ok(decide_gate(&inputs, process_name, window_title))
}

fn fetch_gate_inputs(db: &Database) -> Result<GateInputs, AppError> {
    let enabled = database::config::get(db, registry::KEY_CLIPBOARD_MONITOR_ENABLED)?
        .unwrap_or_else(|| "true".to_string())
        == "true";
    let privacy_until = database::config::get(db, registry::KEY_PRIVACY_MODE_UNTIL)?
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    let rules = database::productization::list_source_rules(db)?;
    Ok(GateInputs {
        enabled,
        privacy_until,
        rules,
        fetched_at: Instant::now(),
    })
}

fn decide_gate(
    inputs: &GateInputs,
    process_name: Option<&str>,
    window_title: Option<&str>,
) -> CaptureGateDecision {
    if !inputs.enabled {
        return CaptureGateDecision::SkipMonitoringDisabled;
    }

    if inputs.privacy_until > now_millis() {
        return CaptureGateDecision::SkipPrivacyMode;
    }

    let process = process_name.unwrap_or_default().to_ascii_lowercase();
    let title = window_title.unwrap_or_default().to_ascii_lowercase();
    let ignored = inputs.rules.iter().any(|rule| {
        if !rule.enabled {
            return false;
        }
        let pattern = rule.pattern.to_ascii_lowercase();
        match rule.match_type.as_str() {
            "process" => process.contains(&pattern),
            "title" => title.contains(&pattern),
            "any" => process.contains(&pattern) || title.contains(&pattern),
            _ => false,
        }
    });
    if ignored {
        return CaptureGateDecision::SkipSourceRule;
    }

    CaptureGateDecision::Capture
}

fn should_skip_capture(
    app_handle: &AppHandle,
    process_name: Option<&str>,
    window_title: Option<&str>,
) -> Option<CaptureGateDecision> {
    let db = app_handle.state::<database::Database>();
    match capture_gate_decision_cached(&db, process_name, window_title) {
        Ok(CaptureGateDecision::Capture) => None,
        Ok(decision) => Some(decision),
        Err(error) => {
            tracing::warn!("Failed to evaluate clipboard capture gate: {}", error);
            None
        }
    }
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Diagnostics helper: what formats the clipboard is currently offering.
pub fn current_clipboard_formats() -> Vec<String> {
    backend::available_formats()
}

pub fn start_monitor(app_handle: AppHandle) -> Result<(), crate::AppError> {
    let monitor = ClipboardMonitor::new(app_handle);
    monitor.start().map_err(crate::AppError::Clipboard)
}

#[cfg(test)]
mod tests {
    use crate::config::registry;
    use crate::database::{self, ContentType, Database, NewClipboardItem, SourceRuleInput};
    use rusqlite::Connection;
    use sha2::{Digest, Sha256};

    use std::sync::Mutex;

    use super::{drain_pending_events, ClipboardEventQueue, EnqueueResult};

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();
        db
    }

    /// The gate cache is process-global, so tests that observe it must not run
    /// concurrently with each other.
    static GATE_SERIAL: Mutex<()> = Mutex::new(());

    fn gate_guard() -> std::sync::MutexGuard<'static, ()> {
        let g = GATE_SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        super::invalidate_capture_gate_cache();
        g
    }

    fn text_item(content: &str) -> NewClipboardItem {
        NewClipboardItem {
            content_type: ContentType::Text,
            data: content.as_bytes().to_vec(),
            preview: Some(content.to_string()),
            hash: format!("{:x}", Sha256::digest(content.as_bytes())),
            size: content.len() as i64,
            metadata: None,
            formats: Vec::new(),
            image_sources: Vec::new(),
        }
    }

    #[test]
    fn capture_gate_skips_when_monitoring_is_disabled() {
        let db = test_db();
        database::config::set(&db, registry::KEY_CLIPBOARD_MONITOR_ENABLED, "false").unwrap();

        let decision = super::capture_gate_decision(&db, None, None).unwrap();

        assert_eq!(decision, super::CaptureGateDecision::SkipMonitoringDisabled);
    }

    #[test]
    fn capture_gate_skips_while_privacy_mode_is_active() {
        let db = test_db();
        database::config::set(
            &db,
            registry::KEY_PRIVACY_MODE_UNTIL,
            &(super::now_millis() + 60_000).to_string(),
        )
        .unwrap();

        let decision = super::capture_gate_decision(&db, None, None).unwrap();

        assert_eq!(decision, super::CaptureGateDecision::SkipPrivacyMode);
    }

    #[test]
    fn capture_gate_skips_when_source_rule_matches() {
        let db = test_db();
        database::productization::create_source_rule(
            &db,
            SourceRuleInput {
                match_type: "process".into(),
                pattern: "1password.exe".into(),
                enabled: true,
            },
        )
        .unwrap();

        let decision =
            super::capture_gate_decision(&db, Some("1Password.exe"), Some("Unlocked")).unwrap();

        assert_eq!(decision, super::CaptureGateDecision::SkipSourceRule);
    }

    #[test]
    fn capture_gate_allows_capture_when_the_source_is_unknown() {
        let db = test_db();
        database::productization::create_source_rule(
            &db,
            SourceRuleInput {
                match_type: "process".into(),
                pattern: "1password.exe".into(),
                enabled: true,
            },
        )
        .unwrap();

        // Platforms without source attribution report no process or title.
        // An ignore rule must not turn that into "ignore everything".
        let decision = super::capture_gate_decision(&db, None, None).unwrap();

        assert_eq!(decision, super::CaptureGateDecision::Capture);
    }

    #[test]
    fn cached_gate_serves_inputs_until_invalidation() {
        let _serial = gate_guard();
        let db = test_db();

        // First call populates the cache (monitoring enabled → Capture).
        let decision = super::capture_gate_decision_cached(&db, None, None).unwrap();
        assert_eq!(decision, super::CaptureGateDecision::Capture);

        // Write directly to the db -- bypassing the invalidating commands --
        // so the cached answer stays authoritative within the TTL.
        database::config::set(&db, registry::KEY_CLIPBOARD_MONITOR_ENABLED, "false").unwrap();
        let decision = super::capture_gate_decision_cached(&db, None, None).unwrap();
        assert_eq!(decision, super::CaptureGateDecision::Capture);

        // After invalidation the fresh value is read.
        super::invalidate_capture_gate_cache();
        let decision = super::capture_gate_decision_cached(&db, None, None).unwrap();
        assert_eq!(decision, super::CaptureGateDecision::SkipMonitoringDisabled);
    }

    #[test]
    fn insert_from_monitor_respects_capture_gate_without_touching_manual_insert() {
        let db = test_db();
        database::config::set(&db, registry::KEY_CLIPBOARD_MONITOR_ENABLED, "false").unwrap();
        let item = text_item("monitor should skip");

        let result = super::insert_from_monitor(&db, &item, None, None).unwrap();

        assert!(result.is_none());
        assert!(database::clipboard::get_list(&db, 100, 0)
            .unwrap()
            .is_empty());

        let manual = database::clipboard::insert(&db, &item).unwrap();
        assert_eq!(manual.preview.as_deref(), Some("monitor should skip"));
    }

    #[test]
    fn insert_from_monitor_persists_source_attribution() {
        let db = test_db();
        let item = text_item("source-aware capture");

        let saved =
            super::insert_from_monitor(&db, &item, Some("editor.exe"), Some("Draft document"))
                .unwrap()
                .unwrap();

        assert_eq!(saved.source_application.as_deref(), Some("editor.exe"));
        assert_eq!(saved.source_window_title.as_deref(), Some("Draft document"));
    }

    #[test]
    fn clipboard_event_queue_coalesces_while_worker_is_busy() {
        let (queue, rx) = ClipboardEventQueue::new();

        assert_eq!(queue.enqueue(), EnqueueResult::Enqueued);
        assert_eq!(queue.enqueue(), EnqueueResult::AlreadyPending);

        rx.recv().unwrap();

        assert_eq!(queue.enqueue(), EnqueueResult::Enqueued);
    }

    #[test]
    fn clipboard_event_queue_reports_disconnected_worker() {
        let (queue, rx) = ClipboardEventQueue::new();
        drop(rx);

        assert_eq!(queue.enqueue(), EnqueueResult::Disconnected);
    }

    #[test]
    fn drain_pending_events_detects_burst_after_worker_starts_processing() {
        let (queue, rx) = ClipboardEventQueue::new();

        assert_eq!(queue.enqueue(), EnqueueResult::Enqueued);
        rx.recv().unwrap();

        assert_eq!(queue.enqueue(), EnqueueResult::Enqueued);
        assert_eq!(queue.enqueue(), EnqueueResult::AlreadyPending);

        assert_eq!(drain_pending_events(&rx), 1);
        assert_eq!(drain_pending_events(&rx), 0);
    }
}
