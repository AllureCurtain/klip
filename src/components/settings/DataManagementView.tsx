import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  ClipboardCopy,
  DatabaseBackup,
  Download,
  KeyRound,
  Plus,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useClipboardStore, useProductivityStore } from '@/stores';
import { useConfigStore } from '@/stores/configStore';
import { Switch } from '@/components/ui/switch';
import type { SourceRuleInput } from '@/types';

const DEFAULT_TAG_COLOR = '#14b8a6';

const JSON_FILTER = [{ name: 'JSON', extensions: ['json'] }];
const CSV_FILTER = [{ name: 'CSV', extensions: ['csv'] }];
const DB_FILTER = [{ name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3'] }];

export function DataManagementView() {
  const { t } = useTranslation();
  const {
    config,
    setSensitiveCapturePolicy,
    setMaskSensitivePreviews,
    setClipboardMonitorEnabled,
    setUpdatesEnabled,
    setUpdateFeedUrl,
    setEncryptionEnabled,
    setSyncFolder,
    setPluginFolder,
  } = useConfigStore();
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
  const {
    snippets,
    sourceRules,
    fetchProductivity,
    createSnippet,
    deleteSnippet,
    createSourceRule,
    setSourceRuleEnabled,
    deleteSourceRule,
  } = useProductivityStore();
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(DEFAULT_TAG_COLOR);
  const [snippetTitle, setSnippetTitle] = useState('');
  const [snippetContent, setSnippetContent] = useState('');
  const [sourceRuleType, setSourceRuleType] = useState<SourceRuleInput['matchType']>('process');
  const [sourceRulePattern, setSourceRulePattern] = useState('');
  const [jsonPath, setJsonPath] = useState('');
  const [csvPath, setCsvPath] = useState('');
  const [backupPath, setBackupPath] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [portabilityOpen, setPortabilityOpen] = useState(false);

  useEffect(() => {
    void fetchProductivity();
  }, [fetchProductivity]);

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

  const handleCreateSnippet = async () => {
    const snippet = await createSnippet({
      title: snippetTitle,
      content: snippetContent,
      tagId: null,
      isFavorited: false,
    });
    if (snippet) {
      setSnippetTitle('');
      setSnippetContent('');
      setStatus(t('settings.data.snippetCreated', { title: snippet.title }));
    }
  };

  const handleCreateSourceRule = async () => {
    const rule = await createSourceRule({
      matchType: sourceRuleType,
      pattern: sourceRulePattern,
      enabled: true,
    });
    if (rule) {
      setSourceRulePattern('');
      setStatus(t('settings.data.sourceRuleCreated', { pattern: rule.pattern }));
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

  const handleImportJson = async () => {
    const summary = await run('import-json', () => importJson(jsonPath), t('settings.data.imported'));
    if (summary) {
      await Promise.all([fetchItems(), fetchTags()]);
    }
  };

  const handleImportCsv = async () => {
    const summary = await run('import-csv', () => importCsv(csvPath), t('settings.data.imported'));
    if (summary) {
      await Promise.all([fetchItems(), fetchTags()]);
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
            aria-label={t('settings.data.createTag')}
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

      <section className="space-y-2">
        <Label className="text-xs">{t('settings.data.snippets')}</Label>
        <div className="grid gap-2">
          <Label htmlFor="snippet-title" className="sr-only">
            {t('settings.data.snippetTitle')}
          </Label>
          <Input
            id="snippet-title"
            value={snippetTitle}
            onChange={(event) => setSnippetTitle(event.target.value)}
            placeholder={t('settings.data.snippetTitle')}
            className="h-7 text-xs"
          />
          <Label htmlFor="snippet-content" className="sr-only">
            {t('settings.data.snippetContent')}
          </Label>
          <Input
            id="snippet-content"
            value={snippetContent}
            onChange={(event) => setSnippetContent(event.target.value)}
            placeholder={t('settings.data.snippetContent')}
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            className="h-7 justify-self-start text-xs"
            onClick={handleCreateSnippet}
            disabled={snippetTitle.trim() === '' || snippetContent.trim() === ''}
          >
            <Plus className="h-3 w-3" />
            {t('settings.data.createSnippet')}
          </Button>
        </div>
        <div className="space-y-1">
          {snippets.map((snippet) => (
            <div
              key={snippet.id}
              className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{snippet.title}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {snippet.content}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t('settings.data.copySnippet', { title: snippet.title })}
                onClick={() => void copyText(snippet.content)}
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-destructive"
                aria-label={t('settings.data.deleteSnippet', { title: snippet.title })}
                onClick={() => void deleteSnippet(snippet.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-2">
        <Label className="text-xs">{t('settings.data.sourceRules')}</Label>
        <div className="grid grid-cols-[96px_1fr_auto] gap-2">
          <Label htmlFor="source-rule-type" className="sr-only">
            {t('settings.data.sourceRuleType')}
          </Label>
          <select
            id="source-rule-type"
            value={sourceRuleType}
            onChange={(event) =>
              setSourceRuleType(event.target.value as SourceRuleInput['matchType'])
            }
            className="h-7 rounded-full border border-input bg-card/60 px-2 text-xs"
          >
            <option value="process">{t('settings.data.sourceRuleProcess')}</option>
            <option value="title">{t('settings.data.sourceRuleTitle')}</option>
            <option value="any">{t('settings.data.sourceRuleAny')}</option>
          </select>
          <Label htmlFor="source-rule-pattern" className="sr-only">
            {t('settings.data.sourceRulePattern')}
          </Label>
          <Input
            id="source-rule-pattern"
            value={sourceRulePattern}
            onChange={(event) => setSourceRulePattern(event.target.value)}
            placeholder={t('settings.data.sourceRulePattern')}
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            className="h-7"
            onClick={handleCreateSourceRule}
            disabled={sourceRulePattern.trim() === ''}
          >
            <Plus className="h-3 w-3" />
            <span className="sr-only">{t('settings.data.createSourceRule')}</span>
          </Button>
        </div>
        <div className="space-y-1">
          {sourceRules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5"
            >
              <Badge variant="outline" className="text-[10px]">
                {rule.match_type}
              </Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                {rule.pattern}
              </span>
              <Switch
                aria-label={t('settings.data.toggleSourceRule', { pattern: rule.pattern })}
                checked={rule.enabled}
                onCheckedChange={(enabled) => setSourceRuleEnabled(rule.id, enabled)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-destructive"
                aria-label={t('settings.data.deleteSourceRule', { pattern: rule.pattern })}
                onClick={() => void deleteSourceRule(rule.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <Separator />

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

      <Separator />

      <section className="rounded-md border bg-muted/20">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
          aria-expanded={portabilityOpen}
          aria-controls="data-portability-panel"
          onClick={() => setPortabilityOpen((open) => !open)}
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium">
              {t('settings.data.portability')}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              {t('settings.data.portabilityDesc')}
            </span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            {portabilityOpen ? t('common.close') : t('settings.data.openAdvanced')}
          </span>
        </button>

        {portabilityOpen && (
          <div
            id="data-portability-panel"
            className="space-y-4 border-t px-3 py-3"
          >
            <PathActions
              id="data-json-path"
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
                  onClick: handleImportJson,
                },
              ]}
              busyAction={busyAction}
            />

            <PathActions
              id="data-csv-path"
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
                  onClick: handleImportCsv,
                },
              ]}
              busyAction={busyAction}
            />

            <PathActions
              id="data-backup-path"
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
          </div>
        )}
      </section>

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
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  actions: PathAction[];
  busyAction: string | null;
}

function PathActions({ id, label, value, onChange, placeholder, actions, busyAction }: PathActionsProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input
        id={id}
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
      <Label htmlFor={id} className="text-xs">{label}</Label>
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

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard?.writeText(value);
}
