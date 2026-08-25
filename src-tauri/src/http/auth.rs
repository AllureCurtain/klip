//! Optional bearer-token gate for the whole HTTP surface.
//!
//! The token lives in the existing `app_config` SQLite table under
//! `http_access_token`. Empty (the default) disables authentication and keeps
//! behavior identical to before this module existed; non-empty requires every
//! request — including the SSE stream — to present the token, either as
//! `Authorization: Bearer <token>` or as `?access_token=<token>` (the only
//! option EventSource can send).

use crate::config::registry;
use crate::database;
use crate::http::AppState;
use axum::extract::{Request, State};
use axum::http::header::{AUTHORIZATION, WWW_AUTHENTICATE};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;

/// Query parameter accepted as a fallback token channel (EventSource cannot
/// set request headers).
pub const TOKEN_QUERY_PARAM: &str = "access_token";

pub async fn require_access_token(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    match configured_token(&state) {
        None => next.run(request).await,
        Some(expected) => {
            if matches_presented_token(&request, &expected) {
                next.run(request).await
            } else {
                unauthorized()
            }
        }
    }
}

/// Read the configured token; `None` means authentication is disabled
/// (unset or empty string, the default).
fn configured_token(state: &AppState) -> Option<String> {
    database::config::get(&state.db, registry::KEY_HTTP_ACCESS_TOKEN)
        .ok()
        .flatten()
        .filter(|token| !token.is_empty())
}

fn matches_presented_token(request: &Request, expected: &str) -> bool {
    let presented = bearer_token(request).or_else(|| query_token(request));
    match presented {
        Some(presented) => constant_time_eq(presented.as_bytes(), expected.as_bytes()),
        None => false,
    }
}

fn bearer_token(request: &Request) -> Option<String> {
    let header = request.headers().get(AUTHORIZATION)?.to_str().ok()?;
    let token = header
        .strip_prefix("Bearer ")
        .or_else(|| header.strip_prefix("bearer "))?;
    let token = token.trim();
    (!token.is_empty()).then(|| token.to_string())
}

fn query_token(request: &Request) -> Option<String> {
    let query = request.uri().query()?;
    for pair in query.split('&') {
        if let Some(value) = pair
            .strip_prefix(&format!("{TOKEN_QUERY_PARAM}="))
            .or_else(|| pair.strip_prefix(&format!("{TOKEN_QUERY_PARAM}=")))
        {
            let value = urlencoding(value);
            if !value.is_empty() {
                return Some(value);
            }
        }
    }
    None
}

/// Minimal `application/x-www-form-urlencoded` decoder for the one parameter
/// we accept (handles `%20` and `+`).
fn urlencoding(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.bytes();
    while let Some(byte) = chars.next() {
        match byte {
            b'+' => out.push(' '),
            b'%' => {
                let hi = chars.next().and_then(hex_value);
                let lo = chars.next().and_then(hex_value);
                match (hi, lo) {
                    (Some(hi), Some(lo)) => out.push((hi << 4 | lo) as char),
                    _ => out.push('%'),
                }
            }
            other => out.push(other as char),
        }
    }
    out
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// Compare two secrets without leaking length/prefix through timing.
fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

fn unauthorized() -> Response {
    let mut response = (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({
            "error": "unauthorized",
            "message": "missing or invalid access token",
        })),
    )
        .into_response();
    response.headers_mut().insert(
        WWW_AUTHENTICATE,
        r#"Bearer realm="klip", charset="UTF-8""#.parse().unwrap(),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_decoding_handles_spaces_and_hex() {
        assert_eq!(urlencoding("hello%20world"), "hello world");
        assert_eq!(urlencoding("a+b"), "a b");
        assert_eq!(urlencoding("%7Eklip"), "~klip");
    }

    #[test]
    fn constant_time_compare_detects_mismatches_without_short_circuiting() {
        assert!(constant_time_eq(b"secret", b"secret"));
        assert!(!constant_time_eq(b"secret", b"secrex"));
        assert!(!constant_time_eq(b"short", b"longer"));
        assert!(!constant_time_eq(b"", b"x"));
    }
}
