# Klip documentation index

Entry point for all project docs. Klip is a Windows-first local clipboard
manager (Tauri 2 + React + Rust, SQLite + Tantivy).

**Language note**: the standard file set below is in English (project
convention since 2026-10-11). Legacy Chinese docs remain authoritative for the
details they cover until migrated; they are listed under "Chinese docs" and
kept reachable.

## Current status

| Item | Value |
| --- | --- |
| Public release | `v0.1.2` |
| Release candidate | `v0.2.0` |
| Release series | `0.2.x` (Windows packages `0.3.1` in progress) |
| Delivery platform | Windows 10+ (Linux X11 validated; macOS compile-verified only) |
| Form | local single-machine clipboard manager |
| Storage | local SQLite database |
| Progress | `TODO.md` (mirrors GitHub issues) |

## Standard file set (English, canonical)

Read these first:

| Doc | Purpose |
| --- | --- |
| [../AGENTS.md](../AGENTS.md) | Project rules for AI agents: stack, commands, hard rules |
| [../README.md](../README.md) | What Klip is and how to run it (user-facing, Chinese) |
| [../TODO.md](../TODO.md) | Current progress: in progress / next / blocked / done |
| [../DESIGN.md](../DESIGN.md) | Visual rules: token usage, states, accessibility |
| [product.md](product.md) | Product behavior: roles, flows, privacy, feature boundaries |
| [architecture.md](architecture.md) | Module boundaries and data flow (overview) |
| [api.md](api.md) | API conventions for Tauri IPC + local HTTP API |
| [decisions.md](decisions.md) | Technical decisions and rejected alternatives (incl. single-source map) |
| [development.md](development.md) | Setup, full command list, test strategy, release |
| [user-guide.md](user-guide.md) | Feature usage for end users |
| [../src/AGENTS.md](../src/AGENTS.md) | Frontend-only conventions |
| [../src-tauri/AGENTS.md](../src-tauri/AGENTS.md) | Backend-only conventions |

## Recommended reading order

1. [README.md](../README.md) — product, install, core workflows
2. [product.md](product.md) — feature scope and privacy model
3. [architecture.md](architecture.md) → [ARCHITECTURE-zh.md](ARCHITECTURE-zh.md) — module detail
4. [DATABASE.md](DATABASE.md) — schema, migrations, recovery
5. [api.md](api.md) → [API-zh.md](API-zh.md) — IPC command/event reference
6. [development.md](development.md) → [DEVELOPMENT-zh.md](DEVELOPMENT-zh.md) — env, debug, E2E
7. [DELIVERY_STATUS.md](DELIVERY_STATUS.md) — delivery evidence and merged PRs
8. [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) — release acceptance
9. [ROADMAP.md](ROADMAP.md) — boundaries and follow-ups

## Chinese docs (authoritative until migrated)

| Doc | Content | Migration target |
| --- | --- | --- |
| [PRD.md](PRD.md) | MVP scope and acceptance criteria | `product.md`, `user-guide.md` |
| [ARCHITECTURE-zh.md](ARCHITECTURE-zh.md) | Full module/flow detail | `architecture.md` |
| [API-zh.md](API-zh.md) | Per-command IPC fields, events, types | `api.md` conventions + code truth |
| [DEVELOPMENT-zh.md](DEVELOPMENT-zh.md) | Env, debug, E2E, release detail | `development.md` |
| [DATABASE.md](DATABASE.md) | Table schema and migration detail | `architecture.md` + `migrations.rs` |
| [DELIVERY_STATUS.md](DELIVERY_STATUS.md) | Merged scope + validation evidence | changelog/`TODO.md` |
| [ROADMAP.md](ROADMAP.md) | Boundaries and directions | `product.md` / decisions |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Release acceptance steps | `development.md` release section |
| [NEXT_PHASE_IMPLEMENTATION.md](NEXT_PHASE_IMPLEMENTATION.md) | Phase plan | `TODO.md` when scheduled |
| [UPGRADE_V8.md](UPGRADE_V8.md) | DB v8 upgrade, config keys, image budget | `architecture.md` note + decisions |
| [WINDOWS_ZIP.md](WINDOWS_ZIP.md) | Windows zip packaging notes | `development.md` release |

## Topic docs

| Doc | Content |
| --- | --- |
| [HTTP_ROUTE_AUDIT.md](HTTP_ROUTE_AUDIT.md) | Local HTTP API routes, OpenAPI, dashboard, test matrix |
| [MULTI_FORMAT_DESIGN.md](MULTI_FORMAT_DESIGN.md) | Rationale for text/HTML/RTF/image/file clipboard formats |
| [RELEASE_VALIDATION_v0.1.2.md](RELEASE_VALIDATION_v0.1.2.md) | Historical `v0.1.2` acceptance record |
| [design/](design/) | HTML design prototypes |

## Working principles

- Real Windows usage feedback and core-path defects first; no MVP scope creep.
- Copy, search, paste, hotkeys, tray, privacy state, data recovery and settings
  persistence require regression coverage.
- macOS/Linux desktop acceptance, signing, auto-update, cloud sync, plugins,
  accounts and DB encryption are not delivered capabilities.
- Every release starts fresh from a version decision + `RELEASE_CHECKLIST.md`;
  old build artifacts are not release evidence.

## Project info

- License: [MIT](../LICENSE) · Contributing: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Last updated: 2026-10-11 (doc standard applied)
