import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield } from 'lucide-react';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui/label';
import { useConfigStore } from '@/stores/configStore';
import { SettingToggle } from '../primitives';

export function ExternalReadinessSection() {
  const { t } = useTranslation();
  const [readinessOpen, setReadinessOpen] = useState(false);
  const {
    config,
    setUpdatesEnabled,
    setUpdateFeedUrl,
    setEncryptionEnabled,
    setSyncFolder,
    setPluginFolder,
  } = useConfigStore();

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card-token)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        aria-expanded={readinessOpen}
        aria-controls="external-readiness-panel"
        onClick={() => setReadinessOpen((open) => !open)}
      >
        <span className="flex min-w-0 items-start gap-2">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold leading-tight text-[var(--ink)]">
              {t('settings.data.externalReadiness')}
            </span>
            <span className="mt-0.5 block text-[10.5px] leading-snug text-[var(--muted)]">
              {t('settings.data.externalReadinessDesc')}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-[10.5px] font-medium text-[var(--muted)]">
          {readinessOpen ? t('common.close') : t('settings.data.openAdvanced')}
        </span>
      </button>

      {readinessOpen && (
        <div
          id="external-readiness-panel"
          className="space-y-2.5 border-t border-[var(--border)] px-3 py-2.5"
        >
          <p className="text-[10.5px] leading-snug text-[var(--muted)]">
            {t('settings.data.externalReadinessNotice')}
          </p>
          <SettingToggle
            label={t('settings.data.updatesEnabled')}
            checked={config.updates_enabled}
            onChange={setUpdatesEnabled}
          />
          <Field
            id="update-feed-url"
            label={t('settings.data.updateFeedUrl')}
            value={config.update_feed_url}
            onChange={setUpdateFeedUrl}
            placeholder="https://updates.example.com/klip.json"
          />
          <SettingToggle
            label={t('settings.data.encryptionEnabled')}
            checked={config.encryption_enabled}
            onChange={setEncryptionEnabled}
          />
          <p className="text-[10.5px] leading-snug text-[var(--muted)]">
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
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

function Field({ id, label, value, onChange, placeholder }: FieldProps) {
  return (
    <div className="space-y-1">
      <Label
        htmlFor={id}
        className="text-[10.5px] font-medium leading-tight text-[var(--ink)]"
      >
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-7 font-mono text-[10.5px]"
      />
    </div>
  );
}
