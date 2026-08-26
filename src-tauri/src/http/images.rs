//! On-demand image serving for the HTTP API.
//!
//! Since db v8 the image bytes of a clipboard item live in `binary_blobs`,
//! referenced by `clipboard_item_representations` (`source` / `canonical` /
//! `thumbnail`); `content` no longer carries a base64 data URL. List and search
//! responses omit image payloads (see `super::to_list_item`) and point clients
//! at `/api/clipboard/:id/image` (canonical PNG) and
//! `/api/clipboard/:id/thumbnail` (downscaled copy cached on disk). This module
//! only deals with transport — resizing and disk caching; reading the stored
//! representation is `database::productization::get_image_representation`, and
//! the desktop app never calls these HTTP paths.

use std::fs;
use std::path::{Path, PathBuf};

use crate::AppError;

pub const THUMBNAIL_CACHE_DIR: &str = "thumbnails";
pub const DEFAULT_THUMBNAIL_MAX_EDGE: u32 = 512;
const MIN_THUMBNAIL_MAX_EDGE: u32 = 64;
const MAX_THUMBNAIL_MAX_EDGE: u32 = 1536;

/// Clamp a client-requested thumbnail edge length to the supported range.
pub fn clamp_max_edge(max_edge: Option<u32>) -> u32 {
    max_edge
        .unwrap_or(DEFAULT_THUMBNAIL_MAX_EDGE)
        .clamp(MIN_THUMBNAIL_MAX_EDGE, MAX_THUMBNAIL_MAX_EDGE)
}

/// Return a thumbnail for the item, generating and caching it on first access.
///
/// Cache files live in `<data_dir>/thumbnails/<id>-<hash>-<max>.png`. The
/// content hash is part of the filename, so a re-captured image always
/// produces a fresh cache entry. On any generation error the caller falls back
/// to the original bytes, so thumbnail serving never fails a request.
pub fn thumbnail(
    cache_root: &Path,
    item_id: i64,
    content_hash: &str,
    original: &[u8],
    max_edge: u32,
) -> Result<(Vec<u8>, bool), AppError> {
    let cache_dir = cache_root.join(THUMBNAIL_CACHE_DIR);
    let cache_path = cache_dir.join(format!("{item_id}-{content_hash}-{max_edge}.png"));
    if let Some(bytes) = read_cached(&cache_path)? {
        return Ok((bytes, true));
    }
    let bytes = generate(original, max_edge)?;
    write_cached(&cache_dir, &cache_path, &bytes)?;
    Ok((bytes, false))
}

fn generate(original: &[u8], max_edge: u32) -> Result<Vec<u8>, AppError> {
    let image = image::load_from_memory(original)
        .map_err(|error| AppError::System(format!("failed to decode clipboard image: {error}")))?;
    let (width, height) = (image.width(), image.height());
    let longest = width.max(height);
    if longest == 0 || longest <= max_edge {
        // Already small enough: re-encoding would only lose quality.
        return Ok(original.to_vec());
    }
    let scale = f64::from(max_edge) / f64::from(longest);
    let target_width = ((f64::from(width) * scale).round() as u32).max(1);
    let target_height = ((f64::from(height) * scale).round() as u32).max(1);
    let resized = image.resize_exact(
        target_width,
        target_height,
        image::imageops::FilterType::Lanczos3,
    );
    let mut buffer = Vec::new();
    resized
        .write_to(
            &mut std::io::Cursor::new(&mut buffer),
            image::ImageFormat::Png,
        )
        .map_err(|error| AppError::System(format!("failed to encode thumbnail: {error}")))?;
    Ok(buffer)
}

fn read_cached(path: &Path) -> Result<Option<Vec<u8>>, AppError> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(AppError::System(format!(
            "failed to read cached thumbnail {}: {error}",
            path.display()
        ))),
    }
}

fn write_cached(cache_dir: &Path, path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    fs::create_dir_all(cache_dir).map_err(|error| {
        AppError::System(format!(
            "failed to create thumbnail cache at {}: {error}",
            cache_dir.display()
        ))
    })?;
    let temporary = path.with_extension(format!("tmp-{}", std::process::id()));
    fs::write(&temporary, bytes).map_err(|error| {
        AppError::System(format!(
            "failed to write thumbnail cache {}: {error}",
            temporary.display()
        ))
    })?;
    fs::rename(&temporary, path).map_err(|error| {
        AppError::System(format!(
            "failed to finalize thumbnail cache {}: {error}",
            path.display()
        ))
    })
}

/// Delete the cached thumbnails for an item (best-effort, used when the item
/// is deleted so the cache does not grow forever).
pub fn invalidate(cache_root: &Path, item_id: i64) {
    let cache_dir = cache_root.join(THUMBNAIL_CACHE_DIR);
    let Ok(readdir) = fs::read_dir(&cache_dir) else {
        return;
    };
    let prefix = format!("{item_id}-");
    for entry in readdir.flatten() {
        let path = entry.path();
        let matches = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(&prefix));
        if matches {
            let _ = fs::remove_file(path);
        }
    }
}

pub fn cache_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(THUMBNAIL_CACHE_DIR)
}

/// Remove the whole thumbnail cache (used when all clipboard items are
/// cleared). Best-effort: a missing directory is not an error.
pub fn clear_cache(data_dir: &Path) {
    let _ = fs::remove_dir_all(cache_dir(data_dir));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "klip-images-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn png_fixture(width: u32, height: u32) -> Vec<u8> {
        let image = image::RgbaImage::from_pixel(width, height, image::Rgba([10, 20, 30, 255]));
        let mut buffer = Vec::new();
        image
            .write_to(
                &mut std::io::Cursor::new(&mut buffer),
                image::ImageFormat::Png,
            )
            .unwrap();
        buffer
    }

    #[test]
    fn clamp_keeps_requested_edge_in_range() {
        assert_eq!(clamp_max_edge(None), DEFAULT_THUMBNAIL_MAX_EDGE);
        assert_eq!(clamp_max_edge(Some(10)), MIN_THUMBNAIL_MAX_EDGE);
        assert_eq!(clamp_max_edge(Some(9999)), MAX_THUMBNAIL_MAX_EDGE);
        assert_eq!(clamp_max_edge(Some(256)), 256);
    }

    #[test]
    fn thumbnail_is_generated_then_served_from_cache() {
        let root = temp_dir("cache");
        let original = png_fixture(200, 100);
        let (first, cached) = thumbnail(&root, 7, "hash-7", &original, 64).unwrap();
        assert!(!cached);
        assert!(!first.is_empty());

        // Corrupt the generator input check by serving directly from disk:
        // overwrite the cache file and confirm the second call reads it back.
        let cache_dir = root.join(THUMBNAIL_CACHE_DIR);
        let cache_file = cache_dir.join("7-hash-7-64.png");
        fs::write(&cache_file, b"cached-bytes").unwrap();
        let (second, cached) = thumbnail(&root, 7, "hash-7", &original, 64).unwrap();
        assert!(cached);
        assert_eq!(second, b"cached-bytes");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn small_images_are_not_reencoded() {
        let root = temp_dir("small");
        let original = png_fixture(50, 40);
        let (bytes, _) = thumbnail(&root, 1, "h", &original, 512).unwrap();
        assert_eq!(bytes, original);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn invalidate_removes_only_matching_item_files() {
        let root = temp_dir("invalidate");
        let original = png_fixture(300, 300);
        thumbnail(&root, 1, "a", &original, 128).unwrap();
        thumbnail(&root, 2, "b", &original, 128).unwrap();
        invalidate(&root, 1);
        let remaining = fs::read_dir(root.join(THUMBNAIL_CACHE_DIR))
            .unwrap()
            .count();
        assert_eq!(remaining, 1);
        fs::remove_dir_all(&root).unwrap();
    }
}
