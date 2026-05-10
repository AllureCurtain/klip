import { FileText, Image, File, Folder, Files, Trash2, Star, Check, Maximize2 } from 'lucide-react';
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
    return { kind: 'unknown', preview: item.preview ?? '文件' };
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
  const { deleteItem, copyItem, toggleFavorite } = useClipboardStore();
  const [copied, setCopied] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(() => {
    copyItem(item.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [copyItem, item.id]);

  const handleClick = useCallback(() => {
    onSelect?.();
    handleCopy();
  }, [onSelect, handleCopy]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('确定要删除这条剪贴板历史吗？')) {
      return;
    }
    deleteItem(item.id);
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(item.id);
  };

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImagePreviewOpen(true);
  };

  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isSelected]);

  const fileShape = item.content_type === 'file' ? classifyFile(item) : null;
  const imageMeta = item.content_type === 'image' ? parseImageMetadata(item) : null;

  const renderIcon = () => {
    switch (item.content_type) {
      case 'text':
        return <FileText className="h-4 w-4 text-muted-foreground" />;
      case 'image':
        return <Image className="h-4 w-4 text-chart-2" />;
      case 'file': {
        if (!fileShape) return <File className="h-4 w-4 text-chart-4" />;
        switch (fileShape.kind) {
          case 'single-folder':
            return <Folder className="h-4 w-4 text-amber-500" />;
          case 'single-file':
            return <File className="h-4 w-4 text-chart-4" />;
          case 'multi':
            return <Files className="h-4 w-4 text-chart-4" />;
          case 'unknown':
            return <File className="h-4 w-4 text-chart-4" />;
        }
        return <File className="h-4 w-4 text-chart-4" />;
      }
      default:
        return null;
    }
  };

  const renderPreview = () => {
    switch (item.content_type) {
      case 'text':
        return (
          <span className="text-sm text-foreground">
            {truncate(item.preview || item.content, 100)}
          </span>
        );
      case 'image':
        return (
          <div className="flex items-center gap-2">
            <div
              className="relative group/img cursor-pointer"
              onClick={handleImageClick}
            >
              <img
                src={item.content}
                alt="剪贴板图片"
                className="h-10 w-10 object-cover rounded border border-border transition-all group-hover/img:border-primary/50"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity rounded">
                <Maximize2 className="h-4 w-4 text-white" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">{item.preview}</span>
              {imageMeta && (
                <span className="text-xs text-muted-foreground/60">
                  {imageMeta.width}x{imageMeta.height} · {imageMeta.format}
                </span>
              )}
            </div>
          </div>
        );
      case 'file': {
        if (!fileShape) {
          return (
            <span className="text-sm text-foreground">
              {item.preview}
            </span>
          );
        }
        return renderFilePreview(fileShape);
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
          'group relative flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors',
          isSelected
            ? 'bg-accent ring-2 ring-ring ring-inset'
            : 'hover:bg-accent/50',
          copied && 'bg-primary/10'
        )}
      >
        <div className="flex items-center justify-center w-5 h-5 rounded text-[10px] font-medium text-muted-foreground bg-muted shrink-0 mt-0.5">
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {renderIcon()}
            <span className="text-xs text-muted-foreground">
              {formatTime(item.created_at)}
            </span>
          </div>
          {renderPreview()}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label={item.is_favorited ? '取消收藏' : '收藏'}
            title={item.is_favorited ? '取消收藏' : '收藏'}
            className={cn(
              'size-7 transition-opacity',
              item.is_favorited
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'
            )}
            onClick={handleToggleFavorite}
          >
            <Star
              className={cn(
                'h-3.5 w-3.5',
                item.is_favorited
                  ? 'fill-amber-500 text-amber-500'
                  : 'text-muted-foreground hover:text-amber-500'
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="删除"
            title="删除"
            className="opacity-0 group-hover:opacity-100 transition-opacity size-7"
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground ml-0.5 tabular-nums">
            {index}
          </span>
        </div>
        {copied && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded pointer-events-none">
            <span className="flex items-center gap-1 text-xs font-medium text-primary bg-primary-foreground px-2 py-1 rounded shadow-sm">
              <Check className="h-3 w-3" />
              已复制
            </span>
          </div>
        )}
      </div>

      {item.content_type === 'image' && (
        <ImagePreview
          src={item.content}
          alt="剪贴板图片预览"
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

function renderFilePreview(shape: FileShape) {
  switch (shape.kind) {
    case 'single-folder':
      return (
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {shape.name}
          </span>
          <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">
            文件夹
          </span>
        </div>
      );
    case 'single-file':
      return (
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {shape.name}
          </span>
          {shape.size > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {formatSize(shape.size)}
            </span>
          )}
        </div>
      );
    case 'multi': {
      const parts: string[] = [];
      if (shape.fileCount > 0) parts.push(`${shape.fileCount} 个文件`);
      if (shape.dirCount > 0) parts.push(`${shape.dirCount} 个文件夹`);
      const summary = parts.join('，');
      const sampleLine = shape.sampleNames.join('、');
      const moreCount =
        shape.fileCount + shape.dirCount - shape.sampleNames.length;
      return (
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">
              {summary}
            </span>
            {shape.totalSize > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatSize(shape.totalSize)}
              </span>
            )}
          </div>
          {sampleLine && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {sampleLine}
              {moreCount > 0 ? ` 等 ${moreCount} 项` : ''}
            </div>
          )}
        </div>
      );
    }
    case 'unknown':
      return (
        <span className="text-sm text-foreground">
          {shape.preview}
        </span>
      );
  }
}
