import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, Input } from '@/components/ui';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { SourceRule, SourceRuleInput } from '@/types';

interface SourceRulesSectionProps {
  sourceRules: SourceRule[];
  createSourceRule: (input: SourceRuleInput) => Promise<SourceRule | null>;
  setSourceRuleEnabled: (id: number, enabled: boolean) => Promise<void>;
  deleteSourceRule: (id: number) => Promise<void>;
  setStatus: (status: string) => void;
}

export function SourceRulesSection({
  sourceRules,
  createSourceRule,
  setSourceRuleEnabled,
  deleteSourceRule,
  setStatus,
}: SourceRulesSectionProps) {
  const { t } = useTranslation();
  const [sourceRuleType, setSourceRuleType] =
    useState<SourceRuleInput['matchType']>('process');
  const [sourceRulePattern, setSourceRulePattern] = useState('');

  const handleCreateSourceRule = async () => {
    const rule = await createSourceRule({
      matchType: sourceRuleType,
      pattern: sourceRulePattern,
      enabled: true,
    });
    if (rule) {
      setSourceRulePattern('');
      setStatus(t('settings.data.sourceRuleCreated', { pattern: rule.pattern }));
    }
  };

  return (
    <section className="space-y-2">
      <Label className="text-xs">{t('settings.data.sourceRules')}</Label>
      <div className="grid grid-cols-[96px_1fr_auto] gap-2">
        <Label htmlFor="source-rule-type" className="sr-only">
          {t('settings.data.sourceRuleType')}
        </Label>
        <select
          id="source-rule-type"
          value={sourceRuleType}
          onChange={(event) =>
            setSourceRuleType(event.target.value as SourceRuleInput['matchType'])
          }
          className="h-7 rounded-full border border-input bg-card/60 px-2 text-xs"
        >
          <option value="process">{t('settings.data.sourceRuleProcess')}</option>
          <option value="title">{t('settings.data.sourceRuleTitle')}</option>
          <option value="any">{t('settings.data.sourceRuleAny')}</option>
        </select>
        <Label htmlFor="source-rule-pattern" className="sr-only">
          {t('settings.data.sourceRulePattern')}
        </Label>
        <Input
          id="source-rule-pattern"
          value={sourceRulePattern}
          onChange={(event) => setSourceRulePattern(event.target.value)}
          placeholder={t('settings.data.sourceRulePattern')}
          className="h-7 text-xs"
        />
        <Button
          size="sm"
          className="h-7"
          onClick={handleCreateSourceRule}
          disabled={sourceRulePattern.trim() === ''}
        >
          <Plus className="h-3 w-3" />
          <span className="sr-only">{t('settings.data.createSourceRule')}</span>
        </Button>
      </div>
      <div className="space-y-1">
        {sourceRules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5"
          >
            <Badge variant="outline" className="text-[10px]">
              {rule.match_type}
            </Badge>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
              {rule.pattern}
            </span>
            <Switch
              aria-label={t('settings.data.toggleSourceRule', { pattern: rule.pattern })}
              checked={rule.enabled}
              onCheckedChange={(enabled) => setSourceRuleEnabled(rule.id, enabled)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-destructive"
              aria-label={t('settings.data.deleteSourceRule', { pattern: rule.pattern })}
              onClick={() => void deleteSourceRule(rule.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
