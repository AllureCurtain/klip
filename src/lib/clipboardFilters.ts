import type { AdvancedSearchQuery, ClipboardItem, ClipboardQueryOptions } from '@/types';

const PAGE_SIZE = 100;

export type ClipboardFilters = Required<
  Pick<ClipboardQueryOptions, 'favoriteOnly' | 'exactMatch' | 'limit' | 'offset'>
> & {
  contentType: NonNullable<ClipboardQueryOptions['contentType']> | null;
  tagId: number | null;
  sensitiveOnly: boolean | null;
  createdAfter: number | null;
  createdBefore: number | null;
};

export const DEFAULT_CLIPBOARD_FILTERS: ClipboardFilters = {
  contentType: null,
  favoriteOnly: false,
  tagId: null,
  sensitiveOnly: null,
  exactMatch: false,
  createdAfter: null,
  createdBefore: null,
  limit: PAGE_SIZE,
  offset: 0,
};

export function normalizeClipboardFilters(
  options: ClipboardQueryOptions = {}
): ClipboardFilters {
  return {
    contentType: options.contentType ?? DEFAULT_CLIPBOARD_FILTERS.contentType,
    favoriteOnly: options.favoriteOnly ?? DEFAULT_CLIPBOARD_FILTERS.favoriteOnly,
    tagId: options.tagId ?? DEFAULT_CLIPBOARD_FILTERS.tagId,
    sensitiveOnly: options.sensitiveOnly ?? DEFAULT_CLIPBOARD_FILTERS.sensitiveOnly,
    exactMatch: options.exactMatch ?? DEFAULT_CLIPBOARD_FILTERS.exactMatch,
    createdAfter: options.createdAfter ?? DEFAULT_CLIPBOARD_FILTERS.createdAfter,
    createdBefore: options.createdBefore ?? DEFAULT_CLIPBOARD_FILTERS.createdBefore,
    limit: options.limit ?? DEFAULT_CLIPBOARD_FILTERS.limit,
    offset: options.offset ?? DEFAULT_CLIPBOARD_FILTERS.offset,
  };
}

export function hasAdvancedFilters(options: ClipboardQueryOptions): boolean {
  const filters = normalizeClipboardFilters(options);
  return (
    filters.sensitiveOnly != null ||
    filters.exactMatch === true ||
    filters.createdAfter != null ||
    filters.createdBefore != null
  );
}

export function toAdvancedSearchQuery(
  query: string,
  options: ClipboardQueryOptions = {}
): AdvancedSearchQuery {
  const filters = normalizeClipboardFilters(options);
  return {
    query,
    contentType: filters.contentType,
    favoriteOnly: filters.favoriteOnly,
    sensitiveOnly: filters.sensitiveOnly,
    tagId: filters.tagId,
    exactMatch: filters.exactMatch,
    createdAfter: filters.createdAfter,
    createdBefore: filters.createdBefore,
    limit: filters.limit,
    offset: filters.offset,
  };
}

export function clipboardItemMatchesFilters(
  item: ClipboardItem,
  searchQuery: string,
  options: ClipboardQueryOptions = {}
): boolean {
  const filters = normalizeClipboardFilters(options);

  if (filters.contentType && item.content_type !== filters.contentType) {
    return false;
  }

  if (filters.favoriteOnly && !item.is_favorited) {
    return false;
  }

  if (filters.tagId !== null && !item.tags.some((tag) => tag.id === filters.tagId)) {
    return false;
  }

  if (filters.sensitiveOnly === true && !item.is_sensitive) {
    return false;
  }

  if (filters.sensitiveOnly === false && item.is_sensitive) {
    return false;
  }

  if (filters.createdAfter !== null && item.created_at < filters.createdAfter) {
    return false;
  }

  if (filters.createdBefore !== null && item.created_at > filters.createdBefore) {
    return false;
  }

  const query = searchQuery.trim().toLocaleLowerCase();
  if (query === '') {
    return true;
  }

  const preview = item.preview?.toLocaleLowerCase() ?? '';
  const searchableContent =
    item.content_type === 'image' ? '' : item.content.toLocaleLowerCase();
  const searchableOcr =
    item.ocr?.status === 'completed' ? item.ocr.text.toLocaleLowerCase() : '';

  if (filters.exactMatch) {
    return preview === query || searchableContent === query || searchableOcr === query;
  }

  return (
    preview.includes(query) ||
    searchableContent.includes(query) ||
    searchableOcr.includes(query)
  );
}
