import { useEffect } from 'react';
import { Separator } from '@/components/ui/separator';
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
    deleteSnippet,
    createSourceRule,
    setSourceRuleEnabled,
    deleteSourceRule,
  } = useProductivityStore();

  useEffect(() => {
    void fetchProductivity();
  }, [fetchProductivity]);

  return (
    <div className="space-y-4">
      <SensitiveCaptureSection
        rescanSensitive={rescanSensitive}
        actions={actions}
      />

      <Separator />

      <TagsSection
        tags={tags}
        createTag={createTag}
        deleteTag={deleteTag}
        setStatus={actions.setStatus}
      />

      <Separator />

      <SnippetsSection
        snippets={snippets}
        createSnippet={createSnippet}
        deleteSnippet={deleteSnippet}
        setStatus={actions.setStatus}
      />

      <Separator />

      <SourceRulesSection
        sourceRules={sourceRules}
        createSourceRule={createSourceRule}
        setSourceRuleEnabled={setSourceRuleEnabled}
        deleteSourceRule={deleteSourceRule}
        setStatus={actions.setStatus}
      />

      <Separator />

      <ExternalReadinessSection />

      <Separator />

      <PortabilitySection actions={actions} />

      {actions.status && (
        <p className="text-[10px] text-muted-foreground">{actions.status}</p>
      )}
    </div>
  );
}
