import { useTranslation } from 'react-i18next';
import type { ShortcutActionId, ShortcutBinding } from '@/types';
import type { ShortcutIssue } from '@/stores/shortcutValidation';
import { InlineMessage, SectionCard, StatusPill } from '../primitives';
import { ShortcutRow } from '../ShortcutRow';

interface ShortcutsPanelProps {
  bindings: ShortcutBinding[];
  issues: ShortcutIssue[];
  occupied: ShortcutActionId[];
  captureAction: ShortcutActionId | null;
  loadError: string | null;
  onRetry: () => void;
  onBeginCapture: (actionId: ShortcutActionId) => void;
  onCancelCapture: () => void;
  onAccelerator: (actionId: ShortcutActionId, accelerator: string | null) => void;
  onEnabled: (actionId: ShortcutActionId, enabled: boolean) => void;
}

export function ShortcutsPanel({
  bindings,
  issues,
  occupied,
  captureAction,
  loadError,
  onRetry,
  onBeginCapture,
  onCancelCapture,
  onAccelerator,
  onEnabled,
}: ShortcutsPanelProps) {
  const { t } = useTranslation();

  if (loadError) {
    return (
      <SectionCard
        title={t('settings.shortcuts.loadFailed')}
        description={loadError}
        action={
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 py-1 text-[10.5px] font-medium text-[var(--ink)] hover:border-[var(--accent)]"
          >
            {t('settings.retry')}
          </button>
        }
      >
        <InlineMessage tone="danger">{t('settings.shortcuts.loadFailedHint')}</InlineMessage>
      </SectionCard>
    );
  }

  const issueFor = (actionId: ShortcutActionId) =>
    issues.find((issue) => issue.actionId === actionId);
  const rowProps = (binding: ShortcutBinding) => ({
    binding,
    recording: captureAction === binding.actionId,
    issue: issueFor(binding.actionId),
    occupied: occupied.includes(binding.actionId),
    onBeginCapture: () => onBeginCapture(binding.actionId),
    onCancelCapture,
    onAccelerator: (accelerator: string | null) =>
      onAccelerator(binding.actionId, accelerator),
    onEnabled: (enabled: boolean) => onEnabled(binding.actionId, enabled),
  });

  const toggleBinding = bindings.find((binding) => binding.actionId === 'toggle_window');
  const quickPasteBindings = bindings.filter((binding) =>
    binding.actionId.startsWith('quick_paste_')
  );
  const enabledCount = bindings.filter((binding) => binding.enabled).length;

  return (
    <div className="space-y-2.5">
      {toggleBinding && (
        <SectionCard
          title={t('settings.shortcuts.mainWindowTitle')}
          description={t('settings.shortcuts.mainWindowDesc')}
          action={
            <StatusPill tone={toggleBinding.enabled ? 'success' : 'neutral'}>
              {toggleBinding.enabled
                ? t('settings.shortcuts.registered')
                : t('settings.shortcuts.notRegistered')}
            </StatusPill>
          }
        >
          <ShortcutRow {...rowProps(toggleBinding)} />
        </SectionCard>
      )}

      <SectionCard
        title={t('settings.shortcuts.quickPasteTitle')}
        description={t('settings.shortcuts.quickPasteDesc')}
        action={<StatusPill>{t('settings.shortcuts.enabledCount', { count: enabledCount })}</StatusPill>}
      >
        <div className="space-y-0.5">
          {quickPasteBindings.map((binding, index) => (
            <ShortcutRow key={binding.actionId} {...rowProps(binding)} slot={index + 1} />
          ))}
        </div>
        <p className="mt-2 border-t border-[var(--border)] pt-2 text-[10.5px] leading-snug text-[var(--muted)]">
          {t('settings.shortcuts.conflictHint')}
        </p>
      </SectionCard>
    </div>
  );
}
