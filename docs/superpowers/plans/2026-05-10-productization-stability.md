# Productization Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Windows-first MVP into a locally verifiable release candidate with consistent version metadata, user-visible diagnostics, repeatable installer builds, and a release checklist.

**Architecture:** Keep the existing Tauri 2 + React + Rust architecture. Add a small diagnostics IPC surface, expose it in the existing Settings/About panel, add Windows-first release verification scripts, and document the manual QA path for installed builds without introducing GitHub Release automation, auto-update, code signing, sync, or import/export.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Zustand, Vitest, PowerShell, GitHub Actions, Windows NSIS/MSI bundles

---

## Current Baseline

- Branch: `main`
- Current MVP commit after CI cleanup: `bdfd6df ci: update action runtimes`
- CI status: `Frontend` and `Backend` are passing on GitHub Actions.
- Existing release command: `pnpm tauri:build`
- Expected local bundle output root: `src-tauri/target/release/bundle/`
- Current versions:
  - `package.json`: `0.1.0`
  - `src-tauri/Cargo.toml`: `0.1.0`
  - `src-tauri/tauri.conf.json`: `0.1.0`

## Product Scope

Implement this as a Windows-first `v0.2.0` productization pass.

Included:

- Version metadata consistency and `CHANGELOG.md`.
- Diagnostics command and About-panel diagnostics display.
- Windows release verification script that builds installer artifacts.
- Release checklist covering install, tray, autostart, hotkeys, persistence, uninstall, logs, and generated bundles.
- README/docs updates for local packaging and release-candidate verification.

Not included:

- GitHub Release automation.
- Auto-updater.
- Code signing certificate setup.
- Import/export, backup/restore, sync, plugins, AI, or sensitive-content rules.
- macOS/Linux packaging parity.

## File Structure

Create:

- `CHANGELOG.md` - human release notes for `v0.2.0`.
- `scripts/verify-release.ps1` - Windows release candidate verification and bundle build script.
- `docs/RELEASE_CHECKLIST.md` - manual QA checklist for installed builds.

Modify:

- `package.json` - bump version to `0.2.0`; add release verification scripts.
- `src-tauri/Cargo.toml` - bump version to `0.2.0`.
- `src-tauri/tauri.conf.json` - bump version to `0.2.0`; restrict bundle targets to Windows NSIS/MSI.
- `src-tauri/src/database/types.rs` - add `DiagnosticsInfo`.
- `src-tauri/src/commands/mod.rs` - add `get_diagnostics_info`.
- `src-tauri/src/main.rs` - register the new command.
- `src/types/index.ts` - add `DiagnosticsInfo`.
- `src/lib/tauri.ts` - add diagnostics API wrapper.
- `src/stores/configStore.ts` - fetch/store diagnostics info for the settings panel.
- `src/components/settings/SettingsPanel.tsx` - show compact diagnostics in About.
- `src/components/settings/SettingsPanel.test.tsx` - add About diagnostics rendering test.
- `README.md` - link release verification docs and document local bundle outputs.
- `docs/ROADMAP.md` - mark productization stability as the next post-MVP step.

---

### Task 1: Version and Changelog Foundation

**Files:**

- Create: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `README.md`

- [ ] **Step 1: Update version numbers to `0.2.0`**

Update `package.json`:

```json
{
  "name": "klip",
  "version": "0.2.0"
}
```

Keep all existing fields and scripts; only change the `version` value in this step.

Update `src-tauri/Cargo.toml`:

```toml
[package]
name = "klip"
version = "0.2.0"
description = "A cross-platform clipboard manager"
authors = ["Klip Team"]
edition = "2021"
```

Update `src-tauri/tauri.conf.json`:

```json
{
  "productName": "Klip",
  "version": "0.2.0",
  "identifier": "com.klip.app"
}
```

- [ ] **Step 2: Create `CHANGELOG.md`**

Create `CHANGELOG.md` with this content:

```markdown
# Changelog

All notable changes to Klip are documented here.

## [0.2.0] - Productization Stability

### Added

- Windows-first release verification workflow for local installer builds.
- Diagnostics information in the About panel for app version, platform, data directory, database path, and log directory.
- Manual release checklist for validating installed builds.

### Changed

- Version metadata is aligned across frontend, Rust backend, and Tauri bundle configuration.
- Documentation now distinguishes local release verification from future GitHub Release automation.

### Not Included

- Code signing and automatic updates remain future release work.
- Import/export, backup/restore, sync, plugins, and sensitive-content rules remain post-productization enhancements.

## [0.1.0] - MVP Readiness

### Added

- Windows-first clipboard history MVP.
- Text, image, and file-path clipboard support.
- Global hotkey toggle and quick paste hotkeys.
- Search, delete, favorite, settings, tray, autostart, and local SQLite storage.
- CI checks for frontend and backend.
```

- [ ] **Step 3: Add README release notes links**

In `README.md`, add a short "发布验证" section after "快速开始":

```markdown
## 发布验证

本地 Windows 安装包验证流程见 [Release Checklist](docs/RELEASE_CHECKLIST.md)。
版本变化记录见 [CHANGELOG.md](CHANGELOG.md)。
```

- [ ] **Step 4: Verify metadata still builds**

Run:

```powershell
pnpm build
```

Expected:

- Exit code `0`.
- Vite production build writes `dist/index.html` and `dist/assets/*`.

- [ ] **Step 5: Commit version foundation**

```powershell
git add CHANGELOG.md README.md package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: prepare productization version metadata"
```

---

### Task 2: Add Diagnostics IPC Surface

**Files:**

- Modify: `src-tauri/src/database/types.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`
- Test: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Add `DiagnosticsInfo` backend type**

In `src-tauri/src/database/types.rs`, add this near `SystemInfo`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsInfo {
    pub platform: String,
    pub app_version: String,
    pub data_dir: String,
    pub db_path: String,
    pub log_dir: String,
}
```

- [ ] **Step 2: Export `DiagnosticsInfo` from the database module**

In `src-tauri/src/database/mod.rs`, change the `types` export to include `DiagnosticsInfo`:

```rust
pub use types::{
    ClipboardItem, ConfigEntry, ContentType, DiagnosticsInfo, NewClipboardItem, SystemInfo,
};
```

This allows this import in `commands/mod.rs`:

```rust
use crate::database::{self, ClipboardItem, DiagnosticsInfo, SystemInfo};
```

- [ ] **Step 3: Add diagnostics path helper tests**

In `src-tauri/src/commands/mod.rs`, add a small pure helper plus tests before the command functions:

```rust
fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}
```

At the bottom of the file, add:

```rust
#[cfg(test)]
mod tests {
    use super::platform_name;

    #[test]
    fn platform_name_is_supported_value() {
        assert!(matches!(platform_name(), "windows" | "macos" | "linux" | "unknown"));
    }
}
```

- [ ] **Step 4: Run the focused backend test**

Run:

```powershell
cd src-tauri
cargo test platform_name_is_supported_value
```

Expected:

- Exit code `0`.
- The new test passes.

- [ ] **Step 5: Add `get_diagnostics_info` command**

In `src-tauri/src/commands/mod.rs`, add:

```rust
#[tauri::command]
pub fn get_diagnostics_info(app: tauri::AppHandle) -> Result<DiagnosticsInfo, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| e.to_string())?;
    let db_path = database::connection::get_db_path(&app)?;

    Ok(DiagnosticsInfo {
        platform: platform_name().to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        data_dir: data_dir.display().to_string(),
        db_path: db_path.display().to_string(),
        log_dir: log_dir.display().to_string(),
    })
}
```

Keep `get_system_info` behavior, but replace its duplicated platform logic with `platform_name()`:

```rust
Ok(SystemInfo {
    platform: platform_name().to_string(),
    version: env!("CARGO_PKG_VERSION").to_string(),
    app_version: env!("CARGO_PKG_VERSION").to_string(),
})
```

- [ ] **Step 6: Register command in Tauri handler**

In `src-tauri/src/main.rs`, add the new command to `tauri::generate_handler!`:

```rust
commands::get_diagnostics_info,
```

Place it next to `commands::get_system_info`.

- [ ] **Step 7: Verify Rust checks**

Run:

```powershell
cd src-tauri
cargo fmt -- --check
cargo clippy -- -D warnings
cargo test platform_name_is_supported_value
```

Expected:

- All commands exit `0`.

- [ ] **Step 8: Commit diagnostics backend**

```powershell
git add src-tauri/src/database/types.rs src-tauri/src/database/mod.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat: expose diagnostics info"
```

---

### Task 3: Show Diagnostics in About Panel

**Files:**

- Modify: `src/types/index.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src/stores/configStore.ts`
- Modify: `src/components/settings/SettingsPanel.tsx`
- Create: `src/components/settings/SettingsPanel.test.tsx`

- [ ] **Step 1: Add frontend diagnostics type**

In `src/types/index.ts`, add:

```ts
export interface DiagnosticsInfo {
  platform: 'windows' | 'macos' | 'linux' | 'unknown';
  app_version: string;
  data_dir: string;
  db_path: string;
  log_dir: string;
}
```

- [ ] **Step 2: Add API wrapper**

In `src/lib/tauri.ts`, update imports:

```ts
import type { ClipboardItem, DiagnosticsInfo, SystemInfo } from '@/types';
```

Add this method inside `systemApi`:

```ts
getDiagnostics: () => invoke<DiagnosticsInfo>('get_diagnostics_info'),
```

- [ ] **Step 3: Extend config store state**

In `src/stores/configStore.ts`, import the type:

```ts
import type { AppConfig, DiagnosticsInfo, SystemInfo } from '@/types';
```

Add state fields:

```ts
diagnosticsInfo: DiagnosticsInfo | null;
fetchDiagnosticsInfo: () => Promise<void>;
```

Initialize:

```ts
diagnosticsInfo: null,
```

Add the action:

```ts
fetchDiagnosticsInfo: async () => {
  try {
    const diagnosticsInfo = await systemApi.getDiagnostics();
    set({ diagnosticsInfo });
  } catch (error) {
    console.error('Failed to fetch diagnostics info:', error);
  }
},
```

- [ ] **Step 4: Fetch diagnostics when settings opens**

In `src/components/settings/SettingsPanel.tsx`, read from the store:

```ts
diagnosticsInfo,
fetchDiagnosticsInfo,
```

Update the open effect:

```ts
useEffect(() => {
  if (open) {
    setActiveTab(initialTab);
    fetchConfig();
    fetchSystemInfo();
    fetchDiagnosticsInfo();
  }
}, [open, initialTab, fetchConfig, fetchSystemInfo, fetchDiagnosticsInfo]);
```

- [ ] **Step 5: Add compact About diagnostics rows**

Inside the About tab, after the existing `systemInfo` block, add:

```tsx
{diagnosticsInfo && (
  <div className="space-y-2 text-sm">
    <Separator />
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">数据目录</span>
      <span className="truncate font-mono text-xs" title={diagnosticsInfo.data_dir}>
        {diagnosticsInfo.data_dir}
      </span>
    </div>
    <Separator />
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">数据库</span>
      <span className="truncate font-mono text-xs" title={diagnosticsInfo.db_path}>
        {diagnosticsInfo.db_path}
      </span>
    </div>
    <Separator />
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">日志目录</span>
      <span className="truncate font-mono text-xs" title={diagnosticsInfo.log_dir}>
        {diagnosticsInfo.log_dir}
      </span>
    </div>
  </div>
)}
```

Keep the text compact. Do not add a large onboarding or instructional section.

- [ ] **Step 6: Add About diagnostics rendering test**

Create `src/components/settings/SettingsPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel';

vi.mock('@/stores/configStore', () => ({
  useConfigStore: () => ({
    config: {
      max_history_count: 100,
      hotkey_toggle_window: 'Ctrl+Alt+K',
      hotkey_quick_paste_prefix: 'Ctrl+Alt',
      auto_start: false,
      close_to_tray: true,
      show_in_tray: true,
      window_width: 400,
      window_height: 600,
      search_debounce_ms: 150,
    },
    systemInfo: {
      platform: 'windows',
      version: '0.2.0',
      app_version: '0.2.0',
    },
    diagnosticsInfo: {
      platform: 'windows',
      app_version: '0.2.0',
      data_dir: 'C:\\Users\\Example\\AppData\\Roaming\\com.klip.app',
      db_path: 'C:\\Users\\Example\\AppData\\Roaming\\com.klip.app\\klip.db',
      log_dir: 'C:\\Users\\Example\\AppData\\Local\\com.klip.app\\logs',
    },
    loading: false,
    error: null,
    hasChanges: false,
    fetchConfig: vi.fn(),
    fetchSystemInfo: vi.fn(),
    fetchDiagnosticsInfo: vi.fn(),
    setMaxHistoryCount: vi.fn(),
    setAutoStart: vi.fn(),
    setCloseToTray: vi.fn(),
    setWindowWidth: vi.fn(),
    setWindowHeight: vi.fn(),
    setSearchDebounceMs: vi.fn(),
    saveChanges: vi.fn(),
    resetChanges: vi.fn(),
  }),
}));

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders diagnostics fields on the about tab', () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="about" />);

    expect(screen.getByText('数据目录')).toBeInTheDocument();
    expect(screen.getByText('数据库')).toBeInTheDocument();
    expect(screen.getByText('日志目录')).toBeInTheDocument();
  });
});
```

If `toBeInTheDocument` is not available in the current Vitest setup, replace those assertions with:

```ts
expect(screen.getByText('数据目录')).toBeTruthy();
expect(screen.getByText('数据库')).toBeTruthy();
expect(screen.getByText('日志目录')).toBeTruthy();
```

- [ ] **Step 7: Verify frontend checks**

Run:

```powershell
pnpm test
pnpm lint
pnpm build
```

Expected:

- All commands exit `0`.
- Vitest includes the new settings test.

- [ ] **Step 8: Commit diagnostics UI**

```powershell
git add src/types/index.ts src/lib/tauri.ts src/stores/configStore.ts src/components/settings/SettingsPanel.tsx src/components/settings/SettingsPanel.test.tsx
git commit -m "feat: show diagnostics in about panel"
```

---

### Task 4: Add Windows Release Verification Script

**Files:**

- Create: `scripts/verify-release.ps1`
- Modify: `package.json`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Make Windows bundle targets explicit**

In `src-tauri/tauri.conf.json`, change bundle targets from `"all"` to Windows installer targets:

```json
"bundle": {
  "active": true,
  "targets": ["nsis", "msi"]
}
```

Keep the existing icon and Windows signing fields.

- [ ] **Step 2: Add release verification scripts to `package.json`**

Add:

```json
"verify": "pnpm lint && pnpm test && pnpm build",
"release:verify": "powershell -ExecutionPolicy Bypass -File scripts/verify-release.ps1"
```

Keep the existing scripts. The final script block should still contain:

```json
"tauri:build": "tauri build"
```

- [ ] **Step 3: Create `scripts/verify-release.ps1`**

Create the script:

```powershell
$ErrorActionPreference = "Stop"

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Script
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Script
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

Invoke-Step "Install frontend dependencies" {
    pnpm install --frozen-lockfile
}

Invoke-Step "Frontend lint" {
    pnpm lint
}

Invoke-Step "Frontend tests" {
    pnpm test
}

Invoke-Step "Frontend build" {
    pnpm build
}

Invoke-Step "Rust format check" {
    Push-Location "src-tauri"
    cargo fmt -- --check
    Pop-Location
}

Invoke-Step "Rust clippy" {
    Push-Location "src-tauri"
    cargo clippy -- -D warnings
    Pop-Location
}

Invoke-Step "Rust tests" {
    Push-Location "src-tauri"
    cargo test
    Pop-Location
}

Invoke-Step "Tauri Windows installer build" {
    pnpm tauri:build
}

$BundleRoot = Join-Path $RepoRoot "src-tauri\target\release\bundle"
$Installers = @()
if (Test-Path $BundleRoot) {
    $Installers = Get-ChildItem $BundleRoot -Recurse -File -Include *.exe, *.msi
}

if ($Installers.Count -eq 0) {
    throw "No Windows installer artifacts were produced under $BundleRoot"
}

Write-Host ""
Write-Host "Installer artifacts:" -ForegroundColor Green
$Installers | Sort-Object FullName | ForEach-Object {
    $SizeMb = [Math]::Round($_.Length / 1MB, 2)
    Write-Host ("- {0} ({1} MB)" -f $_.FullName, $SizeMb)
}
```

- [ ] **Step 4: Run quick verification before full installer build**

Run:

```powershell
pnpm verify
```

Expected:

- `pnpm lint` exits `0`.
- `pnpm test` exits `0`.
- `pnpm build` exits `0`.

- [ ] **Step 5: Run release verification**

Run:

```powershell
pnpm release:verify
```

Expected:

- Frontend and Rust checks pass.
- `pnpm tauri:build` exits `0`.
- Script prints at least one `.exe` or `.msi` path under `src-tauri\target\release\bundle`.

- [ ] **Step 6: Commit release verification script**

```powershell
git add scripts/verify-release.ps1 package.json src-tauri/tauri.conf.json
git commit -m "chore: add windows release verification"
```

---

### Task 5: Add Release Checklist and Docs

**Files:**

- Create: `docs/RELEASE_CHECKLIST.md`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Create `docs/RELEASE_CHECKLIST.md`**

Create:

```markdown
# Klip Release Checklist

This checklist validates a Windows-first local release candidate. It does not publish a GitHub Release.

## 1. Preflight

- [ ] `git status --short --branch` shows a clean branch synced with `origin/main`.
- [ ] `pnpm install --frozen-lockfile` succeeds.
- [ ] `pnpm verify` succeeds.
- [ ] `cd src-tauri && cargo fmt -- --check` succeeds.
- [ ] `cd src-tauri && cargo clippy -- -D warnings` succeeds.
- [ ] `cd src-tauri && cargo test` succeeds.

## 2. Installer Build

- [ ] `pnpm release:verify` succeeds.
- [ ] At least one `.exe` installer is produced under `src-tauri/target/release/bundle/nsis/`.
- [ ] At least one `.msi` installer is produced under `src-tauri/target/release/bundle/msi/`.
- [ ] The generated installer version matches `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

## 3. Fresh Install Smoke Test

- [ ] Install Klip from the generated installer.
- [ ] Launch Klip.
- [ ] Confirm the app starts hidden or tray-first according to the configured behavior.
- [ ] Confirm the tray icon appears.
- [ ] Open Klip from the tray menu.
- [ ] Open Settings from the tray menu.
- [ ] Open About from the tray menu.
- [ ] Confirm About shows version, platform, data directory, database path, and log directory.

## 4. Clipboard Workflow

- [ ] Copy plain text and confirm it appears in history.
- [ ] Copy an image and confirm an image preview appears.
- [ ] Copy one or more file paths and confirm file metadata appears.
- [ ] Search for copied text and confirm the list filters.
- [ ] Delete one item and confirm it disappears.
- [ ] Clear history and confirm the list empties after confirmation.

## 5. Hotkeys and Window Behavior

- [ ] `Ctrl+Alt+K` opens Klip from another application.
- [ ] `Ctrl+Alt+K` hides Klip when it is visible.
- [ ] `Ctrl+Alt+1` pastes the top item into the previously focused application.
- [ ] `Esc` behavior is checked if implemented in the current build; otherwise record it as not supported.
- [ ] Window size settings persist after restart.
- [ ] Close-to-tray behavior follows the setting.

## 6. Autostart

- [ ] Enable autostart in Settings.
- [ ] Quit Klip.
- [ ] Restart Windows or sign out/sign in.
- [ ] Confirm Klip launches according to the enabled autostart state.
- [ ] Disable autostart in Settings.
- [ ] Restart Windows or sign out/sign in.
- [ ] Confirm Klip does not auto-launch.

## 7. Persistence and Logs

- [ ] Copy several items.
- [ ] Quit Klip from the tray.
- [ ] Relaunch Klip and confirm history is preserved.
- [ ] Confirm the database file exists at the About-panel database path.
- [ ] Confirm log files exist in the About-panel log directory.
- [ ] Confirm no obvious panic or repeated error appears in the newest log file.

## 8. Uninstall Check

- [ ] Uninstall Klip through Windows Apps settings or Control Panel.
- [ ] Confirm the application binary is removed.
- [ ] Record whether local app data remains. Keeping local data is acceptable for this version unless an explicit data-removal option has been implemented.
- [ ] Confirm autostart registration is not left enabled after uninstall.

## 9. Known Distribution Caveats

- [ ] Unsigned installers may trigger Windows SmartScreen warnings.
- [ ] Public distribution should use code signing before broad release.
- [ ] GitHub Release publishing and updater metadata are future tasks.
```

- [ ] **Step 2: Update README packaging section**

In `README.md`, add or update local build instructions:

````markdown
## 本地打包

Windows 本地验证命令：

```powershell
pnpm release:verify
```

安装包输出目录：

- `src-tauri/target/release/bundle/nsis/`
- `src-tauri/target/release/bundle/msi/`
````

- [ ] **Step 3: Update roadmap**

In `docs/ROADMAP.md`, add a productization step under Post-MVP:

```markdown
- Windows productization stability: version metadata, local installer verification, diagnostics, release checklist, and manual installed-build QA.
```

Keep import/export, backup/restore, sync, and plugins as later items.

- [ ] **Step 4: Verify docs links and wording**

Run:

```powershell
rg -n "RELEASE_CHECKLIST|release:verify|CHANGELOG|GitHub Release|auto-updater|自动更新|导入|导出" README.md docs CHANGELOG.md
```

Expected:

- `README.md` links `docs/RELEASE_CHECKLIST.md`.
- `CHANGELOG.md` exists and mentions `0.2.0`.
- GitHub Release automation and auto-updater appear only as future/deferred items.
- Import/export appears only as future/deferred work.

- [ ] **Step 5: Commit release docs**

```powershell
git add docs/RELEASE_CHECKLIST.md README.md docs/ROADMAP.md
git commit -m "docs: add windows release checklist"
```

---

### Task 6: Final Verification and Handoff

**Files:**

- Review all files changed by Tasks 1-5.

- [ ] **Step 1: Run canonical local verification**

Run from repo root:

```powershell
pnpm lint
pnpm test
pnpm build
```

Run from `src-tauri`:

```powershell
cargo fmt -- --check
cargo clippy -- -D warnings
cargo test
```

Expected:

- All commands exit `0`.
- Frontend test count includes the new settings diagnostics test.
- Rust test count includes the new platform helper test.

- [ ] **Step 2: Run packaging verification**

Run:

```powershell
pnpm release:verify
```

Expected:

- Script exits `0`.
- Script prints installer artifacts.
- `src-tauri/target/release/bundle/nsis/` contains an `.exe`.
- `src-tauri/target/release/bundle/msi/` contains an `.msi`.

- [ ] **Step 3: Inspect final diff**

Run:

```powershell
git status --short --branch
git log --oneline --decorate -8
```

Expected:

- Branch is ahead of `origin/main` only if commits have not been pushed yet.
- Working tree is clean after the final commit.
- Recent commits show the planned slices:
  - `chore: prepare productization version metadata`
  - `feat: expose diagnostics info`
  - `feat: show diagnostics in about panel`
  - `chore: add windows release verification`
  - `docs: add windows release checklist`

- [ ] **Step 4: Push branch if this session owns publishing**

Run only after all verification passes:

```powershell
git push origin main
```

Expected:

- Push succeeds.
- GitHub Actions CI starts.

- [ ] **Step 5: Verify GitHub Actions**

Run:

```powershell
gh run list --limit 3
gh run watch <new-run-id> --exit-status
```

Expected:

- CI conclusion is `success`.
- Frontend and Backend jobs pass.
- Check-run annotations are `0`, or any annotations are documented as non-blocking.

## Handoff Notes for the Next Conversation

Start the next implementation conversation with:

```text
请按照 docs/superpowers/plans/2026-05-10-productization-stability.md 执行。先确认工作区状态，然后从 Task 1 开始。不要做 GitHub Release 自动发布、自动更新、导入导出或同步功能。
```

If implementation time is limited, stop after Task 4. That still produces a usable local release-candidate verification path. Task 5 is documentation and manual QA polish, but it should be completed before calling `v0.2.0` releasable.
