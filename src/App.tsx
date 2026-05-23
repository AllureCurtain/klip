import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { useClipboardStore } from './stores/clipboardStore';
import { Header } from './components/layout/Header';
import { ClipboardList } from './components/clipboard/ClipboardList';
import { EmptyState } from './components/layout/EmptyState';
import { SettingsView } from './components/settings/SettingsView';
import { onClipboardCleared, onConfigChanged, configApi } from '@/lib/tauri';
import { setLanguage, type SupportedLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import type { ClipboardItem } from './types';

const DEFAULT_SEARCH_DEBOUNCE_MS = 150;

type AppView = 'clipboard' | 'settings';

function App() {
  const { t } = useTranslation();
  const {
    items,
    tags,
    loading,
    error,
    fetchItems,
    searchItems,
    addItems,
    setItems,
    fetchTags,
    clearSelection,
  } =
    useClipboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [contentType, setContentType] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [searchDebounceMs, setSearchDebounceMs] = useState(DEFAULT_SEARCH_DEBOUNCE_MS);
  const [view, setView] = useState<AppView>('clipboard');

  useEffect(() => {
    fetchItems();
    fetchTags();

    configApi.get('search_debounce_ms').then((value) => {
      if (value) {
        const ms = parseInt(value, 10);
        if (!isNaN(ms) && ms > 0) {
          setSearchDebounceMs(ms);
        }
      }
    });

    configApi.get('language').then((value) => {
      if (value && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)) {
        setLanguage(value as SupportedLanguage);
      }
    });

    const unlistenPromise = listen<ClipboardItem>('clipboard-updated', (event) => {
      addItems([event.payload]);
    });

    const unlistenClearedPromise = onClipboardCleared(() => {
      setItems([]);
    });

    const unlistenConfigPromise = onConfigChanged((key, value) => {
      if (key === 'search_debounce_ms') {
        const ms = parseInt(value, 10);
        if (!isNaN(ms) && ms > 0) {
          setSearchDebounceMs(ms);
        }
      } else if (key === 'language' && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)) {
        setLanguage(value as SupportedLanguage);
      }
    });

    return () => {
      unlistenPromise.then((fn) => fn());
      unlistenClearedPromise.then((fn) => fn());
      unlistenConfigPromise.then((fn) => fn());
    };
  }, [fetchItems, fetchTags, addItems, setItems]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    const options = {
      contentType: contentType as 'text' | 'image' | 'file' | null,
      favoriteOnly: showFavorites,
      tagId: selectedTagId,
    };
    const handle = window.setTimeout(() => {
      if (trimmed === '') {
        fetchItems(options);
      } else {
        searchItems(trimmed, options);
      }
    }, searchDebounceMs);

    return () => window.clearTimeout(handle);
  }, [searchQuery, contentType, showFavorites, selectedTagId, fetchItems, searchItems, searchDebounceMs]);

  useEffect(() => {
    if (!selectionMode) {
      clearSelection();
    }
  }, [clearSelection, selectionMode]);

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
        tags={tags}
        selectedTagId={selectedTagId}
        onSelectedTagChange={setSelectedTagId}
        selectionMode={selectionMode}
        onSelectionModeChange={setSelectionMode}
        onSettingsOpen={() => setView('settings')}
      />
      <main className="flex-1 overflow-hidden">
        {loading ? (
          <div
            role="status"
            className="flex flex-col items-start px-3 py-4 text-muted-foreground"
          >
            <p className="text-xs font-medium">{t('app.loading')}</p>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex flex-col items-start px-3 py-4 text-destructive"
          >
            <p className="text-xs font-medium">{t('app.errorLabel')}</p>
            <p className="mt-1 text-[11px] text-destructive/80">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <EmptyState showFavorites={showFavorites} />
        ) : (
          <ClipboardList items={items} selectionMode={selectionMode} />
        )}
      </main>
    </div>
  );
}

export default App;
