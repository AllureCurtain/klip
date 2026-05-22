import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { open, save } from '@tauri-apps/plugin-dialog';
import { DatabaseBackup, Download, KeyRound, Plus, Trash2, Upload } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useClipboardStore } from '@/stores';
import { useConfigStore } from '@/stores/configStore';
import { Switch } from '@/components/ui/switch';

const DEFAULT_TAG_COLOR = '#14b8a6';

const JSON_FILTER = [{ name: 'JSON', extensions: ['json'] }];
const CSV_FILTER = [{ name: 'CSV', extensions: ['csv'] }];
const DB_FILTER = [{ name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3'] }];

export function DataManagementView() {
  const { t } = useTranslation();
  const { config, setSensitiveCapturePolicy, setMaskSensitivePreviews } = useConfigStore();
  const {
    tags,
    createTag,
    deleteTag,
    exportJson,
    exportCsv,
    importJson,
    importCsv,
    backupDatabase,
    restoreDatabase,
    rescanSensitive,
    fetchItems,
    fetchTags,
  } = useClipboardStore();
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(DEFAULT_TAG_COLOR);
  const [jsonPath, setJsonPath] = useState('');
  const [csvPath, setCsvPath] = useState('');
  const [backupPath, setBackupPath] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const handleCreateTag = async () => {
    const tag = await createTag(tagName, tagColor);
    if (tag) {
      setTagName('');
      setStatus(t('settings.data.tagCreated', { name: tag.name }));
    }
  };

  const run = async <T,>(actionId: string, action: () => Promise<T | null>, message: string) => {
    setBusyAction(actionId);
    try {
      const result = await action();
      if (result && message) setStatus(message);
      return result;
    } finally {
      setBusyAction(null);
    }
  };

  const handleRestoreDatabase = async () => {
    if (!window.confirm(t('settings.data.restoreConfirm'))) return;
    const summary = await run('restore-db', () => restoreDatabase(backupPath), '');
    if (summary) {
      await Promise.all([fetchItems(), fetchTags()]);
      setStatus(
        t('settings.data.restoredWithBackup', {
          size: formatBytes(summary.size),
          backupPath: summary.pre_restore_backup_path,
        })
      );
    }
  };

  const chooseSavePath = async (
    setter: (value: string) => void,
    defaultPath: string,
    filters: DialogFilter[]
  ) => {
    const selected = await save({ defaultPath, filters });
    if (selected) setter(selected);
  };

  const chooseOpenPath = async (setter: (value: string) => void, filters: DialogFilter[]) => {
    const selected = await open({ multiple: false, filters });
    if (typeof selected === 'string') setter(selected);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label className="text-xs">{t('settings.data.skipSensitive')}</Label>
          <p className="text-[10px] text-muted-foreground">
            {t('settings.data.skipSensitiveDesc')}
          </p>
        </div>
        <Switch
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
          checked={config.mask_sensitive_previews}
          onCheckedChange={setMaskSensitivePreviews}
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs">{t('settings.data.tags')}</Label>
        <div className="flex gap-2">
          <Input
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
            placeholder={t('settings.data.tagName')}
            className="h-7 text-xs"
          />
          <Input
            type="color"
            value={tagColor}
            onChange={(event) => setTagColor(event.target.value)}
            className="h-7 w-12 p-1"
            aria-label={t('settings.data.tagColor')}
          />
          <Button
            size="sm"
            className="h-7"
            onClick={handleCreateTag}
            disabled={tagName.trim() === ''}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag.id} variant="outline" className="gap-1">
              {tag.color && (
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
              )}
              {tag.name}
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-destructive"
                onClick={() => deleteTag(tag.id)}
                aria-label={t('settings.data.deleteTag', { name: tag.name })}
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      <Separator />

      <PathActions
        label={t('settings.data.json')}
        value={jsonPath}
        onChange={setJsonPath}
        placeholder="C:\\Users\\you\\Desktop\\klip-export.json"
        actions={[
          {
            label: t('settings.data.chooseExportPath'),
            icon: <Download className="h-3 w-3" />,
            onClick: () => chooseSavePath(setJsonPath, 'klip-export.json', JSON_FILTER),
            disabledWithoutValue: false,
          },
          {
            label: t('settings.data.chooseImportPath'),
            icon: <Upload className="h-3 w-3" />,
            onClick: () => chooseOpenPath(setJsonPath, JSON_FILTER),
            disabledWithoutValue: false,
          },
          {
            label: t('settings.data.export'),
            icon: <Download className="h-3 w-3" />,
            onClick: () => run('export-json', () => exportJson(jsonPath), t('settings.data.exported')),
          },
          {
            label: t('settings.data.import'),
            icon: <Upload className="h-3 w-3" />,
            onClick: () => run('import-json', () => importJson(jsonPath), t('settings.data.imported')),
          },
        ]}
        busyAction={busyAction}
      />

      <PathActions
        label={t('settings.data.csv')}
        value={csvPath}
        onChange={setCsvPath}
        placeholder="C:\\Users\\you\\Desktop\\klip-export.csv"
        actions={[
          {
            label: t('settings.data.chooseExportPath'),
            icon: <Download className="h-3 w-3" />,
            onClick: () => chooseSavePath(setCsvPath, 'klip-export.csv', CSV_FILTER),
            disabledWithoutValue: false,
          },
          {
            label: t('settings.data.chooseImportPath'),
            icon: <Upload className="h-3 w-3" />,
            onClick: () => chooseOpenPath(setCsvPath, CSV_FILTER),
            disabledWithoutValue: false,
          },
          {
            label: t('settings.data.export'),
            icon: <Download className="h-3 w-3" />,
            onClick: () => run('export-csv', () => exportCsv(csvPath), t('settings.data.exported')),
          },
          {
            label: t('settings.data.import'),
            icon: <Upload className="h-3 w-3" />,
            onClick: () => run('import-csv', () => importCsv(csvPath), t('settings.data.imported')),
          },
        ]}
        busyAction={busyAction}
      />

      <PathActions
        label={t('settings.data.backup')}
        value={backupPath}
        onChange={setBackupPath}
        placeholder="C:\\Users\\you\\Desktop\\klip.db"
        actions={[
          {
            label: t('settings.data.chooseBackupPath'),
            icon: <DatabaseBackup className="h-3 w-3" />,
            onClick: () => chooseSavePath(setBackupPath, 'klip.db', DB_FILTER),
            disabledWithoutValue: false,
          },
          {
            label: t('settings.data.chooseRestorePath'),
            icon: <Upload className="h-3 w-3" />,
            onClick: () => chooseOpenPath(setBackupPath, DB_FILTER),
            disabledWithoutValue: false,
          },
          {
            label: t('settings.data.backupNow'),
            icon: <DatabaseBackup className="h-3 w-3" />,
            onClick: () => run('backup-db', () => backupDatabase(backupPath), t('settings.data.backedUp')),
          },
          {
            label: t('settings.data.restore'),
            icon: <Upload className="h-3 w-3" />,
            onClick: handleRestoreDatabase,
          },
        ]}
        busyAction={busyAction}
      />

      <Separator />

      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() =>
          run(
            'scan-sensitive',
            () => rescanSensitive().then((count) => ({ count })),
            t('settings.data.sensitiveScanned')
          )
        }
        disabled={busyAction !== null}
      >
        <KeyRound className="h-3 w-3" />
        {t('settings.data.rescanSensitive')}
      </Button>

      {status && <p className="text-[10px] text-muted-foreground">{status}</p>}
    </div>
  );
}

interface PathAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabledWithoutValue?: boolean;
}

interface DialogFilter {
  name: string;
  extensions: string[];
}

interface PathActionsProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  actions: PathAction[];
  busyAction: string | null;
}

function PathActions({ label, value, onChange, placeholder, actions, busyAction }: PathActionsProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-7 font-mono text-[11px]"
      />
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={action.onClick}
            disabled={(action.disabledWithoutValue !== false && value.trim() === '') || busyAction !== null}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
