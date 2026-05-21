# Klip v0.1.0 Release Handoff

> Last updated: 2026-05-21 17:25 Asia/Shanghai

This handoff captures the exact state of the Windows-first `v0.1.0`
release work so another environment can continue without replaying the
conversation history.

## Current Repository State

- Repository: `AllureCurtain/klip`
- Branch: `main`
- Commit to continue from: `a692aad8c5f60b23e9ac806711424f007c268514`
- Commit message: `test: add desktop e2e and release workflow`
- Local working tree before this handoff document: clean and synced with
  `origin/main`
- User instruction at the stop point: do not continue installer/system-level
  operations in the current environment; write this handoff, clean generated
  files, commit, and push.

## What Was Already Completed

### CI

The push CI for commit `a692aad8c5f60b23e9ac806711424f007c268514` completed
successfully:

```powershell
gh run list --commit a692aad8c5f60b23e9ac806711424f007c268514 --limit 5
```

Observed result:

```text
completed  success  test: add desktop e2e and release workflow  CI  main  push  26215290477
```

That CI run included:

- Backend on `windows-2022`
- Frontend matrix on `windows-2022`, `macos-15`, and `ubuntu-24.04`

### Local Release Verification and Installer Build

This command completed successfully in the original Windows environment:

```powershell
pnpm release:verify
```

Observed local artifacts:

```text
src-tauri/target/release/bundle/msi/Klip_0.1.0_x64_en-US.msi  3710976 bytes
src-tauri/target/release/bundle/nsis/Klip_0.1.0_x64-setup.exe 2765794 bytes
```

Those local build artifacts are generated output and are expected to be deleted
before committing this handoff. Regenerate them with `pnpm release:verify` if
the next environment needs local copies.

### GitHub Release Workflow

The Release workflow was manually triggered:

```powershell
gh workflow run Release --ref main -f tag=v0.1.0 -f draft=true
```

The resulting workflow run completed successfully:

```powershell
gh run view 26216493348 --json status,conclusion,name,headSha,event,createdAt,url,jobs
```

Observed result:

```text
name: Release
event: workflow_dispatch
headSha: a692aad8c5f60b23e9ac806711424f007c268514
status: completed
conclusion: success
run URL: https://github.com/AllureCurtain/klip/actions/runs/26216493348
job: Windows installers
job conclusion: success
```

The run created a draft GitHub Release:

```powershell
gh release view v0.1.0 --json name,tagName,isDraft,isPrerelease,url,assets
```

Observed draft release state:

```text
name: Klip v0.1.0
tagName: v0.1.0
isDraft: true
isPrerelease: false
url: https://github.com/AllureCurtain/klip/releases/tag/untagged-81fb3d63b83075cb1d66
```

Observed release assets:

```text
Klip_0.1.0_x64_en-US.msi
size: 3710976
sha256: 3b8e4d3b2bfa3289b921003a9bd1f0136500310c81efc36b98c4e7de40341267

Klip_0.1.0_x64-setup.exe
size: 2763706
sha256: 6c8097fb75948299487c8dfc94ace3295bc6b2371eb9422526dd1a0cb03d7d52
```

Important: there is currently no local or remote Git tag named `v0.1.0`.
These checks returned no tag / 404 at the time this handoff was written:

```powershell
git tag --list 'v0.1.0'
gh api repos/AllureCurtain/klip/git/ref/tags/v0.1.0
gh api repos/AllureCurtain/klip/releases/tags/v0.1.0
```

This matters because the manually created draft release currently uses a
GitHub `untagged-*` URL. The next environment must decide whether to publish
that draft as-is, create and push the actual `v0.1.0` tag first, or delete and
recreate the release from a tag push.

## What Was Intentionally Not Completed

No installer was installed in this environment after the user asked to stop.
The following are not yet verified:

- NSIS installer fresh install smoke test
- MSI installer smoke test
- Installed app starts hidden/tray-first
- Tray menu behavior after install
- `Ctrl+Alt+K` global hotkey after install
- `Ctrl+Alt+1` through `Ctrl+Alt+9` quick paste after install
- Text/image/file clipboard capture in an installed build
- Settings persistence in an installed build
- Autostart enable/disable plus sign out/in or reboot verification
- Uninstall behavior and autostart cleanup
- Draft release publication

## Required Tools in the Next Environment

Use a Windows desktop session for installer validation. A headless session is
not enough for hotkeys, tray, clipboard, or WebDriver checks.

Required:

- Git
- GitHub CLI authenticated for `AllureCurtain/klip`
- Node.js 24.x
- pnpm 10.x
- Rust stable toolchain with `rustfmt` and `clippy`
- PowerShell
- Microsoft Edge WebDriver on `PATH` for E2E
- `tauri-driver` for E2E

Install E2E native tools if missing:

```powershell
cargo install tauri-driver --locked
winget install --id Microsoft.EdgeDriver --exact
```

Verify basic tool availability:

```powershell
git --version
gh auth status
node --version
pnpm --version
rustc --version
cargo --version
tauri-driver --version
msedgedriver --version
```

## Recommended Continuation Plan

### Task 1: Restore and Inspect Repository State

**Files:**

- Read: `docs/RELEASE_HANDOFF.md`
- Read: `docs/RELEASE_CHECKLIST.md`
- Read: `README.md`
- Read: `CHANGELOG.md`
- Read: `.github/workflows/release.yml`

- [ ] **Step 1: Clone or update the repository**

```powershell
git clone https://github.com/AllureCurtain/klip.git
cd klip
git fetch --all --tags
git checkout main
git pull --ff-only
```

Expected:

```text
Already up to date.
```

- [ ] **Step 2: Confirm the expected commit**

```powershell
git rev-parse HEAD
```

Expected:

```text
a692aad8c5f60b23e9ac806711424f007c268514
```

If the head commit is newer, inspect the new commits before continuing:

```powershell
git log --oneline a692aad8c5f60b23e9ac806711424f007c268514..HEAD
```

- [ ] **Step 3: Confirm the draft release state**

```powershell
gh release view v0.1.0 --json name,tagName,isDraft,isPrerelease,url,assets
```

Expected:

```text
isDraft: true
tagName: v0.1.0
assets include Klip_0.1.0_x64_en-US.msi and Klip_0.1.0_x64-setup.exe
```

- [ ] **Step 4: Confirm whether a real Git tag exists**

```powershell
git tag --list 'v0.1.0'
gh api repos/AllureCurtain/klip/git/ref/tags/v0.1.0
```

Expected today:

```text
No local tag output, and GitHub API 404 for the remote ref.
```

If the tag exists in the next environment, inspect where it points:

```powershell
git rev-list -n 1 v0.1.0
```

The expected release commit is:

```text
a692aad8c5f60b23e9ac806711424f007c268514
```

### Task 2: Decide How to Normalize the Release Tag

The current draft release was created by `workflow_dispatch` using the input
`tag=v0.1.0`, but no Git tag exists yet. Choose one path before publication.

**Recommended path: create the tag on the known release commit, then recreate
the draft from the tag push if GitHub will not attach the existing draft to the
new tag cleanly.**

- [ ] **Step 1: Create the annotated tag locally**

```powershell
git tag -a v0.1.0 a692aad8c5f60b23e9ac806711424f007c268514 -m "Klip v0.1.0"
```

- [ ] **Step 2: Push the tag**

```powershell
git push origin v0.1.0
```

Expected:

```text
* [new tag]         v0.1.0 -> v0.1.0
```

This will trigger `.github/workflows/release.yml` again because it listens to
`v*` tag pushes.

- [ ] **Step 3: Watch the tag-triggered Release workflow**

```powershell
gh run list --workflow Release --limit 5
$releaseRuns = gh run list --workflow Release --limit 5 --json databaseId,event,status,conclusion,createdAt,headSha | ConvertFrom-Json
$newRun = $releaseRuns | Sort-Object createdAt -Descending | Select-Object -First 1
$newRun
gh run watch $newRun.databaseId --exit-status
```

Expected:

```text
Release workflow completes with conclusion success.
```

- [ ] **Step 4: Inspect resulting release objects**

```powershell
gh release list --limit 10
gh release view v0.1.0 --json name,tagName,isDraft,isPrerelease,url,assets
```

Expected final state:

```text
Exactly one draft release for v0.1.0 with MSI and NSIS assets.
```

If there are duplicate draft releases, keep the one attached to the real
`v0.1.0` tag and delete the untagged duplicate only after explicit human
confirmation. First list all release records and assets:

```powershell
gh api repos/AllureCurtain/klip/releases --jq '.[] | {id, tag_name, draft, name, html_url, assets: [.assets[].name]}'
```

Expected before any deletion:

```text
The real-tag draft has both installers. The duplicate has no assets worth
preserving or its assets have been copied/re-uploaded to the real-tag draft.
```

Use the GitHub UI for deletion unless there is a specific reason to use the
API. Do not delete a draft release in an automated command without naming the
exact release `id` and getting confirmation in the active session.

### Task 3: Run Local Verification in the New Environment

**Files:**

- Script: `scripts/verify-release.ps1`
- Script: `scripts/run-e2e.ps1`
- Reference: `e2e/README.md`

- [ ] **Step 1: Install dependencies**

```powershell
pnpm install --frozen-lockfile
```

Expected:

```text
Lockfile is up to date, resolution step is skipped
```

- [ ] **Step 2: Run the standard verification suite**

```powershell
pnpm verify
```

Expected:

```text
eslint passes
Vitest reports 3 files and 16 tests passed
vite build succeeds
cargo fmt -- --check succeeds
cargo clippy -- -D warnings succeeds
cargo test succeeds
```

- [ ] **Step 3: Run release verification with installer build**

```powershell
pnpm release:verify
```

Expected:

```text
MSI:  src-tauri/target/release/bundle/msi/Klip_0.1.0_x64_en-US.msi
NSIS: src-tauri/target/release/bundle/nsis/Klip_0.1.0_x64-setup.exe
Release verification complete
```

- [ ] **Step 4: Run desktop E2E**

```powershell
pnpm e2e
```

Expected:

```text
The E2E suite starts tauri-driver, launches Klip with isolated e2e/.tmp data,
and passes the text copy/search/paste restoration flow.
```

If `pnpm e2e` fails because of WebDriver or clipboard session constraints, do
not patch application code first. Verify `tauri-driver`, `msedgedriver`, PATH,
and that the session is an interactive Windows desktop.

### Task 4: Download or Use Installer Artifacts

Use either the GitHub draft release assets or locally generated artifacts.

- [ ] **Step 1: Download draft release assets**

```powershell
New-Item -ItemType Directory -Force .release-artifacts | Out-Null
gh release download v0.1.0 --dir .release-artifacts
Get-ChildItem .release-artifacts
```

Expected:

```text
Klip_0.1.0_x64_en-US.msi
Klip_0.1.0_x64-setup.exe
```

- [ ] **Step 2: Verify SHA-256 checksums against the draft release**

```powershell
Get-FileHash .release-artifacts\Klip_0.1.0_x64_en-US.msi -Algorithm SHA256
Get-FileHash .release-artifacts\Klip_0.1.0_x64-setup.exe -Algorithm SHA256
```

Expected for the assets produced by run `26216493348`:

```text
MSI  SHA256 3B8E4D3B2BFA3289B921003A9BD1F0136500310C81EFC36B98C4E7DE40341267
EXE  SHA256 6C8097FB75948299487C8DFC94ACE3295BC6B2371EB9422526DD1A0CB03D7D52
```

If the release was recreated from a real tag, record the new checksums in the
release notes.

### Task 5: Fresh Install Smoke Test

Use a clean Windows user profile or VM when possible. If using the same
developer machine, uninstall older Klip builds first and record that the
profile was not clean.

**Manual validation target:** `docs/RELEASE_CHECKLIST.md`

- [ ] **Step 1: Install the NSIS installer**

Run:

```powershell
Start-Process -FilePath ".release-artifacts\Klip_0.1.0_x64-setup.exe" -Wait
```

Expected:

```text
Installer completes without crashing. Unsigned publisher warning may appear.
```

- [ ] **Step 2: Launch Klip**

Launch from Start Menu or installed shortcut.

Expected:

```text
Klip starts hidden or tray-first. The tray icon is visible.
```

- [ ] **Step 3: Open the window**

Use both paths:

```text
Tray click or tray menu -> Show window
Ctrl+Alt+K
```

Expected:

```text
The main window opens and receives focus. It does not appear as a normal
taskbar window.
```

- [ ] **Step 4: Confirm About diagnostics**

Open Settings -> About.

Expected:

```text
Version shows 0.1.0
Platform shows windows
Data directory renders
Database path renders
Log directory renders
```

- [ ] **Step 5: Confirm text clipboard workflow**

Copy a unique string from Notepad:

```text
klip-release-smoke-2026-05-21
```

Expected:

```text
The item appears in Klip history and can be searched.
Clicking the item restores it to the system clipboard and pastes into the
previous target application.
```

- [ ] **Step 6: Confirm image workflow**

Copy a small image from Paint, Snipping Tool, or a browser.

Expected:

```text
Klip records an image item and displays a thumbnail preview.
```

- [ ] **Step 7: Confirm file workflow**

Copy one file in File Explorer, then copy multiple files/folders.

Expected:

```text
Klip records file items, displays filename/count previews, and can restore the
file list to the clipboard.
```

- [ ] **Step 8: Confirm deletion flows**

Delete one item, then clear history.

Expected:

```text
Single delete requires confirmation and removes only that item.
Clear history requires confirmation and empties the list.
```

- [ ] **Step 9: Confirm hotkeys**

From Notepad or another text field:

```text
Ctrl+Alt+K toggles Klip.
Ctrl+Alt+1 through Ctrl+Alt+9 paste visible history entries.
```

Expected:

```text
The selected item is copied to the OS clipboard, Klip hides, and the content is
pasted into the previously focused application.
```

- [ ] **Step 10: Confirm settings persistence**

Change these settings:

```text
Window width or height
Search debounce
Language
Close to tray
Hotkey toggle value within supported Ctrl+Alt+A-Z shape
```

Quit from tray, relaunch, and reopen settings.

Expected:

```text
Changed settings persist after relaunch. Hotkey changes take effect without
requiring an app restart after save.
```

### Task 6: Autostart Validation

Autostart requires OS-level verification. Use a disposable VM if possible.

- [ ] **Step 1: Enable autostart**

In Klip:

```text
Settings -> Behavior -> Launch at startup / 开机自启 -> On
Save if needed
```

Expected:

```text
No error banner appears.
```

- [ ] **Step 2: Confirm OS registration**

Use one or more OS inspection methods:

```powershell
Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run | Format-List
```

Expected:

```text
An entry for Klip or the Tauri autostart registration is present.
```

- [ ] **Step 3: Sign out/in or reboot**

Expected:

```text
Klip launches after login and is available from the tray.
```

- [ ] **Step 4: Disable autostart and repeat**

Expected:

```text
The OS autostart entry is removed. Klip does not launch after the next login.
```

### Task 7: Uninstall Validation

- [ ] **Step 1: Uninstall Klip**

Use Windows Settings -> Apps, Control Panel, or the uninstaller entry.

Expected:

```text
The application binary is removed.
```

- [ ] **Step 2: Confirm autostart cleanup**

```powershell
Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run | Format-List
```

Expected:

```text
No Klip autostart entry remains.
```

- [ ] **Step 3: Record app data behavior**

Check the data directory shown in About before uninstall, or the default path:

```text
%APPDATA%\com.klip.app\
```

Expected:

```text
Record whether local data remains. Keeping local app data is acceptable for
v0.1.0 unless an explicit data removal option is implemented later.
```

### Task 8: Finalize Release Notes and Publish

- [ ] **Step 1: Write release notes**

Include:

```text
Klip v0.1.0 is a Windows-first MVP.
Installers are unsigned; Windows may show SmartScreen or unknown publisher
warnings.
Included: text/image/file clipboard history, search, favorites, tray behavior,
global hotkeys, local SQLite persistence, settings, diagnostics, autostart.
Not included: macOS/Linux parity, backup/restore, sync, auto-update, database
encryption, code signing.
```

- [ ] **Step 2: Attach or verify assets**

Use:

```powershell
gh release view v0.1.0 --json assets
```

Expected:

```text
The release has both Klip_0.1.0_x64_en-US.msi and
Klip_0.1.0_x64-setup.exe.
```

- [ ] **Step 3: Publish only after installer checklist is complete**

Use GitHub UI or:

```powershell
gh release edit v0.1.0 --draft=false --latest
```

Expected:

```text
Release is public, tagged v0.1.0, and assets are downloadable.
```

### Task 9: Post-Publish Checks

- [ ] **Step 1: Verify public release page**

```powershell
gh release view v0.1.0 --web
```

Expected:

```text
The release page opens and shows v0.1.0 with both installers.
```

- [ ] **Step 2: Download from public release and smoke install once**

Expected:

```text
Downloaded public asset installs and launches the same way as the draft asset.
```

- [ ] **Step 3: Record results**

Update one of:

```text
docs/RELEASE_CHECKLIST.md
CHANGELOG.md
GitHub Release notes
```

Keep the record concise but include:

```text
Verifier name or environment
Windows version
Installer filename
Installer size
SHA-256
Pass/fail summary
Known caveats
```

## Known Caveats to Preserve

- Installers are unsigned.
- No auto-updater is configured.
- macOS/Linux parity is not part of this release.
- Backup/restore, sync, import/export, database encryption, and sensitive
  content detection are post-MVP features.
- `tauri.conf.json` currently uses identifier `com.klip.app`; Tauri warns that
  identifiers ending in `.app` are not recommended for macOS bundle naming.
  This is not blocking Windows v0.1.0, but should be revisited before macOS
  work.

## How to Ask an Agent to Continue

Start a new session in the future environment with this prompt:

```text
请读取 docs/RELEASE_HANDOFF.md 和 docs/RELEASE_CHECKLIST.md，从 handoff 的 Task 1 开始继续 Klip v0.1.0 发布收尾。不要重新设计功能；先确认 main 的 commit、Release workflow、draft release/tag 状态，然后完成安装包验收。每完成一个阶段都更新我当前状态。如果要做系统安装、自启动、删除 release 或发布 release，先明确告诉我将执行的命令和影响。
```

If the next session should only inspect status and not change anything, use:

```text
只读取 docs/RELEASE_HANDOFF.md 并检查当前 GitHub release/tag/CI 状态，不要安装、删除、发布或修改文件。给我一个下一步执行清单。
```

If the next session should execute the remaining release work, use:

```text
按照 docs/RELEASE_HANDOFF.md 执行剩余 Klip v0.1.0 发布验收。可以运行本地验证、下载 draft release 资产、安装 NSIS/MSI 做 Windows smoke test；涉及发布 release 或删除 duplicate draft 前先停下来让我确认。
```

## Quick Command Reference

```powershell
git status --short --branch
git rev-parse HEAD
pnpm install --frozen-lockfile
pnpm verify
pnpm release:verify
pnpm e2e
gh run list --workflow Release --limit 5
gh run view 26216493348 --json status,conclusion,url,jobs
gh release view v0.1.0 --json name,tagName,isDraft,isPrerelease,url,assets
gh release download v0.1.0 --dir .release-artifacts
Get-FileHash .release-artifacts\Klip_0.1.0_x64_en-US.msi -Algorithm SHA256
Get-FileHash .release-artifacts\Klip_0.1.0_x64-setup.exe -Algorithm SHA256
```
