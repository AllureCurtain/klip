use crate::Database;
use rusqlite::OptionalExtension;

pub fn get(db: &Database, key: &str) -> Result<Option<String>, String> {
    let conn = db.get_connection()?;

    let mut stmt = conn
        .prepare("SELECT value FROM app_config WHERE key = ?1")
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row([key], |row| row.get::<_, String>(0))
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(result)
}

pub fn get_all(db: &Database) -> Result<std::collections::HashMap<String, String>, String> {
    let conn = db.get_connection()?;

    let mut stmt = conn
        .prepare("SELECT key, value FROM app_config")
        .map_err(|e| e.to_string())?;

    let entries = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<std::collections::HashMap<String, String>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(entries)
}

pub fn set(db: &Database, key: &str, value: &str) -> Result<(), String> {
    let conn = db.get_connection()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    conn.execute(
        "INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?1, ?2, ?3)",
        [key, value, &now.to_string()],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
