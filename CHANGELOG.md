# Changelog

## [Unreleased]

## [0.3.0] - 2026-09-01

### Added

- Four theme families (`ember`, `graphite`, `brick`, `rose`) with light/dark/system modes, driven
  entirely by semantic CSS design tokens. A contrast gate (`pnpm check:contrast`) verifies 464 color
  pairs across all 8 family/mode combinations against WCAG 4.5:1 / 3:1, and a token gate
  (`pnpm check:tokens`) fails the build on palette names or color literals in components.
- Ten independently configurable global shortcuts (`toggle_window` plus `quick_paste_1..9`) stored in
  a new `shortcut_bindings` table. Each action can be enabled, disabled, and re-recorded on its own;
  disabling slots does not renumber the remaining quick-paste indices.
- Transactional shortcut registration: the full set is validated up front, only changed registrations
  are touched, and any failure rolls back both the new registrations and the previously unregistered
  ones. `unregister_all` is deliberately not used, so other applications' global shortcuts are never
  collaterally released.
- Window state persistence in a new `window_state` table, recorded in DIP alongside `scale_factor`
  and `monitor_id` so size and position restore correctly across displays with different scaling.
- Image fidelity storage: `binary_blobs` (SHA-256-deduplicated bytes) and
  `clipboard_item_representations` with `source` / `canonical` / `thumbnail` roles. The
  OS-provided original encoding is preserved when available, a canonical PNG covers bitmap-only
  sources, and thumbnails are physically isolated preview copies that never affect paste or export.
- On-demand image media IPC, so the clipboard list no longer transfers full-resolution originals.
- Settings redesign with a navigation rail and General/Appearance/Shortcuts/Behavior/Data/About
  panels,
  including data capacity reporting, diagnostics, explicit save/cancel with unsaved-change guarding,
  and per-field error states.
- `docs/UPGRADE_V8.md` covering the v7→v8 upgrade, automatic backup and rollback paths, the
  migration log reference, old/new config keys, image capacity policy, Windows shortcut conflicts and
  `Win`-key limits, gate results, and known limitations.

### Changed

- Database schema is now `db_version = 8`. The v7→v8 migration runs in a single transaction, is
  idempotent via `INSERT OR IGNORE`, and is preceded by an automatic
  `klip.db.pre-v8-<millis>.bak` backup that is integrity-checked before use. If migration fails, the
  backup is restored automatically and the failure names the backup path.
- Legacy image data URLs migrate to `canonical` blob representations with generated thumbnails.
  Images that cannot be parsed as PNG are left untouched and logged for diagnostics rather than
  rewritten; images over 128 MiB are skipped without blocking migration.
- Default window size is `420 x 560` DIP (was `560 x 760`), minimum `360 x 480`, sized to read as a
  clipboard utility rather than a document window. Size is adjusted by dragging the window and
  remembered automatically; the settings page now reports default, minimum, and current size as
  read-only information instead of pixel inputs. Any user-modified size is preserved as-is, so
  shrinking to the new default requires clearing the saved `window_state` row. Note that
  `window_state` (startup restore) and `app_config` (runtime changes from the settings panel) remain
  separate sources of truth and can still drift.
- Replaced the scaffold placeholder application icon with a brand-aligned design in the terracotta
  accent family. The source lives at `src-tauri/icons/source/klip-icon.svg`; regenerate with
  `pnpm tauri icon`. Features are sized for the 16px tray, where one device pixel spans 32 canvas
  units, so an earlier stacked-card version with three thin rules washed out into a blank rectangle.
- Quick-paste shortcuts are seeded enabled on upgrade (preserving existing behavior) and disabled on
  fresh installs.
- Window hiding is split into independent `hide_on_focus_loss` and `hide_after_paste` settings, both
  defaulting to the previous combined behavior.
- The per-image `5 MiB` gate is removed. Single images are bounded by 40,000,000 pixels and 160 MiB
  RGBA, so 1920x1080, 4K, and common 8K screenshots are no longer silently skipped. Total image
  storage is bounded by the new `image_budget_bytes` setting (default 2 GiB), which evicts the oldest
  unfavorited images first and never evicts favorites.
- `pnpm verify` and `pnpm release:verify` now run the contrast, i18n, and token gates.

### Fixed

- Missing or corrupted image blobs now return locatable integrity errors instead of hiding the
  affected clipboard entry.
- `pnpm tauri:dev` failed outright: the `klip_http_check` helper binary made bare `cargo run`
  ambiguous. `default-run = "klip"` in `Cargo.toml` resolves it.
- Vite's dependency scanner globbed every `.html` in the repository (documentation prototypes,
  软著 screenshots, `src-tauri/target` build artifacts) and crashed esbuild. `optimizeDeps.entries`
  now pins the scan to `index.html`.
- The Geist sans font was declared first in `--font-sans` and installed as a dependency, but never
  imported, so all body text silently fell back to the system UI font. Only the mono face was loaded.
- Startup issued the clipboard list query twice: once on mount and again when the search debounce
  effect first ran. The debounce now skips its initial pass instead of delaying first paint.
- The clipboard detail dialog was a fixed `44rem` wide, which exceeded the window itself and was
  clamped to the viewport, rendering as a full-bleed page. It is now inset on all sides, with the
  max width applying only once the window is enlarged.


### Known Limitations

- Installer real-machine verification (tray, autostart, window restore, clipboard formats on a clean
  Windows install) has not been performed for this work. See `docs/UPGRADE_V8.md` section 10.
- "Original preservation" means preserving the representation the OS actually provided; bytes that
  were never in the clipboard cannot be recovered afterwards.
- `Win` combinations can be recorded, but Windows may claim new combinations after system updates.
  Klip defers to the actual registration result rather than promising a stable allowlist.

## [0.2.0] - 2026-08-10

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

### Known Limitations

- Windows installers are not code signed, so Windows may show SmartScreen or unknown publisher warnings.
- Windows is the only fully validated desktop target; macOS and Linux implementations have not completed real-desktop acceptance.
- Hosted updates, cloud sync, plugins, accounts, and database encryption migration are not included.

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
