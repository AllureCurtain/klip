# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Klip** is a cross-platform clipboard manager built with **Tauri 2.0 + React 19 + Rust**. It runs as a tray application that monitors the system clipboard, persists history to a local SQLite database, and provides a global hotkey-driven UI for searching and re-pasting items.

## Commands

Package manager is **pnpm**. The Tauri CLI is invoked through pnpm scripts; do not run `tauri` directly.

```bash
# Install dependencies
pnpm install

# Run the full app in development (frontend + Rust backend, with HMR)
pnpm tauri:dev

# Run only the Vite frontend (no Tauri shell — most IPC will fail)
pnpm dev

# Production build (TypeScript check + Vite + Tauri bundle)
pnpm tauri:build

# Frontend-only build (tsc -b && vite build)
pnpm build

# Lint
pnpm lint

# Frontend tests (Vitest)
pnpm test
pnpm test -- path/to/file.test.ts        # single file
pnpm test -- -t "pattern"                # filter by test name

# Rust tests (run from src-tauri/)
cd src-tauri && cargo test
cd src-tauri && cargo test --test clipboard_format_test    # the integration test file
cd src-tauri && cargo test format::text                    # filter by name
cd src-tauri && cargo fmt && cargo clippy -- -D warnings
```

The dev server runs on Vite's default port; `vite.config.ts` is wired to Tauri so the Rust process picks up the dev URL automatically.

## Architecture

### Two-process model

- **Frontend** (`src/`) — React 19 + TypeScript + Vite + Tailwind 4 + Shadcn/ui. State lives in **Zustand** stores. The frontend never touches the OS clipboard directly; everything goes through Tauri IPC.
- **Backend** (`src-tauri/src/`) — Rust binary (`main.rs`) + library (`lib.rs`). Owns the database, the clipboard monitor thread, global hotkeys, and the tray. Exposes functionality as `#[tauri::command]` handlers registered in `main.rs::invoke_handler!`.

The two communicate via **Tauri IPC** (`invoke`) for request/response and **Tauri events** (`emit` / `listen`) for push notifications (e.g., `clipboard-updated`).

### Data flow: clipboard capture

1. `clipboard::monitor` runs a background thread (using `clipboard-master` + `arboard`) that polls/watches the OS clipboard.
2. On change, content is hashed (SHA-256), classified (text/image/file — see `clipboard/format/`), and inserted into SQLite with dedup on the unique `hash` column.
3. The backend emits a `clipboard-updated` event with the new `ClipboardItem` payload.
4. `App.tsx` listens for `clipboard-updated` and prepends to the Zustand `clipboardStore`. The store also calls `clipboardApi.getList()` on mount (`fetchItems`).

When a user picks an item, `commands::paste_from_clipboard` delegates to `clipboard/paste.rs`: it loads the item, writes it through `clipboard/writer.rs`, hides the window, and triggers the platform paste adapter. Windows restores the previously focused HWND before Ctrl+V, macOS uses Cmd+V, and Linux delegates to `platform/linux.rs` for the best available desktop-tool implementation.

### Backend module layout (`src-tauri/src/`)

- `commands/` — All `#[tauri::command]` handlers. `commands/mod.rs` owns core clipboard/config/window/system commands; `commands/productization.rs` owns filtered search, tags, snippets, source rules, import/export/backup/restore, and sensitive-content rescans. The full registered list lives in `main.rs`.
- `clipboard/monitor.rs` — clipboard watcher, capture gating, dedupe, and event emission.
- `clipboard/paste.rs` — loads saved items and coordinates copy + hide + platform paste simulation.
- `clipboard/writer.rs` — the single backend path for writing saved text/image/file payloads back to the OS clipboard, including Windows ignore markers.
- `clipboard/format/{text,image,file}.rs` — per-format detection and extraction. `mod.rs` is the format dispatch table.
- `database/` — `connection.rs` owns the singleton `Database` (a `Mutex<Connection>`) registered as Tauri state. CRUD/query modules are split by domain: `clipboard.rs`, `clipboard_query.rs`, `config.rs`, `productization.rs`, `snippets.rs`, and `data_portability.rs`. Schema is created in `connection.rs::init_schema` with idempotent `CREATE TABLE IF NOT EXISTS` plus migrations gated on `db_version` in `app_config`.
- `hotkey/manager.rs` — registers `Ctrl+Alt+K` (toggle window) and `Ctrl+1..9` (quick paste) via `tauri-plugin-global-shortcut`. Quick-paste handlers fetch by index from the DB and call into `commands::paste_from_clipboard`.
- `tray/setup.rs` — system tray icon + menu. Tray clicks toggle the main window.
- `lib.rs` — exports modules and owns a small piece of cross-cutting state: a **tray-click guard** (`LAST_TRAY_CLICK_MS`, `TRAY_CLICK_GUARD_MS = 300ms`). The window's focus-lost handler in `main.rs` consults this to suppress auto-hide right after a tray click, preventing a race where the click both shows and immediately hides the window. **If you add another mechanism that toggles the window, route it through `notify_tray_click()` or the auto-hide will fight it.**

### Frontend module layout (`src/`)

- `lib/tauri.ts` — **single source of truth for all IPC calls**, grouped into `clipboardApi`, `configApi`, `systemApi`, plus event listener helpers. Always extend this module rather than calling `invoke()` from components.
- `stores/clipboardStore.ts` — Zustand store for history, filters, selection, tags, import/export, backup/restore, sensitive rescans, and clipboard actions. Live updates are filtered against the active view before insertion.
- `stores/configStore.ts` — Runtime settings store. Normalizes config through `configSchema.ts` and persists non-autostart changes with the batch `set_config_many` command; autostart remains a separate OS side-effect command.
- `stores/productivityStore.ts` — snippets, source ignore rules, monitoring pause, and timed privacy-mode state.
- `components/clipboard/` — list and item rendering.
- `components/layout/` — `Header` (search input) and `EmptyState`.
- `components/ui/` — Shadcn-generated primitives (`button`, `input`, `scroll-area`).
- `types/index.ts` — `ClipboardItem`, `SystemInfo`, etc. Keep these in sync with the Rust structs in `database/types.rs`.
- Path alias `@/*` → `src/*` (configured in `tsconfig.json` and `vite.config.ts`).

### Database schema (SQLite, WAL mode)

- `clipboard_items(id, content_type, content, preview, hash UNIQUE, size, metadata, is_favorited, is_sensitive, sensitivity_reason, created_at, last_used_at)` — indexed for recency, content type, favorite, sensitivity, hash, and preview lookups.
- `tags(id, name UNIQUE, color, created_at)` and `clipboard_item_tags(item_id, tag_id)` — many-to-many tagging.
- `snippets(id, title, content, tag_id, is_favorited, created_at, updated_at)` — reusable text snippets.
- `clipboard_source_rules(id, match_type, pattern, enabled, created_at, updated_at)` — process/window title capture-ignore rules.
- `app_config(key PK, value, updated_at)` — defaults seeded from `config/registry.rs` (`db_version=3`, hotkeys, window size, privacy/readiness settings, etc.).
- DB file location: Tauri's `app_data_dir()` + `klip.db` (e.g. `%APPDATA%\klip\klip.db` on Windows).

### IPC command surface

The full list registered in `main.rs::invoke_handler!`:

- Clipboard: `get_clipboard_list`, `get_clipboard_list_filtered`, `search_clipboard`, `search_clipboard_filtered`, `search_clipboard_advanced`, `get_clipboard_by_id`, `delete_clipboard_item`, `delete_clipboard_items`, `toggle_favorite`, `set_favorite_for_items`, `clear_clipboard_history`, `copy_to_clipboard`, `paste_from_clipboard`
- Tags/snippets/rules: `list_tags`, `create_tag`, `delete_tag`, `assign_tag_to_item`, `remove_tag_from_item`, `list_snippets`, `search_snippets`, `create_snippet`, `update_snippet`, `delete_snippet`, `list_source_rules`, `create_source_rule`, `update_source_rule`, `set_source_rule_enabled`, `delete_source_rule`
- Portability/productization: `rescan_sensitive_items`, `export_clipboard_json`, `export_clipboard_csv`, `import_clipboard_json`, `import_clipboard_csv`, `backup_database`, `restore_database`
- Config: `get_config`, `get_all_config`, `set_config`, `set_config_many`
- Window/system: `toggle_window`, `show_window`, `hide_window`, `set_auto_start`, `is_auto_start_enabled`, `get_system_info`, `get_diagnostics_info`

When adding a new command: define it in `commands/mod.rs`, register it in the `invoke_handler!` macro, and add a typed wrapper in `src/lib/tauri.ts`.

## Conventions specific to this repo

- **All saved-item clipboard mutation must go through `clipboard::copy_to_clipboard`** (re-exported from `clipboard/writer.rs`), which understands `content_type` + `metadata`. Don't call `arboard` directly from commands.
- **Image content** is stored base64-encoded in `content`, with structural info in `metadata` (JSON). The `preview` column is what the UI displays; it's a thumbnail/excerpt, not the full payload.
- **Hotkey changes** go through `hotkey/manager.rs`. `tauri-plugin-global-shortcut` is finicky on Windows about modifier combos — `Ctrl+Alt+<key>` is the tested-good pattern.
- **Window auto-hide on focus loss** is enabled. When you add code that programmatically focuses or shows the main window from the backend, be aware of the 300ms tray-click guard described above.
- **Logs**: Rust uses `tracing` (configured in `main.rs` at `INFO` level). Existing log files in `src-tauri/klip_*.log` are runtime artifacts — do not commit changes to them.
- **Docs in `docs/`** are written in Chinese and contain authoritative architecture/PRD/API/database details. `docs/MULTI_FORMAT_DESIGN.md` is the design rationale for the text/image/file format split.

## Platform notes

- `paste_from_clipboard`'s synthetic paste is platform-specific: Windows/macOS use `enigo`; Linux uses helpers in `platform/linux.rs` and may depend on the active desktop session and installed clipboard/paste tools.
- The `windows = "0.59"` crate with `Win32_System_DataExchange` is pulled in for Windows-specific clipboard format work; non-Windows builds should not reference it.
- Release profile is aggressive (`lto = true`, `opt-level = "s"`, `panic = "abort"`, `strip = true`) — expect long release build times.
