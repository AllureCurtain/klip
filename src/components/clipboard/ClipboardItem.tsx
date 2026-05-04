import { FileText, Image, File, Folder, Files, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useClipboardStore } from '@/stores';
import { formatTime, formatSize, truncate, cn } from '@/lib/utils';
import type {
  ClipboardItem as ClipboardItemType,
  FileMetadata,
} from '@/types';

interface ClipboardItemProps {
  item: ClipboardItemType;
  index: number;
}

/**
 * Parse the JSON metadata blob attached to a `file` clipboard item.
 * Returns null for non-file items, missing metadata, or malformed JSON
 * so the caller can fall back to plain preview rendering.
 */
function parseFileMetadata(item: ClipboardItemType): FileMetadata | null {
  if (item.content_type !== 'file' || !item.metadata) return null;
  try {
    return JSON.parse(item.metadata) as FileMetadata;
  } catch {
    return null;
  }
}

/**
 * Decide which composite to render for a `file` clipboard item:
 *  - `single-file`   → file icon + filename + size
 *  - `single-folder` → folder icon + folder name
 *  - `multi`         → stacked-files icon + counts breakdown
 *  - `unknown`       → fallback for items missing the new metadata schema
 */
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

export function ClipboardItem({ item, index }: ClipboardItemProps) {
  const { deleteItem, copyItem } = useClipboardStore();

  const handleCopy = () => {
    copyItem(item.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteItem(item.id);
  };

  const fileShape = item.content_type === 'file' ? classifyFile(item) : null;

  const renderIcon = () => {
    switch (item.content_type) {
      case 'text':
        return <FileText className="h-4 w-4 text-gray-500" />;
      case 'image':
        return <Image className="h-4 w-4 text-blue-500" />;
      case 'file': {
        if (!fileShape) return <File className="h-4 w-4 text-orange-500" />;
        switch (fileShape.kind) {
          case 'single-folder':
            return <Folder className="h-4 w-4 text-amber-500" />;
          case 'single-file':
            return <File className="h-4 w-4 text-orange-500" />;
          case 'multi':
            return <Files className="h-4 w-4 text-orange-500" />;
          case 'unknown':
            return <File className="h-4 w-4 text-orange-500" />;
        }
      }
    }
  };

  const renderPreview = () => {
    switch (item.content_type) {
      case 'text':
        return (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {truncate(item.preview || item.content, 100)}
          </span>
        );
      case 'image':
        return (
          <div className="flex items-center gap-2">
            <img
              src={item.content}
              alt="剪贴板图片"
              className="h-10 w-10 object-cover rounded border border-gray-200 dark:border-gray-700"
            />
            <span className="text-sm text-gray-500">{item.preview}</span>
          </div>
        );
      case 'file': {
        if (!fileShape) {
          return (
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {item.preview}
            </span>
          );
        }
        return renderFilePreview(fileShape);
      }
    }
  };

  return (
    <div
      onClick={handleCopy}
      className={cn(
        'group flex items-start gap-3 p-3 rounded-lg cursor-pointer',
        'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
      )}
    >
      <div className="flex items-center justify-center w-6 h-6 rounded bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-500">
        {index}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {renderIcon()}
          <span className="text-xs text-gray-400">
            {formatTime(item.created_at)}
          </span>
        </div>
        {renderPreview()}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
        onClick={handleDelete}
      >
        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
      </Button>
    </div>
  );
}

function renderFilePreview(shape: FileShape) {
  switch (shape.kind) {
    case 'single-folder':
      return (
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
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
          <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
            {shape.name}
          </span>
          {shape.size > 0 && (
            <span className="text-xs text-gray-400 shrink-0">
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
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {summary}
            </span>
            {shape.totalSize > 0 && (
              <span className="text-xs text-gray-400">
                {formatSize(shape.totalSize)}
              </span>
            )}
          </div>
          {sampleLine && (
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {sampleLine}
              {moreCount > 0 ? ` 等 ${moreCount} 项` : ''}
            </div>
          )}
        </div>
      );
    }
    case 'unknown':
      return (
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {shape.preview}
        </span>
      );
  }
}
