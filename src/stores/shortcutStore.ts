import { create } from 'zustand';
import { shortcutApi, systemApi } from '@/lib/tauri';
import type { ShortcutBinding, ShortcutActionId } from '@/types';
import { getErrorMessage } from '@/types';

interface ShortcutState {
  bindings: ShortcutBinding[];
  committed: ShortcutBinding[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  captureAction: ShortcutActionId | null;
  fetch: () => Promise<void>;
  setEnabled: (actionId: ShortcutActionId, enabled: boolean) => void;
  setAccelerator: (actionId: ShortcutActionId, accelerator: string | null) => void;
  beginCapture: (actionId: ShortcutActionId) => void;
  cancelCapture: () => void;
  save: () => Promise<boolean>;
  reset: () => void;
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  bindings: [],
  committed: [],
  loading: false,
  saving: false,
  error: null,
  captureAction: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const bindings = await shortcutApi.getBindings();
      set({ bindings, committed: bindings, loading: false });
    } catch (error) {
      set({ loading: false, error: getErrorMessage(error) });
    }
  },
  setEnabled: (actionId, enabled) => set((state) => ({
    bindings: state.bindings.map((binding) => binding.actionId === actionId ? { ...binding, enabled } : binding),
  })),
  setAccelerator: (actionId, accelerator) => set((state) => ({
    bindings: state.bindings.map((binding) => binding.actionId === actionId ? { ...binding, accelerator } : binding),
  })),
  beginCapture: (actionId) => {
    if (get().captureAction === null) {
      void systemApi.beginFocusLossSuppression?.().catch(() => undefined);
    }
    set({ captureAction: actionId, error: null });
  },
  cancelCapture: () => {
    if (get().captureAction !== null) {
      void systemApi.endFocusLossSuppression?.().catch(() => undefined);
    }
    set({ captureAction: null });
  },
  save: async () => {
    const bindings = get().bindings;
    set({ saving: true, error: null });
    try {
      await shortcutApi.setBindings(bindings);
      if (get().captureAction !== null) {
        void systemApi.endFocusLossSuppression?.().catch(() => undefined);
      }
      set({ committed: bindings, saving: false, captureAction: null });
      return true;
    } catch (error) {
      set({ saving: false, error: getErrorMessage(error) });
      return false;
    }
  },
  reset: () => {
    if (get().captureAction !== null) {
      void systemApi.endFocusLossSuppression?.().catch(() => undefined);
    }
    set((state) => ({ bindings: state.committed, captureAction: null, error: null }));
  },
}));
