//! Wire types for the HTTP API.
//!
//! List/search endpoints must not ship full image payloads: a single
//! screenshot is several megabytes of base64, and the list view only needs a
//! thumbnail. [`ClipboardItemDto`] therefore omits `content` for image items
//! and points at the on-demand endpoints instead. The database schema and the
//! desktop IPC surface are untouched — this projection is HTTP-only.

use crate::database::{ClipboardFormat, ClipboardItem, ClipboardOcr, ContentType, Tag};
use serde::Serialize;

/// On-demand image links for an image clipboard item.
///
/// `url` serves the original PNG; `thumbnail_url` a small cached-friendly
/// rendition. Both are deterministic from the item id.
#[derive(Debug, Clone, Serialize)]
pub struct ImageRef {
    pub url: String,
    pub thumbnail_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    /// Original image size in bytes.
    pub size: i64,
}

/// HTTP projection of [`ClipboardItem`]. Same shape as the desktop type except
/// `content` is optional — omitted for images, which must be fetched from the
/// dedicated endpoints — and `image_ref` carries the on-demand links.
#[derive(Debug, Clone, Serialize)]
pub struct ClipboardItemDto {
    pub id: i64,
    pub content_type: ContentType,
    /// Full text/file content. Always omitted for image items (use `image_ref`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    pub preview: Option<String>,
    pub hash: String,
    pub size: i64,
    pub metadata: Option<String>,
    pub source_application: Option<String>,
    pub source_window_title: Option<String>,
    pub custom_title: Option<String>,
    pub note: Option<String>,
    pub is_favorited: bool,
    pub is_sensitive: bool,
    pub sensitivity_reason: Option<String>,
    pub formats: Vec<ClipboardFormat>,
    pub ocr: Option<ClipboardOcr>,
    pub tags: Vec<Tag>,
    pub created_at: i64,
    pub last_used_at: i64,
    /// Present only for image items.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_ref: Option<ImageRef>,
}

impl From<ClipboardItem> for ClipboardItemDto {
    fn from(item: ClipboardItem) -> Self {
        let is_image = item.content_type == ContentType::Image;
        let image_ref = if is_image {
            let (width, height) = parse_dimensions(item.metadata.as_deref());
            Some(ImageRef {
                url: format!("/api/clipboard/{}/image", item.id),
                thumbnail_url: format!("/api/clipboard/{}/thumbnail", item.id),
                width,
                height,
                size: item.size,
            })
        } else {
            None
        };
        ClipboardItemDto {
            id: item.id,
            content_type: item.content_type,
            content: if is_image { None } else { Some(item.content) },
            preview: item.preview,
            hash: item.hash,
            size: item.size,
            metadata: item.metadata,
            source_application: item.source_application,
            source_window_title: item.source_window_title,
            custom_title: item.custom_title,
            note: item.note,
            is_favorited: item.is_favorited,
            is_sensitive: item.is_sensitive,
            sensitivity_reason: item.sensitivity_reason,
            formats: item.formats,
            ocr: item.ocr,
            tags: item.tags,
            created_at: item.created_at,
            last_used_at: item.last_used_at,
            image_ref,
        }
    }
}

/// Parse `{"width":W,"height":H}` metadata, tolerating anything unexpected.
fn parse_dimensions(metadata: Option<&str>) -> (Option<u32>, Option<u32>) {
    let Some(metadata) = metadata else {
        return (None, None);
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(metadata) else {
        return (None, None);
    };
    let width = value
        .get("width")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32);
    let height = value
        .get("height")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32);
    (width, height)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(content_type: ContentType, content: &str, metadata: Option<&str>) -> ClipboardItem {
        ClipboardItem {
            id: 7,
            content_type,
            content: content.to_string(),
            preview: Some("preview".into()),
            hash: "hash".into(),
            size: 42,
            metadata: metadata.map(str::to_string),
            source_application: None,
            source_window_title: None,
            custom_title: None,
            note: None,
            is_favorited: false,
            is_sensitive: false,
            sensitivity_reason: None,
            formats: Vec::new(),
            ocr: None,
            tags: Vec::new(),
            created_at: 1,
            last_used_at: 2,
        }
    }

    #[test]
    fn image_item_omits_content_and_exposes_image_ref() {
        let dto = ClipboardItemDto::from(item(
            ContentType::Image,
            "data:image/png;base64,AAAA",
            Some(r#"{"width":1920,"height":1080}"#),
        ));
        let value = serde_json::to_value(&dto).unwrap();
        assert!(value.get("content").is_none(), "content must be omitted");
        assert_eq!(value["image_ref"]["url"], "/api/clipboard/7/image");
        assert_eq!(
            value["image_ref"]["thumbnail_url"],
            "/api/clipboard/7/thumbnail"
        );
        assert_eq!(value["image_ref"]["width"], 1920);
        assert_eq!(value["image_ref"]["height"], 1080);
        assert_eq!(value["image_ref"]["size"], 42);
    }

    #[test]
    fn text_item_keeps_content_without_image_ref() {
        let dto = ClipboardItemDto::from(item(ContentType::Text, "hello world", None));
        let value = serde_json::to_value(&dto).unwrap();
        assert_eq!(value["content"], "hello world");
        assert!(value.get("image_ref").is_none());
    }

    #[test]
    fn malformed_image_metadata_yields_no_dimensions_but_kept_links() {
        let dto = ClipboardItemDto::from(item(
            ContentType::Image,
            "data:image/png;base64,AAAA",
            Some("not-json"),
        ));
        assert!(dto.image_ref.is_some());
        assert_eq!(dto.image_ref.as_ref().unwrap().width, None);
        assert_eq!(dto.image_ref.as_ref().unwrap().height, None);
    }
}
