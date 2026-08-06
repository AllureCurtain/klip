import { useState } from 'react';
import { api } from '@/lib/api';
import { formatTime, formatSize, truncate } from '@/lib/utils';
import type { ClipboardItem, ContentType } from '@/types';
import { MagnifyingGlass, FileText, Image as ImageIcon, Files, Star } from '@phosphor-icons/react';

export function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [contentType, setContentType] = useState<string>('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  async function doSearch(q?: string) {
    const searchQ = (q ?? query).trim();
    if (!searchQ) return;
    setLoading(true);
    setSearched(true);
    try {
      const r = await api.advancedSearch({
        query: searchQ,
        contentType: (contentType || undefined) as ContentType | undefined,
        favoriteOnly,
        exactMatch: false,
        limit: 100,
        offset: 0,
      });
      setResults(r);
    } catch (e: unknown) {
      const err = e as { message?: string };
      alert(err.message || 'Search failed');
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
              className="w-full pl-9 pr-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-teal-500"
            />
          </div>
          <button
            onClick={() => doSearch()}
            disabled={loading}
            className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >{loading ? '...' : 'Search'}</button>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            className="text-xs border border-ink-200 rounded px-2 py-1.5 focus:outline-none focus:border-teal-500"
          >
            <option value="">All types</option>
            <option value="text">Text only</option>
            <option value="image">Images only</option>
            <option value="file">Files only</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer">
            <input type="checkbox" checked={favoriteOnly} onChange={(e) => setFavoriteOnly(e.target.checked)} />
            Favorites only
          </label>
        </div>
      </div>

      {searched && !loading && results.length === 0 && (
        <div className="text-center py-12 text-ink-400 text-sm">No results for "{query}"</div>
      )}

      <div className="space-y-2">
        {results.map((item) => (
          <div key={item.id} className="bg-white border border-ink-200 rounded-lg p-3 flex gap-3">
            <div className="mt-0.5">
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
              </div>
              <div className="text-xs text-ink-700 line-clamp-2 whitespace-pre-wrap">
                {item.preview || truncate(item.content, 300)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
