import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/stores';
import { api } from '@/lib/api';
import { formatTime, formatSize, truncate, parseMetadata } from '@/lib/utils';
import type { ClipboardItem } from '@/types';
import {
  Star, Copy, Trash, FileText, Image as ImageIcon, Files, X, Tag,
} from '@phosphor-icons/react';

const TypeIcon = ({ type }: { type: string }) => {
  const size = 14;
  switch (type) {
    case 'image': return <ImageIcon size={size} className="text-violet-600" />;
    case 'file': return <Files size={size} className="text-orange-600" />;
    default: return <FileText size={size} className="text-teal-600" />;
  }
};

function ItemCard({ item, onSelect, selected }: { item: ClipboardItem; onSelect: () => void; selected: boolean }) {
  const toggleFav = useStore((s) => s.toggleFavorite);
  const deleteItem = useStore((s) => s.deleteItem);
  const copyItem = useStore((s) => s.copyItem);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const meta = parseMetadata(item.metadata);
  const preview = item.preview || truncate(item.content, 200) || '(no preview)';

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await copyItem(item.id);
      setCopiedId(item.id);
      setToast('Copied!');
      setTimeout(() => { setCopiedId(null); setToast(null); }, 1500);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setToast(e.message || 'Copy failed (Tauri app required)');
      setTimeout(() => setToast(null), 2000);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this item?')) await deleteItem(item.id);
  };

  const handleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleFav(item.id);
  };

  return (
    <div
      onClick={onSelect}
      className={`group relative border rounded-lg p-3 cursor-pointer transition-all
        ${selected ? 'border-teal-500 bg-teal-50/50' : 'border-ink-200 bg-white hover:border-ink-300'}`}
    >
      {toast && (
        <div className="absolute -top-6 left-3 text-xs px-2 py-0.5 bg-ink-800 text-white rounded fade-in-up z-10">
          {toast}
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="mt-0.5"><TypeIcon type={item.content_type} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-ink-400">#{item.id}</span>
            <span className="text-xs text-ink-400">{formatTime(item.created_at)}</span>
            <span className="text-xs text-ink-400">{formatSize(item.size)}</span>
            {item.is_sensitive && (
              <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-700 rounded">sensitive</span>
            )}
            {item.tags.length > 0 && (
              <div className="flex gap-1">
                {item.tags.map((t) => (
                  <span key={t.id} className="text-xs px-1.5 py-0.5 bg-ink-100 text-ink-600 rounded flex items-center gap-1">
                    <Tag size={10} />{t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="text-xs text-ink-700 break-words line-clamp-3 whitespace-pre-wrap">
            {item.content_type === 'image'
              ? <span className="text-ink-500 italic">[Image: {meta ? (meta as Record<string,unknown>).width + 'x' + (meta as Record<string,unknown>).height : 'PNG'}]</span>
              : item.content_type === 'file'
              ? <span className="text-ink-500">{preview}</span>
              : preview
            }
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={handleFav} className="p-1 hover:bg-ink-100 rounded">
            {item.is_favorited
              ? <Star size={14} className="text-amber-500" weight="fill" />
              : <Star size={14} className="text-ink-400" />}
          </button>
          <button onClick={handleCopy} className="p-1 hover:bg-ink-100 rounded">
            <Copy size={14} className={copiedId === item.id ? 'text-teal-600' : 'text-ink-400'} />
          </button>
          <button onClick={handleDelete} className="p-1 hover:bg-red-50 rounded">
            <Trash size={14} className="text-ink-400 hover:text-red-600" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ item, onClose }: { item: ClipboardItem; onClose: () => void }) {
  const meta = parseMetadata(item.metadata);

  return (
    <div className="border-l border-ink-200 bg-white w-96 flex-shrink-0 flex flex-col min-h-dvh">
      <div className="flex items-center justify-between p-4 border-b border-ink-100">
        <h3 className="text-sm font-semibold text-ink-800">Item #{item.id}</h3>
        <button onClick={onClose} className="p-1 hover:bg-ink-100 rounded"><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['Type', item.content_type],
            ['Size', formatSize(item.size)],
            ['Favorite', item.is_favorited ? 'Yes' : 'No'],
            ['Sensitive', item.is_sensitive ? 'Yes' : 'No'],
            ['Created', formatTime(item.created_at)],
            ['Last used', formatTime(item.last_used_at)],
            ['Hash', truncate(item.hash, 16)],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-ink-400 uppercase tracking-wide">{k}</div>
              <div className="text-ink-700 font-mono">{v}</div>
            </div>
          ))}
        </div>
        {item.sensitivity_reason && (
          <div className="text-xs p-2 bg-red-50 text-red-700 rounded">
            {item.sensitivity_reason}
          </div>
        )}
        {item.tags.length > 0 && (
          <div>
            <div className="text-xs text-ink-400 uppercase tracking-wide mb-1">Tags</div>
            <div className="flex gap-1 flex-wrap">
              {item.tags.map((t) => (
                <span key={t.id} className="text-xs px-2 py-0.5 bg-ink-100 rounded">{t.name}</span>
              ))}
            </div>
          </div>
        )}
        {meta && (
          <div>
            <div className="text-xs text-ink-400 uppercase tracking-wide mb-1">Metadata</div>
            <pre className="text-xs font-mono bg-ink-50 p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div>
        )}
        <div>
          <div className="text-xs text-ink-400 uppercase tracking-wide mb-1">Content</div>
          <div className="text-xs font-mono bg-ink-50 p-3 rounded overflow-auto max-h-96 whitespace-pre-wrap break-all">
            {item.content_type === 'image'
              ? <img src={item.content} alt="clipboard" className="max-w-full rounded" />
              : item.content}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClipboardView() {
  const items = useStore((s) => s.items);
  const loading = useStore((s) => s.loading);
  const hasMore = useStore((s) => s.hasMore);
  const error = useStore((s) => s.error);
  const loadItems = useStore((s) => s.loadItems);
  const loadMore = useStore((s) => s.loadMore);
  const contentTypeFilter = useStore((s) => s.contentTypeFilter);
  const setContentTypeFilter = useStore((s) => s.setContentTypeFilter);
  const favoriteOnly = useStore((s) => s.favoriteOnly);
  const setFavoriteOnly = useStore((s) => s.setFavoriteOnly);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => { loadItems(true); }, [contentTypeFilter, favoriteOnly]);

  const selectedItem = items.find((i) => i.id === selectedId) || null;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) loadMore();
  }, [loadMore]);

  const typeFilters = [
    { v: null, label: 'All' },
    { v: 'text', label: 'Text' },
    { v: 'image', label: 'Images' },
    { v: 'file', label: 'Files' },
  ];

  return (
    <div className="flex flex-1 min-h-dvh overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-200 bg-white">
          <div className="flex gap-1">
            {typeFilters.map((f) => (
              <button
                key={f.label}
                onClick={() => setContentTypeFilter(f.v)}
                className={`px-3 py-1 text-xs rounded-md transition-colors
                  ${contentTypeFilter === f.v
                    ? 'bg-ink-900 text-white'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
              >{f.label}</button>
            ))}
          </div>
          <div className="w-px h-5 bg-ink-200" />
          <button
            onClick={() => setFavoriteOnly(!favoriteOnly)}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-colors
              ${favoriteOnly ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
          >
            <Star size={12} weight={favoriteOnly ? 'fill' : 'regular'} /> Favorites
          </button>
          <div className="ml-auto text-xs text-ink-400">{items.length} items</div>
        </div>

        {error && (
          <div className="m-4 p-3 bg-red-50 text-red-700 text-xs rounded border border-red-200">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" onScroll={handleScroll}>
          {loading && items.length === 0 && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="border border-ink-200 rounded-lg p-3">
                  <div className="shimmer h-3 w-24 rounded mb-2" />
                  <div className="shimmer h-3 w-full rounded mb-1" />
                  <div className="shimmer h-3 w-3/4 rounded" />
                </div>
              ))}
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-ink-400">
              <FileText size={48} className="mb-3 opacity-30" />
              <p className="text-sm">No clipboard items yet</p>
              <p className="text-xs mt-1">Copy something to get started</p>
            </div>
          )}
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onSelect={() => setSelectedId(selectedId === item.id ? null : item.id)}
            />
          ))}
          {loading && items.length > 0 && (
            <div className="text-center py-3 text-xs text-ink-400">Loading more…</div>
          )}
          {!hasMore && items.length > 0 && (
            <div className="text-center py-3 text-xs text-ink-300">End of history</div>
          )}
        </div>
      </div>
      {selectedItem && <DetailPanel item={selectedItem} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
