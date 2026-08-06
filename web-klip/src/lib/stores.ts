import { create } from 'zustand';
import { api } from './api';
import type {
  ClipboardItem, Tag, Snippet, SourceRule, SystemInfo, DiagnosticsInfo,
  StatsResponse, ConnectionState, SseEvent,
} from '@/types';

interface AppState {
  // clipboard
  items: ClipboardItem[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  pageSize: number;

  // search
  searchQuery: string;
  contentTypeFilter: string | null;
  favoriteOnly: boolean;

  // metadata
  tags: Tag[];
  snippets: Snippet[];
  sourceRules: SourceRule[];
  systemInfo: SystemInfo | null;
  diagnostics: DiagnosticsInfo | null;
  stats: StatsResponse | null;
  config: Record<string, string>;

  // SSE
  connectionState: ConnectionState;
  sseEvents: SseEvent[];

  // actions
  setSearch: (q: string) => void;
  setContentTypeFilter: (t: string | null) => void;
  setFavoriteOnly: (f: boolean) => void;
  loadItems: (reset?: boolean) => Promise<void>;
  searchItems: (q: string) => Promise<void>;
  loadMore: () => Promise<void>;
  refreshMeta: () => Promise<void>;
  loadStats: () => Promise<void>;
  loadConfig: () => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  toggleFavorite: (id: number) => Promise<void>;
  copyItem: (id: number) => Promise<void>;
  setConnectionState: (s: ConnectionState) => void;
  addSseEvent: (e: SseEvent) => void;
  prependItem: (item: ClipboardItem) => void;
  removeItem: (id: number) => void;
  reloadAll: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  hasMore: true,
  pageSize: 50,

  searchQuery: '',
  contentTypeFilter: null,
  favoriteOnly: false,

  tags: [],
  snippets: [],
  sourceRules: [],
  systemInfo: null,
  diagnostics: null,
  stats: null,
  config: {},

  connectionState: 'disconnected',
  sseEvents: [],

  setSearch: (q) => set({ searchQuery: q }),
  setContentTypeFilter: (t) => set({ contentTypeFilter: t, items: [], hasMore: true }),
  setFavoriteOnly: (f) => set({ favoriteOnly: f, items: [], hasMore: true }),

  loadItems: async (reset = false) => {
    const { pageSize, contentTypeFilter, favoriteOnly, items } = get();
    const offset = reset ? 0 : items.length;
    if (reset) set({ loading: true, error: null });
    try {
      const result = await api.listClipboard({
        limit: pageSize,
        offset,
        contentType: contentTypeFilter || undefined,
        favoriteOnly: favoriteOnly || undefined,
      });
      set({
        items: reset ? result : [...items, ...result],
        hasMore: result.length === pageSize,
        loading: false,
      });
    } catch (e: unknown) {
      const err = e as { message?: string };
      set({ error: err.message || 'Failed to load items', loading: false });
    }
  },

  searchItems: async (q: string) => {
    set({ loading: true, error: null, searchQuery: q });
    try {
      const result = await api.searchClipboard(q, {
        contentType: get().contentTypeFilter || undefined,
        favoriteOnly: get().favoriteOnly || undefined,
        limit: 100,
      });
      set({ items: result, hasMore: false, loading: false });
    } catch (e: unknown) {
      const err = e as { message?: string };
      set({ error: err.message || 'Search failed', loading: false });
    }
  },

  loadMore: async () => {
    const { loading, hasMore, searchQuery } = get();
    if (loading || !hasMore || searchQuery) return;
    await get().loadItems(false);
  },

  refreshMeta: async () => {
    try {
      const [tags, snippets, rules, sysInfo, diag] = await Promise.all([
        api.listTags(),
        api.listSnippets(),
        api.listSourceRules(),
        api.getSystemInfo(),
        api.getDiagnostics(),
      ]);
      set({ tags, snippets, sourceRules: rules, systemInfo: sysInfo, diagnostics: diag });
    } catch { /* non-fatal */ }
  },

  loadStats: async () => {
    try {
      const stats = await api.getStats();
      set({ stats });
    } catch { /* non-fatal */ }
  },

  loadConfig: async () => {
    try {
      const config = await api.getConfig();
      set({ config });
    } catch { /* non-fatal */ }
  },

  deleteItem: async (id: number) => {
    await api.deleteClipboard(id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    get().loadStats();
  },

  toggleFavorite: async (id: number) => {
    const updated = await api.toggleFavorite(id);
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? updated : i)),
    }));
  },

  copyItem: async (id: number) => {
    await api.copyItem(id);
  },

  setConnectionState: (s) => set({ connectionState: s }),
  addSseEvent: (e) => set((st) => ({
    sseEvents: [e, ...st.sseEvents].slice(0, 200),
  })),
  prependItem: (item) => set((s) => {
    if (s.items.some((i) => i.id === item.id)) return {};
    return { items: [item, ...s.items] };
  }),
  removeItem: (id) => set((s) => ({
    items: s.items.filter((i) => i.id !== id),
  })),

  reloadAll: async () => {
    set({ loading: true });
    await Promise.all([
      get().loadItems(true),
      get().refreshMeta(),
      get().loadStats(),
      get().loadConfig(),
    ]);
    set({ loading: false });
  },
}));
