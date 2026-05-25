# Product Completion Design

## Goal

Complete the P0, P1, and P2 product gaps identified for Klip, excluding macOS/Linux parity work.

## Scope

In scope:

- Per-item tag assignment and removal.
- Validated shortcut editing with constrained Windows-first hotkey support.
- Pause monitoring and timed privacy mode.
- Windows source ignore rules for process/title matching.
- Advanced search filters for content type, favorites, sensitivity, tags, date range, and exact text matching.
- Snippets for reusable phrases.
- Data operation result summaries.
- Diagnostics shortcuts for copying/opening relevant paths.
- Update configuration and release/signing readiness.
- Application-level database content encryption readiness for clipboard text/snippet payloads.
- Local sync/plugin readiness as configurable local export/import/plugin folders, without a hosted service.

Out of scope:

- macOS/Linux behavior parity.
- Procuring or embedding a real code-signing certificate.
- Operating a hosted sync service.
- Operating a hosted update feed.

## Architecture

The backend remains the source of truth for clipboard, snippets, rules, configuration, diagnostics, and release readiness. New product capabilities are exposed as Tauri commands and wrapped through `src/lib/tauri.ts`; React stores consume only typed wrappers. Database changes are additive and idempotent, following the existing SQLite migration pattern.

The UI keeps the current compact utility shape. High-frequency actions stay close to each clipboard row or header; destructive and advanced workflows remain behind menus or Settings tabs.

## Data Model

Add tables:

- `snippets`: reusable text entries with title, content, favorite flag, optional tag, timestamps.
- `clipboard_source_rules`: Windows-first ignore rules with match type, pattern, enabled flag, and timestamps.
- `operation_results`: optional recent operation summaries for import/export/backup/restore diagnostics.

Add config keys:

- `clipboard_monitor_enabled`
- `privacy_mode_until`
- `advanced_search_exact`
- `updates_enabled`
- `update_feed_url`
- `encryption_enabled`
- `encryption_status`
- `sync_folder`
- `plugin_folder`

## Behavior

Clipboard monitoring skips capture when monitoring is disabled, privacy mode is active, sensitive skip policy rejects the content, or the active Windows source matches an enabled ignore rule. Manual paste/copy from existing history still works while monitoring is paused.

Advanced search remains one IPC call and returns the same `ClipboardItem` shape, with additional filter parameters. Search defaults remain backwards compatible.

Snippets are independent from clipboard history but share copy/paste actions and can be surfaced from Settings or a future tab.

Update/signing/sync/plugin support is implemented as local readiness: settings, diagnostics, scripts, and validation. External credentials or hosted endpoints are not fabricated.

## Testing

Backend tests cover schema defaults, snippets CRUD/search, source-rule matching, monitoring gate decisions, and advanced search filters. Frontend tests cover store APIs, row tag controls, shortcut validation UI, advanced filter parameter flow, and data operation result rendering.

