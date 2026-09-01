import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'framer-motion';
import { ClipboardItem } from './ClipboardItem';
import { ClipboardDetailDialog } from './ClipboardDetailDialog';
import { useClipboardStore } from '@/stores';
import type { ClipboardItem as ClipboardItemType } from '@/types';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { resolveClipboardListKeyAction } from './clipboardListKeyboard';

interface ClipboardListProps {
  items: ClipboardItemType[];
  selectionMode?: boolean;
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

function getTimeGroupLabel(
  timestamp: number,
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string,
): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = getLocalCalendarDayNumber(now) - getLocalCalendarDayNumber(date);

  if (diffDays <= 0) return t('list.today');
  if (diffDays === 1) return t('list.yesterday');
  if (diffDays < 7) return t('list.daysAgo', { count: diffDays });
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function getLocalCalendarDayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
      (1000 * 60 * 60 * 24)
  );
}

export function ClipboardList({ items, selectionMode = false }: ClipboardListProps) {
  const { t, i18n } = useTranslation();
  const {
    pasteItem,
    pasteItemPlainText,
    toggleSelected,
    hasMore,
    loadMore,
    loadingMore,
  } = useClipboardStore();
  const [selectedItemId, setSelectedItemId] = useState<number | null>(
    items[0]?.id ?? null
  );
  const [detailItemId, setDetailItemId] = useState<number | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  // Build virtual rows with time group headers
  const rows: VirtualRow[] = useMemo(() => {
    const result: VirtualRow[] = [];
    let lastGroup = '';
    let itemIndex = 0;

    for (const item of items) {
      const group = getTimeGroupLabel(item.created_at, t, i18n.language);
      if (group !== lastGroup) {
        result.push({ type: 'header', id: `header-${group}`, label: group });
        lastGroup = group;
      }
      result.push({ type: 'item', id: `item-${item.id}`, item, index: itemIndex + 1 });
      itemIndex++;
    }
    return result;
  }, [i18n.language, items, t]);

  // Track only item indices for keyboard navigation
  const itemIndices = useMemo(
    () => rows.map((r, i) => (r.type === 'item' ? i : -1)).filter((i) => i >= 0),
    [rows]
  );

  const selectedIndex = useMemo(() => {
    if (items.length === 0) return null;
    const index = items.findIndex((item) => item.id === selectedItemId);
    return index >= 0 ? index : 0;
  }, [items, selectedItemId]);
  const selectedIndexRef = useRef<number | null>(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const detailItem = useMemo(
    () => items.find((item) => item.id === detailItemId) ?? null,
    [detailItemId, items]
  );

  useEffect(() => {
    const nextSelectedId = selectedIndex === null ? null : items[selectedIndex]?.id ?? null;
    if (nextSelectedId !== selectedItemId) {
      setSelectedItemId(nextSelectedId);
    }
  }, [items, selectedIndex, selectedItemId]);

  useEffect(() => {
    if (detailItemId !== null && !detailItem) {
      setDetailItemId(null);
    }
  }, [detailItem, detailItemId]);

  const HEADER_HEIGHT = 28;
  const ITEM_HEIGHT = 62;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.type === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT),
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const lastVirtualItem = virtualItems[virtualItems.length - 1];
    if (!lastVirtualItem || !hasMore || loadingMore) return;
    if (lastVirtualItem.index >= rows.length - 4) {
      void loadMore();
    }
  }, [hasMore, loadMore, loadingMore, rows.length, virtualItems]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (detailItemId !== null) return;
      const action = resolveClipboardListKeyAction(e);
      if (!action || items.length === 0) return;

      const currentIndex = selectedIndexRef.current ?? 0;
      if (action === 'next' || action === 'previous') {
        e.preventDefault();
        const offset = action === 'next' ? 1 : -1;
        const nextIndex = Math.max(
          0,
          Math.min(currentIndex + offset, items.length - 1)
        );
        setSelectedItemId(items[nextIndex]?.id ?? null);
        return;
      }

      const item = items[currentIndex];
      if (!item) return;
      e.preventDefault();
      if (action === 'preview') {
        setDetailItemId(item.id);
        return;
      }
      if (selectionMode) {
        if (action === 'activate') {
          toggleSelected(item.id);
        }
      } else if (action === 'activatePlainText') {
        if (item.content_type === 'text') {
          void pasteItemPlainText(item.id);
        }
      } else {
        void pasteItem(item.id);
      }
    },
    [detailItemId, items, pasteItem, pasteItemPlainText, selectionMode, toggleSelected]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex === null || itemIndices.length === 0) return;
    const rowIndex = itemIndices[selectedIndex];
    if (rowIndex !== undefined) {
      virtualizer.scrollToIndex(rowIndex, { align: 'auto' });
    }
  }, [selectedIndex, itemIndices, virtualizer]);

  return (
    <div className="relative h-full">
      <div ref={parentRef} className="h-full overflow-y-auto scrollbar-thin">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          <AnimatePresence mode="popLayout">
            {virtualItems.map((virtualRow) => {
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
                    className="flex items-center px-4 pt-2 pb-0.5"
                  >
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-[var(--glass-bg)] backdrop-blur-sm border border-[var(--glass-border)]">
                      {row.label}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={row.id}
                  data-testid="clipboard-virtual-row"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${ITEM_HEIGHT}px`,
                    overflow: 'visible',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="box-border px-1.5 py-[3px]"
                >
                  <ClipboardItem
                    item={row.item}
                    index={row.index}
                    ageIndex={row.index - 1}
                    isSelected={selectedIndex === row.index - 1}
                    selectionMode={selectionMode}
                    onSelect={() => setSelectedItemId(row.item.id)}
                    onPreview={() => {
                      setSelectedItemId(row.item.id);
                      setDetailItemId(row.item.id);
                    }}
                  />
                </div>
              );
            })}
          </AnimatePresence>
        </div>
        {loadingMore ? (
          <div className="h-9 flex items-center justify-center text-[11px] text-muted-foreground">
            {t('app.loading')}
          </div>
        ) : null}
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--background)] to-transparent" />
      <ClipboardDetailDialog
        item={detailItem}
        open={detailItem !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDetailItemId(null);
        }}
      />
    </div>
  );
}
