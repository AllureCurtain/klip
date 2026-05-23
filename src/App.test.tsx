/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
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
  listen: vi.fn(() => Promise.resolve(vi.fn())),
  onClipboardCleared: vi.fn(() => Promise.resolve(vi.fn())),
  onConfigChanged: vi.fn(() => Promise.resolve(vi.fn())),
  configGet: vi.fn(() => Promise.resolve(null)),
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
  Header: () => <div data-testid="header" />,
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
});
