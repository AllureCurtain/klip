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
  Tags,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useClipboardStore } from '@/stores';
import { useConfigStore } from '@/stores/configStore';
import { formatTime, formatSize, truncate, cn } from '@/lib/utils';
import { springs, cardVariants } from '@/lib/motion';
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
  ageIndex?: number;
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
    dot: string;
  }
> = {
  text: {
    border: 'border-l-indigo-400/70',
    selected: 'bg-indigo-500/8',
    iconBg: 'bg-indigo-500/10',
    iconText: 'text-indigo-500 dark:text-indigo-400',
    dot: 'bg-indigo-400',
  },
  image: {
    border: 'border-l-emerald-400/70',
    selected: 'bg-emerald-500/8',
    iconBg: 'bg-emerald-500/10',
    iconText: 'text-emerald-500 dark:text-emerald-400',
    dot: 'bg-emerald-400',
  },
  file: {
    border: 'border-l-sky-400/70',
    selected: 'bg-sky-500/8',
    iconBg: 'bg-sky-500/10',
    iconText: 'text-sky-500 dark:text-sky-400',
    dot: 'bg-sky-400',
  },
  folder: {
    border: 'border-l-amber-400/70',
    selected: 'bg-amber-500/8',
    iconBg: 'bg-amber-500/10',
    iconText: 'text-amber-500 dark:text-amber-400',
    dot: 'bg-amber-400',
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
  ageIndex = 0,
  isSelected,
  selectionMode = false,
  onSelect,
}: ClipboardItemProps) {
  const { t } = useTranslation();
  const {
    deleteItem,
    copyItem,
    toggleFavorite,
    tags,
    assignTagToItem,
    removeTagFromItem,
    selectedIds,
    toggleSelected,
  } =
    useClipboardStore();
  const maskSensitivePreviews = useConfigStore(
    (state) => state.config.mask_sensitive_previews
  );
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isBatchSelected = selectedIds.includes(item.id);

  const opacityForAge = Math.max(0.85, 1 - ageIndex * 0.005);

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

  const handleToggleTagMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTagMenuOpen((open) => !open);
  };

  const handleTagAction = (
    e: React.MouseEvent,
    tagId: number,
    assigned: boolean
  ) => {
    e.stopPropagation();
    if (assigned) {
      removeTagFromItem(item.id, tagId);
    } else {
      assignTagToItem(item.id, tagId);
    }
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
  const strongRowState = copied || (selectionMode && isBatchSelected);

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
          <span className="text-xs text-foreground truncate block font-mono">
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

  const renderMetaLine = () => {
    const imageDetails = imageMeta
      ? `${imageMeta.width}x${imageMeta.height} ${imageMeta.format}`
      : null;

    return (
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[10px] text-muted-foreground/70">
        <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
          <span className={cn('size-1.5 rounded-full', tone.dot)} />
          <span>{typeLabel}</span>
        </span>
        <span className="shrink-0 text-muted-foreground/40" aria-hidden="true">
          ·
        </span>
        <span className="shrink-0">{formatTime(item.created_at)}</span>
        {imageDetails && (
          <>
            <span className="shrink-0 text-muted-foreground/40" aria-hidden="true">
              ·
            </span>
            <span className="shrink-0">{imageDetails}</span>
          </>
        )}
        {copied && (
          <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-primary">
            <Check className="h-2.5 w-2.5" />
            {t('clipboard.copied')}
          </span>
        )}
        {item.is_sensitive && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground"
            title={item.sensitivity_reason ?? t('clipboard.sensitive')}
          >
            <ShieldAlert className="h-2.5 w-2.5" />
            {t('clipboard.sensitive')}
          </span>
        )}
        {item.tags.slice(0, 2).map((tag) => (
          <span
            key={tag.id}
            className="inline-flex min-w-0 max-w-20 items-center gap-1 text-muted-foreground"
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
    );
  };

  return (
    <>
      <motion.div
        ref={itemRef}
        onClick={handleClick}
        variants={cardVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={springs.default}
        whileHover="hover"
        whileTap="tap"
        style={{ opacity: opacityForAge }}
        className={cn(
          'group relative flex h-14 cursor-pointer items-center gap-2 overflow-hidden',
          'rounded-xl mx-1.5 px-2.5',
          'bg-[var(--glass-bg)] backdrop-blur-sm',
          'border border-[var(--glass-border)]',
          'transition-[background-color,border-color] duration-200',
          'hover:bg-card/70 hover:border-border/70',
          isSelected && !strongRowState && 'border-primary/30 bg-primary/5',
          strongRowState && tone.selected
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
            'flex size-7 shrink-0 items-center justify-center rounded-lg',
            tone.iconBg
          )}
          aria-hidden="true"
        >
          {renderIcon()}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {renderPreview()}
          {renderMetaLine()}
        </div>

        {/* Actions */}
        <div
          className={cn(
            'absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0 rounded-full bg-card/90 backdrop-blur-sm opacity-0 shadow-[var(--shadow-raised)] transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100',
            (item.is_favorited || confirmDelete) && 'opacity-100'
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label={item.is_favorited ? t('clipboard.unfavorite') : t('clipboard.favorite')}
            title={item.is_favorited ? t('clipboard.unfavorite') : t('clipboard.favorite')}
            className="size-6"
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
          {tags.length > 0 && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('clipboard.tags')}
                title={t('clipboard.tags')}
                className="size-6"
                onClick={handleToggleTagMenu}
              >
                <Tags className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </Button>
              {tagMenuOpen && (
                <div
                  className="absolute right-0 top-7 z-30 min-w-28 rounded-lg border border-border/60 bg-popover p-1 shadow-[var(--shadow-pop)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {tags.map((tag) => {
                    const assigned = item.tags.some((existing) => existing.id === tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[10px] text-popover-foreground hover:bg-muted"
                        aria-label={
                          assigned
                            ? t('clipboard.removeTag', { name: tag.name })
                            : t('clipboard.addTag', { name: tag.name })
                        }
                        onClick={(e) => handleTagAction(e, tag.id, assigned)}
                      >
                        {tag.color && (
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                        )}
                        <span className="truncate">{tag.name}</span>
                        <span className="ml-auto text-muted-foreground">
                          {assigned ? t('clipboard.tagAssigned') : t('clipboard.tagAvailable')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('clipboard.delete')}
            title={confirmDelete ? t('clipboard.confirmDelete') : t('clipboard.delete')}
            className={cn(
              'size-6',
              confirmDelete && 'text-destructive'
            )}
            onClick={handleDelete}
          >
            <Trash2 className={cn(
              'h-3 w-3',
              confirmDelete ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'
            )} />
          </Button>
        </div>
      </motion.div>

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
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs font-medium text-foreground shrink-0">
            {summary}
          </span>
          {shape.totalSize > 0 && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatSize(shape.totalSize)}
            </span>
          )}
          {sampleLine && (
            <span className="text-[10px] text-muted-foreground/70 truncate">
              {sampleLine}
              {moreCount > 0 ? t('clipboard.moreItems', { count: moreCount }) : ''}
            </span>
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
