import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { ShortcutBinding } from '@/types';
import type { ShortcutIssue } from '@/stores/shortcutValidation';
import { captureAccelerator, formatAccelerator } from './shortcutCapture';
import { InlineMessage } from './primitives';

interface ShortcutRowProps {
  binding: ShortcutBinding;
  /** Slot label shown ahead of the action name; omitted for the main window action. */
  slot?: number;
  recording: boolean;
  issue: ShortcutIssue | undefined;
  /** True when the backend reported the OS refused this registration. */
  occupied: boolean;
  onBeginCapture: () => void;
  onCancelCapture: () => void;
  onAccelerator: (accelerator: string | null) => void;
  onEnabled: (enabled: boolean) => void;
}

/**
 * One shortcut action: enable switch, key field and its own validation state.
 * The key field stays editable while disabled — disabling only means "do not
 * register", not "forget the combination" (spec §10.2).
 */
export function ShortcutRow({
  binding,
  slot,
  recording,
  issue,
  occupied,
  onBeginCapture,
  onCancelCapture,
  onAccelerator,
  onEnabled,
}: ShortcutRowProps) {
  const { t } = useTranslation();
  const actionLabel = t(`settings.shortcuts.actions.${binding.actionId}`);
  const problem = issue ?? (occupied ? null : undefined);
  const tone = issue || occupied ? 'danger' : undefined;

  const message = issue
    ? issue.code === 'duplicate'
      ? t('settings.shortcuts.issues.duplicate', {
          accelerator: issue.accelerator ?? '',
          action: issue.conflictWith
            ? t(`settings.shortcuts.actions.${issue.conflictWith}`)
            : '',
        })
      : t(`settings.shortcuts.issues.${issue.code}`, { accelerator: issue.accelerator ?? '' })
    : occupied
      ? t('settings.shortcuts.issues.occupied', { accelerator: binding.accelerator ?? '' })
      : null;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!recording) return;
    event.preventDefault();
    const captured = captureAccelerator(event);
    if (captured.kind === 'cancel') {
      onCancelCapture();
      return;
    }
    if (captured.kind === 'ignore') return;
    onAccelerator(captured.accelerator);
    onCancelCapture();
  };

  return (
    <div
      className={cn(
        'rounded-md px-1.5 py-1 transition-colors',
        tone === 'danger' ? 'bg-[var(--danger)]/6' : 'hover:bg-[var(--surface-muted)]'
      )}
      data-state={tone === 'danger' ? 'error' : undefined}
    >
      <div className="flex items-center gap-2">
        {slot !== undefined && (
          <span
            aria-hidden="true"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-[var(--surface-muted)] font-mono text-[9px] font-semibold text-[var(--muted)]"
          >
            {slot}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink)]">
          {actionLabel}
        </span>
        <button
          type="button"
          aria-label={actionLabel}
          aria-describedby={message ? `shortcut-issue-${binding.actionId}` : undefined}
          aria-invalid={problem !== undefined || occupied ? true : undefined}
          className={cn(
            'min-w-[124px] rounded-md border px-2 py-1 text-center font-mono text-[10px] transition-colors',
            recording
              ? 'border-[var(--focus)] bg-[var(--accent-soft)] text-[var(--ink)]'
              : tone === 'danger'
                ? 'border-[var(--danger)]/55 bg-[var(--surface-raised)] text-[var(--danger)]'
                : 'border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--ink)] hover:border-[var(--accent)]',
            !binding.enabled && !recording && 'opacity-70'
          )}
          onClick={onBeginCapture}
          onBlur={() => {
            if (recording) onCancelCapture();
          }}
          onKeyDown={handleKeyDown}
        >
          {recording
            ? t('settings.shortcuts.recording')
            : binding.accelerator
              ? formatAccelerator(binding.accelerator)
              : t('settings.shortcuts.unset')}
        </button>
        <button
          type="button"
          aria-label={t('settings.shortcuts.clear')}
          title={t('settings.shortcuts.clear')}
          className="flex size-5 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
          onClick={() => {
            onAccelerator(null);
            onEnabled(false);
          }}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
        <Switch
          aria-label={`${actionLabel} ${t('settings.shortcuts.enabled')}`}
          checked={binding.enabled}
          onCheckedChange={onEnabled}
        />
      </div>
      {message && (
        <div id={`shortcut-issue-${binding.actionId}`} className="mt-0.5 pl-1.5">
          <InlineMessage tone="danger">{message}</InlineMessage>
        </div>
      )}
    </div>
  );
}
