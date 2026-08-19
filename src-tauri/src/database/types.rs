use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ContentType {
    Text,
    Image,
    File,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClipboardFormatType {
    Text,
    Html,
    Rtf,
}

impl ClipboardFormatType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Html => "html",
            Self::Rtf => "rtf",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "text" => Some(Self::Text),
            "html" => Some(Self::Html),
            "rtf" => Some(Self::Rtf),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClipboardFormat {
    pub format: ClipboardFormatType,
    pub content: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OcrStatus {
    Pending,
    Completed,
    Failed,
}

impl OcrStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }

    pub fn from_db(value: &str) -> Self {
        match value {
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClipboardOcr {
    pub status: OcrStatus,
    pub text: String,
    pub error: Option<String>,
    pub updated_at: i64,
}

impl ContentType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ContentType::Text => "text",
            ContentType::Image => "image",
            ContentType::File => "file",
        }
    }

    pub fn from_db(value: &str) -> Self {
        match value {
            "image" => ContentType::Image,
            "file" => ContentType::File,
            _ => ContentType::Text,
        }
    }
}

impl std::fmt::Display for ContentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub content_type: ContentType,
    pub content: String,
    pub preview: Option<String>,
    pub hash: String,
    pub size: i64,
    pub metadata: Option<String>,
    pub source_application: Option<String>,
    pub source_window_title: Option<String>,
    #[serde(default)]
    pub custom_title: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    pub is_favorited: bool,
    pub is_sensitive: bool,
    pub sensitivity_reason: Option<String>,
    #[serde(default)]
    pub formats: Vec<ClipboardFormat>,
    #[serde(default)]
    pub ocr: Option<ClipboardOcr>,
    pub tags: Vec<Tag>,
    pub created_at: i64,
    pub last_used_at: i64,
    #[serde(default)]
    pub media: Option<ImageMedia>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImageMedia {
    pub width: i64,
    pub height: i64,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: i64,
    #[serde(rename = "originalAvailable")]
    pub original_available: bool,
    #[serde(rename = "sourceFormats")]
    pub source_formats: Vec<String>,
    #[serde(rename = "thumbnailRef")]
    pub thumbnail_ref: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutBinding {
    pub action_id: String,
    pub enabled: bool,
    pub accelerator: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub window_label: String,
    pub width_dip: i64,
    pub height_dip: i64,
    pub x: Option<i64>,
    pub y: Option<i64>,
    pub monitor_id: Option<String>,
    pub scale_factor: Option<f64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub used_bytes: i64,
    pub budget_bytes: Option<i64>,
    pub image_bytes: i64,
    pub blob_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardAnnotationInput {
    pub custom_title: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NewClipboardItem {
    pub content_type: ContentType,
    pub data: Vec<u8>,
    pub preview: Option<String>,
    pub hash: String,
    pub size: i64,
    pub metadata: Option<String>,
    pub formats: Vec<ClipboardFormat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigEntry {
    pub key: String,
    pub value: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub platform: String,
    pub version: String,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsInfo {
    pub platform: String,
    pub app_version: String,
    pub data_dir: String,
    pub db_path: String,
    pub log_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub tag_id: Option<i64>,
    pub is_favorited: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetInput {
    pub title: String,
    pub content: String,
    pub tag_id: Option<i64>,
    pub is_favorited: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceRule {
    pub id: i64,
    pub match_type: String,
    pub pattern: String,
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRuleInput {
    pub match_type: String,
    pub pattern: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedSearchQuery {
    pub query: String,
    pub content_type: Option<String>,
    pub favorite_only: bool,
    pub sensitive_only: Option<bool>,
    pub tag_id: Option<i64>,
    pub exact_match: bool,
    pub created_after: Option<i64>,
    pub created_before: Option<i64>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSummary {
    pub imported: usize,
    pub skipped: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSummary {
    pub path: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreSummary {
    pub path: String,
    pub size: u64,
    pub pre_restore_backup_path: String,
    pub pre_restore_backup_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsResponse {
    pub total_items: i64,
    pub text_count: i64,
    pub image_count: i64,
    pub file_count: i64,
    pub favorite_count: i64,
    pub sensitive_count: i64,
    pub tag_count: i64,
    pub snippet_count: i64,
    pub source_rule_count: i64,
    pub total_size_bytes: i64,
    pub db_size_bytes: u64,
}
