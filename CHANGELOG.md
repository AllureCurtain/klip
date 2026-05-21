# Changelog

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
- Import/export, backup/restore, auto-update, sync, and encryption are not included in v0.1.0.
