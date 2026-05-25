import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useClipboardStore } from './clipboardStore';
import { clipboardApi } from '@/lib/tauri';
import type { ClipboardItem } from '@/types';

// Mock the Tauri IPC layer
vi.mock('@/lib/tauri', () => ({
  clipboardApi: {
    getList: vi.fn(),
    getListFiltered: vi.fn(),
    search: vi.fn(),
    searchFiltered: vi.fn(),
    searchAdvanced: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    toggleFavorite: vi.fn(),
    setFavoriteForItems: vi.fn(),
    listTags: vi.fn(),
    createTag: vi.fn(),
    assignTagToItem: vi.fn(),
    removeTagFromItem: vi.fn(),
    rescanSensitive: vi.fn(),
    exportJson: vi.fn(),
    exportCsv: vi.fn(),
    importJson: vi.fn(),
    importCsv: vi.fn(),
    backupDatabase: vi.fn(),
    restoreDatabase: vi.fn(),
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
    is_sensitive: false,
    sensitivity_reason: null,
    tags: [],
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
      tags: [],
      selectedIds: [],
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
      vi.mocked(clipboardApi.getListFiltered).mockResolvedValue(items);

      const { fetchItems } = useClipboardStore.getState();
      await fetchItems();

      expect(clipboardApi.getListFiltered).toHaveBeenCalledWith({});
      expect(clipboardApi.searchFiltered).not.toHaveBeenCalled();
      expect(useClipboardStore.getState().items).toEqual(items);
    });

    it('calls search with empty query when contentType is provided', async () => {
      const items = [makeItem(1, { content_type: 'text' })];
      vi.mocked(clipboardApi.getListFiltered).mockResolvedValue(items);

      const { fetchItems } = useClipboardStore.getState();
      await fetchItems({ contentType: 'text' });

      expect(clipboardApi.getListFiltered).toHaveBeenCalledWith({ contentType: 'text' });
      expect(clipboardApi.searchFiltered).not.toHaveBeenCalled();
      expect(useClipboardStore.getState().items).toEqual(items);
    });
  });

  describe('searchItems with contentType', () => {
    it('passes contentType to clipboardApi.search', async () => {
      const items = [makeItem(1)];
      vi.mocked(clipboardApi.searchFiltered).mockResolvedValue(items);

      const { searchItems } = useClipboardStore.getState();
      await searchItems('hello', { contentType: 'image' });

      expect(clipboardApi.searchFiltered).toHaveBeenCalledWith('hello', { contentType: 'image' });
    });

    it('calls search without contentType when not provided', async () => {
      const items = [makeItem(1)];
      vi.mocked(clipboardApi.searchFiltered).mockResolvedValue(items);

      const { searchItems } = useClipboardStore.getState();
      await searchItems('hello');

      expect(clipboardApi.searchFiltered).toHaveBeenCalledWith('hello', {});
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

  describe('batch operations', () => {
    it('deletes selected items and clears selection', async () => {
      useClipboardStore.setState({
        items: [makeItem(1), makeItem(2), makeItem(3)],
        selectedIds: [1, 3],
      });
      vi.mocked(clipboardApi.deleteMany).mockResolvedValue(2);

      const { deleteSelected } = useClipboardStore.getState();
      await deleteSelected();

      expect(clipboardApi.deleteMany).toHaveBeenCalledWith([1, 3]);
      expect(useClipboardStore.getState().items.map((i) => i.id)).toEqual([2]);
      expect(useClipboardStore.getState().selectedIds).toEqual([]);
    });

    it('sets favorite state for selected items', async () => {
      useClipboardStore.setState({
        items: [makeItem(1), makeItem(2)],
        selectedIds: [1, 2],
      });
      vi.mocked(clipboardApi.setFavoriteForItems).mockResolvedValue(2);

      const { setFavoriteForSelected } = useClipboardStore.getState();
      await setFavoriteForSelected(true);

      expect(clipboardApi.setFavoriteForItems).toHaveBeenCalledWith([1, 2], true);
      expect(useClipboardStore.getState().items.every((item) => item.is_favorited)).toBe(true);
    });
  });

  describe('advanced search', () => {
    it('uses the advanced search API when advanced filters are present', async () => {
      const items = [makeItem(1, { is_sensitive: true })];
      vi.mocked(clipboardApi.searchAdvanced).mockResolvedValue(items);

      const { searchItems } = useClipboardStore.getState();
      await searchItems('deploy', {
        contentType: 'text',
        sensitiveOnly: true,
        exactMatch: true,
        createdAfter: 1_000,
        createdBefore: 2_000,
      });

      expect(clipboardApi.searchAdvanced).toHaveBeenCalledWith({
        query: 'deploy',
        contentType: 'text',
        favoriteOnly: false,
        sensitiveOnly: true,
        tagId: null,
        exactMatch: true,
        createdAfter: 1_000,
        createdBefore: 2_000,
        limit: 100,
        offset: 0,
      });
      expect(clipboardApi.searchFiltered).not.toHaveBeenCalled();
      expect(useClipboardStore.getState().items).toEqual(items);
    });

    it('uses advanced search for empty queries when advanced filters are present', async () => {
      const items = [makeItem(1, { is_sensitive: true })];
      vi.mocked(clipboardApi.searchAdvanced).mockResolvedValue(items);

      const { fetchItems } = useClipboardStore.getState();
      await fetchItems({ sensitiveOnly: true });

      expect(clipboardApi.searchAdvanced).toHaveBeenCalledWith({
        query: '',
        contentType: null,
        favoriteOnly: false,
        sensitiveOnly: true,
        tagId: null,
        exactMatch: false,
        createdAfter: null,
        createdBefore: null,
        limit: 100,
        offset: 0,
      });
      expect(clipboardApi.getListFiltered).not.toHaveBeenCalled();
      expect(useClipboardStore.getState().items).toEqual(items);
    });

    it('keeps advanced search active when loading more results', async () => {
      const firstPage = Array.from({ length: 100 }, (_value, index) => makeItem(index + 1));
      const nextPage = [makeItem(101)];
      vi.mocked(clipboardApi.searchAdvanced)
        .mockResolvedValueOnce(firstPage)
        .mockResolvedValueOnce(nextPage);

      await useClipboardStore.getState().searchItems('deploy', { exactMatch: true });
      await useClipboardStore.getState().loadMore();

      expect(clipboardApi.searchAdvanced).toHaveBeenNthCalledWith(2, {
        query: 'deploy',
        contentType: null,
        favoriteOnly: false,
        sensitiveOnly: null,
        tagId: null,
        exactMatch: true,
        createdAfter: null,
        createdBefore: null,
        limit: 100,
        offset: 100,
      });
      expect(clipboardApi.searchFiltered).not.toHaveBeenCalled();
      expect(useClipboardStore.getState().items).toHaveLength(101);
    });
  });

  describe('restoreDatabase', () => {
    it('returns the pre-restore backup path from the API summary', async () => {
      vi.mocked(clipboardApi.restoreDatabase).mockResolvedValue({
        path: 'C:\\Users\\you\\AppData\\Roaming\\com.klip.app\\klip.db',
        size: 4096,
        pre_restore_backup_path:
          'C:\\Users\\you\\AppData\\Roaming\\com.klip.app\\klip.db.pre-restore.bak',
        pre_restore_backup_size: 2048,
      });

      const { restoreDatabase } = useClipboardStore.getState();
      const summary = await restoreDatabase('C:\\Users\\you\\Desktop\\klip.db');

      expect(summary?.pre_restore_backup_path).toContain('pre-restore.bak');
      expect(clipboardApi.restoreDatabase).toHaveBeenCalledWith(
        'C:\\Users\\you\\Desktop\\klip.db'
      );
    });
  });
});
