import { useEffect, useState } from 'react';
import { open as openPath } from '@tauri-apps/plugin-shell';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useConfigStore } from '@/stores/configStore';
import { useShortcutStore } from '@/stores/shortcutStore';
import { useThemeStore } from '@/stores/themeStore';
import {
  ArrowLeft,
  Settings,
  Keyboard,
  Sliders,
  Info,
  Monitor,
  Loader2,
  Database,
  ClipboardCopy,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { DataManagementView } from './DataManagementView';
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
} from '@/lib/constants';

export type SettingsTab = 'general' | 'appearance' | 'shortcuts' | 'behavior' | 'data' | 'about';

function codeToAcceleratorKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[01])$/.test(code)) return code;
  const map: Record<string, string> = {
    ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    Insert: 'Insert', Delete: 'Delete', Space: 'Space',
  };
  return map[code] ?? null;
}

interface SettingsViewProps {
  onBack: () => void;
  initialTab?: SettingsTab;
}

export function SettingsView({ onBack, initialTab = 'general' }: SettingsViewProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const {
    config,
    systemInfo,
    diagnosticsInfo,
    loading,
    error,
    hasChanges,
    fetchConfig,
    fetchSystemInfo,
    fetchDiagnosticsInfo,
    setMaxHistoryCount,
    setAutoStart,
    setCloseToTray,
    setHideOnFocusLoss,
    setHideAfterPaste,
    setShowWindowOnStartup,
    setAlwaysOnTop,
    setThemeFamily,
    setThemeMode,
    setWindowWidth,
    setWindowHeight,
    setSearchDebounceMs,
    setLanguage,
    saveChanges,
    resetChanges,
  } = useConfigStore();
  const shortcutState = useShortcutStore();
  const theme = useThemeStore();

  const tabItems: { value: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { value: 'general', label: t('settings.tabs.general'), icon: <Sliders className="h-3.5 w-3.5" /> },
    { value: 'appearance', label: t('settings.tabs.appearance'), icon: <Monitor className="h-3.5 w-3.5" /> },
    { value: 'shortcuts', label: t('settings.tabs.shortcuts'), icon: <Keyboard className="h-3.5 w-3.5" /> },
    { value: 'behavior', label: t('settings.tabs.behavior'), icon: <Monitor className="h-3.5 w-3.5" /> },
    { value: 'data', label: t('settings.tabs.data'), icon: <Database className="h-3.5 w-3.5" /> },
    { value: 'about', label: t('settings.tabs.about'), icon: <Info className="h-3.5 w-3.5" /> },
  ];

  useEffect(() => {
    fetchConfig();
    fetchSystemInfo();
    fetchDiagnosticsInfo();
    void shortcutState.fetch();
  }, [fetchConfig, fetchSystemInfo, fetchDiagnosticsInfo]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleSave = async () => {
    const configSaved = await saveChanges();
    const shortcutsSaved = !shortcutState.isDirty || await shortcutState.save();
    if (configSaved && shortcutsSaved) {
      await theme.hydrate();
      onBack();
    }
  };

  const handleCancel = async () => {
    await resetChanges();
    shortcutState.reset();
    await theme.hydrate();
    onBack();
  };

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      {/* Title bar */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 px-2 pt-1.5 pb-1 border-b border-[var(--glass-border)] backdrop-blur-md bg-[var(--glass-bg)]"
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={handleCancel}
          title={t('settings.back')}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-1.5" data-tauri-drag-region>
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{t('settings.title')}</span>
        </div>
      </div>

      {/* Tab row */}
      <div
        role="tablist"
        aria-label={t('settings.title')}
        className="flex items-center gap-0.5 px-2 pb-1.5 border-b border-[var(--glass-border)]"
      >
        {tabItems.map((tab) => (
          <button
            key={tab.value}
            id={`settings-tab-${tab.value}`}
            role="tab"
            type="button"
            aria-selected={activeTab === tab.value}
            aria-controls={`settings-panel-${tab.value}`}
            className={cn(
              'flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium transition-colors',
              activeTab === tab.value
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            )}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        id={`settings-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
        className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin"
      >
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="max-history" className="text-xs">{t('settings.general.historyCount')}</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="max-history"
                  type="number"
                  min={10}
                  max={1000}
                  value={config.max_history_count}
                  onChange={(e) => setMaxHistoryCount(parseInt(e.target.value, 10) || 100)}
                  className="h-7 w-20 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">
                  {t('settings.general.maxItems')}
                </span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs">{t('settings.general.windowSize')}</Label>
              <div className="flex items-center gap-2">
                <Label htmlFor="window-width" className="sr-only">
                  {t('settings.general.windowWidth')}
                </Label>
                <Input
                  id="window-width"
                  type="number"
                  min={MIN_WINDOW_WIDTH}
                  max={1000}
                  value={config.window_width}
                  onChange={(e) => setWindowWidth(parseInt(e.target.value, 10) || DEFAULT_WINDOW_WIDTH)}
                  className="h-7 w-16 text-xs"
                />
                <span className="text-muted-foreground text-xs">x</span>
                <Label htmlFor="window-height" className="sr-only">
                  {t('settings.general.windowHeight')}
                </Label>
                <Input
                  id="window-height"
                  type="number"
                  min={MIN_WINDOW_HEIGHT}
                  max={1400}
                  value={config.window_height}
                  onChange={(e) => setWindowHeight(parseInt(e.target.value, 10) || DEFAULT_WINDOW_HEIGHT)}
                  className="h-7 w-16 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">px</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="debounce" className="text-xs">{t('settings.general.searchDebounce')}</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="debounce"
                  type="number"
                  min={50}
                  max={1000}
                  step={50}
                  value={config.search_debounce_ms}
                  onChange={(e) => setSearchDebounceMs(parseInt(e.target.value, 10) || 150)}
                  className="h-7 w-20 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">{t('settings.general.milliseconds')}</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs">{t('settings.general.language')}</Label>
              <div className="flex items-center gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    className={cn(
                      'h-7 px-3 rounded-md text-xs font-medium transition-colors',
                      config.language === lang
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    )}
                    onClick={() => setLanguage(lang)}
                  >
                    {t(`language.${lang}`)}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">{t('settings.general.languageHint')}</p>
            </div>
          </div>
        )}

        {activeTab === 'shortcuts' && (
          <div className="space-y-4">
            {shortcutState.bindings.length > 0 && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold">{t('settings.shortcuts.independentTitle')}</h3>
                    <p className="text-[10px] text-muted-foreground">{t('settings.shortcuts.independentHint')}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{shortcutState.bindings.filter((binding) => binding.enabled).length}/10</Badge>
                </div>
                <div className="space-y-1">
                  {shortcutState.bindings.map((binding) => (
                    <div key={binding.actionId} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                      <Switch
                        aria-label={`${t(`settings.shortcuts.actions.${binding.actionId}`)} ${t('settings.shortcuts.enabled')}`}
                        checked={binding.enabled}
                        onCheckedChange={(enabled) => shortcutState.setEnabled(binding.actionId, enabled)}
                      />
                      <span className="min-w-0 flex-1 text-[11px]">{t(`settings.shortcuts.actions.${binding.actionId}`)}</span>
                      <button
                        type="button"
                        className={cn('min-w-[116px] rounded-md border px-2 py-1 text-left font-mono text-[10px]', shortcutState.captureAction === binding.actionId ? 'border-primary bg-accent' : 'border-input bg-card/60', !binding.enabled && 'opacity-60')}
                        aria-label={t(`settings.shortcuts.actions.${binding.actionId}`)}
                        onClick={() => shortcutState.beginCapture(binding.actionId)}
                        onKeyDown={(event) => {
                          if (shortcutState.captureAction !== binding.actionId) return;
                          event.preventDefault();
                          if (event.code === 'Escape') { shortcutState.cancelCapture(); return; }
                          if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
                          const key = codeToAcceleratorKey(event.code);
                          if (!key) return;
                          const parts = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Win', key].filter(Boolean).join('+');
                          shortcutState.setAccelerator(binding.actionId, parts);
                          shortcutState.cancelCapture();
                        }}
                      >
                        {shortcutState.captureAction === binding.actionId ? t('settings.shortcuts.recording') : binding.accelerator ?? t('settings.shortcuts.unset')}
                      </button>
                      <button type="button" className="rounded-md px-1.5 text-[10px] text-muted-foreground hover:bg-muted" aria-label={t('settings.shortcuts.clear')} onClick={() => { shortcutState.setAccelerator(binding.actionId, null); shortcutState.setEnabled(binding.actionId, false); }}>×</button>
                    </div>
                  ))}
                </div>
                {shortcutState.error && <p className="text-[10px] text-destructive">{shortcutState.error}</p>}
              </div>
            )}
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">{t('settings.appearance.family')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['ember', 'graphite', 'brick', 'rose'] as const).map((family) => (
                  <button
                    key={family}
                    type="button"
                    aria-pressed={config.theme_family === family}
                    className={cn('rounded-lg border px-3 py-2 text-left text-xs transition-colors', config.theme_family === family ? 'border-primary bg-accent text-accent-foreground' : 'border-border hover:bg-muted')}
                    onClick={() => { setThemeFamily(family); void theme.setThemeFamily(family, false); }}
                  >
                    <span className="font-medium">{t(`settings.appearance.families.${family}`)}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">{t(`settings.appearance.familyHints.${family}`)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="theme-mode" className="text-xs">{t('settings.appearance.mode')}</Label>
              <select id="theme-mode" value={config.theme_mode ?? 'system'} onChange={(event) => { const value = event.target.value as 'light' | 'dark' | 'system'; setThemeMode(value); void theme.setThemeMode(value, false); }} className="h-8 w-full rounded-md border border-input bg-card/60 px-3 text-xs">
                <option value="system">{t('settings.appearance.system')}</option>
                <option value="light">{t('settings.appearance.light')}</option>
                <option value="dark">{t('settings.appearance.dark')}</option>
              </select>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
              {t('settings.appearance.previewHint')}
            </div>
          </div>
        )}

        {activeTab === 'behavior' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs">{t('settings.behavior.autoStart')}</Label>
                <p className="text-[10px] text-muted-foreground">
                  {t('settings.behavior.autoStartDesc')}
                </p>
              </div>
              <Switch
                aria-label={t('settings.behavior.autoStart')}
                checked={config.auto_start}
                onCheckedChange={setAutoStart}
              />
            </div>

            <Separator />
            <SettingToggle label={t('settings.behavior.hideOnFocusLoss')} description={t('settings.behavior.hideOnFocusLossDesc')} checked={config.hide_on_focus_loss ?? true} onChange={setHideOnFocusLoss} />
            <Separator />
            <SettingToggle label={t('settings.behavior.hideAfterPaste')} description={t('settings.behavior.hideAfterPasteDesc')} checked={config.hide_after_paste ?? true} onChange={setHideAfterPaste} />
            <Separator />
            <SettingToggle label={t('settings.behavior.showWindowOnStartup')} description={t('settings.behavior.showWindowOnStartupDesc')} checked={config.show_window_on_startup ?? false} onChange={setShowWindowOnStartup} />
            <Separator />
            <SettingToggle label={t('settings.behavior.alwaysOnTop')} description={t('settings.behavior.alwaysOnTopDesc')} checked={config.always_on_top ?? true} onChange={setAlwaysOnTop} />

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs">{t('settings.behavior.closeToTray')}</Label>
                <p className="text-[10px] text-muted-foreground">
                  {t('settings.behavior.closeToTrayDesc')}
                </p>
              </div>
              <Switch
                aria-label={t('settings.behavior.closeToTray')}
                checked={config.close_to_tray}
                onCheckedChange={setCloseToTray}
              />
            </div>
          </div>
        )}

        {activeTab === 'data' && <DataManagementView />}

        {activeTab === 'about' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                K
              </div>
              <div>
                <h3 className="text-sm font-semibold">Klip</h3>
                <p className="text-[10px] text-muted-foreground">
                  {t('settings.about.tagline')}
                </p>
              </div>
            </div>

            {systemInfo && (
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('settings.about.version')}</span>
                  <span className="font-mono">{systemInfo.app_version}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('settings.about.platform')}</span>
                  <span className="capitalize">{systemInfo.platform}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('settings.about.system')}</span>
                  <span className="font-mono text-[10px]">{systemInfo.version}</span>
                </div>
              </div>
            )}

            {diagnosticsInfo && (
              <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5 text-[10px]">
                <DiagnosticsPathRow
                  label={t('settings.about.dataDir')}
                  value={diagnosticsInfo.data_dir}
                  copyLabel={t('settings.about.copyPath', { label: t('settings.about.dataDir') })}
                  openLabel={t('settings.about.openPath', { label: t('settings.about.dataDir') })}
                />
                <Separator />
                <DiagnosticsPathRow
                  label={t('settings.about.database')}
                  value={diagnosticsInfo.db_path}
                  copyLabel={t('settings.about.copyPath', { label: t('settings.about.database') })}
                  openLabel={t('settings.about.openPath', { label: t('settings.about.database') })}
                />
                <Separator />
                <DiagnosticsPathRow
                  label={t('settings.about.logDir')}
                  value={diagnosticsInfo.log_dir}
                  copyLabel={t('settings.about.copyPath', { label: t('settings.about.logDir') })}
                  openLabel={t('settings.about.openPath', { label: t('settings.about.logDir') })}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {error && (
        <div className="mx-3 mb-2 rounded-md bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2 px-3 pb-2 pt-1 border-t border-[var(--glass-border)]">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={loading}
          className="h-7 text-xs"
        >
          {t('settings.cancel')}
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={loading || shortcutState.saving || (!hasChanges && !shortcutState.isDirty)}
          className="h-7 text-xs"
        >
          {loading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

interface DiagnosticsPathRowProps {
  label: string;
  value: string;
  copyLabel: string;
  openLabel: string;
}

function DiagnosticsPathRow({ label, value, copyLabel, openLabel }: DiagnosticsPathRowProps) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono" title={value}>
        {value}
      </span>
      <span className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={copyLabel}
          onClick={() => void navigator.clipboard?.writeText(value)}
        >
          <ClipboardCopy className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={openLabel}
          onClick={() => void openPath(value)}
        >
          <ExternalLink className="h-3 w-3" />
        </Button>
      </span>
    </div>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-xs">{label}</Label>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
