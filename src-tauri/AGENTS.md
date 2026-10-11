# Backend (src-tauri/)

Rust + Tauri 2. Owns SQLite, the clipboard monitor thread, global hotkeys,
tray, and the local HTTP API. Supplements the root `AGENTS.md`; only
backend-specific rules live here.

## Layering

- `commands/` — thin `#[tauri::command]` handlers: `mod.rs` (core
  clipboard/config/window/system), `search.rs` (search commands),
  `productization.rs` (tags, snippets, source rules, import/export,
  backup/restore, sensitive rescans). Register every command in
  `main.rs::invoke_handler!`.
- `clipboard/` — `backend.rs` is the **only** `clipboard-rs` adapter;
  `monitor.rs` watcher + capture gating + dedupe; `suppress.rs` one-shot TTL
  hash suppression; `writer.rs` is the **sole write path** back to the OS
  clipboard; `paste.rs` coordinates copy → hide → platform paste; `format/`
  per-format detection/extraction.
- `database/` — `connection.rs` singleton `Database` (`Mutex<Connection>`) as
  Tauri state; domain CRUD modules (`clipboard`, `clipboard_query`, `config`,
  `productization`, `snippets`, `data_portability`); schema via `init_schema`
  + `migrations.rs` gated on `db_version` in `app_config`.
- `search/` — Tantivy 0.24 + jieba, batched/timed commits, checksum health
  checks, SQLite rebuild, transparent query fallback.
- `hotkey/manager.rs` — `tauri-plugin-global-shortcut`; bindings tracked in
  `OWNED_SHORTCUTS`; quick-paste resolves IDs from the frontend-synced visible
  snapshot before calling `paste_from_clipboard`.
- `http/` — local HTTP API; contract truth is `http/openapi.rs`.
- `platform/` — per-OS paste/clipboard helpers (`linux.rs`; the `windows`
  crate `Win32_System_DataExchange` is cfg-gated to Windows).
- `config/registry.rs` — `app_config` defaults and validation.
- `lib.rs` — module exports + the tray-click guard (`notify_tray_click()`,
  `TRAY_CLICK_GUARD_MS = 300ms`) consulted by focus-lost auto-hide.

## Hard rules

- All saved-item clipboard writes go through `clipboard::copy_to_clipboard`
  (re-exported from `writer.rs`); never build a clipboard-rs context elsewhere.
- Window-toggling mechanisms route through `notify_tray_click()` or the
  300 ms auto-hide guard fights them.
- Schema changes only through `migrations.rs` + `db_version` bump.
- New shortcut mechanisms go through `apply_bindings`/`OWNED_SHORTCUTS`; the
  legacy `reload_hotkeys_from_values`/`unregister_all` path is kept only for
  config rollback (see issue #17).
- Logging via `tracing` (INFO in `main.rs`); `src-tauri/klip_*.log` are runtime
  artifacts — never commit them.
- `windows` crate types behind `#[cfg(windows)]` only.
- `panic = "abort"` + `lto` in release — no unwinding assumptions, expect long
  release builds.
- **Worktree target sharing**: when working in a `git worktree` under
  `.worktrees/`, create `.cargo/config.toml` at the worktree root with
  `[build] target-dir = "../../src-tauri/target"` so all worktrees share the
  main checkout's build cache instead of each rebuilding ~2 GB of deps.
  `.cargo/` is gitignored — the file is local-only and never committed.

## Testing

- `cargo test` (unit) + `--test clipboard_format_test` (integration).
- `cargo fmt` + `cargo clippy -- -D warnings` clean before PR.
- No absolute local paths, usernames, or machine names in tests — inject via
  env/temp dirs.
