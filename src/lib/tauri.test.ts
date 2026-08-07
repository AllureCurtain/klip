import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clipboardApi, configApi, onClipboardItemUpdated, productApi } from './tauri';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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

  it('wraps batch config persistence with typed entries', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await configApi.setMany([
      ['window_width', '640'],
      ['window_height', '720'],
    ]);

    expect(invoke).toHaveBeenCalledWith('set_config_many', {
      entries: [
        { key: 'window_width', value: '640' },
        { key: 'window_height', value: '720' },
      ],
    });
  });

  it('keeps copy and paste commands distinct', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await clipboardApi.copy(4);
    await clipboardApi.paste(5);

    expect(invoke).toHaveBeenNthCalledWith(1, 'copy_to_clipboard', { id: 4 });
    expect(invoke).toHaveBeenNthCalledWith(2, 'paste_from_clipboard', { id: 5 });
  });

  it('keeps plain-text copy and paste commands distinct', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await clipboardApi.copyPlainText(6);
    await clipboardApi.pastePlainText(7);

    expect(invoke).toHaveBeenNthCalledWith(1, 'copy_plain_text_to_clipboard', {
      id: 6,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'paste_plain_text_from_clipboard', {
      id: 7,
    });
  });

  it('syncs the ordered visible clipboard ids', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await clipboardApi.setVisibleItems([9, 4, 7]);

    expect(invoke).toHaveBeenCalledWith('set_visible_clipboard_items', {
      ids: [9, 4, 7],
    });
  });

  it('loads and executes typed clipboard content actions', async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    const action = { kind: 'open_url', target: 'https://example.com' } as const;

    await clipboardApi.getContentActions(12);
    await clipboardApi.executeContentAction(12, action);

    expect(invoke).toHaveBeenNthCalledWith(1, 'get_clipboard_content_actions', {
      id: 12,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'execute_clipboard_content_action', {
      id: 12,
      action,
    });
  });

  it('updates clipboard annotations through a typed input', async () => {
    vi.mocked(invoke).mockResolvedValue({});

    await clipboardApi.updateAnnotations(12, {
      customTitle: 'Project brief',
      note: 'Review tomorrow',
    });

    expect(invoke).toHaveBeenCalledWith('update_clipboard_annotations', {
      id: 12,
      input: {
        customTitle: 'Project brief',
        note: 'Review tomorrow',
      },
    });
  });

  it('subscribes to typed clipboard item updates', async () => {
    vi.mocked(listen).mockResolvedValue(vi.fn());
    const callback = vi.fn();

    await onClipboardItemUpdated(callback);

    expect(listen).toHaveBeenCalledWith('clipboard-item-updated', expect.any(Function));
  });
});
