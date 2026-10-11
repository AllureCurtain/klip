import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Finesse-style confirm dialog for destructive or consequential actions.
 * Replaces `window.confirm` — shows icon + title + optional description,
 * with a clear destructive action button.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            {destructive && (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--danger)]/12">
                <AlertTriangle className="h-4 w-4 text-[var(--danger)]" aria-hidden="true" />
              </span>
            )}
            <DialogTitle className="text-[13px] font-semibold leading-tight">
              {title}
            </DialogTitle>
          </div>
          {description && (
            <DialogDescription className="text-[11px] leading-snug text-[var(--muted)]">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            size="sm"
            className="h-7 text-[11px]"
            disabled={busy}
            onClick={() => void handleConfirm()}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
