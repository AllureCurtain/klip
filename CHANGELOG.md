# Changelog

## [Unreleased]

### Added

- Regression coverage for Data Management settings path actions, restore cancellation, file path input labels, and Settings general/behavior control labels.
- Regression coverage for Header icon-only actions.
- Regression coverage for Header filter pressed states.
- Regression coverage for Header selected-item tag assignment action labels.
- Regression coverage for Header search input labeling.
- Regression coverage for the lightweight Header default actions, clipboard type treatments, and advanced Data Management disclosure.
- Regression coverage for the opt-in selection mode and hidden heavy Header actions.
- Regression coverage for Header more-actions menu dismissal and disabled empty batch actions.
- Regression coverage for compact, neutral clipboard list rows.
- Regression coverage for floating clipboard item actions.
- Regression coverage for low-noise clipboard item metadata.
- Regression coverage for compact EmptyState rendering.
- Regression coverage for compact App loading and error states.
- Regression coverage for localized dialog close actions.
- Regression coverage for Settings tab semantics.
- Regression coverage for image thumbnail preview and image preview download action labels.

### Changed

- Data Management path inputs now expose accessible labels for assistive technology.
- Dialog close actions now use the active interface language.
- Header favorites, content-type, and tag filters now expose their pressed state.
- Header heavy actions are kept out of the default flow so the main clipboard surface stays lighter.
- Batch selection is now an explicit selection mode instead of a default item/header surface.
- Favorites, tag filters, and clear-history now live behind the Header more-actions menu.
- The Header more-actions menu now closes on Escape, outside click, and completed menu actions.
- Clipboard list rows are more compact and no longer show default numeric index chrome or tinted row washes.
- Clipboard item actions now float on hover/focus instead of occupying the default row layout.
- Clipboard item type, time, sensitivity, and tag metadata now render as a quieter inline scan line.
- Empty states now render as lightweight operational notes instead of centered instructional panels.
- App loading and error states now use lightweight operational notes instead of centered full-panel messages.
- Header search now exposes an explicit accessible label.
- Clipboard entries now use distinct text, image, file, and folder treatments for faster scanning.
- Data Management import, export, backup, and restore controls now live behind an advanced disclosure.
- Settings window size inputs and behavior switches now expose accessible labels.
- Settings navigation now exposes tablist, tab, and tabpanel semantics.
- Header icon-only actions now expose accessible labels.
- Header selected-item tag assignment actions now expose localized accessible labels.
- Image thumbnails and image preview downloads now expose explicit accessible actions.

## [0.1.2] - 2026-05-22

### Added

- Database schema version gating with forward-version rejection.
- Automatic recovery for corrupt SQLite databases by preserving the broken file and recreating a clean schema.
- Restore-time rejection for backups from newer database schema versions.

### Changed

- Database migration versioning is now centralized so future release bumps cannot drift between init and restore paths.

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
