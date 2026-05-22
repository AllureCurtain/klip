/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataManagementView } from './DataManagementView';
import { useConfigStore } from '@/stores/configStore';

const storeMocks = vi.hoisted(() => ({
  tags: [] as Array<{ id: number; name: string; color: string | null; created_at: number }>,
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  exportJson: vi.fn(),
  exportCsv: vi.fn(),
  importJson: vi.fn(),
  importCsv: vi.fn(),
  backupDatabase: vi.fn(),
  restoreDatabase: vi.fn(),
  rescanSensitive: vi.fn(),
  fetchItems: vi.fn(),
  fetchTags: vi.fn(),
}));

const dialogMocks = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: dialogMocks.open,
  save: dialogMocks.save,
}));

vi.mock('@/stores', () => ({
  useClipboardStore: () => storeMocks,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => {
      const dict: Record<string, string> = {
        'settings.data.tags': 'Tags and groups',
        'settings.data.skipSensitive': 'Skip sensitive clipboard content',
        'settings.data.skipSensitiveDesc': 'Do not save history when passwords, keys, or high-entropy tokens are detected',
        'settings.data.maskSensitivePreviews': 'Hide sensitive previews',
        'settings.data.maskSensitivePreviewsDesc': 'Show a masked placeholder for history items marked as sensitive',
        'settings.data.tagName': 'Tag name',
        'settings.data.tagColor': 'Tag color',
        'settings.data.createTag': 'Create tag',
        'settings.data.deleteTag': 'Delete {{name}}',
        'settings.data.json': 'JSON import/export path',
        'settings.data.csv': 'CSV import/export path',
        'settings.data.backup': 'Database backup path',
        'settings.data.chooseExportPath': 'Save to...',
        'settings.data.chooseImportPath': 'Choose file...',
        'settings.data.chooseBackupPath': 'Back up to...',
        'settings.data.chooseRestorePath': 'Choose backup...',
        'settings.data.export': 'Export',
        'settings.data.import': 'Import',
        'settings.data.backupNow': 'Backup',
        'settings.data.restore': 'Restore',
        'settings.data.exported': 'Export completed',
        'settings.data.imported': 'Import completed',
        'settings.data.backedUp': 'Backup completed',
        'settings.data.restored': 'Restore completed',
        'settings.data.restoreConfirm': 'Restore this database backup? The current database will be saved as a pre-restore backup first.',
        'settings.data.restoredWithBackup': 'Restore completed ({{size}}). Pre-restore backup: {{backupPath}}',
        'settings.data.rescanSensitive': 'Rescan sensitive content',
        'settings.data.sensitiveScanned': 'Sensitive content scan completed',
      };
      const label = dict[key] ?? key;
      return vars
        ? label.replace(/\{\{(\w+)\}\}/g, (_match, name) => String(vars[name] ?? ''))
        : label;
    },
  }),
}));

describe('DataManagementView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConfigStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        sensitive_capture_policy: 'flag',
        mask_sensitive_previews: true,
      },
    }));
    storeMocks.tags = [
      { id: 1, name: 'Work', color: '#14b8a6', created_at: 1 },
    ];
    storeMocks.createTag.mockResolvedValue({ id: 2, name: 'Personal', color: '#f97316', created_at: 2 });
    storeMocks.deleteTag.mockResolvedValue(undefined);
    storeMocks.exportJson.mockResolvedValue({ path: 'C:\\tmp\\export.json', size: 123 });
    storeMocks.exportCsv.mockResolvedValue({ path: 'C:\\tmp\\export.csv', size: 123 });
    storeMocks.importJson.mockResolvedValue({ imported: 1, skipped: 0 });
    storeMocks.importCsv.mockResolvedValue({ imported: 1, skipped: 0 });
    storeMocks.backupDatabase.mockResolvedValue({ path: 'C:\\tmp\\backup.db', size: 1024 });
    storeMocks.restoreDatabase.mockResolvedValue({
      path: 'C:\\tmp\\restore.db',
      size: 2048,
      pre_restore_backup_path: 'C:\\tmp\\current.db.pre-restore.bak',
      pre_restore_backup_size: 1024,
    });
    storeMocks.rescanSensitive.mockResolvedValue(3);
    dialogMocks.open.mockResolvedValue('C:\\tmp\\chosen.json');
    dialogMocks.save.mockResolvedValue('C:\\tmp\\chosen.json');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('toggles sensitive content switches through the config store', () => {
    render(<DataManagementView />);

    fireEvent.click(screen.getByRole('switch', { name: 'Skip sensitive clipboard content' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Hide sensitive previews' }));

    expect(useConfigStore.getState().config.sensitive_capture_policy).toBe('skip');
    expect(useConfigStore.getState().config.mask_sensitive_previews).toBe(false);
  });

  it('creates and deletes tags', async () => {
    render(<DataManagementView />);

    fireEvent.change(screen.getByPlaceholderText('Tag name'), {
      target: { value: 'Personal' },
    });
    fireEvent.change(screen.getByLabelText('Tag color'), {
      target: { value: '#f97316' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create tag' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(storeMocks.createTag).toHaveBeenCalledWith('Personal', '#f97316');
    expect((screen.getByPlaceholderText('Tag name') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Work' }));
    expect(storeMocks.deleteTag).toHaveBeenCalledWith(1);
  });

  it('chooses export paths and restores after confirmation', async () => {
    render(<DataManagementView />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Save to...' })[0]);
    await act(async () => {
      await Promise.resolve();
    });

    expect(dialogMocks.save).toHaveBeenCalled();
    expect(screen.getByDisplayValue('C:\\tmp\\chosen.json')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Export' })[0]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(storeMocks.exportJson).toHaveBeenCalledWith('C:\\tmp\\chosen.json');

    dialogMocks.open.mockResolvedValueOnce('C:\\tmp\\chosen.db');
    fireEvent.click(screen.getAllByRole('button', { name: 'Choose backup...' })[0]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByDisplayValue('C:\\tmp\\chosen.db')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.confirm).toHaveBeenCalled();
    expect(storeMocks.restoreDatabase).toHaveBeenCalledWith('C:\\tmp\\chosen.db');
    expect(storeMocks.fetchItems).toHaveBeenCalled();
    expect(storeMocks.fetchTags).toHaveBeenCalled();
  });
});
