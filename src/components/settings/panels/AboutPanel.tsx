import { open as openPath } from '@tauri-apps/plugin-shell';
import { useTranslation } from 'react-i18next';
import { ClipboardCopy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DiagnosticsInfo, SystemInfo, WindowState } from '@/types';
import { InfoLine, SectionCard, StatusPill } from '../primitives';

interface AboutPanelProps {
  systemInfo: SystemInfo | null;
  diagnosticsInfo: DiagnosticsInfo | null;
  windowState: WindowState | null;
}

export function AboutPanel({ systemInfo, diagnosticsInfo, windowState }: AboutPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2.5">
      <SectionCard
        title="Klip"
        description={t('settings.about.tagline')}
        action={
          systemInfo ? <StatusPill>{`v${systemInfo.app_version}`}</StatusPill> : undefined
        }
      >
        {systemInfo && (
          <div className="space-y-1">
            <InfoLine label={t('settings.about.version')} value={systemInfo.app_version} mono />
            <InfoLine
              label={t('settings.about.platform')}
              value={<span className="capitalize">{systemInfo.platform}</span>}
            />
            <InfoLine label={t('settings.about.system')} value={systemInfo.version} mono />
            <InfoLine label={t('settings.about.storage')} value={t('settings.about.storageValue')} />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t('settings.about.diagnostics')}
        description={t('settings.about.diagnosticsDesc')}
      >
        {diagnosticsInfo ? (
          <div className="space-y-1">
            <DiagnosticsPathRow
              label={t('settings.about.dataDir')}
              value={diagnosticsInfo.data_dir}
              copyLabel={t('settings.about.copyPath', { label: t('settings.about.dataDir') })}
              openLabel={t('settings.about.openPath', { label: t('settings.about.dataDir') })}
            />
            <DiagnosticsPathRow
              label={t('settings.about.database')}
              value={diagnosticsInfo.db_path}
              copyLabel={t('settings.about.copyPath', { label: t('settings.about.database') })}
              openLabel={t('settings.about.openPath', { label: t('settings.about.database') })}
            />
            <DiagnosticsPathRow
              label={t('settings.about.logDir')}
              value={diagnosticsInfo.log_dir}
              copyLabel={t('settings.about.copyPath', { label: t('settings.about.logDir') })}
              openLabel={t('settings.about.openPath', { label: t('settings.about.logDir') })}
            />
          </div>
        ) : (
          <p className="text-[10.5px] text-[var(--muted)]">{t('settings.about.diagnosticsLoading')}</p>
        )}
      </SectionCard>

      <SectionCard
        title={t('settings.about.windowStateTitle')}
        description={t('settings.about.windowStateDesc')}
      >
        {windowState ? (
          <div className="space-y-1">
            <InfoLine
              label={t('settings.about.windowStateSize')}
              value={`${windowState.widthDip} × ${windowState.heightDip} DIP`}
              mono
            />
            <InfoLine
              label={t('settings.about.windowStatePosition')}
              value={
                windowState.x === null || windowState.y === null
                  ? t('settings.about.windowStateCentered')
                  : `${windowState.x}, ${windowState.y}`
              }
              mono
            />
            <InfoLine
              label={t('settings.about.windowStateScale')}
              value={windowState.scaleFactor === null ? '—' : `${windowState.scaleFactor}×`}
              mono
            />
          </div>
        ) : (
          <p className="text-[10.5px] text-[var(--muted)]">
            {t('settings.about.windowStateEmpty')}
          </p>
        )}
      </SectionCard>
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
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-[1px]">
      <span className="text-[10.5px] text-[var(--muted)]">{label}</span>
      <span className="truncate font-mono text-[10px] text-[var(--ink)]" title={value}>
        {value}
      </span>
      <span className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={copyLabel}
          title={copyLabel}
          onClick={() => void navigator.clipboard?.writeText(value)}
        >
          <ClipboardCopy className="h-3 w-3" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={openLabel}
          title={openLabel}
          onClick={() => void openPath(value)}
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Button>
      </span>
    </div>
  );
}
