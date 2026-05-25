use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "windows")]
use std::sync::mpsc::{self, Receiver, SyncSender, TryRecvError, TrySendError};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "windows")]
use crate::clipboard::format::{ExtractedContent, FormatStrategyRegistry};
use crate::database::{self, ClipboardItem, NewClipboardItem};
use crate::{AppError, Database};

#[cfg(target_os = "windows")]
use clipboard_master::{CallbackResult, ClipboardHandler, Master};

#[cfg(all(not(target_os = "windows"), not(target_os = "linux")))]
use arboard::Clipboard;

static LAST_HASH: std::sync::OnceLock<std::sync::Mutex<String>> = std::sync::OnceLock::new();

#[cfg(target_os = "windows")]
const CLIPBOARD_SETTLE_DELAY: std::time::Duration = std::time::Duration::from_millis(150);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureGateDecision {
    Capture,
    SkipMonitoringDisabled,
    SkipPrivacyMode,
    SkipSourceRule,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EnqueueResult {
    Enqueued,
    AlreadyPending,
    Disconnected,
}

#[cfg(target_os = "windows")]
#[derive(Clone)]
struct ClipboardEventQueue {
    tx: SyncSender<()>,
}

#[cfg(target_os = "windows")]
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

#[cfg(target_os = "windows")]
fn drain_pending_events(rx: &Receiver<()>) -> usize {
    let mut drained = 0;
    loop {
        match rx.try_recv() {
            Ok(()) => drained += 1,
            Err(TryRecvError::Empty) | Err(TryRecvError::Disconnected) => return drained,
        }
    }
}

#[cfg(target_os = "windows")]
fn is_self_copy_marker_present() -> bool {
    let format_id = clipboard_win::raw::register_format("Clipboard Viewer Ignore");
    match format_id {
        Some(id) => clipboard_win::raw::is_format_avail(id.get()),
        None => false,
    }
}

// --- ClipboardMonitor ---

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

        #[cfg(target_os = "windows")]
        {
            self.start_event_based()
        }

        #[cfg(not(target_os = "windows"))]
        {
            self.start_polling()
        }
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }

    #[cfg(target_os = "windows")]
    fn start_event_based(self) -> Result<(), String> {
        let running = self.running.clone();
        let app_handle = self.app_handle.clone();
        let (event_queue, rx) = ClipboardEventQueue::new();

        {
            let running = running.clone();
            let app_handle = app_handle.clone();
            thread::spawn(move || {
                while running.load(Ordering::Relaxed) {
                    if rx.recv().is_err() {
                        break;
                    }

                    // Wait for a short quiet period so a burst of clipboard
                    // change events settles before we try to read it.
                    loop {
                        thread::sleep(CLIPBOARD_SETTLE_DELAY);
                        if drain_pending_events(&rx) == 0 {
                            break;
                        }
                    }

                    if is_self_copy_marker_present() {
                        tracing::info!("Self-copy marker detected, skipping");
                        continue;
                    }

                    let source = current_clipboard_source();
                    if let Some(reason) = should_skip_capture(
                        &app_handle,
                        source.process_name(),
                        source.window_title(),
                    ) {
                        tracing::info!("Clipboard capture skipped: {:?}", reason);
                        continue;
                    }

                    tracing::info!("Clipboard change detected, extracting content...");

                    let start = std::time::Instant::now();
                    let extracted = extract_clipboard_content_with_retry();
                    if let Some(extracted) = extracted {
                        if let Some(item) = process_extracted_content(extracted) {
                            save_clipboard_item(
                                &app_handle,
                                &item,
                                source.process_name(),
                                source.window_title(),
                            );
                        }
                    }
                    let elapsed = start.elapsed();
                    if elapsed.as_millis() > 100 {
                        tracing::warn!("Slow clipboard processing: {}ms", elapsed.as_millis());
                    }
                }
            });
        }

        thread::spawn(move || {
            let handler = WindowsClipboardHandler {
                running,
                event_queue,
            };

            let mut master = match Master::new(handler) {
                Ok(m) => m,
                Err(e) => {
                    tracing::error!("Failed to create clipboard master: {}", e);
                    return;
                }
            };

            tracing::info!("Starting clipboard monitor (event-based)");
            if let Err(e) = master.run() {
                tracing::error!("Clipboard monitor error: {}", e);
            }
        });

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    fn start_polling(self) -> Result<(), String> {
        let running = self.running.clone();
        let app_handle = self.app_handle.clone();

        thread::spawn(move || {
            tracing::info!("Starting clipboard monitor (polling-based)");

            while running.load(Ordering::Relaxed) {
                if let Some(reason) = should_skip_capture(&app_handle, None, None) {
                    tracing::debug!("Clipboard capture skipped: {:?}", reason);
                    thread::sleep(std::time::Duration::from_millis(500));
                    continue;
                }

                if let Ok(text) = read_platform_text() {
                    if let Some(item) = process_extracted_text(&text) {
                        save_clipboard_item(&app_handle, &item, None, None);
                    }
                }

                thread::sleep(std::time::Duration::from_millis(500));
            }
        });

        Ok(())
    }
}

// --- Windows clipboard handler ---

#[cfg(target_os = "windows")]
struct WindowsClipboardHandler {
    running: Arc<AtomicBool>,
    event_queue: ClipboardEventQueue,
}

#[cfg(target_os = "windows")]
fn extract_clipboard_content_with_retry() -> Option<ExtractedContent> {
    let registry = FormatStrategyRegistry::new();
    const MAX_OUTER_ATTEMPTS: u32 = 3;

    let mut outer_attempts = 0;
    loop {
        // Re-detect format on each outer attempt to handle clipboard content
        // changing between detection and extraction.
        let (strategy, _content_type) = match registry.detect_format() {
            Some(s) => s,
            None => {
                outer_attempts += 1;
                if outer_attempts >= MAX_OUTER_ATTEMPTS {
                    tracing::warn!("extract_clipboard_content_with_retry: no format detected after {} attempts", outer_attempts);
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
                continue;
            }
        };

        match strategy.extract() {
            Ok(extracted) => return Some(extracted),
            Err(e) => {
                outer_attempts += 1;
                if outer_attempts >= MAX_OUTER_ATTEMPTS {
                    tracing::warn!(
                        "extract_clipboard_content_with_retry: all attempts failed: {}",
                        e
                    );
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }
    }
}

#[cfg(target_os = "windows")]
impl ClipboardHandler for WindowsClipboardHandler {
    fn on_clipboard_change(&mut self) -> CallbackResult {
        if !self.running.load(Ordering::Relaxed) {
            return CallbackResult::Stop;
        }

        match self.event_queue.enqueue() {
            EnqueueResult::Enqueued => {}
            EnqueueResult::AlreadyPending => {
                tracing::debug!("Clipboard event coalesced while worker is still processing");
            }
            EnqueueResult::Disconnected => {
                tracing::warn!("Clipboard worker channel disconnected; stopping monitor");
                return CallbackResult::Stop;
            }
        }

        CallbackResult::Next
    }

    fn on_clipboard_error(&mut self, error: std::io::Error) -> CallbackResult {
        tracing::error!("Clipboard error: {}", error);
        CallbackResult::Next
    }
}

// --- Content processing ---

#[cfg(target_os = "windows")]
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
    })
}

#[cfg(target_os = "linux")]
fn read_platform_text() -> Result<String, String> {
    crate::platform::linux::get_text()
}

#[cfg(all(not(target_os = "windows"), not(target_os = "linux")))]
fn read_platform_text() -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.get_text().map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
fn process_extracted_text(text: &str) -> Option<NewClipboardItem> {
    if text.trim().is_empty() {
        return None;
    }

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    if let Some(last_hash) = LAST_HASH.get() {
        let mut last = last_hash.lock().ok()?;
        if *last == hash {
            return None;
        }
        *last = hash.clone();
    }

    let preview: String = text.chars().take(200).collect();

    Some(NewClipboardItem {
        content_type: crate::database::types::ContentType::Text,
        data: text.as_bytes().to_vec(),
        preview: Some(preview),
        hash,
        size: text.len() as i64,
        metadata: None,
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

            if let Ok(max_count_str) = database::config::get(&db, "max_history_count") {
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
    let enabled = database::config::get(db, "clipboard_monitor_enabled")?
        .unwrap_or_else(|| "true".to_string());
    if enabled != "true" {
        return Ok(CaptureGateDecision::SkipMonitoringDisabled);
    }

    let privacy_until = database::config::get(db, "privacy_mode_until")?
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
    use crate::database::{self, ContentType, Database, NewClipboardItem, SourceRuleInput};
    use rusqlite::Connection;
    use sha2::{Digest, Sha256};

    #[cfg(target_os = "windows")]
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
        }
    }

    #[test]
    fn capture_gate_skips_when_monitoring_is_disabled() {
        let db = test_db();
        database::config::set(&db, "clipboard_monitor_enabled", "false").unwrap();

        let decision = super::capture_gate_decision(&db, None, None).unwrap();

        assert_eq!(decision, super::CaptureGateDecision::SkipMonitoringDisabled);
    }

    #[test]
    fn capture_gate_skips_while_privacy_mode_is_active() {
        let db = test_db();
        database::config::set(
            &db,
            "privacy_mode_until",
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
    fn insert_from_monitor_respects_capture_gate_without_touching_manual_insert() {
        let db = test_db();
        database::config::set(&db, "clipboard_monitor_enabled", "false").unwrap();
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
    #[cfg(target_os = "windows")]
    fn clipboard_event_queue_coalesces_while_worker_is_busy() {
        let (queue, rx) = ClipboardEventQueue::new();

        assert_eq!(queue.enqueue(), EnqueueResult::Enqueued);
        assert_eq!(queue.enqueue(), EnqueueResult::AlreadyPending);

        rx.recv().unwrap();

        assert_eq!(queue.enqueue(), EnqueueResult::Enqueued);
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn clipboard_event_queue_reports_disconnected_worker() {
        let (queue, rx) = ClipboardEventQueue::new();
        drop(rx);

        assert_eq!(queue.enqueue(), EnqueueResult::Disconnected);
    }

    #[test]
    #[cfg(target_os = "windows")]
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
