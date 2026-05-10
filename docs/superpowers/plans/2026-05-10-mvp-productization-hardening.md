# MVP Productization Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Windows-first MVP gaps by adding user-visible diagnostics, editable hotkey settings, repeatable release verification, and release handoff docs.

**Architecture:** Keep the existing Tauri IPC boundary: Rust owns OS paths and runtime behavior, `src/lib/tauri.ts` exposes typed frontend wrappers, and Zustand stores settings state. Add minimal UI to the existing settings dialog rather than creating new screens.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Zustand, Vitest, PowerShell.

---

## File Structure

- `src-tauri/src/database/types.rs` defines `DiagnosticsInfo` for the new IPC payload.
- `src-tauri/src/commands/mod.rs` adds path helper functions and `get_diagnostics_info`.
- `src-tauri/src/main.rs` registers the diagnostics command.
- `src/types/index.ts`, `src/lib/tauri.ts`, and `src/stores/configStore.ts` expose diagnostics to the frontend.
- `src/components/settings/SettingsPanel.tsx` renders diagnostics and editable hotkey fields.
- `src/components/settings/SettingsPanel.test.tsx` covers the new UI behavior before implementation.
- `scripts/verify-release.ps1`, `CHANGELOG.md`, and `docs/RELEASE_CHECKLIST.md` document and automate release verification.
- `package.json` adds `verify` and `release:verify` scripts.

### Task 1: Release Plan Foundation

**Files:**
- Create: `docs/superpowers/plans/2026-05-10-mvp-productization-hardening.md`

- [x] **Step 1: Save this implementation plan**

Expected: plan exists and scope is limited to Windows-first MVP hardening.

### Task 2: Diagnostics IPC

**Files:**
- Modify: `src-tauri/src/database/types.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add failing Rust helper tests**

Add tests in `src-tauri/src/commands/mod.rs` for stable path derivation and platform naming:

```rust
#[test]
fn diagnostics_paths_are_derived_from_app_data_dir() {
    let base = std::path::PathBuf::from(r"C:\Users\tester\AppData\Roaming\com.klip.app");
    let paths = build_diagnostics_paths(&base);

    assert!(paths.db_path.ends_with(std::path::Path::new("klip.db")));
    assert!(paths.log_dir.ends_with(std::path::Path::new("logs")));
}

#[test]
fn platform_name_is_supported_or_unknown() {
    assert!(matches!(platform_name(), "windows" | "macos" | "linux" | "unknown"));
}
```

- [ ] **Step 2: Run red test**

Run: `cargo test commands::tests::diagnostics_paths_are_derived_from_app_data_dir commands::tests::platform_name_is_supported_or_unknown`

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement minimal diagnostics command**

Add `DiagnosticsInfo`, `DiagnosticsPaths`, `platform_name`, `build_diagnostics_paths`, and `get_diagnostics_info`.

- [ ] **Step 4: Register IPC command**

Add `commands::get_diagnostics_info` to `tauri::generate_handler!`.

### Task 3: Settings Diagnostics and Hotkey UI

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src/stores/configStore.ts`
- Modify: `src/components/settings/SettingsPanel.tsx`
- Create: `src/components/settings/SettingsPanel.test.tsx`

- [ ] **Step 1: Add failing React tests**

Test that opening About fetches/renders diagnostics paths and that Shortcut inputs call hotkey setters.

- [ ] **Step 2: Run red test**

Run: `pnpm test -- --run src/components/settings/SettingsPanel.test.tsx`

Expected: FAIL because diagnostics and inputs do not exist.

- [ ] **Step 3: Add frontend diagnostics types and store state**

Add `DiagnosticsInfo`, `systemApi.getDiagnostics`, `diagnosticsInfo`, and `fetchDiagnosticsInfo`.

- [ ] **Step 4: Render diagnostics and editable hotkeys**

Fetch diagnostics when settings opens, display data/db/log paths in About, and replace Shortcut badges with controlled inputs.

### Task 4: Release Verification Assets

**Files:**
- Create: `CHANGELOG.md`
- Create: `docs/RELEASE_CHECKLIST.md`
- Create: `scripts/verify-release.ps1`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add release docs and script**

Document v0.1.0 MVP readiness, Windows smoke test steps, unsigned installer caveat, and scripted verification.

- [ ] **Step 2: Add npm scripts**

Add `verify` and `release:verify` without changing existing commands.

### Task 5: Full Verification

**Files:**
- All modified files

- [ ] **Step 1: Run frontend checks**

Run: `pnpm lint; pnpm test -- --run; pnpm build`

Expected: all pass with no warnings requiring action.

- [ ] **Step 2: Run Rust checks**

Run from `src-tauri`: `cargo fmt -- --check; cargo clippy -- -D warnings; cargo test`

Expected: all pass.

- [ ] **Step 3: Run release verification script**

Run: `pnpm release:verify -SkipBundle`

Expected: frontend, Rust, and metadata checks pass without rebuilding installers.

## Notes

- Do not create commits in this session; the user did not request git commits.
- Do not add auto-update, sync, import/export, or code-signing automation in this MVP hardening pass.
