//! Standalone HTTP server for curl-level API verification.
//!
//! Runs the *full* production router without the Tauri desktop shell so the
//! HTTP surface can be exercised end-to-end (curl, scripts, the web dashboard)
//! on a machine without a display. Tauri-dependent endpoints answer 500/503
//! with explicit messages; everything else — clipboard list/search, images,
//! OCR state, QA streaming, diagnostics, token auth — is fully functional.
//!
//! Usage: `cargo run --example klip_http_check --features http-check-bin -- [DATA_DIR] [PORT]`
//! Defaults: `$TEMP/klip-http-check` and `27718` (avoids clashing with a
//! desktop app on 27717).

use klip::database::Database;
use klip::http;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let data_dir = args
        .get(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("klip-http-check"));
    let port: u16 = args
        .get(2)
        .and_then(|value| value.parse().ok())
        .unwrap_or(27718);

    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("klip.db");
    eprintln!("Opening database at {}", db_path.display());
    let db = Arc::new(Database::new(&db_path)?);
    let router = http::build_standalone_router(db, data_dir.clone());

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    eprintln!(
        "klip-http-check listening on http://{addr} (data_dir={})",
        data_dir.display()
    );
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}
