export interface ClipboardItem {
  id: number;
  content_type: 'text' | 'image' | 'file';
  content: string;
  preview: string | null;
  hash: string;
  size: number;
  metadata: string | null;
  source_application: string | null;
  source_window_title: string | null;
  is_favorited: boolean;
  is_sensitive: boolean;
  sensitivity_reason: string | null;
  formats: ClipboardFormat[];
  ocr: ClipboardOcr | null;
  tags: Tag[];
  created_at: number;
  last_used_at: number;
}

export interface ClipboardFormat {
  format: 'text' | 'html' | 'rtf';
  content: string;
}

export interface ClipboardOcr {
  status: 'pending' | 'completed' | 'failed';
  text: string;
  error: string | null;
  updated_at: number;
}

export type ClipboardContentAction =
  | { kind: 'open_url'; target: string }
  | { kind: 'compose_email'; target: string }
  | { kind: 'open_path'; target: string }
  | { kind: 'reveal_path'; target: string }
  | { kind: 'copy_path'; target: string }
  | { kind: 'copy_file_name'; target: string };

export interface Tag {
  id: number;
  name: string;
  color: string | null;
  created_at: number;
}

export interface Snippet {
  id: number;
  title: string;
  content: string;
  tag_id: number | null;
  is_favorited: boolean;
  created_at: number;
  updated_at: number;
}

export interface SnippetInput {
  title: string;
  content: string;
  tagId: number | null;
  isFavorited: boolean;
}

export interface SourceRule {
  id: number;
  match_type: 'process' | 'title' | 'any';
  pattern: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface SourceRuleInput {
  matchType: 'process' | 'title' | 'any';
  pattern: string;
  enabled: boolean;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
}

export interface BackupSummary {
  path: string;
  size: number;
}

export interface RestoreSummary {
  path: string;
  size: number;
  pre_restore_backup_path: string;
  pre_restore_backup_size: number;
}

export interface ClipboardQueryOptions {
  contentType?: ContentType | null;
  favoriteOnly?: boolean;
  tagId?: number | null;
  sensitiveOnly?: boolean | null;
  exactMatch?: boolean;
  createdAfter?: number | null;
  createdBefore?: number | null;
  limit?: number;
  offset?: number;
}

export interface AdvancedSearchQuery {
  query: string;
  contentType?: ContentType | null;
  favoriteOnly?: boolean;
  sensitiveOnly?: boolean | null;
  tagId?: number | null;
  exactMatch?: boolean;
  createdAfter?: number | null;
  createdBefore?: number | null;
  limit?: number;
  offset?: number;
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
  window_width: number;
  window_height: number;
  search_debounce_ms: number;
  language: string;
  sensitive_capture_policy: 'flag' | 'skip';
  mask_sensitive_previews: boolean;
  clipboard_monitor_enabled: boolean;
  privacy_mode_until: number;
  updates_enabled: boolean;
  update_feed_url: string;
  encryption_enabled: boolean;
  encryption_status: string;
  sync_folder: string;
  plugin_folder: string;
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

export type AppErrorCode =
  | 'not_found'
  | 'database'
  | 'clipboard'
  | 'hotkey'
  | 'invalid_input'
  | 'window'
  | 'system';

export interface AppError {
  code: AppErrorCode;
  message: string;
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as AppError).code === 'string' &&
    typeof (value as AppError).message === 'string'
  );
}

export function getErrorMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
