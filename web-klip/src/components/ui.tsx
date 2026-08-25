import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle, XCircle, Info, Warning, X, ImageBroken, ArrowsClockwise } from '@phosphor-icons/react';
import { useStore } from '@/lib/stores';

// ---------- Toasts (aria-live, success/error/info) ----------

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 items-end"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`fade-in-up flex items-center gap-2 pl-3 pr-2 py-2 rounded-lg shadow-lg text-xs font-medium max-w-xs
            ${toast.kind === 'success' ? 'bg-emerald-600 text-white' : ''}
            ${toast.kind === 'error' ? 'bg-red-600 text-white' : ''}
            ${toast.kind === 'info' ? 'bg-ink-800 text-white' : ''}`}
        >
          {toast.kind === 'success' && <CheckCircle size={14} weight="fill" />}
          {toast.kind === 'error' && <XCircle size={14} weight="fill" />}
          {toast.kind === 'info' && <Info size={14} weight="fill" />}
          <span>{toast.message}</span>
          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
            className="p-1 rounded hover:bg-white/20"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------- Confirm dialog (destructive actions) ----------

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-ink-950/40 flex items-center justify-center z-50"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-xl p-5 w-96 shadow-xl border border-ink-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2">
          {destructive && <Warning size={18} className="text-red-600" weight="fill" />}
          <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
        </div>
        <p className="text-xs text-ink-500 mb-4 leading-relaxed">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-ink-600 hover:bg-ink-100 rounded-lg"
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50
              ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Loading / empty / error states ----------

export function SkeletonCard() {
  return (
    <div className="border border-ink-200 rounded-lg p-3">
      <div className="shimmer h-3 w-24 rounded mb-2" />
      <div className="shimmer h-3 w-full rounded mb-1" />
      <div className="shimmer h-3 w-3/4 rounded" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-ink-400">
      <div className="mb-3 opacity-40">{icon}</div>
      <p className="text-sm font-medium text-ink-500">{title}</p>
      {hint && <p className="text-xs mt-1 text-ink-400 max-w-xs text-center">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="m-4 p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 flex items-start gap-3">
      <XCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium mb-0.5">Something went wrong</div>
        <div className="text-red-600/90 break-words">{message}</div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 hover:bg-red-200 rounded-md text-red-700 shrink-0"
        >
          <ArrowsClockwise size={12} /> Retry
        </button>
      )}
    </div>
  );
}

// ---------- Thumbnail (lazy image with loading/error/retry states) ----------

export function Thumbnail({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setState('loading');
  }, [src, attempt]);
  return (
    <span className={`relative inline-block overflow-hidden ${className}`}>
      {state === 'loading' && (
        <span className="absolute inset-0 shimmer bg-ink-100" aria-hidden />
      )}
      {state === 'error' && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-50 text-red-400">
          <ImageBroken size={16} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setAttempt((a) => a + 1);
            }}
            aria-label="Retry loading image"
            className="text-[10px] px-1.5 py-0.5 bg-red-100 hover:bg-red-200 rounded text-red-600"
          >
            Retry
          </button>
        </span>
      )}
      <img
        key={attempt}
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
        className={`max-w-full rounded transition-opacity duration-200 ${state === 'ok' ? 'opacity-100' : 'opacity-0'}`}
      />
    </span>
  );
}
