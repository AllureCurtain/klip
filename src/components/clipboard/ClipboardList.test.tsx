/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ClipboardItem as ClipboardItemType } from '@/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipboardList } from './ClipboardList';

const storeMocks = vi.hoisted(() => ({
  deleteItem: vi.fn(),
  copyItem: vi.fn(),
  toggleFavorite: vi.fn(),
  tags: [] as { id: number; name: string; color: string | null; created_at: number }[],
  assignTagToItem: vi.fn(),
  removeTagFromItem: vi.fn(),
  selectedIds: [] as number[],
  toggleSelected: vi.fn(),
  hasMore: false,
  loadMore: vi.fn(),
  loadingMore: false,
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: (index: number) => number;
  }) => {
    let start = 0;
    const virtualItems = Array.from({ length: count }, (_value, index) => {
      const size = estimateSize(index);
      const item = { index, start, size, key: index };
      start += size;
      return item;
    });

    return {
      getVirtualItems: () => virtualItems,
      getTotalSize: () => start,
      scrollToIndex: () => undefined,
    };
  },
}));

vi.mock('@/stores', () => ({
  useClipboardStore: () => storeMocks,
}));

function makeTextItem(overrides: Partial<ClipboardItemType> = {}): ClipboardItemType {
  return {
    id: 42,
    content_type: 'text',
    content: 'hello',
    preview: 'hello',
    hash: 'hash-42',
    size: 5,
    metadata: null,
    is_favorited: false,
    is_sensitive: false,
    sensitivity_reason: null,
    formats: [],
    ocr: null,
    tags: [],
    created_at: Date.now(),
    last_used_at: Date.now(),
    ...overrides,
  };
}

describe('ClipboardList', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    storeMocks.deleteItem.mockReset();
    storeMocks.copyItem.mockReset();
    storeMocks.toggleFavorite.mockReset();
    storeMocks.assignTagToItem.mockReset();
    storeMocks.removeTagFromItem.mockReset();
    storeMocks.toggleSelected.mockReset();
    storeMocks.tags = [];
    storeMocks.selectedIds = [];
    storeMocks.loadMore.mockReset();
    storeMocks.hasMore = false;
    storeMocks.loadingMore = false;
  });

  it('uses compact virtual rows with breathing room between clipboard entries', () => {
    const { container } = render(<ClipboardList items={[makeTextItem()]} />);

    const wrapper = container.firstElementChild as HTMLElement;
    const scroller = wrapper.firstElementChild as HTMLElement;
    const virtualCanvas = scroller.firstElementChild as HTMLElement;

    expect(virtualCanvas.style.height).toBe('90px');
  });

  it('keeps horizontal row spacing inside the virtual row bounds', () => {
    render(<ClipboardList items={[makeTextItem({ id: 1, content: 'hello' })]} />);

    const virtualRow = document.querySelector('[data-testid="clipboard-virtual-row"]');
    expect(virtualRow?.className).toContain('px-1.5');

    const row = within(virtualRow as HTMLElement)
      .getByText('hello')
      .closest('[data-testid="clipboard-item"]');
    expect(row?.className).not.toContain('mx-1.5');
  });

  it('groups items by local calendar day instead of elapsed hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 28, 9, 0, 0));

    render(
      <ClipboardList
        items={[makeTextItem({ created_at: new Date(2026, 4, 27, 23, 0, 0).getTime() })]}
      />
    );

    expect(screen.getByText('昨天')).toBeTruthy();
  });
});
