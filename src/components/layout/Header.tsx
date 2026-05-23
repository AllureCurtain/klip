import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Settings,
  FileText,
  Image,
  FolderOpen,
  Sun,
  Moon,
} from 'lucide-react';
import { Input, Button } from '@/components/ui';
import { useThemeStore } from '@/stores';
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
  onSettingsOpen,
}: HeaderProps) {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useThemeStore();

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

  return (
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
    </header>
  );
}
