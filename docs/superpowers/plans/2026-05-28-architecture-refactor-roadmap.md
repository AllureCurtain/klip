# Klip Architecture Refactor Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this roadmap goal-by-goal. This document is intentionally a remediation and acceptance plan, not a line-by-line coding plan.

**Goal:** Reduce architectural drift in Klip by consolidating duplicated behavior, replacing fragile branching/stringly-typed logic with explicit design units, and making future product work easier to test and extend.

**Architecture:** Keep the existing Tauri 2 + React 19 + Zustand + Rust + SQLite architecture. The refactor should preserve current behavior while introducing clearer boundaries: query construction, clipboard paste orchestration, configuration metadata/effects, content rendering, window control, and data portability should each have one primary home.

**Tech Stack:** Rust, rusqlite, Tauri commands/events, React, TypeScript, Zustand, Vitest, Testing Library, Cargo unit tests.

---

## Scope

This roadmap covers architecture and maintainability issues found in the current codebase. It focuses on places where the current implementation works but is harder than necessary to extend safely:

1. Clipboard query/filter SQL is duplicated and partially hand-built.
2. Clipboard paste orchestration is duplicated between IPC commands and global hotkeys.
3. Runtime configuration is stringly typed across frontend, backend, and database defaults.
4. Clipboard item rendering repeats the backend format-strategy problem on the frontend.
5. Search/filter rules are implemented independently in App, store, IPC wrappers, and Rust database code.
6. Settings data management mixes several product surfaces in one large component.
7. Database schema initialization and migrations are growing into one large procedural block.
8. CSV import/export uses a handwritten parser instead of a proven parser.

This roadmap does not add new end-user features. The expected outcome is a cleaner structure with the same visible behavior.

## Non-Goals

- Do not change the app's clipboard history behavior unless a task explicitly says so.
- Do not change IPC command names unless a compatibility wrapper remains.
- Do not add cloud sync, plugin runtime, updater implementation, real encryption migration, or account features.
- Do not rewrite state management away from Zustand.
- Do not replace SQLite or rusqlite.
- Do not merge unrelated visual redesign work into these refactors.
- Do not introduce broad dependency changes except where noted for CSV parsing.

## Recommended Execution Order

1. Query Builder / Specification for clipboard list and search.
2. Paste Service and Window Controller extraction.
3. Config Registry and typed config access.
4. Frontend clipboard content renderer registry.
5. Unified filter model for frontend/backend search behavior.
6. DataManagementView decomposition.
7. Versioned migration structure.
8. CSV parser replacement.

The first three goals carry the highest maintenance risk and should be handled before UI decomposition.

## Current Architecture Observations

The repository already has several good boundaries:

- Frontend IPC calls are centralized in `src/lib/tauri.ts`.
- Clipboard format detection on the backend uses a strategy registry in `src-tauri/src/clipboard/format/mod.rs`.
- Zustand stores isolate the main state surfaces.
- Tauri commands are thin for many CRUD actions.
- Rust error handling uses a shared `AppError`.

The issues below are mostly drift around those boundaries: some newer features bypass the cleanest existing patterns, and some modules now contain multiple responsibilities that should be separated before the next feature wave.

---

## Goal 1: Consolidate Clipboard Query Construction

### Current Problem

Clipboard list/search logic is spread across several functions that build nearly the same SQL shape:

- `src-tauri/src/database/clipboard.rs`
  - `get_list`
  - `search`
  - `get_by_id`
  - `toggle_favorite`
  - private `row_to_clipboard_item`
- `src-tauri/src/database/productization.rs`
  - `get_list_filtered`
  - `search_filtered`
  - `search_advanced`
  - `select_sql`
  - `row_to_productized_item`
  - private `parse_content_type`
- `src-tauri/src/database/data_portability.rs`
  - imports and reuses `row_to_productized_item`
  - defines another private `parse_content_type`

The most important design issue is in `productization.rs`: filters are constructed by pushing SQL snippets into a `Vec<String>`, then joining them into a `WHERE` clause. Some values are placed into the SQL text after `escape_sql_literal`, while others use bound parameters. This means query behavior is split between:

- manual escaping,
- positional rusqlite parameters,
- repeated `ORDER BY last_used_at DESC, created_at DESC`,
- repeated `SELECT id, content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at, is_sensitive, sensitivity_reason`,
- repeated tag hydration after the query.

The result is maintainable today, but fragile for future filters. Every new filter will likely require edits in multiple query functions, frontend option mapping, IPC wrappers, and tests.

### Repair Approach

Introduce a small query specification layer for clipboard item retrieval.

Recommended design:

- Create a `ClipboardQuerySpec` data structure in Rust that represents all list/search options:
  - text query,
  - content type,
  - favorite-only,
  - sensitive-only,
  - tag id,
  - exact match,
  - created-after,
  - created-before,
  - limit,
  - offset.
- Create a query builder module, for example `src-tauri/src/database/clipboard_query.rs`, responsible for:
  - building the SQL string,
  - preserving parameter order,
  - using bound parameters wherever practical,
  - applying consistent ordering and pagination,
  - keeping image content out of text content search.
- Move shared row mapping into one location:
  - either `database/types.rs` helpers,
  - or a dedicated `database/row_mapping.rs`.
- Make `clipboard.rs` and `productization.rs` call the shared query path instead of maintaining parallel query implementations.
- Keep public command behavior stable:
  - existing `get_clipboard_list`,
  - `search_clipboard`,
  - `get_clipboard_list_filtered`,
  - `search_clipboard_filtered`,
  - `search_clipboard_advanced`
  should continue to work.
- Keep tag hydration behind one helper that all query paths use consistently when the command expects productized items.

The simplest safe intermediate shape is:

- `database::clipboard_query::fetch_items(db, spec) -> Result<Vec<ClipboardItem>, AppError>`
- `database::clipboard_query::fetch_item_by_id(db, id) -> Result<Option<ClipboardItem>, AppError>`
- `database::clipboard_query::hydrate_tags(conn, items)`

Do not try to create a generic ORM abstraction. The local need is a focused query builder for clipboard items.

### Acceptance Criteria

- All clipboard retrieval paths use one shared query construction module.
- No clipboard list/search function manually concatenates untrusted user query text into SQL.
- `escape_sql_literal` is no longer needed for clipboard search/list filters.
- The selected columns for `ClipboardItem` are defined once.
- `ContentType` parsing from database strings is defined once.
- `row_to_clipboard_item` and `row_to_productized_item` are replaced or reduced to one shared mapper.
- Existing IPC command names and payload shapes remain unchanged.
- Search behavior remains the same for:
  - empty query,
  - text query,
  - image preview search,
  - content type filter,
  - favorite-only filter,
  - sensitive-only filter,
  - tag filter,
  - exact match,
  - created date range,
  - pagination.
- Rust tests cover the query builder directly, not only through commands.
- Regression tests prove that image `content` is not searched as base64 text.
- `cargo test` from `src-tauri` passes.

---

## Goal 2: Extract Clipboard Paste Service and Window Controller

### Current Problem

The paste workflow is duplicated in at least two places:

- `src-tauri/src/commands/mod.rs::paste_from_clipboard`
- `src-tauri/src/hotkey/manager.rs::quick_paste`

Both paths do some version of:

1. Fetch a clipboard item.
2. Write it back to the system clipboard.
3. Update `last_used_at`.
4. Hide the Klip window.
5. Restore the previous foreground window on Windows.
6. Simulate paste with platform-specific key events.

Window show/hide/focus logic is also repeated in:

- `commands::toggle_window`
- `commands::show_window`
- `commands::hide_window`
- `hotkey::manager::register_toggle_hotkey`
- `tray::setup_tray`
- `tray::show_window_and_emit`
- setup-time E2E window handling in `main.rs`

The current behavior is sensitive to timing, foreground-window capture, and platform differences. Duplication here increases the chance that one entry path gets fixed while another path keeps the old behavior.

### Repair Approach

Introduce a backend application-service layer for clipboard paste and window operations.

Recommended design:

- Create `src-tauri/src/window/controller.rs`.
- Expose operations such as:
  - show main window and focus,
  - hide main window,
  - toggle main window,
  - show and emit frontend route event,
  - apply configured size,
  - read close-to-tray behavior.
- Create `src-tauri/src/clipboard/paste.rs`.
- Expose operations such as:
  - copy item by id,
  - paste item by id,
  - quick paste by index,
  - simulate platform paste.
- The paste service should own the sequence:
  - load item,
  - copy to clipboard,
  - touch last used,
  - hide window,
  - restore foreground if needed,
  - simulate paste.
- `commands::paste_from_clipboard` should call the service.
- `hotkey::quick_paste` should call the same service.
- Platform paste behavior should be isolated behind a small strategy/function boundary:
  - Windows: restore previous foreground, wait, Ctrl+V.
  - macOS: Cmd+V.
  - Linux: `platform::linux::simulate_paste`.
- The existing `clipboard::writer::copy_to_clipboard` remains the low-level writer.

This is not a domain-pattern exercise for its own sake. The goal is to make every user path into paste behavior pass through the same orchestration code.

### Acceptance Criteria

- There is exactly one backend function that orchestrates "copy item and simulate paste".
- IPC paste and quick-paste hotkeys call the same orchestration function.
- Platform-specific paste simulation is not duplicated between commands and hotkeys.
- Window show/hide/focus logic has one primary controller module.
- Tray, hotkey, and IPC toggle/show/hide paths call the controller instead of duplicating logic.
- Foreground-window capture remains before Klip steals focus.
- The tray-click guard behavior remains intact.
- Existing Linux paste behavior is preserved.
- Unit tests cover:
  - the paste service selects the correct item by id,
  - quick-paste index uses offset `index - 1`,
  - missing item returns a not-found or logged no-op path as currently intended,
  - window close-to-tray decision remains unchanged.
- Existing E2E clipboard capture/search/paste flow still passes.

---

## Goal 3: Replace Stringly-Typed Config Flow With a Config Registry

### Current Problem

Configuration metadata is spread across many files:

- Backend defaults in `src-tauri/src/database/connection.rs`.
- Frontend defaults in `src/stores/configStore.ts`.
- Frontend parsing in `configStore.ts`.
- Frontend saving in `configStore.ts::saveChanges`.
- Backend validation and normalization in `src-tauri/src/commands/mod.rs::set_config`.
- Runtime consumption in:
  - `main.rs`,
  - `commands/mod.rs`,
  - `hotkey/manager.rs`,
  - `clipboard/monitor.rs`,
  - `tray/setup.rs`,
  - frontend App and stores.

Keys such as `window_width`, `window_height`, `hotkey_toggle_window`, `hotkey_quick_paste_prefix`, `language`, `clipboard_monitor_enabled`, and `privacy_mode_until` are compared as raw strings in many places.

This creates several risks:

- A default can change on frontend but not backend.
- A config key can be saved by frontend but never consumed by backend.
- Runtime side effects are embedded in `set_config` conditionals.
- Adding a new runtime-consumed config requires editing many unrelated files.
- Tests must assert exact repeated calls instead of testing a single config contract.

### Repair Approach

Introduce a typed config registry on both sides, with the backend as the source of truth for persisted defaults and runtime side effects.

Recommended backend design:

- Create `src-tauri/src/config/registry.rs`.
- Define config key constants in one place.
- Define metadata for each key:
  - key name,
  - default value,
  - value type,
  - validator,
  - normalizer,
  - runtime effect category.
- Runtime effects should be explicit:
  - hotkey reload,
  - window size apply,
  - autostart update,
  - event-only config changed,
  - no immediate effect.
- `database::connection::init_schema` should seed defaults by iterating the registry.
- `commands::set_config` should:
  - look up the config descriptor,
  - normalize/validate the value,
  - persist it,
  - run the configured side effect,
  - emit `config-changed`.

Recommended frontend design:

- Create `src/config/schema.ts` or `src/stores/configSchema.ts`.
- Define frontend parsing/serialization based on a schema object.
- Refactor `configStore.fetchConfig` so each field is parsed from the schema rather than manually assigned.
- Refactor `saveChanges` so it iterates changed fields or schema entries rather than listing every `configApi.set` call by hand.
- Preserve the special `setAutoStart` behavior if it must remain a separate command for OS-level autostart.

Avoid overbuilding a generic plugin configuration system. The registry only needs to serve current app settings.

### Acceptance Criteria

- Every persisted config key has exactly one backend default definition.
- Every frontend config field has exactly one frontend parser/serializer definition.
- No module compares config keys using repeated raw string literals except the registry and tests.
- `set_config` no longer has a growing chain of key-specific conditionals.
- Window width/height normalization still clamps to packaged minimums.
- Hotkey values are still validated before being persisted or reloaded.
- Failed hotkey reload still rolls back to the previous value or safe default.
- `config-changed` event payload shape remains `{ key, value }`.
- Frontend `saveChanges` no longer manually repeats every config key in a long sequence.
- Tests cover:
  - default seeding,
  - frontend parse defaults,
  - frontend serialize behavior,
  - hotkey validation,
  - window size normalization,
  - event emission after set,
  - no save of deprecated `show_in_tray`.
- `pnpm test -- --run src/stores/configStore.test.ts` passes.
- `cargo test config` or the equivalent Rust config-focused tests pass.

---

## Goal 4: Introduce Frontend Clipboard Content Renderers

### Current Problem

The backend has an explicit format strategy registry for text/image/file content in `src-tauri/src/clipboard/format/mod.rs`. The frontend does not mirror that boundary.

`src/components/clipboard/ClipboardItem.tsx` currently handles:

- metadata parsing for files,
- metadata parsing for images,
- file classification,
- clip kind calculation,
- icon choice,
- preview rendering,
- image preview modal wiring,
- metadata line rendering,
- tag menu state,
- delete confirmation state,
- favorite behavior,
- batch selection behavior,
- styling/tone mapping.

The component is over 500 lines. The core issue is not just length; it mixes domain interpretation, UI rendering, and item actions. Adding a new clipboard content type or changing file preview behavior requires editing the same large component that also owns tags and row actions.

### Repair Approach

Introduce a frontend renderer registry for clipboard content.

Recommended design:

- Create `src/components/clipboard/renderers/`.
- Add one renderer module per content type:
  - `TextClipboardRenderer.tsx`,
  - `ImageClipboardRenderer.tsx`,
  - `FileClipboardRenderer.tsx`.
- Add `clipboardContentModel.ts` for safe metadata parsing and content classification:
  - parse image metadata,
  - parse file metadata,
  - classify file/folder/multi-selection,
  - expose display kind and metadata line details.
- Add `rendererRegistry.tsx`:
  - maps `ContentType` to renderer,
  - maps display kind to icon/tone.
- Keep `ClipboardItem.tsx` as the row shell:
  - selection checkbox,
  - icon slot,
  - renderer slot,
  - meta line,
  - action buttons,
  - tag menu,
  - image preview host if needed.
- Extract row actions into `useClipboardItemActions`.
- Keep the current UI appearance unless a small adjustment is required by the split.

This is a Strategy/Registry refactor on the frontend. It should not change user-visible behavior.

### Acceptance Criteria

- `ClipboardItem.tsx` is significantly smaller and primarily acts as a row shell.
- Metadata parsing is not embedded directly in `ClipboardItem.tsx`.
- Each content type has a dedicated renderer module.
- Image preview still opens from image rows.
- Sensitive preview masking works for all content types.
- File/folder/multi-file rendering remains equivalent to current behavior.
- Tag assignment/removal behavior remains unchanged.
- Favorite/delete/copy/selection behavior remains unchanged.
- Tests cover text, image, single-file, single-folder, multi-file, sensitive masking, tags, delete confirmation, and image preview.
- Existing `ClipboardItem.test.tsx` tests either still pass or are split into renderer-specific tests.
- No renderer directly calls Tauri IPC; actions remain in the store/action hook.

---

## Goal 5: Unify Search and Filter Semantics Across Frontend and Backend

### Current Problem

Search and filtering rules exist in several layers:

- `src/App.tsx::clipboardItemMatchesView`
  - filters live `clipboard-updated` events before inserting them into the current view.
- `src/stores/clipboardStore.ts`
  - decides whether to call basic filtered search or advanced search.
  - converts frontend options into `AdvancedSearchQuery`.
- `src/lib/tauri.ts`
  - maps TypeScript option names to Tauri command payloads.
- `src-tauri/src/database/productization.rs`
  - implements filtered list/search/advanced search in SQL.

This duplication already caused enough complexity that live event filtering needed careful dependency handling. Future search behavior changes can drift: the backend may include an item that the frontend live predicate rejects, or the frontend may insert a live item that would not appear after a full refresh.

### Repair Approach

Define a single frontend filter model and make all paths derive from it.

Recommended design:

- Create `src/lib/clipboardFilters.ts`.
- Define:
  - `DEFAULT_CLIPBOARD_FILTERS`,
  - `normalizeClipboardFilters`,
  - `hasAdvancedFilters`,
  - `toAdvancedSearchQuery`,
  - `clipboardItemMatchesFilters`.
- `App.tsx` should use `clipboardItemMatchesFilters` for live events.
- `clipboardStore.ts` should use the same normalization and conversion helpers.
- `Header.tsx` should receive and update the same filter shape instead of a partly separate advanced-filter shape where practical.
- Backend query spec in Goal 1 should have the same conceptual fields.
- Name differences between frontend camelCase and backend snake_case should remain localized in the Tauri wrapper.

Do not force Rust and TypeScript to share generated types in this pass. The important goal is semantic alignment and one frontend predicate.

### Acceptance Criteria

- Filter defaults are defined once on the frontend.
- `App.tsx` does not contain its own custom search predicate.
- `clipboardStore.ts` does not duplicate advanced-filter detection logic.
- Live `clipboard-updated` filtering and full fetch/search filtering use the same frontend filter semantics.
- The backend query spec fields line up one-to-one with frontend filter fields.
- Tests cover:
  - live event matches active content type,
  - live event respects favorites,
  - live event respects tag filter,
  - live event respects sensitive-only,
  - live event respects exact match,
  - live event respects created date range,
  - image content base64 is not searched,
  - empty query matches all otherwise-filtered items.
- Existing search UI behavior remains unchanged.

---

## Goal 6: Decompose DataManagementView Into Focused Sections

### Current Problem

`src/components/settings/DataManagementView.tsx` combines many unrelated concerns:

- sensitive capture policy,
- preview masking,
- monitoring toggle,
- tag creation/deletion,
- snippet creation/list/copy/delete,
- source ignore rules,
- external readiness settings,
- import/export path selection,
- backup/restore,
- status messages,
- busy-action state,
- dialog open state,
- helper components.

The file is over 600 lines. It is not just a UI size issue. Each section has different data ownership and side effects, but the parent component owns all local state. This makes it harder to test one section without pulling in all settings behavior.

### Repair Approach

Split the settings data surface by product responsibility.

Recommended structure:

- `src/components/settings/data/DataManagementView.tsx`
  - page-level composition only.
- `SensitiveCaptureSection.tsx`
  - skip sensitive toggle,
  - mask sensitive previews,
  - monitoring toggle,
  - rescan sensitive action.
- `TagsSection.tsx`
  - tag creation,
  - tag list,
  - tag deletion.
- `SnippetsSection.tsx`
  - snippet creation,
  - snippet list,
  - copy/delete snippet actions.
- `SourceRulesSection.tsx`
  - create source ignore rule,
  - toggle source rule,
  - delete source rule.
- `ExternalReadinessSection.tsx`
  - updates/encryption/sync/plugin readiness controls.
- `PortabilitySection.tsx`
  - JSON export/import,
  - CSV export/import,
  - database backup/restore.
- `settingsDataActions.ts`
  - shared action runner,
  - busy state conventions,
  - status message helpers.
- `PathActions.tsx`
  - reusable path input and action buttons.

The parent should pass only the props a section needs or the section should read the specific store slice itself. Prefer store selectors where they reduce prop drilling.

### Acceptance Criteria

- `DataManagementView.tsx` becomes a composition component, not the owner of all section logic.
- Each settings data section can be tested independently.
- Existing labels and behavior remain unchanged.
- Status messages still appear for successful actions.
- Busy state still disables relevant actions while an operation is running.
- Restore database still asks for confirmation.
- Restore/import still refreshes affected clipboard data afterward.
- External readiness controls remain collapsed by default.
- Tests are split so a failure in snippets does not require rendering import/export controls.
- No section owns unrelated local state.
- `pnpm test -- --run src/components/settings` passes.

---

## Goal 7: Introduce Versioned Database Migration Units

### Current Problem

`src-tauri/src/database/connection.rs::init_schema` currently handles:

- opening schema,
- creating core tables,
- adding missing columns,
- creating indexes,
- creating tags/snippets/source-rule tables,
- creating app_config,
- seeding defaults,
- running migrations,
- writing schema version.

This structure is still understandable, but it will not scale well. Migration rules are already embedded as procedural functions:

- `migrate_window_size_defaults`,
- `normalize_legacy_hotkey_config`,
- `run_schema_migrations`,
- `migrate_to_v2`,
- `migrate_to_v3`.

Future migrations will make the file longer and increase the chance that schema creation, default seeding, and migrations interfere with each other.

### Repair Approach

Create a small versioned migration system inside the existing database module.

Recommended design:

- Create `src-tauri/src/database/schema.rs`.
  - table creation,
  - index creation,
  - base schema setup.
- Create `src-tauri/src/database/migrations.rs`.
  - migration descriptors,
  - read/write version,
  - run pending migrations.
- Keep migrations as Rust functions rather than SQL files unless the team wants external migration files later.
- Represent migrations as ordered units:
  - version number,
  - name,
  - function pointer/closure.
- Keep `Database::init_schema` as orchestration:
  - create base schema,
  - seed defaults,
  - run pending migrations.
- Move config default seeding to the config registry from Goal 3 when available.

This should remain lightweight. The app does not need a full migration framework.

### Acceptance Criteria

- `connection.rs` no longer contains all schema SQL and all migration logic.
- Base schema creation is in one module.
- Migrations are listed in explicit version order.
- The current `CURRENT_DB_VERSION` behavior remains unchanged.
- Opening a newer database version still fails with a clear error.
- Legacy v1/v2 migration tests continue to pass.
- Corrupt database preservation behavior remains unchanged.
- Tests cover:
  - fresh database initializes to current version,
  - legacy version upgrades to current version,
  - newer version is rejected,
  - window size migration still applies,
  - legacy hotkey migration still applies,
  - corrupt DB backup still works.
- `cargo test connection` or equivalent targeted database tests pass.

---

## Goal 8: Replace Handwritten CSV Parsing With a CSV Library

### Current Problem

`src-tauri/src/database/data_portability.rs` handwrites CSV output escaping and input parsing:

- `csv_escape`,
- `parse_csv_line`,
- `parse_csv_records`.

The code has tests for multiline content, which is good. But CSV is a common edge-case-heavy format:

- embedded quotes,
- embedded newlines,
- carriage returns,
- empty fields,
- non-UTF-8 input expectations,
- header validation,
- trailing blank records.

This is not a design-pattern problem. It is a "use the standard library ecosystem" problem. A proven CSV crate is safer and easier to maintain.

### Repair Approach

Use the Rust `csv` crate for import/export.

Recommended design:

- Add `csv` to `src-tauri/Cargo.toml`.
- Replace manual CSV string construction with `csv::Writer`.
- Replace manual CSV parsing with `csv::Reader`.
- Define an internal CSV row struct with explicit field names matching the exported header.
- Keep export column names stable unless there is a deliberate migration note.
- Keep import tolerant of current exported CSV files.
- Preserve hash recomputation behavior for imported items.
- Preserve tag parsing behavior from the `tags` field.

### Acceptance Criteria

- `parse_csv_line` and `parse_csv_records` are removed.
- CSV export still writes the same logical columns.
- CSV import accepts files exported by the previous implementation.
- Multiline content import still works.
- Quoted content with commas and quotes imports correctly.
- Empty optional fields are handled the same as before.
- Invalid/missing required columns return `AppError::InvalidInput`.
- Existing data portability tests pass.
- New tests cover quoted fields and missing headers.
- `cargo test data_portability` or equivalent targeted tests pass.

---

## Cross-Cutting Acceptance Standards

These standards apply to every goal above:

- Preserve user-visible behavior unless the goal explicitly calls out a behavior change.
- Keep IPC command names and payload shapes stable.
- Add tests before or alongside each refactor.
- Prefer focused modules over broad shared utility files.
- Do not introduce abstractions that are not exercised by current behavior.
- Avoid "big bang" rewrites. Each goal should be mergeable on its own.
- Do not mix formatting-only churn with structural changes.
- Update docs only when architecture or command contracts change.
- Run targeted tests for the touched area before moving to the next goal.
- Run full verification before considering the full roadmap complete:
  - `pnpm lint`
  - `pnpm test -- --run`
  - `pnpm build`
  - `cd src-tauri && cargo fmt -- --check`
  - `cd src-tauri && cargo clippy -- -D warnings`
  - `cd src-tauri && cargo test`

## Suggested Goal Breakdown for GOAL Mode

Use one active GOAL per section. Do not combine all eight into one implementation goal unless you want a long-running branch with higher merge risk.

Recommended sequence:

1. "Implement shared clipboard query builder and row mapper."
2. "Extract clipboard paste service and window controller."
3. "Introduce typed config registry and config save flow."
4. "Split ClipboardItem into renderer registry and action hook."
5. "Unify frontend clipboard filter model."
6. "Split DataManagementView into focused settings sections."
7. "Move schema setup and migrations into versioned modules."
8. "Replace handwritten CSV parsing with csv crate."

Each GOAL should end with:

- focused test evidence,
- relevant full-suite evidence if the change touches shared behavior,
- a short note about any behavior intentionally preserved,
- no unrelated cleanup.

## Risk Notes

- Query builder refactor has the most regression risk because it affects all search/list behavior.
- Paste service extraction has timing and platform risk; verify on Windows first because the app is Windows-first.
- Config registry touches both frontend and backend; keep the first pass conservative and avoid changing setting names.
- Renderer split has UI regression risk; keep screenshots or component tests around text/image/file cases.
- DataManagementView split is mostly structural but can easily break store mocks in tests.
- Migration split should avoid changing SQL semantics while moving code.
- CSV library migration should preserve compatibility with existing exports.

## Definition of Done for the Roadmap

The roadmap is complete when:

- All eight goals are implemented or deliberately deferred with a written reason.
- The duplicated query, paste, config, row mapping, and CSV parsing paths listed in this document no longer exist.
- Large UI files have clearer ownership boundaries.
- Existing tests are updated to cover the new boundaries instead of only testing end-to-end behavior.
- Full verification commands listed in Cross-Cutting Acceptance Standards pass.
- Architecture docs are updated if new modules become part of the recommended extension path.
