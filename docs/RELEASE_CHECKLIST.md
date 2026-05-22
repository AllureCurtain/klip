# Klip Release Checklist

Use this checklist for Windows-first release verification. The current public release is `v0.1.1`.

## 1. Preflight

- [ ] `git status --short` is clean or only contains intentional release changes.
- [ ] Versions match in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
- [ ] `CHANGELOG.md` includes the version being released.
- [ ] `pnpm release:verify -SkipBundle` succeeds.
- [ ] `pnpm e2e` succeeds on a Windows desktop session with `tauri-driver` and Edge WebDriver installed.

## 2. Installer Build

- [ ] Run `pnpm release:verify` on Windows.
- [ ] Confirm MSI exists at `src-tauri/target/release/bundle/msi/`.
- [ ] Confirm NSIS installer exists at `src-tauri/target/release/bundle/nsis/`.
- [ ] Record installer filenames and file sizes in release notes.

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
- [ ] Copy a password/API-key-like text and confirm it is flagged as sensitive.
- [ ] Confirm sensitive item previews are masked by default.
- [ ] Enable "Skip sensitive clipboard content" and confirm newly copied sensitive text is not saved.

## 10. Distribution Caveats

- [ ] Release notes mention unsigned installer warnings.
- [ ] Release notes state this is Windows-first and macOS/Linux are post-MVP.
- [ ] Release notes state sync, auto-update, database encryption, and code signing are not included.

## 11. GitHub Release Workflow

- [ ] Pushing a `v*` tag or manually running `Release` starts `.github/workflows/release.yml`.
- [ ] The workflow creates a draft GitHub Release.
- [ ] Windows NSIS and MSI artifacts are attached to the draft Release.
