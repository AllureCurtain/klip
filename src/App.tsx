import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useClipboardStore } from './stores/clipboardStore';
import { Header } from './components/layout/Header';
import { ClipboardList } from './components/clipboard/ClipboardList';
import { EmptyState } from './components/layout/EmptyState';
import { onClipboardCleared } from '@/lib/tauri';
import type { ClipboardItem } from './types';

const SEARCH_DEBOUNCE_MS = 150;

function App() {
  const { items, loading, error, fetchItems, searchItems, addItems, setItems } =
    useClipboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [contentType, setContentType] = useState<string | null>(null);

  useEffect(() => {
    fetchItems().catch((e) => {
      console.error('Failed to fetch items:', e);
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
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [searchQuery, contentType, fetchItems, searchItems]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} contentType={contentType} onContentTypeChange={setContentType} />
      <main className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            加载中...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-destructive">
            错误: {error}
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <ClipboardList items={items} />
        )}
      </main>
    </div>
  );
}

export default App;
