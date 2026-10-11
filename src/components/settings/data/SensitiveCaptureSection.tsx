import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui';
import { useConfigStore } from '@/stores/configStore';
import { SectionCard, SettingToggle } from '../primitives';
import type { useSettingsDataActions } from './settingsDataActions';

type DataActions = ReturnType<typeof useSettingsDataActions>;

interface SensitiveCaptureSectionProps {
  rescanSensitive: () => Promise<number>;
  actions: Pick<DataActions, 'busyAction' | 'run'>;
}

export function SensitiveCaptureSection({
  rescanSensitive,
  actions,
}: SensitiveCaptureSectionProps) {
  const { t } = useTranslation();
  const {
    config,
    setSensitiveCapturePolicy,
    setMaskSensitivePreviews,
    setClipboardMonitorEnabled,
  } = useConfigStore();

  return (
    <SectionCard
      title={t('settings.data.sensitiveTitle')}
      description={t('settings.data.sensitiveDesc')}
    >
      <div className="divide-y divide-[var(--border)]">
        <SettingToggle
          label={t('settings.data.skipSensitive')}
          description={t('settings.data.skipSensitiveDesc')}
          checked={config.sensitive_capture_policy === 'skip'}
          onChange={(checked) => setSensitiveCapturePolicy(checked ? 'skip' : 'flag')}
        />
        <SettingToggle
          label={t('settings.data.maskSensitivePreviews')}
          description={t('settings.data.maskSensitivePreviewsDesc')}
          checked={config.mask_sensitive_previews}
          onChange={setMaskSensitivePreviews}
        />
        <SettingToggle
          label={t('settings.data.monitoring')}
          checked={config.clipboard_monitor_enabled}
          onChange={setClipboardMonitorEnabled}
        />
      </div>
      <div className="mt-1.5 border-t border-[var(--border)] pt-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-[11px]"
          onClick={() =>
            actions.run(
              'scan-sensitive',
              () => rescanSensitive().then((count) => ({ count })),
              t('settings.data.sensitiveScanned')
            )
          }
          disabled={actions.busyAction !== null}
        >
          <KeyRound className="h-3 w-3" aria-hidden="true" />
          {t('settings.data.rescanSensitive')}
        </Button>
      </div>
    </SectionCard>
  );
}
