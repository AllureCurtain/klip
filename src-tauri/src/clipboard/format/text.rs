use super::{ClipboardFormatStrategy, ContentType, ExtractedContent, FormatError};

pub struct TextStrategy;

impl ClipboardFormatStrategy for TextStrategy {
    fn content_type(&self) -> ContentType {
        ContentType::Text
    }

    fn detect(&self) -> bool {
        #[cfg(target_os = "windows")]
        {
            clipboard_win::raw::is_format_avail(13) // CF_UNICODETEXT = 13
        }
        #[cfg(not(target_os = "windows"))]
        {
            arboard::Clipboard::new()
                .and_then(|mut cb| cb.get_text().map(|t| !t.is_empty()))
                .unwrap_or(false)
        }
    }

    fn extract(&self) -> Result<ExtractedContent, FormatError> {
        let text = read_text_from_clipboard()?;

        if text.trim().is_empty() {
            return Err(FormatError::ExtractionFailed("empty text content".into()));
        }

        let data = text.as_bytes().to_vec();
        let preview: String = text.chars().take(200).collect();
        let hash = crate::clipboard::hash::hash_bytes(&data);
        let size = data.len() as i64;

        Ok(ExtractedContent {
            content_type: ContentType::Text,
            data,
            preview,
            hash,
            size,
            metadata: None,
        })
    }
}

#[cfg(not(target_os = "windows"))]
fn clipboard_with_retry<F, T>(op: F) -> Result<T, String>
where
    F: Fn(&mut arboard::Clipboard) -> Result<T, arboard::Error>,
{
    let mut attempts = 0;
    loop {
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        match op(&mut cb) {
            Ok(result) => return Ok(result),
            Err(e) => {
                attempts += 1;
                if attempts >= 5 {
                    return Err(e.to_string());
                }
                std::thread::sleep(std::time::Duration::from_millis(30));
            }
        }
    }
}

fn read_text_from_clipboard() -> Result<String, FormatError> {
    #[cfg(target_os = "windows")]
    {
        read_text_via_raw()
            .ok_or_else(|| FormatError::ClipboardAccess("failed to read text after retries".into()))
    }

    #[cfg(not(target_os = "windows"))]
    {
        clipboard_with_retry(|cb| cb.get_text())
            .map_err(|e| FormatError::ClipboardAccess(e.to_string()))
    }
}

#[cfg(target_os = "windows")]
fn read_text_via_raw() -> Option<String> {
    let mut attempts = 0;
    loop {
        match clipboard_win::raw::open() {
            Ok(()) => {
                let mut buf = Vec::new();
                let result = clipboard_win::raw::get_string(&mut buf);
                let _ = clipboard_win::raw::close();
                match result {
                    Ok(_) => {
                        let text = String::from_utf8_lossy(&buf).to_string();
                        if !text.is_empty() {
                            return Some(text);
                        }
                        return None;
                    }
                    Err(e) => {
                        attempts += 1;
                        if attempts >= 10 {
                            tracing::debug!(
                                "read_text_via_raw: get_string failed after {} attempts: {:?}",
                                attempts,
                                e
                            );
                            return None;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(50));
                    }
                }
            }
            Err(e) => {
                attempts += 1;
                if attempts >= 10 {
                    tracing::debug!(
                        "read_text_via_raw: open failed after {} attempts: {:?}",
                        attempts,
                        e
                    );
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        }
    }
}
