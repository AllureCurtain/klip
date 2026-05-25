import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configApi, productApi } from '@/lib/tauri';
import { useProductivityStore } from './productivityStore';
import type { Snippet, SourceRule } from '@/types';

vi.mock('@/lib/tauri', () => ({
  productApi: {
    listSnippets: vi.fn(),
    createSnippet: vi.fn(),
    updateSnippet: vi.fn(),
    deleteSnippet: vi.fn(),
    listSourceRules: vi.fn(),
    createSourceRule: vi.fn(),
    setSourceRuleEnabled: vi.fn(),
    deleteSourceRule: vi.fn(),
  },
  configApi: {
    getAll: vi.fn(),
    set: vi.fn(),
  },
}));

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 1,
    title: 'Deploy',
    content: 'pnpm release:verify',
    tag_id: null,
    is_favorited: false,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

function makeSourceRule(overrides: Partial<SourceRule> = {}): SourceRule {
  return {
    id: 1,
    match_type: 'process',
    pattern: '1Password.exe',
    enabled: true,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

describe('productivityStore', () => {
  beforeEach(() => {
    useProductivityStore.setState({
      snippets: [],
      sourceRules: [],
      monitorEnabled: true,
      privacyModeUntil: 0,
      loading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  it('loads snippets, source rules, and privacy config', async () => {
    vi.mocked(productApi.listSnippets).mockResolvedValue([makeSnippet()]);
    vi.mocked(productApi.listSourceRules).mockResolvedValue([makeSourceRule()]);
    vi.mocked(configApi.getAll).mockResolvedValue({
      clipboard_monitor_enabled: 'false',
      privacy_mode_until: '2000',
    });

    await useProductivityStore.getState().fetchProductivity();

    expect(useProductivityStore.getState().snippets).toHaveLength(1);
    expect(useProductivityStore.getState().sourceRules).toHaveLength(1);
    expect(useProductivityStore.getState().monitorEnabled).toBe(false);
    expect(useProductivityStore.getState().privacyModeUntil).toBe(2000);
  });

  it('creates snippets and toggles source rules', async () => {
    vi.mocked(productApi.createSnippet).mockResolvedValue(makeSnippet({ id: 2 }));
    vi.mocked(productApi.setSourceRuleEnabled).mockResolvedValue(
      makeSourceRule({ id: 5, enabled: false })
    );
    useProductivityStore.setState({ sourceRules: [makeSourceRule({ id: 5 })] });

    await useProductivityStore.getState().createSnippet({
      title: 'Deploy',
      content: 'pnpm release:verify',
      tagId: null,
      isFavorited: false,
    });
    await useProductivityStore.getState().setSourceRuleEnabled(5, false);

    expect(productApi.createSnippet).toHaveBeenCalled();
    expect(productApi.setSourceRuleEnabled).toHaveBeenCalledWith(5, false);
    expect(useProductivityStore.getState().snippets[0].id).toBe(2);
    expect(useProductivityStore.getState().sourceRules[0].enabled).toBe(false);
  });

  it('persists monitor pause and timed privacy mode', async () => {
    vi.mocked(configApi.set).mockResolvedValue(undefined);

    await useProductivityStore.getState().setMonitorEnabled(false);
    await useProductivityStore.getState().setPrivacyModeForMinutes(15, 1_000);

    expect(configApi.set).toHaveBeenCalledWith('clipboard_monitor_enabled', 'false');
    expect(configApi.set).toHaveBeenCalledWith('privacy_mode_until', '901000');
    expect(useProductivityStore.getState().monitorEnabled).toBe(false);
    expect(useProductivityStore.getState().privacyModeUntil).toBe(901000);
  });
});
