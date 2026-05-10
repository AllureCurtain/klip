export interface ClipboardItem {
  id: number;
  content_type: 'text' | 'image' | 'file';
  content: string;
  preview: string | null;
  hash: string;
  size: number;
  metadata: string | null;
  is_favorited: boolean;
  created_at: number;
  last_used_at: number;
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
}

export interface FileItemSummary {
  name: string;
  is_dir: boolean;
  size: number;
}

export interface FileMetadata {
  file_count: number;
  /** Number of folders in the selection. Older items may not have this. */
  dir_count?: number;
  total_size: number;
  /** Up to 50 entries; truncated for very large selections. */
  items?: FileItemSummary[];
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
  platform: 'windows' | 'macos' | 'linux' | 'unknown';
  version: string;
  app_version: string;
}

export interface DiagnosticsInfo {
  platform: 'windows' | 'macos' | 'linux' | 'unknown';
  app_version: string;
  data_dir: string;
  db_path: string;
  log_dir: string;
}

export type ContentType = 'text' | 'image' | 'file';
