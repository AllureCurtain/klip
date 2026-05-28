# Klip Prototype Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Windows-first clipboard prototype by fixing one live filtering bug, making capture/privacy state visible, reducing settings-page product noise, and shrinking the main clipboard bundle.

**Architecture:** Keep the current Tauri 2 + React 19 + Zustand + SQLite architecture. Treat the main clipboard view as the primary product surface; correctness and status feedback live in `App` and `Header`, while low-frequency management stays behind Settings. Do not add cloud sync, plugin runtime, updater client, real encryption migration, account features, dashboards, or cross-platform parity work in this pass.

**Tech Stack:** React, TypeScript, Zustand, i18next, Vitest, Testing Library, Vite, Tauri IPC wrappers, Rust unit tests for unchanged backend behavior.

## Execution Status

Completed on 2026-05-28 in these commits:

- `c8af0b1 fix: keep live clipboard updates aligned with filters`
- `a1f097d feat: show clipboard capture status`
- `a420f70 refactor: tuck external readiness into advanced settings`
- `b0a8151 perf: lazy load settings surface`

Final verification evidence:

- `pnpm test -- --run`: 15 files, 107 tests passed.
- `pnpm lint`: passed.
- `pnpm build`: passed; Settings split to `assets/SettingsView-CjhJrCBS.js` at 38.11 kB / 9.83 kB gzip; main chunk is 569.45 kB / 181.16 kB gzip and still triggers Vite's 500 kB warning.
- `cargo test` from `src-tauri`: passed.
- `pnpm e2e`: passed the clipboard capture, search, and paste flow.
- Additional WebDriver prototype smoke: passed capture, sensitive-only filtering, pause/resume status, privacy status, Settings Data external-readiness disclosure, and return-to-clipboard checks.

---

## Scope

This plan implements four bounded improvements:

1. Keep live `clipboard-updated` events consistent with the active advanced filters.
2. Load capture/privacy state on startup and show a compact status row when monitoring or privacy mode changes normal capture behavior.
3. Move update/encryption/sync/plugin readiness controls behind an explicit advanced collapsed section, so the prototype does not advertise unfinished product capabilities.
4. Lazy-load the Settings surface so the main clipboard window is not bundled with low-frequency management UI.

This plan intentionally does not move snippets into the main window. Snippets are useful, but moving them to a first-class `History / Snippets` mode is a separate feature slice because it changes the primary navigation model.

## File Structure

- Modify `src/App.tsx`: include `advancedFilters` in the clipboard event listener dependencies; load productivity state on startup; refresh productivity state when capture/privacy config changes; lazy-load Settings.
- Modify `src/App.test.tsx`: add regression tests for live advanced-filter updates and startup productivity loading.
- Create `src/components/layout/CaptureStatusBar.tsx`: small presentational component for paused monitoring and active privacy mode.
- Create `src/components/layout/CaptureStatusBar.test.tsx`: focused tests for status visibility and actions.
- Modify `src/components/layout/Header.tsx`: render `CaptureStatusBar` below content filters and wire resume/end actions.
- Modify `src/components/layout/Header.test.tsx`: cover the new compact status row integration.
- Modify `src/components/layout/index.ts`: export the new status component if local layout exports are used.
- Modify `src/components/settings/DataManagementView.tsx`: keep privacy/capture controls visible, move readiness controls into a collapsed advanced section with explicit copy.
- Modify `src/components/settings/DataManagementView.test.tsx`: assert readiness controls are hidden by default and visible after expansion.
- Modify `src/i18n/locales/zh-CN.json` and `src/i18n/locales/en-US.json`: add status and advanced-readiness labels.
- Optional modify `src/components/settings/SettingsView.tsx`: export default if the lazy import reads cleaner; otherwise keep named export and map it in `React.lazy`.

---

## Task 1: Fix Live Clipboard Event Filtering

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

- [x] **Step 1: Write a failing regression test for advanced-filter changes**

Add a test that renders `App`, turns on an advanced filter, emits a `clipboard-updated` event, and verifies a non-matching item is not injected. Use the existing event-listener mock pattern in `src/App.test.tsx`.

```tsx
it('uses the latest advanced filters for live clipboard updates', async () => {
  vi.useFakeTimers();
  const addItems = vi.fn();
  mockUseClipboardStore({
    items: [],
    tags: [],
    loading: false,
    error: null,
    addItems,
  });

  render(<App />);

  await act(async () => {
    screen.getByRole('button', { name: 'advanced search' }).click();
  });

  await act(async () => {
    screen.getByRole('switch', { name: 'sensitive only' }).click();
  });

  await act(async () => {
    eventCallbacks['clipboard-updated']?.({
      id: 42,
      content_type: 'text',
      content: 'normal text',
      preview: 'normal text',
      hash: 'normal-text',
      size: 11,
      metadata: null,
      is_favorited: false,
      is_sensitive: false,
      sensitivity_reason: null,
      tags: [],
      created_at: Date.now(),
      last_used_at: Date.now(),
    });
  });

  expect(addItems).not.toHaveBeenCalled();
  vi.useRealTimers();
});
```

If the current tests use translated Chinese labels instead of English test doubles, use the labels already defined by the local mocks in `App.test.tsx`. The assertion remains `expect(addItems).not.toHaveBeenCalled()`.

- [x] **Step 2: Run the regression test and verify it fails**

Run:

```powershell
pnpm test -- --run src/App.test.tsx
```

Expected before implementation: the new test fails because the `clipboard-updated` listener closes over the old `advancedFilters` value.

- [x] **Step 3: Add `advancedFilters` to the event listener dependencies**

In `src/App.tsx`, update the dependency list for the `listen<ClipboardItem>('clipboard-updated', ...)` effect:

```tsx
  }, [addItems, advancedFilters, contentType, searchQuery, selectedTagId, showFavorites]);
```

No backend change is required. The existing `clipboardItemMatchesView` function already evaluates `sensitiveOnly`, `exactMatch`, and date filters correctly.

- [x] **Step 4: Run the targeted test**

Run:

```powershell
pnpm test -- --run src/App.test.tsx
```

Expected after implementation: `src/App.test.tsx` passes.

- [x] **Step 5: Commit this task**

```powershell
git add src/App.tsx src/App.test.tsx
git commit -m "fix: keep live clipboard updates aligned with filters"
```

---

## Task 2: Load Capture State and Show a Compact Status Row

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/layout/CaptureStatusBar.tsx`
- Create: `src/components/layout/CaptureStatusBar.test.tsx`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/Header.test.tsx`
- Modify: `src/components/layout/index.ts`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en-US.json`

- [x] **Step 1: Write component tests for the status row**

Create `src/components/layout/CaptureStatusBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CaptureStatusBar } from './CaptureStatusBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'captureStatus.monitorPaused': 'Monitoring paused',
        'captureStatus.resume': 'Resume',
        'captureStatus.privacyActive': `Privacy mode ${options?.minutes} min`,
        'captureStatus.endPrivacy': 'End',
      };
      return map[key] ?? key;
    },
  }),
}));

describe('CaptureStatusBar', () => {
  it('renders nothing when capture is normal', () => {
    const { container } = render(
      <CaptureStatusBar
        monitorEnabled
        privacyModeUntil={0}
        now={1_000}
        onResumeMonitoring={vi.fn()}
        onEndPrivacyMode={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows paused monitoring and resumes capture', async () => {
    const onResumeMonitoring = vi.fn();
    render(
      <CaptureStatusBar
        monitorEnabled={false}
        privacyModeUntil={0}
        now={1_000}
        onResumeMonitoring={onResumeMonitoring}
        onEndPrivacyMode={vi.fn()}
      />
    );

    expect(screen.getByText('Monitoring paused')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onResumeMonitoring).toHaveBeenCalledTimes(1);
  });

  it('shows active privacy mode and ends it', async () => {
    const onEndPrivacyMode = vi.fn();
    render(
      <CaptureStatusBar
        monitorEnabled
        privacyModeUntil={61_000}
        now={1_000}
        onResumeMonitoring={vi.fn()}
        onEndPrivacyMode={onEndPrivacyMode}
      />
    );

    expect(screen.getByText('Privacy mode 1 min')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(onEndPrivacyMode).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: Run the new test and verify it fails because the component does not exist**

Run:

```powershell
pnpm test -- --run src/components/layout/CaptureStatusBar.test.tsx
```

Expected before implementation: FAIL with a module resolution error for `./CaptureStatusBar`.

- [x] **Step 3: Create the status row component**

Create `src/components/layout/CaptureStatusBar.tsx`:

```tsx
import { Pause, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

interface CaptureStatusBarProps {
  monitorEnabled: boolean;
  privacyModeUntil: number;
  now?: number;
  onResumeMonitoring: () => void;
  onEndPrivacyMode: () => void;
}

export function CaptureStatusBar({
  monitorEnabled,
  privacyModeUntil,
  now = Date.now(),
  onResumeMonitoring,
  onEndPrivacyMode,
}: CaptureStatusBarProps) {
  const { t } = useTranslation();
  const privacyActive = privacyModeUntil > now;

  if (monitorEnabled && !privacyActive) {
    return null;
  }

  const remainingMinutes = Math.max(1, Math.ceil((privacyModeUntil - now) / 60_000));

  return (
    <div className="flex items-center gap-1.5 border-t border-[var(--glass-border)] px-2.5 py-1 text-[11px] text-muted-foreground">
      {!monitorEnabled && (
        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5">
          <Pause className="h-3 w-3 shrink-0" />
          <span className="truncate">{t('captureStatus.monitorPaused')}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            onClick={onResumeMonitoring}
          >
            {t('captureStatus.resume')}
          </Button>
        </div>
      )}

      {privacyActive && (
        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5">
          <Shield className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {t('captureStatus.privacyActive', { minutes: remainingMinutes })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            onClick={onEndPrivacyMode}
          >
            {t('captureStatus.endPrivacy')}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 4: Export the component**

If `src/components/layout/index.ts` is used as a barrel, add:

```ts
export { CaptureStatusBar } from './CaptureStatusBar';
```

- [x] **Step 5: Add i18n keys**

In `src/i18n/locales/zh-CN.json`, add a top-level key:

```json
"captureStatus": {
  "monitorPaused": "监听已暂停",
  "resume": "恢复",
  "privacyActive": "隐私模式剩余 {{minutes}} 分钟",
  "endPrivacy": "结束"
}
```

In `src/i18n/locales/en-US.json`, add:

```json
"captureStatus": {
  "monitorPaused": "Monitoring paused",
  "resume": "Resume",
  "privacyActive": "Privacy mode {{minutes}} min",
  "endPrivacy": "End"
}
```

Keep JSON commas valid for each file.

- [x] **Step 6: Run the component test**

Run:

```powershell
pnpm test -- --run src/components/layout/CaptureStatusBar.test.tsx
```

Expected after implementation: PASS.

- [x] **Step 7: Wire the status row into Header**

In `src/components/layout/Header.tsx`, import the component:

```tsx
import { CaptureStatusBar } from './CaptureStatusBar';
```

Render it after the content filter row and before `SelectionToolbar`:

```tsx
        <CaptureStatusBar
          monitorEnabled={monitorEnabled}
          privacyModeUntil={privacyModeUntil}
          onResumeMonitoring={() => setMonitorEnabled(true)}
          onEndPrivacyMode={() => setPrivacyModeForMinutes(0)}
        />
```

This keeps status visible only when capture behavior differs from normal.

- [x] **Step 8: Write Header integration tests**

In `src/components/layout/Header.test.tsx`, add tests that use the existing mocked `useProductivityStore` values:

```tsx
it('shows paused monitoring status in the header', () => {
  productivityStoreMock.monitorEnabled = false;
  productivityStoreMock.privacyModeUntil = 0;

  renderHeader();

  expect(screen.getByText('监听已暂停')).toBeInTheDocument();
});

it('ends privacy mode from the header status row', async () => {
  const setPrivacyModeForMinutes = vi.fn();
  productivityStoreMock.monitorEnabled = true;
  productivityStoreMock.privacyModeUntil = Date.now() + 15 * 60_000;
  productivityStoreMock.setPrivacyModeForMinutes = setPrivacyModeForMinutes;

  renderHeader();

  await userEvent.click(screen.getByRole('button', { name: '结束' }));
  expect(setPrivacyModeForMinutes).toHaveBeenCalledWith(0);
});
```

If the test helper uses English test labels, assert against `Monitoring paused` and `End` instead. The behavior under test is the same.

- [x] **Step 9: Load productivity state on app startup**

In `src/App.tsx`, import the store:

```tsx
import { useProductivityStore } from './stores/productivityStore';
```

Inside `App`, read `fetchProductivity`:

```tsx
  const fetchProductivity = useProductivityStore((state) => state.fetchProductivity);
```

In the startup effect, call it with the existing initial fetches:

```tsx
    fetchItems();
    fetchTags();
    fetchProductivity();
```

Add `fetchProductivity` to that effect dependency list.

- [x] **Step 10: Refresh productivity state when relevant config changes**

In the existing `onConfigChanged` handler in `src/App.tsx`, add:

```tsx
      } else if (
        key === 'clipboard_monitor_enabled' ||
        key === 'privacy_mode_until'
      ) {
        void fetchProductivity();
```

This keeps Header status aligned when Settings saves capture/privacy values.

- [x] **Step 11: Add App tests for startup productivity loading**

In `src/App.test.tsx`, extend the productivity store mock and assert:

```tsx
it('loads productivity state on startup for capture status', async () => {
  const fetchProductivity = vi.fn();
  mockUseProductivityStore({ fetchProductivity });

  render(<App />);

  await waitFor(() => {
    expect(fetchProductivity).toHaveBeenCalledTimes(1);
  });
});
```

Use the mock shape already present in the file. If `useProductivityStore` is not currently mocked in `App.test.tsx`, add a small mock that returns `fetchProductivity` for selector calls:

```tsx
vi.mock('./stores/productivityStore', () => ({
  useProductivityStore: (selector: (state: { fetchProductivity: () => void }) => unknown) =>
    selector({ fetchProductivity: productivityMocks.fetchProductivity }),
}));
```

- [x] **Step 12: Run targeted layout and app tests**

Run:

```powershell
pnpm test -- --run src/components/layout/CaptureStatusBar.test.tsx src/components/layout/Header.test.tsx src/App.test.tsx
```

Expected after implementation: all targeted tests pass.

- [x] **Step 13: Commit this task**

```powershell
git add src/App.tsx src/App.test.tsx src/components/layout src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat: show clipboard capture status"
```

---

## Task 3: Hide External Readiness Controls Behind Advanced Settings

**Files:**
- Modify: `src/components/settings/DataManagementView.tsx`
- Modify: `src/components/settings/DataManagementView.test.tsx`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en-US.json`

- [x] **Step 1: Write a test that readiness controls are hidden by default**

In `src/components/settings/DataManagementView.test.tsx`, add:

```tsx
it('keeps external readiness controls collapsed by default', async () => {
  render(<DataManagementView />);

  expect(screen.queryByLabelText('更新源 URL')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('同步文件夹')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /外部能力就绪/ }));

  expect(screen.getByLabelText('更新源 URL')).toBeInTheDocument();
  expect(screen.getByLabelText('同步文件夹')).toBeInTheDocument();
});
```

Use English labels if this test file mocks `react-i18next` with English strings. Keep the same assertions: update feed and sync folder are hidden before expansion and visible after expansion.

- [x] **Step 2: Run the test and verify it fails**

Run:

```powershell
pnpm test -- --run src/components/settings/DataManagementView.test.tsx
```

Expected before implementation: the new test fails because the readiness fields are currently visible without expansion.

- [x] **Step 3: Add i18n copy for the advanced readiness section**

In `src/i18n/locales/zh-CN.json`, add under `settings.data`:

```json
"externalReadiness": "外部能力就绪",
"externalReadinessDesc": "仅保存发布、更新、同步和插件相关配置；当前原型不启用这些外部服务。",
"externalReadinessNotice": "这些选项用于发布检查或后续集成，不代表自动更新、真实加密、云同步或插件市场已经可用。"
```

In `src/i18n/locales/en-US.json`, add:

```json
"externalReadiness": "External readiness",
"externalReadinessDesc": "Stores release, update, sync, and plugin configuration only; this prototype does not enable those external services.",
"externalReadinessNotice": "These options support release checks or future integrations. They do not enable auto-update, real encryption, cloud sync, or a plugin marketplace."
```

- [x] **Step 4: Split visible capture controls from external readiness controls**

In `src/components/settings/DataManagementView.tsx`, keep the visible switches for:

- `skipSensitive`
- `maskSensitivePreviews`
- `monitoring`

Move these controls into a collapsed section:

- `updatesEnabled`
- `updateFeedUrl`
- `encryptionEnabled`
- `encryptionStatus`
- `syncFolder`
- `pluginFolder`

Add state near the existing `portabilityOpen` state:

```tsx
  const [readinessOpen, setReadinessOpen] = useState(false);
```

Replace the current readiness section with:

```tsx
      <section className="rounded-md border bg-muted/20">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
          aria-expanded={readinessOpen}
          aria-controls="external-readiness-panel"
          onClick={() => setReadinessOpen((open) => !open)}
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium">
              {t('settings.data.externalReadiness')}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              {t('settings.data.externalReadinessDesc')}
            </span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            {readinessOpen ? t('common.close') : t('settings.data.openAdvanced')}
          </span>
        </button>

        {readinessOpen && (
          <div id="external-readiness-panel" className="space-y-3 border-t px-3 py-3">
            <p className="text-[10px] text-muted-foreground">
              {t('settings.data.externalReadinessNotice')}
            </p>
            <ConfigSwitch
              label={t('settings.data.updatesEnabled')}
              checked={config.updates_enabled}
              onCheckedChange={setUpdatesEnabled}
            />
            <Field
              id="update-feed-url"
              label={t('settings.data.updateFeedUrl')}
              value={config.update_feed_url}
              onChange={setUpdateFeedUrl}
              placeholder="https://updates.example.com/klip.json"
            />
            <ConfigSwitch
              label={t('settings.data.encryptionEnabled')}
              checked={config.encryption_enabled}
              onCheckedChange={setEncryptionEnabled}
            />
            <p className="text-[10px] text-muted-foreground">
              {t('settings.data.encryptionStatus', { status: config.encryption_status })}
            </p>
            <Field
              id="sync-folder"
              label={t('settings.data.syncFolder')}
              value={config.sync_folder}
              onChange={setSyncFolder}
              placeholder="C:\\Klip Sync"
            />
            <Field
              id="plugin-folder"
              label={t('settings.data.pluginFolder')}
              value={config.plugin_folder}
              onChange={setPluginFolder}
              placeholder="C:\\Klip Plugins"
            />
          </div>
        )}
      </section>
```

Keep the visible monitoring switch near the privacy controls:

```tsx
      <ConfigSwitch
        label={t('settings.data.monitoring')}
        checked={config.clipboard_monitor_enabled}
        onCheckedChange={setClipboardMonitorEnabled}
      />
```

- [x] **Step 5: Run data management tests**

Run:

```powershell
pnpm test -- --run src/components/settings/DataManagementView.test.tsx
```

Expected after implementation: all DataManagementView tests pass.

- [x] **Step 6: Commit this task**

```powershell
git add src/components/settings/DataManagementView.tsx src/components/settings/DataManagementView.test.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "refactor: tuck external readiness into advanced settings"
```

---

## Task 4: Lazy-Load Settings to Reduce Main Bundle Weight

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Optional modify: `src/components/settings/SettingsView.tsx`

- [x] **Step 1: Record the current build baseline**

Run:

```powershell
pnpm build
```

Expected baseline from the audit: build succeeds and Vite warns that `assets/index-*.js` is around `602 kB`, above the 500 kB chunk warning threshold.

- [x] **Step 2: Update App to lazy-load SettingsView**

In `src/App.tsx`, update imports:

```tsx
import { lazy, Suspense, useState, useEffect } from 'react';
import type { SettingsTab } from './components/settings/SettingsView';
```

Remove the direct value import for `SettingsView` and add:

```tsx
const SettingsView = lazy(() =>
  import('./components/settings/SettingsView').then((module) => ({
    default: module.SettingsView,
  }))
);
```

Wrap the settings view branch:

```tsx
  if (view === 'settings') {
    return (
      <Suspense
        fallback={
          <div className="flex h-dvh items-start px-3 py-4 text-xs text-muted-foreground">
            {t('app.loading')}
          </div>
        }
      >
        <SettingsView
          initialTab={settingsInitialTab}
          onBack={() => setView('clipboard')}
        />
      </Suspense>
    );
  }
```

Also replace the root main view height class:

```tsx
className="flex min-h-dvh flex-col text-foreground"
```

- [x] **Step 3: Update settings root viewport class**

In `src/components/settings/SettingsView.tsx`, replace:

```tsx
<div className="flex flex-col h-screen text-foreground">
```

with:

```tsx
<div className="flex min-h-dvh flex-col text-foreground">
```

- [x] **Step 4: Adjust App tests for lazy SettingsView**

If `src/App.test.tsx` asserts SettingsView immediately after opening settings, wait for it:

```tsx
await waitFor(() => {
  expect(screen.getByTestId('settings-view')).toBeInTheDocument();
});
```

If the file mocks `./components/settings/SettingsView`, keep the named export in the mock:

```tsx
vi.mock('./components/settings/SettingsView', () => ({
  SettingsView: ({ initialTab }: { initialTab: string }) => (
    <div data-testid="settings-view">{initialTab}</div>
  ),
}));
```

- [x] **Step 5: Run App tests**

Run:

```powershell
pnpm test -- --run src/App.test.tsx
```

Expected after implementation: `src/App.test.tsx` passes.

- [x] **Step 6: Build and inspect chunk output**

Run:

```powershell
pnpm build
```

Expected after implementation: build succeeds and emits a separate Settings-related JS chunk. If Vite still warns because shared dependencies keep the main chunk above 500 kB, record the actual chunk sizes in the final implementation summary instead of increasing `chunkSizeWarningLimit`.

- [x] **Step 7: Commit this task**

```powershell
git add src/App.tsx src/App.test.tsx src/components/settings/SettingsView.tsx
git commit -m "perf: lazy load settings surface"
```

---

## Task 5: Final Verification and Prototype QA

**Files:**
- No planned code changes.

- [x] **Step 1: Run frontend tests**

Run:

```powershell
pnpm test -- --run
```

Expected: all Vitest files pass.

- [x] **Step 2: Run lint**

Run:

```powershell
pnpm lint
```

Expected: ESLint exits with code 0.

- [x] **Step 3: Run frontend build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite build succeed. Record chunk-size warnings if they remain.

- [x] **Step 4: Run Rust tests**

Run:

```powershell
cargo test
```

from:

```powershell
cd src-tauri
```

Expected: all Rust unit and integration tests pass.

- [x] **Step 5: Run desktop E2E on Windows when the driver prerequisites are installed**

Run:

```powershell
pnpm e2e
```

Expected: the clipboard capture, search, and paste flow passes. If `tauri-driver` or Edge WebDriver is missing, record the missing prerequisite and do not claim E2E coverage.

- [x] **Step 6: Manual prototype smoke check**

Run the app:

```powershell
pnpm tauri:dev
```

Manual checks:

- Copy normal text; it appears in the history list.
- Enable advanced `仅敏感内容`; copy normal text; it does not appear in the filtered view.
- Pause monitoring from the header more menu; the header shows `监听已暂停`; resume from the status row.
- Start 15-minute privacy mode from the header more menu; the header shows the remaining privacy-mode time; end it from the status row.
- Open Settings -> Data; update/encryption/sync/plugin controls are not visible until `外部能力就绪` is expanded.
- Open Settings, go back, then open clipboard again; the main list still renders normally.

- [x] **Step 7: Commit any final test or copy fixes**

Only commit if Step 1 through Step 6 reveal changes that were actually made:

```powershell
git add <changed-files>
git commit -m "test: verify prototype polish flow"
```

---

## Self-Review

- Spec coverage: the plan covers the live-filter bug, capture/privacy visibility, settings density, bundle warning, and verification. Snippet relocation is explicitly excluded as a separate feature slice.
- Placeholder scan: the plan contains concrete files, code snippets, commands, and expected results. It does not rely on unspecified work.
- Type consistency: `privacyModeUntil`, `monitorEnabled`, `setMonitorEnabled`, and `setPrivacyModeForMinutes` match the existing `useProductivityStore` shape. `SettingsTab` remains a type-only import. `SettingsView` remains a named export unless the optional default-export cleanup is chosen.

## Recommended Execution Order

Implement Task 1 first because it fixes correctness and is low risk. Then Task 2 because it makes capture state visible and depends on productivity state loading. Task 3 follows because it reduces product noise without touching the main clipboard flow. Task 4 is independent and can be skipped if the team wants to avoid lazy-loading churn in this iteration. Task 5 is the completion gate.
