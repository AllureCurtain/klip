import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UnsavedChangesDialogProps {
  onSave: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}

/**
 * Exit guard for the settings page (spec §5.2). Offers all three outcomes —
 * save and leave, discard and leave, keep editing — so leaving is never
 * silently destructive. Escape maps to "keep editing", the safe choice.
 */
export function UnsavedChangesDialog({
  onSave,
  onDiscard,
  onKeepEditing,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation();
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepEditingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onKeepEditing();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onKeepEditing]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-guard-title"
        aria-describedby="settings-guard-desc"
        className="w-full max-w-[320px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-xl"
      >
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--warning)]/15 text-[var(--warning)]"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h2 id="settings-guard-title" className="text-[12.5px] font-semibold">
              {t('settings.guard.title')}
            </h2>
            <p
              id="settings-guard-desc"
              className="mt-1 text-[10.5px] leading-relaxed text-[var(--muted)]"
            >
              {t('settings.guard.description')}
            </p>
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2">
          <Button
            ref={keepEditingRef}
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={onKeepEditing}
          >
            {t('settings.guard.keepEditing')}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onDiscard}>
            {t('settings.guard.discard')}
          </Button>
          <Button size="sm" className="h-7 text-[11px]" onClick={onSave}>
            {t('settings.guard.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
