import { FileText, Image, File, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useClipboardStore } from '@/stores';
import { formatTime, truncate, cn } from '@/lib/utils';
import type { ClipboardItem as ClipboardItemType } from '@/types';

interface ClipboardItemProps {
  item: ClipboardItemType;
  index: number;
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

  const renderIcon = () => {
    switch (item.content_type) {
      case 'text':
        return <FileText className="h-4 w-4 text-gray-500" />;
      case 'image':
        return <Image className="h-4 w-4 text-blue-500" />;
      case 'file':
        return <File className="h-4 w-4 text-orange-500" />;
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
              className="h-10 w-10 object-cover rounded"
            />
            <span className="text-sm text-gray-500">{item.preview}</span>
          </div>
        );
      case 'file':
        return (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {item.preview}
          </span>
        );
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
