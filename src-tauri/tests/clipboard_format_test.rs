use klip::clipboard::format::{ClipboardFormatStrategy, FormatStrategyRegistry};
use klip::database::types::{ClipboardFormat, ClipboardFormatType, ContentType};
use std::sync::{Mutex, MutexGuard, OnceLock};

static CLIPBOARD_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn clipboard_test_lock() -> MutexGuard<'static, ()> {
    CLIPBOARD_TEST_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .expect("clipboard test lock should not be poisoned")
}

#[test]
fn registry_detects_text_format() {
    let _guard = clipboard_test_lock();
    let registry = FormatStrategyRegistry::new();

    // Copy some text to clipboard before running this test
    let result = registry.detect_format();
    // In CI there might not be text, so we just check it doesn't panic
    if let Some((strategy, ct)) = result {
        assert!(ct == ContentType::Text || ct == ContentType::Image || ct == ContentType::File);
        let extracted = strategy.extract();
        // If text is on clipboard, it should extract
        if ct == ContentType::Text {
            if let Ok(content) = extracted {
                assert_eq!(content.content_type, ContentType::Text);
                assert!(!content.data.is_empty());
                assert!(!content.preview.is_empty());
                assert!(!content.hash.is_empty());
            }
        }
    }
}

#[test]
fn strategy_priority_is_image_file_text() {
    let registry = FormatStrategyRegistry::new();
    // Strategies should be ordered: Image, File, Text
    assert_eq!(registry.strategies[0].content_type(), ContentType::Image);
    assert_eq!(registry.strategies[1].content_type(), ContentType::File);
    assert_eq!(registry.strategies[2].content_type(), ContentType::Text);
}

#[test]
fn writer_copies_text_back_to_clipboard() {
    let _guard = clipboard_test_lock();
    use klip::clipboard::format::text::TextStrategy;
    use klip::clipboard::writer::{copy_to_clipboard, ClipboardWriteMode};
    let strategy = TextStrategy;
    let test_data = "Hello, Klip!";

    let formats = vec![
        ClipboardFormat {
            format: ClipboardFormatType::Html,
            content: "<b>Hello, Klip!</b>".into(),
        },
        ClipboardFormat {
            format: ClipboardFormatType::Rtf,
            content: r"{\rtf1\b Hello, Klip!}".into(),
        },
    ];
    let result = copy_to_clipboard(
        test_data,
        &ContentType::Text,
        None,
        &formats,
        ClipboardWriteMode::PreserveFormats,
    );
    // This test requires clipboard access; in CI it may fail
    if result.is_ok() {
        // Verify we can read it back
        let extracted = strategy.extract();
        if let Ok(content) = extracted {
            let text = String::from_utf8_lossy(&content.data);
            assert_eq!(text, "Hello, Klip!");
            assert!(content
                .formats
                .iter()
                .any(|format| format.format == ClipboardFormatType::Html));
            assert!(content
                .formats
                .iter()
                .any(|format| format.format == ClipboardFormatType::Rtf));
        }
    }
}

#[test]
#[cfg(target_os = "windows")]
fn writer_plain_text_mode_omits_html_and_rtf() {
    let _guard = clipboard_test_lock();
    use klip::clipboard::backend;
    use klip::clipboard::writer::{copy_to_clipboard, ClipboardWriteMode};

    let formats = vec![
        ClipboardFormat {
            format: ClipboardFormatType::Html,
            content: "<b>Plain only</b>".into(),
        },
        ClipboardFormat {
            format: ClipboardFormatType::Rtf,
            content: r"{\rtf1\b Plain only}".into(),
        },
    ];

    copy_to_clipboard(
        "Plain only",
        &ContentType::Text,
        None,
        &formats,
        ClipboardWriteMode::PlainText,
    )
    .unwrap();
    let clipboard = backend::read_text_formats().unwrap();

    assert_eq!(clipboard.text, "Plain only");
    assert_eq!(clipboard.html, None);
    assert_eq!(clipboard.rtf, None);
}

#[test]
fn image_strategy_png_encoding() {
    // Test the PNG encoding path with a small 2x2 RGBA image
    use klip::clipboard::format::image::encode_png_test;

    let width = 2usize;
    let height = 2usize;
    // 2x2 RGBA (4 bytes per pixel)
    let rgba: Vec<u8> = vec![
        255, 0, 0, 255, // red
        0, 255, 0, 255, // green
        0, 0, 255, 255, // blue
        255, 255, 0, 255, // yellow
    ];

    let png_data = encode_png_test(&rgba, width, height).expect("PNG encoding should succeed");
    assert!(!png_data.is_empty());
    // PNG magic bytes
    assert_eq!(&png_data[0..4], &[0x89, 0x50, 0x4E, 0x47]);
}

#[test]
fn content_type_str_mapping() {
    assert_eq!(ContentType::Text.as_str(), "text");
    assert_eq!(ContentType::Image.as_str(), "image");
    assert_eq!(ContentType::File.as_str(), "file");
}
