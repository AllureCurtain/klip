use base64::Engine;
use sha2::{Digest, Sha256};

const PNG_DATA_URL_PREFIX: &str = "data:image/png;base64,";

pub fn hash_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

/// The single image hash used on both sides of self-suppression: the monitor
/// hashes the pixels it reads back, so the writer must arm the same value.
/// Hashing the stored PNG bytes instead would never match a re-read.
pub fn hash_image_pixels(rgba: &[u8], width: u32, height: u32) -> String {
    let mut hasher = Sha256::new();
    hasher.update(width.to_le_bytes());
    hasher.update(height.to_le_bytes());
    hasher.update(rgba);
    format!("{:x}", hasher.finalize())
}

/// Hash a stored `content` string the way the monitor will hash the same
/// content when it is read back off the clipboard.
///
/// Text and file lists are stored and re-read as the same bytes, so a plain
/// byte hash matches. Images are different: the monitor hashes decoded RGBA
/// pixels plus dimensions, not the encoded PNG, so stored image content must
/// be decoded back to pixels before hashing.
pub fn hash_stored_content(content_type: &str, content: &str) -> String {
    if content_type == "image" {
        if let Some(hash) = stored_image_pixel_hash(content) {
            return hash;
        }
    }

    hash_bytes(content.as_bytes())
}

/// Stored image content is a `data:image/png;base64,` URL; older rows may hold
/// raw encoded bytes. Decode either back to RGBA and take the pixel hash.
/// Returns `None` when the content cannot be decoded as an image at all --
/// the caller falls back to a byte hash, which is still deterministic even
/// though it cannot match a monitor read.
fn stored_image_pixel_hash(content: &str) -> Option<String> {
    let encoded = match content.strip_prefix(PNG_DATA_URL_PREFIX) {
        Some(encoded) => base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .ok()?,
        None => content.as_bytes().to_vec(),
    };

    let decoded = image::load_from_memory(&encoded).ok()?.to_rgba8();
    let (width, height) = decoded.dimensions();
    Some(hash_image_pixels(decoded.as_raw(), width, height))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a real PNG from raw RGBA, so the round trip through
    /// `hash_stored_content` exercises actual decoding.
    fn encode_test_png(rgba: &[u8], width: u32, height: u32) -> Vec<u8> {
        let img = image::RgbaImage::from_raw(width, height, rgba.to_vec()).unwrap();
        let mut buf = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .unwrap();
        buf
    }

    #[test]
    fn image_content_hashes_pixels_not_png_bytes() {
        let rgba = vec![255u8, 0, 0, 255, 0, 255, 0, 255];
        let png = encode_test_png(&rgba, 2, 1);
        let content = format!(
            "{}{}",
            PNG_DATA_URL_PREFIX,
            base64::engine::general_purpose::STANDARD.encode(&png)
        );

        assert_eq!(
            hash_stored_content("image", &content),
            hash_image_pixels(&rgba, 2, 1)
        );
    }

    #[test]
    fn stored_pixel_hash_matches_monitor_capture_hash() {
        // What the monitor computes when it reads the image back is
        // `hash_image_pixels(rgba, w, h)`; the write side must arm the same.
        let rgba = vec![9u8, 8, 7, 6, 5, 4, 3, 2];
        let png = encode_test_png(&rgba, 1, 2);
        let data_url = format!(
            "{}{}",
            PNG_DATA_URL_PREFIX,
            base64::engine::general_purpose::STANDARD.encode(&png)
        );

        let armed = hash_stored_content("image", &data_url);
        let captured = hash_image_pixels(&rgba, 1, 2);

        assert_eq!(armed, captured);
        assert_ne!(armed, hash_bytes(&png));
    }

    #[test]
    fn non_image_string_content_falls_back_to_byte_hash() {
        // A stored image row whose content is not decodable as an image (the
        // legacy raw-bytes path, or corrupt data) still gets a deterministic
        // hash; it just cannot match a monitor read.
        assert_eq!(
            hash_stored_content("image", "not-an-image"),
            hash_bytes(b"not-an-image")
        );
    }

    #[test]
    fn undecodable_image_content_falls_back_to_byte_hash() {
        let content = format!("{}{}", PNG_DATA_URL_PREFIX, "!!!not base64!!!");
        assert_eq!(
            hash_stored_content("image", &content),
            hash_bytes(content.as_bytes())
        );
    }

    #[test]
    fn text_and_file_content_hash_their_stored_bytes() {
        assert_eq!(
            hash_stored_content("text", "hello"),
            hash_bytes(b"hello")
        );
        assert_eq!(
            hash_stored_content("file", r#"["/a/b.txt"]"#),
            hash_bytes(br#"["/a/b.txt"]"#)
        );
    }

    #[test]
    fn pixel_hash_includes_dimensions_and_alpha() {
        let baseline = hash_image_pixels(&[1, 2, 3, 4], 1, 1);
        assert_ne!(baseline, hash_image_pixels(&[1, 2, 3, 5], 1, 1));
        assert_ne!(baseline, hash_image_pixels(&[1, 2, 3, 4], 2, 1));
        assert_ne!(baseline, hash_image_pixels(&[1, 2, 3, 4], 1, 2));
    }
}
