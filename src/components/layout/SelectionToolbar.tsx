import { useTranslation } from 'react-i18next';
import { Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui';
import type { Tag } from '@/types';

interface SelectionToolbarProps {
  selectedCount: number;
  tags: Tag[];
  onFavoriteSelected: () => void;
  onAssignTagToSelected: (tagId: number) => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
}

export function SelectionToolbar({
  selectedCount,
  tags,
  onFavoriteSelected,
  onAssignTagToSelected,
  onDeleteSelected,
  onClearSelection,
}: SelectionToolbarProps) {
  const { t } = useTranslation();
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex items-center gap-1 border-t border-border bg-muted/25 px-2 py-1">
      <span className="mr-auto text-[10px] text-muted-foreground">
        {hasSelection
          ? t('header.selectedCount', { count: selectedCount })
          : t('header.selectItemsHint')}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={onFavoriteSelected}
        disabled={!hasSelection}
        aria-label={t('header.favoriteSelected')}
        title={t('header.favoriteSelected')}
      >
        <Star className="h-3 w-3" />
      </Button>
      {tags.slice(0, 4).map((tag) => (
        <Button
          key={tag.id}
          variant="ghost"
          size="sm"
          className="h-6 max-w-20 px-1.5 text-[10px]"
          onClick={() => onAssignTagToSelected(tag.id)}
          disabled={!hasSelection}
          aria-label={t('header.assignTagSelected', { name: tag.name })}
          title={t('header.assignTagSelected', { name: tag.name })}
        >
          {tag.color && (
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
          )}
          <span className="truncate">{tag.name}</span>
        </Button>
      ))}
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={onDeleteSelected}
        disabled={!hasSelection}
        aria-label={t('header.deleteSelected')}
        title={t('header.deleteSelected')}
      >
        <Trash2 className="h-3 w-3 text-destructive" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={onClearSelection}
        aria-label={t('header.clearSelection')}
        title={t('header.clearSelection')}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
