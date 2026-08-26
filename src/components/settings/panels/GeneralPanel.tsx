import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
} from '@/lib/constants';
import type { AppConfig } from '@/types';
import { InfoLine, SectionCard, SegmentedControl, SettingRow, SettingToggle } from '../primitives';

interface GeneralPanelProps {
  config: AppConfig;
  windowResetState: 'idle' | 'pending' | 'done' | 'error';
  onMaxHistoryCount: (value: number) => void;
  onSearchDebounceMs: (value: number) => void;
  onLanguage: (value: string) => void;
  onAutoStart: (value: boolean) => void;
  onShowWindowOnStartup: (value: boolean) => void;
  onResetWindowSize: () => void;
}

export function GeneralPanel({
  config,
  windowResetState,
  onMaxHistoryCount,
  onSearchDebounceMs,
  onLanguage,
  onAutoStart,
  onShowWindowOnStartup,
  onResetWindowSize,
}: GeneralPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2.5">
      <SectionCard
        title={t('settings.general.startupTitle')}
        description={t('settings.general.startupDesc')}
      >
        <div className="divide-y divide-[var(--border)]">
          <SettingToggle
            label={t('settings.behavior.autoStart')}
            description={t('settings.behavior.autoStartDesc')}
            checked={config.auto_start}
            onChange={onAutoStart}
          />
          <SettingToggle
            label={t('settings.behavior.showWindowOnStartup')}
            description={t('settings.behavior.showWindowOnStartupDesc')}
            checked={config.show_window_on_startup ?? false}
            onChange={onShowWindowOnStartup}
          />
          <SettingRow
            label={t('settings.general.language')}
            description={t('settings.general.languageHint')}
            control={
              <SegmentedControl
                ariaLabel={t('settings.general.language')}
                value={config.language}
                onChange={onLanguage}
                options={SUPPORTED_LANGUAGES.map((lang) => ({
                  value: lang,
                  label: t(`language.${lang}`),
                }))}
              />
            }
          />
        </div>
      </SectionCard>

      <SectionCard
        title={t('settings.general.historyTitle')}
        description={t('settings.general.historyDesc')}
      >
        <div className="divide-y divide-[var(--border)]">
          <SettingRow
            htmlFor="max-history"
            label={t('settings.general.historyCount')}
            description={t('settings.general.maxItems')}
            control={
              <Input
                id="max-history"
                type="number"
                min={10}
                max={1000}
                value={config.max_history_count}
                onChange={(event) => onMaxHistoryCount(parseInt(event.target.value, 10) || 100)}
                className="h-7 w-20 text-xs"
              />
            }
          />
          <SettingRow
            htmlFor="debounce"
            label={t('settings.general.searchDebounce')}
            description={t('settings.general.searchDebounceDesc')}
            control={
              <div className="flex items-center gap-1.5">
                <Input
                  id="debounce"
                  type="number"
                  min={50}
                  max={1000}
                  step={50}
                  value={config.search_debounce_ms}
                  onChange={(event) =>
                    onSearchDebounceMs(parseInt(event.target.value, 10) || 150)
                  }
                  className="h-7 w-20 text-xs"
                />
                <span className="text-[10px] text-[var(--muted)]">
                  {t('settings.general.milliseconds')}
                </span>
              </div>
            }
          />
        </div>
      </SectionCard>

      <SectionCard
        title={t('settings.general.windowSize')}
        description={t('settings.general.windowSizeDesc')}
      >
        <div className="space-y-1">
          <InfoLine
            label={t('settings.general.defaultWindow')}
            value={`${DEFAULT_WINDOW_WIDTH} × ${DEFAULT_WINDOW_HEIGHT} DIP`}
            mono
          />
          <InfoLine
            label={t('settings.general.minWindow')}
            value={`${MIN_WINDOW_WIDTH} × ${MIN_WINDOW_HEIGHT} DIP`}
            mono
          />
          <InfoLine
            label={t('settings.general.currentWindow')}
            value={`${config.window_width} × ${config.window_height} DIP`}
            mono
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2">
          <p className="min-w-0 text-[10.5px] leading-snug text-[var(--muted)]">
            {t('settings.general.resetWindowHint')}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 text-[11px]"
            disabled={windowResetState === 'pending'}
            onClick={onResetWindowSize}
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            {windowResetState === 'done'
              ? t('settings.general.windowReset')
              : t('settings.general.resetWindow')}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
