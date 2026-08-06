pub mod clipboard;
pub mod clipboard_query;
pub mod config;
pub mod connection;
pub mod data_portability;
pub mod formats;
pub mod migrations;
pub mod productization;
pub mod schema;
pub mod snippets;
pub mod types;

pub const CURRENT_DB_VERSION: i64 = 4;

pub use connection::{app_data_dir, get_db_path, init, Database};
pub use types::{
    AdvancedSearchQuery, BackupSummary, ClipboardFormat, ClipboardFormatType, ClipboardItem,
    ConfigEntry, ContentType, DiagnosticsInfo, ImportSummary, NewClipboardItem, RestoreSummary,
    Snippet, SnippetInput, SourceRule, SourceRuleInput, StatsResponse, SystemInfo, Tag,
};
