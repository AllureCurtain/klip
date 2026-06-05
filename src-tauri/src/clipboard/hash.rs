use base64::Engine;
use sha2::{Digest, Sha256};

const PNG_DATA_URL_PREFIX: &str = "data:image/png;base64,";

pub fn hash_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

pub fn hash_stored_content(content_type: &str, content: &str) -> String {
    if content_type == "image" {
        if let Some(data) = content.strip_prefix(PNG_DATA_URL_PREFIX) {
            if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(data) {
                return hash_bytes(&decoded);
            }
        }
    }

    hash_bytes(content.as_bytes())
}
