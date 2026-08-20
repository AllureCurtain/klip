//! The single point of contact with the OS clipboard.
//!
//! Every read and write in Klip goes through this module, which wraps
//! `clipboard-rs`. Nothing else in the codebase may talk to a clipboard
//! library directly -- that is what keeps "which API owns what" from turning
//! back into tribal knowledge.
//!
//! Two things about `clipboard-rs` shape this file:
//!
//! 1. `ClipboardContext` is `Send` on every platform but only `Sync` on Windows
//!    and macOS -- the Linux backend does not promise it. A `static` needs
//!    `Sync`, so a shared cached context would compile here and fail to compile
//!    for Linux. Constructing one is cheap (on Windows it only builds a
//!    format-id map; it does not open the clipboard), so every operation builds
//!    its own. That also matches how the previous `arboard` code behaved.
//!
//! 2. The OS clipboard is a contended, single-owner resource. Any operation
//!    can transiently fail because another process holds it open, so reads and
//!    writes retry with a short backoff instead of failing on first error.

use clipboard_rs::{
    common::RustImage, Clipboard, ClipboardContent, ClipboardContext, ContentFormat, RustImageData,
};

const MAX_IMAGE_REPRESENTATION_BYTES: usize = 128 * 1024 * 1024;
pub const KLIP_PRIVATE_MARKER: &str = "Klip Clipboard Owner v1";

/// How many times to retry a contended clipboard operation.
const MAX_ATTEMPTS: u32 = 10;

/// Backoff between attempts. 10 x 50ms tolerates roughly half a second of
/// another process holding the clipboard, which matches the previous
/// per-format retry loops this module replaced.
const RETRY_DELAY: std::time::Duration = std::time::Duration::from_millis(50);

/// A clipboard format name used as a marker only. Written and read as an
/// opaque buffer, never interpreted as content.
pub const PREFERRED_DROP_EFFECT: &str = "Preferred DropEffect";

/// `DROPEFFECT_COPY`. Explorer pastes a file list as a copy rather than a
/// move only when this accompanies `CF_HDROP`.
pub const DROP_EFFECT_COPY: u32 = 5;

/// `clipboard-rs` reports errors as `Box<dyn Error + Send + Sync>`, which is
/// neither `Clone` nor comparable and cannot be carried across the retry loop.
/// These variants keep the message as a `String`. The field is deliberately not
/// named `source`: `thiserror` reads that name as the underlying
/// `std::error::Error` and would reject a plain `String`.
#[derive(Debug, thiserror::Error)]
pub enum ClipboardError {
    #[error("failed to open clipboard after {attempts} attempts: {cause}")]
    Unavailable { attempts: u32, cause: String },
    #[error("clipboard read failed after {attempts} attempts: {cause}")]
    Read { attempts: u32, cause: String },
    #[error("clipboard write failed after {attempts} attempts: {cause}")]
    Write { attempts: u32, cause: String },
    #[error("image decode failed: {0}")]
    ImageDecode(String),
}

/// An image lifted off the clipboard with both its pixels and every validated
/// source representation that Windows exposed.
pub struct ClipboardImage {
    pub rgba: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub sources: Vec<ClipboardImageSource>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClipboardImageSource {
    pub format_name: String,
    pub mime_type: Option<String>,
    pub clipboard_format: Option<String>,
    pub data: Vec<u8>,
    pub metadata: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct ImageWriteRepresentation<'a> {
    pub format_name: &'a str,
    pub clipboard_format: Option<&'a str>,
    pub data: &'a [u8],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClipboardText {
    pub text: String,
    pub html: Option<String>,
    pub rtf: Option<String>,
}

fn context() -> Result<ClipboardContext, ClipboardError> {
    let mut last = String::new();
    for attempt in 1..=MAX_ATTEMPTS {
        match ClipboardContext::new() {
            Ok(ctx) => return Ok(ctx),
            Err(e) => {
                last = e.to_string();
                if attempt < MAX_ATTEMPTS {
                    std::thread::sleep(RETRY_DELAY);
                }
            }
        }
    }
    Err(ClipboardError::Unavailable {
        attempts: MAX_ATTEMPTS,
        cause: last,
    })
}

/// Run `op` against a fresh context, retrying while the clipboard is busy.
fn with_retry<T, F>(op: F) -> Result<T, (u32, String)>
where
    F: Fn(&ClipboardContext) -> Result<T, String>,
{
    let mut last = String::new();
    for attempt in 1..=MAX_ATTEMPTS {
        match context() {
            Ok(ctx) => match op(&ctx) {
                Ok(value) => return Ok(value),
                Err(e) => last = e,
            },
            Err(e) => last = e.to_string(),
        }
        if attempt < MAX_ATTEMPTS {
            std::thread::sleep(RETRY_DELAY);
        }
    }
    Err((MAX_ATTEMPTS, last))
}

fn read_err((attempts, cause): (u32, String)) -> ClipboardError {
    ClipboardError::Read { attempts, cause }
}

fn write_err((attempts, cause): (u32, String)) -> ClipboardError {
    ClipboardError::Write { attempts, cause }
}

// --- Detection ---------------------------------------------------------
//
// Format probes are deliberately non-retrying: they answer "is this format
// on the clipboard right now", and a transient failure means "assume not"
// rather than "block the monitor thread for half a second".

fn probe(format: ContentFormat) -> bool {
    context().map(|ctx| ctx.has(format)).unwrap_or(false)
}

pub fn has_text() -> bool {
    probe(ContentFormat::Text)
}

pub fn has_image() -> bool {
    probe(ContentFormat::Image)
}

pub fn has_files() -> bool {
    probe(ContentFormat::Files)
}

/// Names of every format currently on the clipboard. Used for diagnostics.
pub fn available_formats() -> Vec<String> {
    context()
        .and_then(|ctx| {
            ctx.available_formats().map_err(|e| ClipboardError::Read {
                attempts: 1,
                cause: e.to_string(),
            })
        })
        .unwrap_or_default()
}

pub fn is_klip_owned() -> bool {
    #[cfg(target_os = "windows")]
    {
        super::windows_image::has_private_marker(KLIP_PRIVATE_MARKER)
    }
    #[cfg(not(target_os = "windows"))]
    {
        context()
            .map(|ctx| ctx.has(ContentFormat::Other(KLIP_PRIVATE_MARKER.into())))
            .unwrap_or(false)
    }
}

// --- Reads -------------------------------------------------------------

pub fn read_text() -> Result<String, ClipboardError> {
    with_retry(|ctx| ctx.get_text().map_err(|e| e.to_string())).map_err(read_err)
}

pub fn read_text_formats() -> Result<ClipboardText, ClipboardError> {
    with_retry(|ctx| {
        let contents = ctx
            .get(&[ContentFormat::Text, ContentFormat::Html, ContentFormat::Rtf])
            .map_err(|e| e.to_string())?;
        collect_text_formats(contents)
    })
    .map_err(read_err)
}

fn collect_text_formats(contents: Vec<ClipboardContent>) -> Result<ClipboardText, String> {
    let mut text = None;
    let mut html = None;
    let mut rtf = None;
    for content in contents {
        match content {
            ClipboardContent::Text(value) => text = Some(value),
            ClipboardContent::Html(value) => html = Some(value),
            ClipboardContent::Rtf(value) => rtf = Some(value),
            ClipboardContent::Image(_)
            | ClipboardContent::Files(_)
            | ClipboardContent::Other(_, _) => {}
        }
    }

    text.map(|text| ClipboardText { text, html, rtf })
        .ok_or_else(|| "clipboard did not contain a plain-text representation".to_string())
}

pub fn read_image() -> Result<ClipboardImage, ClipboardError> {
    let mut sources = read_encoded_image_sources()?;
    let decoded_source = sources
        .iter()
        .find(|source| matches!(source.format_name.as_str(), "png" | "jpeg" | "webp" | "gif"));
    #[cfg(target_os = "windows")]
    let mut bitmap_sources =
        super::windows_image::read_bitmap_sources(MAX_IMAGE_REPRESENTATION_BYTES)?;

    let (rgba, width, height) = if let Some(source) = decoded_source {
        let decoded = image::load_from_memory(&source.data)
            .map_err(|error| ClipboardError::ImageDecode(error.to_string()))?
            .to_rgba8();
        let (width, height) = decoded.dimensions();
        (decoded.into_raw(), width, height)
    } else {
        #[cfg(target_os = "windows")]
        if let Some(source) = bitmap_sources.first() {
            let decoded = super::windows_image::decode_bitmap_source(source)?;
            (decoded.0, decoded.1, decoded.2)
        } else {
            let image =
                with_retry(|ctx| ctx.get_image().map_err(|e| e.to_string())).map_err(read_err)?;
            let (width, height) = image.get_size();
            let rgba = image
                .to_rgba8()
                .map_err(|e| ClipboardError::ImageDecode(e.to_string()))?;
            (rgba.into_raw(), width, height)
        }
        #[cfg(not(target_os = "windows"))]
        {
            let image =
                with_retry(|ctx| ctx.get_image().map_err(|e| e.to_string())).map_err(read_err)?;
            let (width, height) = image.get_size();
            let rgba = image
                .to_rgba8()
                .map_err(|e| ClipboardError::ImageDecode(e.to_string()))?;
            (rgba.into_raw(), width, height)
        }
    };

    #[cfg(target_os = "windows")]
    {
        sources.append(&mut bitmap_sources);
    }

    Ok(ClipboardImage {
        rgba,
        width,
        height,
        sources,
    })
}

fn read_encoded_image_sources() -> Result<Vec<ClipboardImageSource>, ClipboardError> {
    with_retry(|ctx| {
        let available = ctx.available_formats().map_err(|error| error.to_string())?;
        let mut sources: Vec<(u8, ClipboardImageSource)> = Vec::new();
        for clipboard_format in available {
            let lower = clipboard_format.to_ascii_lowercase();
            if !matches!(
                lower.as_str(),
                "png" | "image/png" | "jfif" | "jpeg" | "image/jpeg" | "gif" | "image/gif" | "webp" | "image/webp"
            ) {
                continue;
            }
            let Ok(data) = ctx.get_buffer(&clipboard_format) else {
                continue;
            };
            if data.len() > MAX_IMAGE_REPRESENTATION_BYTES {
                return Err(format!(
                    "clipboard image representation {clipboard_format} is {} bytes, above the {} byte limit",
                    data.len(), MAX_IMAGE_REPRESENTATION_BYTES
                ));
            }
            let Ok(format) = image::guess_format(&data) else {
                continue;
            };
            let (format_name, mime_type, priority) = match format {
                image::ImageFormat::Png => ("png", "image/png", 0),
                image::ImageFormat::Jpeg => ("jpeg", "image/jpeg", 1),
                image::ImageFormat::WebP => ("webp", "image/webp", 2),
                image::ImageFormat::Gif => ("gif", "image/gif", 3),
                _ => continue,
            };
            if image::load_from_memory_with_format(&data, format).is_err() {
                continue;
            }
            if sources.iter().any(|(_, source)| {
                source.format_name == format_name && source.data == data
            }) {
                continue;
            }
            sources.push((
                priority,
                ClipboardImageSource {
                    format_name: format_name.into(),
                    mime_type: Some(mime_type.into()),
                    clipboard_format: Some(clipboard_format.clone()),
                    data,
                    metadata: Some(
                        serde_json::json!({ "clipboardFormat": clipboard_format }).to_string(),
                    ),
                },
            ));
        }
        sources.sort_by_key(|(priority, _)| *priority);
        Ok(sources.into_iter().map(|(_, source)| source).collect())
    })
    .map_err(read_err)
}

/// File paths from the clipboard, normalized to plain filesystem paths.
///
/// Backends disagree on representation: Windows `CF_HDROP` holds whatever
/// strings were written to it (Explorer writes plain paths), while the X11
/// and macOS backends deal in `file://` URIs. Normalizing here means the rest
/// of Klip -- and the `content` column, which stores a JSON array of these
/// strings -- only ever sees plain paths.
pub fn read_files() -> Result<Vec<String>, ClipboardError> {
    let raw = with_retry(|ctx| ctx.get_files().map_err(|e| e.to_string())).map_err(read_err)?;
    Ok(raw.iter().map(|p| normalize_path(p)).collect())
}

/// Strip a `file://` scheme if present, and undo the leading slash that
/// `file:///C:/x` produces on Windows drive paths.
fn normalize_path(raw: &str) -> String {
    let stripped = match raw.strip_prefix("file://") {
        Some(rest) => rest,
        None => return raw.to_string(),
    };

    // `file:///C:/x` -> `/C:/x` -> `C:/x`
    let trimmed = stripped
        .strip_prefix('/')
        .filter(|rest| looks_like_windows_drive(rest))
        .unwrap_or(stripped);

    percent_decode(trimmed)
}

fn looks_like_windows_drive(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

/// Minimal percent-decoding for the `file://` URIs the X11 and macOS
/// backends hand back. Only valid `%XX` triplets are decoded; anything else
/// is passed through so a literal `%` in a filename survives.
fn percent_decode(value: &str) -> String {
    if !value.contains('%') {
        return value.to_string();
    }

    // Decoding works on bytes, never on string slices. `&value[i + 1..i + 3]`
    // would panic whenever those indices land inside a multi-byte character,
    // which a path like "%aé" produces -- and a panic on the monitor thread
    // aborts the process under the release profile.
    let bytes = value.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let decoded = if bytes[i] == b'%' {
            match (
                bytes.get(i + 1).and_then(hex_value),
                bytes.get(i + 2).and_then(hex_value),
            ) {
                (Some(hi), Some(lo)) => Some(hi << 4 | lo),
                _ => None,
            }
        } else {
            None
        };

        match decoded {
            Some(byte) => {
                out.push(byte);
                i += 3;
            }
            // Not a valid escape: pass the byte through unchanged.
            None => {
                out.push(bytes[i]);
                i += 1;
            }
        }
    }

    String::from_utf8_lossy(&out).into_owned()
}

fn hex_value(byte: &u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

// --- Writes ------------------------------------------------------------
//
// Writes take a `Vec<ClipboardContent>` so body and any companion formats
// land in one `set()` call. Callers must not follow up with a second write
// to "add" a format: on Windows both `set_image` and `set_buffer` empty the
// clipboard first, so a second call discards whatever the first one wrote.

pub fn write_text(text: &str) -> Result<(), ClipboardError> {
    write_text_formats(text, None, None)
}

pub fn write_text_formats(
    text: &str,
    html: Option<&str>,
    rtf: Option<&str>,
) -> Result<(), ClipboardError> {
    let contents = || {
        let mut contents = vec![
            ClipboardContent::Text(text.to_string()),
            ClipboardContent::Other(KLIP_PRIVATE_MARKER.into(), vec![1]),
        ];
        if let Some(html) = html.filter(|value| !value.is_empty()) {
            contents.push(ClipboardContent::Html(html.to_string()));
        }
        if let Some(rtf) = rtf.filter(|value| !value.is_empty()) {
            contents.push(ClipboardContent::Rtf(rtf.to_string()));
        }
        contents
    };
    with_retry(|ctx| ctx.set(contents()).map_err(|e| e.to_string())).map_err(write_err)
}

/// Write an image, given PNG bytes.
///
/// `width`/`height` are accepted for signature symmetry with the text and
/// file writers but are not used: the PNG header is authoritative, and
/// trusting stored metadata over it caused mismatched dimensions when the
/// two disagreed.
pub fn write_image(png: &[u8]) -> Result<(), ClipboardError> {
    // Decode once, outside the retry loop -- a malformed PNG will not become
    // valid on the second attempt.
    RustImageData::from_bytes(png).map_err(|e| ClipboardError::ImageDecode(e.to_string()))?;

    with_retry(|ctx| {
        // `RustImageData` is not `Clone`, so decode per attempt.
        let image = RustImageData::from_bytes(png).map_err(|e| e.to_string())?;
        ctx.set(vec![ClipboardContent::Image(image)])
            .map_err(|e| e.to_string())
    })
    .map_err(write_err)
}

pub fn write_image_representations(
    canonical_png: &[u8],
    sources: &[ImageWriteRepresentation<'_>],
    marker_value: &[u8],
) -> Result<(), ClipboardError> {
    if canonical_png.len() > MAX_IMAGE_REPRESENTATION_BYTES {
        return Err(ClipboardError::ImageDecode(format!(
            "canonical PNG exceeds the {MAX_IMAGE_REPRESENTATION_BYTES} byte limit"
        )));
    }
    let decoded = image::load_from_memory_with_format(canonical_png, image::ImageFormat::Png)
        .map_err(|error| ClipboardError::ImageDecode(error.to_string()))?
        .to_rgba8();
    let (width, height) = decoded.dimensions();

    #[cfg(target_os = "windows")]
    {
        super::windows_image::write_representations(
            canonical_png,
            decoded.as_raw(),
            width,
            height,
            sources,
            KLIP_PRIVATE_MARKER,
            marker_value,
        )
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (sources, marker_value, width, height);
        write_image(canonical_png)
    }
}

/// Write a file list as plain paths, plus `Preferred DropEffect` so the
/// receiving file manager treats the paste as a copy rather than a move.
///
/// Verified that `CF_HDROP` and `Preferred DropEffect` coexist in a single
/// `set()` call; unlike the image path, nothing here empties the clipboard
/// mid-write.
pub fn write_files(paths: &[&str]) -> Result<(), ClipboardError> {
    if paths.is_empty() {
        return Err(ClipboardError::Write {
            attempts: 0,
            cause: "file list is empty".to_string(),
        });
    }

    let owned: Vec<String> = paths.iter().map(|p| p.to_string()).collect();
    with_retry(|ctx| {
        ctx.set(vec![
            ClipboardContent::Files(owned.clone()),
            ClipboardContent::Other(
                PREFERRED_DROP_EFFECT.to_string(),
                DROP_EFFECT_COPY.to_le_bytes().to_vec(),
            ),
            ClipboardContent::Other(KLIP_PRIVATE_MARKER.into(), vec![1]),
        ])
        .map_err(|e| e.to_string())
    })
    .map_err(write_err)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_path_passes_through_plain_paths() {
        assert_eq!(normalize_path(r"C:\Users\me\a.txt"), r"C:\Users\me\a.txt");
        assert_eq!(normalize_path("/home/me/a.txt"), "/home/me/a.txt");
    }

    #[test]
    fn normalize_path_strips_file_scheme_and_windows_leading_slash() {
        assert_eq!(
            normalize_path("file:///C:/Users/me/a.txt"),
            "C:/Users/me/a.txt"
        );
        assert_eq!(normalize_path("file:///home/me/a.txt"), "/home/me/a.txt");
    }

    #[test]
    fn normalize_path_decodes_percent_escapes() {
        assert_eq!(
            normalize_path("file:///home/me/my%20file.txt"),
            "/home/me/my file.txt"
        );
        assert_eq!(
            normalize_path("file:///home/me/100%25.txt"),
            "/home/me/100%.txt"
        );
    }

    #[test]
    fn normalize_path_leaves_malformed_escapes_alone() {
        assert_eq!(normalize_path("file:///tmp/50%off"), "/tmp/50%off");
        assert_eq!(normalize_path("file:///tmp/trailing%"), "/tmp/trailing%");
    }

    #[test]
    fn normalize_path_survives_escapes_next_to_multibyte_characters() {
        // A `%` followed by one ASCII byte and then a multi-byte character used
        // to panic here: the two-byte hex window fell inside the character.
        assert_eq!(normalize_path("file:///tmp/%aé.txt"), "/tmp/%aé.txt");
        assert_eq!(normalize_path("file:///tmp/%é.txt"), "/tmp/%é.txt");
        assert_eq!(normalize_path("file:///tmp/截图%20.png"), "/tmp/截图 .png");
    }

    #[test]
    fn normalize_path_decodes_multibyte_utf8_escape_sequences() {
        assert_eq!(
            normalize_path("file:///tmp/%E6%88%AA%E5%9B%BE.png"),
            "/tmp/截图.png"
        );
    }

    #[test]
    fn hex_value_accepts_both_cases_and_rejects_non_hex() {
        assert_eq!(hex_value(&b'0'), Some(0));
        assert_eq!(hex_value(&b'9'), Some(9));
        assert_eq!(hex_value(&b'a'), Some(10));
        assert_eq!(hex_value(&b'F'), Some(15));
        assert_eq!(hex_value(&b'g'), None);
        assert_eq!(hex_value(&b'%'), None);
    }

    #[test]
    fn looks_like_windows_drive_only_matches_drive_prefixes() {
        assert!(looks_like_windows_drive("C:/x"));
        assert!(looks_like_windows_drive("d:"));
        assert!(!looks_like_windows_drive("/home"));
        assert!(!looks_like_windows_drive("1:/x"));
        assert!(!looks_like_windows_drive(""));
    }

    #[test]
    fn write_files_rejects_an_empty_list_without_touching_the_clipboard() {
        let err = write_files(&[]).unwrap_err();
        assert!(matches!(err, ClipboardError::Write { attempts: 0, .. }));
    }

    #[test]
    fn drop_effect_copy_serializes_to_four_le_bytes() {
        assert_eq!(DROP_EFFECT_COPY.to_le_bytes(), [5, 0, 0, 0]);
    }

    #[test]
    fn collect_text_formats_keeps_all_supported_representations() {
        let content = collect_text_formats(vec![
            ClipboardContent::Html("<b>Hello</b>".into()),
            ClipboardContent::Text("Hello".into()),
            ClipboardContent::Rtf(r"{\rtf1\b Hello}".into()),
        ])
        .unwrap();

        assert_eq!(content.text, "Hello");
        assert_eq!(content.html.as_deref(), Some("<b>Hello</b>"));
        assert_eq!(content.rtf.as_deref(), Some(r"{\rtf1\b Hello}"));
    }

    #[test]
    fn collect_text_formats_requires_plain_text_for_hash_and_search() {
        let result = collect_text_formats(vec![ClipboardContent::Html("<b>Hello</b>".into())]);

        assert!(result.is_err());
    }
}
