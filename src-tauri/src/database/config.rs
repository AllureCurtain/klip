use crate::{AppError, Database};
use rusqlite::OptionalExtension;

pub fn get(db: &Database, key: &str) -> Result<Option<String>, AppError> {
    let conn = db.get_connection()?;

    let mut stmt = conn.prepare("SELECT value FROM app_config WHERE key = ?1")?;

    let result = stmt
        .query_row([key], |row| row.get::<_, String>(0))
        .optional()?;

    Ok(result)
}

pub fn get_all(db: &Database) -> Result<std::collections::HashMap<String, String>, AppError> {
    let conn = db.get_connection()?;

    let mut stmt = conn.prepare("SELECT key, value FROM app_config")?;

    let entries = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<std::collections::HashMap<String, String>, _>>()?;

    Ok(entries)
}

pub fn set(db: &Database, key: &str, value: &str) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    conn.execute(
        "INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?1, ?2, ?3)",
        [key, value, &now.to_string()],
    )?;

    Ok(())
}
