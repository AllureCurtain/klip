import type { ReactNode } from 'react';
import { AlertTriangle, Check, Info as InfoIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/** A titled group of related controls. The workhorse of the settings page. */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card-token)]',
        className
      )}
    >
      <header className="flex items-start justify-between gap-3 px-3 pt-2.5 pb-2">
        <div className="min-w-0">
          <h2 className="text-[12px] font-semibold leading-tight text-[var(--ink)]">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--muted)]">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="border-t border-[var(--border)] px-3 py-2.5">{children}</div>
    </section>
  );
}

/** Label + consequence text on the left, control on the right. */
export function SettingRow({
  label,
  description,
  htmlFor,
  control,
  className,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  control: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-1.5', className)}>
      <div className="min-w-0 space-y-0.5">
        <Label
          htmlFor={htmlFor}
          className="text-[11.5px] font-medium leading-tight text-[var(--ink)]"
        >
          {label}
        </Label>
        {description && (
          <p className="text-[10.5px] leading-snug text-[var(--muted)]">{description}</p>
        )}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

export function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow
      label={label}
      description={description}
      control={
        <Switch
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      }
    />
  );
}

/** Read-only label/value pair for facts the user cannot edit. */
export function InfoLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="min-w-0 text-[10.5px] text-[var(--muted)]">{label}</span>
      <span
        className={cn(
          'shrink-0 text-[10.5px] font-medium text-[var(--ink)]',
          mono && 'font-mono'
        )}
      >
        {value}
      </span>
    </div>
  );
}

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_STYLES: Record<StatusTone, string> = {
  neutral: 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]',
  success: 'border-[var(--success)]/35 bg-[var(--success)]/12 text-[var(--success)]',
  warning: 'border-[var(--warning)]/35 bg-[var(--warning)]/12 text-[var(--warning)]',
  danger: 'border-[var(--danger)]/35 bg-[var(--danger)]/12 text-[var(--danger)]',
  info: 'border-[var(--info)]/35 bg-[var(--info)]/12 text-[var(--info)]',
};

const TONE_ICONS: Record<StatusTone, typeof Check | null> = {
  neutral: null,
  success: Check,
  warning: AlertTriangle,
  danger: AlertTriangle,
  info: InfoIcon,
};

/**
 * Status chip. Tone is always paired with an icon so state never depends on
 * colour alone (spec §7.3).
 */
export function StatusPill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  const Icon = TONE_ICONS[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        TONE_STYLES[tone],
        className
      )}
    >
      {Icon && <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Inline message tied to a control, with an icon so it survives greyscale. */
export function InlineMessage({
  tone,
  children,
}: {
  tone: Exclude<StatusTone, 'neutral'>;
  children: ReactNode;
}) {
  const Icon = TONE_ICONS[tone] ?? InfoIcon;
  const color =
    tone === 'success'
      ? 'text-[var(--success)]'
      : tone === 'warning'
        ? 'text-[var(--warning)]'
        : tone === 'danger'
          ? 'text-[var(--danger)]'
          : 'text-[var(--info)]';
  return (
    <p className={cn('flex items-start gap-1 text-[10.5px] leading-snug', color)}>
      <Icon className="mt-[1px] h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Segmented control for a small, mutually-exclusive set. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[5px] px-2 py-1 text-[10.5px] font-medium transition-colors',
              active
                ? 'bg-[var(--surface-raised)] text-[var(--ink)] shadow-[var(--shadow-card-token)]'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
