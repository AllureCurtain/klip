# Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the release-readiness gaps found in the 2026-06-05 audit so Klip can be published with cleaner security posture, isolated E2E runs, better list UX, and more reliable data handling.

**Architecture:** Keep the existing Tauri 2 + React + Rust + SQLite architecture. Fix cross-cutting problems by extracting small shared helpers instead of adding broad rewrites: runtime path resolution for tests, shared clipboard hashing, batched tag hydration, and bounded export streaming. UI fixes stay local to the clipboard list surface and global overflow CSS.

**Tech Stack:** Tauri 2, Rust, rusqlite, React 19, TypeScript, Zustand, Tailwind CSS, Vitest, Selenium WebDriver, pnpm, GitHub Actions.

---

## Audit Findings Covered

| Priority | Finding | User Impact | Main Fix |
| --- | --- | --- | --- |
| P0 | Windows E2E data isolation does not work | Local/CI test runs can read and write the real user database | Add explicit `KLIP_DATA_DIR` and `KLIP_LOG_DIR` runtime overrides and make E2E scripts use them |
| P0 | `pnpm audit` reports vulnerable dev dependencies on official npm registry | Security claims are inaccurate; CI/dev tooling has known vulnerabilities | Upgrade Vitest tooling and override `tmp` to a patched version |
| P1 | Horizontal scrollbar appears in the clipboard popup | Real users see an unpolished main window and wasted space | Remove item margin overflow and hide root-level overflow |
| P1 | Selected/copied row contrast can be poor in real Tauri screenshots | The active row can be harder to read | Use quiet ring/border feedback instead of strong filled row states |
| P1 | Import hash logic differs from capture hash logic | Imported items can duplicate already captured items | Add one shared hash helper and use it in capture and import paths |
| P1 | Tag hydration is N+1 | Filtered lists and exports slow down as history grows | Fetch tags for a page with one query |
| P2 | Full export loads all items into memory | Large histories can stall the app and increase memory use | Stream JSON/CSV exports in pages |
| P2 | Release checks do not include official npm audit or RustSec audit | CI can pass while known dependency advisories exist | Add explicit audit steps after dependency fixes |
| P2 | Command/database modules are large and tightly coupled | Future changes are harder to review safely | Keep this release scoped, but add bounded follow-up refactor points |

## File Structure

- Modify: `scripts/run-e2e.ps1`
  - Set explicit data/log override env vars for Windows E2E.
  - Restore those env vars in `finally`.
- Modify: `scripts/run-e2e-linux.sh`
  - Use the same override names where the Linux runner is used.
- Modify: `src-tauri/src/database/connection.rs`
  - Add reusable app data directory resolution with `KLIP_DATA_DIR`.
  - Use that helper from `get_db_path`.
- Modify: `src-tauri/src/commands/mod.rs`
  - Use the same data dir helper for diagnostics.
- Modify: `src-tauri/src/main.rs`
  - Add `KLIP_LOG_DIR` override in `init_tracing`.
- Create: `src-tauri/src/clipboard/hash.rs`
  - Centralize SHA-256 helpers for raw clipboard bytes and stored content.
- Modify: `src-tauri/src/clipboard/mod.rs`
  - Export the new hash module.
- Modify: `src-tauri/src/clipboard/format/text.rs`
  - Use shared raw-byte hash helper.
- Modify: `src-tauri/src/clipboard/format/image.rs`
  - Use shared raw-byte hash helper.
- Modify: `src-tauri/src/clipboard/format/file.rs`
  - Use shared raw-byte hash helper.
- Modify: `src-tauri/src/database/data_portability.rs`
  - Use shared stored-content hash helper.
  - Stream exports in pages.
- Modify: `src-tauri/src/database/clipboard_query.rs`
  - Replace per-item tag hydration with batched hydration.
- Modify: `src/components/clipboard/ClipboardItem.tsx`
  - Remove horizontal margins from the row component.
  - Change copied/batch-selected feedback to readable, quiet styles.
- Modify: `src/components/clipboard/ClipboardList.tsx`
  - Put row spacing on the virtual row wrapper with `box-border` padding.
- Modify: `src/styles/globals.css`
  - Prevent root/body horizontal overflow.
- Modify: `src/components/clipboard/ClipboardItem.test.tsx`
  - Update class assertions for the new quiet row state.
- Modify: `src/components/clipboard/ClipboardList.test.tsx`
  - Add regression coverage for row wrapper horizontal padding and no item margin.
- Modify: `package.json`
  - Upgrade Vitest packages.
  - Override `tmp` to a patched version.
  - Add official-registry audit scripts if desired.
- Modify: `pnpm-lock.yaml`
  - Refresh lockfile after dependency changes.
- Modify: `.github/workflows/ci.yml`
  - Add npm audit and RustSec audit steps after dependency fixes.
- Modify: `.github/workflows/release.yml`
  - Run the same audit checks before installer packaging.
- Modify: `CHANGELOG.md`
  - Replace the stale audit claim with the new verified state.
- Modify: `docs/RELEASE_CHECKLIST.md`
  - Add explicit installed-build validation and audit gates.

---

### Task 1: Isolate E2E Data and Logs

**Files:**
- Modify: `src-tauri/src/database/connection.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `scripts/run-e2e.ps1`
- Modify: `scripts/run-e2e-linux.sh`

- [ ] **Step 1: Add a failing Rust test for explicit data dir override**

Add this test to `src-tauri/src/database/connection.rs` inside the existing `#[cfg(test)] mod tests`:

```rust
#[test]
fn app_data_dir_prefers_klip_data_dir_env_override() {
    let dir = temp_dir("env-data-dir");
    std::env::set_var(super::ENV_KLIP_DATA_DIR, &dir);

    let resolved = super::app_data_dir_from_env().unwrap();

    std::env::remove_var(super::ENV_KLIP_DATA_DIR);
    assert_eq!(resolved, Some(dir));
}
```

Run:

```powershell
cd src-tauri
cargo test database::connection::tests::app_data_dir_prefers_klip_data_dir_env_override
```

Expected before implementation:

```text
error[E0425]: cannot find value `ENV_KLIP_DATA_DIR`
```

- [ ] **Step 2: Implement the data dir helper**

In `src-tauri/src/database/connection.rs`, add this near the top-level helpers:

```rust
pub const ENV_KLIP_DATA_DIR: &str = "KLIP_DATA_DIR";

pub fn app_data_dir_from_env() -> Option<PathBuf> {
    std::env::var_os(ENV_KLIP_DATA_DIR)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

pub fn app_data_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    if let Some(path) = app_data_dir_from_env() {
        return Ok(path);
    }

    #[cfg(target_os = "linux")]
    {
        let _ = app_handle;
        Ok(crate::platform::linux::data_dir())
    }

    #[cfg(not(target_os = "linux"))]
    {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::System(format!("failed to resolve app data dir: {}", e)))
    }
}
```

Then replace the platform-specific body of `get_db_path` with:

```rust
pub fn get_db_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, AppError> {
    let app_data_dir = app_data_dir(app_handle)?;

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| AppError::System(format!("failed to create app data dir: {}", e)))?;

    Ok(app_data_dir.join("klip.db"))
}
```

- [ ] **Step 3: Use the same helper in diagnostics**

In `src-tauri/src/commands/mod.rs`, replace the existing `data_dir` resolution in `get_diagnostics_info` with:

```rust
let data_dir = database::app_data_dir(&app)?;
```

Keep `build_diagnostics_paths(&data_dir)` unchanged.

- [ ] **Step 4: Add a log dir override**

In `src-tauri/src/main.rs`, add this constant near the tracing helpers:

```rust
const ENV_KLIP_LOG_DIR: &str = "KLIP_LOG_DIR";
```

In `init_tracing`, resolve the log directory with:

```rust
let log_dir = std::env::var_os(ENV_KLIP_LOG_DIR)
    .filter(|value| !value.is_empty())
    .map(std::path::PathBuf::from)
    .unwrap_or_else(|| {
        #[cfg(target_os = "linux")]
        {
            let _ = app;
            klip::platform::linux::log_dir()
        }

        #[cfg(not(target_os = "linux"))]
        {
            app.path()
                .app_log_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("klip-logs"))
        }
    });
```

- [ ] **Step 5: Update Windows E2E script**

In `scripts/run-e2e.ps1`, add previous-env capture:

```powershell
$previousDataDir = $env:KLIP_DATA_DIR
$previousLogDir = $env:KLIP_LOG_DIR
```

After `$env:KLIP_E2E_SHOW_WINDOW = '1'`, set:

```powershell
$env:KLIP_DATA_DIR = Join-Path $runRoot 'KlipData'
$env:KLIP_LOG_DIR = Join-Path $runRoot 'KlipLogs'
New-Item -ItemType Directory -Force -Path $env:KLIP_DATA_DIR, $env:KLIP_LOG_DIR | Out-Null
```

In both restore blocks, add:

```powershell
$env:KLIP_DATA_DIR = $previousDataDir
$env:KLIP_LOG_DIR = $previousLogDir
```

- [ ] **Step 6: Update Linux E2E script**

In `scripts/run-e2e-linux.sh`, export:

```bash
export KLIP_DATA_DIR="$RUN_ROOT/KlipData"
export KLIP_LOG_DIR="$RUN_ROOT/KlipLogs"
mkdir -p "$KLIP_DATA_DIR" "$KLIP_LOG_DIR"
```

- [ ] **Step 7: Verify E2E writes only to the temp directory**

Run:

```powershell
pnpm e2e
Get-ChildItem -Path e2e\.tmp -Recurse -Filter klip.db | Sort-Object LastWriteTime -Descending | Select-Object -First 1 FullName
```

Expected:

```text
The latest klip.db path is under D:\Study\cc\klip\e2e\.tmp\...
```

Also inspect real app data:

```powershell
Get-Item "$env:APPDATA\com.klip.app\klip.db" | Select-Object FullName,LastWriteTime
```

Expected:

```text
LastWriteTime does not change during the E2E run.
```

- [ ] **Step 8: Commit**

```powershell
git add src-tauri/src/database/connection.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs scripts/run-e2e.ps1 scripts/run-e2e-linux.sh
git commit -m "test: isolate e2e app data and logs"
```

---

### Task 2: Fix Dev Dependency Audit Findings

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Confirm current audit failure**

Run:

```powershell
pnpm audit --registry=https://registry.npmjs.org
```

Expected before implementation:

```text
2 vulnerabilities found
Severity: 1 high | 1 critical
```

- [ ] **Step 2: Upgrade Vitest and patch tmp**

Run:

```powershell
pnpm up -D vitest@^4.1.8 @vitest/coverage-v8@^4.1.8 --registry=https://registry.npmjs.org
```

Then modify `package.json` under `pnpm.overrides`:

```json
"tmp": "0.2.6"
```

Keep the existing overrides for `diff`, `glob`, and `serialize-javascript`.

Refresh the lockfile:

```powershell
pnpm install --lockfile-only --registry=https://registry.npmjs.org
```

- [ ] **Step 3: Verify test runner compatibility**

Run:

```powershell
pnpm test -- --run
pnpm test:coverage
```

Expected:

```text
All Vitest test files pass.
Coverage command exits 0 and prints a text coverage table.
```

- [ ] **Step 4: Verify audit is clean on official registry**

Run:

```powershell
pnpm audit --registry=https://registry.npmjs.org
```

Expected:

```text
No known vulnerabilities found
```

- [ ] **Step 5: Update changelog wording**

In `CHANGELOG.md`, replace the current security line:

```markdown
- Pinned patched transitive Mocha dependencies so `pnpm audit` reports no known vulnerabilities.
```

with:

```markdown
- Upgraded Vitest tooling and pinned patched transitive dependencies so `pnpm audit --registry=https://registry.npmjs.org` reports no known vulnerabilities.
```

- [ ] **Step 6: Commit**

```powershell
git add package.json pnpm-lock.yaml CHANGELOG.md
git commit -m "chore: resolve development dependency advisories"
```

---

### Task 3: Remove Clipboard List Horizontal Overflow and Improve Row Contrast

**Files:**
- Modify: `src/components/clipboard/ClipboardItem.tsx`
- Modify: `src/components/clipboard/ClipboardList.tsx`
- Modify: `src/styles/globals.css`
- Modify: `src/components/clipboard/ClipboardItem.test.tsx`
- Modify: `src/components/clipboard/ClipboardList.test.tsx`

- [ ] **Step 1: Add regression assertions for no item margin overflow**

In `src/components/clipboard/ClipboardList.test.tsx`, add:

```tsx
it('keeps horizontal row spacing inside the virtual row bounds', () => {
  render(<ClipboardList items={[makeItem({ id: 1, content: 'hello' })]} />);

  const virtualRow = document.querySelector('[data-testid="clipboard-virtual-row"]');
  expect(virtualRow?.className).toContain('px-1.5');

  const row = screen.getByText('hello').closest('[data-testid="clipboard-item"]');
  expect(row?.className).not.toContain('mx-1.5');
});
```

If the test file does not already expose `makeItem`, use its existing local item factory and pass a single text item.

Expected before implementation:

```text
The test fails because virtual rows do not have the test id and the item still has mx-1.5.
```

- [ ] **Step 2: Move horizontal spacing to the virtual row wrapper**

In `src/components/clipboard/ClipboardList.tsx`, change the item virtual row wrapper to:

```tsx
<div
  key={row.id}
  data-testid="clipboard-virtual-row"
  style={{
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: `${ITEM_HEIGHT}px`,
    overflow: 'visible',
    transform: `translateY(${virtualRow.start}px)`,
  }}
  className="box-border px-1.5 py-[3px]"
>
```

- [ ] **Step 3: Remove row horizontal margin and add test id**

In `src/components/clipboard/ClipboardItem.tsx`, add `data-testid="clipboard-item"` to the top-level `motion.div`.

Change this class fragment:

```tsx
'group relative mx-1.5 flex h-14 cursor-pointer items-center gap-2 overflow-hidden',
```

to:

```tsx
'group relative flex h-14 cursor-pointer items-center gap-2 overflow-hidden',
```

- [ ] **Step 4: Hide root-level horizontal overflow**

In `src/styles/globals.css`, update the base layer:

```css
html,
body,
#root {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
```

Keep the existing `body` font and min-size rules.

- [ ] **Step 5: Make copied/batch-selected rows readable**

In `src/components/clipboard/ClipboardItem.tsx`, replace:

```tsx
strongRowState && tone.selected
```

with:

```tsx
strongRowState && 'border-primary/35 bg-primary/8 text-foreground shadow-[var(--shadow-ring)]'
```

This keeps feedback visible without relying on a saturated content-type fill.

- [ ] **Step 6: Update row-state test expectations**

In `src/components/clipboard/ClipboardItem.test.tsx`, update tests that assert row class names so they expect:

```tsx
expect(row.className).toContain('border-primary/35');
expect(row.className).toContain('bg-primary/8');
expect(row.className).toContain('text-foreground');
```

and do not expect `bg-indigo-500/8` for copied or batch-selected rows.

- [ ] **Step 7: Verify frontend tests and screenshot**

Run:

```powershell
pnpm test -- --run src/components/clipboard/ClipboardItem.test.tsx src/components/clipboard/ClipboardList.test.tsx
pnpm build
pnpm e2e
```

Expected:

```text
Targeted tests pass.
Vite production build succeeds.
Desktop E2E still passes.
```

Take a WebDriver screenshot after the change and confirm:

```text
No bottom horizontal scrollbar is visible.
Selected/copied row text remains readable.
```

- [ ] **Step 8: Commit**

```powershell
git add src/components/clipboard/ClipboardItem.tsx src/components/clipboard/ClipboardList.tsx src/styles/globals.css src/components/clipboard/ClipboardItem.test.tsx src/components/clipboard/ClipboardList.test.tsx
git commit -m "fix: prevent clipboard list horizontal overflow"
```

---

### Task 4: Centralize Clipboard Content Hashing

**Files:**
- Create: `src-tauri/src/clipboard/hash.rs`
- Modify: `src-tauri/src/clipboard/mod.rs`
- Modify: `src-tauri/src/clipboard/format/text.rs`
- Modify: `src-tauri/src/clipboard/format/image.rs`
- Modify: `src-tauri/src/clipboard/format/file.rs`
- Modify: `src-tauri/src/database/data_portability.rs`

- [ ] **Step 1: Add failing tests for import/capture hash consistency**

Add this test to `src-tauri/src/database/data_portability.rs` inside the existing tests module:

```rust
#[test]
fn import_csv_hash_matches_normal_text_capture_hash() {
    let content = "same text content";
    let expected = {
        let mut hasher = sha2::Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    };

    assert_eq!(super::hash_content("text", content), expected);
}
```

Run:

```powershell
cd src-tauri
cargo test database::data_portability::tests::import_csv_hash_matches_normal_text_capture_hash
```

Expected before implementation:

```text
The assertion fails because hash_content includes content_type and a separator.
```

- [ ] **Step 2: Create shared hash helper**

Create `src-tauri/src/clipboard/hash.rs`:

```rust
use base64::Engine;
use sha2::{Digest, Sha256};

const PNG_DATA_URL_PREFIX: &str = "data:image/png;base64,";

pub fn hash_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

pub fn hash_stored_content(content_type: &str, content: &str) -> String {
    if content_type == "image" {
        if let Some(data) = content.strip_prefix(PNG_DATA_URL_PREFIX) {
            if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(data) {
                return hash_bytes(&decoded);
            }
        }
    }

    hash_bytes(content.as_bytes())
}
```

In `src-tauri/src/clipboard/mod.rs`, add:

```rust
pub mod hash;
```

- [ ] **Step 3: Update format strategies**

In `text.rs`, `image.rs`, and `file.rs`, remove local `compute_hash` helpers and replace calls with:

```rust
let hash = crate::clipboard::hash::hash_bytes(&data);
```

For image PNG data:

```rust
let hash = crate::clipboard::hash::hash_bytes(&png_data);
```

- [ ] **Step 4: Update import hash logic**

In `src-tauri/src/database/data_portability.rs`, replace `hash_content` with:

```rust
fn hash_content(content_type: &str, content: &str) -> String {
    crate::clipboard::hash::hash_stored_content(content_type, content)
}
```

In `import_items`, compute the hash from content instead of trusting the imported hash:

```rust
let hash = hash_content(item.content_type.as_str(), &item.content);
```

This makes old exports dedupe against normally captured items even if the old export stored a mismatched hash.

- [ ] **Step 5: Verify Rust tests**

Run:

```powershell
cd src-tauri
cargo test
```

Expected:

```text
All Rust unit and integration tests pass.
```

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/clipboard/hash.rs src-tauri/src/clipboard/mod.rs src-tauri/src/clipboard/format/text.rs src-tauri/src/clipboard/format/image.rs src-tauri/src/clipboard/format/file.rs src-tauri/src/database/data_portability.rs
git commit -m "fix: share clipboard content hashing"
```

---

### Task 5: Batch Tag Hydration

**Files:**
- Modify: `src-tauri/src/database/clipboard_query.rs`

- [ ] **Step 1: Add a multi-item tag hydration regression test**

Add this test to `src-tauri/src/database/clipboard_query.rs` tests:

```rust
#[test]
fn fetch_items_with_tags_hydrates_tags_for_multiple_items() {
    let db = test_db();
    let conn = db.get_connection().unwrap();
    insert_item(&conn, "text", Some("alpha"), "alpha", "hash-alpha", 1_000, 1_000);
    insert_item(&conn, "text", Some("beta"), "beta", "hash-beta", 2_000, 2_000);
    let work = create_tag(&conn, "Work");
    let personal = create_tag(&conn, "Personal");
    assign_tag(&conn, "hash-alpha", work);
    assign_tag(&conn, "hash-beta", personal);
    drop(conn);

    let items = fetch_items_with_tags(&db, &ClipboardQuerySpec::new(10, 0)).unwrap();

    assert_eq!(items.len(), 2);
    assert_eq!(items[0].hash, "hash-beta");
    assert_eq!(items[0].tags[0].name, "Personal");
    assert_eq!(items[1].hash, "hash-alpha");
    assert_eq!(items[1].tags[0].name, "Work");
}
```

Run:

```powershell
cd src-tauri
cargo test database::clipboard_query::tests::fetch_items_with_tags_hydrates_tags_for_multiple_items
```

Expected before implementation:

```text
The test passes with the current implementation, proving behavior before the performance refactor.
```

- [ ] **Step 2: Replace N+1 hydration with one query**

Replace `hydrate_tags` in `src-tauri/src/database/clipboard_query.rs` with:

```rust
pub(crate) fn hydrate_tags(
    conn: &rusqlite::Connection,
    items: &mut [ClipboardItem],
) -> Result<(), AppError> {
    if items.is_empty() {
        return Ok(());
    }

    let item_ids = items.iter().map(|item| item.id).collect::<Vec<_>>();
    let placeholders = (0..item_ids.len())
        .map(|index| format!("?{}", index + 1))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT it.item_id, t.id, t.name, t.color, t.created_at
         FROM clipboard_item_tags it
         JOIN tags t ON it.tag_id = t.id
         WHERE it.item_id IN ({})
         ORDER BY it.item_id, t.name COLLATE NOCASE",
        placeholders
    );

    let mut tags_by_item =
        std::collections::HashMap::<i64, Vec<Tag>>::with_capacity(item_ids.len());
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(item_ids), |row| {
        Ok((
            row.get::<_, i64>(0)?,
            Tag {
                id: row.get(1)?,
                name: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            },
        ))
    })?;

    for row in rows {
        let (item_id, tag) = row?;
        tags_by_item.entry(item_id).or_default().push(tag);
    }

    for item in items {
        item.tags = tags_by_item.remove(&item.id).unwrap_or_default();
    }

    Ok(())
}
```

- [ ] **Step 3: Verify Rust tests**

Run:

```powershell
cd src-tauri
cargo test database::clipboard_query
cargo test
```

Expected:

```text
The clipboard query test module passes.
All Rust tests pass.
```

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/src/database/clipboard_query.rs
git commit -m "perf: batch hydrate clipboard item tags"
```

---

### Task 6: Stream JSON and CSV Exports in Pages

**Files:**
- Modify: `src-tauri/src/database/data_portability.rs`

- [ ] **Step 1: Keep existing export tests as the baseline**

Run:

```powershell
cd src-tauri
cargo test database::data_portability::tests::export_json_creates_parent_directories
```

Expected before implementation:

```text
The existing export test passes.
```

- [ ] **Step 2: Add a paged export helper**

In `data_portability.rs`, add:

```rust
const EXPORT_PAGE_SIZE: i64 = 500;

fn load_items_page(
    conn: &rusqlite::Connection,
    offset: i64,
) -> Result<Vec<ClipboardItem>, AppError> {
    let spec = ClipboardQuerySpec::new(EXPORT_PAGE_SIZE, offset);
    clipboard_query::fetch_items_with_tags_locked(conn, &spec)
}
```

- [ ] **Step 3: Stream JSON export to a file**

Replace `export_json` with this shape:

```rust
pub fn export_json(db: &Database, path: &str) -> Result<BackupSummary, AppError> {
    let output = Path::new(path);
    ensure_parent_dir(output)?;

    let conn = db.get_connection()?;
    let tags = list_tags_locked(&conn)?;
    let mut file = std::fs::File::create(output)
        .map_err(|e| AppError::System(format!("failed to write file: {}", e)))?;

    use std::io::Write;
    write!(
        file,
        "{{\"version\":{},\"exported_at\":{},\"items\":[",
        SUPPORTED_EXPORT_VERSION,
        now_millis()
    )
    .map_err(|e| AppError::System(format!("failed to write export: {}", e)))?;

    let mut offset = 0;
    let mut first = true;
    loop {
        let items = load_items_page(&conn, offset)?;
        if items.is_empty() {
            break;
        }
        for item in items {
            if !first {
                write!(file, ",")
                    .map_err(|e| AppError::System(format!("failed to write export: {}", e)))?;
            }
            serde_json::to_writer(&mut file, &item)
                .map_err(|e| AppError::System(format!("failed to serialize export: {}", e)))?;
            first = false;
        }
        offset += EXPORT_PAGE_SIZE;
    }

    write!(file, "],\"tags\":")
        .map_err(|e| AppError::System(format!("failed to write export: {}", e)))?;
    serde_json::to_writer(&mut file, &tags)
        .map_err(|e| AppError::System(format!("failed to serialize export: {}", e)))?;
    write!(file, "}}")
        .map_err(|e| AppError::System(format!("failed to write export: {}", e)))?;
    file.flush()
        .map_err(|e| AppError::System(format!("failed to flush export: {}", e)))?;

    let size = std::fs::metadata(output)
        .map_err(|e| AppError::System(format!("failed to inspect export: {}", e)))?
        .len();
    Ok(BackupSummary {
        path: path.to_string(),
        size,
    })
}
```

- [ ] **Step 4: Stream CSV export to a file**

Replace the `Vec<u8>` writer in `export_csv` with a file writer:

```rust
pub fn export_csv(db: &Database, path: &str) -> Result<BackupSummary, AppError> {
    let output = Path::new(path);
    ensure_parent_dir(output)?;

    let conn = db.get_connection()?;
    let file = std::fs::File::create(output)
        .map_err(|e| AppError::System(format!("failed to write file: {}", e)))?;
    let mut writer = csv::WriterBuilder::new()
        .has_headers(false)
        .from_writer(file);
    writer.write_record(CSV_HEADERS).map_err(csv_error)?;

    let mut offset = 0;
    loop {
        let items = load_items_page(&conn, offset)?;
        if items.is_empty() {
            break;
        }
        for item in items {
            let tags = item
                .tags
                .iter()
                .map(|tag| tag.name.as_str())
                .collect::<Vec<_>>()
                .join("|");
            writer
                .serialize(ClipboardCsvRow {
                    id: item.id,
                    content_type: item.content_type.as_str().to_string(),
                    preview: item.preview.unwrap_or_default(),
                    content: item.content,
                    is_favorited: item.is_favorited,
                    is_sensitive: item.is_sensitive,
                    sensitivity_reason: item.sensitivity_reason.unwrap_or_default(),
                    tags,
                    created_at: item.created_at,
                    last_used_at: item.last_used_at,
                })
                .map_err(csv_error)?;
        }
        offset += EXPORT_PAGE_SIZE;
    }

    writer.flush().map_err(|e| {
        AppError::System(format!("failed to flush CSV export: {}", e))
    })?;

    let size = std::fs::metadata(output)
        .map_err(|e| AppError::System(format!("failed to inspect export: {}", e)))?
        .len();
    Ok(BackupSummary {
        path: path.to_string(),
        size,
    })
}
```

- [ ] **Step 5: Verify export/import tests**

Run:

```powershell
cd src-tauri
cargo test database::data_portability
cargo test
```

Expected:

```text
All data portability tests pass.
All Rust tests pass.
```

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/database/data_portability.rs
git commit -m "perf: stream clipboard exports in pages"
```

---

### Task 7: Add Dependency Audit Gates to CI and Release

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `docs/RELEASE_CHECKLIST.md`

- [ ] **Step 1: Add npm audit to CI**

In `.github/workflows/ci.yml`, after `pnpm install --frozen-lockfile`, add:

```yaml
      - run: pnpm audit --registry=https://registry.npmjs.org --audit-level high
```

Add it in the frontend job. This checks dev dependencies before lint/test/build.

- [ ] **Step 2: Add RustSec audit to CI**

In the backend job, after the Rust toolchain setup and before `cargo fmt`, add:

```yaml
      - uses: rustsec/audit-check@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          working-directory: src-tauri
```

- [ ] **Step 3: Add the same audits to release workflow**

In `.github/workflows/release.yml`, after `pnpm install --frozen-lockfile`, add:

```yaml
      - run: pnpm audit --registry=https://registry.npmjs.org --audit-level high

      - uses: rustsec/audit-check@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          working-directory: src-tauri
```

Keep `pnpm release:verify -SkipBundle` after these audit checks.

- [ ] **Step 4: Document the gates**

In `docs/RELEASE_CHECKLIST.md`, add these preflight checklist items:

```markdown
- [ ] `pnpm audit --registry=https://registry.npmjs.org --audit-level high` reports no high or critical advisories.
- [ ] RustSec audit in GitHub Actions reports no unreviewed Rust advisories for the release build.
```

- [ ] **Step 5: Verify YAML shape**

Run:

```powershell
pnpm lint
```

Expected:

```text
ESLint passes. Workflow syntax is validated by GitHub on push.
```

- [ ] **Step 6: Commit**

```powershell
git add .github/workflows/ci.yml .github/workflows/release.yml docs/RELEASE_CHECKLIST.md
git commit -m "ci: add dependency audit gates"
```

---

### Task 8: Final Release Verification Pass

**Files:**
- Read: `README.md`
- Read: `CHANGELOG.md`
- Read: `docs/RELEASE_CHECKLIST.md`
- Read: `docs/RELEASE_VALIDATION_v0.1.2.md`

- [ ] **Step 1: Run full local verification**

Run:

```powershell
pnpm lint
pnpm test -- --run
pnpm test:coverage
pnpm build
cd src-tauri
cargo fmt -- --check
cargo clippy -- -D warnings
cargo test
cd ..
pnpm e2e
pnpm audit --registry=https://registry.npmjs.org --audit-level high
```

Expected:

```text
All commands exit 0.
Vitest reports all test files passed.
Cargo reports all tests passed.
Desktop E2E reports 1 passing test.
pnpm audit reports no high or critical vulnerabilities.
```

- [ ] **Step 2: Run release readiness**

Run:

```powershell
pnpm release:readiness
```

Expected for unsigned/manual-distribution releases:

```text
Windows signing inputs are not configured. Installers may show SmartScreen or unknown publisher warnings.
Windows signing timestamp URL is not configured.
Update feed URL is not configured. Publish updates through GitHub Release/manual installer distribution.
```

If a signed release is planned, configure these before release:

```powershell
$env:KLIP_WINDOWS_CERTIFICATE_THUMBPRINT = '<thumbprint>'
$env:KLIP_WINDOWS_TIMESTAMP_URL = 'https://timestamp.digicert.com'
$env:KLIP_UPDATE_FEED_URL = 'https://<hosted-feed-url>'
```

Then rerun `pnpm release:readiness` and record the configured status in release notes.

- [ ] **Step 3: Run release verification without bundling**

Run:

```powershell
pnpm release:verify -SkipBundle
```

Expected:

```text
Version metadata OK: 0.1.2
Frontend lint, tests, and build pass.
Rust fmt, clippy, and tests pass.
Skipping installer bundle build.
Release verification complete.
```

- [ ] **Step 4: Build installers when ready**

Run on a Windows desktop session:

```powershell
pnpm release:verify
```

Expected:

```text
MSI and NSIS installer paths are printed with file sizes.
```

- [ ] **Step 5: Manually validate installed build**

Use `docs/RELEASE_CHECKLIST.md` sections 3 through 9. Record:

```text
Windows version
Installer filename
Installer SHA-256
Fresh install result
Tray behavior result
Text/image/file capture result
Quick paste result
Import/export/backup/restore result
Autostart enable/disable result
Uninstall cleanup result
```

- [ ] **Step 6: Commit validation notes**

If a new validation document is created:

```powershell
git add docs/RELEASE_VALIDATION_v0.1.3.md
git commit -m "docs: record release validation results"
```

Use the next actual version number instead of `v0.1.3` if the release version differs.

---

## Follow-Up Refactor Notes

These are intentionally not release-blocking if Tasks 1 through 8 are done.

1. Split `src-tauri/src/commands/mod.rs` into smaller command groups:
   - `commands/clipboard.rs`
   - `commands/config.rs`
   - `commands/system.rs`
   - keep `commands/productization.rs`
2. Split `src-tauri/src/database/data_portability.rs` after export streaming:
   - `database/export.rs`
   - `database/import.rs`
   - `database/restore.rs`
3. Move long-running database operations behind progress events:
   - `export-progress`
   - `import-progress`
   - `sensitive-rescan-progress`
4. Replace single-connection long locks with short transactions where possible.

These refactors should each get their own plan after the release hardening work is complete.

---

## Self-Review

- Spec coverage: all audit findings from the 2026-06-05 review have a task or explicit follow-up note.
- Placeholder scan: no task leaves an unspecified implementation step.
- Type consistency: all Rust helper names are defined before use: `ENV_KLIP_DATA_DIR`, `app_data_dir_from_env`, `app_data_dir`, `hash_bytes`, `hash_stored_content`, and `load_items_page`.
- Scope check: the plan focuses on release hardening. Larger command/database refactors are recorded as follow-up work, not mixed into this pass.
- Verification coverage: each task includes targeted verification plus final full-suite verification.
