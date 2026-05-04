use sha2::{Digest, Sha256};

use super::{ClipboardFormatStrategy, ContentType, ExtractedContent, FormatError};

pub struct FileStrategy;

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
        let hash = compute_hash(&data);
        let size = data.len() as i64;

        let preview = if paths.len() == 1 {
            std::path::Path::new(&paths[0])
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| paths[0].clone())
        } else {
            format!("{} 个文件", paths.len())
        };

        let metadata = serde_json::json!({
            "file_count": paths.len(),
            "total_size": paths.iter().map(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0)).sum::<u64>()
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

    fn copy_back(&self, content: &[u8], _metadata: Option<&str>) -> Result<(), FormatError> {
        let paths: Vec<String> = serde_json::from_slice(content)
            .map_err(|e| FormatError::CopyBackFailed(e.to_string()))?;

        #[cfg(target_os = "windows")]
        {
            let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
            set_file_list_with_retry(&path_refs)?;
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = paths;
            return Err(FormatError::CopyBackFailed(
                "file copy back not supported on this platform".into(),
            ));
        }

        Ok(())
    }

    fn generate_preview(&self, content: &[u8], metadata: Option<&str>) -> String {
        if let Ok(paths) = serde_json::from_slice::<Vec<String>>(content) {
            if paths.len() == 1 {
                std::path::Path::new(&paths[0])
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "1 个文件".to_string())
            } else {
                format!("{} 个文件", paths.len())
            }
        } else if let Some(meta_str) = metadata {
            serde_json::from_str::<FileMetadata>(meta_str)
                .map(|m| {
                    if m.file_count == 1 {
                        "1 个文件".to_string()
                    } else {
                        format!("{} 个文件", m.file_count)
                    }
                })
                .unwrap_or_else(|_| "文件".to_string())
        } else {
            "文件".to_string()
        }
    }
}

#[derive(serde::Deserialize)]
struct FileMetadata {
    file_count: usize,
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

#[cfg(target_os = "windows")]
fn set_file_list_with_retry(paths: &[&str]) -> Result<(), FormatError> {
    let mut attempts = 0;
    loop {
        match clipboard_win::raw::open() {
            Ok(()) => {
                let result = clipboard_win::raw::set_file_list(paths);
                if let Err(e) = clipboard_win::raw::close() {
                    tracing::warn!("Failed to close clipboard: {}", e);
                }
                match result {
                    Ok(()) => return Ok(()),
                    Err(e) => {
                        attempts += 1;
                        if attempts >= 10 {
                            return Err(FormatError::CopyBackFailed(format!(
                                "failed to set file list after {} retries: {}",
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
                    return Err(FormatError::CopyBackFailed(format!(
                        "failed to open clipboard after {} retries: {}",
                        attempts, e
                    )));
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        }
    }
}

fn compute_hash(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}
