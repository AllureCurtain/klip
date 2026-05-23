# Klip Next Handoff

> Last updated: 2026-05-23 15:05 Asia/Shanghai
> Repository: `D:\Study\cc\klip`
> Branch: `main`
> Latest commit at handoff: `1e79ac1bfaf3be0178f133c49b55766355fb291b`

## Current Repository State

- Local branch: `main`
- Remote branch: `origin/main`
- Latest commit: `1e79ac1 refactor: quiet clipboard row rails`
- Local worktree was clean at this handoff.
- Current public release remains `v0.1.2`; today commits are under `CHANGELOG.md` `[Unreleased]`.
- Latest GitHub CI checked for `main`: success.
  - Run: `https://github.com/AllureCurtain/klip/actions/runs/26326279630`
  - Head SHA: `1e79ac1bfaf3be0178f133c49b55766355fb291b`

## Current Product Direction

The active thread shifted from release hardening to UI weight reduction after comparing Klip with:

```text
https://github.com/hu-qi-jia/copy-creator
```

The key conclusion is that `copy-creator` feels lighter because its clipboard surface keeps the primary workflow exposed:

- search
- type/category filters
- content list

It is not light because it has fewer features. It also has side navigation, settings, phrases, translation, theme controls, and management actions. The difference is that management controls are secondary, while the default clipboard surface stays operational and low-explanation.

Keep this direction:

- Do not add dashboard-style summary panels to the main clipboard window.
- Do not bring batch actions, favorites management, tags, import/export, or clear-history back into the default flow.
- Keep the main first screen focused on search, filters, and list scanning.
- Prefer quiet inline states over large centered instructional panels.
- Treat icons, type dots, and hover-only actions as enough affordance when the action is not part of the primary scan path.

## Recent Work Completed

Recent commits on `main` focused on making the main window closer to the `copy-creator` lightweight direction:

```text
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
7142c05 test: label header search input
```

### UI Behavior Now

- Header default flow is search, content-type filters, theme, settings, and a more-actions menu.
- Heavy actions live behind secondary surfaces:
  - favorites filter
  - tags
  - clear history
  - selection mode
  - Data Management advanced import/export/backup/restore controls
- Batch selection is opt-in and no longer shown on every item by default.
- Clipboard rows are compact and no longer show numeric index chrome.
- Default rows no longer use persistent content-type tinted row washes or left rails.
- Keyboard-selected rows use a neutral treatment instead of a type-colored wash.
- Clipboard item actions float on hover/focus rather than occupying the default row layout.
- Metadata is a low-noise inline scan line.
- Empty, loading, error, and selection toolbar states are lightweight operational notes.

## Visual Evidence

Latest real Tauri/Selenium screenshot:

```text
e2e/.tmp/visual-20260523-144821/main-window.png
```

Observed result:

- Header/search/type filters are acceptable and close to the lightweight target.
- The earlier blue selected-row wash is gone.
- The earlier continuous blue left rail from text rows is gone.
- The main remaining visible weight is the active `All` filter chip, which is acceptable but can be tuned if more polish is needed.

Previous screenshots in `e2e/.tmp/visual-*` are ignored by Git and can be deleted at any time.

## Verification Already Completed

For `1e79ac1 refactor: quiet clipboard row rails`:

```powershell
pnpm test -- --run src/components/clipboard/ClipboardItem.test.tsx src/components/clipboard/ClipboardList.test.tsx
```

Observed result:

```text
2 test files passed
15 tests passed
```

```powershell
git diff --check
```

Observed result:

```text
no whitespace errors
```

```powershell
pnpm verify
```

Observed result:

```text
eslint passed
Vitest: 11 files passed, 63 tests passed
vite build passed
cargo fmt -- --check passed
cargo clippy -- -D warnings passed
cargo test passed
```

```powershell
pnpm e2e
```

Observed result:

```text
clipboard capture, search, and paste flow
1 passing
```

Pre-push hook:

```text
git push origin main
```

Observed result:

```text
pre-push ran pnpm verify and passed before pushing 1e79ac1
```

GitHub CI:

```text
https://github.com/AllureCurtain/klip/actions/runs/26326279630
conclusion: success
```

## Important Technical Note

`eslint.config.js` now ignores:

```text
e2e/.tmp/**
```

Reason: visual/E2E runs can generate temporary app data under `e2e/.tmp/`. A screenshot run once caused Corepack/pnpm cache files to appear under that directory, and `pnpm verify` failed because ESLint scanned generated tool files. This ignore aligns ESLint with `.gitignore`.

When creating visual screenshots, prefer using a system temp directory for `APPDATA`, `LOCALAPPDATA`, and `COREPACK_HOME`, while saving only the final screenshot under `e2e/.tmp/visual-*`.

## Recommended Next Steps

1. Do not continue compressing Header by default.

The latest screenshot shows the Header is already close to the desired tool-like surface. More compression risks hurting discoverability without much visual gain.

2. If continuing UI polish, compare these options:

- **Recommended:** tune active filter chip weight.
  - Current active `All` chip is the strongest remaining default control.
  - Keep pressed-state tests.
  - A small change could use a quieter neutral active style rather than a filled accent chip.
- **Secondary:** review Settings visual density.
  - Settings still reads more like a control console than the main clipboard surface.
  - Any work here should be separate from clipboard main-view polish.
- **Defer:** sidebar/navigation redesign or marketing-style layouts.
  - Those are outside the current lightweight clipboard-window objective.

3. Keep TDD for any UI behavior/class change:

```powershell
pnpm test -- --run <target-test-file>
```

Then run:

```powershell
git diff --check
pnpm verify
pnpm e2e
```

Push only after verification. Confirm GitHub CI afterward:

```powershell
gh run list --branch main --limit 5 --json databaseId,status,conclusion,headSha,displayTitle,url,createdAt
```

## Suggested Prompt For Next Session

```text
请读取 docs/NEXT_HANDOFF.md、CHANGELOG.md，并查看最新截图 e2e/.tmp/visual-20260523-144821/main-window.png。继续 Klip 主窗口轻量化收敛，但不要默认继续压 Header。优先判断 active filter chip 是否还过重；如果要改，用 TDD，跑 pnpm verify、pnpm e2e，并确认 GitHub CI。
```

## Quick Commands

```powershell
git status --short --branch
git log --oneline -12
gh run list --branch main --limit 5 --json databaseId,status,conclusion,headSha,displayTitle,url,createdAt
pnpm test -- --run src/components/clipboard/ClipboardItem.test.tsx src/components/layout/Header.test.tsx
git diff --check
pnpm verify
pnpm e2e
```
