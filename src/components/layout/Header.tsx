import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  FileText,
  Filter,
  Image,
  FolderOpen,
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
import { useThemeStore, useClipboardStore, useProductivityStore } from '@/stores';
import { cn } from '@/lib/utils';
import { HeaderMoreMenu } from './HeaderMoreMenu';
import { SelectionToolbar } from './SelectionToolbar';
import { CaptureStatusBar } from './CaptureStatusBar';
import type { ClipboardQueryOptions, Tag } from '@/types';
import { CLIPBOARD_SEARCH_INPUT_ATTRIBUTE } from '@/components/clipboard/clipboardListKeyboard';

export type HeaderAdvancedFilters = Pick<
  ClipboardQueryOptions,
  'sensitiveOnly' | 'exactMatch' | 'createdAfter' | 'createdBefore'
>;

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
  advancedFilters?: HeaderAdvancedFilters;
  onAdvancedFiltersChange?: (filters: HeaderAdvancedFilters) => void;
  selectionMode?: boolean;
  onSelectionModeChange?: (enabled: boolean) => void;
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
  advancedFilters = {
    sensitiveOnly: null,
    exactMatch: false,
    createdAfter: null,
    createdBefore: null,
  },
  onAdvancedFiltersChange = () => undefined,
  selectionMode = false,
  onSelectionModeChange = () => undefined,
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
  const {
    monitorEnabled,
    privacyModeUntil,
    setMonitorEnabled,
    setPrivacyModeForMinutes,
  } = useProductivityStore();
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const handleSelectionModeChange = () => {
    const nextSelectionMode = !selectionMode;
    if (!nextSelectionMode) {
      clearSelection();
    }
    onSelectionModeChange(nextSelectionMode);
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

  const selectedCount = selectedIds.length;
  const handleDeleteSelected = () => {
    if (selectedCount === 0) return;
    if (window.confirm(t('header.deleteSelectedConfirm', { count: selectedCount }))) {
      void deleteSelected();
    }
  };

  return (
    <>
      <header className="relative z-30 flex flex-col backdrop-blur-md bg-[var(--glass-bg)] border-b border-[var(--glass-border)]">
        <div
          data-tauri-drag-region
          className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1"
        >
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              {...{ [CLIPBOARD_SEARCH_INPUT_ATTRIBUTE]: 'true' }}
              placeholder={t('header.searchPlaceholder')}
              aria-label={t('header.searchPlaceholder')}
              autoFocus
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-7 pl-8 pr-3 text-xs bg-transparent border-[var(--glass-border)] placeholder:text-muted-foreground/50"
            />
          </div>
          <Button
            variant={hasActiveAdvancedFilters(advancedFilters) ? 'secondary' : 'ghost'}
            size="icon"
            className="size-7 shrink-0"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-label={t('header.advancedSearch')}
            aria-expanded={advancedOpen}
            title={t('header.advancedSearch')}
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
          <HeaderMoreMenu
            showFavorites={showFavorites}
            onShowFavoritesChange={onShowFavoritesChange}
            tags={tags}
            selectedTagId={selectedTagId}
            onSelectedTagChange={onSelectedTagChange}
            selectionMode={selectionMode}
            onSelectionModeChange={handleSelectionModeChange}
            onRequestClearHistory={() => setClearDialogOpen(true)}
            onSettingsOpen={onSettingsOpen}
            onToggleTheme={toggleTheme}
            resolvedTheme={resolvedTheme}
            monitorEnabled={monitorEnabled}
            privacyModeUntil={privacyModeUntil}
            onMonitorEnabledChange={setMonitorEnabled}
            onPrivacyModeForMinutes={setPrivacyModeForMinutes}
          />
        </div>

        {advancedOpen && (
          <div className="mx-2.5 mb-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-sm px-2.5 py-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-between gap-2 text-[11px]">
                <span>{t('header.advanced.sensitiveOnly')}</span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={t('header.advanced.sensitiveOnly')}
                  checked={advancedFilters.sensitiveOnly === true}
                  onChange={(event) =>
                    onAdvancedFiltersChange({
                      ...advancedFilters,
                      sensitiveOnly: event.target.checked ? true : null,
                    })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-[11px]">
                <span>{t('header.advanced.exactMatch')}</span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={t('header.advanced.exactMatch')}
                  checked={advancedFilters.exactMatch === true}
                  onChange={(event) =>
                    onAdvancedFiltersChange({
                      ...advancedFilters,
                      exactMatch: event.target.checked,
                    })
                  }
                />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <DateField
                id="advanced-created-after"
                label={t('header.advanced.createdAfter')}
                value={advancedFilters.createdAfter}
                onChange={(createdAfter) =>
                  onAdvancedFiltersChange({ ...advancedFilters, createdAfter })
                }
              />
              <DateField
                id="advanced-created-before"
                label={t('header.advanced.createdBefore')}
                value={advancedFilters.createdBefore}
                endOfDay
                onChange={(createdBefore) =>
                  onAdvancedFiltersChange({ ...advancedFilters, createdBefore })
                }
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 px-2.5 pb-1.5">
          {contentFilters.map((filter) => (
            <button
              key={filter.value ?? 'all'}
              className={cn(
                'flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-medium transition-all duration-200',
                contentType === filter.value
                  ? 'bg-primary/15 text-primary shadow-[var(--shadow-ring)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--glass-bg)]'
              )}
              aria-pressed={contentType === filter.value}
              onClick={() => onContentTypeChange(filter.value)}
            >
              {filter.icon}
              {filter.label}
            </button>
          ))}
        </div>

        <CaptureStatusBar
          monitorEnabled={monitorEnabled}
          privacyModeUntil={privacyModeUntil}
          onResumeMonitoring={() => setMonitorEnabled(true)}
          onEndPrivacyMode={() => setPrivacyModeForMinutes(0)}
        />

        {selectionMode && (
          <SelectionToolbar
            selectedCount={selectedCount}
            tags={tags}
            onFavoriteSelected={() => setFavoriteForSelected(true)}
            onAssignTagToSelected={assignTagToSelected}
            onDeleteSelected={handleDeleteSelected}
            onClearSelection={clearSelection}
          />
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

function hasActiveAdvancedFilters(filters: HeaderAdvancedFilters): boolean {
  return (
    filters.sensitiveOnly !== null ||
    filters.exactMatch === true ||
    filters.createdAfter !== null ||
    filters.createdBefore !== null
  );
}

interface DateFieldProps {
  id: string;
  label: string;
  value?: number | null;
  endOfDay?: boolean;
  onChange: (value: number | null) => void;
}

function DateField({ id, label, value, endOfDay = false, onChange }: DateFieldProps) {
  return (
    <label htmlFor={id} className="space-y-1 text-[11px]">
      <span className="block text-muted-foreground">{label}</span>
      <Input
        id={id}
        type="date"
        value={value ? toDateInputValue(value) : ''}
        onChange={(event) => onChange(dateInputToMillis(event.target.value, endOfDay))}
        className="h-7 px-2 text-[11px]"
      />
    </label>
  );
}

function toDateInputValue(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateInputToMillis(value: string, endOfDay: boolean): number | null {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}
