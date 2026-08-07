/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { resolveClipboardListKeyAction } from './clipboardListKeyboard';

function keyboardEvent(
  target: EventTarget,
  overrides: Partial<KeyboardEvent> = {}
): KeyboardEvent {
  return {
    key: 'Enter',
    keyCode: 13,
    isComposing: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    target,
    ...overrides,
  } as KeyboardEvent;
}

describe('resolveClipboardListKeyAction', () => {
  it('hands navigation and activation from the search input to the list', () => {
    const search = document.createElement('input');
    search.dataset.clipboardSearchInput = 'true';

    expect(
      resolveClipboardListKeyAction(keyboardEvent(search, { key: 'ArrowDown' }))
    ).toBe('next');
    expect(
      resolveClipboardListKeyAction(keyboardEvent(search, { key: 'ArrowUp' }))
    ).toBe('previous');
    expect(resolveClipboardListKeyAction(keyboardEvent(search))).toBe('activate');
    expect(
      resolveClipboardListKeyAction(keyboardEvent(search, { ctrlKey: true }))
    ).toBe('activatePlainText');
  });

  it('leaves other editable controls and modified keys untouched', () => {
    const textarea = document.createElement('textarea');
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'plaintext-only');
    const search = document.createElement('input');
    search.dataset.clipboardSearchInput = 'true';

    expect(resolveClipboardListKeyAction(keyboardEvent(textarea))).toBeNull();
    expect(resolveClipboardListKeyAction(keyboardEvent(editor))).toBeNull();
    expect(
      resolveClipboardListKeyAction(
        keyboardEvent(search, { key: 'ArrowDown', ctrlKey: true })
      )
    ).toBeNull();
  });

  it('ignores IME composition events and key code 229', () => {
    const search = document.createElement('input');
    search.dataset.clipboardSearchInput = 'true';

    expect(
      resolveClipboardListKeyAction(keyboardEvent(search, { isComposing: true }))
    ).toBeNull();
    expect(
      resolveClipboardListKeyAction(keyboardEvent(search, { keyCode: 229 }))
    ).toBeNull();
  });
});
