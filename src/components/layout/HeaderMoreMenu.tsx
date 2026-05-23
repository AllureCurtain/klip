import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ListChecks,
  MoreHorizontal,
  Star,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Tag } from '@/types';

interface HeaderMoreMenuProps {
  showFavorites: boolean;
  onShowFavoritesChange: (show: boolean) => void;
  tags: Tag[];
  selectedTagId: number | null;
  onSelectedTagChange: (tagId: number | null) => void;
  selectionMode: boolean;
  onSelectionModeChange: () => void;
  onRequestClearHistory: () => void;
}

export function HeaderMoreMenu({
  showFavorites,
  onShowFavoritesChange,
  tags,
  selectedTagId,
  onSelectedTagChange,
  selectionMode,
  onSelectionModeChange,
  onRequestClearHistory,
}: HeaderMoreMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const runAndClose = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div className="relative" ref={rootRef}>
      <Button
        variant={open || selectionMode ? 'secondary' : 'ghost'}
        size="icon"
        className="size-7 shrink-0"
        onClick={() => setOpen((current) => !current)}
        aria-label={t('header.moreActions')}
        aria-expanded={open}
        title={t('header.moreActions')}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <div
          className="absolute right-0 top-8 z-20 w-56 rounded-md border bg-popover p-1.5 text-popover-foreground shadow-lg"
          role="region"
          aria-label={t('header.moreActions')}
        >
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
              selectionMode && 'bg-accent text-accent-foreground'
            )}
            aria-pressed={selectionMode}
            onClick={() => runAndClose(onSelectionModeChange)}
          >
            <ListChecks className="h-3.5 w-3.5" />
            <span>
              {selectionMode
                ? t('header.exitSelectionMode')
                : t('header.selectionMode')}
            </span>
          </button>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
              showFavorites && 'bg-accent text-accent-foreground'
            )}
            aria-pressed={showFavorites}
            onClick={() =>
              runAndClose(() => onShowFavoritesChange(!showFavorites))
            }
          >
            <Star
              className={cn(
                'h-3.5 w-3.5',
                showFavorites && 'fill-amber-500 text-amber-500'
              )}
            />
            <span>{t('header.showFavorites')}</span>
          </button>

          {tags.length > 0 && (
            <div className="mt-1 border-t pt-1">
              <button
                type="button"
                className={cn(
                  'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
                  selectedTagId === null && 'bg-accent text-accent-foreground'
                )}
                aria-pressed={selectedTagId === null}
                onClick={() => runAndClose(() => onSelectedTagChange(null))}
              >
                {t('header.tags.all')}
              </button>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
                    selectedTagId === tag.id && 'bg-accent text-accent-foreground'
                  )}
                  aria-pressed={selectedTagId === tag.id}
                  onClick={() => runAndClose(() => onSelectedTagChange(tag.id))}
                >
                  {tag.color && (
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                  )}
                  <span className="truncate">{tag.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-1 border-t pt-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10"
              onClick={() => runAndClose(onRequestClearHistory)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t('header.clearHistory')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
