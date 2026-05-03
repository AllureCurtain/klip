import { create } from 'zustand';
import type { ClipboardItem } from '@/types';
import { clipboardApi } from '@/lib/tauri';

interface ClipboardStore {
  items: ClipboardItem[];
  loading: boolean;
  error: string | null;

  fetchItems: () => Promise<void>;
  searchItems: (query: string) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  copyItem: (id: number) => Promise<void>;
  clearItems: () => Promise<void>;
  addItems: (items: ClipboardItem[]) => void;
  setItems: (items: ClipboardItem[]) => void;
}

export const useClipboardStore = create<ClipboardStore>((set) => ({
  items: [],
  loading: false,
  error: null,

  fetchItems: async () => {
    set({ loading: true, error: null });
    try {
      const items = await clipboardApi.getList();
      set({ items, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  searchItems: async (query: string) => {
    set({ loading: true, error: null });
    try {
      const items = await clipboardApi.search(query);
      set({ items, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  deleteItem: async (id: number) => {
    try {
      await clipboardApi.delete(id);
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  copyItem: async (id: number) => {
    try {
      await clipboardApi.copy(id);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  clearItems: async () => {
    try {
      await clipboardApi.clear();
      set({ items: [] });
    } catch (error) {
      set({ error: String(error) });
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
