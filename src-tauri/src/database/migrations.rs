use crate::config::registry;
use crate::AppError;
use rusqlite::{Connection, OptionalExtension};

pub fn run_pending_migrations(conn: &Connection, now: i64) -> Result<(), AppError> {
    let stored_version = read_schema_version(conn)?;
    if stored_version > crate::database::CURRENT_DB_VERSION {
        return Err(AppError::Database(format!(
            "newer database schema version {} is not supported by this app version",
            stored_version
        )));
    }

    for migration in MIGRATIONS {
        if stored_version < migration.version {
            (migration.run)(conn, now)?;
        }
    }

    write_schema_version(conn, now, crate::database::CURRENT_DB_VERSION)
}

struct Migration {
    version: i64,
    _name: &'static str,
    run: fn(&Connection, i64) -> Result<(), AppError>,
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

fn migrate_to_v2(conn: &Connection, now: i64) -> Result<(), AppError> {
    normalize_legacy_hotkey_config(conn, now)?;
    migrate_window_size_defaults(conn, now)?;
    Ok(())
}

fn migrate_to_v3(conn: &Connection, now: i64) -> Result<(), AppError> {
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
