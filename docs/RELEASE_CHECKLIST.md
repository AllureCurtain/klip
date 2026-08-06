# Klip Release Checklist

Use this checklist for Windows-first release verification. The current public release is `v0.1.2`.

Foundation closeout status below reflects the Windows `feat/foundation` worktree on 2026-08-07. Checked items have current evidence; `BLOCKED` and `SKIPPED` items must not be treated as release approval.

## 1. Preflight

- [x] `git status --short` is clean or only contains intentional release changes.
- [x] Versions match in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` (`1.0.0`).
- [ ] BLOCKED: `CHANGELOG.md` still identifies `v0.1.2` as the public release and does not contain the build metadata version `1.0.0`; release version ownership must resolve this before shipping.
- [x] `pnpm release:readiness` reports unsigned installers, no timestamp URL, and manual/GitHub Release distribution because no update feed is configured.
- [x] `pnpm test:coverage` succeeds: 20 files / 149 tests; statements 72.39%, branches 71.56%, functions 71.63%, lines 74.30%.
- [ ] BLOCKED: full `pnpm audit --registry=https://registry.npmjs.org --audit-level high` reports 19 high advisories in development/test tooling; the production-only audit reports no known vulnerabilities.
- [ ] BLOCKED: local `cargo audit` reports 22 allowed warnings, and PR #4 currently has no GitHub Actions check result to establish the stricter release gate.
- [ ] BLOCKED: `pnpm release:verify -SkipBundle` stops before build because `CHANGELOG.md` does not mention metadata version `1.0.0`.
- [ ] `pnpm e2e` succeeds on a Windows desktop session with `tauri-driver` and Edge WebDriver installed.

## 2. Installer Build

- [ ] BLOCKED: full `pnpm release:verify` inherits the unresolved changelog/build-version mismatch.
- [x] MSI exists at `src-tauri/target/release/bundle/msi/Klip_1.0.0_x64_en-US.msi` (32,542,720 bytes; SHA-256 `2FF01714E3334780F85D4FB71453EF8A310456D001449C0B2190CE5F54CDE434`).
- [x] NSIS installer exists at `src-tauri/target/release/bundle/nsis/Klip_1.0.0_x64-setup.exe` (29,027,941 bytes; SHA-256 `0FA03449A06AAE6CE247AD24956B08A20022F104F0894C803B844BB5B470E06F`).
- [ ] Run `pnpm release:smoke` and confirm local/GitHub installer assets are present.
- [ ] BLOCKED: installer filenames, sizes, hashes, and unsigned status are recorded here, but final release notes depend on resolving whether the next release is `1.0.0` or follows `v0.1.2`.

## 3. Fresh Install Smoke Test

- [ ] Install the NSIS `.exe` on a clean Windows user profile or VM.
- [ ] Launch Klip and confirm it starts hidden in the tray.
- [ ] Open from tray and from `Ctrl+Alt+K`.
- [ ] Open Settings → About and confirm version, data directory, database path, and log directory render.

## 4. Clipboard Workflow

- [ ] Copy plain text and confirm it appears in the list.
- [ ] Copy an image and confirm a thumbnail preview appears.
- [ ] Copy one file and confirm the filename appears.
- [ ] Copy multiple files/folders and confirm counts appear.
- [ ] Select a history item and confirm it pastes into Notepad or another target app.

## 5. Hotkeys and Window Behavior

- [ ] `Ctrl+Alt+K` toggles the main window.
- [ ] `Ctrl+Alt+1` through `Ctrl+Alt+9` paste the corresponding visible entries.
- [ ] Editing `hotkey_toggle_window` in Settings → Shortcuts saves and reloads without app restart.
- [ ] Closing the main window hides to tray when `close_to_tray=true` and exits when `close_to_tray=false`.
- [ ] Window hides after paste and does not remain in the taskbar.
- [ ] Tray click opens the window without immediately hiding it.

## 6. Search and Delete

- [ ] Search filters text content and file previews.
- [ ] Deleting a single item asks for confirmation and removes only that item.
- [ ] Clearing history asks for confirmation and empties the list.

## 7. Autostart

- [ ] Settings → Behavior can enable autostart.
- [ ] Reboot or sign out/in and confirm Klip launches.
- [ ] Disable autostart and confirm the OS autostart entry is removed.

## 8. Persistence and Logs

- [ ] Quit from the tray menu and relaunch.
- [ ] Previously captured items remain in the list.
- [ ] Settings changes persist after relaunch.
- [ ] Log files are created under the About diagnostics log directory.

## 9. Data Portability and Sensitive Content

- [ ] Export JSON and confirm the file is created.
- [ ] Export CSV and confirm the file is created.
- [ ] Import JSON/CSV into an isolated profile and confirm imported items appear.
- [ ] Create a database backup and confirm the backup file is created.
- [ ] Restore a valid database backup and confirm the previous database is saved as a pre-restore backup.
- [ ] Open a pre-v2 database and confirm it upgrades to the current schema version without losing settings.
- [ ] Replace the database with invalid bytes and confirm the app preserves the corrupt file and starts with a clean schema.
- [ ] Attempt to restore a backup from a newer schema version and confirm restore is rejected.
- [ ] Copy a password/API-key-like text and confirm it is flagged as sensitive.
- [ ] Confirm sensitive item previews are masked by default.
- [ ] Enable "Skip sensitive clipboard content" and confirm newly copied sensitive text is not saved.
- [ ] Create a snippet, copy it from Settings -> Data, and confirm the clipboard receives the snippet content.
- [ ] Create a source ignore rule for a test process/window title and confirm new clipboard changes from that source are skipped on Windows.
- [ ] Pause clipboard monitoring and enable 15-minute privacy mode from the header menu; confirm new clipboard changes are skipped while each gate is active.
- [ ] Use advanced search filters for sensitive-only, exact match, and date range.

## 10. Distribution Readiness and Caveats

- [ ] If shipping unsigned installers, release notes mention SmartScreen or unknown publisher warnings.
- [ ] If signing this release, set `KLIP_WINDOWS_CERTIFICATE_THUMBPRINT` or `KLIP_WINDOWS_CERTIFICATE_PATH`; set `KLIP_WINDOWS_CERTIFICATE_PASSWORD` when using a PFX path.
- [ ] If timestamping signed installers, set `KLIP_WINDOWS_TIMESTAMP_URL`.
- [ ] If publishing an update feed, set `KLIP_UPDATE_FEED_URL` and record the hosted feed URL in release notes.
- [ ] Release notes state this is Windows-first and macOS/Linux are post-MVP.
- [ ] Release notes distinguish local readiness settings from external services: certificates, hosted update feed, sync service, database encryption rollout, and plugin marketplace are not bundled by the app.
- [ ] Release notes state `show_in_tray` is a deprecated database key, not a supported runtime setting.

## 11. GitHub Release Workflow

- [ ] Pushing a `v*` tag or manually running `Release` starts `.github/workflows/release.yml`.
- [ ] The workflow creates a draft GitHub Release.
- [ ] Windows NSIS and MSI artifacts are attached to the draft Release.
