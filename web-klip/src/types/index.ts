export type ContentType = 'text' | 'image' | 'file';

export interface Tag {
  id: number;
  name: string;
  color: string | null;
  created_at: number;
}

export interface ClipboardFormat {
  format: 'text' | 'html' | 'rtf';
  content: string;
}

export type OcrStatus = 'pending' | 'completed' | 'failed';

export interface OcrState {
  status: OcrStatus;
  text: string;
  error: string | null;
  updated_at: number;
}

/// On-demand image links for image clipboard items (see GET /api/clipboard/:id/image).
export interface ImageRef {
  url: string;
  thumbnail_url: string;
  width?: number | null;
  height?: number | null;
  size: number;
}

export interface ClipboardItem {
  id: number;
  content_type: ContentType;
  /** Full text/file content. Omitted for image items — use image_ref instead. */
  content?: string;
  preview: string | null;
  hash: string;
  size: number;
  metadata: string | null;
  source_application: string | null;
  source_window_title: string | null;
  custom_title: string | null;
  note: string | null;
  is_favorited: boolean;
  is_sensitive: boolean;
  sensitivity_reason: string | null;
  formats: ClipboardFormat[];
  ocr: OcrState | null;
  image_ref: ImageRef | null;
  tags: Tag[];
  created_at: number;
  last_used_at: number;
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

export interface AdvancedSearchQuery {
  query: string;
  contentType?: ContentType;
  favoriteOnly: boolean;
  sensitiveOnly?: boolean;
  tagId?: number;
  exactMatch: boolean;
  createdAfter?: number;
  createdBefore?: number;
  limit: number;
  offset: number;
}

export interface SystemInfo {
  platform: string;
  version: string;
  app_version: string;
}

export interface DiagnosticsInfo {
  platform: string;
  app_version: string;
  data_dir: string;
  db_path: string;
  log_dir: string;
}

export interface WindowStatus {
  exists: boolean;
  visible: boolean;
  minimized: boolean;
  maximized: boolean;
  focused: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type HealthCheckStatus = 'ok' | 'degraded' | 'error';

export interface HealthCheck {
  id: 'sqlite_integrity' | 'search_index' | 'data_dir_usage';
  label: string;
  status: HealthCheckStatus;
  summary: string;
  details: Record<string, unknown>;
}

export interface HealthReport {
  status: HealthCheckStatus;
  generated_at: number;
  checks: HealthCheck[];
}

export interface StatsResponse {
  total_items: number;
  text_count: number;
  image_count: number;
  file_count: number;
  favorite_count: number;
  sensitive_count: number;
  tag_count: number;
  snippet_count: number;
  source_rule_count: number;
  total_size_bytes: number;
  db_size_bytes: number;
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

export interface QaAnswer {
  answer: string;
  provider: string;
  model: string;
  context_count: number;
  context: QaContextItem[];
}

export interface QaContextItem {
  id: number;
  preview: string;
  score: number;
}

/** Frames emitted by POST /api/qa/ask/stream (text/event-stream). */
export type QaStreamEvent =
  | { type: 'context'; context_count: number; items: QaContextItem[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; provider: string; model: string; context_count: number }
  | { type: 'error'; error: string; message: string };

export interface ApiError {
  error: string;
  message: string;
}

export interface SseEvent {
  type: string;
  timestamp: number;
  data: unknown;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export type AuthState = 'unknown' | 'ok' | 'unauthorized';
