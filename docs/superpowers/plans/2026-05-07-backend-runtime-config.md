# Backend Runtime Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Windows-first backend runtime behavior internally consistent by turning hotkey settings into real runtime config, removing autostart placeholder args, aligning database indexing with query semantics, and syncing docs to actual implementation scope.

**Architecture:** Keep the current Tauri + Rust backend structure, but move hotkey registration behind a small config-driven service in `hotkey/manager.rs`. Reuse `app_config` as the source of truth, reload hotkeys on supported config changes, and keep SQLite as a single-connection `Mutex<Connection>` design while improving query/index alignment instead of introducing larger storage refactors.

**Tech Stack:** Rust, Tauri 2, `tauri-plugin-global-shortcut`, `tauri-plugin-autostart`, `rusqlite`, TypeScript docs/frontend typings

---

### Task 1: Normalize Runtime Config Surface

**Files:**
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/database/connection.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src/lib/tauri.ts`
- Test: `src-tauri/src/database/clipboard.rs`

- [ ] **Step 1: Write the failing config contract tests**

Add focused unit tests in `src-tauri/src/database/clipboard.rs`'s test module or create a nearby `#[cfg(test)]` section in `src-tauri/src/database/connection.rs` to verify defaults and supported config values are stable.

```rust
#[test]
fn default_hotkey_config_matches_runtime_contract() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;").unwrap();
    let db = crate::database::Database::from_conn(conn);
    db.init_schema().unwrap();

    let toggle = crate::database::config::get(&db, "hotkey_toggle_window")
        .unwrap()
        .unwrap();
    let prefix = crate::database::config::get(&db, "hotkey_quick_paste_prefix")
        .unwrap()
        .unwrap();

    assert_eq!(toggle, "Ctrl+Alt+K");
    assert_eq!(prefix, "Ctrl+Alt");
}
```

- [ ] **Step 2: Run the new focused Rust test and verify baseline**

Run: `cargo test default_hotkey_config_matches_runtime_contract`
Expected: PASS once test is added. If it fails, inspect current defaults before any implementation change.

- [ ] **Step 3: Remove autostart placeholder arguments from startup**

Change `src-tauri/src/main.rs` so autostart initialization no longer injects fake args.

```rust
.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    None,
))
```

- [ ] **Step 4: Keep config API surface narrow and explicit**

Do not add generic new config keys. Keep the current keys, but make it explicit in comments and docs that only `hotkey_toggle_window`, `hotkey_quick_paste_prefix`, and `auto_start` are runtime-consumed right now.

Update `src-tauri/src/commands/mod.rs` with a short comment around `set_config`:

```rust
// Only a subset of app_config keys currently has runtime side effects.
database::config::set(&db, &key, &value)?;
```

- [ ] **Step 5: Verify Rust formatting and compile state after config normalization**

Run: `cargo fmt --check`
Expected: either PASS or only known formatting diffs in files you just touched.

Run: `cargo clippy -- -D warnings`
Expected: PASS

- [ ] **Step 6: Commit the config normalization slice**

```bash
git add src-tauri/src/main.rs src-tauri/src/database/connection.rs src-tauri/src/commands/mod.rs src/lib/tauri.ts
git commit -m "refactor: normalize backend runtime config surface"
```

### Task 2: Make Hotkeys Real Runtime Config

**Files:**
- Modify: `src-tauri/src/hotkey/manager.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/capabilities/default.json`
- Test: `src-tauri/src/hotkey/manager.rs`

- [ ] **Step 1: Write failing parser and reload tests**

Add unit tests in `src-tauri/src/hotkey/manager.rs` for the config parsing layer before wiring Tauri runtime calls.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_supported_toggle_hotkey() {
        let parsed = parse_toggle_shortcut("Ctrl+Alt+K").unwrap();
        assert_eq!(parsed, Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyK));
    }

    #[test]
    fn rejects_unsupported_toggle_hotkey_shape() {
        assert!(parse_toggle_shortcut("Ctrl+Shift+K").is_err());
        assert!(parse_toggle_shortcut("Alt+K").is_err());
    }
}
```

- [ ] **Step 2: Run the hotkey parser test to prove the red/green boundary**

Run: `cargo test parses_supported_toggle_hotkey`
Expected: FAIL before parser implementation exists

- [ ] **Step 3: Add a small parser layer instead of a free-form hotkey DSL**

In `src-tauri/src/hotkey/manager.rs`, add helpers with constrained support:

```rust
fn parse_toggle_shortcut(raw: &str) -> Result<Shortcut, String> { /* Ctrl+Alt+<A-Z> only */ }

fn parse_quick_paste_prefix(raw: &str) -> Result<Modifiers, String> { /* Ctrl+Alt only for now */ }
```

Rules:
- Accept `Ctrl+Alt+<A-Z>` for `hotkey_toggle_window`
- Accept only `Ctrl+Alt` for `hotkey_quick_paste_prefix`
- Return explicit `Err(String)` for unsupported values

- [ ] **Step 4: Refactor registration into config-driven helpers**

Split `register_hotkeys` into:

```rust
fn register_toggle_hotkey(app_handle: &AppHandle, shortcut: Shortcut) -> Result<(), String> { /* existing toggle logic */ }

fn register_quick_paste_hotkeys(app_handle: &AppHandle, modifiers: Modifiers) -> Result<(), String> { /* existing 1..9 logic */ }

pub fn register_hotkeys(app_handle: &AppHandle) -> Result<(), String> {
    let db = app_handle.state::<crate::database::Database>();
    let toggle_raw = crate::database::config::get(&db, "hotkey_toggle_window")?
        .unwrap_or_else(|| "Ctrl+Alt+K".to_string());
    let prefix_raw = crate::database::config::get(&db, "hotkey_quick_paste_prefix")?
        .unwrap_or_else(|| "Ctrl+Alt".to_string());

    let toggle_shortcut = parse_toggle_shortcut(&toggle_raw)?;
    let quick_modifiers = parse_quick_paste_prefix(&prefix_raw)?;

    register_toggle_hotkey(app_handle, toggle_shortcut)?;
    register_quick_paste_hotkeys(app_handle, quick_modifiers)
}
```

- [ ] **Step 5: Add hotkey reload support**

Implement a reload function in `src-tauri/src/hotkey/manager.rs`:

```rust
pub fn reload_hotkeys(app_handle: &AppHandle) -> Result<(), String> {
    app_handle
        .global_shortcut()
        .unregister_all()
        .map_err(|e| format!("Failed to unregister hotkeys: {}", e))?;
    register_hotkeys(app_handle)
}
```

Update `src-tauri/capabilities/default.json` to allow unregister operations:

```json
"global-shortcut:allow-register",
"global-shortcut:allow-unregister",
"global-shortcut:allow-unregister-all"
```

- [ ] **Step 6: Wire runtime reload into config writes**

In `src-tauri/src/commands/mod.rs`, update `set_config` so supported hotkey keys trigger reload after persistence:

```rust
if key == "hotkey_toggle_window" || key == "hotkey_quick_paste_prefix" {
    crate::hotkey::manager::reload_hotkeys(&app)
        .map_err(|e| format!("Failed to reload hotkeys: {}", e))?;
}
```

- [ ] **Step 7: Verify the hotkey slice**

Run: `cargo test hotkey`
Expected: PASS for parser tests

Run: `cargo clippy -- -D warnings`
Expected: PASS

Run: `cargo fmt --check`
Expected: PASS

- [ ] **Step 8: Commit the hotkey runtime-config slice**

```bash
git add src-tauri/src/hotkey/manager.rs src-tauri/src/commands/mod.rs src-tauri/capabilities/default.json
git commit -m "refactor: make hotkeys runtime-configurable"
```

### Task 3: Align Query Semantics and Indexing

**Files:**
- Modify: `src-tauri/src/database/connection.rs`
- Modify: `src-tauri/src/database/clipboard.rs`
- Test: `src-tauri/src/database/clipboard.rs`

- [ ] **Step 1: Write failing tests for sort semantics and type-filter support**

Extend `src-tauri/src/database/clipboard.rs` tests with explicit assertions around current sort semantics and keep them as the contract.

```rust
#[test]
fn get_list_orders_by_last_used_then_created_at() {
    let db = test_db();
    let first = insert_text(&db, "first");
    let second = insert_text(&db, "second");

    touch_last_used(&db, first.id).unwrap();
    let items = get_list(&db, 10, 0).unwrap();

    assert_eq!(items[0].id, first.id);
    assert_eq!(items[1].id, second.id);
}
```

- [ ] **Step 2: Run the focused database test**

Run: `cargo test get_list_orders_by_last_used_then_created_at`
Expected: PASS once added; if it fails, fix semantics before touching indexes.

- [ ] **Step 3: Add indexes that match actual query paths**

Update `src-tauri/src/database/connection.rs` to create:

```rust
conn.execute(
    "CREATE INDEX IF NOT EXISTS idx_clipboard_last_used_created_at
     ON clipboard_items(last_used_at DESC, created_at DESC)",
    [],
)?;

conn.execute(
    "CREATE INDEX IF NOT EXISTS idx_clipboard_content_type
     ON clipboard_items(content_type)",
    [],
)?;
```

Keep:
- `idx_clipboard_hash`
- `idx_clipboard_preview`

You may keep `idx_clipboard_created_at` for cleanup queries, or remove it only if you verify no current query depends on it. For this pass, prefer keeping it to avoid unnecessary migration churn.

- [ ] **Step 4: Keep cleanup semantics conservative**

Do not change `cleanup_old_records` to `last_used_at` in this pass. Keep retention based on creation time:

```rust
ORDER BY created_at DESC
```

Reason: this pass is about aligning indexes to current runtime UX, not redefining retention policy.

- [ ] **Step 5: Verify the database slice**

Run: `cargo test -- --test-threads=1`
Expected: PASS

Run: `cargo clippy -- -D warnings`
Expected: PASS

- [ ] **Step 6: Commit the index/query alignment slice**

```bash
git add src-tauri/src/database/connection.rs src-tauri/src/database/clipboard.rs
git commit -m "refactor: align clipboard indexes with query behavior"
```

### Task 4: Sync Docs and Product Scope to Reality

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/API.md`
- Modify: `docs/DATABASE.md`
- Modify: `README.md`

- [ ] **Step 1: Update scope wording to Windows-first**

In `docs/PRD.md`, change statements that imply equal current support across Windows/macOS/Linux so they reflect current implementation status. Keep the product vision, but mark Windows as the present implementation target.

Use wording like:

```md
- 当前 MVP 以后端 Windows 体验为主，macOS / Linux 支持作为后续阶段完善
```

- [ ] **Step 2: Update hotkey docs to match runtime behavior**

Change all stale `Ctrl+1..9` and `CommandOrControl+Shift+...` references to:
- toggle: `Ctrl+Alt+K`
- quick paste: `Ctrl+Alt+1..9`

Files to update explicitly:
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/DATABASE.md`
- `README.md`

- [ ] **Step 3: Mark unimplemented data durability features as future work**

In `docs/PRD.md` and `docs/DATABASE.md`, move migration/backup/corruption-recovery from “already implemented” language to “planned / future capability”.

Use wording like:

```md
当前版本仅完成基础本地存储能力，数据迁移、备份恢复、损坏自动重建为后续阶段能力。
```

- [ ] **Step 4: Document the real lock/storage model**

In `docs/ARCHITECTURE.md` and `docs/DATABASE.md`, describe the actual backend storage concurrency model:

```md
当前后端使用单个 SQLite 连接，并通过 Rust `Mutex<Connection>` 在进程内串行化数据库访问。
```

Also remove or downgrade any “连接池” wording that suggests a more advanced implementation than the code actually has.

- [ ] **Step 5: Document runtime-consumed config keys**

In `docs/API.md` and `docs/ARCHITECTURE.md`, explicitly state:
- `hotkey_toggle_window` and `hotkey_quick_paste_prefix` are runtime-consumed
- changing them triggers hotkey reload
- other config keys are persisted but may not yet have runtime side effects

- [ ] **Step 6: Verify docs for consistency**

Run:

```bash
rg -n "Ctrl\\+1|CommandOrControl\\+Shift|跨平台|连接池|备份|迁移|损坏" docs README.md
```

Expected:
- only intentional future-work mentions remain
- no stale shortcut strings remain

- [ ] **Step 7: Commit the doc-sync slice**

```bash
git add docs/PRD.md docs/ARCHITECTURE.md docs/API.md docs/DATABASE.md README.md
git commit -m "docs: align backend scope and runtime behavior"
```

### Task 5: Final Verification and Cleanup

**Files:**
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/hotkey/manager.rs`
- Modify: `src-tauri/src/database/connection.rs`
- Modify: `docs/PRD.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/API.md`
- Modify: `docs/DATABASE.md`
- Modify: `README.md`

- [ ] **Step 1: Run the canonical Rust verification suite**

Run: `cargo fmt --check`
Expected: PASS

Run: `cargo clippy -- -D warnings`
Expected: PASS

Run: `cargo test -- --test-threads=1`
Expected: PASS

- [ ] **Step 2: Run frontend sanity checks impacted by docs/type surface**

Run: `pnpm build`
Expected: PASS

Run: `pnpm test`
Expected: note actual status. If Vitest still passes, record PASS. If unrelated failures exist, record them without masking.

- [ ] **Step 3: Review final diff for scope control**

Run:

```bash
git diff --stat master..HEAD
git status --short
```

Expected:
- only planned backend/doc files changed
- working tree clean before final handoff

- [ ] **Step 4: Commit any final cleanup**

```bash
git add src-tauri/src/main.rs src-tauri/src/commands/mod.rs src-tauri/src/hotkey/manager.rs src-tauri/src/database/connection.rs docs/PRD.md docs/ARCHITECTURE.md docs/API.md docs/DATABASE.md README.md
git commit -m "chore: finalize backend runtime config refactor"
```
