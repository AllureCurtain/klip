/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ClipboardItem as ClipboardItemType } from '@/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipboardList } from './ClipboardList';

const storeMocks = vi.hoisted(() => ({
  deleteItem: vi.fn(),
  copyItem: vi.fn(),
  pasteItem: vi.fn(),
  pasteItemPlainText: vi.fn(),
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

const virtualizerMocks = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
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
      scrollToIndex: virtualizerMocks.scrollToIndex,
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
    source_application: null,
    source_window_title: null,
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
    storeMocks.pasteItem.mockReset();
    storeMocks.pasteItemPlainText.mockReset();
    storeMocks.toggleFavorite.mockReset();
    storeMocks.assignTagToItem.mockReset();
    storeMocks.removeTagFromItem.mockReset();
    storeMocks.toggleSelected.mockReset();
    storeMocks.tags = [];
    storeMocks.selectedIds = [];
    storeMocks.loadMore.mockReset();
    storeMocks.hasMore = false;
    storeMocks.loadingMore = false;
    virtualizerMocks.scrollToIndex.mockReset();
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

  it('navigates and pastes from the marked search input', () => {
    render(
      <>
        <input data-clipboard-search-input="true" aria-label="search" />
        <ClipboardList
          items={[
            makeTextItem({ id: 1, content: 'first' }),
            makeTextItem({ id: 2, content: 'second' }),
          ]}
        />
      </>
    );

    const search = screen.getByRole('textbox', { name: 'search' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(storeMocks.pasteItem).toHaveBeenCalledWith(2);
    expect(storeMocks.copyItem).not.toHaveBeenCalled();
    expect(virtualizerMocks.scrollToIndex).toHaveBeenCalled();
  });

  it('keeps the selected item by id when results reorder', () => {
    const search = document.createElement('input');
    search.dataset.clipboardSearchInput = 'true';
    document.body.append(search);
    const second = makeTextItem({ id: 2, content: 'second' });
    const third = makeTextItem({ id: 3, content: 'third' });
    const { rerender } = render(
      <ClipboardList items={[makeTextItem({ id: 1 }), second, third]} />
    );

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    rerender(<ClipboardList items={[third, second]} />);
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(storeMocks.pasteItem).toHaveBeenCalledWith(2);
    search.remove();
  });

  it('falls back to the first result when the selected item disappears', () => {
    const search = document.createElement('input');
    search.dataset.clipboardSearchInput = 'true';
    document.body.append(search);
    const { rerender } = render(
      <ClipboardList
        items={[
          makeTextItem({ id: 1, content: 'first' }),
          makeTextItem({ id: 2, content: 'second' }),
        ]}
      />
    );

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    rerender(<ClipboardList items={[makeTextItem({ id: 3, content: 'replacement' })]} />);
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(storeMocks.pasteItem).toHaveBeenCalledWith(3);
    search.remove();
  });

  it('does not run clipboard actions for empty results', () => {
    const search = document.createElement('input');
    search.dataset.clipboardSearchInput = 'true';
    document.body.append(search);
    render(<ClipboardList items={[]} />);

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(storeMocks.pasteItem).not.toHaveBeenCalled();
    expect(storeMocks.toggleSelected).not.toHaveBeenCalled();
    search.remove();
  });

  it('does not handle composition confirmation or other editable controls', () => {
    render(
      <>
        <input data-clipboard-search-input="true" aria-label="search" />
        <textarea aria-label="notes" />
        <div contentEditable aria-label="editor" />
        <ClipboardList items={[makeTextItem({ id: 1 })]} />
      </>
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'search' }), {
      key: 'Enter',
      isComposing: true,
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'search' }), {
      key: 'Enter',
      keyCode: 229,
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'notes' }), {
      key: 'Enter',
    });
    fireEvent.keyDown(screen.getByLabelText('editor'), { key: 'Enter' });

    expect(storeMocks.pasteItem).not.toHaveBeenCalled();
  });

  it('toggles the current item on Enter in selection mode', () => {
    render(
      <>
        <input data-clipboard-search-input="true" aria-label="search" />
        <ClipboardList items={[makeTextItem({ id: 7 })]} selectionMode />
      </>
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'search' }), {
      key: 'Enter',
    });

    expect(storeMocks.toggleSelected).toHaveBeenCalledWith(7);
    expect(storeMocks.pasteItem).not.toHaveBeenCalled();
  });

  it('plain-pastes the current text item on Ctrl+Enter', () => {
    render(
      <>
        <input data-clipboard-search-input="true" aria-label="search" />
        <ClipboardList items={[makeTextItem({ id: 11 })]} />
      </>
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'search' }), {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(storeMocks.pasteItemPlainText).toHaveBeenCalledWith(11);
    expect(storeMocks.pasteItem).not.toHaveBeenCalled();
  });

  it('does not plain-paste non-text items or items in selection mode', () => {
    const { rerender } = render(
      <>
        <input data-clipboard-search-input="true" aria-label="search" />
        <ClipboardList
          items={[makeTextItem({ id: 12, content_type: 'image' })]}
        />
      </>
    );
    const search = screen.getByRole('textbox', { name: 'search' });

    fireEvent.keyDown(search, { key: 'Enter', ctrlKey: true });
    rerender(
      <>
        <input data-clipboard-search-input="true" aria-label="search" />
        <ClipboardList items={[makeTextItem({ id: 13 })]} selectionMode />
      </>
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'search' }), {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(storeMocks.pasteItemPlainText).not.toHaveBeenCalled();
    expect(storeMocks.toggleSelected).not.toHaveBeenCalled();
  });
});
