# Product

Klip is a local-first clipboard manager: a tray app that captures what the user
copies, stores it locally, and lets them find and re-paste it fast via a global
hotkey.

## Roles

- **The user** — single local user per OS account; no accounts, no sync.
- **The OS** — clipboard provider and paste target; per-platform adapters
  (Windows/macOS/Linux) differ in capabilities.
- **web-klip dashboard** — optional read/manage surface over the local HTTP API;
  same single user, no additional authority.

## Core flows

1. **Capture** — clipboard monitor watches changes, classifies
   text/image/file, dedups on SHA-256, stores to SQLite, emits
   `clipboard-updated`. Multi-format text keeps plain/HTML/RTF variants
   (`clipboard_formats`).
2. **Find** — search over content/preview (+ OCR text for images) via Tantivy
   with transparent fallback; filters by type/favorite/tag/time; sortable.
3. **Re-paste** — pick an item → written back through `clipboard::writer` →
   window hides → synthetic paste (platform adapter). Quick-paste slots 1–9 map
   to the currently visible order.
4. **Organize** — favorites, tags, custom titles/notes, snippets (reusable text
   blocks), bulk delete/favorite.
5. **Configure** — global hotkeys (toggle `Ctrl+Alt+K`, quick-paste prefix +
   digits), autostart, window size, monitoring, storage budgets.

## Privacy & capture control

- **Privacy mode** — timed suppression of capture; re-enable manually or on
  expiry.
- **Pause monitoring** — stop capturing entirely until resumed.
- **Source rules** — ignore captures from processes/window titles matching
  user-defined rules.
- **Sensitive detection** — items flagged `is_sensitive` (+reason) are masked in
  the UI and handled by a dedicated rescan (`rescan_sensitive_items`).
- **Image budget** — images are the expensive payload; a storage budget with a
  UI warning (`image-storage-warning`) caps growth; OCR is offline and
  queue-based.
- **Self-suppression** — writes made by Klip itself must not be re-captured as
  new items (see `clipboard/suppress.rs`; known holes tracked in issue #17).

## Surfaces

- Tray icon + menu (toggle window, quick actions)
- Main window: list, search, filters, item actions
- Settings: rail-navigated sections (shortcuts, behavior, storage, data)
- `web-klip/`: optional local dashboard

## Out of scope

Cloud sync, accounts/multi-user, mobile, cross-device history, password-manager
capture guarantees (source rules are best-effort by process/window title).
