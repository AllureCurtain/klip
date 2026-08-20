use super::{ClipboardFormatStrategy, ContentType, ExtractedContent, FormatError};
use crate::clipboard::backend;
use crate::database::types::NewImageRepresentation;
use sha2::{Digest, Sha256};

const MAX_IMAGE_PIXELS: u64 = 40_000_000;
const MAX_RGBA_BYTES: usize = 160 * 1024 * 1024;

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
        let pixels = u64::from(image.width).saturating_mul(u64::from(image.height));
        if pixels > MAX_IMAGE_PIXELS || image.rgba.len() > MAX_RGBA_BYTES {
            return Err(FormatError::TooLarge(image.rgba.len()));
        }

        let png_data = encode_png(&image.rgba, image.width as usize, image.height as usize)?;
        let hash = hash_pixels(&image.rgba, image.width, image.height);
        let size = png_data.len() as i64;
        let preview = format!("图片 {}x{}", image.width, image.height);
        let source_formats = image
            .sources
            .iter()
            .map(|source| source.format_name.as_str())
            .collect::<Vec<_>>();
        let metadata = serde_json::json!({
            "width": image.width,
            "height": image.height,
            "format": source_formats.first().copied().unwrap_or("png"),
            "canonicalFormat": "png",
            "pixelHash": hash.clone(),
        })
        .to_string();
        let image_sources = image
            .sources
            .into_iter()
            .map(|source| NewImageRepresentation {
                format_name: source.format_name,
                mime_type: source.mime_type,
                clipboard_format: source.clipboard_format,
                data: source.data,
                metadata: source.metadata,
            })
            .collect();

        Ok(ExtractedContent {
            content_type: ContentType::Image,
            data: png_data,
            preview,
            hash,
            size,
            metadata: Some(metadata),
            formats: Vec::new(),
            image_sources,
        })
    }
}

fn hash_pixels(rgba: &[u8], width: u32, height: u32) -> String {
    let mut hasher = Sha256::new();
    hasher.update(width.to_le_bytes());
    hasher.update(height.to_le_bytes());
    hasher.update(rgba);
    format!("{:x}", hasher.finalize())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pixel_hash_includes_dimensions_and_alpha() {
        let baseline = hash_pixels(&[1, 2, 3, 4], 1, 1);
        assert_ne!(baseline, hash_pixels(&[1, 2, 3, 5], 1, 1));
        assert_ne!(baseline, hash_pixels(&[1, 2, 3, 4], 2, 1));
    }

    #[test]
    fn common_8k_rgba_buffer_is_inside_the_working_limit() {
        let bytes = 7680usize * 4320 * 4;
        assert!(bytes <= MAX_RGBA_BYTES);
        assert!((7680u64 * 4320) <= MAX_IMAGE_PIXELS);
    }
}
