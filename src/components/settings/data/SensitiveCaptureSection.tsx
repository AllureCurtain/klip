import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useConfigStore } from '@/stores/configStore';
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
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label className="text-xs">{t('settings.data.skipSensitive')}</Label>
          <p className="text-[10px] text-muted-foreground">
            {t('settings.data.skipSensitiveDesc')}
          </p>
        </div>
        <Switch
          aria-label={t('settings.data.skipSensitive')}
          checked={config.sensitive_capture_policy === 'skip'}
          onCheckedChange={(checked) => setSensitiveCapturePolicy(checked ? 'skip' : 'flag')}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label className="text-xs">{t('settings.data.maskSensitivePreviews')}</Label>
          <p className="text-[10px] text-muted-foreground">
            {t('settings.data.maskSensitivePreviewsDesc')}
          </p>
        </div>
        <Switch
          aria-label={t('settings.data.maskSensitivePreviews')}
          checked={config.mask_sensitive_previews}
          onCheckedChange={setMaskSensitivePreviews}
        />
      </div>

      <ConfigSwitch
        label={t('settings.data.monitoring')}
        checked={config.clipboard_monitor_enabled}
        onCheckedChange={setClipboardMonitorEnabled}
      />

      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() =>
          actions.run(
            'scan-sensitive',
            () => rescanSensitive().then((count) => ({ count })),
            t('settings.data.sensitiveScanned')
          )
        }
        disabled={actions.busyAction !== null}
      >
        <KeyRound className="h-3 w-3" />
        {t('settings.data.rescanSensitive')}
      </Button>
    </>
  );
}

interface ConfigSwitchProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function ConfigSwitch({ label, checked, onCheckedChange }: ConfigSwitchProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-xs">{label}</Label>
      <Switch
        aria-label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
