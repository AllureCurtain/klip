use super::{ClipboardFormatStrategy, ContentType, ExtractedContent, FormatError};
use crate::clipboard::backend;
use crate::database::{ClipboardFormat, ClipboardFormatType};

/// Longest preview stored for the list view. The full text lives in
/// `content`; this is only what the UI renders per row.
const PREVIEW_CHARS: usize = 200;

pub struct TextStrategy;

impl ClipboardFormatStrategy for TextStrategy {
    fn content_type(&self) -> ContentType {
        ContentType::Text
    }

    fn detect(&self) -> bool {
        backend::has_text()
    }

    fn extract(&self) -> Result<ExtractedContent, FormatError> {
        let clipboard = backend::read_text_formats()?;
        let text = clipboard.text;

        if text.trim().is_empty() {
            return Err(FormatError::ExtractionFailed("empty text content".into()));
        }

        let data = text.as_bytes().to_vec();
        let preview: String = text.chars().take(PREVIEW_CHARS).collect();
        let hash = crate::clipboard::hash::hash_bytes(&data);
        let size = data.len() as i64;
        let mut formats = vec![ClipboardFormat {
            format: ClipboardFormatType::Text,
            content: text.clone(),
        }];
        if let Some(html) = clipboard.html.filter(|value| !value.is_empty()) {
            formats.push(ClipboardFormat {
                format: ClipboardFormatType::Html,
                content: html,
            });
        }
        if let Some(rtf) = clipboard.rtf.filter(|value| !value.is_empty()) {
            formats.push(ClipboardFormat {
                format: ClipboardFormatType::Rtf,
                content: rtf,
            });
        }

        Ok(ExtractedContent {
            content_type: ContentType::Text,
            data,
            preview,
            hash,
            size,
            metadata: None,
            formats,
        })
    }
}
