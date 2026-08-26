import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { AppConfig, ThemeFamily, ThemeMode } from '@/types';
import { InfoLine, SectionCard, SegmentedControl, SettingRow, StatusPill } from '../primitives';

const FAMILIES: readonly ThemeFamily[] = ['ember', 'graphite', 'brick', 'rose'] as const;
const MODES: readonly ThemeMode[] = ['system', 'light', 'dark'] as const;

/**
 * Swatch colours are read from the live theme tokens of each family rather than
 * hardcoded, so the preview cannot drift from `globals.css` (spec §7.2 forbids
 * literal colours in components).
 */
function FamilySwatches({ family }: { family: ThemeFamily }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
      <span
        className="h-3.5 w-3.5 rounded-full border border-[var(--border)]"
        data-swatch-theme={family}
        data-swatch-role="surface"
      />
      <span
        className="h-3.5 w-3.5 rounded-full border border-[var(--border)]"
        data-swatch-theme={family}
        data-swatch-role="accent"
      />
    </span>
  );
}

interface AppearancePanelProps {
  config: AppConfig;
  onThemeFamily: (family: ThemeFamily) => void;
  onThemeMode: (mode: ThemeMode) => void;
}

export function AppearancePanel({ config, onThemeFamily, onThemeMode }: AppearancePanelProps) {
  const { t } = useTranslation();
  const family = config.theme_family ?? 'brick';
  const mode = config.theme_mode ?? 'system';

  return (
    <div className="space-y-2.5">
      <SectionCard
        title={t('settings.appearance.family')}
        description={t('settings.appearance.familyDesc')}
        action={<StatusPill>{t('settings.appearance.familyCount', { count: FAMILIES.length })}</StatusPill>}
      >
        <SettingRow
          label={t('settings.appearance.mode')}
          description={t('settings.appearance.modeDesc')}
          control={
            <SegmentedControl
              ariaLabel={t('settings.appearance.mode')}
              value={mode}
              onChange={onThemeMode}
              options={MODES.map((value) => ({
                value,
                label: t(`settings.appearance.${value}`),
              }))}
            />
          }
        />
        <div
          role="radiogroup"
          aria-label={t('settings.appearance.family')}
          className="mt-1.5 grid grid-cols-2 gap-1.5 border-t border-[var(--border)] pt-2 max-[479px]:grid-cols-1"
        >
          {FAMILIES.map((value) => {
            const active = family === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onThemeFamily(value)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)]'
                )}
              >
                <FamilySwatches family={value} />
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-medium text-[var(--ink)]">
                    {t(`settings.appearance.families.${value}`)}
                  </span>
                  <span className="block truncate text-[10px] text-[var(--muted)]">
                    {t(`settings.appearance.familyHints.${value}`)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1.5 text-[10.5px] leading-snug text-[var(--text)]">
          {t('settings.appearance.previewHint')}
        </p>
      </SectionCard>

      <SectionCard
        title={t('settings.appearance.scopeTitle')}
        description={t('settings.appearance.scopeDesc')}
        action={<StatusPill tone="info">{t('settings.appearance.livePreview')}</StatusPill>}
      >
        <div className="space-y-1">
          <InfoLine
            label={t('settings.appearance.currentSelection')}
            value={`${t(`settings.appearance.families.${family}`)} · ${t(`settings.appearance.${mode}`)}`}
          />
          <InfoLine
            label={t('settings.appearance.contrastGate')}
            value={t('settings.appearance.contrastGateValue')}
          />
        </div>
      </SectionCard>
    </div>
  );
}
