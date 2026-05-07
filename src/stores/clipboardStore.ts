import { create } from 'zustand';
import type { ClipboardItem } from '@/types';
import { clipboardApi } from '@/lib/tauri';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface ClipboardStore {
  items: ClipboardItem[];
  loading: boolean;
  error: string | null;

  fetchItems: (contentType?: string | null) => Promise<void>;
  searchItems: (query: string, contentType?: string) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  copyItem: (id: number) => Promise<void>;
  clearItems: () => Promise<void>;
  toggleFavorite: (id: number) => Promise<void>;
  addItems: (items: ClipboardItem[]) => void;
  setItems: (items: ClipboardItem[]) => void;
}

export const useClipboardStore = create<ClipboardStore>((set) => ({
  items: [],
  loading: false,
  error: null,

  fetchItems: async (contentType?: string | null) => {
    set({ loading: true, error: null });
    try {
      const items = contentType
        ? await clipboardApi.search('', contentType)
        : await clipboardApi.getList();
      set({ items, loading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  searchItems: async (query: string, contentType?: string) => {
    set({ loading: true, error: null });
    try {
      const items = await clipboardApi.search(query, contentType);
      set({ items, loading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  deleteItem: async (id: number) => {
    try {
      await clipboardApi.delete(id);
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
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
      set({ items: [] });
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
    set({ items });
  },
}));
