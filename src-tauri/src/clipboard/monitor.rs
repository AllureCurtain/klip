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
use std::sync::Arc;
use std::thread;
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
static LAST_HASH: std::sync::OnceLock<std::sync::Mutex<String>> = std::sync::OnceLock::new();

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
        LAST_HASH.get_or_init(|| std::sync::Mutex::new(String::new()));

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
    let source = current_clipboard_source();
    if let Some(reason) =
        should_skip_capture(app_handle, source.process_name(), source.window_title())
    {
        tracing::debug!("Clipboard capture skipped: {:?}", reason);
        return;
    }

    let extracted = match extract_clipboard_content_with_retry() {
        Some(extracted) => extracted,
        None => return,
    };

    if suppress::should_suppress(&extracted.hash) {
        tracing::info!("Self-copy suppressed (hash matches Klip's own write)");
        return;
    }

    if let Some(item) = process_extracted_content(extracted) {
        save_clipboard_item(
            app_handle,
            &item,
            source.process_name(),
            source.window_title(),
        );
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

fn process_extracted_content(extracted: ExtractedContent) -> Option<NewClipboardItem> {
    if let Some(last_hash) = LAST_HASH.get() {
        let mut last = last_hash.lock().ok()?;
        if *last == extracted.hash {
            return None;
        }
        *last = extracted.hash.clone();
    }

    Some(NewClipboardItem {
        content_type: extracted.content_type,
        data: extracted.data,
        preview: Some(extracted.preview),
        hash: extracted.hash,
        size: extracted.size,
        metadata: extracted.metadata,
        formats: extracted.formats,
    })
}

fn save_clipboard_item(
    app_handle: &AppHandle,
    item: &NewClipboardItem,
    process_name: Option<&str>,
    window_title: Option<&str>,
) {
    tracing::info!("Saving clipboard item to database...");
    let db = app_handle.state::<database::Database>();

    match insert_from_monitor(&db, item, process_name, window_title) {
        Ok(Some(saved_item)) => {
            tracing::info!("Clipboard item saved, id: {}", saved_item.id);
            if let Err(e) = app_handle.emit("clipboard-updated", &saved_item) {
                tracing::warn!("Failed to emit clipboard-updated event: {}", e);
            } else {
                tracing::info!("clipboard-updated event emitted");
            }

            if let Ok(max_count_str) = database::config::get(&db, registry::KEY_MAX_HISTORY_COUNT) {
                if let Ok(max_count) = max_count_str.unwrap_or_default().parse::<i64>() {
                    if max_count > 0 {
                        let _ = database::clipboard::cleanup_old_records(&db, max_count);
                    }
                }
            }
        }
        Ok(None) => {
            tracing::info!("Clipboard item skipped by capture gate");
        }
        Err(e) => {
            tracing::error!("Failed to save clipboard item: {}", e);
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

    database::clipboard::insert(db, item).map(Some)
}

pub fn capture_gate_decision(
    db: &Database,
    process_name: Option<&str>,
    window_title: Option<&str>,
) -> Result<CaptureGateDecision, AppError> {
    let enabled = database::config::get(db, registry::KEY_CLIPBOARD_MONITOR_ENABLED)?
        .unwrap_or_else(|| "true".to_string());
    if enabled != "true" {
        return Ok(CaptureGateDecision::SkipMonitoringDisabled);
    }

    let privacy_until = database::config::get(db, registry::KEY_PRIVACY_MODE_UNTIL)?
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    if privacy_until > now_millis() {
        return Ok(CaptureGateDecision::SkipPrivacyMode);
    }

    if database::productization::source_should_be_ignored(db, process_name, window_title)? {
        return Ok(CaptureGateDecision::SkipSourceRule);
    }

    Ok(CaptureGateDecision::Capture)
}

fn should_skip_capture(
    app_handle: &AppHandle,
    process_name: Option<&str>,
    window_title: Option<&str>,
) -> Option<CaptureGateDecision> {
    let db = app_handle.state::<database::Database>();
    match capture_gate_decision(&db, process_name, window_title) {
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

// --- Source attribution -------------------------------------------------

#[derive(Default)]
struct ClipboardSource {
    process_name: Option<String>,
    window_title: Option<String>,
}

impl ClipboardSource {
    fn process_name(&self) -> Option<&str> {
        self.process_name.as_deref()
    }

    fn window_title(&self) -> Option<&str> {
        self.window_title.as_deref()
    }
}

#[cfg(target_os = "windows")]
fn current_clipboard_source() -> ClipboardSource {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return ClipboardSource::default();
        }

        let title = {
            let len = GetWindowTextLengthW(hwnd);
            if len > 0 {
                let mut buffer = vec![0u16; len as usize + 1];
                let copied = GetWindowTextW(hwnd, &mut buffer);
                if copied > 0 {
                    Some(String::from_utf16_lossy(&buffer[..copied as usize]))
                } else {
                    None
                }
            } else {
                None
            }
        };

        let mut pid = 0u32;
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let process_name = if pid > 0 {
            OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
                .ok()
                .and_then(|handle| {
                    let mut buffer = vec![0u16; 32768];
                    let mut len = buffer.len() as u32;
                    let result = QueryFullProcessImageNameW(
                        handle,
                        PROCESS_NAME_WIN32,
                        PWSTR::from_raw(buffer.as_mut_ptr()),
                        &mut len,
                    );
                    let _ = CloseHandle(handle);
                    result.ok().and_then(|_| {
                        let path = String::from_utf16_lossy(&buffer[..len as usize]);
                        std::path::Path::new(&path)
                            .file_name()
                            .and_then(|name| name.to_str())
                            .map(|name| name.to_string())
                    })
                })
        } else {
            None
        };

        ClipboardSource {
            process_name,
            window_title: title,
        }
    }
}

/// No source attribution outside Windows yet. Returning an empty source means
/// the capture gate sees no process or title to match, and
/// `source_should_be_ignored` therefore lets the item through -- capturing is
/// the correct default when the source is unknown.
#[cfg(not(target_os = "windows"))]
fn current_clipboard_source() -> ClipboardSource {
    ClipboardSource::default()
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

    use super::{drain_pending_events, ClipboardEventQueue, EnqueueResult};

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();
        db
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
