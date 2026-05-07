import { ScrollArea } from '@/components/ui';
import { ClipboardItem } from './ClipboardItem';
import { useClipboardStore } from '@/stores';
import type { ClipboardItem as ClipboardItemType } from '@/types';
import { useState, useEffect, useCallback, useRef } from 'react';

interface ClipboardListProps {
  items: ClipboardItemType[];
}

export function ClipboardList({ items }: ClipboardListProps) {
  const { copyItem } = useClipboardStore();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(0);

  // Keep ref in sync with state
  selectedIndexRef.current = selectedIndex;

  // Reset selection when items change (new clipboard content prepended)
  useEffect(() => {
    if (items.length > 0 && selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter': {
          e.preventDefault();
          const idx = selectedIndexRef.current;
          const item = items[idx];
          if (item) {
            copyItem(item.id);
          }
          break;
        }
      }
    },
    [items, copyItem]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {items.map((item, index) => (
          <ClipboardItem
            key={item.id}
            item={item}
            index={index + 1}
            isSelected={index === selectedIndex}
            onSelect={() => setSelectedIndex(index)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
