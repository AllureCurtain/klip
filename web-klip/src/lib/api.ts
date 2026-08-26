import type {
  ClipboardItem, Tag, Snippet, SnippetInput, SourceRule, SourceRuleInput,
  AdvancedSearchQuery, SystemInfo, DiagnosticsInfo, StatsResponse,
  ImportSummary, BackupSummary, RestoreSummary, QaAnswer, ApiError,
  OcrState, WindowStatus, HealthReport, QaStreamEvent, QaContextItem,
} from '@/types';

const DEFAULT_BASE_URL = 'http://127.0.0.1:27717';
const TOKEN_STORAGE_KEY = 'klip-api-token';

function getBaseUrl(): string {
  return localStorage.getItem('klip-api-url') || DEFAULT_BASE_URL;
}

export function setBaseUrl(url: string) {
  localStorage.setItem('klip-api-url', url.replace(/\/$/, ''));
}

export { getBaseUrl };

export function getAccessToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

export function setAccessToken(token: string) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  authListeners.forEach((listener) => listener());
}

/**
 * Append the access token as a query parameter. Used for channels that cannot
 * set request headers: <img src> and EventSource. The server accepts
 * ?access_token= as a fallback to the Authorization header.
 */
export function withAccessToken(url: string): string {
  const token = getAccessToken();
  if (!token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}access_token=${encodeURIComponent(token)}`;
}

export function imageUrl(item: Pick<ClipboardItem, 'id' | 'image_ref'>): string {
  const path = item.image_ref?.url ?? `/api/clipboard/${item.id}/image`;
  return withAccessToken(`${getBaseUrl()}${path}`);
}

export function thumbnailUrl(item: Pick<ClipboardItem, 'id' | 'image_ref'>): string {
  const path = item.image_ref?.thumbnail_url ?? `/api/clipboard/${item.id}/thumbnail`;
  return withAccessToken(`${getBaseUrl()}${path}`);
}

type AuthFailureListener = () => void;
const authListeners: AuthFailureListener[] = [];

export function onAuthFailure(listener: AuthFailureListener): () => void {
  authListeners.push(listener);
  return () => {
    const index = authListeners.indexOf(listener);
    if (index >= 0) authListeners.splice(index, 1);
  };
}

function notifyAuthFailure() {
  authListeners.forEach((listener) => listener());
}

class ApiErrorResponse extends Error {
  status: number;
  body: ApiError;
  constructor(status: number, body: ApiError) {
    super(body.message || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export { ApiErrorResponse };

class ApiClient {
  private base: string;

  constructor() {
    this.base = getBaseUrl();
  }

  setBaseUrl(url: string) {
    this.base = url.replace(/\/$/, '');
    setBaseUrl(this.base);
  }

  getBaseUrl() {
    return this.base;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.base}${path}`;
    const token = getAccessToken();
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (res.status === 401) {
      notifyAuthFailure();
    }

    if (!res.ok) {
      let err: ApiError = { error: 'unknown', message: `HTTP ${res.status}` };
      try {
        err = await res.json();
      } catch { /* keep default */ }
      throw new ApiErrorResponse(res.status, err);
    }

    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return undefined as T;
    }
    return res.json();
  }

  // Health
  async health(): Promise<{ status: string; version: string }> {
    return this.request('/api/health');
  }

  // Clipboard
  async listClipboard(params: {
    limit?: number; offset?: number; contentType?: string;
    favoriteOnly?: boolean; tagId?: number;
  } = {}): Promise<ClipboardItem[]> {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    if (params.contentType) q.set('contentType', params.contentType);
    if (params.favoriteOnly) q.set('favoriteOnly', 'true');
    if (params.tagId) q.set('tagId', String(params.tagId));
    return this.request(`/api/clipboard?${q}`);
  }

  async searchClipboard(q: string, params: {
    limit?: number; offset?: number; contentType?: string;
    favoriteOnly?: boolean; tagId?: number;
  } = {}): Promise<ClipboardItem[]> {
    const sq = new URLSearchParams({ q });
    if (params.limit) sq.set('limit', String(params.limit));
    if (params.offset) sq.set('offset', String(params.offset));
    if (params.contentType) sq.set('contentType', params.contentType);
    if (params.favoriteOnly) sq.set('favoriteOnly', 'true');
    if (params.tagId) sq.set('tagId', String(params.tagId));
    return this.request(`/api/clipboard/search?${sq}`);
  }

  async advancedSearch(body: AdvancedSearchQuery): Promise<ClipboardItem[]> {
    return this.request('/api/clipboard/search/advanced', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getClipboard(id: number): Promise<ClipboardItem> {
    return this.request(`/api/clipboard/${id}`);
  }

  async deleteClipboard(id: number): Promise<void> {
    return this.request(`/api/clipboard/${id}`, { method: 'DELETE' });
  }

  async clearClipboard(): Promise<void> {
    return this.request('/api/clipboard', { method: 'DELETE' });
  }

  async toggleFavorite(id: number): Promise<ClipboardItem> {
    return this.request(`/api/clipboard/${id}/favorite`, { method: 'POST' });
  }

  async copyItem(id: number): Promise<void> {
    return this.request(`/api/clipboard/${id}/copy`, { method: 'POST' });
  }

  async pasteItem(id: number): Promise<void> {
    return this.request(`/api/clipboard/${id}/paste`, { method: 'POST' });
  }

  async batchDelete(ids: number[]): Promise<{ count: number }> {
    return this.request('/api/clipboard/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  async batchFavorite(ids: number[], isFavorited: boolean): Promise<{ count: number }> {
    return this.request('/api/clipboard/batch-favorite', {
      method: 'POST',
      body: JSON.stringify({ ids, isFavorited }),
    });
  }

  async rescanSensitive(): Promise<{ count: number }> {
    return this.request('/api/clipboard/rescan-sensitive', { method: 'POST' });
  }

  // OCR
  async getOcr(id: number): Promise<OcrState> {
    return this.request(`/api/clipboard/${id}/ocr`);
  }

  async triggerOcr(id: number): Promise<OcrState> {
    return this.request(`/api/clipboard/${id}/ocr`, { method: 'POST' });
  }

  // Tags
  async listTags(): Promise<Tag[]> {
    return this.request('/api/tags');
  }

  async createTag(name: string, color?: string): Promise<Tag> {
    return this.request('/api/tags', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    });
  }

  async deleteTag(id: number): Promise<void> {
    return this.request(`/api/tags/${id}`, { method: 'DELETE' });
  }

  async assignTag(itemId: number, tagId: number): Promise<void> {
    return this.request(`/api/clipboard/${itemId}/tags/${tagId}`, { method: 'POST' });
  }

  async removeTag(itemId: number, tagId: number): Promise<void> {
    return this.request(`/api/clipboard/${itemId}/tags/${tagId}`, { method: 'DELETE' });
  }

  // Snippets
  async listSnippets(): Promise<Snippet[]> {
    return this.request('/api/snippets');
  }

  async searchSnippets(q: string): Promise<Snippet[]> {
    return this.request(`/api/snippets/search?q=${encodeURIComponent(q)}`);
  }

  async createSnippet(input: SnippetInput): Promise<Snippet> {
    return this.request('/api/snippets', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateSnippet(id: number, input: SnippetInput): Promise<Snippet> {
    return this.request(`/api/snippets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  async deleteSnippet(id: number): Promise<void> {
    return this.request(`/api/snippets/${id}`, { method: 'DELETE' });
  }

  // Source rules
  async listSourceRules(): Promise<SourceRule[]> {
    return this.request('/api/source-rules');
  }

  async createSourceRule(input: SourceRuleInput): Promise<SourceRule> {
    return this.request('/api/source-rules', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateSourceRule(id: number, input: SourceRuleInput): Promise<SourceRule> {
    return this.request(`/api/source-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  async setSourceRuleEnabled(id: number, enabled: boolean): Promise<SourceRule> {
    return this.request(`/api/source-rules/${id}/enabled`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  }

  async deleteSourceRule(id: number): Promise<void> {
    return this.request(`/api/source-rules/${id}`, { method: 'DELETE' });
  }

  // Config
  async getConfig(): Promise<Record<string, string>> {
    return this.request('/api/config');
  }

  async getConfigKey(key: string): Promise<string | null> {
    return this.request(`/api/config/${encodeURIComponent(key)}`);
  }

  async setConfigKey(key: string, value: string): Promise<void> {
    return this.request(`/api/config/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  }

  async setConfigMany(entries: Record<string, string>): Promise<void> {
    return this.request('/api/config', {
      method: 'PUT',
      body: JSON.stringify(entries),
    });
  }

  // Window
  async toggleWindow(): Promise<void> {
    return this.request('/api/window/toggle', { method: 'POST' });
  }
  async showWindow(): Promise<void> {
    return this.request('/api/window/show', { method: 'POST' });
  }
  async hideWindow(): Promise<void> {
    return this.request('/api/window/hide', { method: 'POST' });
  }
  async windowStatus(): Promise<WindowStatus> {
    return this.request('/api/window/status');
  }

  // Autostart
  async getAutostart(): Promise<boolean> {
    return this.request('/api/autostart');
  }
  async setAutostart(enabled: boolean): Promise<void> {
    return this.request('/api/autostart', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
  }

  // System
  async getSystemInfo(): Promise<SystemInfo> {
    return this.request('/api/system/info');
  }
  async getDiagnostics(): Promise<DiagnosticsInfo> {
    return this.request('/api/system/diagnostics');
  }
  async getHealthReport(): Promise<HealthReport> {
    return this.request('/api/diagnostics/health');
  }

  // Stats
  async getStats(): Promise<StatsResponse> {
    return this.request('/api/stats');
  }

  // Export/Import
  async exportJson(path: string): Promise<BackupSummary> {
    return this.request('/api/export/json', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }
  async exportCsv(path: string): Promise<BackupSummary> {
    return this.request('/api/export/csv', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }
  async importJson(path: string): Promise<ImportSummary> {
    return this.request('/api/import/json', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }
  async importCsv(path: string): Promise<ImportSummary> {
    return this.request('/api/import/csv', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }
  async backupDatabase(path: string): Promise<BackupSummary> {
    return this.request('/api/backup', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }
  async restoreDatabase(path: string): Promise<RestoreSummary> {
    return this.request('/api/restore', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }

  // QA
  async qaAsk(question: string): Promise<QaAnswer> {
    return this.request('/api/qa/ask', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  }

  /**
   * Streaming QA: POST /api/qa/ask/stream, parse the text/event-stream body
   * frame by frame. `handlers` receive parsed events; `signal` aborts.
   * Resolves when the stream ends; rejects on network/parse failure.
   */
  async qaAskStream(
    question: string,
    handlers: {
      onContext?: (items: QaContextItem[], contextCount: number) => void;
      onDelta?: (text: string) => void;
      onDone?: (provider: string, model: string, contextCount: number) => void;
      onError?: (error: string, message: string) => void;
    },
    signal?: AbortSignal,
  ): Promise<void> {
    const token = getAccessToken();
    const res = await fetch(`${this.base}/api/qa/ask/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ question }),
      signal,
    });

    if (res.status === 401) {
      notifyAuthFailure();
      throw new ApiErrorResponse(401, { error: 'unauthorized', message: 'missing or invalid access token' });
    }
    if (!res.ok || !res.body) {
      let message = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        message = body.message ?? message;
      } catch { /* ignore */ }
      throw new Error(message);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const dispatch = (frame: { event: string; data: string }) => {
      if (!frame.event) return;
      let payload: Record<string, unknown> = {};
      try {
        payload = frame.data ? JSON.parse(frame.data) : {};
      } catch {
        payload = {};
      }
      const event = frame.event as QaStreamEvent['type'];
      switch (event) {
        case 'context':
          handlers.onContext?.(
            (payload.items as QaContextItem[]) ?? [],
            (payload.context_count as number) ?? 0,
          );
          break;
        case 'delta':
          handlers.onDelta?.((payload.text as string) ?? '');
          break;
        case 'done':
          handlers.onDone?.(
            (payload.provider as string) ?? '',
            (payload.model as string) ?? '',
            (payload.context_count as number) ?? 0,
          );
          break;
        case 'error':
          handlers.onError?.(
            (payload.error as string) ?? 'unknown',
            (payload.message as string) ?? 'unknown error',
          );
          break;
      }
    };

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator: number;
      // SSE frames are separated by a blank line.
      while ((separator = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const lines = raw.split('\n');
        let event = '';
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (event) dispatch({ event, data: dataLines.join('\n') });
      }
    }
    // Flush a final frame not terminated by a blank line.
    const tail = buffer.trim();
    if (tail) {
      const lines = tail.split('\n');
      let event = '';
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (event) dispatch({ event, data: dataLines.join('\n') });
    }
  }

  // OpenAPI spec
  async getOpenApiSpec(): Promise<unknown> {
    return this.request('/openapi.json');
  }
}

export const api = new ApiClient();
