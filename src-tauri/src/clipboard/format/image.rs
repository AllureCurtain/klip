use image::GenericImageView;
use sha2::{Digest, Sha256};

use super::{ClipboardFormatStrategy, ContentType, ExtractedContent, FormatError, ImageDimensions};

const MAX_IMAGE_SIZE: usize = 5 * 1024 * 1024;

pub struct ImageStrategy;

impl ClipboardFormatStrategy for ImageStrategy {
    fn content_type(&self) -> ContentType {
        ContentType::Image
    }

    fn detect(&self) -> bool {
        #[cfg(target_os = "windows")]
        {
            clipboard_win::raw::is_format_avail(17) || clipboard_win::raw::is_format_avail(8)
        }
        #[cfg(not(target_os = "windows"))]
        {
            arboard::Clipboard::new()
                .and_then(|mut cb| cb.get_image().map(|_| true))
                .unwrap_or(false)
        }
    }

    fn extract(&self) -> Result<ExtractedContent, FormatError> {
        #[cfg(target_os = "windows")]
        {
            let (rgba_data, width, height) = read_image_with_retry().ok_or_else(|| {
                FormatError::ClipboardAccess("failed to read image after retries".into())
            })?;

            if rgba_data.len() > MAX_IMAGE_SIZE {
                return Err(FormatError::TooLarge(rgba_data.len()));
            }

            let png_data = encode_png(&rgba_data, width, height)?;
            let hash = compute_hash(&png_data);
            let size = png_data.len() as i64;
            let preview = format!("图片 {}x{}", width, height);
            let metadata = serde_json::json!({
                "width": width,
                "height": height,
                "format": "png"
            })
            .to_string();

            Ok(ExtractedContent {
                content_type: ContentType::Image,
                data: png_data,
                preview,
                hash,
                size,
                metadata: Some(metadata),
            })
        }

        #[cfg(not(target_os = "windows"))]
        {
            let img_data = clipboard_with_retry(|cb| cb.get_image())
                .map_err(|e| FormatError::ClipboardAccess(e.to_string()))?;

            let width = img_data.width;
            let height = img_data.height;
            let rgba_slice = img_data.bytes.as_ref();

            if rgba_slice.len() > MAX_IMAGE_SIZE {
                return Err(FormatError::TooLarge(rgba_slice.len()));
            }

            let png_data = encode_png(rgba_slice, width, height)?;
            let hash = compute_hash(&png_data);
            let size = png_data.len() as i64;
            let preview = format!("图片 {}x{}", width, height);
            let metadata = serde_json::json!({
                "width": width,
                "height": height,
                "format": "png"
            })
            .to_string();

            Ok(ExtractedContent {
                content_type: ContentType::Image,
                data: png_data,
                preview,
                hash,
                size,
                metadata: Some(metadata),
            })
        }
    }

    fn copy_back(&self, content: &[u8], metadata: Option<&str>) -> Result<(), FormatError> {
        let img = image::load_from_memory(content)
            .map_err(|e| FormatError::CopyBackFailed(e.to_string()))?;

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

        clipboard_set_image_with_retry(raw)
            .map_err(|e| FormatError::CopyBackFailed(e.to_string()))?;

        Ok(())
    }

    fn generate_preview(&self, _content: &[u8], metadata: Option<&str>) -> String {
        if let Some(meta_str) = metadata {
            if let Ok(meta) = serde_json::from_str::<ImageDimensions>(meta_str) {
                return format!("图片 {}x{}", meta.width, meta.height);
            }
        }
        "图片".to_string()
    }
}

fn clipboard_set_image_with_retry(img_data: arboard::ImageData) -> Result<(), arboard::Error> {
    let mut attempts = 0;
    loop {
        let mut cb = arboard::Clipboard::new()?;
        match cb.set_image(img_data.clone()) {
            Ok(()) => return Ok(()),
            Err(e) => {
                attempts += 1;
                if attempts >= 5 {
                    return Err(e);
                }
                std::thread::sleep(std::time::Duration::from_millis(30));
            }
        }
    }
}

fn encode_png(rgba: &[u8], width: usize, height: usize) -> Result<Vec<u8>, FormatError> {
    let img = image::RgbaImage::from_raw(width as u32, height as u32, rgba.to_vec())
        .ok_or_else(|| FormatError::EncodingFailed("failed to create RGBA image".into()))?;

    let mut png_buf = Vec::with_capacity(rgba.len() / 2);
    img.write_to(
        &mut std::io::Cursor::new(&mut png_buf),
        image::ImageFormat::Png,
    )
    .map_err(|e| FormatError::EncodingFailed(e.to_string()))?;

    Ok(png_buf)
}

pub fn encode_png_test(rgba: &[u8], width: usize, height: usize) -> Result<Vec<u8>, FormatError> {
    encode_png(rgba, width, height)
}

fn compute_hash(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
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

/// Read image from clipboard on Windows with retry.
/// Uses arboard with more retries to handle clipboard lock contention.
#[cfg(target_os = "windows")]
fn read_image_with_retry() -> Option<(Vec<u8>, usize, usize)> {
    let mut attempts = 0;
    loop {
        match arboard::Clipboard::new() {
            Ok(mut cb) => match cb.get_image() {
                Ok(img_data) => {
                    let rgba = img_data.bytes.as_ref().to_vec();
                    return Some((rgba, img_data.width, img_data.height));
                }
                Err(e) => {
                    attempts += 1;
                    if attempts >= 10 {
                        tracing::debug!(
                            "read_image_with_retry: get_image failed after {} attempts: {}",
                            attempts,
                            e
                        );
                        return None;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
            },
            Err(e) => {
                attempts += 1;
                if attempts >= 10 {
                    tracing::debug!(
                        "read_image_with_retry: Clipboard::new failed after {} attempts: {}",
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
