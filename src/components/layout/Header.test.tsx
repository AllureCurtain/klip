/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

const storeMocks = vi.hoisted(() => ({
  clearItems: vi.fn(),
  resolvedTheme: 'light' as const,
  setTheme: vi.fn(),
}));

const eventMocks = vi.hoisted(() => ({
  openSettings: undefined as undefined | (() => void),
  openAbout: undefined as undefined | (() => void),
  onOpenSettings: vi.fn((callback: () => void) => {
    eventMocks.openSettings = callback;
    return Promise.resolve(vi.fn());
  }),
  onOpenAbout: vi.fn((callback: () => void) => {
    eventMocks.openAbout = callback;
    return Promise.resolve(vi.fn());
  }),
}));

const settingsPanelMocks = vi.hoisted(() => ({
  props: undefined as
    | undefined
    | { open: boolean; initialTab?: 'general' | 'shortcuts' | 'behavior' | 'about' },
}));

vi.mock('@/stores', () => ({
  useClipboardStore: () => ({ clearItems: storeMocks.clearItems }),
  useThemeStore: () => ({
    resolvedTheme: storeMocks.resolvedTheme,
    setTheme: storeMocks.setTheme,
  }),
}));

vi.mock('@/components/settings/SettingsPanel', () => ({
  SettingsPanel: (props: {
    open: boolean;
    initialTab?: 'general' | 'shortcuts' | 'behavior' | 'about';
  }) => {
    settingsPanelMocks.props = props;
    return props.open ? <div data-testid="settings-panel">{props.initialTab}</div> : null;
  },
}));

vi.mock('@/lib/tauri', () => ({
  onOpenSettings: eventMocks.onOpenSettings,
  onOpenAbout: eventMocks.onOpenAbout,
}));

describe('Header', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    eventMocks.openSettings = undefined;
    eventMocks.openAbout = undefined;
    settingsPanelMocks.props = undefined;
  });

  it('focuses the search input on render', () => {
    render(
      <Header
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
      />
    );

    expect(document.activeElement).toBe(
      screen.getByPlaceholderText('搜索剪贴板历史...')
    );
  });

  it('opens the general settings tab from the tray settings event', () => {
    render(
      <Header
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
      />
    );

    act(() => eventMocks.openSettings?.());

    expect(screen.getByTestId('settings-panel').textContent).toBe('general');
  });

  it('opens the about tab from the tray about event', () => {
    render(
      <Header
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
      />
    );

    act(() => eventMocks.openAbout?.());

    expect(screen.getByTestId('settings-panel').textContent).toBe('about');
  });
});
