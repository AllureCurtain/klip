import { describe, expect, it } from 'vitest';
import type { ClipboardItem } from '@/types';
import {
  DEFAULT_CLIPBOARD_FILTERS,
  clipboardItemMatchesFilters,
  hasAdvancedFilters,
  normalizeClipboardFilters,
  toAdvancedSearchQuery,
} from './clipboardFilters';

function makeItem(overrides: Partial<ClipboardItem> = {}): ClipboardItem {
  return {
    id: 1,
    content_type: 'text',
    content: 'hello world',
    preview: 'hello world',
    hash: 'hash',
    size: 11,
    metadata: null,
    is_favorited: false,
    is_sensitive: false,
    sensitivity_reason: null,
    formats: [],
    tags: [],
    created_at: 1_000,
    last_used_at: 1_000,
    ...overrides,
  };
}

describe('clipboardFilters', () => {
  it('normalizes defaults once for frontend filter consumers', () => {
    expect(normalizeClipboardFilters({})).toEqual(DEFAULT_CLIPBOARD_FILTERS);
  });

  it('detects only advanced filters as advanced search inputs', () => {
    expect(hasAdvancedFilters({ contentType: 'text', favoriteOnly: true, tagId: 1 })).toBe(false);
    expect(hasAdvancedFilters({ sensitiveOnly: true })).toBe(true);
    expect(hasAdvancedFilters({ exactMatch: true })).toBe(true);
    expect(hasAdvancedFilters({ createdAfter: 1 })).toBe(true);
    expect(hasAdvancedFilters({ createdBefore: 1 })).toBe(true);
  });

  it('converts normalized filters into advanced search payloads', () => {
    expect(
      toAdvancedSearchQuery('token', {
        contentType: 'text',
        favoriteOnly: true,
        sensitiveOnly: true,
        tagId: 7,
        exactMatch: true,
        createdAfter: 1_000,
        createdBefore: 2_000,
        limit: 20,
        offset: 10,
      })
    ).toEqual({
      query: 'token',
      contentType: 'text',
      favoriteOnly: true,
      sensitiveOnly: true,
      tagId: 7,
      exactMatch: true,
      createdAfter: 1_000,
      createdBefore: 2_000,
      limit: 20,
      offset: 10,
    });
  });

  it('matches live events by content type, favorite, tag, sensitive, and date range', () => {
    const item = makeItem({
      content_type: 'image',
      is_favorited: true,
      is_sensitive: true,
      tags: [{ id: 9, name: 'Work', color: null, created_at: 1 }],
      created_at: 1_500,
    });

    expect(
      clipboardItemMatchesFilters(item, '', {
        contentType: 'image',
        favoriteOnly: true,
        tagId: 9,
        sensitiveOnly: true,
        createdAfter: 1_000,
        createdBefore: 2_000,
      })
    ).toBe(true);
    expect(clipboardItemMatchesFilters(item, '', { contentType: 'text' })).toBe(false);
    expect(clipboardItemMatchesFilters(item, '', { tagId: 10 })).toBe(false);
    expect(clipboardItemMatchesFilters(item, '', { createdAfter: 2_000 })).toBe(false);
    expect(clipboardItemMatchesFilters(item, '', { createdBefore: 1_000 })).toBe(false);
  });

  it('respects exact match and empty query semantics', () => {
    const item = makeItem({ preview: 'hello', content: 'hello world' });

    expect(clipboardItemMatchesFilters(item, '', { contentType: 'text' })).toBe(true);
    expect(clipboardItemMatchesFilters(item, 'hello', { exactMatch: true })).toBe(true);
    expect(clipboardItemMatchesFilters(item, 'hell', { exactMatch: true })).toBe(false);
    expect(clipboardItemMatchesFilters(item, 'world', {})).toBe(true);
  });

  it('does not search image base64 content', () => {
    const image = makeItem({
      content_type: 'image',
      preview: 'screenshot',
      content: 'data:image/png;base64,token-inside-base64',
    });

    expect(clipboardItemMatchesFilters(image, 'token-inside-base64', {})).toBe(false);
    expect(clipboardItemMatchesFilters(image, 'screenshot', {})).toBe(true);
  });
});
