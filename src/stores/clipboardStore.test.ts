import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useClipboardStore } from './clipboardStore';
import { clipboardApi } from '@/lib/tauri';
import type { ClipboardItem } from '@/types';

// Mock the Tauri IPC layer
vi.mock('@/lib/tauri', () => ({
  clipboardApi: {
    getList: vi.fn(),
    search: vi.fn(),
    delete: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    toggleFavorite: vi.fn(),
  },
  configApi: {
    get: vi.fn(),
    getAll: vi.fn(),
    set: vi.fn(),
  },
  systemApi: {
    toggleWindow: vi.fn(),
    showWindow: vi.fn(),
    hideWindow: vi.fn(),
    setAutoStart: vi.fn(),
    isAutoStartEnabled: vi.fn(),
    getInfo: vi.fn(),
  },
  onClipboardUpdated: vi.fn(),
  onClipboardCleared: vi.fn(),
  onConfigChanged: vi.fn(),
}));

function makeItem(id: number, overrides: Partial<ClipboardItem> = {}): ClipboardItem {
  return {
    id,
    content_type: 'text',
    content: `item-${id}`,
    preview: `item-${id}`,
    hash: `hash-${id}`,
    size: 10,
    metadata: null,
    is_favorited: false,
    created_at: Date.now(),
    last_used_at: Date.now(),
    ...overrides,
  };
}

describe('clipboardStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useClipboardStore.setState({
      items: [],
      loading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe('toggleFavorite', () => {
    it('updates is_favorited from false to true', async () => {
      const item = makeItem(1, { is_favorited: false });
      const updated = makeItem(1, { is_favorited: true });

      useClipboardStore.setState({ items: [item] });
      vi.mocked(clipboardApi.toggleFavorite).mockResolvedValue(updated);

      const { toggleFavorite } = useClipboardStore.getState();
      await toggleFavorite(1);

      const { items } = useClipboardStore.getState();
      expect(items[0].is_favorited).toBe(true);
      expect(clipboardApi.toggleFavorite).toHaveBeenCalledWith(1);
    });

    it('updates is_favorited from true to false', async () => {
      const item = makeItem(1, { is_favorited: true });
      const updated = makeItem(1, { is_favorited: false });

      useClipboardStore.setState({ items: [item] });
      vi.mocked(clipboardApi.toggleFavorite).mockResolvedValue(updated);

      const { toggleFavorite } = useClipboardStore.getState();
      await toggleFavorite(1);

      const { items } = useClipboardStore.getState();
      expect(items[0].is_favorited).toBe(false);
    });

    it('replaces the correct item when multiple items exist', async () => {
      const items = [makeItem(1), makeItem(2), makeItem(3)];
      useClipboardStore.setState({ items });

      const updated = makeItem(2, { is_favorited: true });
      vi.mocked(clipboardApi.toggleFavorite).mockResolvedValue(updated);

      const { toggleFavorite } = useClipboardStore.getState();
      await toggleFavorite(2);

      const state = useClipboardStore.getState();
      expect(state.items[0].is_favorited).toBe(false); // item 1 unchanged
      expect(state.items[1].is_favorited).toBe(true);  // item 2 toggled
      expect(state.items[2].is_favorited).toBe(false); // item 3 unchanged
    });

    it('sets error on API failure', async () => {
      vi.mocked(clipboardApi.toggleFavorite).mockRejectedValue(new Error('DB error'));

      const { toggleFavorite } = useClipboardStore.getState();
      await toggleFavorite(1);

      const { error } = useClipboardStore.getState();
      expect(error).toContain('DB error');
    });
  });

  describe('fetchItems with contentType', () => {
    it('calls getList when no contentType', async () => {
      const items = [makeItem(1), makeItem(2)];
      vi.mocked(clipboardApi.getList).mockResolvedValue(items);

      const { fetchItems } = useClipboardStore.getState();
      await fetchItems();

      expect(clipboardApi.getList).toHaveBeenCalled();
      expect(clipboardApi.search).not.toHaveBeenCalled();
      expect(useClipboardStore.getState().items).toEqual(items);
    });

    it('calls search with empty query when contentType is provided', async () => {
      const items = [makeItem(1, { content_type: 'text' })];
      vi.mocked(clipboardApi.search).mockResolvedValue(items);

      const { fetchItems } = useClipboardStore.getState();
      await fetchItems('text');

      expect(clipboardApi.search).toHaveBeenCalledWith('', 'text');
      expect(clipboardApi.getList).not.toHaveBeenCalled();
      expect(useClipboardStore.getState().items).toEqual(items);
    });
  });

  describe('searchItems with contentType', () => {
    it('passes contentType to clipboardApi.search', async () => {
      const items = [makeItem(1)];
      vi.mocked(clipboardApi.search).mockResolvedValue(items);

      const { searchItems } = useClipboardStore.getState();
      await searchItems('hello', 'image');

      expect(clipboardApi.search).toHaveBeenCalledWith('hello', 'image');
    });

    it('calls search without contentType when not provided', async () => {
      const items = [makeItem(1)];
      vi.mocked(clipboardApi.search).mockResolvedValue(items);

      const { searchItems } = useClipboardStore.getState();
      await searchItems('hello');

      expect(clipboardApi.search).toHaveBeenCalledWith('hello', undefined);
    });
  });

  describe('clearItems', () => {
    it('clears items from store after API call', async () => {
      useClipboardStore.setState({ items: [makeItem(1), makeItem(2)] });
      vi.mocked(clipboardApi.clear).mockResolvedValue(undefined);

      const { clearItems } = useClipboardStore.getState();
      await clearItems();

      expect(clipboardApi.clear).toHaveBeenCalled();
      expect(useClipboardStore.getState().items).toEqual([]);
    });
  });

  describe('deleteItem', () => {
    it('removes the item from local state after API call', async () => {
      useClipboardStore.setState({ items: [makeItem(1), makeItem(2), makeItem(3)] });
      vi.mocked(clipboardApi.delete).mockResolvedValue(undefined);

      const { deleteItem } = useClipboardStore.getState();
      await deleteItem(2);

      expect(clipboardApi.delete).toHaveBeenCalledWith(2);
      const state = useClipboardStore.getState();
      expect(state.items.map((i) => i.id)).toEqual([1, 3]);
    });
  });
});
