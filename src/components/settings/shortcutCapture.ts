/**
 * Maps a `KeyboardEvent.code` to the trigger-key vocabulary the Tauri global
 * shortcut plugin accepts. `code` is used rather than `key` so the recorded
 * combination is layout-independent (spec §8.3).
 */
export function codeToAcceleratorKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[01])$/.test(code)) return code;
  const map: Record<string, string> = {
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    Delete: 'Delete',
    Space: 'Space',
  };
  return map[code] ?? null;
}

const MODIFIER_KEYS = ['Control', 'Alt', 'Shift', 'Meta'];

export interface CapturedAccelerator {
  kind: 'accelerator' | 'cancel' | 'ignore';
  accelerator: string | null;
}

/**
 * Turns a keydown during recording into an accelerator. Modifier-only presses are
 * ignored so the user can hold `Ctrl+Alt` before choosing the trigger key.
 */
export function captureAccelerator(event: {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): CapturedAccelerator {
  if (event.code === 'Escape' || event.key === 'Escape') {
    return { kind: 'cancel', accelerator: null };
  }
  if (MODIFIER_KEYS.includes(event.key)) {
    return { kind: 'ignore', accelerator: null };
  }
  const trigger = codeToAcceleratorKey(event.code);
  if (trigger === null) {
    return { kind: 'ignore', accelerator: null };
  }
  const accelerator = [
    event.ctrlKey && 'Ctrl',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
    event.metaKey && 'Win',
    trigger,
  ]
    .filter(Boolean)
    .join('+');
  return { kind: 'accelerator', accelerator };
}

/** `Ctrl+Alt+K` → `Ctrl + Alt + K` for display only. */
export function formatAccelerator(accelerator: string): string {
  return accelerator.split('+').join(' + ');
}
