import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useClipboardStore } from './stores/clipboardStore';
import { Header } from './components/layout/Header';
import { ClipboardList } from './components/clipboard/ClipboardList';
import { EmptyState } from './components/layout/EmptyState';
import type { ClipboardItem } from './types';

const SEARCH_DEBOUNCE_MS = 150;

function App() {
  const { items, loading, error, fetchItems, searchItems, addItems } =
    useClipboardStore();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // 加载剪贴板历史
    fetchItems().catch((e) => {
      console.error('Failed to fetch items:', e);
    });

    // 监听剪贴板更新事件
    const unlistenPromise = listen<ClipboardItem>('clipboard-updated', (event) => {
      addItems([event.payload]);
    });

    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [fetchItems, addItems]);

  // 搜索：带防抖，走后端 SQL LIKE（覆盖 preview + content），
  // 而不是客户端 filter（之前只能查到列表里已加载的 100 条 preview）。
  useEffect(() => {
    const trimmed = searchQuery.trim();
    const handle = window.setTimeout(() => {
      if (trimmed === '') {
        fetchItems().catch((e) => console.error('Failed to fetch items:', e));
      } else {
        searchItems(trimmed).catch((e) =>
          console.error('Failed to search items:', e)
        );
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [searchQuery, fetchItems, searchItems]);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <main className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">加载中...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-500">错误: {error}</div>
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
