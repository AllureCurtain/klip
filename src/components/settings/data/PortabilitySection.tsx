import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DatabaseBackup, Download, Upload } from 'lucide-react';
import { useClipboardStore } from '@/stores';
import { PathActions } from './PathActions';
import type { useSettingsDataActions } from './settingsDataActions';
import {
  CSV_FILTER,
  DB_FILTER,
  JSON_FILTER,
  chooseOpenPath,
  chooseSavePath,
  formatBytes,
} from './settingsDataActions';

type DataActions = ReturnType<typeof useSettingsDataActions>;

interface PortabilitySectionProps {
  actions: Pick<DataActions, 'busyAction' | 'run' | 'setStatus'>;
}

export function PortabilitySection({ actions }: PortabilitySectionProps) {
  const { t } = useTranslation();
  const [portabilityOpen, setPortabilityOpen] = useState(false);
  const [jsonPath, setJsonPath] = useState('');
  const [csvPath, setCsvPath] = useState('');
  const [backupPath, setBackupPath] = useState('');
  const {
    exportJson,
    exportCsv,
    importJson,
    importCsv,
    backupDatabase,
    restoreDatabase,
    fetchItems,
    fetchTags,
  } = useClipboardStore();

  const handleRestoreDatabase = async () => {
    if (!window.confirm(t('settings.data.restoreConfirm'))) return;
    const summary = await actions.run('restore-db', () => restoreDatabase(backupPath), '');
    if (summary) {
      await Promise.all([fetchItems(), fetchTags()]);
      actions.setStatus(
        t('settings.data.restoredWithBackup', {
          size: formatBytes(summary.size),
          backupPath: summary.pre_restore_backup_path,
        })
      );
    }
  };

  const handleImportJson = async () => {
    const summary = await actions.run(
      'import-json',
      () => importJson(jsonPath),
      t('settings.data.imported')
    );
    if (summary) {
      await Promise.all([fetchItems(), fetchTags()]);
    }
  };

  const handleImportCsv = async () => {
    const summary = await actions.run(
      'import-csv',
      () => importCsv(csvPath),
      t('settings.data.imported')
    );
    if (summary) {
      await Promise.all([fetchItems(), fetchTags()]);
    }
  };

  return (
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
        <div id="data-portability-panel" className="space-y-4 border-t px-3 py-3">
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
                onClick: () =>
                  actions.run(
                    'export-json',
                    () => exportJson(jsonPath),
                    t('settings.data.exported')
                  ),
              },
              {
                label: t('settings.data.import'),
                icon: <Upload className="h-3 w-3" />,
                onClick: handleImportJson,
              },
            ]}
            busyAction={actions.busyAction}
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
                onClick: () =>
                  actions.run(
                    'export-csv',
                    () => exportCsv(csvPath),
                    t('settings.data.exported')
                  ),
              },
              {
                label: t('settings.data.import'),
                icon: <Upload className="h-3 w-3" />,
                onClick: handleImportCsv,
              },
            ]}
            busyAction={actions.busyAction}
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
                onClick: () =>
                  actions.run(
                    'backup-db',
                    () => backupDatabase(backupPath),
                    t('settings.data.backedUp')
                  ),
              },
              {
                label: t('settings.data.restore'),
                icon: <Upload className="h-3 w-3" />,
                onClick: handleRestoreDatabase,
              },
            ]}
            busyAction={actions.busyAction}
          />
        </div>
      )}
    </section>
  );
}
