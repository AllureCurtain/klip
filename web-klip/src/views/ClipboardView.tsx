import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/stores';
import { api, imageUrl, thumbnailUrl } from '@/lib/api';
import { formatTime, formatSize, truncate, parseMetadata } from '@/lib/utils';
import type { ClipboardItem, OcrState } from '@/types';
import {
  Star, Copy, Trash, FileText, Image as ImageIcon, Files, X, Tag,
  CheckSquare, Square, Scan, ArrowClockwise,
} from '@phosphor-icons/react';
import { Thumbnail, EmptyState, ErrorState, SkeletonCard, ConfirmDialog } from '@/components/ui';

const TypeIcon = ({ type }: { type: string }) => {
  const size = 14;
  switch (type) {
    case 'image': return <ImageIcon size={size} className="text-violet-600" />;
    case 'file': return <Files size={size} className="text-orange-600" />;
    default: return <FileText size={size} className="text-teal-600" />;
  }
};

const ocrBadge = (ocr: OcrState | null) => {
  if (!ocr) return null;
  const map = {
    pending: { label: 'OCR pending', cls: 'bg-amber-50 text-amber-700' },
    completed: { label: 'OCR done', cls: 'bg-emerald-50 text-emerald-700' },
    failed: { label: 'OCR failed', cls: 'bg-red-50 text-red-700' },
  } as const;
  const style = map[ocr.status];
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${style.cls}`}>
      {style.label}
    </span>
  );
};

function ItemCard({
  item,
  onSelect,
  onDelete,
  selected,
  selectionMode,
}: {
  item: ClipboardItem;
  onSelect: () => void;
  onDelete: () => void;
  selected: boolean;
  selectionMode: boolean;
}) {
  const toggleFav = useStore((s) => s.toggleFavorite);
  const copyItem = useStore((s) => s.copyItem);
  const toggleSelection = useStore((s) => s.toggleSelection);
  const selectedIds = useStore((s) => s.selectedIds);
  const pushToast = useStore((s) => s.pushToast);
  const [copied, setCopied] = useState(false);

  const isImage = item.content_type === 'image';
  const preview = item.preview || truncate(item.content, 200) || '(no preview)';
  const isSelected = selectedIds.includes(item.id);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await copyItem(item.id);
      setCopied(true);
      pushToast('success', 'Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch (err: unknown) {
      const e = err as { message?: string };
      pushToast('error', e.message || 'Copy failed (desktop app required)');
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  const handleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleFav(item.id);
  };

  return (
    <div
      onClick={() => (selectionMode ? toggleSelection(item.id) : onSelect())}
      className={`group relative border rounded-lg p-3 cursor-pointer transition-all
        ${selected ? 'border-teal-500 bg-teal-50/50' : isSelected ? 'border-teal-400 bg-teal-50/30' : 'border-ink-200 bg-white hover:border-ink-300'}`}
    >
      <div className="flex items-start gap-3">
        {selectionMode && (
          <span className="mt-0.5 text-teal-600">
            {isSelected ? <CheckSquare size={16} weight="fill" /> : <Square size={16} className="text-ink-300" />}
          </span>
        )}
        <div className="mt-0.5"><TypeIcon type={item.content_type} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono text-ink-400">#{item.id}</span>
            <span className="text-xs text-ink-400">{formatTime(item.created_at)}</span>
            <span className="text-xs text-ink-400">{formatSize(item.size)}</span>
            {item.is_sensitive && (
              <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-700 rounded">sensitive</span>
            )}
            {ocrBadge(item.ocr)}
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
          {isImage ? (
            <div className="mt-1">
              <Thumbnail
                src={thumbnailUrl(item)}
                alt={item.preview || `clipboard image #${item.id}`}
                className="max-h-40 border border-ink-100 rounded"
              />
            </div>
          ) : (
            <div className="text-xs text-ink-700 break-words line-clamp-3 whitespace-pre-wrap">
              {item.content_type === 'file'
                ? <span className="text-ink-500">{preview}</span>
                : preview}
            </div>
          )}
        </div>
        {!selectionMode && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={handleFav} aria-label={item.is_favorited ? 'Remove from favorites' : 'Add to favorites'} title={item.is_favorited ? 'Unfavorite' : 'Favorite'}
              className="p-1 hover:bg-ink-100 rounded">
              {item.is_favorited
                ? <Star size={14} className="text-amber-500" weight="fill" />
                : <Star size={14} className="text-ink-400" />}
            </button>
            <button onClick={handleCopy} aria-label="Copy to system clipboard" title="Copy"
              className="p-1 hover:bg-ink-100 rounded">
              <Copy size={14} className={copied ? 'text-teal-600' : 'text-ink-400'} />
            </button>
            <button onClick={handleDelete} aria-label="Delete item" title="Delete"
              className="p-1 hover:bg-red-50 rounded">
              <Trash size={14} className="text-ink-400 hover:text-red-600" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function OcrPanel({ item }: { item: ClipboardItem }) {
  const [ocr, setOcr] = useState<OcrState | null>(item.ocr);
  const [busy, setBusy] = useState(false);
  const pushToast = useStore((s) => s.pushToast);
  const updateItem = useStore((s) => s.updateItem);

  useEffect(() => { setOcr(item.ocr); }, [item.ocr]);

  // Live-refresh while a recognition job is pending.
  useEffect(() => {
    if (ocr?.status !== 'pending') return;
    const timer = setInterval(async () => {
      try {
        const fresh = await api.getOcr(item.id);
        setOcr(fresh);
        if (fresh.status !== 'pending') {
          updateItem({ ...item, ocr: fresh });
        }
      } catch { /* stop polling on error */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [ocr?.status, item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const trigger = async () => {
    setBusy(true);
    try {
      const fresh = await api.triggerOcr(item.id);
      setOcr(fresh);
      pushToast('success', 'OCR job queued');
    } catch (err: unknown) {
      const e = err as { body?: { message?: string }; message?: string };
      pushToast('error', e.body?.message || e.message || 'Could not start OCR');
    } finally {
      setBusy(false);
    }
  };

  if (item.content_type !== 'image') return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-ink-400 uppercase tracking-wide">OCR</div>
        <button
          onClick={trigger}
          disabled={busy || ocr?.status === 'pending'}
          className="flex items-center gap-1 text-[11px] px-2 py-1 bg-ink-100 hover:bg-ink-200 rounded-md text-ink-700 disabled:opacity-50"
          title="Run OCR again on this image"
        >
          {ocr?.status === 'pending'
            ? <ArrowClockwise size={12} className="animate-spin" />
            : <Scan size={12} />}
          {ocr?.status === 'pending' ? 'Recognizing…' : 'Recognize text'}
        </button>
      </div>
      {!ocr && <div className="text-xs text-ink-400">No OCR state.</div>}
      {ocr?.status === 'completed' && (
        <pre className="text-xs font-mono bg-ink-50 p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap break-all text-ink-800">{ocr.text}</pre>
      )}
      {ocr?.status === 'pending' && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded p-2">Waiting for recognition…</div>
      )}
      {ocr?.status === 'failed' && (
        <div className="text-xs text-red-700 bg-red-50 rounded p-2 break-words">{ocr.error || 'Recognition failed'}</div>
      )}
    </div>
  );
}

function TagEditor({ item, onChanged }: { item: ClipboardItem; onChanged: () => void }) {
  const tags = useStore((s) => s.tags);
  const pushToast = useStore((s) => s.pushToast);
  const [busy, setBusy] = useState<number | null>(null);

  const assign = async (tagId: number) => {
    setBusy(tagId);
    try {
      await api.assignTag(item.id, tagId);
      onChanged();
    } catch (e: unknown) {
      pushToast('error', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const remove = async (tagId: number) => {
    setBusy(tagId);
    try {
      await api.removeTag(item.id, tagId);
      onChanged();
    } catch (e: unknown) {
      pushToast('error', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const assigned = new Set(item.tags.map((t) => t.id));

  return (
    <div>
      <div className="text-xs text-ink-400 uppercase tracking-wide mb-1">Tags</div>
      {item.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-2">
          {item.tags.map((t) => (
            <span key={t.id} className="text-xs px-2 py-0.5 bg-ink-100 rounded-full flex items-center gap-1">
              {t.name}
              <button
                onClick={() => remove(t.id)}
                aria-label={`Remove tag ${t.name}`}
                title="Remove tag"
                className="hover:text-red-600 disabled:opacity-50"
                disabled={busy === t.id}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {tags.filter((t) => !assigned.has(t.id)).map((t) => (
          <button
            key={t.id}
            onClick={() => assign(t.id)}
            disabled={busy === t.id}
            title={`Assign tag ${t.name}`}
            aria-label={`Assign tag ${t.name}`}
            className="text-[11px] px-2 py-0.5 border border-dashed border-ink-300 rounded-full text-ink-500 hover:border-teal-500 hover:text-teal-700 disabled:opacity-50"
          >
            + {t.name}
          </button>
        ))}
        {tags.length === 0 && <span className="text-xs text-ink-400">No tags defined yet.</span>}
      </div>
    </div>
  );
}

function DetailPanel({ item, onClose }: { item: ClipboardItem; onClose: () => void }) {
  const meta = parseMetadata(item.metadata);
  const [version, setVersion] = useState(item);
  const pushToast = useStore((s) => s.pushToast);
  useEffect(() => setVersion(item), [item]);

  return (
    <div className="border-l border-ink-200 bg-white w-96 flex-shrink-0 flex flex-col min-h-dvh">
      <div className="flex items-center justify-between p-4 border-b border-ink-100">
        <h3 className="text-sm font-semibold text-ink-800">Item #{item.id}</h3>
        <button onClick={onClose} aria-label="Close detail panel" title="Close"
          className="p-1 hover:bg-ink-100 rounded"><X size={16} /></button>
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
            ...(item.source_application ? [['Source app', item.source_application] as [string, string]] : []),
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-ink-400 uppercase tracking-wide">{k}</div>
              <div className="text-ink-700 font-mono truncate" title={v}>{v}</div>
            </div>
          ))}
        </div>
        {item.sensitivity_reason && (
          <div className="text-xs p-2 bg-red-50 text-red-700 rounded">{item.sensitivity_reason}</div>
        )}
        {item.content_type === 'image' && (
          <div>
            <div className="text-xs text-ink-400 uppercase tracking-wide mb-1">Image</div>
            <Thumbnail
              src={imageUrl(item)}
              alt={item.preview || `clipboard image #${item.id}`}
              className="max-h-96 w-full border border-ink-100 rounded"
            />
          </div>
        )}
        <OcrPanel item={version} />
        <TagEditor item={version} onChanged={async () => {
          try {
            const fresh = await api.getClipboard(item.id);
            setVersion(fresh);
            useStore.getState().updateItem(fresh);
          } catch (e: unknown) {
            pushToast('error', (e as Error).message);
          }
        }} />
        {meta && (
          <div>
            <div className="text-xs text-ink-400 uppercase tracking-wide mb-1">Metadata</div>
            <pre className="text-xs font-mono bg-ink-50 p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div>
        )}
        {item.content_type !== 'image' && (
          <div>
            <div className="text-xs text-ink-400 uppercase tracking-wide mb-1">Content</div>
            <div className="text-xs font-mono bg-ink-50 p-3 rounded overflow-auto max-h-96 whitespace-pre-wrap break-all text-ink-800">
              {item.content}
            </div>
          </div>
        )}
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
  const tagFilter = useStore((s) => s.tagFilter);
  const setTagFilter = useStore((s) => s.setTagFilter);
  const tags = useStore((s) => s.tags);
  const selectionMode = useStore((s) => s.selectionMode);
  const setSelectionMode = useStore((s) => s.setSelectionMode);
  const selectedIds = useStore((s) => s.selectedIds);
  const clearSelection = useStore((s) => s.clearSelection);
  const toggleSelection = useStore((s) => s.toggleSelection);
  const pushToast = useStore((s) => s.pushToast);
  const focusItemId = useStore((s) => s.focusItemId);
  const setFocusItemId = useStore((s) => s.setFocusItemId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: 'delete-one'; id: number } | { kind: 'delete-batch' } | { kind: 'clear' }>(null);

  useEffect(() => { loadItems(true); }, [contentTypeFilter, favoriteOnly, tagFilter, loadItems]);

  // Cross-view navigation (e.g. from a QA reference).
  useEffect(() => {
    if (focusItemId != null) {
      setSelectedId(focusItemId);
      setFocusItemId(null);
    }
  }, [focusItemId, setFocusItemId]);

  const selectedItem = items.find((i) => i.id === selectedId) || null;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) loadMore();
  }, [loadMore]);

  const runBatchFavorite = async (fav: boolean) => {
    try {
      const r = await api.batchFavorite(selectedIds, fav);
      pushToast('success', `${r.count} item(s) ${fav ? 'favorited' : 'unfavorited'}`);
      await loadItems(true);
      clearSelection();
    } catch (e: unknown) {
      pushToast('error', (e as Error).message);
    }
  };

  const runBatchDelete = async () => {
    try {
      const r = await api.batchDelete(selectedIds);
      pushToast('success', `${r.count} item(s) deleted`);
      await loadItems(true);
      clearSelection();
    } catch (e: unknown) {
      pushToast('error', (e as Error).message);
    }
  };

  const runSingleDelete = async (id: number) => {
    try {
      await api.deleteClipboard(id);
      pushToast('success', `Item #${id} deleted`);
      if (selectedId === id) setSelectedId(null);
      await loadItems(true);
    } catch (e: unknown) {
      pushToast('error', (e as Error).message);
    }
  };

  const typeFilters = [
    { v: null, label: 'All' },
    { v: 'text', label: 'Text' },
    { v: 'image', label: 'Images' },
    { v: 'file', label: 'Files' },
  ];

  return (
    <div className="flex flex-1 min-h-dvh overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-200 bg-white flex-wrap">
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
            aria-pressed={favoriteOnly}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-colors
              ${favoriteOnly ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
          >
            <Star size={12} weight={favoriteOnly ? 'fill' : 'regular'} /> Favorites
          </button>
          {tags.length > 0 && (
            <select
              value={tagFilter ?? ''}
              onChange={(e) => setTagFilter(e.target.value ? Number(e.target.value) : null)}
              aria-label="Filter by tag"
              className="text-xs border border-ink-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-teal-500"
            >
              <option value="">All tags</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <div className="ml-auto flex items-center gap-2">
            {selectionMode && (
              <>
                <span className="text-xs text-ink-500">{selectedIds.length} selected</span>
                <button
                  onClick={() => runBatchFavorite(true)}
                  disabled={selectedIds.length === 0}
                  className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded-md disabled:opacity-40"
                >Favorite</button>
                <button
                  onClick={() => setConfirm({ kind: 'delete-batch' })}
                  disabled={selectedIds.length === 0}
                  className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded-md disabled:opacity-40"
                >Delete</button>
                <button
                  onClick={clearSelection}
                  className="text-xs px-2 py-1 text-ink-500 hover:bg-ink-100 rounded-md"
                >Exit</button>
              </>
            )}
            {!selectionMode && (
              <button
                onClick={() => setSelectionMode(true)}
                className="text-xs px-2 py-1 text-ink-600 bg-ink-100 hover:bg-ink-200 rounded-md"
                title="Select multiple items"
              >Select</button>
            )}
            <span className="text-xs text-ink-400">{items.length} items</span>
          </div>
        </div>

        {selectionMode && (
          <div className="px-4 py-1.5 bg-ink-50 border-b border-ink-200 text-xs text-ink-500 flex items-center gap-2">
            <button onClick={() => items.forEach((i) => !selectedIds.includes(i.id) && toggleSelection(i.id))}
              className="underline hover:text-ink-700">Select all</button>
            <button onClick={clearSelection} className="underline hover:text-ink-700">Clear</button>
          </div>
        )}

        {error && <ErrorState message={error} onRetry={() => loadItems(true)} />}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" onScroll={handleScroll}>
          {loading && items.length === 0 && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          )}
          {!loading && items.length === 0 && !error && (
            <EmptyState
              icon={<FileText size={48} />}
              title="No clipboard items yet"
              hint="Copy something on the desktop app to get started. Items appear here in real time."
            />
          )}
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              selectionMode={selectionMode}
              onSelect={() => setSelectedId(selectedId === item.id ? null : item.id)}
              onDelete={() => setConfirm({ kind: 'delete-one', id: item.id })}
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

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === 'clear' ? 'Clear all history?' : 'Delete items?'}
        message={
          confirm?.kind === 'delete-batch'
            ? `This permanently deletes ${selectedIds.length} item(s). This cannot be undone.`
            : confirm?.kind === 'clear'
              ? 'This permanently deletes ALL clipboard history. This cannot be undone.'
              : 'This permanently deletes the item. This cannot be undone.'
        }
        confirmLabel={confirm?.kind === 'clear' ? 'Clear all' : 'Delete'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'delete-batch') void runBatchDelete();
          else if (confirm?.kind === 'delete-one') void runSingleDelete(confirm.id);
          setConfirm(null);
        }}
      />
    </div>
  );
}
