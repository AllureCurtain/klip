use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub content_type: String,
    pub content: String,
    pub preview: Option<String>,
    pub hash: String,
    pub size: i64,
    pub is_favorited: bool,
    pub created_at: i64,
    pub last_used_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewClipboardItem {
    pub content_type: String,
    pub content: String,
    pub preview: Option<String>,
    pub hash: String,
    pub size: i64,
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
