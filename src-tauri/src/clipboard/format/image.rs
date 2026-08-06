use super::{ClipboardFormatStrategy, ContentType, ExtractedContent, FormatError};
use crate::clipboard::backend;

/// Images above this size are skipped rather than stored. The limit applies to
/// the decoded RGBA buffer, not the PNG, because RGBA is what has to be held
/// in memory while encoding.
const MAX_IMAGE_SIZE: usize = 5 * 1024 * 1024;

pub struct ImageStrategy;

impl ClipboardFormatStrategy for ImageStrategy {
    fn content_type(&self) -> ContentType {
        ContentType::Image
    }

    fn detect(&self) -> bool {
        backend::has_image()
    }

    fn extract(&self) -> Result<ExtractedContent, FormatError> {
        let image = backend::read_image()?;

        if image.rgba.len() > MAX_IMAGE_SIZE {
            tracing::warn!(
                "Image skipped: {}x{} pixels, {:.2}MB (limit {}MB)",
                image.width,
                image.height,
                image.rgba.len() as f64 / 1024.0 / 1024.0,
                MAX_IMAGE_SIZE / 1024 / 1024
            );
            return Err(FormatError::TooLarge(image.rgba.len()));
        }

        let png_data = encode_png(&image.rgba, image.width as usize, image.height as usize)?;
        let hash = crate::clipboard::hash::hash_bytes(&png_data);
        let size = png_data.len() as i64;
        let preview = format!("图片 {}x{}", image.width, image.height);
        let metadata = serde_json::json!({
            "width": image.width,
            "height": image.height,
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
