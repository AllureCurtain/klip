import { describe, expect, it } from 'vitest';
import type { ShortcutBinding } from '@/types';
import { normalizeShortcut, validateShortcutBindings } from './shortcutValidation';

function binding(actionId: ShortcutBinding['actionId'], accelerator: string | null, enabled = true): ShortcutBinding {
  return { actionId, accelerator, enabled, updatedAt: 0 };
}

describe('shortcutValidation', () => {
  it('normalizes modifiers, Win, and named keys in backend order', () => {
    expect(normalizeShortcut('win+shift+ctrl+pagedown')).toBe('Ctrl+Shift+Win+PageDown');
  });

  it('rejects system-reserved, F12, and modifier-free shortcuts', () => {
    expect(() => normalizeShortcut('Win+L')).toThrow(/reserved by Windows/);
    expect(() => normalizeShortcut('Ctrl+F12')).toThrow(/debugging tools/);
    expect(() => normalizeShortcut('K')).toThrow(/modifier/);
  });

  it('rejects duplicates only while both actions are enabled', () => {
    const duplicate = [
      binding('toggle_window', 'Ctrl+Alt+K'),
      binding('quick_paste_1', 'alt+ctrl+k'),
    ];
    expect(validateShortcutBindings(duplicate)).toMatch(/already used/);
    duplicate[1].enabled = false;
    expect(validateShortcutBindings(duplicate)).toBeNull();
  });

  it('requires a key when an action is enabled and permits cleared disabled actions', () => {
    expect(validateShortcutBindings([binding('toggle_window', null)])).toMatch(/require a key/);
    expect(validateShortcutBindings([binding('toggle_window', null, false)])).toBeNull();
  });
});
