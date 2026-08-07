import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { motion } from 'framer-motion';
import { useClipboardStore } from './stores/clipboardStore';
import { Header } from './components/layout/Header';
import type { HeaderAdvancedFilters } from './components/layout/Header';
import { ClipboardList } from './components/clipboard/ClipboardList';
import { EmptyState } from './components/layout/EmptyState';
import type { SettingsTab } from './components/settings/SettingsView';
import { useProductivityStore } from './stores/productivityStore';
import {
  onClipboardCleared,
  onClipboardItemUpdated,
  onConfigChanged,
  onOpenAbout,
  onOpenSettings,
  clipboardApi,
  configApi,
} from '@/lib/tauri';
import { springs, windowVariants } from '@/lib/motion';
import { clipboardItemMatchesNonSearchFilters } from '@/lib/clipboardFilters';
import { setLanguage, type SupportedLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { CONFIG_KEYS } from '@/stores/configSchema';
import type { ClipboardItem, ClipboardQueryOptions } from './types';

const DEFAULT_SEARCH_DEBOUNCE_MS = 150;

type AppView = 'clipboard' | 'settings';

const SettingsView = lazy(() =>
  import('./components/settings/SettingsView').then((module) => ({
    default: module.SettingsView,
  }))
);

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
    upsertItem,
    setItems,
    fetchTags,
    clearSelection,
  } =
    useClipboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [contentType, setContentType] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<HeaderAdvancedFilters>({
    sensitiveOnly: null,
    exactMatch: false,
    createdAfter: null,
    createdBefore: null,
  });
  const [selectionMode, setSelectionMode] = useState(false);
  const [searchDebounceMs, setSearchDebounceMs] = useState(DEFAULT_SEARCH_DEBOUNCE_MS);
  const [searchResultsRevision, setSearchResultsRevision] = useState(0);
  const [view, setView] = useState<AppView>('clipboard');
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('general');
  const fetchProductivity = useProductivityStore((state) => state.fetchProductivity);
  const queryOptions = useMemo<ClipboardQueryOptions>(
    () => ({
      contentType: contentType as 'text' | 'image' | 'file' | null,
      favoriteOnly: showFavorites,
      tagId: selectedTagId,
      sensitiveOnly: advancedFilters.sensitiveOnly ?? null,
      exactMatch: advancedFilters.exactMatch ?? false,
      createdAfter: advancedFilters.createdAfter ?? null,
      createdBefore: advancedFilters.createdBefore ?? null,
    }),
    [
      advancedFilters.createdAfter,
      advancedFilters.createdBefore,
      advancedFilters.exactMatch,
      advancedFilters.sensitiveOnly,
      contentType,
      selectedTagId,
      showFavorites,
    ]
  );

  useEffect(() => {
    fetchItems();
    fetchTags();
    fetchProductivity();

    configApi.get(CONFIG_KEYS.searchDebounceMs).then((value) => {
      if (value) {
        const ms = parseInt(value, 10);
        if (!isNaN(ms) && ms > 0) {
          setSearchDebounceMs(ms);
        }
      }
    });

    configApi.get(CONFIG_KEYS.language).then((value) => {
      if (value && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)) {
        setLanguage(value as SupportedLanguage);
      }
    });

    const unlistenClearedPromise = onClipboardCleared(() => {
      setItems([]);
    });

    const unlistenConfigPromise = onConfigChanged((key, value) => {
      if (key === CONFIG_KEYS.searchDebounceMs) {
        const ms = parseInt(value, 10);
        if (!isNaN(ms) && ms > 0) {
          setSearchDebounceMs(ms);
        }
      } else if (key === CONFIG_KEYS.language && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)) {
        setLanguage(value as SupportedLanguage);
      } else if (
        key === CONFIG_KEYS.clipboardMonitorEnabled ||
        key === CONFIG_KEYS.privacyModeUntil
      ) {
        void fetchProductivity();
      }
    });

    const unlistenSettingsPromise = onOpenSettings(() => {
      setSettingsInitialTab('general');
      setView('settings');
    });

    const unlistenAboutPromise = onOpenAbout(() => {
      setSettingsInitialTab('about');
      setView('settings');
    });

    return () => {
      unlistenClearedPromise.then((fn) => fn());
      unlistenConfigPromise.then((fn) => fn());
      unlistenSettingsPromise.then((fn) => fn());
      unlistenAboutPromise.then((fn) => fn());
    };
  }, [fetchItems, fetchProductivity, fetchTags, setItems]);

  useEffect(() => {
    const visibleIds =
      view === 'clipboard' ? items.slice(0, 9).map((item) => item.id) : [];
    void clipboardApi.setVisibleItems(visibleIds).catch((syncError) => {
      console.error('Failed to sync visible clipboard items', syncError);
    });
  }, [items, view]);

  useEffect(() => {
    const hasActiveSearch = searchQuery.trim() !== '';
    const refreshSearchResults = () =>
      setSearchResultsRevision((revision) => revision + 1);
    const unlistenPromise = listen<ClipboardItem>('clipboard-updated', (event) => {
      if (hasActiveSearch) {
        refreshSearchResults();
      } else if (clipboardItemMatchesNonSearchFilters(event.payload, queryOptions)) {
        addItems([event.payload]);
      }
    });
    const unlistenItemUpdatedPromise = onClipboardItemUpdated((item) => {
      if (hasActiveSearch) {
        refreshSearchResults();
      } else if (clipboardItemMatchesNonSearchFilters(item, queryOptions)) {
        upsertItem(item);
      }
    });

    return () => {
      unlistenPromise.then((fn) => fn());
      unlistenItemUpdatedPromise.then((fn) => fn());
    };
  }, [
    addItems,
    queryOptions,
    searchQuery,
    upsertItem,
  ]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    const handle = window.setTimeout(() => {
      if (trimmed === '') {
        fetchItems(queryOptions);
      } else {
        searchItems(trimmed, queryOptions);
      }
    }, searchDebounceMs);

    return () => window.clearTimeout(handle);
  }, [
    fetchItems,
    queryOptions,
    searchQuery,
    searchResultsRevision,
    searchItems,
    searchDebounceMs,
  ]);

  useEffect(() => {
    if (!selectionMode) {
      clearSelection();
    }
  }, [clearSelection, selectionMode]);

  if (view === 'settings') {
    return (
      <Suspense
        fallback={
          <div
            role="status"
            className="flex min-h-dvh items-start px-3 py-4 text-xs text-muted-foreground"
          >
            {t('app.loading')}
          </div>
        }
      >
        <SettingsView
          initialTab={settingsInitialTab}
          onBack={() => setView('clipboard')}
        />
      </Suspense>
    );
  }

  return (
    <motion.div
      variants={windowVariants}
      initial="initial"
      animate="animate"
      transition={springs.snappy}
      className="flex min-h-dvh flex-col text-foreground"
    >
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
        advancedFilters={advancedFilters}
        onAdvancedFiltersChange={setAdvancedFilters}
        selectionMode={selectionMode}
        onSelectionModeChange={setSelectionMode}
        onSettingsOpen={() => {
          setSettingsInitialTab('general');
          setView('settings');
        }}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading && (
          <div
            role="status"
            className="flex shrink-0 flex-col items-start border-b border-border/50 px-3 py-2 text-muted-foreground"
          >
            <p className="text-xs font-medium">{t('app.loading')}</p>
          </div>
        )}
        {!loading && error && (
          <div
            role="alert"
            className="flex shrink-0 flex-col items-start border-b border-destructive/20 px-3 py-2 text-destructive"
          >
            <p className="text-xs font-medium">{t('app.errorLabel')}</p>
            <p className="mt-1 text-[11px] text-destructive/80">{error}</p>
          </div>
        )}
        <div className="min-h-0 flex-1">
          {items.length > 0 ? (
            <ClipboardList items={items} selectionMode={selectionMode} />
          ) : !loading && !error ? (
            <EmptyState showFavorites={showFavorites} />
          ) : null}
        </div>
      </main>
    </motion.div>
  );
}

export default App;
