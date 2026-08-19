pub mod clipboard;
pub mod clipboard_query;
pub mod config;
pub mod connection;
pub mod data_portability;
pub mod formats;
pub mod migrations;
pub mod ocr;
pub mod productization;
pub mod schema;
pub mod snippets;
pub mod types;

pub const CURRENT_DB_VERSION: i64 = 8;

pub use connection::{app_data_dir, get_db_path, init, Database};
pub use types::{
    AdvancedSearchQuery, BackupSummary, ClipboardAnnotationInput, ClipboardFormat,
    ClipboardFormatType, ClipboardItem, ClipboardOcr, ConfigEntry, ContentType, DiagnosticsInfo,
    ImageMedia, ImportSummary, NewClipboardItem, OcrStatus, RestoreSummary, ShortcutBinding,
    Snippet, SnippetInput, SourceRule, SourceRuleInput, StatsResponse, StorageUsage, SystemInfo,
    Tag, WindowState,
};
