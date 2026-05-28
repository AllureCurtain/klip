import { create } from 'zustand';
import type {
  BackupSummary,
  ClipboardItem,
  ClipboardQueryOptions,
  ImportSummary,
  RestoreSummary,
  Tag,
} from '@/types';
import { getErrorMessage } from '@/types';
import { clipboardApi } from '@/lib/tauri';
import {
  hasAdvancedFilters,
  normalizeClipboardFilters,
  toAdvancedSearchQuery,
} from '@/lib/clipboardFilters';

interface ClipboardStore {
  items: ClipboardItem[];
  tags: Tag[];
  selectedIds: number[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;

  fetchItems: (options?: ClipboardQueryOptions) => Promise<void>;
  searchItems: (query: string, options?: ClipboardQueryOptions) => Promise<void>;
  loadMore: () => Promise<void>;
  fetchTags: () => Promise<void>;
  createTag: (name: string, color?: string | null) => Promise<Tag | null>;
  deleteTag: (id: number) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  deleteSelected: () => Promise<void>;
  copyItem: (id: number) => Promise<void>;
  clearItems: () => Promise<void>;
  toggleFavorite: (id: number) => Promise<void>;
  setFavoriteForSelected: (isFavorited: boolean) => Promise<void>;
  assignTagToItem: (itemId: number, tagId: number) => Promise<void>;
  assignTagToSelected: (tagId: number) => Promise<void>;
  removeTagFromItem: (itemId: number, tagId: number) => Promise<void>;
  rescanSensitive: () => Promise<number>;
  exportJson: (path: string) => Promise<BackupSummary | null>;
  exportCsv: (path: string) => Promise<BackupSummary | null>;
  importJson: (path: string) => Promise<ImportSummary | null>;
  importCsv: (path: string) => Promise<ImportSummary | null>;
  backupDatabase: (path: string) => Promise<BackupSummary | null>;
  restoreDatabase: (path: string) => Promise<RestoreSummary | null>;
  toggleSelected: (id: number) => void;
  clearSelection: () => void;
  addItems: (items: ClipboardItem[]) => void;
  setItems: (items: ClipboardItem[]) => void;
  currentQuery: string | null;
  currentOptions: ClipboardQueryOptions;
}

export const useClipboardStore = create<ClipboardStore>((set) => ({
  items: [],
  tags: [],
  selectedIds: [],
  loading: false,
  loadingMore: false,
  hasMore: false,
  error: null,
  currentQuery: null,
  currentOptions: {},

  fetchItems: async (options: ClipboardQueryOptions = {}) => {
    set({ loading: true, error: null });
    try {
      const items = hasAdvancedFilters(options)
        ? await clipboardApi.searchAdvanced(toAdvancedSearchQuery('', options))
        : await clipboardApi.getListFiltered(options);
      const filters = normalizeClipboardFilters(options);
      set({
        items,
        loading: false,
        hasMore: items.length === filters.limit,
        currentQuery: null,
        currentOptions: options,
      });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  searchItems: async (query: string, options: ClipboardQueryOptions = {}) => {
    set({ loading: true, error: null });
    try {
      const advanced = hasAdvancedFilters(options);
      const items = advanced
        ? await clipboardApi.searchAdvanced(toAdvancedSearchQuery(query, options))
        : await clipboardApi.searchFiltered(query, options);
      const filters = normalizeClipboardFilters(options);
      set({
        items,
        loading: false,
        hasMore: items.length === filters.limit,
        currentQuery: query,
        currentOptions: options,
      });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  loadMore: async () => {
    const { currentQuery, currentOptions, hasMore, loading, loadingMore, items } =
      useClipboardStore.getState();
    if (!hasMore || loading || loadingMore) return;

    const limit = normalizeClipboardFilters(currentOptions).limit;
    const options = { ...currentOptions, limit, offset: items.length };
    set({ loadingMore: true, error: null });
    try {
      const nextItems = hasAdvancedFilters(options)
        ? await clipboardApi.searchAdvanced(toAdvancedSearchQuery(currentQuery ?? '', options))
        : currentQuery
          ? await clipboardApi.searchFiltered(currentQuery, options)
          : await clipboardApi.getListFiltered(options);
      set((state) => ({
        items: appendUniqueItems(state.items, nextItems),
        loadingMore: false,
        hasMore: nextItems.length === limit,
      }));
    } catch (error) {
      set({ error: getErrorMessage(error), loadingMore: false });
    }
  },

  fetchTags: async () => {
    try {
      const tags = await clipboardApi.listTags();
      set({ tags });
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  createTag: async (name: string, color?: string | null) => {
    try {
      const tag = await clipboardApi.createTag(name, color);
      set((state) => ({
        tags: [...state.tags.filter((existing) => existing.id !== tag.id), tag].sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
      }));
      return tag;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  deleteTag: async (id: number) => {
    try {
      await clipboardApi.deleteTag(id);
      set((state) => ({
        tags: state.tags.filter((tag) => tag.id !== id),
        items: state.items.map((item) => ({
          ...item,
          tags: item.tags.filter((tag) => tag.id !== id),
        })),
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  deleteItem: async (id: number) => {
    try {
      await clipboardApi.delete(id);
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
        selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  deleteSelected: async () => {
    const ids = useClipboardStore.getState().selectedIds;
    if (ids.length === 0) return;
    try {
      await clipboardApi.deleteMany(ids);
      const selected = new Set(ids);
      set((state) => ({
        items: state.items.filter((item) => !selected.has(item.id)),
        selectedIds: [],
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  copyItem: async (id: number) => {
    try {
      await clipboardApi.paste(id);
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  clearItems: async () => {
    try {
      await clipboardApi.clear();
      set({ items: [], hasMore: false });
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  toggleFavorite: async (id: number) => {
    try {
      const updated = await clipboardApi.toggleFavorite(id);
      set((state) => ({
        items: state.items.map((item) =>
          item.id === id ? updated : item
        ),
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  setFavoriteForSelected: async (isFavorited: boolean) => {
    const ids = useClipboardStore.getState().selectedIds;
    if (ids.length === 0) return;
    try {
      await clipboardApi.setFavoriteForItems(ids, isFavorited);
      const selected = new Set(ids);
      set((state) => ({
        items: state.items.map((item) =>
          selected.has(item.id) ? { ...item, is_favorited: isFavorited } : item
        ),
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  assignTagToItem: async (itemId: number, tagId: number) => {
    try {
      await clipboardApi.assignTagToItem(itemId, tagId);
      const tag = useClipboardStore.getState().tags.find((candidate) => candidate.id === tagId);
      if (!tag) return;
      set((state) => ({
        items: state.items.map((item) =>
          item.id === itemId && !item.tags.some((existing) => existing.id === tagId)
            ? { ...item, tags: [...item.tags, tag] }
            : item
        ),
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  assignTagToSelected: async (tagId: number) => {
    const { selectedIds, tags } = useClipboardStore.getState();
    const tag = tags.find((candidate) => candidate.id === tagId);
    if (!tag || selectedIds.length === 0) return;
    try {
      await Promise.all(
        selectedIds.map((itemId) => clipboardApi.assignTagToItem(itemId, tagId))
      );
      const selected = new Set(selectedIds);
      set((state) => ({
        items: state.items.map((item) =>
          selected.has(item.id) && !item.tags.some((existing) => existing.id === tagId)
            ? { ...item, tags: [...item.tags, tag] }
            : item
        ),
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  removeTagFromItem: async (itemId: number, tagId: number) => {
    try {
      await clipboardApi.removeTagFromItem(itemId, tagId);
      set((state) => ({
        items: state.items.map((item) =>
          item.id === itemId
            ? { ...item, tags: item.tags.filter((tag) => tag.id !== tagId) }
            : item
        ),
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  rescanSensitive: async () => {
    try {
      return await clipboardApi.rescanSensitive();
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return 0;
    }
  },

  exportJson: async (path: string) => runSummary(() => clipboardApi.exportJson(path), set),
  exportCsv: async (path: string) => runSummary(() => clipboardApi.exportCsv(path), set),
  importJson: async (path: string) => runSummary(() => clipboardApi.importJson(path), set),
  importCsv: async (path: string) => runSummary(() => clipboardApi.importCsv(path), set),
  backupDatabase: async (path: string) => runSummary(() => clipboardApi.backupDatabase(path), set),
  restoreDatabase: async (path: string) => runSummary(() => clipboardApi.restoreDatabase(path), set),

  toggleSelected: (id: number) => {
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedIds, id],
    }));
  },

  clearSelection: () => set({ selectedIds: [] }),

  addItems: (newItems: ClipboardItem[]) => {
    set((state) => {
      const existingIds = new Set(state.items.map((item) => item.id));
      const uniqueNewItems = newItems.filter(
        (item) => !existingIds.has(item.id)
      );
      return { items: [...uniqueNewItems, ...state.items] };
    });
  },

  setItems: (items: ClipboardItem[]) => {
    set({ items, hasMore: false });
  },
}));

function appendUniqueItems(
  existingItems: ClipboardItem[],
  newItems: ClipboardItem[]
): ClipboardItem[] {
  const existingIds = new Set(existingItems.map((item) => item.id));
  return [
    ...existingItems,
    ...newItems.filter((item) => !existingIds.has(item.id)),
  ];
}

async function runSummary<T>(
  action: () => Promise<T>,
  set: (state: Partial<ClipboardStore>) => void
): Promise<T | null> {
  try {
    return await action();
  } catch (error) {
    set({ error: getErrorMessage(error) });
    return null;
  }
}
