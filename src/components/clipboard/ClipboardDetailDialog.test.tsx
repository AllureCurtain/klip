/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipboardDetailDialog } from './ClipboardDetailDialog';
import type { ClipboardItem } from '@/types';
import { useConfigStore } from '@/stores/configStore';

const storeMocks = vi.hoisted(() => ({
  copyItem: vi.fn(),
  pasteItem: vi.fn(),
  copyItemPlainText: vi.fn(),
  pasteItemPlainText: vi.fn(),
}));

const contentActionMocks = vi.hoisted(() => ({
  actions: [] as import('@/types').ClipboardContentAction[],
  executeAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/stores', () => ({
  useClipboardStore: () => storeMocks,
}));

vi.mock('./useClipboardContentActions', () => ({
  useClipboardContentActions: (_itemId: number, enabled: boolean) =>
    enabled
      ? contentActionMocks
      : { ...contentActionMocks, actions: [] },
}));

function makeItem(overrides: Partial<ClipboardItem> = {}): ClipboardItem {
  return {
    id: 42,
    content_type: 'text',
    content: 'Complete plain text\nwith a second line',
    preview: 'Complete plain text',
    hash: 'hash-42',
    size: 38,
    metadata: null,
    source_application: 'browser.exe',
    source_window_title: 'Reference page',
    is_favorited: false,
    is_sensitive: false,
    sensitivity_reason: null,
    formats: [],
    ocr: null,
    tags: [{ id: 1, name: 'Research', color: '#2563eb', created_at: 0 }],
    created_at: 1_714_000_000_000,
    last_used_at: 1_714_000_000_000,
    ...overrides,
  };
}

describe('ClipboardDetailDialog', () => {
  beforeEach(() => {
    useConfigStore.setState((state) => ({
      config: { ...state.config, mask_sensitive_previews: true },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    storeMocks.copyItem.mockReset();
    storeMocks.pasteItem.mockReset();
    storeMocks.copyItemPlainText.mockReset();
    storeMocks.pasteItemPlainText.mockReset();
    contentActionMocks.actions = [];
    contentActionMocks.executeAction.mockReset();
    contentActionMocks.refresh.mockReset();
  });

  it('shows complete plain and sanitized rich text in separate tabs', () => {
    render(
      <ClipboardDetailDialog
        item={makeItem({
          formats: [
            {
              format: 'html',
              content:
                '<p><strong>Safe rich text</strong></p><script>window.__detailXss = true</script><a href="javascript:alert(1)" onclick="alert(1)">unsafe link</a>',
            },
          ],
        })}
        open
        onOpenChange={() => undefined}
      />
    );

    expect(screen.getByText(/with a second line/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '富文本' }));

    const rich = screen.getByTestId('detail-rich-text');
    expect(rich.querySelector('strong')?.textContent).toBe('Safe rich text');
    expect(rich.querySelector('script')).toBeNull();
    expect(rich.querySelector('[onclick]')).toBeNull();
    expect(rich.querySelector('a')?.getAttribute('href')).toBeNull();
  });

  it('keeps sensitive text and rich formats hidden when masking is enabled', () => {
    render(
      <ClipboardDetailDialog
        item={makeItem({
          content: 'password=super-secret',
          preview: 'password=super-secret',
          is_sensitive: true,
          sensitivity_reason: 'credential keyword',
          formats: [{ format: 'html', content: '<b>super-secret</b>' }],
        })}
        open
        onOpenChange={() => undefined}
      />
    );

    expect(screen.getByText('已隐藏敏感内容')).toBeTruthy();
    expect(screen.queryByText(/super-secret/)).toBeNull();
    expect(screen.queryByRole('tab', { name: '富文本' })).toBeNull();
  });

  it('provides bounded image zoom, reset, drag, and complete OCR text', () => {
    render(
      <ClipboardDetailDialog
        item={makeItem({
          content_type: 'image',
          content: 'data:image/png;base64,iVBORw0KGgo=',
          preview: 'Image 640x480',
          metadata: JSON.stringify({ width: 640, height: 480, format: 'png' }),
          ocr: {
            status: 'completed',
            text: 'Invoice 2026\nComplete recognized text',
            error: null,
            updated_at: 1,
          },
        })}
        open
        onOpenChange={() => undefined}
      />
    );

    const image = screen.getByRole('img', { name: '剪贴板图片' });
    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    expect(image.getAttribute('style')).toContain('scale(1.25)');

    const viewport = screen.getByTestId('detail-image-viewport');
    fireEvent.pointerDown(viewport, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(viewport, { clientX: 34, clientY: 26, pointerId: 1 });
    fireEvent.pointerUp(viewport, { pointerId: 1 });
    expect(image.getAttribute('style')).toContain('translate(24px, 16px)');

    for (let index = 0; index < 20; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: '放大' }));
    }
    expect(image.getAttribute('style')).toContain('scale(4)');
    for (let index = 0; index < 30; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: '缩小' }));
    }
    expect(image.getAttribute('style')).toContain('scale(0.5)');

    fireEvent.click(screen.getByRole('button', { name: '重置缩放' }));
    expect(image.getAttribute('style')).toContain('scale(1)');
    expect(image.getAttribute('style')).toContain('translate(0px, 0px)');
    expect(screen.getByText(/Complete recognized text/)).toBeTruthy();
    expect(screen.getByText('640 x 480')).toBeTruthy();
    expect(screen.getByText(/png/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: '下载图片' })).toBeTruthy();
  });

  it('does not render sensitive image data or file paths behind the mask', () => {
    const { rerender } = render(
      <ClipboardDetailDialog
        item={makeItem({
          content_type: 'image',
          content: 'data:image/png;base64,secret-image-data',
          is_sensitive: true,
        })}
        open
        onOpenChange={() => undefined}
      />
    );

    expect(screen.queryByRole('img')).toBeNull();

    rerender(
      <ClipboardDetailDialog
        item={makeItem({
          content_type: 'file',
          content: JSON.stringify(['C:\\secret\\credentials.txt']),
          is_sensitive: true,
        })}
        open
        onOpenChange={() => undefined}
      />
    );

    expect(screen.queryByText('C:\\secret\\credentials.txt')).toBeNull();
    expect(screen.getByText('已隐藏敏感内容')).toBeTruthy();
  });

  it('shows every file path and metadata without horizontal page overflow', () => {
    const firstPath = 'C:\\Users\\you\\A very long folder name\\report-final.pdf';
    const secondPath = 'D:\\资料\\完整文件名.txt';
    render(
      <ClipboardDetailDialog
        item={makeItem({
          content_type: 'file',
          content: JSON.stringify([firstPath, secondPath]),
          preview: '2 files',
          size: 3072,
          metadata: JSON.stringify({
            file_count: 2,
            dir_count: 0,
            total_size: 3072,
            items: [
              { name: 'report-final.pdf', is_dir: false, size: 2048 },
              { name: '完整文件名.txt', is_dir: false, size: 1024 },
            ],
          }),
        })}
        open
        onOpenChange={() => undefined}
      />
    );

    const first = screen.getByText(firstPath);
    expect(first.className).toContain('break-all');
    expect(screen.getByText(secondPath)).toBeTruthy();
    expect(screen.getAllByText('文件')).toHaveLength(2);
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getByText('1.0 KB')).toBeTruthy();
  });

  it('shares metadata and applicable copy/paste actions', () => {
    render(
      <ClipboardDetailDialog
        item={makeItem()}
        open
        onOpenChange={() => undefined}
      />
    );

    expect(screen.getByText('browser.exe')).toBeTruthy();
    expect(screen.getByText('Reference page')).toBeTruthy();
    expect(screen.getByText('Research')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    fireEvent.click(screen.getByRole('button', { name: '粘贴' }));
    fireEvent.click(screen.getByRole('button', { name: '复制纯文本' }));
    fireEvent.click(screen.getByRole('button', { name: '粘贴纯文本' }));

    expect(storeMocks.copyItem).toHaveBeenCalledWith(42);
    expect(storeMocks.pasteItem).toHaveBeenCalledWith(42);
    expect(storeMocks.copyItemPlainText).toHaveBeenCalledWith(42);
    expect(storeMocks.pasteItemPlainText).toHaveBeenCalledWith(42);
  });

  it('executes validated text and per-file actions from the detail surface', () => {
    const openUrl = { kind: 'open_url', target: 'https://example.com' } as const;
    contentActionMocks.actions = [openUrl];
    contentActionMocks.executeAction.mockResolvedValue(undefined);
    const { rerender } = render(
      <ClipboardDetailDialog
        item={makeItem({ content: 'https://example.com' })}
        open
        onOpenChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '打开链接' }));
    expect(contentActionMocks.executeAction).toHaveBeenCalledWith(openUrl);

    const target = 'C:\\资料\\report.txt';
    const openPath = { kind: 'open_path', target } as const;
    const revealPath = { kind: 'reveal_path', target } as const;
    contentActionMocks.actions = [openPath, revealPath];
    rerender(
      <ClipboardDetailDialog
        item={makeItem({
          content_type: 'file',
          content: JSON.stringify([target]),
          metadata: JSON.stringify({
            file_count: 1,
            dir_count: 0,
            total_size: 10,
            items: [{ name: 'report.txt', is_dir: false, size: 10 }],
          }),
        })}
        open
        onOpenChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '在文件夹中显示' }));
    expect(contentActionMocks.executeAction).toHaveBeenCalledWith(revealPath);
  });

  it('uses the dialog focus boundary, Escape close behavior, and viewport constraints', () => {
    const onOpenChange = vi.fn();
    render(
      <ClipboardDetailDialog
        item={makeItem()}
        open
        onOpenChange={onOpenChange}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-h-[calc(100vh-1rem)]');
    expect(dialog.className).toContain('max-w-[calc(100vw-1rem)]');
    expect(dialog.className).toContain('h-[min(36rem,calc(100vh-1rem))]');
    expect(document.querySelectorAll('[data-base-ui-focus-guard]').length).toBeGreaterThan(0);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
  });
});
