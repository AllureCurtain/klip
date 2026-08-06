import { describe, it, expect } from 'vitest';
import type { ClipboardItem, Tag, StatsResponse, QaAnswer, ApiError } from './index';

describe('Type definitions', () => {
  it('ClipboardItem accepts valid data', () => {
    const item: ClipboardItem = {
      id: 1,
      content_type: 'text',
      content: 'hello',
      preview: null,
      hash: 'abc',
      size: 5,
      metadata: null,
      is_favorited: false,
      is_sensitive: false,
      sensitivity_reason: null,
      tags: [],
      created_at: 0,
      last_used_at: 0,
    };
    expect(item.id).toBe(1);
    expect(item.content_type).toBe('text');
    expect(item.tags).toEqual([]);
  });

  it('Tag accepts id, name, color, created_at', () => {
    const tag: Tag = { id: 1, name: 'test', color: '#fff', created_at: 0 };
    expect(tag.name).toBe('test');
    // color can be null
    const tag2: Tag = { id: 2, name: 'x', color: null, created_at: 0 };
    expect(tag2.color).toBeNull();
  });

  it('StatsResponse has all required fields', () => {
    const stats: StatsResponse = {
      total_items: 10, text_count: 5, image_count: 3, file_count: 2,
      favorite_count: 1, sensitive_count: 0, tag_count: 2, snippet_count: 1,
      source_rule_count: 0, total_size_bytes: 1000, db_size_bytes: 2000,
    };
    expect(stats.total_items).toBe(10);
    expect(stats.db_size_bytes).toBe(2000);
  });

  it('QaAnswer includes answer, provider, model, context_count, context', () => {
    const qa: QaAnswer = {
      answer: 'yes',
      provider: 'fake',
      model: 'fake',
      context_count: 1,
      context: [{ id: 1, preview: 'test', score: 0.5 }],
    };
    expect(qa.context).toHaveLength(1);
    expect(qa.context[0].score).toBe(0.5);
  });

  it('ApiError has error and message fields', () => {
    const err: ApiError = { error: 'not_found', message: 'item not found' };
    expect(err.error).toBe('not_found');
    expect(err.message).toBe('item not found');
  });
});
