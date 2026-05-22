# Changelog

## [0.1.1] - Windows-first productization patch

### Added

- Tags and grouped history filters.
- JSON/CSV import and export.
- Database backup and restore with backup validation and an automatic pre-restore backup.
- Sensitive-content detection with configurable capture policy and masked previews.
- Linux platform groundwork for paths, clipboard write-back, paste simulation, autostart, and E2E runner.

### Changed

- Release, API, architecture, database, and roadmap docs now match the current productized feature set.

### Known Caveats

- Installers are not code signed yet, so Windows may show SmartScreen or publisher warnings.
- macOS/Linux parity remains post-MVP work; Linux support still needs real desktop validation before it is treated as complete.
- Auto-update, sync, and database encryption are not included in v0.1.1.

## [0.1.0] - Windows-first MVP

### Added

- Clipboard history capture for text, image, and Windows file selections.
- Local SQLite persistence with de-duplication, search, deletion, favorites, and configurable history size.
- Global hotkeys for window toggle and quick paste, with runtime reload for supported settings.
- Tray-first desktop behavior, settings panel, autostart toggle, and About diagnostics.
- Windows installer bundles via Tauri MSI and NSIS targets.
- Desktop E2E smoke test for text copy, search, and paste-path clipboard restoration.
- GitHub Actions Release workflow for tag/manual Windows installer builds.

### Verification

- `pnpm lint`
- `pnpm test -- --run`
- `pnpm build`
- `cargo fmt -- --check`
- `cargo clippy -- -D warnings`
- `cargo test`
- `pnpm e2e`
- `pnpm tauri:build`

### Known MVP Caveats

- Installers are not code signed yet, so Windows may show SmartScreen or publisher warnings.
- macOS and Linux parity remains post-MVP work.
- Import/export, backup/restore, auto-update, sync, sensitive-content rules, and database encryption are not included in v0.1.0.
