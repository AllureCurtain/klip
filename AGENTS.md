# Klip

A cross-platform clipboard manager: Tauri 2.0 tray app that monitors the system
clipboard, persists history to local SQLite, and provides a global-hotkey UI for
searching and re-pasting items.

## Tech stack

- Frontend: React 19 + TypeScript + Vite + Tailwind 4 + Shadcn/ui + Zustand (`src/`)
- Backend: Rust, Tauri 2 (`src-tauri/`) — commands, clipboard monitor, hotkeys, tray
- Storage: SQLite (WAL) at `app_data_dir()/klip.db` + Tantivy full-text index
- Optional dashboard sub-app: `web-klip/` (HTTP API served by the backend)
- Package manager: **pnpm** (invoke Tauri through pnpm scripts, never `tauri` directly)

## Layout

- `src/` — React frontend (see `src/AGENTS.md`)
- `src-tauri/` — Rust backend (see `src-tauri/AGENTS.md`)
- `web-klip/` — separate dashboard frontend for the HTTP API
- `e2e/` — CDP end-to-end scripts
- `docs/` — authoritative documentation (being migrated to English; see `docs/INDEX.md`)
- `.worktrees/` — task worktrees, git-ignored

## Common commands

```bash
pnpm install          # dependencies
pnpm tauri:dev        # full app in development (frontend + Rust, HMR)
pnpm test             # frontend tests (Vitest)
pnpm lint             # ESLint
cd src-tauri && cargo test   # backend tests
pnpm tauri:build      # production build
```

## Development process

- **Issue-driven**: every change starts from a GitHub issue with acceptance
  criteria; `TODO.md` mirrors issue status. One PR = one minimal feature/issue;
  split unrelated work. PRs may contain multiple commits split by logical step.
- **Worktree flow**: do not work directly in the main checkout. Sync `main`,
  then `git worktree add .worktrees/<slug> -b <type>/<slug>` per task, and remove
  the worktree after merge. Never commit on `main` — it only receives merges.
- **Branch naming**: `^(feat|fix|docs|refactor|test|chore|build|ci|perf)/(?![0-9]+(?:-|$))[a-z0-9]+(-[a-z0-9]+)*$`.
  No issue numbers in branch names — link with `Closes #123` in the PR.
- **Language**: all project docs, comments, and commit messages in English.
- **Tests never contain** local absolute paths, drive letters, usernames, machine
  names, IPs, or paths from other projects — use tempdir/env injection.

## Hard rules

- All IPC goes through `src/lib/tauri.ts`; never call `invoke()` in components.
- All saved-item clipboard writes go through `clipboard::copy_to_clipboard`
  (`clipboard/writer.rs`); never instantiate `clipboard-rs` contexts elsewhere.
- New commands: define in `src-tauri/src/commands/`, register in
  `main.rs::invoke_handler!`, add a typed wrapper in `src/lib/tauri.ts`.
- Schema changes go through `database/migrations.rs` gated on `db_version`.
- Window-toggling code must route through `notify_tray_click()` (300 ms
  auto-hide guard in `lib.rs`).
- Read `docs/decisions.md` before proposing or undoing a technical decision.
- Update `TODO.md` with the PR that changes task state.

## Doc index

| Doc | Purpose |
| --- | --- |
| `README.md` | What Klip is and how to run it (user-facing, Chinese) |
| `TODO.md` | Current progress: in progress / next / blocked / done |
| `DESIGN.md` | Visual rules: tokens, states, accessibility |
| `docs/product.md` | Product behavior: roles, flows, feature boundaries |
| `docs/architecture.md` | Module boundaries and data flow |
| `docs/api.md` | API conventions (IPC + HTTP); field truth lives in code |
| `docs/decisions.md` | Technical decisions and rejected alternatives |
| `docs/development.md` | Setup, full command list, test strategy, release |
| `docs/user-guide.md` | Feature usage for end users |
| `docs/INDEX.md` | Full doc map incl. the authoritative Chinese docs |
| `src/AGENTS.md` | Frontend-only conventions |
| `src-tauri/AGENTS.md` | Backend-only conventions |

## Doc update rules

- Same fact lives in one place only — link, don't repeat (see `docs/decisions.md`
  D-0002 for the single-source map).
- Update the affected doc in the same PR as the code change.
- `TODO.md` "recently completed" keeps at most 10 entries.
