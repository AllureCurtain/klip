export type ContentType = 'text' | 'image' | 'file';

export interface Tag {
  id: number;
  name: string;
  color: string | null;
  created_at: number;
}

export interface ClipboardItem {
  id: number;
  content_type: ContentType;
  content: string;
  preview: string | null;
  hash: string;
  size: number;
  metadata: string | null;
  is_favorited: boolean;
  is_sensitive: boolean;
  sensitivity_reason: string | null;
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
