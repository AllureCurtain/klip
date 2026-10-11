# Decisions

Technical decisions and rejected alternatives. Read this before proposing or
undoing a technical choice. Newest last. Format per entry:

`D-NNNN — date — status (accepted|superseded by D-XXXX|reverted)`

---

## D-0001 — 2026-10-11 — accepted

**Adopted the `coding-standard` documentation file set.**

Context: the project grew a set of Chinese docs (`PRD`, `ARCHITECTURE`, `API`,
`DATABASE`, `DEVELOPMENT`, plus delivery/audit/design notes) with overlapping
scope and no single source-of-truth mapping.

Decision:

- Standard files added in English: `AGENTS.md`, `TODO.md`, `DESIGN.md`,
  `docs/product.md`, `docs/api.md`, `docs/decisions.md` (this file),
  `docs/development.md`, `docs/user-guide.md`, `src/AGENTS.md`,
  `src-tauri/AGENTS.md`, `.github/ISSUE_TEMPLATE/*`,
  `.github/pull_request_template.md`.
- Existing Chinese docs stay in place and remain authoritative until their
  content is migrated into the standard files; `docs/INDEX.md` routes readers.
  Migration is tracked in `TODO.md`.
- `docs/product.md` kept even though Klip is single-user: capture gating,
  privacy mode, sensitive detection, source rules, and the image budget are
  real product behavior that does not belong in `architecture.md`.
- `frontend/`/`backend/` sub-AGENTS files placed at `src/AGENTS.md` and
  `src-tauri/AGENTS.md` to match the actual layout.
- `README.md` stays Chinese (user-facing variant); `AGENTS.md` is the English
  canonical entry.
- `CLAUDE.md` reduced to a pointer to `AGENTS.md`; delete it once every
  contributor's Claude Code is confirmed ≥2.1.277 (reads `AGENTS.md`
  automatically).

Rejected: deleting/translating all Chinese docs in one pass (loses authoritative
content, big-bang PR); keeping `CLAUDE.md` as the rule file (double source
against `AGENTS.md`).

---

## D-0002 — 2026-10-11 — accepted

**Single-source-of-truth map for contract/schema/token facts.**

| Fact | Single source | Elsewhere |
| --- | --- | --- |
| Tauri IPC command surface + payload types | `src/lib/tauri.ts` + `invoke_handler!` in `src-tauri/src/main.rs` | `docs/api.md` = conventions only; `docs/API.md` (Chinese) = reference mirror until migrated |
| HTTP API (web-klip dashboard) | `src-tauri/src/http/openapi.rs` | `docs/HTTP_ROUTE_AUDIT.md` = route inventory audit |
| DB schema | `src-tauri/src/database/migrations.rs` + `init_schema` | `docs/DATABASE.md` documents, never invents columns |
| Design token values | `src/styles/globals.css` | `DESIGN.md` = usage rules only |
| App config defaults | `src-tauri/src/config/registry.rs` (`db_version` gated) | docs describe meaning, not values |
| Progress/status | `TODO.md` | never Claude memory or ad-hoc notes |
| Release steps | `.github/workflows/release.yml` + `docs/RELEASE_CHECKLIST.md` | |

Any new fact kind added to the codebase gets a row here before docs reference it.
