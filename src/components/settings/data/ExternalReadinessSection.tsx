import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield } from 'lucide-react';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useConfigStore } from '@/stores/configStore';

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
    <section className="rounded-md border bg-muted/20">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        aria-expanded={readinessOpen}
        aria-controls="external-readiness-panel"
        onClick={() => setReadinessOpen((open) => !open)}
      >
        <span className="flex min-w-0 items-start gap-2">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block text-xs font-medium">
              {t('settings.data.externalReadiness')}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              {t('settings.data.externalReadinessDesc')}
            </span>
          </span>
        </span>
        <span className="text-[10px] text-muted-foreground">
          {readinessOpen ? t('common.close') : t('settings.data.openAdvanced')}
        </span>
      </button>

      {readinessOpen && (
        <div id="external-readiness-panel" className="space-y-3 border-t px-3 py-3">
          <p className="text-[10px] text-muted-foreground">
            {t('settings.data.externalReadinessNotice')}
          </p>
          <ConfigSwitch
            label={t('settings.data.updatesEnabled')}
            checked={config.updates_enabled}
            onCheckedChange={setUpdatesEnabled}
          />
          <Field
            id="update-feed-url"
            label={t('settings.data.updateFeedUrl')}
            value={config.update_feed_url}
            onChange={setUpdateFeedUrl}
            placeholder="https://updates.example.com/klip.json"
          />
          <ConfigSwitch
            label={t('settings.data.encryptionEnabled')}
            checked={config.encryption_enabled}
            onCheckedChange={setEncryptionEnabled}
          />
          <p className="text-[10px] text-muted-foreground">
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
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-7 font-mono text-[11px]"
      />
    </div>
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
