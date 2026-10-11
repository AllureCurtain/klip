import { useEffect } from 'react';
import { useClipboardStore, useProductivityStore } from '@/stores';
import { SensitiveCaptureSection } from './SensitiveCaptureSection';
import { TagsSection } from './TagsSection';
import { SnippetsSection } from './SnippetsSection';
import { SourceRulesSection } from './SourceRulesSection';
import { ExternalReadinessSection } from './ExternalReadinessSection';
import { PortabilitySection } from './PortabilitySection';
import { useSettingsDataActions } from './settingsDataActions';

export function DataManagementView() {
  const actions = useSettingsDataActions();
  const {
    tags,
    createTag,
    deleteTag,
    rescanSensitive,
  } = useClipboardStore();
  const {
    snippets,
    sourceRules,
    fetchProductivity,
    createSnippet,
    updateSnippet,
    deleteSnippet,
    createSourceRule,
    setSourceRuleEnabled,
    deleteSourceRule,
  } = useProductivityStore();

  useEffect(() => {
    void fetchProductivity();
  }, [fetchProductivity]);

  return (
    <div className="space-y-2.5">
      <SensitiveCaptureSection
        rescanSensitive={rescanSensitive}
        actions={actions}
      />

      <TagsSection
        tags={tags}
        createTag={createTag}
        deleteTag={deleteTag}
        setStatus={actions.setStatus}
      />

      <SnippetsSection
        snippets={snippets}
        createSnippet={createSnippet}
        updateSnippet={updateSnippet}
        deleteSnippet={deleteSnippet}
        setStatus={actions.setStatus}
      />

      <SourceRulesSection
        sourceRules={sourceRules}
        createSourceRule={createSourceRule}
        setSourceRuleEnabled={setSourceRuleEnabled}
        deleteSourceRule={deleteSourceRule}
        setStatus={actions.setStatus}
      />

      <ExternalReadinessSection />

      <PortabilitySection actions={actions} />

      {actions.status && (
        <p className="px-1 text-[10.5px] text-[var(--muted)]">{actions.status}</p>
      )}
    </div>
  );
}
