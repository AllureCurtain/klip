import { useState, useEffect, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useClipboardStore } from './stores/clipboardStore';
import { Header } from './components/layout/Header';
import { ClipboardList } from './components/clipboard/ClipboardList';
import { EmptyState } from './components/layout/EmptyState';
import { SettingsView } from './components/settings/SettingsView';
import { onClipboardCleared, onConfigChanged, configApi } from '@/lib/tauri';
import type { ClipboardItem } from './types';

const DEFAULT_SEARCH_DEBOUNCE_MS = 150;

type AppView = 'clipboard' | 'settings';

function App() {
  const { items, loading, error, fetchItems, searchItems, addItems, setItems } =
    useClipboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [contentType, setContentType] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [searchDebounceMs, setSearchDebounceMs] = useState(DEFAULT_SEARCH_DEBOUNCE_MS);
  const [view, setView] = useState<AppView>('clipboard');

  useEffect(() => {
    fetchItems();

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

    const unlistenConfigPromise = onConfigChanged((key, value) => {
      if (key !== 'search_debounce_ms') return;
      const ms = parseInt(value, 10);
      if (!isNaN(ms) && ms > 0) {
        setSearchDebounceMs(ms);
      }
    });

    return () => {
      unlistenPromise.then((fn) => fn());
      unlistenClearedPromise.then((fn) => fn());
      unlistenConfigPromise.then((fn) => fn());
    };
  }, [fetchItems, addItems, setItems]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    const handle = window.setTimeout(() => {
      if (trimmed === '') {
        fetchItems(contentType);
      } else {
        searchItems(trimmed, contentType ?? undefined);
      }
    }, searchDebounceMs);

    return () => window.clearTimeout(handle);
  }, [searchQuery, contentType, fetchItems, searchItems, searchDebounceMs]);

  const filteredItems = useMemo(() => {
    if (!showFavorites) return items;
    return items.filter((item) => item.is_favorited);
  }, [items, showFavorites]);

  if (view === 'settings') {
    return (
      <SettingsView
        onBack={() => setView('clipboard')}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        contentType={contentType}
        onContentTypeChange={setContentType}
        showFavorites={showFavorites}
        onShowFavoritesChange={setShowFavorites}
        onSettingsOpen={() => setView('settings')}
      />
      <main className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            加载中...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-destructive text-sm">
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
