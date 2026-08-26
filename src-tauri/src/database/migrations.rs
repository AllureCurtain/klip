use crate::config::registry;
use crate::AppError;
use base64::Engine;
use rusqlite::{Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use std::io::Cursor;

pub fn run_pending_migrations(
    conn: &Connection,
    now: i64,
    is_new_install: bool,
) -> Result<(), AppError> {
    let stored_version = read_schema_version(conn)?;
    if stored_version > crate::database::CURRENT_DB_VERSION {
        return Err(AppError::Database(format!(
            "newer database schema version {} is not supported by this app version",
            stored_version
        )));
    }

    for migration in MIGRATIONS {
        if stored_version < migration.version {
            (migration.run)(conn, now, is_new_install)?;
        }
    }

    write_schema_version(conn, now, crate::database::CURRENT_DB_VERSION)
}

struct Migration {
    version: i64,
    _name: &'static str,
    run: fn(&Connection, i64, bool) -> Result<(), AppError>,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 2,
        _name: "normalize legacy hotkeys and window size defaults",
        run: migrate_to_v2,
    },
    Migration {
        version: 3,
        _name: "raise packaged window size minimums",
        run: migrate_to_v3,
    },
    Migration {
        version: 4,
        _name: "preserve rich clipboard formats",
        run: migrate_to_v4,
    },
    Migration {
        version: 5,
        _name: "persist image OCR state",
        run: migrate_to_v5,
    },
    Migration {
        version: 6,
        _name: "persist clipboard source attribution",
        run: migrate_to_v6,
    },
    Migration {
        version: 7,
        _name: "persist clipboard annotations",
        run: migrate_to_v7,
    },
    Migration {
        version: 8,
        _name: "productization settings, shortcuts, window state and binary representations",
        run: migrate_to_v8,
    },
];

fn read_schema_version(conn: &Connection) -> Result<i64, AppError> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM app_config WHERE key = 'db_version'",
            [],
            |row| row.get(0),
        )
        .optional()?;

    value
        .as_deref()
        .unwrap_or("0")
        .parse::<i64>()
        .map_err(|e| AppError::Database(format!("invalid database schema version: {}", e)))
}

fn write_schema_version(conn: &Connection, now: i64, version: i64) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO app_config (key, value, updated_at)
         VALUES ('db_version', ?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        rusqlite::params![version.to_string(), now],
    )?;
    Ok(())
}

fn migrate_to_v2(conn: &Connection, now: i64, _is_new_install: bool) -> Result<(), AppError> {
    normalize_legacy_hotkey_config(conn, now)?;
    migrate_window_size_defaults(conn, now)?;
    Ok(())
}

fn migrate_to_v3(conn: &Connection, now: i64, _is_new_install: bool) -> Result<(), AppError> {
    conn.execute(
        "UPDATE app_config SET value = '560', updated_at = ?1
         WHERE key = 'window_width' AND CAST(value AS INTEGER) <= 480",
        [&now.to_string()],
    )?;
    conn.execute(
        "UPDATE app_config SET value = '760', updated_at = ?1
         WHERE key = 'window_height' AND CAST(value AS INTEGER) <= 720",
        [&now.to_string()],
    )?;
    Ok(())
}

fn migrate_to_v4(conn: &Connection, _now: i64, _is_new_install: bool) -> Result<(), AppError> {
    crate::database::schema::create_clipboard_format_table(conn)?;
    conn.execute(
        "INSERT OR IGNORE INTO clipboard_formats (item_id, format, content)
         SELECT id, 'text', content
         FROM clipboard_items
         WHERE content_type = 'text'",
        [],
    )?;
    Ok(())
}

fn migrate_to_v5(conn: &Connection, now: i64, _is_new_install: bool) -> Result<(), AppError> {
    crate::database::schema::create_clipboard_ocr_table(conn)?;
    conn.execute(
        "INSERT OR IGNORE INTO clipboard_ocr (item_id, status, text, error, updated_at)
         SELECT id, 'pending', '', NULL, ?1
         FROM clipboard_items
         WHERE content_type = 'image'",
        [now],
    )?;
    Ok(())
}

fn migrate_to_v6(conn: &Connection, _now: i64, _is_new_install: bool) -> Result<(), AppError> {
    crate::database::schema::add_clipboard_source_columns(conn)
}

fn migrate_to_v7(conn: &Connection, _now: i64, _is_new_install: bool) -> Result<(), AppError> {
    crate::database::schema::add_clipboard_annotation_columns(conn)
}

fn migrate_to_v8(conn: &Connection, now: i64, is_new_install: bool) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS shortcut_bindings (
            action_id TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
            accelerator TEXT,
            updated_at INTEGER NOT NULL,
            CHECK (enabled = 0 OR accelerator IS NOT NULL)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_shortcut_enabled_accelerator
            ON shortcut_bindings(accelerator)
            WHERE enabled = 1 AND accelerator IS NOT NULL;
        CREATE TABLE IF NOT EXISTS window_state (
            window_label TEXT PRIMARY KEY,
            width_dip INTEGER NOT NULL,
            height_dip INTEGER NOT NULL,
            x INTEGER,
            y INTEGER,
            monitor_id TEXT,
            scale_factor REAL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS binary_blobs (
            sha256 TEXT PRIMARY KEY,
            byte_length INTEGER NOT NULL,
            content BLOB NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS clipboard_item_representations (
            item_id INTEGER NOT NULL,
            blob_sha256 TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('source', 'canonical', 'thumbnail')),
            format_name TEXT NOT NULL,
            mime_type TEXT,
            width INTEGER,
            height INTEGER,
            byte_length INTEGER NOT NULL,
            priority INTEGER NOT NULL DEFAULT 0,
            metadata TEXT,
            PRIMARY KEY (item_id, role, format_name),
            FOREIGN KEY (item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE,
            FOREIGN KEY (blob_sha256) REFERENCES binary_blobs(sha256)
        );
        CREATE INDEX IF NOT EXISTS idx_clipboard_item_representations_item
            ON clipboard_item_representations(item_id, role, priority);",
    )?;

    let old_width = config_value(&tx, registry::KEY_WINDOW_WIDTH)?;
    let old_height = config_value(&tx, registry::KEY_WINDOW_HEIGHT)?;
    let toggle = config_value(&tx, registry::KEY_HOTKEY_TOGGLE_WINDOW)?
        .unwrap_or_else(|| registry::DEFAULT_TOGGLE_HOTKEY.to_string());
    insert_binding(&tx, "toggle_window", true, Some(&toggle), now)?;
    for index in 1..=9 {
        let action_id = format!("quick_paste_{}", index);
        let accelerator = format!("{}+{}", registry::DEFAULT_QUICK_PASTE_PREFIX, index);
        insert_binding(&tx, &action_id, !is_new_install, Some(&accelerator), now)?;
    }

    let (width_dip, height_dip) = if is_new_install
        || (old_width.as_deref() == Some("560") && old_height.as_deref() == Some("760"))
    {
        (680, 720)
    } else {
        (
            old_width
                .as_deref()
                .and_then(|value| value.parse::<i64>().ok())
                .unwrap_or(680),
            old_height
                .as_deref()
                .and_then(|value| value.parse::<i64>().ok())
                .unwrap_or(720),
        )
    };
    tx.execute(
        "INSERT OR IGNORE INTO window_state
         (window_label, width_dip, height_dip, x, y, monitor_id, scale_factor, updated_at)
         VALUES ('main', ?1, ?2, NULL, NULL, NULL, NULL, ?3)",
        rusqlite::params![width_dip, height_dip, now],
    )?;
    tx.execute("UPDATE app_config SET value = 'brick', updated_at = ?1 WHERE key = 'theme_family' AND value NOT IN ('ember','graphite','brick','rose')", [now])?;
    tx.execute("UPDATE app_config SET value = 'system', updated_at = ?1 WHERE key = 'theme_mode' AND value NOT IN ('light','dark','system')", [now])?;

    migrate_legacy_image_data(&tx, now)?;
    tx.commit()?;
    Ok(())
}

fn config_value(conn: &rusqlite::Transaction<'_>, key: &str) -> Result<Option<String>, AppError> {
    Ok(conn
        .query_row(
            "SELECT value FROM app_config WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()?)
}

fn insert_binding(
    conn: &rusqlite::Transaction<'_>,
    action_id: &str,
    enabled: bool,
    accelerator: Option<&str>,
    now: i64,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR IGNORE INTO shortcut_bindings (action_id, enabled, accelerator, updated_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![action_id, enabled as i64, accelerator, now],
    )?;
    Ok(())
}

fn migrate_legacy_image_data(conn: &rusqlite::Transaction<'_>, now: i64) -> Result<(), AppError> {
    let mut stmt = conn.prepare("SELECT id, content, metadata FROM clipboard_items WHERE content_type = 'image' AND content LIKE 'data:image/%'")?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);
    for (item_id, data_url, metadata) in rows {
        let Some((header, payload)) = data_url.split_once(',') else {
            continue;
        };
        let Some(bytes) = base64::engine::general_purpose::STANDARD
            .decode(payload)
            .ok()
        else {
            continue;
        };
        if bytes.len() > 128 * 1024 * 1024 {
            continue;
        }
        let Ok(decoded) = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png)
        else {
            tracing::warn!(
                "Legacy image {item_id} is not a valid PNG and was left for diagnostics"
            );
            continue;
        };
        let (width, height) = (decoded.width() as i64, decoded.height() as i64);
        let hash = format!("{:x}", Sha256::digest(&bytes));
        conn.execute("INSERT OR IGNORE INTO binary_blobs (sha256, byte_length, content, created_at) VALUES (?1, ?2, ?3, ?4)", rusqlite::params![hash, bytes.len() as i64, bytes, now])?;
        let mime = header
            .strip_prefix("data:")
            .and_then(|v| v.split(';').next())
            .unwrap_or("image/png");
        let mut representation_metadata = metadata
            .as_deref()
            .and_then(|value| serde_json::from_str::<serde_json::Value>(value).ok())
            .unwrap_or_else(|| serde_json::json!({}));
        if let Some(object) = representation_metadata.as_object_mut() {
            object.insert("legacyReencoded".into(), serde_json::Value::Bool(true));
        }
        conn.execute("INSERT OR IGNORE INTO clipboard_item_representations (item_id, blob_sha256, role, format_name, mime_type, width, height, byte_length, priority, metadata) VALUES (?1, ?2, 'canonical', 'png', ?3, ?4, ?5, ?6, 0, ?7)", rusqlite::params![item_id, hash, mime, width, height, bytes.len() as i64, representation_metadata.to_string()])?;

        let thumbnail = decoded.thumbnail(192, 192);
        let (thumbnail_width, thumbnail_height) =
            (thumbnail.width() as i64, thumbnail.height() as i64);
        let mut thumbnail_bytes = Vec::new();
        thumbnail
            .write_to(
                &mut Cursor::new(&mut thumbnail_bytes),
                image::ImageFormat::Png,
            )
            .map_err(|error| {
                AppError::Database(format!("legacy thumbnail generation failed: {error}"))
            })?;
        let thumbnail_hash = format!("{:x}", Sha256::digest(&thumbnail_bytes));
        conn.execute("INSERT OR IGNORE INTO binary_blobs (sha256, byte_length, content, created_at) VALUES (?1, ?2, ?3, ?4)", rusqlite::params![thumbnail_hash, thumbnail_bytes.len() as i64, thumbnail_bytes, now])?;
        conn.execute("INSERT OR IGNORE INTO clipboard_item_representations (item_id, blob_sha256, role, format_name, mime_type, width, height, byte_length, priority, metadata) VALUES (?1, ?2, 'thumbnail', 'png', 'image/png', ?3, ?4, ?5, 0, '{\"generated\":true,\"legacy\":true}')", rusqlite::params![item_id, thumbnail_hash, thumbnail_width, thumbnail_height, thumbnail_bytes.len() as i64])?;
    }
    Ok(())
}

fn migrate_window_size_defaults(conn: &Connection, now: i64) -> Result<(), AppError> {
    conn.execute(
        "UPDATE app_config
         SET value = '560', updated_at = ?1
         WHERE key = 'window_width' AND value IN ('400', '480')",
        [&now.to_string()],
    )?;

    conn.execute(
        "UPDATE app_config
         SET value = '760', updated_at = ?1
         WHERE key = 'window_height' AND value IN ('600', '720')",
        [&now.to_string()],
    )?;

    Ok(())
}

fn normalize_legacy_hotkey_config(conn: &Connection, now: i64) -> Result<(), AppError> {
    conn.execute(
        "UPDATE app_config
         SET value = ?1, updated_at = ?2
         WHERE key = 'hotkey_toggle_window'
           AND value = 'CommandOrControl+Shift+V'",
        [registry::DEFAULT_TOGGLE_HOTKEY, &now.to_string()],
    )?;

    conn.execute(
        "UPDATE app_config
         SET value = ?1, updated_at = ?2
         WHERE key = 'hotkey_quick_paste_prefix'
           AND value = 'CommandOrControl+Shift'",
        [registry::DEFAULT_QUICK_PASTE_PREFIX, &now.to_string()],
    )?;

    Ok(())
}
