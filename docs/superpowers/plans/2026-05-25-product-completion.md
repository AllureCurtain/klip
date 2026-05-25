# Product Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Klip's P0/P1/P2 product gaps except macOS/Linux parity.

**Architecture:** Add backend product modules for snippets, monitoring gates, advanced search, readiness diagnostics, and release configuration. Expose typed IPC wrappers and extend existing Zustand stores and compact settings/list UI.

**Tech Stack:** Rust/Tauri 2, SQLite/rusqlite, React 19, TypeScript, Zustand, Vitest, Cargo tests.

---

## File Structure

- Modify `src-tauri/src/database/connection.rs`: schema tables and config defaults.
- Modify `src-tauri/src/database/types.rs`: shared serializable types.
- Modify `src-tauri/src/database/productization.rs`: advanced search and source-rule logic.
- Create `src-tauri/src/database/snippets.rs`: snippet CRUD/search.
- Modify `src-tauri/src/database/mod.rs`: export new database modules.
- Modify `src-tauri/src/commands/productization.rs`: IPC commands.
- Modify `src-tauri/src/clipboard/monitor.rs`: monitoring/privacy/source gates.
- Modify `src-tauri/src/main.rs`: register new commands.
- Modify `src/lib/tauri.ts`: typed frontend wrappers.
- Modify `src/types/index.ts`: TypeScript types.
- Modify `src/stores/clipboardStore.ts`: advanced query options and per-item tag actions.
- Create `src/stores/productivityStore.ts`: snippets, privacy, source rules, readiness state.
- Modify `src/components/clipboard/ClipboardItem.tsx`: per-row tag menu.
- Modify `src/components/layout/Header.tsx` and `HeaderMoreMenu.tsx`: advanced search and pause/privacy actions.
- Modify `src/components/settings/SettingsView.tsx` and `DataManagementView.tsx`: snippets, source rules, readiness, diagnostics, result summaries.
- Modify `scripts/verify-release.ps1`: signing/update readiness checks.

## Tasks

- [x] Backend schema and type tests for snippets, source rules, monitoring/privacy config, and advanced search options.
- [x] Backend implementation for schema, snippets, source rules, monitoring gates, and advanced search.
- [x] IPC wrappers and frontend type tests for the new commands.
- [x] Frontend store tests and implementation for advanced filters, snippets, privacy mode, source rules, readiness, and operation summaries.
- [x] Clipboard row UI tests and implementation for single-item tag assignment/removal.
- [x] Header/settings UI tests and implementation for shortcut validation, advanced search, privacy mode, snippets, source rules, diagnostics, update/signing/sync/plugin readiness.
- [x] Release script tests/manual verification for update/signing readiness without requiring real credentials.
- [x] Update README, PRD/Roadmap, API, database docs, and release checklist to reflect the completed local capabilities and external credential boundaries.
- [x] Run targeted frontend tests, targeted Rust tests, then full available verification.
