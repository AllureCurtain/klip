# Architecture

Two-process Tauri app: a React frontend and a Rust backend owning the OS
integration, database, and search index. `web-klip/` is an optional dashboard
over the backend's local HTTP API.

Full module/flow detail remains in [ARCHITECTURE-zh.md](ARCHITECTURE-zh.md)
until migration completes; this file is the canonical overview.

## Process model

- **Frontend (`src/`)** — React 19 + TS + Vite + Tailwind 4 + Shadcn/ui,
  Zustand stores. Never touches the OS clipboard; all OS/db access goes through
  Tauri IPC (`invoke`/`emit`).
- **Backend (`src-tauri/src/`)** — Rust binary (`main.rs`) + library (`lib.rs`).
  Owns the DB, clipboard monitor thread, global hotkeys, tray, local HTTP API.

### Data flow: capture

`clipboard::monitor` (watcher) → hash (SHA-256) + classify
(`clipboard/format/{text,image,file}`) → insert into SQLite (dedup on unique
`hash`) → emit `clipboard-updated` → frontend prepends to `clipboardStore`
(after matching active filters). Writes Klip makes itself are suppressed via
`clipboard/suppress.rs` (one-shot TTL hash suppression — known holes in #17).

### Data flow: re-paste

pick item → `commands::paste_from_clipboard` → `clipboard/paste.rs` loads the
item → `clipboard/writer.rs` writes to the OS clipboard and arms suppression →
window hides → platform paste adapter (Windows restores HWND + Ctrl+V; macOS
Cmd+V; Linux delegates to `platform/linux.rs`).

### Backend module layout (`src-tauri/src/`)

- `commands/` — `#[tauri::command]` handlers (`mod.rs` core, `search.rs`,
  `productization.rs`); registered in `main.rs::invoke_handler!`.
- `clipboard/` — `backend.rs` (clipboard-rs adapter), `monitor.rs` (watcher +
  capture gating + dedupe), `suppress.rs`, `paste.rs`, `writer.rs` (sole write
  path), `format/` per-format extractors.
- `database/` — `connection.rs` singleton `Mutex<Connection>` as Tauri state;
  domain CRUD modules; schema in `init_schema` + `migrations.rs` gated on
  `db_version`.
- `search/` — Tantivy 0.24 index + jieba tokenizer, batched commits, health
  checks, SQLite rebuild, transparent fallback.
- `hotkey/manager.rs` — `tauri-plugin-global-shortcut`; `Ctrl+Alt+K` toggle +
  `Ctrl+Alt+1..9` quick paste resolved against the frontend-synced visible
  snapshot (`set_visible_clipboard_items`).
- `tray/setup.rs` — tray icon + menu; clicks toggle the window.
- `http/` — local HTTP API (`openapi.rs` is contract truth) for `web-klip/`.
- `platform/` — per-OS paste/clipboard helpers (`linux.rs`; the `windows`
  crate's `Win32_System_DataExchange` is cfg-gated).
- `lib.rs` — module exports + **tray-click guard** (`notify_tray_click()`,
  300 ms) that the focus-lost auto-hide consults.

### Frontend module layout (`src/`)

- `lib/tauri.ts` — **sole IPC surface** (`clipboardApi`, `configApi`,
  `systemApi`, event helpers).
- `stores/` — `clipboardStore` (history/filters/selection/tags/portability),
  `configStore` (settings, normalized via `configSchema.ts`, persisted via
  `set_config_many`), `productivityStore` (snippets, source rules, monitoring
  pause, privacy mode).
- `components/{clipboard,layout,ui}` — list/item rendering, `Header` search +
  `EmptyState`, Shadcn primitives.
- `types/index.ts` — kept in sync with `database/types.rs`; alias `@/* → src/*`.

## Persistence

- **SQLite (WAL)** at `app_data_dir()/klip.db` — `clipboard_items` (payload +
  attribution + annotations), `clipboard_formats` (plain/HTML/RTF variants),
  `clipboard_ocr`, `tags`/`clipboard_item_tags`, `snippets`,
  `clipboard_source_rules`, `app_config` (`db_version`-gated migrations).
  Field truth: `docs/DATABASE.md` + `database/migrations.rs`.
- **Tantivy index** at `app_data_dir()/search-index` — derived from SQLite,
  rebuildable.
- **Config** — `app_config` key/value seeded from `config/registry.rs`.

## External interfaces

- **Tauri IPC** — primary contract (`src/lib/tauri.ts` + `invoke_handler!`).
- **Local HTTP API** (`/api/*`) — for `web-klip/`; contract in
  `src-tauri/src/http/openapi.rs`; audit matrix in `docs/HTTP_ROUTE_AUDIT.md`.
- **OS** — clipboard-rs (all platforms), enigo (paste sim Win/macOS), Linux
  desktop helpers, `windows` crate for Windows-specific formats.
