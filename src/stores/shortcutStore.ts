import { create } from 'zustand';
import { shortcutApi, systemApi } from '@/lib/tauri';
import type { ShortcutBinding, ShortcutActionId } from '@/types';
import { getErrorMessage } from '@/types';
import { normalizeShortcut, validateShortcutBindings } from './shortcutValidation';

interface ShortcutState {
  bindings: ShortcutBinding[];
  committed: ShortcutBinding[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  captureAction: ShortcutActionId | null;
  isDirty: boolean;
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
  isDirty: false,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const bindings = await shortcutApi.getBindings();
      set({ bindings, committed: bindings, loading: false, isDirty: false });
    } catch (error) {
      set({ loading: false, error: getErrorMessage(error) });
    }
  },
  setEnabled: (actionId, enabled) => set((state) => {
    const bindings = state.bindings.map((binding) => binding.actionId === actionId ? { ...binding, enabled } : binding);
    return { bindings, error: validateShortcutBindings(bindings), isDirty: true };
  }),
  setAccelerator: (actionId, accelerator) => set((state) => {
    let normalized = accelerator;
    try {
      normalized = accelerator === null ? null : normalizeShortcut(accelerator);
    } catch (error) {
      return { error: getErrorMessage(error) };
    }
    const bindings = state.bindings.map((binding) => binding.actionId === actionId ? { ...binding, accelerator: normalized } : binding);
    return { bindings, error: validateShortcutBindings(bindings), isDirty: true };
  }),
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
    const validationError = validateShortcutBindings(bindings);
    if (validationError) {
      set({ error: validationError });
      return false;
    }
    set({ saving: true, error: null });
    try {
      await shortcutApi.setBindings(bindings);
      if (get().captureAction !== null) {
        void systemApi.endFocusLossSuppression?.().catch(() => undefined);
      }
      set({ committed: bindings, saving: false, captureAction: null, isDirty: false });
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
    set((state) => ({ bindings: state.committed, captureAction: null, error: null, isDirty: false }));
  },
}));
