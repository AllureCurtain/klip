import {
  Database,
  Info,
  Keyboard,
  Palette,
  SlidersHorizontal,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SettingsTab = 'general' | 'appearance' | 'shortcuts' | 'behavior' | 'data' | 'about';

export interface SettingsNavItem {
  value: SettingsTab;
  icon: LucideIcon;
  /** i18n key for the rail label and the panel heading. */
  labelKey: string;
  /** i18n key for the one-line panel description. */
  descriptionKey: string;
}

/** Nav order is frozen by spec §5.1. */
export const SETTINGS_NAV: readonly SettingsNavItem[] = [
  {
    value: 'general',
    icon: SlidersHorizontal,
    labelKey: 'settings.tabs.general',
    descriptionKey: 'settings.general.panelDesc',
  },
  {
    value: 'appearance',
    icon: Palette,
    labelKey: 'settings.tabs.appearance',
    descriptionKey: 'settings.appearance.panelDesc',
  },
  {
    value: 'shortcuts',
    icon: Keyboard,
    labelKey: 'settings.tabs.shortcuts',
    descriptionKey: 'settings.shortcuts.panelDesc',
  },
  {
    value: 'behavior',
    icon: Workflow,
    labelKey: 'settings.tabs.behavior',
    descriptionKey: 'settings.behavior.panelDesc',
  },
  {
    value: 'data',
    icon: Database,
    labelKey: 'settings.tabs.data',
    descriptionKey: 'settings.data.panelDesc',
  },
  {
    value: 'about',
    icon: Info,
    labelKey: 'settings.tabs.about',
    descriptionKey: 'settings.about.panelDesc',
  },
] as const;
