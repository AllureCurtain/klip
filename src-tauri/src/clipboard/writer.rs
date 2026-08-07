//! The one path for writing a saved item back to the OS clipboard.
//!
//! Callers hand over a stored `content` string plus its `content_type` and
//! `metadata`; this module decodes that representation and delegates the
//! actual write to [`crate::clipboard::backend`]. Nothing here is
//! platform-specific -- the platform differences live in the backend.
//!
//! Every write arms [`crate::clipboard::suppress`] first so the monitor does
//! not capture Klip's own write as a user copy.

use base64::Engine;

use crate::clipboard::{backend, hash, suppress};
use crate::database::types::{ClipboardFormat, ClipboardFormatType, ContentType};
use crate::AppError;

const PNG_DATA_URL_PREFIX: &str = "data:image/png;base64,";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClipboardWriteMode {
    PreserveFormats,
    PlainText,
}

/// Write a stored item back to the clipboard.
///
/// `metadata` is accepted because it is part of the stored representation, but
/// image dimensions are read from the PNG itself rather than from metadata:
/// when the two disagreed, the PNG was always the truthful one.
pub fn copy_to_clipboard(
    content: &str,
    content_type: &ContentType,
    _metadata: Option<&str>,
    formats: &[ClipboardFormat],
    mode: ClipboardWriteMode,
) -> Result<(), AppError> {
    if mode == ClipboardWriteMode::PlainText && *content_type != ContentType::Text {
        return Err(AppError::InvalidInput(
            "plain-text clipboard actions require a text item".to_string(),
        ));
    }

    // Arm before writing. Arming afterwards would leave a window in which the
    // clipboard has already changed but the monitor has nothing to match
    // against, which is exactly the feedback loop this guards.
    suppress::arm(hash::hash_stored_content(content_type.as_str(), content));

    let result = match content_type {
        ContentType::Text => write_text(content, formats, mode),
        ContentType::Image => write_image(content),
        ContentType::File => write_files(content),
    };

    if result.is_err() {
        // The content never reached the clipboard, so a later genuine copy of
        // it must not be swallowed by the arm we just set.
        suppress::disarm();
    }

    result
}

fn write_text(
    content: &str,
    formats: &[ClipboardFormat],
    mode: ClipboardWriteMode,
) -> Result<(), AppError> {
    let (html, rtf) = text_formats_for_mode(formats, mode);
    backend::write_text_formats(content, html, rtf).map_err(AppError::from)
}

fn text_formats_for_mode(
    formats: &[ClipboardFormat],
    mode: ClipboardWriteMode,
) -> (Option<&str>, Option<&str>) {
    match mode {
        ClipboardWriteMode::PreserveFormats => (
            format_content(formats, ClipboardFormatType::Html),
            format_content(formats, ClipboardFormatType::Rtf),
        ),
        ClipboardWriteMode::PlainText => (None, None),
    }
}

fn format_content(formats: &[ClipboardFormat], expected: ClipboardFormatType) -> Option<&str> {
    formats
        .iter()
        .find(|format| format.format == expected && !format.content.is_empty())
        .map(|format| format.content.as_str())
}

fn write_image(content: &str) -> Result<(), AppError> {
    let png = decode_png(content)?;
    backend::write_image(&png).map_err(AppError::from)
}

/// Images are stored as a `data:image/png;base64,` URL. Older rows, and any
/// row written before that convention, may hold raw bytes instead.
fn decode_png(content: &str) -> Result<Vec<u8>, AppError> {
    match content.strip_prefix(PNG_DATA_URL_PREFIX) {
        Some(encoded) => base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|e| AppError::Clipboard(format!("invalid base64 image content: {}", e))),
        None => Ok(content.as_bytes().to_vec()),
    }
}

fn write_files(content: &str) -> Result<(), AppError> {
    let paths: Vec<String> = serde_json::from_str(content)
        .map_err(|e| AppError::Clipboard(format!("invalid file path JSON: {}", e)))?;
    let refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    backend::write_files(&refs).map_err(AppError::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_png_accepts_a_data_url() {
        let raw = b"\x89PNG\r\n\x1a\n";
        let encoded = base64::engine::general_purpose::STANDARD.encode(raw);
        let content = format!("{}{}", PNG_DATA_URL_PREFIX, encoded);

        assert_eq!(decode_png(&content).unwrap(), raw);
    }

    #[test]
    fn decode_png_passes_through_content_without_the_prefix() {
        assert_eq!(decode_png("not-a-data-url").unwrap(), b"not-a-data-url");
    }

    #[test]
    fn decode_png_rejects_malformed_base64() {
        let content = format!("{}{}", PNG_DATA_URL_PREFIX, "!!!not base64!!!");

        let err = decode_png(&content).unwrap_err();

        assert!(matches!(err, AppError::Clipboard(msg) if msg.contains("invalid base64")));
    }

    #[test]
    fn write_files_rejects_content_that_is_not_a_json_array() {
        let err = write_files("C:/not/json.txt").unwrap_err();

        assert!(matches!(err, AppError::Clipboard(msg) if msg.contains("invalid file path JSON")));
    }

    #[test]
    fn format_content_selects_the_requested_rich_representation() {
        let formats = vec![
            ClipboardFormat {
                format: ClipboardFormatType::Html,
                content: "<b>Hello</b>".into(),
            },
            ClipboardFormat {
                format: ClipboardFormatType::Rtf,
                content: r"{\rtf1\b Hello}".into(),
            },
        ];

        assert_eq!(
            format_content(&formats, ClipboardFormatType::Html),
            Some("<b>Hello</b>")
        );
        assert_eq!(
            format_content(&formats, ClipboardFormatType::Rtf),
            Some(r"{\rtf1\b Hello}")
        );
    }

    #[test]
    fn write_mode_selects_preserved_or_plain_text_formats() {
        let formats = vec![
            ClipboardFormat {
                format: ClipboardFormatType::Html,
                content: "<b>Hello</b>".into(),
            },
            ClipboardFormat {
                format: ClipboardFormatType::Rtf,
                content: r"{\rtf1\b Hello}".into(),
            },
        ];

        assert_eq!(
            text_formats_for_mode(&formats, ClipboardWriteMode::PreserveFormats),
            (Some("<b>Hello</b>"), Some(r"{\rtf1\b Hello}"))
        );
        assert_eq!(
            text_formats_for_mode(&formats, ClipboardWriteMode::PlainText),
            (None, None)
        );
    }
}
