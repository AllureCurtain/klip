import { useCallback, useEffect, useState } from 'react';
import { clipboardApi } from '@/lib/tauri';
import type { ClipboardContentAction } from '@/types';

export function useClipboardContentActions(itemId: number, enabled = true) {
  const [actions, setActions] = useState<ClipboardContentAction[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setActions([]);
      return;
    }
    try {
      setActions(await clipboardApi.getContentActions(itemId));
    } catch {
      setActions([]);
    }
  }, [enabled, itemId]);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setActions([]);
      return () => {
        active = false;
      };
    }

    void clipboardApi
      .getContentActions(itemId)
      .then((nextActions) => {
        if (active) setActions(nextActions);
      })
      .catch(() => {
        if (active) setActions([]);
      });

    return () => {
      active = false;
    };
  }, [enabled, itemId]);

  const executeAction = useCallback(
    async (action: ClipboardContentAction) => {
      await clipboardApi.executeContentAction(itemId, action);
      await refresh();
    },
    [itemId, refresh]
  );

  return { actions, executeAction, refresh };
}
