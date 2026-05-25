use crate::database::types::{Snippet, SnippetInput};
use crate::{AppError, Database};

pub fn list(db: &Database) -> Result<Vec<Snippet>, AppError> {
    let conn = db.get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, title, content, tag_id, is_favorited, created_at, updated_at
         FROM snippets
         ORDER BY is_favorited DESC, updated_at DESC",
    )?;
    let snippets = stmt
        .query_map([], snippet_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(snippets)
}

pub fn search(db: &Database, query: &str) -> Result<Vec<Snippet>, AppError> {
    let conn = db.get_connection()?;
    let pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT id, title, content, tag_id, is_favorited, created_at, updated_at
         FROM snippets
         WHERE title LIKE ?1 OR content LIKE ?1
         ORDER BY is_favorited DESC, updated_at DESC",
    )?;
    let snippets = stmt
        .query_map([pattern], snippet_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(snippets)
}

pub fn create(db: &Database, input: SnippetInput) -> Result<Snippet, AppError> {
    validate_snippet_input(&input)?;
    let conn = db.get_connection()?;
    let now = now_millis();
    conn.execute(
        "INSERT INTO snippets
         (title, content, tag_id, is_favorited, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        rusqlite::params![
            input.title.trim(),
            input.content,
            input.tag_id,
            input.is_favorited as i64,
            now,
        ],
    )?;
    let id = conn.last_insert_rowid();
    get_locked(&conn, id)
}

pub fn update(db: &Database, id: i64, input: SnippetInput) -> Result<Snippet, AppError> {
    validate_snippet_input(&input)?;
    let conn = db.get_connection()?;
    let now = now_millis();
    let changed = conn.execute(
        "UPDATE snippets
         SET title = ?1, content = ?2, tag_id = ?3, is_favorited = ?4, updated_at = ?5
         WHERE id = ?6",
        rusqlite::params![
            input.title.trim(),
            input.content,
            input.tag_id,
            input.is_favorited as i64,
            now,
            id,
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("snippet {} not found", id)));
    }
    get_locked(&conn, id)
}

pub fn delete(db: &Database, id: i64) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    conn.execute("DELETE FROM snippets WHERE id = ?1", [id])?;
    Ok(())
}

fn validate_snippet_input(input: &SnippetInput) -> Result<(), AppError> {
    if input.title.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "snippet title cannot be empty".into(),
        ));
    }
    if input.content.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "snippet content cannot be empty".into(),
        ));
    }
    Ok(())
}

fn get_locked(conn: &rusqlite::Connection, id: i64) -> Result<Snippet, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, content, tag_id, is_favorited, created_at, updated_at
         FROM snippets WHERE id = ?1",
    )?;
    stmt.query_row([id], snippet_from_row).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound(format!("snippet {} not found", id))
        }
        other => other.into(),
    })
}

fn snippet_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Snippet> {
    Ok(Snippet {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        tag_id: row.get(3)?,
        is_favorited: row.get::<_, i64>(4)? != 0,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
