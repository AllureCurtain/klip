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

const productivityState = vi.hoisted(() => ({
  fetchProductivity: vi.fn(),
}));

const tauriMocks = vi.hoisted(() => ({
  clipboardUpdated: undefined as undefined | ((event: { payload: unknown }) => void),
  configChanged: undefined as
    | undefined
    | ((key: string, value: string) => void),
  openSettings: undefined as undefined | (() => void),
  openAbout: undefined as undefined | (() => void),
  listen: vi.fn((event: string, callback: (event: { payload: unknown }) => void) => {
    if (event === 'clipboard-updated') {
      tauriMocks.clipboardUpdated = callback;
    }
    return Promise.resolve(vi.fn());
  }),
  onClipboardCleared: vi.fn(() => Promise.resolve(vi.fn())),
  onConfigChanged: vi.fn((callback: (key: string, value: string) => void) => {
    tauriMocks.configChanged = callback;
    return Promise.resolve(vi.fn());
  }),
  onOpenSettings: vi.fn((callback: () => void) => {
    tauriMocks.openSettings = callback;
    return Promise.resolve(vi.fn());
  }),
  onOpenAbout: vi.fn((callback: () => void) => {
    tauriMocks.openAbout = callback;
    return Promise.resolve(vi.fn());
  }),
  configGet: vi.fn(() => Promise.resolve(null)),
}));

const headerMocks = vi.hoisted(() => ({
  props: undefined as undefined | {
    onContentTypeChange: (type: string | null) => void;
    onSearchChange: (query: string) => void;
    onAdvancedFiltersChange: (filters: {
      sensitiveOnly: boolean | null;
      exactMatch: boolean;
      createdAfter: number | null;
      createdBefore: number | null;
    }) => void;
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
  onOpenSettings: tauriMocks.onOpenSettings,
  onOpenAbout: tauriMocks.onOpenAbout,
}));

vi.mock('./stores/clipboardStore', () => ({
  useClipboardStore: () => storeState,
}));

vi.mock('./stores/productivityStore', () => ({
  useProductivityStore: (selector: (state: typeof productivityState) => unknown) =>
    selector(productivityState),
}));

vi.mock('./components/layout/Header', () => ({
  Header: (props: {
    onContentTypeChange: (type: string | null) => void;
    onSearchChange: (query: string) => void;
    onAdvancedFiltersChange: (filters: {
      sensitiveOnly: boolean | null;
      exactMatch: boolean;
      createdAfter: number | null;
      createdBefore: number | null;
    }) => void;
  }) => {
    headerMocks.props = props;
    return <div data-testid="header" />;
  },
}));

vi.mock('./components/clipboard/ClipboardList', () => ({
  ClipboardList: () => <div data-testid="clipboard-list" />,
}));

vi.mock('./components/settings/SettingsView', () => ({
  SettingsView: (props: { initialTab?: string }) => (
    <div data-testid="settings-view" data-initial-tab={props.initialTab} />
  ),
}));

describe('App status states', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    storeState.items = [];
    storeState.tags = [];
    storeState.loading = false;
    storeState.error = null;
    productivityState.fetchProductivity.mockReset();
    tauriMocks.clipboardUpdated = undefined;
    tauriMocks.configChanged = undefined;
    tauriMocks.openSettings = undefined;
    tauriMocks.openAbout = undefined;
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

  it('uses the latest advanced filters for live clipboard updates', async () => {
    render(<App />);

    act(() => {
      headerMocks.props?.onAdvancedFiltersChange({
        sensitiveOnly: true,
        exactMatch: false,
        createdAfter: null,
        createdBefore: null,
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      tauriMocks.clipboardUpdated?.({
        payload: {
          id: 2,
          content_type: 'text',
          content: 'normal text',
          preview: 'normal text',
          hash: 'hash-2',
          size: 11,
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

  it('opens the About tab from the tray about event', async () => {
    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      tauriMocks.openAbout?.();
    });

    expect(screen.getByTestId('settings-view').dataset.initialTab).toBe('about');
  });

  it('opens the general settings tab from the tray settings event', async () => {
    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      tauriMocks.openSettings?.();
    });

    expect(screen.getByTestId('settings-view').dataset.initialTab).toBe('general');
  });

  it('passes advanced filters into search requests', async () => {
    vi.useFakeTimers();

    render(<App />);

    act(() => {
      headerMocks.props?.onSearchChange('token');
      headerMocks.props?.onAdvancedFiltersChange({
        sensitiveOnly: true,
        exactMatch: true,
        createdAfter: 1_000,
        createdBefore: 2_000,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });

    expect(storeState.searchItems).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        sensitiveOnly: true,
        exactMatch: true,
        createdAfter: 1_000,
        createdBefore: 2_000,
      })
    );

    vi.useRealTimers();
  });

  it('loads productivity state on startup for capture status', async () => {
    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(productivityState.fetchProductivity).toHaveBeenCalledTimes(1);
  });

  it('refreshes productivity state when capture config changes', async () => {
    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });
    productivityState.fetchProductivity.mockClear();

    act(() => {
      tauriMocks.configChanged?.('privacy_mode_until', '123');
    });

    expect(productivityState.fetchProductivity).toHaveBeenCalledTimes(1);
  });
});
