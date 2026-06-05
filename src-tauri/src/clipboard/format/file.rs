use super::{ClipboardFormatStrategy, ContentType, ExtractedContent, FormatError};

pub struct FileStrategy;

/// Per-item summary serialized into `metadata.items` so the frontend can
/// render each entry with the right icon (file vs folder) without having
/// to stat the filesystem itself (which it can't from the webview).
#[derive(serde::Serialize)]
struct FileItemSummary {
    name: String,
    is_dir: bool,
    size: u64,
}

/// Cap how many entries we serialize into metadata. Massive multi-selects
/// (e.g. dragging in a folder of 10k files) shouldn't bloat the DB row.
const MAX_ITEMS_IN_METADATA: usize = 50;

impl ClipboardFormatStrategy for FileStrategy {
    fn content_type(&self) -> ContentType {
        ContentType::File
    }

    fn detect(&self) -> bool {
        #[cfg(target_os = "windows")]
        {
            clipboard_win::raw::is_format_avail(15) // CF_HDROP
        }
        #[cfg(not(target_os = "windows"))]
        {
            arboard::Clipboard::new()
                .and_then(|mut cb| cb.get_text().map(|t| t.contains("file://")))
                .unwrap_or(false)
        }
    }

    fn extract(&self) -> Result<ExtractedContent, FormatError> {
        let paths = read_file_paths_with_retry()?;

        if paths.is_empty() {
            return Err(FormatError::ExtractionFailed("no file paths found".into()));
        }

        let json_data = serde_json::to_string(&paths)
            .map_err(|e| FormatError::ExtractionFailed(e.to_string()))?;

        let data = json_data.as_bytes().to_vec();
        let hash = crate::clipboard::hash::hash_bytes(&data);
        let size = data.len() as i64;

        // Stat each path so we can label files vs folders in the UI.
        // A path that fails to stat (deleted between copy and paste, perms,
        // a symlink target gone, etc.) falls back to "file with 0 bytes" so
        // the UI still shows something reasonable.
        let mut file_count: u64 = 0;
        let mut dir_count: u64 = 0;
        let mut total_size: u64 = 0;
        let mut items: Vec<FileItemSummary> = Vec::new();

        for path_str in &paths {
            let path = std::path::Path::new(path_str);
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone());

            let (is_dir, item_size) = match std::fs::metadata(path) {
                Ok(meta) => {
                    if meta.is_dir() {
                        dir_count += 1;
                        // Don't recursively size folders — too slow for the
                        // monitor thread on large trees.
                        (true, 0u64)
                    } else {
                        file_count += 1;
                        let s = meta.len();
                        total_size = total_size.saturating_add(s);
                        (false, s)
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to stat {}: {}", path_str, e);
                    file_count += 1;
                    (false, 0u64)
                }
            };

            if items.len() < MAX_ITEMS_IN_METADATA {
                items.push(FileItemSummary {
                    name,
                    is_dir,
                    size: item_size,
                });
            }
        }

        let preview = build_preview(&paths, file_count, dir_count);

        let metadata = serde_json::json!({
            "file_count": file_count,
            "dir_count": dir_count,
            "total_size": total_size,
            "items": items,
        })
        .to_string();

        Ok(ExtractedContent {
            content_type: ContentType::File,
            data,
            preview,
            hash,
            size,
            metadata: Some(metadata),
        })
    }
}

/// Build a human-readable preview line for the clipboard list view.
/// Single item → its name. Multi → counts of files / folders.
fn build_preview(paths: &[String], file_count: u64, dir_count: u64) -> String {
    if paths.len() == 1 {
        return std::path::Path::new(&paths[0])
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| paths[0].clone());
    }
    format_counts(file_count, dir_count)
}

fn format_counts(file_count: u64, dir_count: u64) -> String {
    match (file_count, dir_count) {
        (0, 0) => "文件".to_string(),
        (f, 0) => format!("{} 个文件", f),
        (0, d) => format!("{} 个文件夹", d),
        (f, d) => format!("{} 个文件，{} 个文件夹", f, d),
    }
}

fn read_file_paths_with_retry() -> Result<Vec<String>, FormatError> {
    #[cfg(target_os = "windows")]
    {
        let mut attempts = 0;
        loop {
            match clipboard_win::raw::open() {
                Ok(()) => {
                    let mut paths = Vec::new();
                    let result = clipboard_win::raw::get_file_list_path(&mut paths);
                    if let Err(e) = clipboard_win::raw::close() {
                        tracing::warn!("Failed to close clipboard: {}", e);
                    }
                    match result {
                        Ok(_) => {
                            return Ok(paths
                                .into_iter()
                                .map(|p| p.to_string_lossy().to_string())
                                .collect())
                        }
                        Err(e) => {
                            attempts += 1;
                            if attempts >= 10 {
                                return Err(FormatError::ExtractionFailed(format!(
                                    "failed to read file list after {} retries: {}",
                                    attempts, e
                                )));
                            }
                            std::thread::sleep(std::time::Duration::from_millis(50));
                        }
                    }
                }
                Err(e) => {
                    attempts += 1;
                    if attempts >= 10 {
                        return Err(FormatError::ClipboardAccess(format!(
                            "failed to open clipboard after {} retries: {}",
                            attempts, e
                        )));
                    }
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}
