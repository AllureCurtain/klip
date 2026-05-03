import { ScrollArea } from '@/components/ui';
import { ClipboardItem } from './ClipboardItem';
import type { ClipboardItem as ClipboardItemType } from '@/types';

interface ClipboardListProps {
  items: ClipboardItemType[];
}

export function ClipboardList({ items }: ClipboardListProps) {
  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-1">
        {items.map((item, index) => (
          <ClipboardItem
            key={item.id}
            item={item}
            index={index + 1}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
