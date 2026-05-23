# Klip Next Handoff

> Last updated: 2026-05-23 15:46 Asia/Shanghai
> Repository: `D:\Study\cc\klip`
> Branch: `main`
> Latest UI code commit: `4741290 refactor: quiet active header filters`

## Current Direction

The current UI pass is a lightweight convergence after comparing Klip with:

```text
https://github.com/hu-qi-jia/copy-creator
```

The important takeaway is not that `copy-creator` has fewer features. It has clipboard history, phrases, translation, settings, theme controls, startup behavior, and storage controls. It feels lighter because the default clipboard surface keeps only the primary workflow in front:

- search
- content/type filters
- clipboard list

Keep Klip aligned with that:

- Do not add dashboard panels or explanatory first-screen content.
- Do not bring batch actions, tags, import/export, clear history, or other management controls back into the default clipboard flow.
- Keep management actions behind secondary menus, settings, or explicit modes.
- Prefer quiet inline states over large centered instructional panels.
- Treat hover-only row actions, low-noise metadata, and small type affordances as enough for non-primary actions.

## Work Completed In This UI Pass

Recent commits on `main` reduced default visual weight in the clipboard window:

```text
4741290 refactor: quiet active header filters
bd1ebb0 docs: refresh lightweight ui handoff
1e79ac1 refactor: quiet clipboard row rails
64c977b refactor: neutralize selected clipboard rows
f40b50e refactor: quiet selection toolbar
27dcfb7 refactor: compact app status states
e0ad57a refactor: compact empty states
1ba0724 refactor: quiet clipboard item metadata
ca0d6e0 refactor: float clipboard item actions
3b42a77 refactor: compact clipboard list rows
5893b2f refactor: polish header more actions
58a846f feat: add opt-in clipboard selection mode
8ec2087 feat: streamline clipboard main view
```

Current main-window behavior:

- Header default flow is search, content-type filters, theme, settings, and a more-actions menu.
- Favorites, tags, clear history, selection mode, and data import/export remain secondary.
- Batch selection is opt-in instead of visible on every row.
- Clipboard rows are compact and no longer show index chrome, persistent type rails, or type-colored selected-row washes.
- Row actions float on hover/focus instead of occupying default layout space.
- Metadata, empty states, loading states, error states, and selection toolbar are quieter.
- Active Header content filters now use a neutral treatment instead of filled accent chrome.

## Visual Evidence

Latest real Tauri/Selenium screenshot:

```text
e2e/.tmp/visual-20260523-153904/main-window.png
```

Observed result:

- The active `全部` filter chip is now neutral and no longer the strongest default element.
- The clipboard surface reads as search, filters, and list.
- Search has a focus ring in the screenshot because Selenium focused the input while preparing the view; that is not a regression from the chip change.

Previous screenshot for comparison:

```text
e2e/.tmp/visual-20260523-144821/main-window.png
```

The `e2e/.tmp/visual-*` directories are ignored by Git and can be deleted when no longer needed.

## Verification Completed For `4741290`

Targeted tests:

```powershell
pnpm test -- --run src/components/layout/Header.test.tsx src/App.test.tsx
```

Observed result:

```text
2 test files passed
16 tests passed
```

Whitespace check:

```powershell
git diff --check
```

Observed result:

```text
exit 0; only existing LF-to-CRLF working-copy warnings were printed
```

Full project verification:

```powershell
pnpm verify
```

Observed result:

```text
eslint passed
Vitest: 11 files passed, 64 tests passed
vite build passed
cargo fmt -- --check passed
cargo clippy -- -D warnings passed
cargo test passed
```

Desktop E2E:

```powershell
pnpm e2e
```

Observed result:

```text
clipboard capture, search, and paste flow
1 passing
```

## Recommended Next Step

Stop changing the main clipboard UI by default. It is now close to the intended lightweight operational surface.

If the next session continues UI work, make it a separate decision:

- **Recommended:** review Settings density as its own slice.
- **Defer:** more Header compression, sidebar redesign, dashboard-style panels, or landing-page-like presentation.
- **Alternative:** switch from UI polish to release/reliability work for the next `v0.1.x` release.

For any UI class or behavior change, keep using TDD:

```powershell
pnpm test -- --run <target-test-file>
git diff --check
pnpm verify
pnpm e2e
```

After pushing, confirm GitHub Actions:

```powershell
gh run list --branch main --limit 5 --json databaseId,status,conclusion,headSha,displayTitle,url,createdAt,workflowName
```

## Suggested Prompt For New Conversation

```text
请读取 docs/NEXT_HANDOFF.md、CHANGELOG.md，并查看截图 e2e/.tmp/visual-20260523-153904/main-window.png。Klip 主窗口轻量化已经基本收敛，不要默认继续压 Header 或加 dashboard。下一步请先判断：是单独 review Settings 密度，还是转向 release/reliability 工作。
```
