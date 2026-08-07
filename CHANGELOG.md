# Changelog

## [Unreleased]

### Added

- Searchable clipboard annotations with custom titles and notes, inline detail editing, compact list
  indicators, typed IPC, and live active-search refresh.
- Database schema v7 migration, old JSON compatibility, v6/v7 backup restore coverage, annotation
  validation, and Tantivy/SQLite/index-fingerprint regression coverage.
- Clipboard source attribution is persisted and shown compactly for Windows, macOS, and X11. macOS keeps the application name when Accessibility permission is absent; Wayland and unsupported platforms leave source fields empty without blocking capture.
- Source-attribution migration, hash-conflict, v5/v6 backup/restore, JSON portability, OpenAPI, and frontend regression coverage.
- Cross-platform paste target restoration: Win32 foreground windows, macOS running applications, and X11 EWMH active windows are captured before Klip opens and reactivated before synthetic paste; Wayland and unsupported platforms degrade without an error.
- Offline image OCR using bundled PP-OCRv5 detection/recognition models and ONNX Runtime, with background processing, searchable recognized text, live status updates, and no runtime model downloads.
- OCR migration, backup/restore, search rebuild/fallback, real Chinese inference, and frontend status regression coverage.
- Rich-text clipboard capture and replay with plain-text, HTML, and RTF representations stored together; HTML previews are sanitized with a strict DOMPurify allowlist.
- Tantivy full-text indexing with jieba Chinese tokenization, batched background commits, corruption recovery from SQLite, and transparent `LIKE` fallback when the index is unavailable.
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
- Regression coverage for quiet SelectionToolbar rendering.
- Regression coverage for neutral keyboard-selected clipboard rows.
- Regression coverage for neutral default clipboard row borders.
- Regression coverage for quiet active Header content filters.
- Regression coverage for localized dialog close actions.
- Regression coverage for Settings tab semantics.
- Regression coverage for image thumbnail preview and image preview download action labels.
- Regression coverage for Settings save failures staying visible.
- Regression coverage for refreshing clipboard data after JSON/CSV imports.
- Regression coverage for frontend window-size defaults matching backend defaults.
- Regression coverage for ignoring clipboard update events that do not match the active content filter.

### Changed

- Clipboard search now includes custom titles and notes in incremental indexing, full rebuilds,
  startup fingerprints, exact matching, and SQLite fallback.
- Active searches now refresh through the backend when clipboard capture or OCR completion events arrive, keeping live results consistent with Tantivy/jieba tokenization instead of approximating matches in the frontend.
- Search-index startup validation now compares every live Tantivy document's item ID and SHA-256 searchable-content fingerprint with SQLite, rebuilding on logical drift as well as physical corruption or count mismatches.
- Database schema version 6 adds nullable `source_application` and `source_window_title` columns. Version 5 databases and backups migrate with empty attribution, while schema-v6 backups require both columns and cannot be restored by Klip versions that only support v5.
- Database schema version 5 adds `clipboard_ocr`. Version 4 databases and backups migrate automatically, while schema-v5 backups require `clipboard_ocr` and cannot be restored by Klip versions that only support v4.
- Windows packages add about 21.5 MB of PP-OCRv5 model assets plus a 14.1 MB ONNX Runtime DLL; the verified models are copied to an app-data cache on first OCR use.
- Database schema version 4 adds `clipboard_formats`. Version 3 databases and backups migrate automatically, but backups created by schema v4 cannot be restored by older Klip versions that only support v3.
- README now uses a richer project-homepage structure with install guidance, core workflows, current limits, local development, release checks, and documentation links.
- About copy, package metadata, and contribution scope now consistently describe Klip as a Windows-first local clipboard MVP.
- README now presents Klip as a Windows-first local clipboard MVP and clearly separates current features from post-MVP services.
- Roadmap, PRD, and documentation index now avoid treating cloud sync, plugins, hosted updates, cross-platform parity, and real encryption migration as current MVP work.
- Documentation now describes search as keyword contains matching and aligns PRD window minimums with the packaged Tauri window.
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
- Selection mode actions now render as a quieter inline utility row.
- Keyboard-selected clipboard rows now use a neutral treatment instead of a content-type wash.
- Default and keyboard-selected clipboard rows no longer expose persistent content-type left rails.
- Active Header content filters now use a neutral treatment instead of filled accent chrome.
- Header search now exposes an explicit accessible label.
- Clipboard entries now use distinct text, image, file, and folder treatments for faster scanning.
- Data Management import, export, backup, and restore controls now live behind an advanced disclosure.
- Settings window size inputs and behavior switches now expose accessible labels.
- Settings navigation now exposes tablist, tab, and tabpanel semantics.
- Header icon-only actions now expose accessible labels.
- Header selected-item tag assignment actions now expose localized accessible labels.
- Image thumbnails and image preview downloads now expose explicit accessible actions.

### Fixed

- Clipboard history day groups now use local calendar days instead of rolling 24-hour windows.
- Settings save failures now keep the Settings view open and show the error.
- JSON/CSV imports now refresh clipboard items and tags after a successful import.
- Missing frontend window-size config now falls back to the current 560x760 backend defaults instead of the old 480x720 values.
- Live clipboard update events now respect the current search, content type, favorites, and tag filters before inserting a new row.

### Security

- Upgraded Vitest tooling and pinned patched transitive dependencies so `pnpm audit --registry=https://registry.npmjs.org` reports no known vulnerabilities.

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
