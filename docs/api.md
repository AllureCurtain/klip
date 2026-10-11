# API conventions

Klip exposes two surfaces: **Tauri IPC** (the React frontend ↔ Rust backend,
the primary surface) and a **local HTTP API** (`/api/*`, served by the backend
for the `web-klip/` dashboard and external tooling).

Per-endpoint fields are **not** documented here — see `docs/decisions.md`
D-0002 for where field truth lives. The full command/event reference is
[API-zh.md](API-zh.md) until migration completes.

## Tauri IPC

- Request/response: `invoke()`; push: `emit`/`listen` events (e.g.
  `clipboard-updated`, `image-storage-warning`, `clipboard-item-updated`).
- **All calls go through `src/lib/tauri.ts`**, grouped into `clipboardApi`,
  `configApi`, `systemApi`, plus event-listener helpers. Components never call
  `invoke()` directly.
- Adding a command: handler in `src-tauri/src/commands/` (core in `mod.rs`,
  search in `search.rs`, productization in `productization.rs`), register in
  `main.rs::invoke_handler!`, add a typed wrapper in `src/lib/tauri.ts`, and
  keep `src/types/index.ts` in sync with `src-tauri/src/database/types.rs`.
- Backend validation errors return typed codes (`not_found`, `invalid_input`);
  the frontend surfaces them via the store/notification layer.
- The complete registered command list lives in `src-tauri/src/main.rs`.

### Key events

| Event | Payload | Emitted when |
| --- | --- | --- |
| `clipboard-updated` | `ClipboardItem` | a new item is stored (dedup on `hash` passed) |
| `clipboard-item-updated` | `ClipboardItem` | an existing item's annotations/tags changed |
| `image-storage-warning` | budget info | image storage exceeds the configured budget |

## Local HTTP API

- Served by the backend (`src-tauri/src/http/`); consumed by `web-klip/` and
  usable by third-party tools. Field/schema truth: `src-tauri/src/http/openapi.rs`.
- Route inventory and parity audit: `docs/HTTP_ROUTE_AUDIT.md`.
- JSON in/out; errors follow the handler's error envelope — match the shape in
  `openapi.rs`, don't invent per-route formats.
- Intended for localhost use; do not add remote exposure without a decision
  record in `decisions.md`.

## Shared conventions (both surfaces)

- Item identity: `id` (SQLite rowid) + `hash` (SHA-256 dedup key) — never treat
  `preview` as authoritative content; `content`/`metadata` are the payload.
- `content_type` discriminates text/image/file; image `content` is
  base64, `metadata` is JSON with structural info.
- Timestamps: `created_at`/`last_used_at` (epoch seconds; `last_used_at`
  updates on re-paste). Filter params taking ms timestamps say so explicitly.
- Filtering/pagination parameters are explicit (limit/offset/filter objects),
  not positional.
