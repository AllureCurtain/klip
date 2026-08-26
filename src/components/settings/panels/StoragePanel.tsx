import { useTranslation } from 'react-i18next';
import { formatByteSize } from '@/lib/utils';
import type { StorageUsage } from '@/types';
import { InfoLine, InlineMessage, SectionCard, SegmentedControl, SettingRow, StatusPill } from '../primitives';

/** The four budgets the backend accepts (spec §9.4); `-1` means unlimited. */
export const IMAGE_BUDGET_OPTIONS = [
  { value: '536870912', bytes: 512 * 1024 * 1024 },
  { value: '2147483648', bytes: 2 * 1024 * 1024 * 1024 },
  { value: '5368709120', bytes: 5 * 1024 * 1024 * 1024 },
  { value: '-1', bytes: -1 },
] as const;

interface StorageSectionProps {
  usage: StorageUsage | null;
  usageError: string | null;
  budgetBytes: number;
  onBudgetBytes: (value: number) => void;
  onRetryUsage: () => void;
}

/**
 * Image fidelity guarantees, current usage and the capacity ceiling. Fidelity is a
 * product guarantee, not a preference — it is presented as facts, with no option to
 * trade quality for space (spec §9.1).
 */
export function StorageSection({
  usage,
  usageError,
  budgetBytes,
  onBudgetBytes,
  onRetryUsage,
}: StorageSectionProps) {
  const { t } = useTranslation();
  const unlimited = budgetBytes < 0;
  const overBudget = !unlimited && usage !== null && usage.imageBytes >= budgetBytes;
  const nearBudget =
    !unlimited && !overBudget && usage !== null && usage.imageBytes >= budgetBytes * 0.9;

  const budgetLabel = (bytes: number) =>
    bytes < 0 ? t('settings.data.budgetUnlimited') : formatByteSize(bytes);

  return (
    <div className="space-y-2.5">
      <SectionCard
        title={t('settings.data.fidelityTitle')}
        description={t('settings.data.fidelityDesc')}
        action={<StatusPill tone="success">{t('settings.data.alwaysOn')}</StatusPill>}
      >
        <div className="space-y-1">
          <InfoLine
            label={t('settings.data.fidelityEncoded')}
            value={t('settings.data.fidelityEncodedValue')}
          />
          <InfoLine
            label={t('settings.data.fidelityBitmap')}
            value={t('settings.data.fidelityBitmapValue')}
          />
          <InfoLine
            label={t('settings.data.fidelityThumbnail')}
            value={t('settings.data.fidelityThumbnailValue')}
          />
          <InfoLine
            label={t('settings.data.fidelityPerItem')}
            value={formatByteSize(128 * 1024 * 1024)}
            mono
          />
        </div>
      </SectionCard>

      <SectionCard
        title={t('settings.data.capacityTitle')}
        description={t('settings.data.capacityDesc')}
        action={
          overBudget ? (
            <StatusPill tone="warning">{t('settings.data.budgetReached')}</StatusPill>
          ) : undefined
        }
      >
        <SettingRow
          label={t('settings.data.budget')}
          description={t('settings.data.budgetDesc')}
          control={
            <SegmentedControl
              ariaLabel={t('settings.data.budget')}
              value={String(budgetBytes)}
              onChange={(value) => onBudgetBytes(Number(value))}
              options={IMAGE_BUDGET_OPTIONS.map((option) => ({
                value: option.value,
                label: budgetLabel(option.bytes),
              }))}
            />
          }
        />
        <div className="mt-1.5 space-y-1 border-t border-[var(--border)] pt-2">
          {usageError ? (
            <div className="flex items-start justify-between gap-3">
              <InlineMessage tone="danger">{t('settings.data.usageFailed')}</InlineMessage>
              <button
                type="button"
                onClick={onRetryUsage}
                className="shrink-0 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink)] hover:border-[var(--accent)]"
              >
                {t('settings.retry')}
              </button>
            </div>
          ) : usage === null ? (
            <p className="text-[10.5px] text-[var(--muted)]">{t('settings.data.usageLoading')}</p>
          ) : (
            <>
              <InfoLine
                label={t('settings.data.imageUsage')}
                value={`${formatByteSize(usage.imageBytes)} / ${budgetLabel(budgetBytes)}`}
                mono
              />
              <InfoLine
                label={t('settings.data.totalUsage')}
                value={formatByteSize(usage.usedBytes)}
                mono
              />
              <InfoLine label={t('settings.data.blobCount')} value={usage.blobCount} mono />
            </>
          )}
        </div>
        {overBudget && (
          <div className="mt-1.5">
            <InlineMessage tone="warning">{t('settings.data.budgetReachedHint')}</InlineMessage>
          </div>
        )}
        {nearBudget && (
          <div className="mt-1.5">
            <InlineMessage tone="info">{t('settings.data.budgetNearHint')}</InlineMessage>
          </div>
        )}
        <p className="mt-1.5 text-[10.5px] leading-snug text-[var(--muted)]">
          {t('settings.data.cleanupPolicy')}
        </p>
      </SectionCard>
    </div>
  );
}
