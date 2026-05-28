import { create } from 'zustand';
import { configApi, productApi } from '@/lib/tauri';
import type { Snippet, SnippetInput, SourceRule, SourceRuleInput } from '@/types';
import { getErrorMessage } from '@/types';
import { CONFIG_KEYS } from './configSchema';

interface ProductivityStore {
  snippets: Snippet[];
  sourceRules: SourceRule[];
  monitorEnabled: boolean;
  privacyModeUntil: number;
  loading: boolean;
  error: string | null;

  fetchProductivity: () => Promise<void>;
  createSnippet: (input: SnippetInput) => Promise<Snippet | null>;
  updateSnippet: (id: number, input: SnippetInput) => Promise<Snippet | null>;
  deleteSnippet: (id: number) => Promise<void>;
  createSourceRule: (input: SourceRuleInput) => Promise<SourceRule | null>;
  setSourceRuleEnabled: (id: number, enabled: boolean) => Promise<void>;
  deleteSourceRule: (id: number) => Promise<void>;
  setMonitorEnabled: (enabled: boolean) => Promise<void>;
  setPrivacyModeForMinutes: (minutes: number, now?: number) => Promise<void>;
}

export const useProductivityStore = create<ProductivityStore>((set) => ({
  snippets: [],
  sourceRules: [],
  monitorEnabled: true,
  privacyModeUntil: 0,
  loading: false,
  error: null,

  fetchProductivity: async () => {
    set({ loading: true, error: null });
    try {
      const [snippets, sourceRules, config] = await Promise.all([
        productApi.listSnippets(),
        productApi.listSourceRules(),
        configApi.getAll(),
      ]);
      set({
        snippets,
        sourceRules,
        monitorEnabled: config[CONFIG_KEYS.clipboardMonitorEnabled] !== 'false',
        privacyModeUntil: parseNumber(config[CONFIG_KEYS.privacyModeUntil], 0),
        loading: false,
      });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  createSnippet: async (input) => {
    try {
      const snippet = await productApi.createSnippet(input);
      set((state) => ({ snippets: [snippet, ...state.snippets] }));
      return snippet;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  updateSnippet: async (id, input) => {
    try {
      const snippet = await productApi.updateSnippet(id, input);
      set((state) => ({
        snippets: state.snippets.map((existing) =>
          existing.id === id ? snippet : existing
        ),
      }));
      return snippet;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  deleteSnippet: async (id) => {
    try {
      await productApi.deleteSnippet(id);
      set((state) => ({
        snippets: state.snippets.filter((snippet) => snippet.id !== id),
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  createSourceRule: async (input) => {
    try {
      const rule = await productApi.createSourceRule(input);
      set((state) => ({ sourceRules: [rule, ...state.sourceRules] }));
      return rule;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  setSourceRuleEnabled: async (id, enabled) => {
    try {
      const rule = await productApi.setSourceRuleEnabled(id, enabled);
      set((state) => ({
        sourceRules: state.sourceRules.map((existing) =>
          existing.id === id ? rule : existing
        ),
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  deleteSourceRule: async (id) => {
    try {
      await productApi.deleteSourceRule(id);
      set((state) => ({
        sourceRules: state.sourceRules.filter((rule) => rule.id !== id),
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  setMonitorEnabled: async (enabled) => {
    try {
      await configApi.set(CONFIG_KEYS.clipboardMonitorEnabled, enabled.toString());
      set({ monitorEnabled: enabled });
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  setPrivacyModeForMinutes: async (minutes, now = Date.now()) => {
    const until = now + minutes * 60 * 1000;
    try {
      await configApi.set(CONFIG_KEYS.privacyModeUntil, until.toString());
      set({ privacyModeUntil: until });
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },
}));

function parseNumber(value: string | null | undefined, fallback: number): number {
  if (value == null) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
