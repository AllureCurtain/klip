import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ClipboardItem, SystemInfo } from '@/types';

// 剪贴板 API
export const clipboardApi = {
  getList: (limit = 100, offset = 0) =>
    invoke<ClipboardItem[]>('get_clipboard_list', { limit, offset }),

  search: (query: string, contentType?: string, limit = 100) =>
    invoke<ClipboardItem[]>('search_clipboard', { query, contentType, limit }),

  getById: (id: number) =>
    invoke<ClipboardItem | null>('get_clipboard_by_id', { id }),

  delete: (id: number) => invoke('delete_clipboard_item', { id }),

  copy: (id: number) => invoke('copy_to_clipboard', { id }),

  paste: (id: number) => invoke('paste_from_clipboard', { id }),

  toggleFavorite: (id: number) =>
    invoke<ClipboardItem>('toggle_favorite', { id }),

  clear: () => invoke('clear_clipboard_history'),
};

// 配置 API
export const configApi = {
  get: (key: string) => invoke<string | null>('get_config', { key }),

  getAll: () => invoke<Record<string, string>>('get_all_config'),

  set: (key: string, value: string) =>
    invoke('set_config', { key, value }),
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
};

// 事件监听
export const onClipboardUpdated = (callback: (item: ClipboardItem) => void) =>
  listen('clipboard-updated', (event) => callback(event.payload as ClipboardItem));

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
