import { useVirtualizer } from '@tanstack/react-virtual';
import { ClipboardItem } from './ClipboardItem';
import { useClipboardStore } from '@/stores';
import type { ClipboardItem as ClipboardItemType } from '@/types';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface ClipboardListProps {
  items: ClipboardItemType[];
}

interface GroupHeader {
  type: 'header';
  id: string;
  label: string;
}

interface GroupItem {
  type: 'item';
  id: string;
  item: ClipboardItemType;
  index: number;
}

type VirtualRow = GroupHeader | GroupItem;

function getTimeGroupLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function ClipboardList({ items }: ClipboardListProps) {
  const { copyItem } = useClipboardStore();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(0);
  const parentRef = useRef<HTMLDivElement>(null);

  // Build virtual rows with time group headers
  const rows: VirtualRow[] = useMemo(() => {
    const result: VirtualRow[] = [];
    let lastGroup = '';
    let itemIndex = 0;

    for (const item of items) {
      const group = getTimeGroupLabel(item.created_at);
      if (group !== lastGroup) {
        result.push({ type: 'header', id: `header-${group}`, label: group });
        lastGroup = group;
      }
      result.push({ type: 'item', id: `item-${item.id}`, item, index: itemIndex + 1 });
      itemIndex++;
    }
    return result;
  }, [items]);

  // Track only item indices for keyboard navigation
  const itemIndices = useMemo(
    () => rows.map((r, i) => (r.type === 'item' ? i : -1)).filter((i) => i >= 0),
    [rows]
  );

  useEffect(() => {
    if (items.length > 0 && selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  selectedIndexRef.current = selectedIndex;

  const HEADER_HEIGHT = 28;
  const ITEM_HEIGHT = 56;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.type === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT),
    overscan: 8,
  });

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

  // Scroll selected item into view
  useEffect(() => {
    if (itemIndices.length === 0) return;
    const rowIndex = itemIndices[selectedIndex];
    if (rowIndex !== undefined) {
      virtualizer.scrollToIndex(rowIndex, { align: 'auto' });
    }
  }, [selectedIndex, itemIndices, virtualizer]);

  return (
    <div ref={parentRef} className="h-full overflow-y-auto scrollbar-thin">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;

          if (row.type === 'header') {
            return (
              <div
                key={row.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${HEADER_HEIGHT}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex items-center px-2.5 pt-2 pb-0.5"
              >
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                  {row.label}
                </span>
              </div>
            );
          }

          return (
            <div
              key={row.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${ITEM_HEIGHT}px`,
                overflow: 'hidden',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ClipboardItem
                item={row.item}
                index={row.index}
                isSelected={selectedIndex === row.index - 1}
                onSelect={() => setSelectedIndex(row.index - 1)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
