use crate::clipboard::writer::ClipboardWriteMode;
use crate::database::{self, ClipboardItem, ContentType, Database};
use crate::AppError;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use url::Url;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClipboardContentAction {
    OpenUrl { target: String },
    ComposeEmail { target: String },
    OpenPath { target: String },
    RevealPath { target: String },
    CopyPath { target: String },
    CopyFileName { target: String },
}

pub fn detect_actions(item: &ClipboardItem) -> Vec<ClipboardContentAction> {
    match item.content_type {
        ContentType::Text => detect_text_actions(&item.content),
        ContentType::File => detect_file_actions(&item.content),
        ContentType::Image => Vec::new(),
    }
}

pub fn get_actions_by_id(db: &Database, id: i64) -> Result<Vec<ClipboardContentAction>, AppError> {
    let item = load_item(db, id)?;
    Ok(detect_actions(&item))
}

pub fn execute_action_by_id(
    app: &AppHandle,
    db: &Database,
    id: i64,
    action: ClipboardContentAction,
) -> Result<(), AppError> {
    let item = require_current_action(db, id, &action)?;

    match action {
        ClipboardContentAction::OpenUrl { target } => open_external(app, &target)?,
        ClipboardContentAction::ComposeEmail { target } => {
            open_external(app, &format!("mailto:{target}"))?
        }
        ClipboardContentAction::OpenPath { target } => open_external(app, &target)?,
        ClipboardContentAction::RevealPath { target } => {
            crate::platform::reveal::reveal_path(Path::new(&target))?
        }
        ClipboardContentAction::CopyPath { target } => copy_action_text(&target)?,
        ClipboardContentAction::CopyFileName { target } => {
            let name = Path::new(&target)
                .file_name()
                .ok_or_else(|| AppError::InvalidInput("path has no file name".to_string()))?
                .to_string_lossy();
            copy_action_text(&name)?;
        }
    }

    let _ = database::clipboard::touch_last_used(db, item.id);
    Ok(())
}

fn require_current_action(
    db: &Database,
    id: i64,
    requested: &ClipboardContentAction,
) -> Result<ClipboardItem, AppError> {
    let item = load_item(db, id)?;
    if !detect_actions(&item).contains(requested) {
        return Err(AppError::InvalidInput(
            "clipboard content action is no longer valid".to_string(),
        ));
    }
    Ok(item)
}

fn load_item(db: &Database, id: i64) -> Result<ClipboardItem, AppError> {
    database::clipboard::get_by_id(db, id)?
        .ok_or_else(|| AppError::NotFound(format!("clipboard item {id} not found")))
}

#[allow(deprecated)]
fn open_external(app: &AppHandle, target: &str) -> Result<(), AppError> {
    app.shell()
        .open(target.to_string(), None)
        .map_err(|error| AppError::System(format!("failed to open target: {error}")))
}

fn copy_action_text(content: &str) -> Result<(), AppError> {
    crate::clipboard::copy_to_clipboard(
        content,
        &ContentType::Text,
        None,
        &[],
        ClipboardWriteMode::PlainText,
    )
}

fn detect_text_actions(content: &str) -> Vec<ClipboardContentAction> {
    let target = content.trim();
    if target.is_empty() {
        return Vec::new();
    }

    if let Some(url) = safe_web_url(target) {
        return vec![ClipboardContentAction::OpenUrl { target: url }];
    }

    if is_conservative_email(target) {
        return vec![ClipboardContentAction::ComposeEmail {
            target: target.to_string(),
        }];
    }

    let path = Path::new(target);
    if path.exists() {
        return path_actions(target, true);
    }

    Vec::new()
}

fn detect_file_actions(content: &str) -> Vec<ClipboardContentAction> {
    let Ok(paths) = serde_json::from_str::<Vec<String>>(content) else {
        return Vec::new();
    };

    paths
        .into_iter()
        .filter(|path| !path.trim().is_empty())
        .flat_map(|path| {
            let exists = Path::new(&path).exists();
            path_actions(&path, exists)
        })
        .collect()
}

fn safe_web_url(target: &str) -> Option<String> {
    let parsed = Url::parse(target).ok()?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return None;
    }
    Some(parsed.into())
}

fn is_conservative_email(target: &str) -> bool {
    if target.len() > 254 || !target.is_ascii() {
        return false;
    }
    let Some((local, domain)) = target.split_once('@') else {
        return false;
    };
    if local.is_empty()
        || local.len() > 64
        || local.starts_with('.')
        || local.ends_with('.')
        || local.contains("..")
        || !local
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._%+-".contains(&byte))
    {
        return false;
    }

    if !domain.contains('.') || domain.starts_with('.') || domain.ends_with('.') {
        return false;
    }

    domain.split('.').all(|label| {
        !label.is_empty()
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    })
}

fn path_actions(target: &str, exists: bool) -> Vec<ClipboardContentAction> {
    let mut actions = Vec::with_capacity(4);
    if exists {
        actions.push(ClipboardContentAction::OpenPath {
            target: target.to_string(),
        });
        actions.push(ClipboardContentAction::RevealPath {
            target: target.to_string(),
        });
    }
    actions.push(ClipboardContentAction::CopyPath {
        target: target.to_string(),
    });
    if Path::new(target).file_name().is_some() {
        actions.push(ClipboardContentAction::CopyFileName {
            target: target.to_string(),
        });
    }
    actions
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{ClipboardFormat, ContentType, NewClipboardItem};
    use rusqlite::Connection;
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn item(content_type: ContentType, content: impl Into<String>) -> ClipboardItem {
        ClipboardItem {
            id: 1,
            content_type,
            content: content.into(),
            preview: None,
            hash: "hash".to_string(),
            size: 0,
            metadata: None,
            source_application: None,
            source_window_title: None,
            custom_title: None,
            note: None,
            is_favorited: false,
            is_sensitive: false,
            sensitivity_reason: None,
            formats: Vec::<ClipboardFormat>::new(),
            ocr: None,
            tags: Vec::new(),
            created_at: 0,
            last_used_at: 0,
            media: None,
        }
    }

    #[test]
    fn recognizes_only_complete_http_and_https_urls() {
        assert_eq!(
            detect_actions(&item(
                ContentType::Text,
                "  https://example.com/docs?q=klip#top  "
            )),
            vec![ClipboardContentAction::OpenUrl {
                target: "https://example.com/docs?q=klip#top".to_string(),
            }]
        );
        assert_eq!(
            detect_actions(&item(ContentType::Text, "http://localhost:27717/status")),
            vec![ClipboardContentAction::OpenUrl {
                target: "http://localhost:27717/status".to_string(),
            }]
        );
        assert!(detect_actions(&item(
            ContentType::Text,
            "See https://example.com inside this sentence"
        ))
        .is_empty());
    }

    #[test]
    fn rejects_dangerous_or_unsupported_protocols() {
        for content in [
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "file:///C:/Windows/System32/calc.exe",
            "ftp://example.com/archive.zip",
            "https://",
        ] {
            assert!(
                detect_actions(&item(ContentType::Text, content)).is_empty(),
                "unexpected action for {content}"
            );
        }
    }

    #[test]
    fn recognizes_conservative_email_addresses() {
        assert_eq!(
            detect_actions(&item(ContentType::Text, "hello.team+klip@example.co.uk")),
            vec![ClipboardContentAction::ComposeEmail {
                target: "hello.team+klip@example.co.uk".to_string(),
            }]
        );

        for content in [
            "hello@example",
            ".hello@example.com",
            "hello..team@example.com",
            "hello@-example.com",
            "hello@example.com extra",
            "hello#tag@example.com",
            "你好@example.com",
        ] {
            assert!(
                detect_actions(&item(ContentType::Text, content)).is_empty(),
                "unexpected action for {content}"
            );
        }
    }

    #[test]
    fn text_paths_must_exist_and_use_the_whole_trimmed_value() {
        let temp = TempFixture::new();
        let path = temp.root.join("folder with spaces").join("报告.txt");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, b"klip").unwrap();
        let target = path.to_string_lossy().to_string();

        assert_eq!(
            detect_actions(&item(ContentType::Text, format!("  {target}  "))),
            path_actions(&target, true)
        );
        assert!(detect_actions(&item(
            ContentType::Text,
            temp.root.join("missing.txt").to_string_lossy()
        ))
        .is_empty());
        assert!(detect_actions(&item(
            ContentType::Text,
            format!("Open this file: {target}")
        ))
        .is_empty());
    }

    #[test]
    fn file_items_keep_copy_actions_but_open_only_existing_paths() {
        let temp = TempFixture::new();
        let existing = temp.root.join("existing file.txt");
        let missing = temp.root.join("missing file.txt");
        fs::write(&existing, b"klip").unwrap();
        let existing = existing.to_string_lossy().to_string();
        let missing = missing.to_string_lossy().to_string();
        let content = serde_json::to_string(&vec![&existing, &missing]).unwrap();

        let actions = detect_actions(&item(ContentType::File, content));

        let mut expected = path_actions(&existing, true);
        expected.extend(path_actions(&missing, false));
        assert_eq!(actions, expected);
    }

    #[test]
    fn action_serialization_is_stable_and_typed() {
        assert_eq!(
            serde_json::to_value(ClipboardContentAction::RevealPath {
                target: r"C:\work\report.txt".to_string(),
            })
            .unwrap(),
            serde_json::json!({
                "kind": "reveal_path",
                "target": r"C:\work\report.txt",
            })
        );
    }

    #[test]
    fn execution_validation_reloads_the_item_and_rejects_stale_or_forged_targets() {
        let db = test_db();
        let saved = insert_text(&db, "https://example.com/original");
        let original = ClipboardContentAction::OpenUrl {
            target: "https://example.com/original".to_string(),
        };

        assert_eq!(
            require_current_action(&db, saved.id, &original).unwrap().id,
            saved.id
        );
        assert!(matches!(
            require_current_action(
                &db,
                saved.id,
                &ClipboardContentAction::OpenUrl {
                    target: "https://attacker.invalid".to_string(),
                }
            ),
            Err(AppError::InvalidInput(_))
        ));

        let conn = db.get_connection().unwrap();
        conn.execute(
            "UPDATE clipboard_items SET content = ?1 WHERE id = ?2",
            rusqlite::params!["javascript:alert(1)", saved.id],
        )
        .unwrap();
        drop(conn);

        assert!(matches!(
            require_current_action(&db, saved.id, &original),
            Err(AppError::InvalidInput(_))
        ));
    }

    fn path_actions(target: &str, exists: bool) -> Vec<ClipboardContentAction> {
        let mut actions = Vec::new();
        if exists {
            actions.push(ClipboardContentAction::OpenPath {
                target: target.to_string(),
            });
            actions.push(ClipboardContentAction::RevealPath {
                target: target.to_string(),
            });
        }
        actions.push(ClipboardContentAction::CopyPath {
            target: target.to_string(),
        });
        actions.push(ClipboardContentAction::CopyFileName {
            target: target.to_string(),
        });
        actions
    }

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();
        db
    }

    fn insert_text(db: &Database, content: &str) -> ClipboardItem {
        let inserted = NewClipboardItem {
            content_type: ContentType::Text,
            data: content.as_bytes().to_vec(),
            preview: Some(content.to_string()),
            hash: format!("{:x}", Sha256::digest(content.as_bytes())),
            size: content.len() as i64,
            metadata: None,
            formats: Vec::new(),
        };
        database::clipboard::insert(db, &inserted).unwrap()
    }

    struct TempFixture {
        root: PathBuf,
    }

    impl TempFixture {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "klip-content-actions-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&root).unwrap();
            Self { root }
        }
    }

    impl Drop for TempFixture {
        fn drop(&mut self) {
            if self.root.starts_with(std::env::temp_dir()) {
                let _ = fs::remove_dir_all(&self.root);
            }
        }
    }
}
