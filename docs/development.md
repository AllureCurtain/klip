# Development

Environment setup, full command list, test strategy, and release process.
Detailed platform notes (Linux deps, driver installs, E2E internals) remain in
[DEVELOPMENT-zh.md](DEVELOPMENT-zh.md) until migration completes.

## Requirements

- **Node.js + pnpm** — package manager is pnpm; never `tauri` directly, use
  pnpm scripts.
- **Rust** (stable) — for `src-tauri/`.
- **Tauri 2 prerequisites** per platform: WebView2 on Windows (EdgeDriver for
  desktop E2E), webkit2gtk + `webkit2gtk-driver` on Linux.
- `pnpm install` installs the repo's pre-push hook (`pnpm verify`).

## First setup

```bash
pnpm install
pnpm tauri:dev     # frontend + Rust backend with HMR
```

`pnpm dev` runs only the Vite frontend — Tauri IPC is unavailable in a plain
browser. The dev server uses Vite's default port; `vite.config.ts` is wired so
the Rust process picks up the dev URL.

## Commands

| Command | What |
| --- | --- |
| `pnpm install` | install JS deps |
| `pnpm tauri:dev` | full app dev (frontend + backend, HMR) |
| `pnpm dev` | Vite frontend only |
| `pnpm build` | `tsc -b && vite build` (frontend) |
| `pnpm tauri:build` | production build incl. Tauri bundle |
| `pnpm verify` | full local gate: ESLint, Vitest, frontend build, cargo fmt check, clippy, cargo test |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest (frontend); `-- <file>` single file, `-- -t "<name>"` by name |
| `pnpm e2e` | Windows desktop E2E (needs tauri-driver + matching EdgeDriver) |
| `cd src-tauri && cargo test` | all Rust tests (`--test clipboard_format_test` for the integration file) |
| `cd src-tauri && cargo fmt && cargo clippy -- -D warnings` | format + lint, warnings as errors |

## Environment variables

Runtime dev isolation uses `KLIP_DATA_DIR`, `KLIP_LOG_DIR`, `KLIP_HTTP_PORT`
(see DEVELOPMENT-zh.md §2). There is no `.env` file; app configuration lives in
`app_config` (defaults seeded from `src-tauri/src/config/registry.rs`).

## Test strategy

- **Vitest** for frontend stores/components.
- **cargo test** for backend logic; `clipboard_format_test` is the integration
  suite. `cargo clippy -- -D warnings` is the lint gate; `cargo fmt` required.
- **Desktop E2E** (`e2e/` + `pnpm e2e`) — Selenium via tauri-driver; isolated
  data/log dirs; depends on a real desktop session so it is **not** part of
  `pnpm verify`. CI runs it via `.github/workflows/e2e.yml`.
- **CI gate** — `.github/workflows/ci.yml`.
- Tests must never contain local absolute paths, usernames, machine names, or
  IPs — use temp dirs / env injection.

## Regression checklist (per PR)

- `pnpm verify` green locally (or scope-matched checks + CI).
- New IPC: handler in `commands/`, registered in `invoke_handler!`, typed
  wrapper in `src/lib/tauri.ts`, types synced with `database/types.rs`.
- Schema change: migration in `database/migrations.rs` bumping `db_version`.
- Branch name matches `^(feat|fix|docs|refactor|test|chore|build|ci|perf)/<kebab>`;
  PR links `Closes #<issue>`.
- Affected docs updated in the same PR; `TODO.md` status updated.

## Branching & worktrees

All task work happens in a worktree off latest `main`
(`git worktree add .worktrees/<slug> -b <type>/<slug>`); `main` only receives
merges. Never commit directly on `main`; one worktree = one task.

## Release

- `.github/workflows/release.yml` builds/bundles; `docs/RELEASE_CHECKLIST.md`
  is the human acceptance gate; `docs/RELEASE_VALIDATION_v0.1.2.md` is a
  worked example.
- Release profile is aggressive (`lto`, `opt-level="s"`, `panic="abort"`,
  `strip`) — expect long release builds.
- Runtime artifacts (`src-tauri/klip_*.log`) are never committed.
