/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipboardApi } from '@/lib/tauri';
import { useClipboardContentActions } from './useClipboardContentActions';

vi.mock('@/lib/tauri', () => ({
  clipboardApi: {
    getContentActions: vi.fn(),
    executeContentAction: vi.fn(),
  },
}));

describe('useClipboardContentActions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads typed actions and revalidates through the execution wrapper', async () => {
    const action = { kind: 'open_url', target: 'https://example.com' } as const;
    vi.mocked(clipboardApi.getContentActions).mockResolvedValue([action]);
    vi.mocked(clipboardApi.executeContentAction).mockResolvedValue(undefined);
    const { result } = renderHook(() => useClipboardContentActions(7));

    await waitFor(() => expect(result.current.actions).toEqual([action]));
    await act(async () => result.current.executeAction(action));

    expect(clipboardApi.executeContentAction).toHaveBeenCalledWith(7, action);
    expect(clipboardApi.getContentActions).toHaveBeenCalledTimes(2);
  });

  it('does not inspect masked or otherwise disabled items', () => {
    const { result } = renderHook(() => useClipboardContentActions(8, false));

    expect(result.current.actions).toEqual([]);
    expect(clipboardApi.getContentActions).not.toHaveBeenCalled();
  });
});
