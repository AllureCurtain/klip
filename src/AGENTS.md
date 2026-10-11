# Frontend (src/)

React 19 + TypeScript + Vite + Tailwind 4 + Shadcn/ui + Zustand. Supplements the
root `AGENTS.md`; only frontend-specific rules live here.

## Layout

- `lib/tauri.ts` — **sole IPC surface**. All `invoke()` wrappers and event
  helpers, grouped into `clipboardApi` / `configApi` / `systemApi`. Extend this
  file; never call `invoke()` from components or stores.
- `stores/` — Zustand stores: `clipboardStore` (history, filters, selection,
  tags, import/export, backup/restore), `configStore` (settings normalized via
  `configSchema.ts`, persisted through `set_config_many`), `productivityStore`
  (snippets, source rules, monitoring pause, privacy mode).
- `components/clipboard/` — list and item rendering.
- `components/layout/` — `Header` (search input), `EmptyState`.
- `components/ui/` — Shadcn-generated primitives; regenerate, don't hand-edit.
- `types/index.ts` — `ClipboardItem`, `SystemInfo`, etc. Keep in sync with
  `src-tauri/src/database/types.rs`.
- `styles/globals.css` — **design token source of truth** (see `DESIGN.md`).
- Alias `@/*` → `src/*` (`tsconfig.json`, `vite.config.ts`).

## Conventions

- Events: `App.tsx` owns `listen('clipboard-updated' | 'clipboard-item-updated'
  | 'image-storage-warning')`; stores apply updates matching the active view.
- Live inserts must respect the active filter/search before touching the list.
- The visible-order snapshot (`set_visible_clipboard_items`, first 9 items)
  drives `Ctrl+Alt+1..9` quick paste — keep it in sync after any operation that
  reorders or filters the list.
- Styling: token utilities only (globals.css vars); no hardcoded colors — see
  `DESIGN.md`. Alpha-modified text must keep ≥4.5:1 contrast (issue #12).
- Settings persistence goes through `configStore` normalization +
  `set_config_many`; autostart is a separate OS side-effect command.
- Tests (Vitest) mock `lib/tauri.ts`, never IPC internals; no local paths,
  usernames, or machine names in test data.
