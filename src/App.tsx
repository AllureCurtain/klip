import { useState, useEffect, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useClipboardStore } from './stores/clipboardStore';
import { Header } from './components/layout/Header';
import { ClipboardList } from './components/clipboard/ClipboardList';
import { EmptyState } from './components/layout/EmptyState';
import { onClipboardCleared, configApi } from '@/lib/tauri';
import type { ClipboardItem } from './types';

const DEFAULT_SEARCH_DEBOUNCE_MS = 150;

function App() {
  const { items, loading, error, fetchItems, searchItems, addItems, setItems } =
    useClipboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [contentType, setContentType] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [searchDebounceMs, setSearchDebounceMs] = useState(DEFAULT_SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    fetchItems().catch((e) => {
      console.error('Failed to fetch items:', e);
    });

    // 读取搜索防抖配置
    configApi.get('search_debounce_ms').then((value) => {
      if (value) {
        const ms = parseInt(value, 10);
        if (!isNaN(ms) && ms > 0) {
          setSearchDebounceMs(ms);
        }
      }
    });

    const unlistenPromise = listen<ClipboardItem>('clipboard-updated', (event) => {
      addItems([event.payload]);
    });

    const unlistenClearedPromise = onClipboardCleared(() => {
      setItems([]);
    });

    return () => {
      unlistenPromise.then((fn) => fn());
      unlistenClearedPromise.then((fn) => fn());
    };
  }, [fetchItems, addItems, setItems]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    const handle = window.setTimeout(() => {
      if (trimmed === '') {
        fetchItems(contentType).catch((e) => console.error('Failed to fetch items:', e));
      } else {
        searchItems(trimmed, contentType ?? undefined).catch((e) =>
          console.error('Failed to search items:', e)
        );
      }
    }, searchDebounceMs);

    return () => window.clearTimeout(handle);
  }, [searchQuery, contentType, fetchItems, searchItems, searchDebounceMs]);

  // Filter items by favorites when showFavorites is true
  const filteredItems = useMemo(() => {
    if (!showFavorites) return items;
    return items.filter((item) => item.is_favorited);
  }, [items, showFavorites]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        contentType={contentType}
        onContentTypeChange={setContentType}
        showFavorites={showFavorites}
        onShowFavoritesChange={setShowFavorites}
      />
      <main className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            加载中...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-destructive">
            错误: {error}
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState showFavorites={showFavorites} />
        ) : (
          <ClipboardList items={filteredItems} />
        )}
      </main>
    </div>
  );
}

export default App;
