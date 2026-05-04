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

When a user picks an item, `paste_from_clipboard` writes to the OS clipboard, hides the window, and uses **`enigo`** to synthesize Ctrl+V / Cmd+V (Windows + macOS only — Linux paste-on-select is not implemented).

### Backend module layout (`src-tauri/src/`)

- `commands/` — All `#[tauri::command]` handlers. Thin wrappers around `database::*` and `clipboard::*`. The full registered list lives in `main.rs`.
- `clipboard/monitor.rs` — clipboard watcher and `copy_to_clipboard` helper.
- `clipboard/format/{text,image,file}.rs` — per-format parsing/preview/serialization. Image previews use `image` + `fast_image_resize` and are stored as base64. `mod.rs` is the format dispatch table.
- `database/` — `connection.rs` owns the singleton `Database` (a `Mutex<Connection>`) registered as Tauri state. `clipboard.rs` and `config.rs` are the two CRUD modules. Schema is created in `connection.rs::init_schema` with idempotent `CREATE TABLE IF NOT EXISTS` + ad-hoc `ALTER TABLE` migrations gated on `db_version` in the `app_config` table.
- `hotkey/manager.rs` — registers `Ctrl+Alt+K` (toggle window) and `Ctrl+1..9` (quick paste) via `tauri-plugin-global-shortcut`. Quick-paste handlers fetch by index from the DB and call into `commands::paste_from_clipboard`.
- `tray/setup.rs` — system tray icon + menu. Tray clicks toggle the main window.
- `lib.rs` — exports modules and owns a small piece of cross-cutting state: a **tray-click guard** (`LAST_TRAY_CLICK_MS`, `TRAY_CLICK_GUARD_MS = 300ms`). The window's focus-lost handler in `main.rs` consults this to suppress auto-hide right after a tray click, preventing a race where the click both shows and immediately hides the window. **If you add another mechanism that toggles the window, route it through `notify_tray_click()` or the auto-hide will fight it.**

### Frontend module layout (`src/`)

- `lib/tauri.ts` — **single source of truth for all IPC calls**, grouped into `clipboardApi`, `configApi`, `systemApi`, plus event listener helpers. Always extend this module rather than calling `invoke()` from components.
- `stores/clipboardStore.ts` — Zustand store. Holds `items[]`, `loading`, `error`, and the actions (`fetchItems`, `searchItems`, `deleteItem`, `copyItem`, `clearItems`, `addItems`, `setItems`). `addItems` dedupes by `id` against existing state.
- `components/clipboard/` — list and item rendering.
- `components/layout/` — `Header` (search input) and `EmptyState`.
- `components/ui/` — Shadcn-generated primitives (`button`, `input`, `scroll-area`).
- `types/index.ts` — `ClipboardItem`, `SystemInfo`, etc. Keep these in sync with the Rust structs in `database/types.rs`.
- Path alias `@/*` → `src/*` (configured in `tsconfig.json` and `vite.config.ts`).

### Database schema (SQLite, WAL mode)

- `clipboard_items(id, content_type, content, preview, hash UNIQUE, size, metadata, is_favorited, created_at, last_used_at)` — indexed on `created_at DESC`, `hash`, and `preview`.
- `app_config(key PK, value, updated_at)` — defaults seeded on init (`max_history_count=100`, `hotkey_toggle_window=Ctrl+Alt+K`, `db_version=2`, etc.).
- DB file location: Tauri's `app_data_dir()` + `klip.db` (e.g. `%APPDATA%\klip\klip.db` on Windows).

### IPC command surface

The full list registered in `main.rs::invoke_handler!`:

- Clipboard: `get_clipboard_list`, `search_clipboard`, `get_clipboard_by_id`, `delete_clipboard_item`, `clear_clipboard_history`, `copy_to_clipboard`, `paste_from_clipboard`
- Config: `get_config`, `get_all_config`, `set_config`
- Window/system: `toggle_window`, `show_window`, `hide_window`, `set_auto_start`, `get_system_info`

When adding a new command: define it in `commands/mod.rs`, register it in the `invoke_handler!` macro, and add a typed wrapper in `src/lib/tauri.ts`.

## Conventions specific to this repo

- **All clipboard mutation must go through `clipboard::copy_to_clipboard`** (in `clipboard/monitor.rs`), which understands `content_type` + `metadata`. Don't call `arboard` directly from commands.
- **Image content** is stored base64-encoded in `content`, with structural info in `metadata` (JSON). The `preview` column is what the UI displays; it's a thumbnail/excerpt, not the full payload.
- **Hotkey changes** go through `hotkey/manager.rs`. `tauri-plugin-global-shortcut` is finicky on Windows about modifier combos — `Ctrl+Alt+<key>` is the tested-good pattern.
- **Window auto-hide on focus loss** is enabled. When you add code that programmatically focuses or shows the main window from the backend, be aware of the 300ms tray-click guard described above.
- **Logs**: Rust uses `tracing` (configured in `main.rs` at `INFO` level). Existing log files in `src-tauri/klip_*.log` are runtime artifacts — do not commit changes to them.
- **Docs in `docs/`** are written in Chinese and contain authoritative architecture/PRD/API/database details. `docs/MULTI_FORMAT_DESIGN.md` is the design rationale for the text/image/file format split.

## Platform notes

- `paste_from_clipboard`'s synthetic Ctrl+V uses `enigo` and is `#[cfg]`-gated to Windows and macOS. Linux currently copies but does not auto-paste.
- The `windows = "0.59"` crate with `Win32_System_DataExchange` is pulled in for Windows-specific clipboard format work; non-Windows builds should not reference it.
- Release profile is aggressive (`lto = true`, `opt-level = "s"`, `panic = "abort"`, `strip = true`) — expect long release build times.
