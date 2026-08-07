export const CLIPBOARD_SEARCH_INPUT_ATTRIBUTE = 'data-clipboard-search-input';

export type ClipboardListKeyAction = 'next' | 'previous' | 'activate';

interface ClipboardListKeyEvent {
  key: string;
  keyCode: number;
  isComposing: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}

export function resolveClipboardListKeyAction(
  event: ClipboardListKeyEvent
): ClipboardListKeyAction | null {
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return null;
  }

  const target = event.target instanceof Element ? event.target : null;
  const searchInput = target?.closest(
    `[${CLIPBOARD_SEARCH_INPUT_ATTRIBUTE}="true"]`
  );
  const editableTarget = target?.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
  );

  if (editableTarget && !searchInput) return null;

  switch (event.key) {
    case 'ArrowDown':
      return 'next';
    case 'ArrowUp':
      return 'previous';
    case 'Enter':
      return 'activate';
    default:
      return null;
  }
}
