import { useState } from 'react';
import { api, thumbnailUrl } from '@/lib/api';
import { useStore } from '@/lib/stores';
import { formatTime, formatSize, truncate } from '@/lib/utils';
import type { ClipboardItem, ContentType } from '@/types';
import { MagnifyingGlass, FileText, Image as ImageIcon, Files, Star, XCircle, ArrowClockwise } from '@phosphor-icons/react';
import { Thumbnail, EmptyState, ErrorState } from '@/components/ui';

function toEpoch(value: string): number | undefined {
  if (!value) return undefined;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

export function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string>('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [exactMatch, setExactMatch] = useState(false);
  const [tagId, setTagId] = useState<number | undefined>();
  const [after, setAfter] = useState('');
  const [before, setBefore] = useState('');

  const tags = useStore((s) => s.tags);
  const setView = useStore((s) => s.setView);
  const setFocusItemId = useStore((s) => s.setFocusItemId);

  const hasFilters = contentType || favoriteOnly || sensitiveOnly || exactMatch || tagId || after || before;

  function reset() {
    setQuery(''); setContentType(''); setFavoriteOnly(false); setSensitiveOnly(false);
    setExactMatch(false); setTagId(undefined); setAfter(''); setBefore('');
    setResults([]); setSearched(false); setError(null);
  }

  async function doSearch(q?: string) {
    const searchQ = (q ?? query).trim();
    if (!searchQ) return;
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const r = await api.advancedSearch({
        query: searchQ,
        contentType: (contentType || undefined) as ContentType | undefined,
        favoriteOnly,
        sensitiveOnly: sensitiveOnly || undefined,
        tagId,
        exactMatch,
        createdAfter: toEpoch(after),
        createdBefore: toEpoch(before),
        limit: 100,
        offset: 0,
      });
      setResults(r);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-lg font-semibold text-ink-800 mb-1">Advanced Search</h2>
      <p className="text-xs text-ink-400 mb-5">Search clipboard history using backend full-text search</p>

      <div className="bg-white border border-ink-200 rounded-xl p-4 mb-5">
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              placeholder="Search clipboard content..."
              aria-label="Search query"
              className="w-full pl-9 pr-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <button
            onClick={() => doSearch()}
            disabled={loading || !query.trim()}
            className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <ArrowClockwise size={14} className="animate-spin" /> : <MagnifyingGlass size={14} />}
            Search
          </button>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            aria-label="Content type"
            className="text-xs border border-ink-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-teal-500 bg-white"
          >
            <option value="">All types</option>
            <option value="text">Text only</option>
            <option value="image">Images only</option>
            <option value="file">Files only</option>
          </select>
          {tags.length > 0 && (
            <select
              value={tagId ?? ''}
              onChange={(e) => setTagId(e.target.value ? Number(e.target.value) : undefined)}
              aria-label="Tag"
              className="text-xs border border-ink-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-teal-500 bg-white"
            >
              <option value="">All tags</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer">
            <input type="checkbox" checked={favoriteOnly} onChange={(e) => setFavoriteOnly(e.target.checked)} />
            Favorites only
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer">
            <input type="checkbox" checked={sensitiveOnly} onChange={(e) => setSensitiveOnly(e.target.checked)} />
            Sensitive only
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer">
            <input type="checkbox" checked={exactMatch} onChange={(e) => setExactMatch(e.target.checked)} />
            Exact match
          </label>
          <span className="text-xs text-ink-400">After</span>
          <input
            type="datetime-local"
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            aria-label="Created after"
            className="text-xs border border-ink-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-teal-500"
          />
          <span className="text-xs text-ink-400">Before</span>
          <input
            type="datetime-local"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            aria-label="Created before"
            className="text-xs border border-ink-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-teal-500"
          />
          {hasFilters && (
            <button onClick={reset} className="text-xs text-ink-400 hover:text-ink-600 flex items-center gap-1 ml-auto">
              <XCircle size={12} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => doSearch()} />}

      {searched && !loading && !error && results.length === 0 && (
        <EmptyState
          icon={<MagnifyingGlass size={48} />}
          title={`No results for "${query}"`}
          hint="Try a different term, or loosen the filters."
        />
      )}

      {searched && results.length > 0 && (
        <div className="text-xs text-ink-400 mb-2">{results.length} result(s)</div>
      )}

      <div className="space-y-2">
        {results.map((item) => (
          <button
            key={item.id}
            onClick={() => { setFocusItemId(item.id); setView('clipboard'); }}
            className="w-full text-left bg-white border border-ink-200 hover:border-teal-400 rounded-lg p-3 flex gap-3 transition-colors"
          >
            <div className="mt-0.5 shrink-0">
              {item.content_type === 'image' && <ImageIcon size={14} className="text-violet-600" />}
              {item.content_type === 'file' && <Files size={14} className="text-orange-600" />}
              {item.content_type === 'text' && <FileText size={14} className="text-teal-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-ink-400">#{item.id}</span>
                <span className="text-xs text-ink-400">{formatTime(item.created_at)}</span>
                <span className="text-xs text-ink-400">{formatSize(item.size)}</span>
                {item.is_favorited && <Star size={12} className="text-amber-500" weight="fill" />}
                {item.is_sensitive && <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-700 rounded">sensitive</span>}
              </div>
              {item.content_type === 'image' ? (
                <div className="mt-1">
                  <Thumbnail
                    src={thumbnailUrl(item)}
                    alt={item.preview || `search result #${item.id}`}
                    className="max-h-32 border border-ink-100 rounded"
                  />
                </div>
              ) : (
                <div className="text-xs text-ink-700 line-clamp-2 whitespace-pre-wrap">
                  {item.preview || truncate(item.content, 300) || '(no preview)'}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
