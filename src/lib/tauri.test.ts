import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clipboardApi, productApi } from './tauri';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe('tauri API wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes advanced search options through one typed command', async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    await clipboardApi.searchAdvanced({
      query: 'deploy',
      contentType: 'text',
      favoriteOnly: true,
      sensitiveOnly: false,
      tagId: 7,
      exactMatch: true,
      createdAfter: 1_000,
      createdBefore: 2_000,
      limit: 25,
      offset: 5,
    });

    expect(invoke).toHaveBeenCalledWith('search_clipboard_advanced', {
      query: {
        query: 'deploy',
        contentType: 'text',
        favoriteOnly: true,
        sensitiveOnly: false,
        tagId: 7,
        exactMatch: true,
        createdAfter: 1_000,
        createdBefore: 2_000,
        limit: 25,
        offset: 5,
      },
    });
  });

  it('wraps snippet and source-rule product commands', async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    await productApi.listSnippets();
    await productApi.createSnippet({
      title: 'Deploy',
      content: 'pnpm release:verify',
      tagId: null,
      isFavorited: true,
    });
    await productApi.setSourceRuleEnabled(3, false);

    expect(invoke).toHaveBeenNthCalledWith(1, 'list_snippets');
    expect(invoke).toHaveBeenNthCalledWith(2, 'create_snippet', {
      input: {
        title: 'Deploy',
        content: 'pnpm release:verify',
        tagId: null,
        isFavorited: true,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'set_source_rule_enabled', {
      id: 3,
      enabled: false,
    });
  });
});
