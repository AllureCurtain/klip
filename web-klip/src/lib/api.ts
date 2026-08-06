import type {
  ClipboardItem, Tag, Snippet, SnippetInput, SourceRule, SourceRuleInput,
  AdvancedSearchQuery, SystemInfo, DiagnosticsInfo, StatsResponse,
  ImportSummary, BackupSummary, RestoreSummary, QaAnswer, ApiError,
} from '@/types';

const DEFAULT_BASE_URL = 'http://127.0.0.1:27717';

function getBaseUrl(): string {
  return localStorage.getItem('klip-api-url') || DEFAULT_BASE_URL;
}

export function setBaseUrl(url: string) {
  localStorage.setItem('klip-api-url', url.replace(/\/$/, ''));
}

export { getBaseUrl };

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
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      let err: ApiError = { error: 'unknown', message: `HTTP ${res.status}` };
      try {
        err = await res.json();
      } catch { /* ignore */ }
      throw err;
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

  // OpenAPI spec
  async getOpenApiSpec(): Promise<unknown> {
    return this.request('/openapi.json');
  }
}

export const api = new ApiClient();
