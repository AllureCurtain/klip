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

export function ClipboardItem({ item, index, isSelected, onSelect }: ClipboardItemProps) {
  const { t } = useTranslation();
  const { deleteItem, copyItem, toggleFavorite, selectedIds, toggleSelected } =
    useClipboardStore();
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
    handleCopy();
  }, [onSelect, handleCopy]);

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

  const renderIcon = () => {
    switch (item.content_type) {
      case 'text':
        return <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
      case 'image':
        return <Image className="h-3.5 w-3.5 text-primary shrink-0" />;
      case 'file': {
        if (!fileShape) return <File className="h-3.5 w-3.5 text-primary/70 shrink-0" />;
        switch (fileShape.kind) {
          case 'single-folder':
            return <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
          case 'single-file':
          case 'multi':
          case 'unknown':
            return <Files className="h-3.5 w-3.5 text-primary/70 shrink-0" />;
        }
        return <File className="h-3.5 w-3.5 text-primary/70 shrink-0" />;
      }
      default:
        return null;
    }
  };

  const renderPreview = () => {
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
            <div
              className="relative group/img cursor-pointer shrink-0"
              onClick={handleImageClick}
            >
              <img
                src={item.content}
                alt=""
                className="h-8 w-8 object-cover rounded border border-border transition-colors group-hover/img:border-primary/40"
              />
            </div>
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
          'group relative flex h-16 cursor-pointer items-center gap-2 overflow-hidden px-2.5 transition-colors',
          isSelected
            ? 'bg-accent'
            : 'hover:bg-muted/60',
          isBatchSelected && 'bg-primary/5',
          copied && 'bg-primary/5'
        )}
      >
        <input
          type="checkbox"
          checked={isBatchSelected}
          onClick={handleToggleSelected}
          onChange={() => undefined}
          aria-label={t('clipboard.select')}
          className="size-3.5 shrink-0 accent-primary"
        />

        {/* Index badge */}
        <span className="w-5 text-right text-[10px] font-mono tabular-nums text-muted-foreground/60 shrink-0 select-none">
          {index}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {renderIcon()}
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
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs font-medium text-foreground truncate">
            {shape.name}
          </span>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">
            {t('clipboard.folder')}
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
