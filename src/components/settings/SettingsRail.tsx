import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { SETTINGS_NAV, type SettingsTab } from './settingsNav';

interface SettingsRailProps {
  activeTab: SettingsTab;
  onSelect: (tab: SettingsTab) => void;
  /** Rendered under the nav; used for the dirty-state hint. */
  footer?: React.ReactNode;
}

/**
 * Left navigation rail. Below 440 DIP (spec §3.3) the labels collapse and the
 * rail narrows to an icon bar — done in CSS so the accessible name and tooltip
 * are present at every width rather than appearing only when expanded.
 */
export function SettingsRail({ activeTab, onSelect, footer }: SettingsRailProps) {
  const { t } = useTranslation();

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const delta =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (index + delta + SETTINGS_NAV.length) % SETTINGS_NAV.length;
    onSelect(SETTINGS_NAV[next].value);
    const target = document.getElementById(`settings-tab-${SETTINGS_NAV[next].value}`);
    target?.focus();
  };

  return (
    <div className="flex w-[164px] shrink-0 flex-col gap-2 border-r border-[var(--rail-raised)] bg-[var(--rail)] px-2 py-2.5 max-[439px]:w-[46px] max-[439px]:px-1.5">
      <div
        role="tablist"
        aria-label={t('settings.title')}
        aria-orientation="vertical"
        className="flex flex-col gap-0.5"
      >
        {SETTINGS_NAV.map((item, index) => {
          const Icon = item.icon;
          const active = activeTab === item.value;
          const label = t(item.labelKey);
          return (
            <button
              key={item.value}
              id={`settings-tab-${item.value}`}
              role="tab"
              type="button"
              title={label}
              aria-label={label}
              aria-selected={active}
              aria-controls={`settings-panel-${item.value}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(item.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                'flex min-h-[30px] w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-[11.5px] font-medium transition-colors max-[439px]:justify-center max-[439px]:px-0',
                active
                  ? 'border-[var(--rail-accent)]/35 bg-[var(--rail-accent)]/16 text-[var(--rail-active)]'
                  : 'text-[var(--rail-ink)] hover:bg-[var(--rail-raised)] hover:text-[var(--rail-active)]'
              )}
            >
              <Icon
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  active ? 'text-[var(--rail-accent)]' : undefined
                )}
                aria-hidden="true"
              />
              <span className="truncate max-[439px]:hidden">{label}</span>
            </button>
          );
        })}
      </div>
      {footer && (
        <div className="mt-auto border-t border-[var(--rail-raised)] pt-2 text-[9.5px] leading-snug text-[var(--rail-ink)] max-[439px]:hidden">
          {footer}
        </div>
      )}
    </div>
  );
}
