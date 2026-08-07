import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  BackupSummary,
  AdvancedSearchQuery,
  ClipboardItem,
  ClipboardQueryOptions,
  DiagnosticsInfo,
  ImportSummary,
  RestoreSummary,
  Snippet,
  SnippetInput,
  SourceRule,
  SourceRuleInput,
  SystemInfo,
  Tag,
} from '@/types';

// 剪贴板 API
export const clipboardApi = {
  getList: (limit = 100, offset = 0) =>
    invoke<ClipboardItem[]>('get_clipboard_list', { limit, offset }),

  getListFiltered: ({
    contentType = null,
    favoriteOnly = false,
    tagId = null,
    limit = 100,
    offset = 0,
  }: ClipboardQueryOptions = {}) =>
    invoke<ClipboardItem[]>('get_clipboard_list_filtered', {
      contentType,
      favoriteOnly,
      tagId,
      limit,
      offset,
    }),

  search: (query: string, contentType?: string, limit = 100) =>
    invoke<ClipboardItem[]>('search_clipboard', { query, contentType, limit }),

  searchFiltered: (
    query: string,
    {
      contentType = null,
      favoriteOnly = false,
      tagId = null,
      limit = 100,
      offset = 0,
    }: ClipboardQueryOptions = {}
  ) =>
    invoke<ClipboardItem[]>('search_clipboard_filtered', {
      query,
      contentType,
      favoriteOnly,
      tagId,
      limit,
      offset,
    }),

  searchAdvanced: ({
    query,
    contentType = null,
    favoriteOnly = false,
    sensitiveOnly = null,
    tagId = null,
    exactMatch = false,
    createdAfter = null,
    createdBefore = null,
    limit = 100,
    offset = 0,
  }: AdvancedSearchQuery) =>
    invoke<ClipboardItem[]>('search_clipboard_advanced', {
      query: {
        query,
        contentType,
        favoriteOnly,
        sensitiveOnly,
        tagId,
        exactMatch,
        createdAfter,
        createdBefore,
        limit,
        offset,
      },
    }),

  getById: (id: number) =>
    invoke<ClipboardItem | null>('get_clipboard_by_id', { id }),

  delete: (id: number) => invoke('delete_clipboard_item', { id }),

  deleteMany: (ids: number[]) =>
    invoke<number>('delete_clipboard_items', { ids }),

  copy: (id: number) => invoke('copy_to_clipboard', { id }),

  copyPlainText: (id: number) =>
    invoke('copy_plain_text_to_clipboard', { id }),

  paste: (id: number) => invoke('paste_from_clipboard', { id }),

  pastePlainText: (id: number) =>
    invoke('paste_plain_text_from_clipboard', { id }),

  setVisibleItems: (ids: number[]) =>
    invoke('set_visible_clipboard_items', { ids }),

  toggleFavorite: (id: number) =>
    invoke<ClipboardItem>('toggle_favorite', { id }),

  setFavoriteForItems: (ids: number[], isFavorited: boolean) =>
    invoke<number>('set_favorite_for_items', { ids, isFavorited }),

  listTags: () => invoke<Tag[]>('list_tags'),

  createTag: (name: string, color?: string | null) =>
    invoke<Tag>('create_tag', { name, color }),

  deleteTag: (id: number) => invoke('delete_tag', { id }),

  assignTagToItem: (itemId: number, tagId: number) =>
    invoke('assign_tag_to_item', { itemId, tagId }),

  removeTagFromItem: (itemId: number, tagId: number) =>
    invoke('remove_tag_from_item', { itemId, tagId }),

  rescanSensitive: () => invoke<number>('rescan_sensitive_items'),

  exportJson: (path: string) =>
    invoke<BackupSummary>('export_clipboard_json', { path }),

  exportCsv: (path: string) =>
    invoke<BackupSummary>('export_clipboard_csv', { path }),

  importJson: (path: string) =>
    invoke<ImportSummary>('import_clipboard_json', { path }),

  importCsv: (path: string) =>
    invoke<ImportSummary>('import_clipboard_csv', { path }),

  backupDatabase: (path: string) =>
    invoke<BackupSummary>('backup_database', { path }),

  restoreDatabase: (path: string) =>
    invoke<RestoreSummary>('restore_database', { path }),

  clear: () => invoke('clear_clipboard_history'),
};

export const productApi = {
  listSnippets: () => invoke<Snippet[]>('list_snippets'),

  searchSnippets: (query: string) =>
    invoke<Snippet[]>('search_snippets', { query }),

  createSnippet: (input: SnippetInput) =>
    invoke<Snippet>('create_snippet', { input }),

  updateSnippet: (id: number, input: SnippetInput) =>
    invoke<Snippet>('update_snippet', { id, input }),

  deleteSnippet: (id: number) => invoke('delete_snippet', { id }),

  listSourceRules: () => invoke<SourceRule[]>('list_source_rules'),

  createSourceRule: (input: SourceRuleInput) =>
    invoke<SourceRule>('create_source_rule', { input }),

  updateSourceRule: (id: number, input: SourceRuleInput) =>
    invoke<SourceRule>('update_source_rule', { id, input }),

  setSourceRuleEnabled: (id: number, enabled: boolean) =>
    invoke<SourceRule>('set_source_rule_enabled', { id, enabled }),

  deleteSourceRule: (id: number) => invoke('delete_source_rule', { id }),
};

// 配置 API
export const configApi = {
  get: (key: string) => invoke<string | null>('get_config', { key }),

  getAll: () => invoke<Record<string, string>>('get_all_config'),

  set: (key: string, value: string) =>
    invoke('set_config', { key, value }),

  setMany: (entries: Array<[string, string]>) =>
    invoke('set_config_many', {
      entries: entries.map(([key, value]) => ({ key, value })),
    }),
};

// 系统 API
export const systemApi = {
  toggleWindow: () => invoke('toggle_window'),

  showWindow: () => invoke('show_window'),

  hideWindow: () => invoke('hide_window'),

  setAutoStart: (enabled: boolean) =>
    invoke('set_auto_start', { enabled }),

  isAutoStartEnabled: () => invoke<boolean>('is_auto_start_enabled'),

  getInfo: () => invoke<SystemInfo>('get_system_info'),

  getDiagnostics: () => invoke<DiagnosticsInfo>('get_diagnostics_info'),
};

// 事件监听
export const onClipboardUpdated = (callback: (item: ClipboardItem) => void) =>
  listen('clipboard-updated', (event) => callback(event.payload as ClipboardItem));

export const onClipboardItemUpdated = (callback: (item: ClipboardItem) => void) =>
  listen('clipboard-item-updated', (event) => callback(event.payload as ClipboardItem));

export const onClipboardCleared = (callback: () => void) =>
  listen('clipboard-cleared', () => callback());

export const onConfigChanged = (
  callback: (key: string, value: string) => void
) =>
  listen('config-changed', (event) => {
    const { key, value } = event.payload as { key: string; value: string };
    callback(key, value);
  });

export const onOpenSettings = (callback: () => void) =>
  listen('open-settings', () => callback());

export const onOpenAbout = (callback: () => void) =>
  listen('open-about', () => callback());
