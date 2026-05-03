export interface ClipboardItem {
  id: number;
  content_type: 'text' | 'image' | 'file';
  content: string;
  preview: string | null;
  hash: string;
  size: number;
  is_favorited: boolean;
  created_at: number;
  last_used_at: number;
}

export interface AppConfig {
  max_history_count: number;
  hotkey_toggle_window: string;
  hotkey_quick_paste_prefix: string;
  auto_start: boolean;
  close_to_tray: boolean;
  show_in_tray: boolean;
  window_width: number;
  window_height: number;
  search_debounce_ms: number;
}

export interface SystemInfo {
  platform: 'windows' | 'macos' | 'linux';
  version: string;
  app_version: string;
}

export type ContentType = 'text' | 'image' | 'file';
