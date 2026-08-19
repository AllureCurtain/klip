import type { ShortcutBinding } from '@/types';

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Win'] as const;
const MODIFIER_ALIASES: Record<string, (typeof MODIFIER_ORDER)[number]> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  win: 'Win',
  meta: 'Win',
  super: 'Win',
};

const NAMED_KEYS: Record<string, string> = {
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  insert: 'Insert',
  delete: 'Delete',
  space: 'Space',
  tab: 'Tab',
  esc: 'Esc',
  escape: 'Esc',
};

const RESERVED = new Set([
  'Win+L',
  'Win+V',
  'Win+Tab',
  'Shift+Win+S',
  'Alt+Tab',
  'Alt+F4',
  'Ctrl+Alt+Delete',
  'Ctrl+Shift+Esc',
]);

export function normalizeShortcut(raw: string): string {
  const parts = raw.split('+').map((part) => part.trim()).filter(Boolean);
  const modifiers = new Set<(typeof MODIFIER_ORDER)[number]>();
  let trigger: string | null = null;

  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (modifier) {
      modifiers.add(modifier);
    } else if (trigger === null) {
      trigger = normalizeTrigger(part);
    } else {
      throw new Error('A shortcut can contain only one trigger key.');
    }
  }

  if (modifiers.size === 0 || trigger === null) {
    throw new Error('Use at least one modifier and one trigger key.');
  }

  const normalized = [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), trigger].join('+');
  if (RESERVED.has(normalized)) {
    throw new Error(`${normalized} is reserved by Windows.`);
  }
  if (trigger === 'Tab' || trigger === 'Esc') {
    throw new Error(`${trigger} is not a supported trigger key.`);
  }
  if (trigger === 'F12') {
    throw new Error('F12 is reserved by Windows debugging tools.');
  }
  return normalized;
}

export function validateShortcutBindings(bindings: ShortcutBinding[]): string | null {
  const active = new Map<string, string>();
  for (const binding of bindings) {
    if (binding.accelerator !== null) {
      try {
        normalizeShortcut(binding.accelerator);
      } catch (error) {
        return `${binding.actionId}: ${(error as Error).message}`;
      }
    }
    if (!binding.enabled) continue;
    if (binding.accelerator === null) {
      return `${binding.actionId}: enabled shortcuts require a key.`;
    }
    const normalized = normalizeShortcut(binding.accelerator);
    const owner = active.get(normalized);
    if (owner) {
      return `${binding.actionId}: ${normalized} is already used by ${owner}.`;
    }
    active.set(normalized, binding.actionId);
  }
  return null;
}

function normalizeTrigger(raw: string): string {
  if (/^[a-z0-9]$/i.test(raw)) return raw.toUpperCase();
  if (/^F([1-9]|1[0-2])$/i.test(raw)) return raw.toUpperCase();
  const named = NAMED_KEYS[raw.toLowerCase()];
  if (named) return named;
  throw new Error(`${raw} is not a supported trigger key.`);
}
