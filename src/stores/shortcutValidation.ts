import type { ShortcutActionId, ShortcutBinding } from '@/types';

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Win'] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];

const MODIFIER_ALIASES: Record<string, Modifier> = {
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

/** Combinations Windows owns; see spec §8.4. */
export const RESERVED_ACCELERATORS = new Set([
  'Win+L',
  'Win+V',
  'Win+Tab',
  'Shift+Win+S',
  'Alt+Tab',
  'Alt+F4',
  'Ctrl+Alt+Delete',
  'Ctrl+Shift+Esc',
]);

export type AcceleratorProblem = 'invalid' | 'reserved';

export interface AcceleratorResult {
  ok: boolean;
  normalized: string | null;
  problem: AcceleratorProblem | null;
  message: string | null;
}

function rejected(problem: AcceleratorProblem, message: string): AcceleratorResult {
  return { ok: false, normalized: null, problem, message };
}

/**
 * Non-throwing accelerator parser. Returns the normalized `Ctrl+Alt+Shift+Win+Key`
 * form, or a classified problem so callers can render per-action state instead of
 * a single opaque error string.
 */
export function parseAccelerator(raw: string): AcceleratorResult {
  const parts = raw.split('+').map((part) => part.trim()).filter(Boolean);
  const modifiers = new Set<Modifier>();
  let trigger: string | null = null;

  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }
    if (trigger !== null) {
      return rejected('invalid', 'A shortcut can contain only one trigger key.');
    }
    const named = tryNormalizeTrigger(part);
    if (named === null) {
      return rejected('invalid', `${part} is not a supported trigger key.`);
    }
    trigger = named;
  }

  if (modifiers.size === 0 || trigger === null) {
    return rejected('invalid', 'Use at least one modifier and one trigger key.');
  }

  const normalized = [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), trigger].join('+');
  if (RESERVED_ACCELERATORS.has(normalized)) {
    return rejected('reserved', `${normalized} is reserved by Windows.`);
  }
  if (trigger === 'Tab' || trigger === 'Esc') {
    return rejected('invalid', `${trigger} is not a supported trigger key.`);
  }
  if (trigger === 'F12') {
    return rejected('reserved', 'F12 is reserved by Windows debugging tools.');
  }
  return { ok: true, normalized, problem: null, message: null };
}

export function normalizeShortcut(raw: string): string {
  const result = parseAccelerator(raw);
  if (!result.ok || result.normalized === null) {
    throw new Error(result.message ?? 'Invalid shortcut.');
  }
  return result.normalized;
}

export type ShortcutIssueCode = AcceleratorProblem | 'duplicate' | 'missing';

export interface ShortcutIssue {
  actionId: ShortcutActionId;
  code: ShortcutIssueCode;
  /** The offending accelerator, normalized where that was possible. */
  accelerator: string | null;
  /** For `duplicate`, the enabled action that already owns the combination. */
  conflictWith: ShortcutActionId | null;
  message: string;
}

/**
 * Per-action validation. Disabled actions keep their accelerator (so re-enabling
 * needs no re-record), and a disabled duplicate is NOT an error — but a disabled
 * action holding a syntactically invalid or Windows-reserved combination still
 * is, because enabling it later would fail at registration time.
 */
export function collectShortcutIssues(bindings: ShortcutBinding[]): ShortcutIssue[] {
  const issues: ShortcutIssue[] = [];
  const owners = new Map<string, ShortcutActionId>();

  for (const binding of bindings) {
    if (binding.accelerator === null) {
      if (binding.enabled) {
        issues.push({
          actionId: binding.actionId,
          code: 'missing',
          accelerator: null,
          conflictWith: null,
          message: 'Enabled shortcuts require a key.',
        });
      }
      continue;
    }

    const parsed = parseAccelerator(binding.accelerator);
    if (!parsed.ok || parsed.normalized === null) {
      issues.push({
        actionId: binding.actionId,
        code: parsed.problem ?? 'invalid',
        accelerator: binding.accelerator,
        conflictWith: null,
        message: parsed.message ?? 'Invalid shortcut.',
      });
      continue;
    }

    if (!binding.enabled) continue;

    const owner = owners.get(parsed.normalized);
    if (owner !== undefined) {
      issues.push({
        actionId: binding.actionId,
        code: 'duplicate',
        accelerator: parsed.normalized,
        conflictWith: owner,
        message: `${parsed.normalized} is already used by ${owner}.`,
      });
      continue;
    }
    owners.set(parsed.normalized, binding.actionId);
  }

  return issues;
}

export function validateShortcutBindings(bindings: ShortcutBinding[]): string | null {
  const [first] = collectShortcutIssues(bindings);
  return first ? `${first.actionId}: ${first.message}` : null;
}

function tryNormalizeTrigger(raw: string): string | null {
  if (/^[a-z0-9]$/i.test(raw)) return raw.toUpperCase();
  if (/^F([1-9]|1[0-2])$/i.test(raw)) return raw.toUpperCase();
  return NAMED_KEYS[raw.toLowerCase()] ?? null;
}
