import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Settings,
  FileText,
  Image,
  FolderOpen,
  Sun,
  Moon,
  Trash2,
  Star,
  X,
} from 'lucide-react';
import { Input, Button } from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useThemeStore, useClipboardStore } from '@/stores';
import { cn } from '@/lib/utils';
import { onOpenSettings, onOpenAbout } from '@/lib/tauri';
import type { Tag } from '@/types';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  contentType: string | null;
  onContentTypeChange: (type: string | null) => void;
  showFavorites: boolean;
  onShowFavoritesChange: (show: boolean) => void;
  tags: Tag[];
  selectedTagId: number | null;
  onSelectedTagChange: (tagId: number | null) => void;
  onSettingsOpen: () => void;
}

export function Header({
  searchQuery,
  onSearchChange,
  contentType,
  onContentTypeChange,
  showFavorites,
  onShowFavoritesChange,
  tags,
  selectedTagId,
  onSelectedTagChange,
  onSettingsOpen,
}: HeaderProps) {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useThemeStore();
  const {
    clearItems,
    selectedIds,
    clearSelection,
    deleteSelected,
    assignTagToSelected,
    setFavoriteForSelected,
  } = useClipboardStore();
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const contentFilters: {
    value: string | null;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { value: null, label: t('header.filter.all'), icon: null },
    { value: 'text', label: t('header.filter.text'), icon: <FileText className="h-3 w-3" /> },
    { value: 'image', label: t('header.filter.image'), icon: <Image className="h-3 w-3" /> },
    { value: 'file', label: t('header.filter.file'), icon: <FolderOpen className="h-3 w-3" /> },
  ];

  useEffect(() => {
    const unlistenSettings = onOpenSettings(() => onSettingsOpen());
    const unlistenAbout = onOpenAbout(() => onSettingsOpen());

    return () => {
      unlistenSettings.then((fn) => fn());
      unlistenAbout.then((fn) => fn());
    };
  }, [onSettingsOpen]);

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      await clearItems();
      setClearDialogOpen(false);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <header className="flex flex-col border-b border-border">
        <div
          data-tauri-drag-region
          className="flex items-center gap-1.5 px-2 pt-1.5 pb-1"
        >
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder={t('header.searchPlaceholder')}
              aria-label={t('header.searchPlaceholder')}
              autoFocus
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-7 pl-7 pr-2 text-xs"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={toggleTheme}
            aria-label={t('header.toggleTheme')}
            title={t('header.toggleTheme')}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant={showFavorites ? 'secondary' : 'ghost'}
            size="icon"
            className={cn('size-7 shrink-0')}
            onClick={() => onShowFavoritesChange(!showFavorites)}
            aria-label={t('header.showFavorites')}
            aria-pressed={showFavorites}
            title={t('header.showFavorites')}
          >
            <Star
              className={cn(
                'h-3.5 w-3.5',
                showFavorites && 'fill-amber-500 text-amber-500'
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => setClearDialogOpen(true)}
            aria-label={t('header.clearHistory')}
            title={t('header.clearHistory')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={onSettingsOpen}
            aria-label={t('header.settings')}
            title={t('header.settings')}
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-0.5 px-2 pb-1.5">
          {contentFilters.map((filter) => (
            <button
              key={filter.value ?? 'all'}
              className={cn(
                'flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium transition-colors',
                contentType === filter.value
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              )}
              aria-pressed={contentType === filter.value}
              onClick={() => onContentTypeChange(filter.value)}
            >
              {filter.icon}
              {filter.label}
            </button>
          ))}
        </div>
        {tags.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto px-2 pb-1.5 scrollbar-thin">
            <button
              className={cn(
                'h-6 shrink-0 rounded-md px-2 text-[11px] font-medium transition-colors',
                selectedTagId === null
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
              aria-pressed={selectedTagId === null}
              onClick={() => onSelectedTagChange(null)}
            >
              {t('header.tags.all')}
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                className={cn(
                  'flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors',
                  selectedTagId === tag.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
                aria-pressed={selectedTagId === tag.id}
                onClick={() => onSelectedTagChange(tag.id)}
              >
                {tag.color && (
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                )}
                {tag.name}
              </button>
            ))}
          </div>
        )}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-1 border-t border-border px-2 py-1">
            <span className="mr-auto text-[10px] text-muted-foreground">
              {t('header.selectedCount', { count: selectedIds.length })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setFavoriteForSelected(true)}
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
                onClick={() => assignTagToSelected(tag.id)}
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
              onClick={deleteSelected}
              aria-label={t('header.deleteSelected')}
              title={t('header.deleteSelected')}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={clearSelection}
              aria-label={t('header.clearSelection')}
              title={t('header.clearSelection')}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </header>

      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent className="sm:max-w-sm" closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>{t('header.clearDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('header.clearDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClearDialogOpen(false)}
              disabled={isClearing}
            >
              {t('header.clearDialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearHistory}
              disabled={isClearing}
            >
              {isClearing ? t('header.clearDialog.clearing') : t('header.clearDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
