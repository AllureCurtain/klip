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

  const remainingMinutes = Math.max(
    1,
    Math.ceil((privacyModeUntil - now) / 60_000)
  );

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
