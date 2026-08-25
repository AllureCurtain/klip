#![cfg_attr(test, allow(dead_code, unused_imports, unused_variables))]

mod auth;
mod diagnostics;
mod dto;
mod events;
mod images;
pub mod openapi;

use crate::config::registry::{self, RuntimeEffect};
use crate::database::StatsResponse;
use crate::database::{
    self, AdvancedSearchQuery, BackupSummary, ClipboardItem, ClipboardOcr, ContentType,
    DiagnosticsInfo, ImportSummary, RestoreSummary, Snippet, SnippetInput, SourceRule,
    SourceRuleInput, SystemInfo, Tag,
};
use crate::llm::{create_provider_from_config, LlmConfig, LlmProvider};
use crate::qa::QaContextSnapshot;
use crate::{AppError, Database};
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderValue, Method, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, patch, post, put};
use axum::{Json, Router};
use futures_util::{stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
#[cfg(not(test))]
use tauri::{Emitter, Listener};
use tower_http::cors::{AllowOrigin, CorsLayer};

use dto::ClipboardItemDto;

pub use diagnostics::{HealthCheck, HealthReport};
pub use events::{EventBroadcaster, ServerEvent};
pub use openapi::build_openapi;

const DEFAULT_PORT: u16 = 27717;
const ENV_PORT: &str = "KLIP_HTTP_PORT";

#[cfg(not(test))]
type RuntimeAppHandle = tauri::AppHandle;
#[cfg(test)]
type RuntimeAppHandle = ();

#[derive(Clone)]
struct AppState {
    db: Arc<Database>,
    app: Option<RuntimeAppHandle>,
    data_dir: PathBuf,
    broadcaster: EventBroadcaster,
}

#[cfg(not(test))]
pub fn start_server(app: tauri::AppHandle) -> Result<(), AppError> {
    let db_path = database::get_db_path(&app)?;
    let data_dir = database::app_data_dir(&app)?;
    let db = Arc::new(Database::new(&db_path)?);
    let broadcaster = EventBroadcaster::new();
    attach_event_forwarding(&app, broadcaster.clone());
    spawn_server(db, Some(app), data_dir, broadcaster)
}

#[cfg(not(test))]
fn spawn_server(
    db: Arc<Database>,
    app: Option<RuntimeAppHandle>,
    data_dir: PathBuf,
    broadcaster: EventBroadcaster,
) -> Result<(), AppError> {
    let port = std::env::var(ENV_PORT)
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(DEFAULT_PORT);
    let router = build_router(db, app, data_dir, broadcaster);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    std::thread::Builder::new()
        .name("klip-http-server".to_string())
        .spawn(move || {
            let runtime = match tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .worker_threads(2)
                .thread_name("klip-http-worker")
                .build()
            {
                Ok(runtime) => runtime,
                Err(error) => {
                    tracing::error!("failed to build HTTP runtime: {}", error);
                    return;
                }
            };

            runtime.block_on(async move {
                let listener = match tokio::net::TcpListener::bind(addr).await {
                    Ok(listener) => listener,
                    Err(error) => {
                        tracing::error!("failed to bind HTTP server to {}: {}", addr, error);
                        return;
                    }
                };
                tracing::info!("HTTP API listening on http://{}", addr);
                if let Err(error) = axum::serve(listener, router).await {
                    tracing::error!("HTTP server stopped with error: {}", error);
                }
            });
        })
        .map_err(|error| AppError::System(format!("failed to spawn HTTP server: {error}")))?;

    Ok(())
}

#[cfg(not(test))]
fn attach_event_forwarding(app: &tauri::AppHandle, broadcaster: EventBroadcaster) {
    let clipboard_broadcaster = broadcaster.clone();
    app.listen("clipboard-updated", move |event| {
        let payload = serde_json::from_str::<serde_json::Value>(event.payload())
            .unwrap_or(serde_json::Value::Null);
        clipboard_broadcaster.send(ServerEvent::ClipboardUpdated(payload));
    });

    let clear_broadcaster = broadcaster.clone();
    app.listen("clipboard-cleared", move |_| {
        clear_broadcaster.send(ServerEvent::ClipboardCleared);
    });

    let config_broadcaster = broadcaster.clone();
    app.listen("config-changed", move |event| {
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
            let key = payload
                .get("key")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string();
            let value = payload
                .get("value")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string();
            config_broadcaster.send(ServerEvent::ConfigChanged { key, value });
        }
    });

    // OCR completion (and any other item refresh) is broadcast so web clients
    // can update OCR status without polling.
    let item_broadcaster = broadcaster.clone();
    app.listen(crate::ocr::ITEM_UPDATED_EVENT, move |event| {
        let payload = serde_json::from_str::<serde_json::Value>(event.payload())
            .unwrap_or(serde_json::Value::Null);
        item_broadcaster.send(ServerEvent::ClipboardItemUpdated(payload));
    });
}

/// Build the full production router without a Tauri application.
/// Tauri-dependent endpoints (paste, window controls, OCR trigger) answer
/// 500/503 in that mode; everything else works for real. Powers the
/// `klip_http_check` standalone binary used for curl-level verification.
#[cfg(not(test))]
pub fn build_standalone_router(db: Arc<Database>, data_dir: PathBuf) -> Router {
    build_router(db, None, data_dir, EventBroadcaster::new())
}

#[cfg(not(test))]
fn build_router(
    db: Arc<Database>,
    app: Option<RuntimeAppHandle>,
    data_dir: PathBuf,
    broadcaster: EventBroadcaster,
) -> Router {
    let state = AppState {
        db,
        app,
        data_dir,
        broadcaster,
    };

    Router::new()
        .route("/api/health", get(health))
        .route("/api/openapi.json", get(openapi_json_handler))
        .route("/openapi.json", get(openapi_json_handler))
        .route("/api/events", get(sse_events))
        .route("/api/stats", get(get_stats))
        .route(
            "/api/clipboard",
            get(list_clipboard).delete(clear_clipboard),
        )
        .merge(search_routes())
        .route("/api/clipboard/batch-delete", post(batch_delete))
        .route("/api/clipboard/batch-favorite", post(batch_favorite))
        .route("/api/clipboard/rescan-sensitive", post(rescan_sensitive))
        .route(
            "/api/clipboard/:id",
            get(get_clipboard).delete(delete_clipboard),
        )
        .route("/api/clipboard/:id/image", get(get_clipboard_image))
        .route("/api/clipboard/:id/thumbnail", get(get_clipboard_thumbnail))
        .route("/api/clipboard/:id/ocr", get(get_ocr).post(trigger_ocr))
        .route("/api/clipboard/:id/favorite", post(toggle_favorite))
        .route("/api/clipboard/:id/copy", post(copy_clipboard))
        .route("/api/clipboard/:id/paste", post(paste_clipboard))
        .route(
            "/api/clipboard/:id/tags/:tag_id",
            post(assign_tag).delete(remove_tag),
        )
        .route("/api/tags", get(list_tags).post(create_tag))
        .route("/api/tags/:id", delete(delete_tag))
        .route("/api/snippets", get(list_snippets).post(create_snippet))
        .route("/api/snippets/search", get(search_snippets))
        .route(
            "/api/snippets/:id",
            put(update_snippet).delete(delete_snippet),
        )
        .route(
            "/api/source-rules",
            get(list_source_rules).post(create_source_rule),
        )
        .route(
            "/api/source-rules/:id",
            put(update_source_rule).delete(delete_source_rule),
        )
        .route(
            "/api/source-rules/:id/enabled",
            patch(set_source_rule_enabled).put(set_source_rule_enabled),
        )
        .route("/api/config", get(get_all_config).put(set_config_many))
        .route("/api/config/:key", get(get_config).put(set_config))
        .route("/api/window/toggle", post(toggle_window))
        .route("/api/window/show", post(show_window))
        .route("/api/window/hide", post(hide_window))
        .route("/api/window/status", get(window_status))
        .route("/api/autostart", get(get_autostart).put(set_autostart))
        .route("/api/system/info", get(system_info))
        .route("/api/system/diagnostics", get(diagnostics_info))
        .route("/api/diagnostics/health", get(diagnostics_health))
        .route("/api/export/json", post(export_json))
        .route("/api/export/csv", post(export_csv))
        .route("/api/import/json", post(import_json))
        .route("/api/import/csv", post(import_csv))
        .route("/api/backup", post(backup_database))
        .route("/api/restore", post(restore_database))
        .route("/api/qa/ask", post(qa_ask))
        .route("/api/ask", post(qa_ask))
        .route("/api/qa/ask/stream", post(qa_ask_stream))
        .fallback(fallback_404)
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth::require_access_token,
        ))
        .layer(cors_layer())
        .with_state(state)
}

#[cfg(not(test))]
fn search_routes() -> Router<AppState> {
    Router::new()
        .route("/api/clipboard/search", get(search_clipboard))
        .route("/api/clipboard/search/advanced", post(advanced_search))
}

#[cfg(test)]
fn build_router_for_test(
    db: Arc<Database>,
    app: Option<RuntimeAppHandle>,
    data_dir: PathBuf,
    broadcaster: EventBroadcaster,
) -> Router {
    let state = AppState {
        db,
        app,
        data_dir,
        broadcaster,
    };

    Router::new()
        .route("/api/health", get(health))
        .route("/api/openapi.json", get(openapi_json_handler))
        .route("/openapi.json", get(openapi_json_handler))
        .route("/api/events", get(sse_events))
        .route("/api/stats", get(get_stats))
        .route("/api/clipboard", get(list_clipboard))
        .route("/api/clipboard/search/advanced", post(advanced_search))
        .route("/api/clipboard/:id", get(get_clipboard))
        .route("/api/clipboard/:id/image", get(get_clipboard_image))
        .route("/api/clipboard/:id/thumbnail", get(get_clipboard_thumbnail))
        .route("/api/clipboard/:id/ocr", get(get_ocr).post(trigger_ocr))
        .route("/api/diagnostics/health", get(diagnostics_health))
        .route("/api/qa/ask", post(qa_ask))
        .route("/api/ask", post(qa_ask))
        .route("/api/qa/ask/stream", post(qa_ask_stream))
        .fallback(fallback_404)
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth::require_access_token,
        ))
        .layer(cors_layer())
        .with_state(state)
}

fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin, _| {
            is_allowed_cors_origin(origin)
        }))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([header::CONTENT_TYPE])
}

fn is_allowed_cors_origin(origin: &HeaderValue) -> bool {
    let Ok(origin) = origin.to_str() else {
        return false;
    };
    let origin = origin.to_ascii_lowercase();

    origin == "tauri://localhost"
        || is_tauri_http_origin(&origin)
        || is_loopback_http_origin(&origin)
}

fn is_tauri_http_origin(origin: &str) -> bool {
    origin_host(origin, &["http://", "https://"]) == Some("tauri.localhost")
}

fn is_loopback_http_origin(origin: &str) -> bool {
    matches!(
        origin_host(origin, &["http://", "https://"]),
        Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
    )
}

fn origin_host<'a>(origin: &'a str, schemes: &[&str]) -> Option<&'a str> {
    let rest = schemes
        .iter()
        .find_map(|scheme| origin.strip_prefix(scheme))?;
    let authority = rest.split('/').next().unwrap_or(rest);
    Some(host_from_authority(authority))
}

fn host_from_authority(authority: &str) -> &str {
    if authority.starts_with('[') {
        authority
            .find(']')
            .map(|index| &authority[..=index])
            .unwrap_or(authority)
    } else {
        authority.split(':').next().unwrap_or(authority)
    }
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn openapi_json_handler() -> Json<serde_json::Value> {
    Json(build_openapi())
}

async fn get_stats(State(state): State<AppState>) -> ApiResult<StatsResponse> {
    let mut stats = json_result(database::clipboard::get_stats(&state.db))?;
    let db_path = state.data_dir.join("klip.db");
    if let Ok(metadata) = std::fs::metadata(db_path) {
        stats.0.db_size_bytes = metadata.len();
    }
    Ok(stats)
}

async fn fallback_404() -> ApiError {
    ApiError(AppError::NotFound("HTTP route not found".to_string()))
}

type ApiResult<T> = Result<Json<T>, ApiError>;

#[derive(Debug)]
struct ApiError(AppError);

impl From<AppError> for ApiError {
    fn from(error: AppError) -> Self {
        Self(error)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match &self.0 {
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::InvalidInput(_) => StatusCode::BAD_REQUEST,
            AppError::Llm(_) => StatusCode::BAD_GATEWAY,
            AppError::Unavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (
            status,
            Json(serde_json::json!({
                "error": self.0.code(),
                "message": self.0.to_string(),
            })),
        )
            .into_response()
    }
}

fn json_result<T: Serialize>(result: Result<T, AppError>) -> ApiResult<T> {
    result.map(Json).map_err(ApiError)
}

#[cfg(not(test))]
fn app_required(state: &AppState, operation: &str) -> Result<RuntimeAppHandle, AppError> {
    state.app.clone().ok_or_else(|| {
        AppError::Unavailable(format!(
            "{operation} requires a running Klip desktop application"
        ))
    })
}

async fn sse_events(
    State(state): State<AppState>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>> {
    let receiver = state.broadcaster.subscribe();
    let stream = stream::unfold(receiver, |mut receiver| async move {
        loop {
            match receiver.recv().await {
                Ok(event) => {
                    let sse_event = Event::default()
                        .event(event.event_name())
                        .data(serde_json::to_string(&event).unwrap_or_default());
                    return Some((Ok(sse_event), receiver));
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(missed)) => {
                    tracing::warn!("SSE client lagged and missed {} event(s)", missed);
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => return None,
            }
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    limit: Option<i64>,
    offset: Option<i64>,
    #[serde(alias = "contentType")]
    content_type: Option<String>,
    #[serde(alias = "favoriteOnly")]
    favorite_only: Option<bool>,
    #[serde(alias = "tagId")]
    tag_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: String,
    limit: Option<i64>,
    offset: Option<i64>,
    #[serde(alias = "contentType")]
    content_type: Option<String>,
    #[serde(alias = "favoriteOnly")]
    favorite_only: Option<bool>,
    #[serde(alias = "tagId")]
    tag_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct IdsBody {
    ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
struct FavoriteBody {
    ids: Vec<i64>,
    #[serde(alias = "isFavorited")]
    is_favorited: bool,
}

#[derive(Debug, Deserialize)]
struct TagBody {
    name: String,
    color: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EnabledBody {
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct PathBody {
    path: String,
}

#[derive(Debug, Deserialize)]
struct ConfigEntryBody {
    key: String,
    value: String,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ConfigManyBody {
    Entries { entries: Vec<ConfigEntryBody> },
    Map(std::collections::HashMap<String, String>),
}

#[derive(Debug, Deserialize)]
struct ValueBody {
    value: String,
}

#[derive(Debug, Deserialize)]
struct QaAskBody {
    question: String,
}

#[derive(Debug, Serialize)]
struct CountResponse {
    count: usize,
}

async fn list_clipboard(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> ApiResult<Vec<ClipboardItemDto>> {
    json_result(
        database::productization::get_list_filtered(
            &state.db,
            query.limit.unwrap_or(100),
            query.offset.unwrap_or(0),
            query.content_type.as_deref(),
            query.favorite_only.unwrap_or(false),
            query.tag_id,
        )
        .map(|items| items.into_iter().map(ClipboardItemDto::from).collect()),
    )
}

async fn search_clipboard(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> ApiResult<Vec<ClipboardItemDto>> {
    json_result(
        database::productization::search_filtered(
            &state.db,
            &query.q,
            query.content_type.as_deref(),
            query.favorite_only.unwrap_or(false),
            query.tag_id,
            query.limit.unwrap_or(100),
            query.offset.unwrap_or(0),
        )
        .map(|items| items.into_iter().map(ClipboardItemDto::from).collect()),
    )
}

async fn advanced_search(
    State(state): State<AppState>,
    Json(body): Json<AdvancedSearchQuery>,
) -> ApiResult<Vec<ClipboardItemDto>> {
    json_result(
        database::productization::search_advanced(&state.db, body)
            .map(|items| items.into_iter().map(ClipboardItemDto::from).collect()),
    )
}

async fn get_clipboard(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> ApiResult<ClipboardItemDto> {
    json_result(
        database::clipboard::get_by_id(&state.db, id)?
            .ok_or_else(|| AppError::NotFound(format!("clipboard item {id} not found")))
            .map(ClipboardItemDto::from),
    )
}

async fn delete_clipboard(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<()> {
    json_result(database::clipboard::delete(&state.db, id).map(|()| {
        // Best-effort: drop any cached thumbnails for the deleted item.
        images::invalidate(&state.data_dir, id);
    }))
}

const IMAGE_CACHE_CONTROL: &str = "private, max-age=31536000, immutable";

#[derive(Debug, Deserialize)]
struct ThumbnailQuery {
    #[serde(default)]
    max: Option<u32>,
}

/// Full-size PNG for an image item, decoded from its stored data URL.
/// Content is addressed by the item hash, so ETag/If-None-Match lets repeat
/// views skip the payload entirely (304).
async fn get_clipboard_image(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: axum::http::HeaderMap,
) -> Result<Response, ApiError> {
    let item = image_item_or_error(&state, id)?;
    let etag = format!("\"{}\"", item.hash);
    if etag_matches(&headers, &etag) {
        return Ok(not_modified(etag));
    }
    let bytes = images::decode_png_data_url(&item.content).map_err(ApiError)?;
    Ok(png_response(bytes, Some(etag), None))
}

/// Thumbnail rendition for list views: longest side clamped by
/// `images::DEFAULT_THUMBNAIL_MAX_EDGE` (512px). Generated once and cached on
/// disk under `<data_dir>/thumbnails/` so list scrolling does not re-encode
/// images on every request; `x-klip-thumbnail-cache` exposes hit/miss for
/// diagnostics.
async fn get_clipboard_thumbnail(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: axum::http::HeaderMap,
    Query(query): Query<ThumbnailQuery>,
) -> Result<Response, ApiError> {
    let item = image_item_or_error(&state, id)?;
    let max_edge = images::clamp_max_edge(query.max);
    let original_hash = item.hash.clone();
    let etag = format!("\"{original_hash}-{max_edge}\"");
    if etag_matches(&headers, &etag) {
        return Ok(not_modified(etag));
    }
    let bytes = images::decode_png_data_url(&item.content).map_err(ApiError)?;
    let cache_root = state.data_dir.clone();
    // Encoding off the async runtime; disk cache keeps repeat requests cheap.
    let generated = tokio::task::spawn_blocking(move || {
        images::thumbnail(&cache_root, id, &original_hash, &bytes, max_edge)
    })
    .await
    .map_err(|error| ApiError(AppError::System(format!("thumbnail task failed: {error}"))))??;
    let (thumbnail, cached) = generated;
    Ok(png_response(
        thumbnail,
        Some(etag),
        Some(if cached { "hit" } else { "miss" }),
    ))
}

fn etag_matches(headers: &axum::http::HeaderMap, etag: &str) -> bool {
    headers
        .get(header::IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|candidate| candidate == etag)
}

fn not_modified(etag: String) -> Response {
    (
        StatusCode::NOT_MODIFIED,
        [(header::ETAG, HeaderValue::from_str(&etag).unwrap())],
    )
        .into_response()
}

fn png_response(bytes: Vec<u8>, etag: Option<String>, thumbnail_cache: Option<&str>) -> Response {
    let mut response = bytes.into_response();
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static("image/png"));
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(IMAGE_CACHE_CONTROL),
    );
    if let Some(etag) = etag {
        if let Ok(value) = HeaderValue::from_str(&etag) {
            response.headers_mut().insert(header::ETAG, value);
        }
    }
    if let Some(state) = thumbnail_cache {
        let name = axum::http::HeaderName::from_static("x-klip-thumbnail-cache");
        if let Ok(value) = HeaderValue::from_str(state) {
            response.headers_mut().insert(name, value);
        }
    }
    response
}

fn image_item_or_error(state: &AppState, id: i64) -> Result<ClipboardItem, ApiError> {
    let item = database::clipboard::get_by_id(&state.db, id)
        .map_err(ApiError)?
        .ok_or_else(|| {
            ApiError::from(AppError::NotFound(format!("clipboard item {id} not found")))
        })?;
    if item.content_type != ContentType::Image {
        return Err(ApiError(AppError::InvalidInput(format!(
            "clipboard item {id} is not an image"
        ))));
    }
    Ok(item)
}

/// Current OCR state for an image item (pending / completed / failed).
async fn get_ocr(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<ClipboardOcr> {
    // 404 first when the item does not exist at all.
    let item = database::clipboard::get_by_id(&state.db, id)
        .map_err(ApiError)?
        .ok_or_else(|| {
            ApiError::from(AppError::NotFound(format!("clipboard item {id} not found")))
        })?;
    if item.content_type != ContentType::Image {
        return Err(ApiError(AppError::InvalidInput(format!(
            "clipboard item {id} is not an image"
        ))));
    }
    json_result(
        database::ocr::get(&state.db, id)?
            .ok_or_else(|| AppError::NotFound(format!("no OCR state recorded for item {id}"))),
    )
}

/// Ask the desktop OCR worker to (re)recognize an image item. Without a
/// running Tauri application the worker is unreachable: answer 503 with an
/// explicit message instead of pretending the job was accepted.
async fn trigger_ocr(State(state): State<AppState>, Path(id): Path<i64>) -> Response {
    let item = match image_item_or_error(&state, id) {
        Ok(item) => item,
        Err(error) => return error.into_response(),
    };
    // The desktop worker is only reachable inside the Tauri app; outside it
    // (standalone server, tests) answer 503 instead of pretending success.
    #[cfg(not(test))]
    {
        let Some(app) = state.app.as_ref() else {
            return ocr_unavailable_response();
        };
        if let Err(error) = enqueue_ocr(app, id) {
            return ApiError(error).into_response();
        }
    }
    #[cfg(test)]
    if state.app.is_none() {
        return ocr_unavailable_response();
    }

    let requeued = match database::ocr::requeue(&state.db, id) {
        Ok(requeued) => requeued,
        Err(error) => return ApiError(error).into_response(),
    };
    if requeued {
        tracing::info!("OCR re-queued for item {id} via HTTP");
    }
    match database::ocr::get(&state.db, id) {
        Ok(Some(ocr)) => Json(ocr).into_response(),
        Ok(None) => ApiError(AppError::System(format!(
            "OCR state for item {} vanished after requeue",
            item.id
        )))
        .into_response(),
        Err(error) => ApiError(error).into_response(),
    }
}

fn ocr_unavailable_response() -> Response {
    (
        axum::http::StatusCode::SERVICE_UNAVAILABLE,
        Json(serde_json::json!({
            "error": "ocr_unavailable",
            "message": "OCR requires the Klip desktop application to be running",
        })),
    )
        .into_response()
}

#[cfg(not(test))]
fn enqueue_ocr(app: &tauri::AppHandle, item_id: i64) -> Result<(), AppError> {
    use tauri::Manager;
    app.state::<crate::ocr::OcrService>()
        .enqueue(item_id)
        .map_err(|error| AppError::System(format!("failed to enqueue OCR job: {error}")))
}

async fn clear_clipboard(State(state): State<AppState>) -> ApiResult<()> {
    let result = database::clipboard::clear(&state.db);
    if result.is_ok() {
        emit_clipboard_cleared(&state);
        // Best-effort: the thumbnail cache is derived data, drop it all.
        images::clear_cache(&state.data_dir);
    }
    json_result(result)
}

fn emit_clipboard_cleared(state: &AppState) {
    #[cfg(not(test))]
    if let Some(app) = &state.app {
        let _ = app.emit("clipboard-cleared", ());
        return;
    }
    state.broadcaster.send(ServerEvent::ClipboardCleared);
}

async fn batch_delete(
    State(state): State<AppState>,
    Json(body): Json<IdsBody>,
) -> ApiResult<CountResponse> {
    json_result(
        database::productization::batch_delete(&state.db, &body.ids).map(|count| {
            // Best-effort: drop cached thumbnails for every deleted item.
            for id in &body.ids {
                images::invalidate(&state.data_dir, *id);
            }
            CountResponse { count }
        }),
    )
}

async fn batch_favorite(
    State(state): State<AppState>,
    Json(body): Json<FavoriteBody>,
) -> ApiResult<CountResponse> {
    json_result(
        database::productization::batch_set_favorite(&state.db, &body.ids, body.is_favorited)
            .map(|count| CountResponse { count }),
    )
}

async fn toggle_favorite(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> ApiResult<ClipboardItem> {
    json_result(database::clipboard::toggle_favorite(&state.db, id))
}

async fn copy_clipboard(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<()> {
    json_result(crate::clipboard::paste::copy_item_by_id(&state.db, id))
}

#[cfg(not(test))]
async fn paste_clipboard(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<()> {
    let app = app_required(&state, "paste")?;
    json_result(crate::clipboard::paste::paste_item_by_id(
        &app, &state.db, id,
    ))
}

async fn assign_tag(
    State(state): State<AppState>,
    Path((id, tag_id)): Path<(i64, i64)>,
) -> ApiResult<()> {
    json_result(database::productization::assign_tag(&state.db, id, tag_id))
}

async fn remove_tag(
    State(state): State<AppState>,
    Path((id, tag_id)): Path<(i64, i64)>,
) -> ApiResult<()> {
    json_result(database::productization::remove_tag(&state.db, id, tag_id))
}

async fn rescan_sensitive(State(state): State<AppState>) -> ApiResult<CountResponse> {
    json_result(
        database::productization::rescan_sensitive(&state.db).map(|count| CountResponse { count }),
    )
}

async fn list_tags(State(state): State<AppState>) -> ApiResult<Vec<Tag>> {
    json_result(database::productization::list_tags(&state.db))
}

async fn create_tag(State(state): State<AppState>, Json(body): Json<TagBody>) -> ApiResult<Tag> {
    json_result(database::productization::create_tag(
        &state.db,
        &body.name,
        body.color.as_deref(),
    ))
}

async fn delete_tag(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<()> {
    json_result(database::productization::delete_tag(&state.db, id))
}

async fn list_snippets(State(state): State<AppState>) -> ApiResult<Vec<Snippet>> {
    json_result(database::snippets::list(&state.db))
}

async fn search_snippets(
    State(state): State<AppState>,
    Query(query): Query<std::collections::HashMap<String, String>>,
) -> ApiResult<Vec<Snippet>> {
    let q = query.get("q").map(String::as_str).unwrap_or_default();
    json_result(database::snippets::search(&state.db, q))
}

async fn create_snippet(
    State(state): State<AppState>,
    Json(body): Json<SnippetInput>,
) -> ApiResult<Snippet> {
    json_result(database::snippets::create(&state.db, body))
}

async fn update_snippet(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<SnippetInput>,
) -> ApiResult<Snippet> {
    json_result(database::snippets::update(&state.db, id, body))
}

async fn delete_snippet(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<()> {
    json_result(database::snippets::delete(&state.db, id))
}

async fn list_source_rules(State(state): State<AppState>) -> ApiResult<Vec<SourceRule>> {
    json_result(database::productization::list_source_rules(&state.db))
}

async fn create_source_rule(
    State(state): State<AppState>,
    Json(body): Json<SourceRuleInput>,
) -> ApiResult<SourceRule> {
    json_result(database::productization::create_source_rule(
        &state.db, body,
    ))
}

async fn update_source_rule(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<SourceRuleInput>,
) -> ApiResult<SourceRule> {
    json_result(database::productization::update_source_rule(
        &state.db, id, body,
    ))
}

async fn set_source_rule_enabled(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<EnabledBody>,
) -> ApiResult<SourceRule> {
    json_result(database::productization::set_source_rule_enabled(
        &state.db,
        id,
        body.enabled,
    ))
}

async fn delete_source_rule(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<()> {
    json_result(database::productization::delete_source_rule(&state.db, id))
}

async fn get_all_config(
    State(state): State<AppState>,
) -> ApiResult<std::collections::HashMap<String, String>> {
    json_result(database::config::get_all(&state.db))
}

async fn get_config(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> ApiResult<Option<String>> {
    json_result(database::config::get(&state.db, &key))
}

async fn set_config(
    State(state): State<AppState>,
    Path(key): Path<String>,
    Json(body): Json<ValueBody>,
) -> ApiResult<()> {
    json_result(apply_config_value(&state, &key, &body.value))
}

async fn set_config_many(
    State(state): State<AppState>,
    Json(body): Json<ConfigManyBody>,
) -> ApiResult<()> {
    let entries = match body {
        ConfigManyBody::Entries { entries } => entries
            .into_iter()
            .map(|entry| (entry.key, entry.value))
            .collect::<Vec<_>>(),
        ConfigManyBody::Map(map) => map.into_iter().collect::<Vec<_>>(),
    };
    json_result(apply_config_values(&state, entries))
}

fn apply_config_value(state: &AppState, key: &str, value: &str) -> Result<(), AppError> {
    let descriptor = registry::require_descriptor(key)?;
    let normalized = descriptor.normalize(value)?;
    database::config::set(&state.db, key, &normalized)?;
    apply_runtime_effect(state, descriptor.effect)?;
    emit_config_changed(state, key, &normalized);
    Ok(())
}

fn apply_config_values(state: &AppState, entries: Vec<(String, String)>) -> Result<(), AppError> {
    let normalized = entries
        .into_iter()
        .map(|(key, value)| {
            let descriptor = registry::require_descriptor(&key)?;
            let normalized = descriptor.normalize(&value)?;
            Ok((descriptor.effect, key, normalized))
        })
        .collect::<Result<Vec<_>, AppError>>()?;
    let persisted = normalized
        .iter()
        .map(|(_, key, value)| (key.clone(), value.clone()))
        .collect::<Vec<_>>();

    database::config::set_many(&state.db, &persisted)?;

    if normalized
        .iter()
        .any(|(effect, _, _)| *effect == RuntimeEffect::WindowSize)
    {
        apply_runtime_effect(state, RuntimeEffect::WindowSize)?;
    }
    if normalized
        .iter()
        .any(|(effect, _, _)| *effect == RuntimeEffect::HotkeyReload)
    {
        apply_runtime_effect(state, RuntimeEffect::HotkeyReload)?;
    }
    for (_, key, value) in normalized {
        emit_config_changed(state, &key, &value);
    }
    Ok(())
}

fn apply_runtime_effect(state: &AppState, effect: RuntimeEffect) -> Result<(), AppError> {
    match effect {
        RuntimeEffect::None => Ok(()),
        RuntimeEffect::WindowSize => {
            #[cfg(not(test))]
            if let Some(app) = &state.app {
                crate::window::controller::apply_configured_size(app, &state.db)?;
            }
            Ok(())
        }
        RuntimeEffect::HotkeyReload => {
            #[cfg(not(test))]
            if let Some(app) = &state.app {
                crate::hotkey::manager::reload_hotkeys(app)
                    .map_err(|error| AppError::Hotkey(error.to_string()))?;
            }
            Ok(())
        }
    }
}

fn emit_config_changed(state: &AppState, key: &str, value: &str) {
    #[cfg(not(test))]
    if let Some(app) = &state.app {
        let _ = app.emit(
            "config-changed",
            serde_json::json!({ "key": key, "value": value }),
        );
        return;
    }
    state.broadcaster.send(ServerEvent::ConfigChanged {
        key: key.to_string(),
        value: value.to_string(),
    });
}

#[cfg(not(test))]
async fn toggle_window(State(state): State<AppState>) -> ApiResult<()> {
    let app = app_required(&state, "window control")?;
    json_result(crate::window::controller::toggle_main_window(&app))
}

#[cfg(not(test))]
async fn show_window(State(state): State<AppState>) -> ApiResult<()> {
    let app = app_required(&state, "window control")?;
    json_result(crate::window::controller::show_main_window_and_focus(&app))
}

#[cfg(not(test))]
async fn hide_window(State(state): State<AppState>) -> ApiResult<()> {
    let app = app_required(&state, "window control")?;
    json_result(crate::window::controller::hide_main_window(&app))
}

/// Read-only snapshot of the main window (visibility, position, size).
/// Sits beside the show/hide/toggle controls without mutating anything.
#[cfg(not(test))]
async fn window_status(
    State(state): State<AppState>,
) -> ApiResult<crate::window::controller::WindowStatus> {
    let app = app_required(&state, "window status")?;
    json_result(crate::window::controller::main_window_status(&app))
}

#[cfg(not(test))]
async fn get_autostart(State(state): State<AppState>) -> ApiResult<bool> {
    let app = app_required(&state, "autostart")?;
    json_result(is_autostart_enabled(&app))
}

#[cfg(not(test))]
async fn set_autostart(
    State(state): State<AppState>,
    Json(body): Json<EnabledBody>,
) -> ApiResult<()> {
    let app = app_required(&state, "autostart")?;
    let result = set_autostart_enabled(&app, body.enabled).and_then(|_| {
        let value = if body.enabled { "true" } else { "false" };
        database::config::set(&state.db, registry::KEY_AUTO_START, value)?;
        emit_config_changed(&state, registry::KEY_AUTO_START, value);
        Ok(())
    });
    json_result(result)
}

#[cfg(all(not(test), target_os = "linux"))]
fn is_autostart_enabled(_app: &tauri::AppHandle) -> Result<bool, AppError> {
    crate::platform::linux::is_autostart_enabled()
}

#[cfg(all(not(test), not(target_os = "linux")))]
fn is_autostart_enabled(app: &tauri::AppHandle) -> Result<bool, AppError> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|error| AppError::System(error.to_string()))
}

#[cfg(all(not(test), target_os = "linux"))]
fn set_autostart_enabled(_app: &tauri::AppHandle, enabled: bool) -> Result<(), AppError> {
    let exe = std::env::current_exe()
        .map_err(|error| AppError::System(format!("failed to resolve current exe: {error}")))?;
    crate::platform::linux::set_autostart(enabled, &exe)
}

#[cfg(all(not(test), not(target_os = "linux")))]
fn set_autostart_enabled(app: &tauri::AppHandle, enabled: bool) -> Result<(), AppError> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    if enabled {
        manager
            .enable()
            .map_err(|error| AppError::System(format!("failed to enable autostart: {error}")))
    } else {
        manager
            .disable()
            .map_err(|error| AppError::System(format!("failed to disable autostart: {error}")))
    }
}

async fn system_info() -> ApiResult<SystemInfo> {
    json_result(Ok(build_system_info()))
}

/// Read-only self-check report (SQLite integrity, search-index consistency,
/// data-directory usage). Runs blocking work off the async runtime.
async fn diagnostics_health(State(state): State<AppState>) -> ApiResult<HealthReport> {
    let db = state.db.clone();
    let data_dir = state.data_dir.clone();
    json_result(
        tokio::task::spawn_blocking(move || diagnostics::run_all_checks(&db, &data_dir))
            .await
            .map_err(|error| AppError::System(format!("diagnostics task failed: {error}"))),
    )
}

async fn diagnostics_info(State(state): State<AppState>) -> ApiResult<DiagnosticsInfo> {
    let db_path = state.data_dir.join("klip.db");
    #[cfg(target_os = "linux")]
    let log_dir = crate::platform::linux::log_dir();
    #[cfg(not(target_os = "linux"))]
    let log_dir = state.data_dir.join("logs");

    json_result(Ok(DiagnosticsInfo {
        platform: platform_name().to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        data_dir: state.data_dir.to_string_lossy().to_string(),
        db_path: db_path.to_string_lossy().to_string(),
        log_dir: log_dir.to_string_lossy().to_string(),
    }))
}

fn build_system_info() -> SystemInfo {
    SystemInfo {
        platform: platform_name().to_string(),
        version: platform_system_version(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

fn platform_system_version() -> String {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "ver"])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "windows".to_string())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|value| format!("macOS {}", value.trim()))
            .unwrap_or_else(|| "macos".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        std::fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|content| {
                content
                    .lines()
                    .find_map(|line| line.strip_prefix("PRETTY_NAME="))
                    .map(|value| value.trim_matches('"').to_string())
            })
            .unwrap_or_else(|| "linux".to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        "unknown".to_string()
    }
}

async fn export_json(
    State(state): State<AppState>,
    Json(body): Json<PathBody>,
) -> ApiResult<BackupSummary> {
    let db = state.db.clone();
    json_result(
        tokio::task::spawn_blocking(move || {
            database::data_portability::export_json(&db, &body.path)
        })
        .await
        .map_err(|error| AppError::System(format!("export task failed: {error}")))?,
    )
}

async fn export_csv(
    State(state): State<AppState>,
    Json(body): Json<PathBody>,
) -> ApiResult<BackupSummary> {
    let db = state.db.clone();
    json_result(
        tokio::task::spawn_blocking(move || {
            database::data_portability::export_csv(&db, &body.path)
        })
        .await
        .map_err(|error| AppError::System(format!("export task failed: {error}")))?,
    )
}

async fn import_json(
    State(state): State<AppState>,
    Json(body): Json<PathBody>,
) -> ApiResult<ImportSummary> {
    let db = state.db.clone();
    json_result(
        tokio::task::spawn_blocking(move || {
            database::data_portability::import_json(&db, &body.path)
        })
        .await
        .map_err(|error| AppError::System(format!("import task failed: {error}")))?,
    )
}

async fn import_csv(
    State(state): State<AppState>,
    Json(body): Json<PathBody>,
) -> ApiResult<ImportSummary> {
    let db = state.db.clone();
    json_result(
        tokio::task::spawn_blocking(move || {
            database::data_portability::import_csv(&db, &body.path)
        })
        .await
        .map_err(|error| AppError::System(format!("import task failed: {error}")))?,
    )
}

async fn backup_database(
    State(state): State<AppState>,
    Json(body): Json<PathBody>,
) -> ApiResult<BackupSummary> {
    let db = state.db.clone();
    json_result(
        tokio::task::spawn_blocking(move || {
            database::data_portability::backup_database(&db, &body.path)
        })
        .await
        .map_err(|error| AppError::System(format!("backup task failed: {error}")))?,
    )
}

async fn restore_database(
    State(state): State<AppState>,
    Json(body): Json<PathBody>,
) -> ApiResult<RestoreSummary> {
    let db = state.db.clone();
    let db_path = state.data_dir.join("klip.db");
    json_result(
        tokio::task::spawn_blocking(move || {
            database::data_portability::restore_database(&db, &db_path, &body.path)
        })
        .await
        .map_err(|error| AppError::System(format!("restore task failed: {error}")))?,
    )
}

async fn qa_ask(
    State(state): State<AppState>,
    Json(body): Json<QaAskBody>,
) -> ApiResult<crate::qa::QaAnswer> {
    let config = LlmConfig::load(&state.db)?;
    let provider = create_provider_from_config(&config);
    json_result(
        crate::qa::answer_question(&state.db, &body.question, provider.as_ref(), &config).await,
    )
}

/// Maximum silence tolerated between two LLM chunks before the answer is
/// declared failed. Keeps a wedged provider from hanging the stream forever.
const QA_STREAM_CHUNK_TIMEOUT: Duration = Duration::from_secs(60);

/// Streaming variant of `/api/qa/ask`: emits the reference list first
/// (`context`), then `delta` frames as the provider produces them, and closes
/// with `done`. Any failure (including a chunk timeout) is reported as an
/// `error` frame instead of a hung spinner.
async fn qa_ask_stream(State(state): State<AppState>, Json(body): Json<QaAskBody>) -> Response {
    if body.question.trim().is_empty() {
        return ApiError(AppError::InvalidInput(
            "question cannot be empty".to_string(),
        ))
        .into_response();
    }

    let config = match LlmConfig::load(&state.db) {
        Ok(config) => config,
        Err(error) => return sse_error_response("config", &error),
    };
    let (context, prompt) =
        match crate::qa::prepare_stream_answer(&state.db, &body.question, &config) {
            Ok(prepared) => prepared,
            Err(error) => return sse_error_response("retrieval", &error),
        };
    let provider = create_provider_from_config(&config);
    let provider_name = provider.name().to_string();
    let model = config.model.clone();
    let context_count = context.len();
    let snapshots = context
        .iter()
        .map(QaContextSnapshot::from)
        .collect::<Vec<_>>();

    let stream = qa_stream_events(
        provider,
        prompt,
        snapshots,
        context_count,
        provider_name,
        model,
    );
    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}

/// Build the QA SSE event stream from a provider's token stream.
/// The provider and prompt are moved into the stream so the result is
/// `'static` (axum's `Sse` requires it). Extracted from the handler so tests
/// can drive it with stub providers (including one that fails mid-stream and
/// one that never produces a chunk).
fn qa_stream_events(
    provider: Box<dyn LlmProvider>,
    prompt: String,
    context: Vec<QaContextSnapshot>,
    context_count: usize,
    provider_name: String,
    model: String,
) -> stream::BoxStream<'static, Result<Event, Infallible>> {
    qa_stream_events_with_timeout(
        provider,
        prompt,
        context,
        context_count,
        provider_name,
        model,
        QA_STREAM_CHUNK_TIMEOUT,
    )
}

fn qa_stream_events_with_timeout(
    provider: Box<dyn LlmProvider>,
    prompt: String,
    context: Vec<QaContextSnapshot>,
    context_count: usize,
    provider_name: String,
    model: String,
    chunk_timeout: Duration,
) -> stream::BoxStream<'static, Result<Event, Infallible>> {
    Box::pin(async_stream::stream! {
        let context_event = serde_json::json!({
            "context_count": context_count,
            "items": context,
        });
        yield Ok(Event::default().event("context").data(
            serde_json::to_string(&context_event).unwrap_or_else(|_| "{}".to_string()),
        ));
        let mut token_stream = provider.complete_stream(&prompt);
        let mut failure: Option<String> = None;
        loop {
            match next_stream_chunk(&mut token_stream, chunk_timeout).await {
                ChunkOutcome::Chunk(Ok(text)) => {
                    if text.is_empty() {
                        continue;
                    }
                    let payload = serde_json::json!({ "text": text });
                    yield Ok(Event::default().event("delta").data(
                        serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string()),
                    ));
                }
                ChunkOutcome::Chunk(Err(error)) => {
                    failure = Some(error.to_string());
                    break;
                }
                ChunkOutcome::End => break,
                ChunkOutcome::Timeout => {
                    failure = Some(format!(
                        "LLM did not produce a chunk within {} seconds",
                        QA_STREAM_CHUNK_TIMEOUT.as_secs()
                    ));
                    break;
                }
            }
        }
        match failure {
            Some(message) => {
                let payload = serde_json::json!({ "error": "llm", "message": message });
                yield Ok(Event::default().event("error").data(
                    serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string()),
                ));
            }
            None => {
                let payload = serde_json::json!({
                    "provider": provider_name,
                    "model": model,
                    "context_count": context_count,
                });
                yield Ok(Event::default().event("done").data(
                    serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string()),
                ));
            }
        }
    })
}

enum ChunkOutcome {
    Chunk(Result<String, AppError>),
    End,
    Timeout,
}

async fn next_stream_chunk<S>(stream: &mut S, timeout: Duration) -> ChunkOutcome
where
    S: stream::Stream<Item = Result<String, AppError>> + Unpin,
{
    match tokio::time::timeout(timeout, stream.next()).await {
        Ok(Some(result)) => ChunkOutcome::Chunk(result),
        Ok(None) => ChunkOutcome::End,
        Err(_) => ChunkOutcome::Timeout,
    }
}

fn sse_error_response(code: &str, error: &AppError) -> Response {
    let payload = serde_json::json!({ "error": code, "message": error.to_string() });
    let event = Event::default()
        .event("error")
        .data(serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string()));
    Sse::new(stream::once(std::future::ready(Ok::<_, Infallible>(event))))
        .keep_alive(KeepAlive::default())
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::types::{ContentType, NewClipboardItem};
    use axum::body::{to_bytes, Body};
    use axum::http::Request;
    use rusqlite::Connection;
    use sha2::{Digest, Sha256};
    use std::{path::PathBuf, sync::Arc};
    use tower::ServiceExt;

    fn test_db() -> crate::Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        let db = crate::Database::from_conn(conn);
        db.init_schema().unwrap();
        db
    }

    fn insert_text(db: &crate::Database, content: &str) {
        let hash = format!("{:x}", Sha256::digest(content.as_bytes()));
        let item = NewClipboardItem {
            content_type: ContentType::Text,
            data: content.as_bytes().to_vec(),
            preview: Some(content.to_string()),
            hash,
            size: content.len() as i64,
            metadata: None,
            formats: Vec::new(),
        };
        crate::database::clipboard::insert(db, &item).unwrap();
    }

    async fn response_json(response: axum::response::Response) -> serde_json::Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn health_endpoint_reports_ok() {
        let app = build_router_for_test(
            Arc::new(test_db()),
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        let response = app
            .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert!(response.status().is_success());
        assert_eq!(response_json(response).await["status"], "ok");
    }

    #[tokio::test]
    async fn openapi_endpoints_serve_documented_api_spec() {
        let app = build_router_for_test(
            Arc::new(test_db()),
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        for path in ["/api/openapi.json", "/openapi.json"] {
            let response = app
                .clone()
                .oneshot(Request::get(path).body(Body::empty()).unwrap())
                .await
                .unwrap();

            assert!(
                response.status().is_success(),
                "{path} should return the OpenAPI document"
            );
            let value = response_json(response).await;
            assert_eq!(value["openapi"], "3.1.0");
            assert!(value["paths"]["/api/health"]["get"].is_object());
            assert!(value["paths"]["/api/stats"]["get"].is_object());
        }
    }

    #[tokio::test]
    async fn stats_endpoint_reports_database_counts() {
        let db = Arc::new(test_db());
        insert_text(&db, "hello world");
        insert_text(&db, "deploy token is klip-secret-123");
        let tag = database::productization::create_tag(&db, "work", Some("#0d9488")).unwrap();
        database::snippets::create(
            &db,
            SnippetInput {
                title: "Greeting".to_string(),
                content: "hello".to_string(),
                tag_id: Some(tag.id),
                is_favorited: true,
            },
        )
        .unwrap();
        database::productization::create_source_rule(
            &db,
            SourceRuleInput {
                match_type: "title".to_string(),
                pattern: "secret".to_string(),
                enabled: true,
            },
        )
        .unwrap();

        let app = build_router_for_test(
            db,
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        let response = app
            .oneshot(Request::get("/api/stats").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert!(response.status().is_success());
        let value = response_json(response).await;
        assert_eq!(value["total_items"], 2);
        assert_eq!(value["text_count"], 2);
        assert_eq!(value["image_count"], 0);
        assert_eq!(value["tag_count"], 1);
        assert_eq!(value["snippet_count"], 1);
        assert_eq!(value["source_rule_count"], 1);
        assert_eq!(
            value["total_size_bytes"].as_i64(),
            Some(("hello world".len() + "deploy token is klip-secret-123".len()) as i64)
        );
        assert_eq!(value["db_size_bytes"], 0);
    }

    #[tokio::test]
    async fn qa_endpoint_uses_fake_provider_and_hides_prompt() {
        let db = Arc::new(test_db());
        insert_text(&db, "deploy token is klip-secret-123");
        let app = build_router_for_test(
            db,
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        let response = app
            .oneshot(
                Request::post("/api/qa/ask")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"question":"what is the deploy token?"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert!(response.status().is_success());
        let value = response_json(response).await;
        assert_eq!(value["provider"], "fake");
        assert_eq!(value["context_count"], 1);
        assert!(value.get("prompt_sent").is_none());
    }

    #[tokio::test]
    async fn cors_rejects_non_local_browser_origins() {
        let app = build_router_for_test(
            Arc::new(test_db()),
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        let response = app
            .oneshot(
                Request::get("/api/health")
                    .header("origin", "https://example.com")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert!(response
            .headers()
            .get("access-control-allow-origin")
            .is_none());
    }

    #[tokio::test]
    async fn cors_allows_loopback_browser_origins() {
        let app = build_router_for_test(
            Arc::new(test_db()),
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        let response = app
            .oneshot(
                Request::get("/api/health")
                    .header("origin", "http://localhost:5173")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            response
                .headers()
                .get("access-control-allow-origin")
                .and_then(|value| value.to_str().ok()),
            Some("http://localhost:5173")
        );
    }

    #[test]
    fn cors_origin_predicate_is_host_exact() {
        let allowed = [
            "tauri://localhost",
            "http://tauri.localhost",
            "http://localhost:5173",
            "http://127.0.0.1:27717",
            "http://[::1]:27717",
        ];
        for origin in allowed {
            assert!(
                is_allowed_cors_origin(&origin.parse().unwrap()),
                "{origin} should be allowed"
            );
        }

        let rejected = [
            "https://example.com",
            "http://tauri.localhost.evil.test",
            "http://127.0.0.1.evil.test",
            "null",
        ];
        for origin in rejected {
            assert!(
                !is_allowed_cors_origin(&origin.parse().unwrap()),
                "{origin} should be rejected"
            );
        }
    }

    #[test]
    fn server_event_names_match_browser_eventsource_contract() {
        assert_eq!(
            ServerEvent::ClipboardUpdated(serde_json::json!({ "id": 1 })).event_name(),
            "clipboard-updated"
        );
        assert_eq!(
            ServerEvent::ClipboardCleared.event_name(),
            "clipboard-cleared"
        );
        assert_eq!(
            ServerEvent::ConfigChanged {
                key: "language".to_string(),
                value: "zh-CN".to_string()
            }
            .event_name(),
            "config-changed"
        );
        assert_eq!(
            ServerEvent::ClipboardItemUpdated(serde_json::json!({ "id": 1 })).event_name(),
            "clipboard-item-updated"
        );
    }

    // ----- image on-demand loading -------------------------------------

    /// A real (tiny) PNG: the image endpoints must decode the stored data URL
    /// and serve bytes, so fixtures have to be valid PNGs.
    fn png_fixture() -> Vec<u8> {
        let image = image::RgbaImage::new(2, 2);
        let mut buffer = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(
                &mut std::io::Cursor::new(&mut buffer),
                image::ImageFormat::Png,
            )
            .unwrap();
        buffer
    }

    fn insert_image_item(db: &crate::Database, data: &[u8]) -> ClipboardItem {
        let hash = format!("{:x}", Sha256::digest(data));
        let item = NewClipboardItem {
            content_type: ContentType::Image,
            data: data.to_vec(),
            preview: Some("image fixture".to_string()),
            hash,
            size: data.len() as i64,
            metadata: Some(r#"{"width":2,"height":2}"#.to_string()),
            formats: Vec::new(),
        };
        crate::database::clipboard::insert(db, &item).unwrap()
    }

    #[tokio::test]
    async fn list_and_detail_responses_omit_full_image_base64() {
        let db = Arc::new(test_db());
        let png = png_fixture();
        let image = insert_image_item(&db, &png);
        insert_text(&db, "plain text item");

        let app = build_router_for_test(
            db,
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        for uri in [
            "/api/clipboard?limit=10",
            "/api/clipboard/1",
            "/api/clipboard/2",
        ] {
            let response = app
                .clone()
                .oneshot(Request::get(uri).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert!(response.status().is_success(), "{uri}");
            let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            let raw = String::from_utf8_lossy(&bytes);
            assert!(
                !raw.contains("data:image/png;base64"),
                "{uri} must not ship base64: {raw}"
            );
        }

        // Explicitly: the list payload must not contain the base64 payload,
        // and each image item carries the on-demand image_ref links.
        let response = app
            .clone()
            .oneshot(
                Request::get("/api/clipboard?limit=10")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let raw = String::from_utf8_lossy(&bytes);
        assert!(
            !raw.contains("data:image/png;base64"),
            "list must not ship base64: {raw}"
        );
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        let image_entry = value
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["id"] == serde_json::json!(image.id))
            .unwrap();
        assert!(
            image_entry.get("content").is_none(),
            "image items omit content"
        );
        assert_eq!(
            image_entry["image_ref"]["url"],
            format!("/api/clipboard/{}/image", image.id)
        );
        assert_eq!(
            image_entry["image_ref"]["thumbnail_url"],
            format!("/api/clipboard/{}/thumbnail", image.id)
        );
        assert_eq!(image_entry["image_ref"]["width"], 2);
    }

    #[tokio::test]
    async fn image_and_thumbnail_endpoints_serve_png_and_reject_other_types() {
        let db = Arc::new(test_db());
        let png = png_fixture();
        let image = insert_image_item(&db, &png);
        insert_text(&db, "a plain text item");
        let app = build_router_for_test(
            db,
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/api/clipboard/{}/image", image.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "image/png"
        );
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(&body[..8], b"\x89PNG\r\n\x1a\n", "must serve the real PNG");
        assert_eq!(body.len(), png.len());

        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/api/clipboard/{}/thumbnail", image.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "image/png"
        );

        // Text items have no image.
        let response = app
            .clone()
            .oneshot(
                Request::get("/api/clipboard/2/image")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        // Missing items 404.
        let response = app
            .clone()
            .oneshot(
                Request::get("/api/clipboard/9999/image")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    // ----- OCR over HTTP -------------------------------------------------

    #[tokio::test]
    async fn ocr_state_is_visible_and_trigger_reports_worker_unavailability() {
        let db = Arc::new(test_db());
        let png = png_fixture();
        let image = insert_image_item(&db, &png);
        insert_text(&db, "a plain text item");
        let app = build_router_for_test(
            db,
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        // The image starts with a pending OCR row (created at insert time).
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/api/clipboard/{}/ocr", image.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(response.status().is_success());
        let value = response_json(response).await;
        assert_eq!(value["status"], "pending");

        // Triggering without a desktop worker is an explicit 503, never a
        // fake success — and it does not poison the OCR state.
        let response = app
            .clone()
            .oneshot(
                Request::post(format!("/api/clipboard/{}/ocr", image.id))
                    .header("content-type", "application/json")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let value = response_json(response).await;
        assert_eq!(value["error"], "ocr_unavailable");
        assert!(
            value["message"].as_str().unwrap().contains("desktop"),
            "must explain why: {value}"
        );

        // After the 503, other endpoints (and OCR state) still work.
        let response = app
            .clone()
            .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/api/clipboard/{}/ocr", image.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response_json(response).await["status"], "pending");

        // Non-image item → 400; missing item → 404.
        let response = app
            .clone()
            .oneshot(
                Request::get("/api/clipboard/2/ocr")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let response = app
            .clone()
            .oneshot(
                Request::post("/api/clipboard/9999/ocr")
                    .header("content-type", "application/json")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    // ----- QA streaming ---------------------------------------------------

    async fn sse_frames(response: axum::response::Response) -> Vec<(String, serde_json::Value)> {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let text = String::from_utf8_lossy(&bytes);
        let mut frames = Vec::new();
        for block in text.split("\n\n") {
            let (mut event, mut data) = (String::new(), String::new());
            for line in block.trim_start().lines() {
                if let Some(value) = line.strip_prefix("event:") {
                    event = value.trim().to_string();
                }
                if let Some(value) = line.strip_prefix("data:") {
                    data = value.trim().to_string();
                }
            }
            if event.is_empty() {
                continue;
            }
            frames.push((
                event,
                serde_json::from_str(&data).unwrap_or(serde_json::Value::Null),
            ));
        }
        frames
    }

    #[tokio::test]
    async fn qa_stream_emits_context_then_deltas_then_done() {
        let db = Arc::new(test_db());
        insert_text(&db, "deploy token is klip-secret-123");
        let app = build_router_for_test(
            db,
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        let response = app
            .oneshot(
                Request::post("/api/qa/ask/stream")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"question":"what is the deploy token?"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let frames = sse_frames(response).await;
        let events: Vec<&str> = frames.iter().map(|(event, _)| event.as_str()).collect();
        assert_eq!(events[0], "context");
        assert_eq!(*events.last().unwrap(), "done");
        assert!(events.contains(&"delta"));
        let context = &frames[0].1;
        assert_eq!(context["context_count"], 1);
        assert_eq!(context["items"][0]["id"], 1);
        let done = frames.last().unwrap().1.clone();
        assert_eq!(done["context_count"], 1);
    }

    #[tokio::test]
    async fn qa_stream_empty_question_is_rejected_with_400() {
        let app = build_router_for_test(
            Arc::new(test_db()),
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );
        let response = app
            .oneshot(
                Request::post("/api/qa/ask/stream")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"question":"   "}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn qa_stream_empty_retrieval_reports_zero_context() {
        let db = Arc::new(test_db());
        insert_text(&db, "shopping list milk eggs");
        let app = build_router_for_test(
            db,
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        let response = app
            .oneshot(
                Request::post("/api/qa/ask/stream")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"question":"quantum physics"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        let frames = sse_frames(response).await;
        assert_eq!(frames[0].1["context_count"], 0);
        assert_eq!(frames[0].1["items"].as_array().unwrap().len(), 0);
        assert_eq!(frames.last().unwrap().0, "done");
    }

    struct FailAfterFirstProvider;

    #[async_trait::async_trait]
    impl LlmProvider for FailAfterFirstProvider {
        async fn complete(&self, _prompt: &str) -> Result<String, AppError> {
            Ok("unused".into())
        }
        fn complete_stream<'a>(
            &'a self,
            _prompt: &'a str,
        ) -> stream::BoxStream<'a, Result<String, AppError>> {
            Box::pin(stream::iter(vec![
                Ok("partial".to_string()),
                Err(AppError::Llm("injected mid-stream failure".into())),
            ]))
        }
        fn name(&self) -> &'static str {
            "fail-test"
        }
    }

    struct PendingProvider;

    #[async_trait::async_trait]
    impl LlmProvider for PendingProvider {
        async fn complete(&self, _prompt: &str) -> Result<String, AppError> {
            std::future::pending().await
        }
        fn complete_stream<'a>(
            &'a self,
            _prompt: &'a str,
        ) -> stream::BoxStream<'a, Result<String, AppError>> {
            Box::pin(stream::pending())
        }
        fn name(&self) -> &'static str {
            "pending-test"
        }
    }

    #[tokio::test]
    async fn qa_stream_mid_stream_failure_emits_error_frame() {
        let provider = FailAfterFirstProvider;
        let stream = qa_stream_events_with_timeout(
            Box::new(provider),
            "prompt".to_string(),
            vec![],
            0,
            "fail-test".to_string(),
            "model".into(),
            Duration::from_secs(60),
        );
        let frames = collect_stream_frames(stream).await;
        let events: Vec<&str> = frames.iter().map(|(event, _)| event.as_str()).collect();
        assert!(
            events.contains(&"delta"),
            "partial delta got through: {events:?}"
        );
        assert_eq!(*events.last().unwrap(), "error");
        assert!(frames.last().unwrap().1["message"]
            .as_str()
            .unwrap()
            .contains("injected mid-stream failure"));
    }

    #[tokio::test]
    async fn qa_stream_chunk_timeout_emits_error_frame() {
        let provider = PendingProvider;
        let stream = qa_stream_events_with_timeout(
            Box::new(provider),
            "prompt".to_string(),
            vec![],
            0,
            "pending-test".to_string(),
            "model".into(),
            Duration::from_millis(20),
        );
        let frames = collect_stream_frames(stream).await;
        assert_eq!(frames[0].0, "context");
        assert_eq!(frames[1].0, "error");
        assert!(
            frames[1].1["message"].as_str().unwrap().contains("within"),
            "{:?}",
            frames[1].1
        );
    }

    async fn collect_stream_frames(
        stream: stream::BoxStream<'static, Result<Event, Infallible>>,
    ) -> Vec<(String, serde_json::Value)> {
        let events: Vec<Event> = stream.map(|item| item.unwrap()).collect().await;
        let mut frames = Vec::new();
        for event in events {
            let response = Sse::new(stream::once(std::future::ready(Ok::<_, Infallible>(event))))
                .into_response();
            let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            let text = String::from_utf8_lossy(&bytes);
            let (mut name, mut data) = (String::new(), String::new());
            for line in text.lines() {
                if let Some(value) = line.strip_prefix("event:") {
                    name = value.trim().to_string();
                }
                if let Some(value) = line.strip_prefix("data:") {
                    data = value.trim().to_string();
                }
            }
            frames.push((
                name,
                serde_json::from_str(&data).unwrap_or(serde_json::Value::Null),
            ));
        }
        frames
    }

    // ----- access token ----------------------------------------------------

    fn set_access_token(db: &crate::Database, token: &str) {
        crate::database::config::set(db, registry::KEY_HTTP_ACCESS_TOKEN, token).unwrap();
    }

    #[tokio::test]
    async fn access_token_disabled_keeps_endpoints_open() {
        let db = Arc::new(test_db());
        let app = build_router_for_test(
            db,
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );
        let response = app
            .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn access_token_enabled_rejects_missing_and_wrong_credentials_everywhere() {
        let db = Arc::new(test_db());
        set_access_token(&db, "klip-test-token");
        let app = build_router_for_test(
            db,
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        // No token at all.
        let response = app
            .clone()
            .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        // Wrong bearer token.
        let response = app
            .clone()
            .oneshot(
                Request::get("/api/health")
                    .header("authorization", "Bearer nope")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        // Wrong query token (EventSource channel).
        let response = app
            .clone()
            .oneshot(
                Request::get("/api/health?access_token=nope")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        // SSE stream is gated too — the header is checked before the stream.
        let response = app
            .clone()
            .oneshot(Request::get("/api/events").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        // The OpenAPI document is gated as well (everything is).
        let response = app
            .clone()
            .oneshot(
                Request::get("/api/openapi.json")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn access_token_accepts_bearer_and_query_credentials() {
        let db = Arc::new(test_db());
        set_access_token(&db, "klip-test-token");
        let app = build_router_for_test(
            db,
            None,
            PathBuf::from("C:/tmp/klip-test"),
            EventBroadcaster::new(),
        );

        let response = app
            .clone()
            .oneshot(
                Request::get("/api/health")
                    .header("authorization", "Bearer klip-test-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let response = app
            .clone()
            .oneshot(
                Request::get("/api/health?access_token=klip-test-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    // ----- diagnostics ------------------------------------------------------

    #[tokio::test]
    async fn diagnostics_health_runs_three_checks() {
        let dir = std::env::temp_dir().join(format!("klip-http-diag-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("klip.db"), b"not a database").unwrap();
        let db = Arc::new(test_db());
        let app = build_router_for_test(db, None, dir.clone(), EventBroadcaster::new());

        let response = app
            .oneshot(
                Request::get("/api/diagnostics/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let value = response_json(response).await;
        let checks = value["checks"].as_array().unwrap();
        assert_eq!(checks.len(), 3, "{value}");
        let by_id = |id: &str| {
            checks
                .iter()
                .find(|check| check["id"] == id)
                .unwrap()
                .clone()
        };
        assert_eq!(by_id("sqlite_integrity")["status"], "ok");
        // In-memory test databases have no Tantivy index attached.
        assert_eq!(by_id("search_index")["status"], "degraded");
        assert!(by_id("search_index")["summary"]
            .as_str()
            .unwrap()
            .contains("LIKE fallback"));
        assert_eq!(by_id("data_dir_usage")["status"], "ok");
        assert_eq!(by_id("data_dir_usage")["details"]["file_count"], 1);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
