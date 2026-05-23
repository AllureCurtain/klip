pub mod clipboard;
pub mod config;
pub mod connection;
pub mod data_portability;
pub mod productization;
pub mod types;

pub const CURRENT_DB_VERSION: i64 = 3;

pub use connection::{get_db_path, init, Database};
pub use types::{
    BackupSummary, ClipboardItem, ConfigEntry, ContentType, DiagnosticsInfo, ImportSummary,
    NewClipboardItem, RestoreSummary, SystemInfo, Tag,
};
