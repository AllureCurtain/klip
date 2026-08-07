export const CLIPBOARD_SEARCH_INPUT_ATTRIBUTE = 'data-clipboard-search-input';

export type ClipboardListKeyAction =
  | 'next'
  | 'previous'
  | 'activate'
  | 'activatePlainText'
  | 'preview';

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
  const interactiveTarget = target?.closest(
    'button, a, [role="button"], [role="menuitem"], [role="tab"]'
  );

  if ((editableTarget && !searchInput) || interactiveTarget) return null;

  if (event.ctrlKey) {
    return event.key === 'Enter' && searchInput ? 'activatePlainText' : null;
  }

  if (event.key === ' ') {
    return editableTarget ? null : 'preview';
  }

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
