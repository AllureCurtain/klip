import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfigStore } from '@/stores/configStore';
import { useShortcutStore } from '@/stores/shortcutStore';
import { useThemeStore } from '@/stores/themeStore';
import { DataManagementView } from './DataManagementView';
import { SettingsRail } from './SettingsRail';
import { SETTINGS_NAV, type SettingsTab } from './settingsNav';
import { InlineMessage, StatusPill } from './primitives';
import { GeneralPanel } from './panels/GeneralPanel';
import { AppearancePanel } from './panels/AppearancePanel';
import { ShortcutsPanel } from './panels/ShortcutsPanel';
import { BehaviorPanel } from './panels/BehaviorPanel';
import { StorageSection } from './panels/StoragePanel';
import { AboutPanel } from './panels/AboutPanel';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

export type { SettingsTab };

interface SettingsViewProps {
  onBack: () => void;
  initialTab?: SettingsTab;
}

export function SettingsView({ onBack, initialTab = 'general' }: SettingsViewProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [guardOpen, setGuardOpen] = useState(false);
  const config = useConfigStore();
  const shortcuts = useShortcutStore();
  const theme = useThemeStore();

  const {
    fetchConfig,
    fetchSystemInfo,
    fetchDiagnosticsInfo,
    fetchStorageUsage,
    fetchWindowState,
  } = config;
  const fetchShortcuts = shortcuts.fetch;

  useEffect(() => {
    void fetchConfig();
    void fetchSystemInfo();
    void fetchDiagnosticsInfo();
    void fetchStorageUsage();
    void fetchWindowState();
    void fetchShortcuts();
  }, [
    fetchConfig,
    fetchSystemInfo,
    fetchDiagnosticsInfo,
    fetchStorageUsage,
    fetchWindowState,
    fetchShortcuts,
  ]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const dirty = config.hasChanges || shortcuts.isDirty;
  const saving = config.saveState === 'saving' || shortcuts.saving;
  // `loading` is shared by the initial fetch and the save call, so a save is
  // excluded here to keep the two indicators from firing at once.
  const initialLoading = config.loading && !saving;
  const saveError = config.error ?? shortcuts.error;
  const saved = config.saveState === 'saved' && !dirty;

  /** Spec §5.2: a successful save keeps the page open and clears dirty state. */
  const handleSave = useCallback(async () => {
    const configSaved = await useConfigStore.getState().saveChanges();
    const shortcutState = useShortcutStore.getState();
    const shortcutsSaved = !shortcutState.isDirty || (await shortcutState.save());
    if (configSaved && shortcutsSaved) {
      await useThemeStore.getState().hydrate();
      void useConfigStore.getState().fetchStorageUsage();
      return true;
    }
    return false;
  }, []);

  const discardAndLeave = useCallback(async () => {
    await useConfigStore.getState().resetChanges();
    useShortcutStore.getState().reset();
    await useThemeStore.getState().hydrate();
    onBack();
  }, [onBack]);

  const handleBack = useCallback(() => {
    if (dirty) {
      setGuardOpen(true);
      return;
    }
    void discardAndLeave();
  }, [dirty, discardAndLeave]);

  const activeNav = SETTINGS_NAV.find((item) => item.value === activeTab) ?? SETTINGS_NAV[0];

  return (
    <div className="relative flex h-dvh flex-col bg-[var(--background)] text-[var(--ink)]">
      <div
        data-tauri-drag-region
        className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--glass-bg)] px-2 py-1.5 backdrop-blur-md"
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={handleBack}
          title={t('settings.back')}
          aria-label={t('settings.back')}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
        <span className="text-[12px] font-semibold" data-tauri-drag-region>
          {t('settings.title')}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <SettingsRail
          activeTab={activeTab}
          onSelect={setActiveTab}
          footer={
            config.systemInfo ? (
              <>
                <strong className="block font-semibold text-[var(--rail-active)]">
                  v{config.systemInfo.app_version}
                </strong>
                <span>{t('settings.about.tagline')}</span>
              </>
            ) : undefined
          }
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <div className="min-w-0">
              <h1 className="text-[13px] font-semibold leading-tight">{t(activeNav.labelKey)}</h1>
              <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--muted)]">
                {t(activeNav.descriptionKey)}
              </p>
            </div>
            {initialLoading ? (
              <StatusPill tone="info">{t('settings.loading')}</StatusPill>
            ) : saved ? (
              <StatusPill tone="success">{t('settings.saved')}</StatusPill>
            ) : dirty ? (
              <StatusPill tone="warning">{t('settings.unsaved')}</StatusPill>
            ) : null}
          </header>

          <div
            id={`settings-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`settings-tab-${activeTab}`}
            className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-2.5"
          >
            {config.loadError ? (
              <div className="rounded-lg border border-[var(--danger)]/35 bg-[var(--danger)]/8 px-3 py-2.5">
                <p className="text-[11.5px] font-medium text-[var(--danger)]">
                  {t('settings.loadFailed')}
                </p>
                <p className="mt-0.5 text-[10.5px] text-[var(--text)]">{config.loadError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 text-[11px]"
                  onClick={() => void fetchConfig()}
                >
                  {t('settings.retry')}
                </Button>
              </div>
            ) : (
              <>
                {activeTab === 'general' && (
                  <GeneralPanel
                    config={config.config}
                    windowResetState={config.windowResetState}
                    onMaxHistoryCount={config.setMaxHistoryCount}
                    onSearchDebounceMs={config.setSearchDebounceMs}
                    onLanguage={config.setLanguage}
                    onAutoStart={(value) => void config.setAutoStart(value)}
                    onShowWindowOnStartup={config.setShowWindowOnStartup}
                    onResetWindowSize={() => void config.resetWindowSize()}
                  />
                )}

                {activeTab === 'appearance' && (
                  <AppearancePanel
                    config={config.config}
                    onThemeFamily={(family) => {
                      config.setThemeFamily(family);
                      void theme.setThemeFamily(family, false);
                    }}
                    onThemeMode={(mode) => {
                      config.setThemeMode(mode);
                      void theme.setThemeMode(mode, false);
                    }}
                  />
                )}

                {activeTab === 'shortcuts' && (
                  <ShortcutsPanel
                    bindings={shortcuts.bindings}
                    issues={shortcuts.issues}
                    occupied={shortcuts.occupied}
                    captureAction={shortcuts.captureAction}
                    loadError={shortcuts.loadError}
                    onRetry={() => void fetchShortcuts()}
                    onBeginCapture={shortcuts.beginCapture}
                    onCancelCapture={shortcuts.cancelCapture}
                    onAccelerator={shortcuts.setAccelerator}
                    onEnabled={shortcuts.setEnabled}
                  />
                )}

                {activeTab === 'behavior' && (
                  <BehaviorPanel
                    config={config.config}
                    onHideOnFocusLoss={config.setHideOnFocusLoss}
                    onHideAfterPaste={config.setHideAfterPaste}
                    onAlwaysOnTop={config.setAlwaysOnTop}
                    onCloseToTray={config.setCloseToTray}
                  />
                )}

                {activeTab === 'data' && (
                  <div className="space-y-2.5">
                    <StorageSection
                      usage={config.storageUsage}
                      usageError={config.storageUsageError}
                      budgetBytes={config.config.image_budget_bytes ?? 2 * 1024 * 1024 * 1024}
                      onBudgetBytes={config.setImageBudgetBytes}
                      onRetryUsage={() => void fetchStorageUsage()}
                    />
                    <DataManagementView />
                  </div>
                )}

                {activeTab === 'about' && (
                  <AboutPanel
                    systemInfo={config.systemInfo}
                    diagnosticsInfo={config.diagnosticsInfo}
                    windowState={config.windowState}
                  />
                )}
              </>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <div className="min-w-0">
              {saveError ? (
                <InlineMessage tone="danger">{saveError}</InlineMessage>
              ) : saved ? (
                <InlineMessage tone="success">{t('settings.savedHint')}</InlineMessage>
              ) : dirty ? (
                <p className="flex items-center gap-1.5 text-[10.5px] text-[var(--muted)]">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warning)]"
                  />
                  {t('settings.unsavedHint')}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                disabled={saving}
                onClick={handleBack}
              >
                {t('settings.cancel')}
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1 text-[11px]"
                disabled={saving || !dirty}
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : saved ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : null}
                {saving ? t('settings.saving') : t('settings.save')}
              </Button>
            </div>
          </footer>
        </main>
      </div>

      {guardOpen && (
        <UnsavedChangesDialog
          onSave={async () => {
            const ok = await handleSave();
            setGuardOpen(false);
            if (ok) onBack();
          }}
          onDiscard={() => {
            setGuardOpen(false);
            void discardAndLeave();
          }}
          onKeepEditing={() => setGuardOpen(false)}
        />
      )}
    </div>
  );
}
