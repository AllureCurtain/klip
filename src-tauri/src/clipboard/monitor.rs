use base64::Engine;
use image::GenericImageView;
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "windows")]
use std::sync::mpsc::{self, Receiver, SyncSender, TryRecvError, TrySendError};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

use crate::clipboard::format::{ExtractedContent, FormatStrategyRegistry, ImageDimensions};
use crate::database::{self, NewClipboardItem};

#[cfg(target_os = "windows")]
use clipboard_master::{CallbackResult, ClipboardHandler, Master};

#[cfg(not(target_os = "windows"))]
use arboard::Clipboard;

static LAST_HASH: std::sync::OnceLock<std::sync::Mutex<String>> = std::sync::OnceLock::new();

const KLIP_IGNORE_FORMAT: &str = "Clipboard Viewer Ignore";
#[cfg(target_os = "windows")]
const CLIPBOARD_SETTLE_DELAY: std::time::Duration = std::time::Duration::from_millis(150);

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

// --- RAII ClipboardGuard (Windows only) ---

/// RAII guard that opens the Win32 clipboard on creation and closes it on Drop.
/// Prevents clipboard lock leaks if any code path forgets to close.
#[cfg(target_os = "windows")]
struct ClipboardGuard {
    _private: (),
}

#[cfg(target_os = "windows")]
impl ClipboardGuard {
    /// Open the clipboard with retry, returning a guard that will close on drop.
    fn open(max_attempts: u32) -> Result<Self, String> {
        let mut attempts = 0;
        loop {
            match clipboard_win::raw::open() {
                Ok(()) => return Ok(Self { _private: () }),
                Err(e) => {
                    attempts += 1;
                    if attempts >= max_attempts {
                        return Err(format!(
                            "failed to open clipboard after {} retries: {}",
                            attempts, e
                        ));
                    }
                    thread::sleep(std::time::Duration::from_millis(50));
                }
            }
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        if let Err(e) = clipboard_win::raw::close() {
            tracing::warn!("Failed to close clipboard: {}", e);
        }
    }
}

// --- Self-copy marker ---

#[cfg(target_os = "windows")]
fn is_self_copy_marker_present() -> bool {
    let format_id = clipboard_win::raw::register_format(KLIP_IGNORE_FORMAT);
    match format_id {
        Some(id) => clipboard_win::raw::is_format_avail(id.get()),
        None => false,
    }
}

#[cfg(not(target_os = "windows"))]
fn is_self_copy_marker_present() -> bool {
    false
}

// --- Write operations with self-copy marker ---

#[cfg(target_os = "windows")]
fn raw_set_text_with_marker(text: &str) -> Result<(), String> {
    let ignore_format = clipboard_win::raw::register_format(KLIP_IGNORE_FORMAT);
    let _guard = ClipboardGuard::open(10)?;

    clipboard_win::raw::empty().map_err(|e| e.to_string())?;
    clipboard_win::raw::set_string(text).map_err(|e| e.to_string())?;

    if let Some(id) = ignore_format {
        clipboard_win::raw::set_without_clear(id.get(), b"Klip").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn raw_set_text_with_marker(text: &str) -> Result<(), String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn raw_set_image_with_marker(png_data: &[u8], metadata: Option<&str>) -> Result<(), String> {
    let img =
        image::load_from_memory(png_data).map_err(|e| format!("failed to decode PNG: {}", e))?;

    let (w, h) = if let Some(meta_str) = metadata {
        serde_json::from_str::<ImageDimensions>(meta_str)
            .map(|m| (m.width as usize, m.height as usize))
            .unwrap_or_else(|_| {
                let dims = img.dimensions();
                (dims.0 as usize, dims.1 as usize)
            })
    } else {
        let dims = img.dimensions();
        (dims.0 as usize, dims.1 as usize)
    };

    let rgba = img.to_rgba8();
    let raw = arboard::ImageData {
        width: w,
        height: h,
        bytes: rgba.as_raw().clone().into(),
    };

    let mut attempts = 0;
    loop {
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        match cb.set_image(raw.clone()) {
            Ok(()) => break,
            Err(e) => {
                attempts += 1;
                if attempts >= 10 {
                    return Err(format!(
                        "failed to set image after {} retries: {}",
                        attempts, e
                    ));
                }
                thread::sleep(std::time::Duration::from_millis(50));
            }
        }
    }

    // Add the ignore marker after image is set
    let ignore_format = clipboard_win::raw::register_format(KLIP_IGNORE_FORMAT);
    if let Ok(_guard) = ClipboardGuard::open(5) {
        if let Some(id) = ignore_format {
            if let Err(e) = clipboard_win::raw::set_without_clear(id.get(), b"Klip") {
                tracing::warn!("Failed to set ignore marker: {}", e);
            }
        }
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn raw_set_image_with_marker(png_data: &[u8], _metadata: Option<&str>) -> Result<(), String> {
    let img =
        image::load_from_memory(png_data).map_err(|e| format!("failed to decode PNG: {}", e))?;
    let dims = img.dimensions();
    let rgba = img.to_rgba8();
    let raw = arboard::ImageData {
        width: dims.0 as usize,
        height: dims.1 as usize,
        bytes: rgba.as_raw().clone().into(),
    };
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_image(raw).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn raw_set_file_list_with_marker(paths: &[&str]) -> Result<(), String> {
    // CFSTR_PREFERREDDROPEFFECT — required so Explorer treats CF_HDROP as a
    // copy operation. Without it, "Paste" in Explorer is disabled / ignored.
    const DROPEFFECT_COPY: u32 = 5;

    let ignore_format = clipboard_win::raw::register_format(KLIP_IGNORE_FORMAT);
    let dropeffect_format = clipboard_win::raw::register_format("Preferred DropEffect");

    let _guard = ClipboardGuard::open(10)?;

    clipboard_win::raw::empty().map_err(|e| e.to_string())?;
    clipboard_win::raw::set_file_list(paths).map_err(|e| e.to_string())?;

    if let Some(id) = dropeffect_format {
        clipboard_win::raw::set_without_clear(id.get(), &DROPEFFECT_COPY.to_le_bytes())
            .map_err(|e| e.to_string())?;
    } else {
        tracing::warn!("Failed to register Preferred DropEffect format");
    }

    if let Some(id) = ignore_format {
        clipboard_win::raw::set_without_clear(id.get(), b"Klip").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn raw_set_file_list_with_marker(_paths: &[&str]) -> Result<(), String> {
    Err("file copy back not supported on this platform".to_string())
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

                    tracing::info!("Clipboard change detected, extracting content...");

                    let start = std::time::Instant::now();
                    let extracted = extract_clipboard_content_with_retry();
                    if let Some(extracted) = extracted {
                        if let Some(item) = process_extracted_content(extracted) {
                            save_clipboard_item(&app_handle, &item);
                        }
                    }
                    let elapsed = start.elapsed();
                    if elapsed.as_millis() > 100 {
                        tracing::warn!(
                            "Slow clipboard processing: {}ms",
                            elapsed.as_millis()
                        );
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
            let mut clipboard = match Clipboard::new() {
                Ok(cb) => cb,
                Err(e) => {
                    tracing::error!("Failed to initialize clipboard: {}", e);
                    return;
                }
            };

            tracing::info!("Starting clipboard monitor (polling-based)");

            while running.load(Ordering::Relaxed) {
                if let Ok(text) = clipboard.get_text() {
                    if let Some(item) = process_extracted_text(&text) {
                        save_clipboard_item(&app_handle, &item);
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

fn save_clipboard_item(app_handle: &AppHandle, item: &NewClipboardItem) {
    tracing::info!("Saving clipboard item to database...");
    let db = app_handle.state::<database::Database>();

    match database::clipboard::insert(&db, item) {
        Ok(saved_item) => {
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
        Err(e) => {
            tracing::error!("Failed to save clipboard item: {}", e);
        }
    }
}

pub fn copy_to_clipboard(
    content: &str,
    content_type: &crate::database::types::ContentType,
    metadata: Option<&str>,
) -> Result<(), String> {
    match content_type {
        crate::database::types::ContentType::Text => raw_set_text_with_marker(content),
        crate::database::types::ContentType::Image => {
            let png_data = if let Some(stripped) = content.strip_prefix("data:image/png;base64,") {
                base64::engine::general_purpose::STANDARD
                    .decode(stripped)
                    .map_err(|e| e.to_string())?
            } else {
                content.as_bytes().to_vec()
            };
            raw_set_image_with_marker(&png_data, metadata)
        }
        crate::database::types::ContentType::File => {
            let paths: Vec<String> = serde_json::from_str(content)
                .map_err(|e| format!("invalid file path JSON: {}", e))?;
            let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
            raw_set_file_list_with_marker(&path_refs)
        }
    }
}

pub fn start_monitor(app_handle: AppHandle) -> Result<(), String> {
    let monitor = ClipboardMonitor::new(app_handle);
    monitor.start()
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::{drain_pending_events, ClipboardEventQueue, EnqueueResult};

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
