// Tests for the typed API client
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create a proper mock Response factory
function mockResponse(body: unknown, status = 200, ok = true, contentLength?: string) {
  return {
    ok,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-length') return contentLength ?? null;
        return null;
      },
    },
    json: async () => body,
  };
}

const mockFetch = vi.fn();
(globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

import { getBaseUrl, setBaseUrl, api } from './api';

describe('API client URL handling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    (Storage.prototype.getItem as ReturnType<typeof vi.fn>) = vi.fn(() => null);
    (Storage.prototype.setItem as ReturnType<typeof vi.fn>) = vi.fn();
  });

  it('getBaseUrl returns default when localStorage empty', () => {
    expect(getBaseUrl()).toBe('http://127.0.0.1:27717');
  });

  it('getBaseUrl returns localStorage value when set', () => {
    (Storage.prototype.getItem as ReturnType<typeof vi.fn>) = vi.fn(() => 'http://custom:3000');
    expect(getBaseUrl()).toBe('http://custom:3000');
  });

  it('setBaseUrl strips trailing slash and persists', () => {
    const setItem = vi.fn();
    (Storage.prototype.setItem as ReturnType<typeof vi.fn>) = setItem;
    setBaseUrl('http://example.com/');
    expect(setItem).toHaveBeenCalledWith('klip-api-url', 'http://example.com');
  });
});

describe('ApiClient request methods', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // The api singleton reads base URL at construction; set it explicitly each test
    api.setBaseUrl('http://test:1234');
  });

  it('health() makes GET to /api/health', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 'ok', version: '0.1.2' }));
    const r = await api.health();
    expect(r.status).toBe('ok');
    expect(mockFetch).toHaveBeenCalledWith('http://test:1234/api/health', expect.any(Object));
  });

  it('listClipboard() builds query params correctly', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await api.listClipboard({ limit: 5, contentType: 'text' });
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('limit=5');
    expect(url).toContain('contentType=text');
  });

  it('listClipboard supports favoriteOnly and tagId params', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await api.listClipboard({ tagId: 5, favoriteOnly: true });
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('tagId=5');
    expect(url).toContain('favoriteOnly=true');
  });

  it('searchClipboard() calls backend search with query params', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await api.searchClipboard('needle', { limit: 7, offset: 3, contentType: 'text', favoriteOnly: true, tagId: 9 });
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/clipboard/search?');
    expect(url).toContain('q=needle');
    expect(url).toContain('limit=7');
    expect(url).toContain('offset=3');
    expect(url).toContain('contentType=text');
    expect(url).toContain('favoriteOnly=true');
    expect(url).toContain('tagId=9');
  });

  it('getClipboard() fetches single item', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1, content_type: 'text', content: 'x', tags: [] }));
    const r = await api.getClipboard(1);
    expect(r.id).toBe(1);
  });

  it('advancedSearch() POSTs search body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await api.advancedSearch({ query: 'test', favoriteOnly: false, exactMatch: false, limit: 10, offset: 0 });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test:1234/api/clipboard/search/advanced',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('getStats() returns stats object', async () => {
    const stats = { total_items: 3, text_count: 2, image_count: 1, file_count: 0,
      favorite_count: 0, sensitive_count: 0, tag_count: 1, snippet_count: 0,
      source_rule_count: 0, total_size_bytes: 100, db_size_bytes: 200 };
    mockFetch.mockResolvedValueOnce(mockResponse(stats));
    const r = await api.getStats();
    expect(r.total_items).toBe(3);
    expect(r.tag_count).toBe(1);
  });

  it('qaAsk() sends POST with question', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(
      { answer: 'x', provider: 'fake', model: 'fake', context_count: 1, context: [] }
    ));
    const r = await api.qaAsk('hello');
    expect(r.provider).toBe('fake');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.question).toBe('hello');
  });

  it('deleteClipboard() sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200, true, '0'));
    await api.deleteClipboard(42);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/clipboard/42'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('clearClipboard() sends DELETE to collection', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200, true, '0'));
    await api.clearClipboard();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test:1234/api/clipboard',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('toggleFavorite() sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1, is_favorited: true }));
    await api.toggleFavorite(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/clipboard/1/favorite'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('copyItem() sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200, true, '0'));
    await api.copyItem(1);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/copy'), expect.any(Object));
  });

  it('pasteItem() sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200, true, '0'));
    await api.pasteItem(1);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/paste'), expect.objectContaining({ method: 'POST' }));
  });

  it('batchDelete() sends ids', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ count: 2 }));
    await api.batchDelete([1, 2]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/clipboard/batch-delete'), expect.any(Object));
    expect(body.ids).toEqual([1, 2]);
  });

  it('batchFavorite() sends ids and camelCase favorite flag', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ count: 2 }));
    await api.batchFavorite([1, 2], true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/clipboard/batch-favorite'), expect.any(Object));
    expect(body).toEqual({ ids: [1, 2], isFavorited: true });
  });

  it('rescanSensitive() sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ count: 0 }));
    await api.rescanSensitive();
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/rescan-sensitive'), expect.any(Object));
  });

  it('createTag() sends POST with name and color', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1, name: 'x' }));
    await api.createTag('x', '#fff');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.name).toBe('x');
    expect(body.color).toBe('#fff');
  });

  it('deleteTag() sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200, true, '0'));
    await api.deleteTag(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tags/1'), expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('assignTag() and removeTag() call item tag endpoints', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200, true, '0'));
    await api.assignTag(11, 22);
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/clipboard/11/tags/22'),
      expect.objectContaining({ method: 'POST' })
    );

    mockFetch.mockResolvedValueOnce(mockResponse({}, 200, true, '0'));
    await api.removeTag(11, 22);
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/clipboard/11/tags/22'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('listTags() calls GET /api/tags', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await api.listTags();
    const url: string = mockFetch.mock.calls.at(-1)?.[0];
    expect(url).toContain('/api/tags');
  });

  it('listSnippets() calls GET /api/snippets', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await api.listSnippets();
    const url: string = mockFetch.mock.calls.at(-1)?.[0];
    expect(url).toContain('/api/snippets');
  });

  it('createSnippet() sends POST', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1 }));
    await api.createSnippet({ title: 't', content: 'c', isFavorited: false, tagId: null });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/snippets'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('searchSnippets() encodes query string', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await api.searchSnippets('hello world');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/snippets/search?q=hello%20world'),
      expect.any(Object)
    );
  });

  it('updateSnippet() sends PUT with camelCase payload', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1 }));
    await api.updateSnippet(1, { title: 't', content: 'c', isFavorited: true, tagId: 2 });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/snippets/1'),
      expect.objectContaining({ method: 'PUT' })
    );
    expect(body).toEqual({ title: 't', content: 'c', isFavorited: true, tagId: 2 });
  });

  it('deleteSnippet() sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200, true, '0'));
    await api.deleteSnippet(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/snippets/1'), expect.any(Object)
    );
  });

  it('listSourceRules() calls GET /api/source-rules', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await api.listSourceRules();
    const url: string = mockFetch.mock.calls.at(-1)?.[0];
    expect(url).toContain('/api/source-rules');
  });

  it('createSourceRule() sends camelCase payload', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1 }));
    await api.createSourceRule({ matchType: 'process', pattern: 'Code.exe', enabled: true });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/source-rules'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(body).toEqual({ matchType: 'process', pattern: 'Code.exe', enabled: true });
  });

  it('updateSourceRule() sends PUT', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1 }));
    await api.updateSourceRule(1, { matchType: 'title', pattern: 'Secret', enabled: false });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/source-rules/1'),
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('setSourceRuleEnabled() sends PATCH enabled body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1, enabled: false }));
    await api.setSourceRuleEnabled(1, false);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/source-rules/1/enabled'),
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(body).toEqual({ enabled: false });
  });

  it('deleteSourceRule() sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200, true, '0'));
    await api.deleteSourceRule(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/source-rules/1'), expect.any(Object)
    );
  });

  it('getSystemInfo() returns system info', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ platform: 'linux', version: 'test', app_version: '0.1' }));
    const r = await api.getSystemInfo();
    expect(r.platform).toBe('linux');
  });

  it('getDiagnostics() returns diagnostics', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ platform: 'linux' }));
    const r = await api.getDiagnostics();
    expect(r.platform).toBe('linux');
  });

  it('getConfig() returns config map', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ llm_provider: 'fake' }));
    const r = await api.getConfig();
    expect(r.llm_provider).toBe('fake');
  });

  it('getConfigKey() encodes key', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('fake'));
    await api.getConfigKey('llm provider');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/config/llm%20provider'), expect.any(Object));
  });

  it('setConfigKey() sends value body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200, true, '0'));
    await api.setConfigKey('llm_provider', 'fake');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/config/llm_provider'),
      expect.objectContaining({ method: 'PUT' })
    );
    expect(body).toEqual({ value: 'fake' });
  });

  it('setConfigMany() sends config map to batch endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200, true, '0'));
    await api.setConfigMany({ llm_provider: 'fake', language: 'en-US' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test:1234/api/config',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(body).toEqual({ llm_provider: 'fake', language: 'en-US' });
  });

  it('window methods call their POST endpoints', async () => {
    mockFetch.mockResolvedValue(mockResponse({}, 200, true, '0'));
    await api.toggleWindow();
    await api.showWindow();
    await api.hideWindow();
    expect(mockFetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/api/window/toggle'), expect.objectContaining({ method: 'POST' }));
    expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/api/window/show'), expect.objectContaining({ method: 'POST' }));
    expect(mockFetch).toHaveBeenNthCalledWith(3, expect.stringContaining('/api/window/hide'), expect.objectContaining({ method: 'POST' }));
  });

  it('autostart methods call GET and PUT endpoints', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(true));
    expect(await api.getAutostart()).toBe(true);
    expect(mockFetch).toHaveBeenLastCalledWith(expect.stringContaining('/api/autostart'), expect.any(Object));

    mockFetch.mockResolvedValueOnce(mockResponse({}, 200, true, '0'));
    await api.setAutostart(false);
    const body = JSON.parse(mockFetch.mock.calls.at(-1)?.[1].body);
    expect(mockFetch).toHaveBeenLastCalledWith(expect.stringContaining('/api/autostart'), expect.objectContaining({ method: 'PUT' }));
    expect(body).toEqual({ enabled: false });
  });

  it('import/export and backup methods send path bodies', async () => {
    mockFetch.mockResolvedValue(mockResponse({ path: 'C:/tmp/file', size: 10 }));
    await api.exportJson('C:/tmp/a.json');
    await api.exportCsv('C:/tmp/a.csv');
    await api.importJson('C:/tmp/a.json');
    await api.importCsv('C:/tmp/a.csv');
    await api.backupDatabase('C:/tmp/backup.db');
    await api.restoreDatabase('C:/tmp/backup.db');
    expect(mockFetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/api/export/json'), expect.objectContaining({ method: 'POST' }));
    expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/api/export/csv'), expect.objectContaining({ method: 'POST' }));
    expect(mockFetch).toHaveBeenNthCalledWith(3, expect.stringContaining('/api/import/json'), expect.objectContaining({ method: 'POST' }));
    expect(mockFetch).toHaveBeenNthCalledWith(4, expect.stringContaining('/api/import/csv'), expect.objectContaining({ method: 'POST' }));
    expect(mockFetch).toHaveBeenNthCalledWith(5, expect.stringContaining('/api/backup'), expect.objectContaining({ method: 'POST' }));
    expect(mockFetch).toHaveBeenNthCalledWith(6, expect.stringContaining('/api/restore'), expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ path: 'C:/tmp/a.json' });
  });

  it('getOpenApiSpec() fetches spec', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ openapi: '3.1.0', paths: {} }));
    const s = await api.getOpenApiSpec();
    expect((s as { openapi: string }).openapi).toBe('3.1.0');
    expect(mockFetch).toHaveBeenCalledWith('http://test:1234/openapi.json', expect.any(Object));
  });

  it('throws error on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(
      { error: 'not_found', message: 'item missing' }, 404, false
    ));
    await expect(api.getClipboard(999)).rejects.toMatchObject({ message: 'item missing' });
  });
});

describe('API client access token', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    api.setBaseUrl('http://test:1234');
    // The shared setup mocks Storage; drive token reads explicitly.
    (Storage.prototype.getItem as ReturnType<typeof vi.fn>) = vi.fn(() => null);
    (Storage.prototype.setItem as ReturnType<typeof vi.fn>) = vi.fn();
  });

  it('sends no Authorization header when no token is stored', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 'ok' }));
    await api.health();
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('attaches the bearer token when stored', async () => {
    (Storage.prototype.getItem as ReturnType<typeof vi.fn>) = vi.fn((key: string) =>
      key === 'klip-api-token' ? 'secret' : null,
    );
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 'ok' }));
    await api.health();
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret');
  });

  it('withAccessToken appends the token as a query parameter', async () => {
    (Storage.prototype.getItem as ReturnType<typeof vi.fn>) = vi.fn((key: string) =>
      key === 'klip-api-token' ? 'secret' : null,
    );
    const { withAccessToken } = await import('./api');
    expect(withAccessToken('http://x/api/events')).toBe('http://x/api/events?access_token=secret');
    expect(withAccessToken('http://x/api/events?x=1')).toBe('http://x/api/events?x=1&access_token=secret');
  });

  it('withAccessToken is a no-op without a token', async () => {
    const { withAccessToken } = await import('./api');
    expect(withAccessToken('http://x/y')).toBe('http://x/y');
  });

  it('rejects with ApiErrorResponse and fires the auth listener on 401', async () => {
    (Storage.prototype.getItem as ReturnType<typeof vi.fn>) = vi.fn((key: string) =>
      key === 'klip-api-token' ? 'wrong' : null,
    );
    let failed = false;
    const { onAuthFailure } = await import('./api');
    const off = onAuthFailure(() => { failed = true; });
    mockFetch.mockResolvedValueOnce(mockResponse(
      { error: 'unauthorized', message: 'missing or invalid access token' }, 401, false
    ));
    await expect(api.health()).rejects.toMatchObject({ status: 401 });
    expect(failed).toBe(true);
    off();
  });
});

describe('API client new endpoints', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    api.setBaseUrl('http://test:1234');
    (Storage.prototype.getItem as ReturnType<typeof vi.fn>) = vi.fn(() => null);
    (Storage.prototype.setItem as ReturnType<typeof vi.fn>) = vi.fn();
  });

  it('getOcr() and triggerOcr() call the OCR endpoints', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 'pending', text: '', error: null, updated_at: 1 }));
    const state = await api.getOcr(7);
    expect(state.status).toBe('pending');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test:1234/api/clipboard/7/ocr',
      expect.any(Object),
    );

    mockFetch.mockResolvedValueOnce(mockResponse({ status: 'completed', text: 'hi', error: null, updated_at: 2 }));
    const done = await api.triggerOcr(7);
    expect(done.status).toBe('completed');
    expect(mockFetch).toHaveBeenLastCalledWith(
      'http://test:1234/api/clipboard/7/ocr',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('windowStatus() and getHealthReport() call their endpoints', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ visible: true }));
    const s = await api.windowStatus();
    expect(s.visible).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test:1234/api/window/status',
      expect.any(Object),
    );

    mockFetch.mockResolvedValueOnce(mockResponse({ status: 'ok', generated_at: 1, checks: [] }));
    const r = await api.getHealthReport();
    expect(r.status).toBe('ok');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test:1234/api/diagnostics/health',
      expect.any(Object),
    );
  });

  it('imageUrl and thumbnailUrl build token-aware links', async () => {
    const { imageUrl, thumbnailUrl } = await import('./api');
    const item = { id: 5, image_ref: { url: '/api/clipboard/5/image', thumbnail_url: '/api/clipboard/5/thumbnail', size: 9 } };
    expect(imageUrl(item)).toBe('http://127.0.0.1:27717/api/clipboard/5/image');
    expect(thumbnailUrl(item)).toBe('http://127.0.0.1:27717/api/clipboard/5/thumbnail');

    (Storage.prototype.getItem as ReturnType<typeof vi.fn>) = vi.fn((key: string) =>
      key === 'klip-api-token' ? 'tok' : null,
    );
    expect(thumbnailUrl(item)).toBe('http://127.0.0.1:27717/api/clipboard/5/thumbnail?access_token=tok');
  });
});

describe('qaAskStream SSE parsing', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    api.setBaseUrl('http://test:1234');
  });

  function sseResponse(frames: string[], status = 200) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      body: stream,
      json: async () => ({}),
    } as Response;
  }

  it('dispatches context, delta, and done frames in order', async () => {
    const events: string[] = [];
    mockFetch.mockResolvedValueOnce(sseResponse([
      'event: context\ndata: {"context_count":1,"items":[{"id":9,"preview":"p","score":0.5}]}\n\n',
      'event: delta\ndata: {"text":"Hel"}\n\n',
      'event: delta\ndata: {"text":"lo"}\n\n',
      'event: done\ndata: {"provider":"fake","model":"m","context_count":1}\n\n',
    ]));
    await api.qaAskStream('hi', {
      onContext: (items, n) => events.push(`context:${n}:${items[0].id}`),
      onDelta: (t) => events.push(`delta:${t}`),
      onDone: (p) => events.push(`done:${p}`),
      onError: (e) => events.push(`error:${e}`),
    });
    expect(events).toEqual(['context:1:9', 'delta:Hel', 'delta:lo', 'done:fake']);
  });

  it('dispatches error frames', async () => {
    const events: string[] = [];
    mockFetch.mockResolvedValueOnce(sseResponse([
      'event: context\ndata: {"context_count":0,"items":[]}\n\n',
      'event: error\ndata: {"error":"llm","message":"boom"}\n\n',
    ]));
    await api.qaAskStream('hi', {
      onContext: (_, n) => events.push(`context:${n}`),
      onError: (e, m) => events.push(`error:${e}:${m}`),
    });
    expect(events).toEqual(['context:0', 'error:llm:boom']);
  });

  it('rejects on HTTP errors before opening the stream', async () => {
    mockFetch.mockResolvedValueOnce(sseResponse([''], 401));
    await expect(api.qaAskStream('hi', {})).rejects.toMatchObject({ status: 401 });
  });

  it('handles frames split across chunks', async () => {
    const events: string[] = [];
    const full = 'event: delta\ndata: {"text":"abc"}\n\n';
    mockFetch.mockResolvedValueOnce(sseResponse([full.slice(0, 20), full.slice(20)]));
    await api.qaAskStream('hi', { onDelta: (t) => events.push(t) });
    expect(events).toEqual(['abc']);
  });
});
