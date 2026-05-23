import {
  FileText,
  Image,
  File,
  Folder,
  Files,
  Trash2,
  Star,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useClipboardStore } from '@/stores';
import { useConfigStore } from '@/stores/configStore';
import { formatTime, formatSize, truncate, cn } from '@/lib/utils';
import type {
  ClipboardItem as ClipboardItemType,
  FileMetadata,
  ImageMetadata,
} from '@/types';
import { useState, useCallback, useEffect, useRef } from 'react';
import { ImagePreview } from './ImagePreview';

interface ClipboardItemProps {
  item: ClipboardItemType;
  index: number;
  isSelected: boolean;
  selectionMode?: boolean;
  onSelect?: () => void;
}

function parseFileMetadata(item: ClipboardItemType): FileMetadata | null {
  if (item.content_type !== 'file' || !item.metadata) return null;
  try {
    return JSON.parse(item.metadata) as FileMetadata;
  } catch {
    return null;
  }
}

function parseImageMetadata(item: ClipboardItemType): ImageMetadata | null {
  if (item.content_type !== 'image' || !item.metadata) return null;
  try {
    return JSON.parse(item.metadata) as ImageMetadata;
  } catch {
    return null;
  }
}

type FileShape =
  | { kind: 'single-file'; name: string; size: number }
  | { kind: 'single-folder'; name: string }
  | {
      kind: 'multi';
      fileCount: number;
      dirCount: number;
      totalSize: number;
      sampleNames: string[];
    }
  | { kind: 'unknown'; preview: string };

type ClipKind = 'text' | 'image' | 'file' | 'folder';

const CLIP_TONES: Record<
  ClipKind,
  {
    border: string;
    selected: string;
    iconBg: string;
    iconText: string;
    badge: string;
  }
> = {
  text: {
    border: 'border-l-sky-500',
    selected: 'bg-sky-500/10',
    iconBg: 'bg-sky-500/10',
    iconText: 'text-sky-600 dark:text-sky-400',
    badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  image: {
    border: 'border-l-emerald-500',
    selected: 'bg-emerald-500/10',
    iconBg: 'bg-emerald-500/10',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  file: {
    border: 'border-l-blue-500',
    selected: 'bg-blue-500/10',
    iconBg: 'bg-blue-500/10',
    iconText: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  },
  folder: {
    border: 'border-l-amber-500',
    selected: 'bg-amber-500/10',
    iconBg: 'bg-amber-500/10',
    iconText: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
};

function getClipKind(item: ClipboardItemType, fileShape: FileShape | null): ClipKind {
  if (item.content_type === 'text') return 'text';
  if (item.content_type === 'image') return 'image';
  if (fileShape?.kind === 'single-folder') return 'folder';
  if (
    fileShape?.kind === 'multi' &&
    fileShape.dirCount > 0 &&
    fileShape.fileCount === 0
  ) {
    return 'folder';
  }
  return 'file';
}

function classifyFile(item: ClipboardItemType): FileShape {
  const meta = parseFileMetadata(item);
  if (!meta) {
    return { kind: 'unknown', preview: item.preview ?? '' };
  }

  const fileCount = meta.file_count ?? 0;
  const dirCount = meta.dir_count ?? 0;
  const total = fileCount + dirCount;
  const items = meta.items ?? [];

  if (total === 1 && items.length >= 1) {
    const only = items[0];
    return only.is_dir
      ? { kind: 'single-folder', name: only.name }
      : { kind: 'single-file', name: only.name, size: only.size };
  }

  return {
    kind: 'multi',
    fileCount,
    dirCount,
    totalSize: meta.total_size ?? 0,
    sampleNames: items.slice(0, 3).map((it) => (it.is_dir ? `${it.name}/` : it.name)),
  };
}

export function ClipboardItem({
  item,
  isSelected,
  selectionMode = false,
  onSelect,
}: ClipboardItemProps) {
  const { t } = useTranslation();
  const { deleteItem, copyItem, toggleFavorite, selectedIds, toggleSelected } =
    useClipboardStore();
  const maskSensitivePreviews = useConfigStore(
    (state) => state.config.mask_sensitive_previews
  );
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isBatchSelected = selectedIds.includes(item.id);

  const handleCopy = useCallback(() => {
    copyItem(item.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 800);
  }, [copyItem, item.id]);

  const handleClick = useCallback(() => {
    onSelect?.();
    if (selectionMode) {
      toggleSelected(item.id);
      return;
    }
    handleCopy();
  }, [handleCopy, item.id, onSelect, selectionMode, toggleSelected]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      clearTimeout(confirmTimerRef.current);
      deleteItem(item.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 2000);
    }
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(item.id);
  };

  const handleToggleSelected = (e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    toggleSelected(item.id);
  };

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImagePreviewOpen(true);
  };

  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isSelected]);

  useEffect(() => {
    return () => clearTimeout(confirmTimerRef.current);
  }, []);

  const fileShape = item.content_type === 'file' ? classifyFile(item) : null;
  const imageMeta = item.content_type === 'image' ? parseImageMetadata(item) : null;
  const shouldMaskPreview = item.is_sensitive && maskSensitivePreviews;
  const clipKind = getClipKind(item, fileShape);
  const tone = CLIP_TONES[clipKind];
  const typeLabel = t(`clipboard.types.${clipKind}`);
  const highlighted = isSelected || (selectionMode && isBatchSelected) || copied;

  const renderIcon = () => {
    const className = cn('h-3.5 w-3.5 shrink-0', tone.iconText);
    switch (clipKind) {
      case 'text':
        return <FileText className={className} />;
      case 'image':
        return <Image className={className} />;
      case 'folder':
        return <Folder className={className} />;
      case 'file':
        if (!fileShape) return <File className={className} />;
        switch (fileShape.kind) {
          case 'single-file':
          case 'multi':
            return <Files className={className} />;
          case 'unknown':
            return <File className={className} />;
          case 'single-folder':
            return <Folder className={className} />;
        }
    }
  };

  const renderPreview = () => {
    if (shouldMaskPreview) {
      return (
        <span className="text-xs text-muted-foreground truncate block">
          {t('clipboard.sensitiveHidden')}
        </span>
      );
    }

    switch (item.content_type) {
      case 'text':
        return (
          <span className="text-xs text-foreground truncate block">
            {truncate(item.preview || item.content, 80)}
          </span>
        );
      case 'image':
        return (
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              className="relative group/img shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={handleImageClick}
              aria-label={t('clipboard.previewImage')}
              title={t('clipboard.previewImage')}
            >
              <img
                src={item.content}
                alt=""
                className="h-8 w-8 object-cover rounded border border-border transition-colors group-hover/img:border-primary/40"
              />
            </button>
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-muted-foreground truncate">{item.preview}</span>
              {imageMeta && (
                <span className="text-[10px] text-muted-foreground/60">
                  {imageMeta.width}x{imageMeta.height} · {imageMeta.format}
                </span>
              )}
            </div>
          </div>
        );
      case 'file': {
        if (!fileShape) {
          return <span className="text-xs text-foreground">{item.preview}</span>;
        }
        return renderFilePreview(fileShape, t);
      }
      default:
        return null;
    }
  };

  return (
    <>
      <div
        ref={itemRef}
        onClick={handleClick}
        className={cn(
          'group relative flex h-14 cursor-pointer items-center gap-2 overflow-hidden border-l-2 px-2.5 transition-colors',
          tone.border,
          highlighted ? tone.selected : 'hover:bg-muted/60'
        )}
      >
        {selectionMode && (
          <input
            type="checkbox"
            checked={isBatchSelected}
            onClick={handleToggleSelected}
            onChange={() => undefined}
            aria-label={t('clipboard.select')}
            className="size-3.5 shrink-0 accent-primary"
          />
        )}

        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md',
            tone.iconBg
          )}
          aria-hidden="true"
        >
          {renderIcon()}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className={cn(
                'rounded-sm px-1.5 py-0.5 text-[10px] font-medium leading-none',
                tone.badge
              )}
            >
              {typeLabel}
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              {formatTime(item.created_at)}
            </span>
            {copied && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-primary">
                <Check className="h-2.5 w-2.5" />
                {t('clipboard.copied')}
              </span>
            )}
            {item.is_sensitive && (
              <span
                className="flex items-center gap-0.5 text-[10px] font-medium text-destructive"
                title={item.sensitivity_reason ?? t('clipboard.sensitive')}
              >
                <ShieldAlert className="h-2.5 w-2.5" />
                {t('clipboard.sensitive')}
              </span>
            )}
          </div>
          {renderPreview()}
          {item.tags.length > 0 && (
            <div className="mt-0.5 flex gap-1 overflow-hidden">
              {item.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex max-w-20 items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                  title={tag.name}
                >
                  {tag.color && (
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                  )}
                  <span className="truncate">{tag.name}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label={item.is_favorited ? t('clipboard.unfavorite') : t('clipboard.favorite')}
            title={item.is_favorited ? t('clipboard.unfavorite') : t('clipboard.favorite')}
            className={cn(
              'size-6 transition-opacity',
              item.is_favorited
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'
            )}
            onClick={handleToggleFavorite}
          >
            <Star
              className={cn(
                'h-3 w-3',
                item.is_favorited
                  ? 'fill-amber-500 text-amber-500'
                  : 'text-muted-foreground hover:text-amber-500'
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('clipboard.delete')}
            title={confirmDelete ? t('clipboard.confirmDelete') : t('clipboard.delete')}
            className={cn(
              'size-6 transition-opacity',
              confirmDelete
                ? 'opacity-100 text-destructive'
                : 'opacity-0 group-hover:opacity-100'
            )}
            onClick={handleDelete}
          >
            <Trash2 className={cn(
              'h-3 w-3',
              confirmDelete ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'
            )} />
          </Button>
        </div>
      </div>

      {item.content_type === 'image' && (
        <ImagePreview
          src={item.content}
          alt=""
          metadata={imageMeta ? {
            width: imageMeta.width,
            height: imageMeta.height,
            format: imageMeta.format,
          } : undefined}
          open={imagePreviewOpen}
          onOpenChange={setImagePreviewOpen}
        />
      )}
    </>
  );
}

function renderFilePreview(
  shape: FileShape,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (shape.kind) {
    case 'single-folder':
      return (
        <div className="flex items-baseline min-w-0">
          <span className="text-xs font-medium text-foreground truncate">
            {shape.name}
          </span>
        </div>
      );
    case 'single-file':
      return (
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs font-medium text-foreground truncate">
            {shape.name}
          </span>
          {shape.size > 0 && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatSize(shape.size)}
            </span>
          )}
        </div>
      );
    case 'multi': {
      const parts: string[] = [];
      if (shape.fileCount > 0) {
        parts.push(t('clipboard.fileCount', { count: shape.fileCount }));
      }
      if (shape.dirCount > 0) {
        parts.push(t('clipboard.folderCount', { count: shape.dirCount }));
      }
      const summary = parts.join(t('clipboard.summarySeparator'));
      const sampleLine = shape.sampleNames.join(t('clipboard.sampleSeparator'));
      const moreCount =
        shape.fileCount + shape.dirCount - shape.sampleNames.length;
      return (
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-foreground">
              {summary}
            </span>
            {shape.totalSize > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {formatSize(shape.totalSize)}
              </span>
            )}
          </div>
          {sampleLine && (
            <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
              {sampleLine}
              {moreCount > 0 ? t('clipboard.moreItems', { count: moreCount }) : ''}
            </div>
          )}
        </div>
      );
    }
    case 'unknown':
      return (
        <span className="text-xs text-foreground">
          {shape.preview}
        </span>
      );
  }
}
