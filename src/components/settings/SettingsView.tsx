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

export type SettingsTab = 'general' | 'shortcuts' | 'behavior' | 'data' | 'about';

const TOGGLE_HOTKEY_OPTIONS = Array.from({ length: 26 }, (_value, index) =>
  `Ctrl+Alt+${String.fromCharCode(65 + index)}`
);
const QUICK_PASTE_PREFIX_OPTIONS = ['Ctrl+Alt'];

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
    setHotkeyToggleWindow,
    setHotkeyQuickPastePrefix,
    setAutoStart,
    setCloseToTray,
    setWindowWidth,
    setWindowHeight,
    setSearchDebounceMs,
    setLanguage,
    saveChanges,
    resetChanges,
  } = useConfigStore();

  const tabItems: { value: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { value: 'general', label: t('settings.tabs.general'), icon: <Sliders className="h-3.5 w-3.5" /> },
    { value: 'shortcuts', label: t('settings.tabs.shortcuts'), icon: <Keyboard className="h-3.5 w-3.5" /> },
    { value: 'behavior', label: t('settings.tabs.behavior'), icon: <Monitor className="h-3.5 w-3.5" /> },
    { value: 'data', label: t('settings.tabs.data'), icon: <Database className="h-3.5 w-3.5" /> },
    { value: 'about', label: t('settings.tabs.about'), icon: <Info className="h-3.5 w-3.5" /> },
  ];

  useEffect(() => {
    fetchConfig();
    fetchSystemInfo();
    fetchDiagnosticsInfo();
  }, [fetchConfig, fetchSystemInfo, fetchDiagnosticsInfo]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleSave = async () => {
    const saved = await saveChanges();
    if (saved) {
      onBack();
    }
  };

  const handleCancel = async () => {
    await resetChanges();
    onBack();
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Title bar */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 px-2 pt-1.5 pb-1 border-b border-border"
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
        className="flex items-center gap-0.5 px-2 pb-1.5 border-b border-border"
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
            <div className="space-y-2">
              <Label htmlFor="hotkey-toggle-window" className="text-xs">{t('settings.shortcuts.toggleWindow')}</Label>
              <select
                id="hotkey-toggle-window"
                value={config.hotkey_toggle_window}
                onChange={(e) => setHotkeyToggleWindow(e.target.value)}
                className="h-7 w-full rounded-md border border-input bg-card/60 px-3 font-mono text-xs text-foreground"
              >
                {TOGGLE_HOTKEY_OPTIONS.map((hotkey) => (
                  <option key={hotkey} value={hotkey}>
                    {hotkey}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                {t('settings.shortcuts.toggleWindowHint')}
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="hotkey-quick-paste-prefix" className="text-xs">{t('settings.shortcuts.quickPastePrefix')}</Label>
              <select
                id="hotkey-quick-paste-prefix"
                value={config.hotkey_quick_paste_prefix}
                onChange={(e) => setHotkeyQuickPastePrefix(e.target.value)}
                className="h-7 w-full rounded-md border border-input bg-card/60 px-3 font-mono text-xs text-foreground"
              >
                {QUICK_PASTE_PREFIX_OPTIONS.map((prefix) => (
                  <option key={prefix} value={prefix}>
                    {prefix}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                {t('settings.shortcuts.quickPasteHint')}
              </p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <Badge key={n} variant="outline" className="font-mono text-[10px] py-0">
                    {config.hotkey_quick_paste_prefix}+{n}
                  </Badge>
                ))}
              </div>
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
      <div className="flex items-center justify-end gap-2 px-3 pb-2 pt-1 border-t border-border">
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
          disabled={loading || !hasChanges}
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
