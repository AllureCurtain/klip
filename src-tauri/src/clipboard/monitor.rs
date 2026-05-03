use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

use crate::database::{self, NewClipboardItem};

#[cfg(target_os = "windows")]
use clipboard_master::{CallbackResult, ClipboardHandler, Master};

#[cfg(not(target_os = "windows"))]
use arboard::Clipboard;

static LAST_HASH: std::sync::OnceLock<std::sync::Mutex<String>> = std::sync::OnceLock::new();

/// 剪贴板监听器
///
/// Windows: 使用 clipboard-master 的事件驱动方式
/// macOS/Linux: 使用轮询方式 (TODO: 后续优化)
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

    /// 启动剪贴板监听
    pub fn start(self) -> Result<(), String> {
        LAST_HASH.get_or_init(|| std::sync::Mutex::new(String::new()));

        #[cfg(target_os = "windows")]
        {
            self.start_event_based()
        }

        #[cfg(not(target_os = "windows"))]
        {
            // TODO: macOS/Linux 使用轮询方式
            // 后续可以考虑使用 clipboard-master 的事件驱动方式
            self.start_polling()
        }
    }

    /// 停止监听
    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }

    /// Windows: 事件驱动方式
    #[cfg(target_os = "windows")]
    fn start_event_based(self) -> Result<(), String> {
        let running = self.running.clone();
        let app_handle = self.app_handle.clone();

        thread::spawn(move || {
            let handler = WindowsClipboardHandler {
                app_handle: app_handle.clone(),
                running,
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

    /// macOS/Linux: 轮询方式
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
                    if let Some(item) = check_and_create_item(&text, "text") {
                        save_clipboard_item(&app_handle, &item);
                    }
                }

                thread::sleep(Duration::from_millis(500));
            }
        });

        Ok(())
    }
}

/// Windows 剪贴板事件处理器
#[cfg(target_os = "windows")]
struct WindowsClipboardHandler {
    app_handle: AppHandle,
    running: Arc<AtomicBool>,
}

#[cfg(target_os = "windows")]
impl ClipboardHandler for WindowsClipboardHandler {
    fn on_clipboard_change(&mut self) -> CallbackResult {
        tracing::info!("Clipboard change detected!");

        if !self.running.load(Ordering::Relaxed) {
            return CallbackResult::Stop;
        }

        // 读取剪贴板内容
        use arboard::Clipboard;
        let mut clipboard = match Clipboard::new() {
            Ok(cb) => cb,
            Err(e) => {
                tracing::error!("Failed to access clipboard: {}", e);
                return CallbackResult::Next;
            }
        };

        match clipboard.get_text() {
            Ok(text) => {
                tracing::info!("Clipboard text length: {}", text.len());
                if let Some(item) = check_and_create_item(&text, "text") {
                    tracing::info!("New clipboard item created, saving...");
                    // 在新线程中保存，避免阻塞 clipboard-master 的事件循环
                    let app_handle = self.app_handle.clone();
                    thread::spawn(move || {
                        save_clipboard_item(&app_handle, &item);
                    });
                } else {
                    tracing::info!("Clipboard item skipped (empty or duplicate)");
                }
            }
            Err(e) => {
                tracing::warn!("Failed to get clipboard text: {}", e);
            }
        }

        CallbackResult::Next
    }

    fn on_clipboard_error(&mut self, error: std::io::Error) -> CallbackResult {
        tracing::error!("Clipboard error: {}", error);
        CallbackResult::Next
    }
}

/// 检查剪贴板内容并创建新记录
fn check_and_create_item(content: &str, content_type: &str) -> Option<NewClipboardItem> {
    // 跳过空内容
    if content.trim().is_empty() {
        return None;
    }

    // 计算哈希
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    // 检查是否重复
    if let Some(last_hash) = LAST_HASH.get() {
        let mut last = match last_hash.lock() {
            Ok(guard) => guard,
            Err(_) => return None,
        };
        if *last == hash {
            return None;
        }
        *last = hash.clone();
    }

    // 创建预览
    let preview: String = content.chars().take(200).collect();

    Some(NewClipboardItem {
        content_type: content_type.to_string(),
        content: content.to_string(),
        preview: Some(preview),
        hash,
        size: content.len() as i64,
    })
}

/// 保存剪贴板项到数据库
fn save_clipboard_item(app_handle: &AppHandle, item: &NewClipboardItem) {
    tracing::info!("Saving clipboard item to database...");
    let db = app_handle.state::<database::Database>();

    match database::clipboard::insert(&db, item) {
        Ok(saved_item) => {
            tracing::info!("Clipboard item saved, id: {}", saved_item.id);
            // 发送事件通知前端
            if let Err(e) = app_handle.emit("clipboard-updated", &saved_item) {
                tracing::warn!("Failed to emit clipboard-updated event: {}", e);
            } else {
                tracing::info!("clipboard-updated event emitted");
            }

            // 清理旧记录
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

/// 复制内容到剪贴板
pub fn copy_to_clipboard(content: &str) -> Result<(), String> {
    use arboard::Clipboard;
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(content).map_err(|e| e.to_string())?;
    Ok(())
}

/// 启动剪贴板监听
pub fn start_monitor(app_handle: AppHandle) -> Result<(), String> {
    let monitor = ClipboardMonitor::new(app_handle);
    monitor.start()
}
