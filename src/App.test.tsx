/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const storeState = vi.hoisted(() => ({
  items: [],
  tags: [],
  loading: false,
  error: null as string | null,
  fetchItems: vi.fn(),
  searchItems: vi.fn(),
  addItems: vi.fn(),
  setItems: vi.fn(),
  fetchTags: vi.fn(),
  clearSelection: vi.fn(),
}));

const tauriMocks = vi.hoisted(() => ({
  clipboardUpdated: undefined as undefined | ((event: { payload: unknown }) => void),
  listen: vi.fn((event: string, callback: (event: { payload: unknown }) => void) => {
    if (event === 'clipboard-updated') {
      tauriMocks.clipboardUpdated = callback;
    }
    return Promise.resolve(vi.fn());
  }),
  onClipboardCleared: vi.fn(() => Promise.resolve(vi.fn())),
  onConfigChanged: vi.fn(() => Promise.resolve(vi.fn())),
  configGet: vi.fn(() => Promise.resolve(null)),
}));

const headerMocks = vi.hoisted(() => ({
  props: undefined as undefined | {
    onContentTypeChange: (type: string | null) => void;
  },
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: tauriMocks.listen,
}));

vi.mock('@/lib/tauri', () => ({
  configApi: {
    get: tauriMocks.configGet,
  },
  onClipboardCleared: tauriMocks.onClipboardCleared,
  onConfigChanged: tauriMocks.onConfigChanged,
}));

vi.mock('./stores/clipboardStore', () => ({
  useClipboardStore: () => storeState,
}));

vi.mock('./components/layout/Header', () => ({
  Header: (props: { onContentTypeChange: (type: string | null) => void }) => {
    headerMocks.props = props;
    return <div data-testid="header" />;
  },
}));

vi.mock('./components/clipboard/ClipboardList', () => ({
  ClipboardList: () => <div data-testid="clipboard-list" />,
}));

vi.mock('./components/settings/SettingsView', () => ({
  SettingsView: () => <div data-testid="settings-view" />,
}));

describe('App status states', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    storeState.items = [];
    storeState.tags = [];
    storeState.loading = false;
    storeState.error = null;
    tauriMocks.clipboardUpdated = undefined;
    headerMocks.props = undefined;
  });

  it('renders loading as a compact operational note', () => {
    storeState.loading = true;

    render(<App />);

    const note = screen.getByRole('status');
    expect(note.textContent).toContain('加载中...');
    expect(note.className).toContain('items-start');
    expect(note.className).not.toContain('justify-center');
    expect(note.className).not.toContain('h-full');
  });

  it('renders errors as a compact operational note', () => {
    storeState.error = '数据库不可用';

    render(<App />);

    const note = screen.getByRole('alert');
    expect(screen.getByText('错误')).toBeTruthy();
    expect(screen.getByText('数据库不可用')).toBeTruthy();
    expect(note.className).toContain('items-start');
    expect(note.className).not.toContain('justify-center');
    expect(note.className).not.toContain('h-full');
  });

  it('does not inject clipboard updates that do not match the active content filter', async () => {
    render(<App />);

    act(() => {
      headerMocks.props?.onContentTypeChange('image');
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      tauriMocks.clipboardUpdated?.({
        payload: {
          id: 1,
          content_type: 'text',
          content: 'plain text',
          preview: 'plain text',
          hash: 'hash-1',
          size: 10,
          metadata: null,
          is_favorited: false,
          is_sensitive: false,
          sensitivity_reason: null,
          tags: [],
          created_at: 1,
          last_used_at: 1,
        },
      });
    });

    expect(storeState.addItems).not.toHaveBeenCalled();
  });
});
