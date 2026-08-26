//! Read-only self-checks surfaced at `GET /api/diagnostics/health`.
//!
//! Three checks: SQLite integrity (`PRAGMA quick_check`), search-index
//! consistency (Tantivy documents vs. SQLite rows, via the same fingerprint
//! comparison the startup health check uses), and data-directory disk usage.
//! Everything runs inside `spawn_blocking`; the endpoint never mutates state.

use crate::database::Database;
use crate::search;
use rusqlite::OptionalExtension;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckStatus {
    Ok,
    Degraded,
    Error,
}

/// One self-check result. `summary` is a short, human-readable sentence;
/// `details` carries the machine-readable numbers.
#[derive(Debug, Clone, Serialize)]
pub struct HealthCheck {
    pub id: &'static str,
    pub label: &'static str,
    pub status: CheckStatus,
    pub summary: String,
    pub details: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct HealthReport {
    /// `ok` when every check is ok; `degraded` when at least one is degraded
    /// (non-fatal, e.g. search index unavailable — LIKE fallback still works);
    /// `error` when at least one check failed.
    pub status: String,
    pub generated_at: i64,
    pub checks: Vec<HealthCheck>,
}

pub fn run_all_checks(db: &Database, data_dir: &Path) -> HealthReport {
    let checks = vec![
        sqlite_integrity_check(db),
        search_index_consistency_check(db),
        data_dir_usage_check(data_dir),
    ];

    let status = if checks
        .iter()
        .any(|check| check.status == CheckStatus::Error)
    {
        "error"
    } else if checks
        .iter()
        .any(|check| check.status == CheckStatus::Degraded)
    {
        "degraded"
    } else {
        "ok"
    };

    HealthReport {
        status: status.to_string(),
        generated_at: crate::now_millis() as i64,
        checks,
    }
}

/// `PRAGMA quick_check` on the live connection. Returns `ok` with "ok"
/// (plus page count), or `error` listing the problems SQLite reported.
fn sqlite_integrity_check(db: &Database) -> HealthCheck {
    let result: Result<(String, Option<i64>), crate::AppError> = (|| {
        let conn = db.get_connection()?;
        let quick_check: String = conn
            .query_row("PRAGMA quick_check(1)", [], |row| row.get(0))
            .unwrap_or_else(|_| "unknown".to_string());
        let page_count: Option<i64> = conn
            .query_row("PRAGMA page_count", [], |row| row.get(0))
            .optional()?;
        Ok((quick_check, page_count))
    })();

    match result {
        Ok((quick_check, page_count)) if quick_check == "ok" => HealthCheck {
            id: "sqlite_integrity",
            label: "SQLite integrity",
            status: CheckStatus::Ok,
            summary: "Database integrity check passed".to_string(),
            details: serde_json::json!({ "quick_check": "ok", "page_count": page_count }),
        },
        Ok((problems, page_count)) => HealthCheck {
            id: "sqlite_integrity",
            label: "SQLite integrity",
            status: CheckStatus::Error,
            summary: format!("Database integrity check failed: {problems}"),
            details: serde_json::json!({ "quick_check": problems, "page_count": page_count }),
        },
        Err(error) => HealthCheck {
            id: "sqlite_integrity",
            label: "SQLite integrity",
            status: CheckStatus::Error,
            summary: format!("Could not run database integrity check: {error}"),
            details: serde_json::json!({ "error": error.to_string() }),
        },
    }
}

/// Tantivy vs. SQLite comparison through [`search::consistency_report`].
/// An unavailable index is `degraded` (SQLite LIKE fallback keeps search
/// working); mismatched fingerprints are `error`.
fn search_index_consistency_check(db: &Database) -> HealthCheck {
    let report = search::consistency_report(db);
    if !report.available {
        return HealthCheck {
            id: "search_index",
            label: "Search index consistency",
            status: CheckStatus::Degraded,
            summary: format!(
                "Search index unavailable: {}. LIKE fallback still works.",
                report.detail.as_deref().unwrap_or("unknown reason")
            ),
            details: serde_json::to_value(&report).unwrap_or(serde_json::json!({})),
        };
    }
    if report.consistent {
        HealthCheck {
            id: "search_index",
            label: "Search index consistency",
            status: CheckStatus::Ok,
            summary: format!(
                "Search index matches database ({} documents)",
                report.index_docs
            ),
            details: serde_json::to_value(&report).unwrap_or(serde_json::json!({})),
        }
    } else {
        HealthCheck {
            id: "search_index",
            label: "Search index consistency",
            status: CheckStatus::Error,
            summary: format!(
                "Search index is out of sync: {} missing, {} extra, {} changed (DB: {}, index: {})",
                report.missing_from_index.len(),
                report.extra_in_index.len(),
                report.fingerprint_mismatches.len(),
                report.database_docs,
                report.index_docs
            ),
            details: serde_json::to_value(&report).unwrap_or(serde_json::json!({})),
        }
    }
}

/// Total bytes and file count under the data directory (database, WAL,
/// search index, OCR model cache, logs).
fn data_dir_usage_check(data_dir: &Path) -> HealthCheck {
    let details = measure_directory(data_dir);
    match details {
        Ok(details) => HealthCheck {
            id: "data_dir_usage",
            label: "Data directory usage",
            status: CheckStatus::Ok,
            summary: format!(
                "Data directory uses {} across {} file(s)",
                format_bytes(details.total_bytes),
                details.file_count
            ),
            details: serde_json::to_value(details).unwrap_or(serde_json::json!({})),
        },
        Err(error) => HealthCheck {
            id: "data_dir_usage",
            label: "Data directory usage",
            status: CheckStatus::Degraded,
            summary: format!("Could not measure data directory: {error}"),
            details: serde_json::json!({ "error": error }),
        },
    }
}

#[derive(Debug, Serialize)]
struct DirectoryUsage {
    path: String,
    total_bytes: u64,
    file_count: u64,
    database_bytes: u64,
    human: String,
}

fn measure_directory(root: &Path) -> Result<DirectoryUsage, String> {
    let mut total_bytes = 0u64;
    let mut file_count = 0u64;
    let mut database_bytes = 0u64;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries =
            std::fs::read_dir(&dir).map_err(|error| format!("{}: {error}", dir.display()))?;
        for entry in entries.flatten() {
            let path = entry.path();
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if metadata.is_dir() {
                stack.push(path);
            } else if metadata.is_file() {
                total_bytes = total_bytes.saturating_add(metadata.len());
                file_count += 1;
                if path.file_name().is_some_and(|name| name == "klip.db") {
                    database_bytes = metadata.len();
                }
            }
        }
    }
    let human = format_bytes(total_bytes);
    Ok(DirectoryUsage {
        path: root.to_string_lossy().to_string(),
        total_bytes,
        file_count,
        database_bytes,
        human,
    })
}

fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    let value = bytes as f64;
    if value < KB {
        format!("{bytes} B")
    } else if value < KB * KB {
        format!("{:.1} KB", value / KB)
    } else if value < KB * KB * KB {
        format!("{:.1} MB", value / (KB * KB))
    } else {
        format!("{:.2} GB", value / (KB * KB * KB))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn test_db() -> Database {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();
        db
    }

    fn insert_text(db: &Database, content: &str) {
        let hash = format!("{:x}", Sha256::digest(content.as_bytes()));
        let item = crate::database::types::NewClipboardItem {
            content_type: crate::database::types::ContentType::Text,
            data: content.as_bytes().to_vec(),
            preview: Some(content.to_string()),
            hash,
            size: content.len() as i64,
            metadata: None,
            formats: Vec::new(),
            image_sources: Vec::new(),
        };
        crate::database::clipboard::insert(db, &item).unwrap();
    }

    #[test]
    fn healthy_database_passes_all_checks_but_index_is_unavailable_in_memory() {
        let db = test_db();
        insert_text(&db, "diagnostics smoke test");

        let integrity = sqlite_integrity_check(&db);
        assert_eq!(integrity.status, CheckStatus::Ok, "{integrity:?}");
        assert_eq!(integrity.details["quick_check"], "ok");

        // In-memory databases have no Tantivy index attached.
        let index = search_index_consistency_check(&db);
        assert_eq!(index.status, CheckStatus::Degraded, "{index:?}");
        assert!(index.summary.contains("LIKE fallback"));

        let dir = std::env::temp_dir().join(format!("klip-diag-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("klip.db"), b"not really a database").unwrap();
        let usage = data_dir_usage_check(&dir);
        assert_eq!(usage.status, CheckStatus::Ok);
        assert_eq!(usage.details["file_count"], 1);
        assert_eq!(usage.details["database_bytes"], 21);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn overall_status_is_the_worst_individual_status() {
        let dir = std::env::temp_dir().join(format!("klip-diag-worst-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let report = run_all_checks(&test_db(), &dir);
        // In-memory db: integrity ok, index degraded, usage ok → degraded.
        assert_eq!(report.status, "degraded");
        assert_eq!(report.checks.len(), 3);
        assert!(report.generated_at > 0);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
