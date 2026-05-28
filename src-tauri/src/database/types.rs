use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ContentType {
    Text,
    Image,
    File,
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
    pub is_favorited: bool,
    pub is_sensitive: bool,
    pub sensitivity_reason: Option<String>,
    pub tags: Vec<Tag>,
    pub created_at: i64,
    pub last_used_at: i64,
}

#[derive(Debug, Clone)]
pub struct NewClipboardItem {
    pub content_type: ContentType,
    pub data: Vec<u8>,
    pub preview: Option<String>,
    pub hash: String,
    pub size: i64,
    pub metadata: Option<String>,
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
