import { create } from 'zustand';
import { shortcutApi, systemApi } from '@/lib/tauri';
import type { ShortcutBinding, ShortcutActionId } from '@/types';
import { getErrorMessage } from '@/types';
import {
  collectShortcutIssues,
  normalizeShortcut,
  validateShortcutBindings,
  type ShortcutIssue,
} from './shortcutValidation';

interface ShortcutState {
  bindings: ShortcutBinding[];
  committed: ShortcutBinding[];
  loading: boolean;
  saving: boolean;
  /** Set when the backend refused to load the bindings at all. */
  loadError: string | null;
  error: string | null;
  /** Per-action validation state, so each row can render its own status. */
  issues: ShortcutIssue[];
  /** Reported by the backend when the OS refused a registration. */
  occupied: ShortcutActionId[];
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

/** Which actions the backend named as occupied in a registration failure. */
function parseOccupied(message: string, bindings: ShortcutBinding[]): ShortcutActionId[] {
  return bindings
    .filter((binding) => message.includes(binding.actionId))
    .map((binding) => binding.actionId);
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  bindings: [],
  committed: [],
  loading: false,
  saving: false,
  loadError: null,
  error: null,
  issues: [],
  occupied: [],
  captureAction: null,
  isDirty: false,

  fetch: async () => {
    set({ loading: true, error: null, loadError: null });
    try {
      const bindings = await shortcutApi.getBindings();
      set({
        bindings,
        committed: bindings,
        loading: false,
        isDirty: false,
        issues: collectShortcutIssues(bindings),
        occupied: [],
      });
    } catch (error) {
      set({ loading: false, loadError: getErrorMessage(error), error: getErrorMessage(error) });
    }
  },

  setEnabled: (actionId, enabled) => set((state) => {
    const bindings = state.bindings.map((binding) =>
      binding.actionId === actionId ? { ...binding, enabled } : binding
    );
    return {
      bindings,
      issues: collectShortcutIssues(bindings),
      error: validateShortcutBindings(bindings),
      occupied: state.occupied.filter((id) => id !== actionId),
      isDirty: true,
    };
  }),

  setAccelerator: (actionId, accelerator) => set((state) => {
    let normalized = accelerator;
    if (accelerator !== null) {
      try {
        normalized = normalizeShortcut(accelerator);
      } catch {
        // Keep the raw value so `collectShortcutIssues` can classify and surface
        // it on the offending row rather than silently dropping the keystroke.
        normalized = accelerator;
      }
    }
    const bindings = state.bindings.map((binding) =>
      binding.actionId === actionId ? { ...binding, accelerator: normalized } : binding
    );
    return {
      bindings,
      issues: collectShortcutIssues(bindings),
      error: validateShortcutBindings(bindings),
      occupied: state.occupied.filter((id) => id !== actionId),
      isDirty: true,
    };
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
      set({ error: validationError, issues: collectShortcutIssues(bindings) });
      return false;
    }
    set({ saving: true, error: null, occupied: [] });
    try {
      await shortcutApi.setBindings(bindings);
      if (get().captureAction !== null) {
        void systemApi.endFocusLossSuppression?.().catch(() => undefined);
      }
      set({ committed: bindings, saving: false, captureAction: null, isDirty: false, occupied: [] });
      return true;
    } catch (error) {
      const message = getErrorMessage(error);
      set({ saving: false, error: message, occupied: parseOccupied(message, bindings) });
      return false;
    }
  },

  reset: () => {
    if (get().captureAction !== null) {
      void systemApi.endFocusLossSuppression?.().catch(() => undefined);
    }
    set((state) => ({
      bindings: state.committed,
      captureAction: null,
      error: null,
      issues: collectShortcutIssues(state.committed),
      occupied: [],
      isDirty: false,
    }));
  },
}));
