import { useTranslation } from 'react-i18next';
import type { AppConfig } from '@/types';
import { SectionCard, SettingToggle } from '../primitives';

interface BehaviorPanelProps {
  config: AppConfig;
  onHideOnFocusLoss: (value: boolean) => void;
  onHideAfterPaste: (value: boolean) => void;
  onAlwaysOnTop: (value: boolean) => void;
  onCloseToTray: (value: boolean) => void;
}

/**
 * `hide_on_focus_loss` and `close_to_tray` are separate settings here — the old
 * page mapped one onto the other (spec §10.2).
 */
export function BehaviorPanel({
  config,
  onHideOnFocusLoss,
  onHideAfterPaste,
  onAlwaysOnTop,
  onCloseToTray,
}: BehaviorPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2.5">
      <SectionCard
        title={t('settings.behavior.windowTitle')}
        description={t('settings.behavior.windowDesc')}
      >
        <div className="divide-y divide-[var(--border)]">
          <SettingToggle
            label={t('settings.behavior.hideOnFocusLoss')}
            description={t('settings.behavior.hideOnFocusLossDesc')}
            checked={config.hide_on_focus_loss ?? true}
            onChange={onHideOnFocusLoss}
          />
          <SettingToggle
            label={t('settings.behavior.alwaysOnTop')}
            description={t('settings.behavior.alwaysOnTopDesc')}
            checked={config.always_on_top ?? true}
            onChange={onAlwaysOnTop}
          />
          <SettingToggle
            label={t('settings.behavior.closeToTray')}
            description={t('settings.behavior.closeToTrayDesc')}
            checked={config.close_to_tray}
            onChange={onCloseToTray}
          />
        </div>
      </SectionCard>

      <SectionCard
        title={t('settings.behavior.pasteTitle')}
        description={t('settings.behavior.pasteDesc')}
      >
        <SettingToggle
          label={t('settings.behavior.hideAfterPaste')}
          description={t('settings.behavior.hideAfterPasteDesc')}
          checked={config.hide_after_paste ?? true}
          onChange={onHideAfterPaste}
        />
      </SectionCard>
    </div>
  );
}
