import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShortcutBinding } from '@/types';
import { useShortcutStore } from './shortcutStore';

const mocks = vi.hoisted(() => ({
  getBindings: vi.fn(),
  setBindings: vi.fn(),
}));

vi.mock('@/lib/tauri', () => ({
  shortcutApi: mocks,
  systemApi: {},
}));

function initialBindings(): ShortcutBinding[] {
  return [
    { actionId: 'toggle_window', enabled: true, accelerator: 'Ctrl+Alt+K', updatedAt: 1 },
    ...Array.from({ length: 9 }, (_, index): ShortcutBinding => ({
      actionId: `quick_paste_${index + 1}` as ShortcutBinding['actionId'],
      enabled: false,
      accelerator: `Ctrl+Alt+${index + 1}`,
      updatedAt: 1,
    })),
  ];
}

function pendingRead() {
  let resolve!: (bindings: ShortcutBinding[]) => void;
  const response = new Promise<ShortcutBinding[]>((complete) => { resolve = complete; });
  mocks.getBindings.mockReturnValueOnce(response);
  const request = useShortcutStore.getState().fetch();
  return { resolve, request };
}

describe('shortcutStore refresh', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.setBindings.mockResolvedValue(undefined);
    const bindings = initialBindings();
    useShortcutStore.setState({
      bindings, committed: bindings, loading: false, saving: false,
      loadError: null, error: null, issues: [], occupied: [],
      captureAction: null, isDirty: false,
    });
  });

  it('loads persisted bindings when no edits are in progress', async () => {
    const persisted = initialBindings();
    persisted[0].accelerator = 'Ctrl+Alt+J';
    mocks.getBindings.mockResolvedValue(persisted);

    await useShortcutStore.getState().fetch();

    expect(useShortcutStore.getState().bindings).toEqual(persisted);
    expect(useShortcutStore.getState().committed).toEqual(persisted);
    expect(useShortcutStore.getState().loading).toBe(false);
  });

  it('preserves edits and cleared slots when an earlier read completes', async () => {
    const pending = pendingRead();
    useShortcutStore.getState().setAccelerator('toggle_window', 'Ctrl+Alt+Shift+F');
    useShortcutStore.getState().setAccelerator('quick_paste_1', null);

    pending.resolve(initialBindings());
    await pending.request;

    expect(useShortcutStore.getState().bindings[0].accelerator).toBe('Ctrl+Alt+Shift+F');
    expect(useShortcutStore.getState().bindings[1].accelerator).toBeNull();
    expect(useShortcutStore.getState().isDirty).toBe(true);
    expect(useShortcutStore.getState().loading).toBe(false);
    await expect(useShortcutStore.getState().save()).resolves.toBe(true);
    expect(mocks.setBindings).toHaveBeenCalledWith(useShortcutStore.getState().bindings);
  });

  it('does not replace a completed save with a stale read', async () => {
    const pending = pendingRead();
    useShortcutStore.getState().setAccelerator('toggle_window', 'Ctrl+Alt+Shift+F');
    await useShortcutStore.getState().save();

    pending.resolve(initialBindings());
    await pending.request;

    expect(useShortcutStore.getState().bindings[0].accelerator).toBe('Ctrl+Alt+Shift+F');
    expect(useShortcutStore.getState().committed[0].accelerator).toBe('Ctrl+Alt+Shift+F');
    expect(useShortcutStore.getState().isDirty).toBe(false);
  });

  it('does not refresh over unsaved edits', async () => {
    useShortcutStore.getState().setAccelerator('toggle_window', 'Ctrl+Alt+Shift+F');
    mocks.getBindings.mockResolvedValue(initialBindings());

    await useShortcutStore.getState().fetch();

    expect(mocks.getBindings).not.toHaveBeenCalled();
    expect(useShortcutStore.getState().bindings[0].accelerator).toBe('Ctrl+Alt+Shift+F');
    expect(useShortcutStore.getState().isDirty).toBe(true);
  });
});
