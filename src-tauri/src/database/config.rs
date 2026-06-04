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

pub fn set_many(db: &Database, entries: &[(String, String)]) -> Result<(), AppError> {
    let mut conn = db.get_connection()?;
    let tx = conn.transaction()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    for (key, value) in entries {
        tx.execute(
            "INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![key, value, now],
        )?;
    }

    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn set_many_rolls_back_all_entries_when_one_write_fails() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE app_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL CHECK(value != 'invalid'),
                updated_at INTEGER NOT NULL
            );
            INSERT INTO app_config (key, value, updated_at) VALUES ('window_width', '560', 1);",
        )
        .unwrap();
        let db = Database::from_conn(conn);

        let result = set_many(
            &db,
            &[
                ("window_width".to_string(), "640".to_string()),
                ("window_height".to_string(), "invalid".to_string()),
            ],
        );

        assert!(result.is_err());
        assert_eq!(get(&db, "window_width").unwrap().unwrap(), "560");
        assert_eq!(get(&db, "window_height").unwrap(), None);
    }
}
