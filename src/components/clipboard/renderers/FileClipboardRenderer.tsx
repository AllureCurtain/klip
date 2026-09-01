import { useTranslation } from 'react-i18next';
import { formatSize } from '@/lib/utils';
import type { FileShape } from './clipboardContentModel';
import type { RendererProps } from './rendererRegistry';

export function FileClipboardRenderer({
  item,
  shouldMaskPreview,
  fileShape,
}: RendererProps) {
  const { t } = useTranslation();

  if (shouldMaskPreview) {
    return (
      <span className="block truncate text-xs text-muted-foreground">
        {t('clipboard.sensitiveHidden')}
      </span>
    );
  }

  if (!fileShape) {
    return <span className="text-xs text-foreground">{item.preview}</span>;
  }

  return <>{renderFilePreview(fileShape, t)}</>;
}

function renderFilePreview(
  shape: FileShape,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (shape.kind) {
    case 'single-folder':
      return (
        <div className="flex min-w-0 items-baseline">
          <span className="truncate text-xs font-medium text-foreground">
            {shape.name}
          </span>
        </div>
      );
    case 'single-file':
      return (
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-xs font-medium text-foreground">
            {shape.name}
          </span>
          {shape.size > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
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
      const moreCount = shape.fileCount + shape.dirCount - shape.sampleNames.length;
      return (
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-xs font-medium text-foreground">
            {summary}
          </span>
          {shape.totalSize > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatSize(shape.totalSize)}
            </span>
          )}
          {sampleLine && (
            <span className="truncate text-[10px] text-muted-foreground">
              {sampleLine}
              {moreCount > 0 ? t('clipboard.moreItems', { count: moreCount }) : ''}
            </span>
          )}
        </div>
      );
    }
    case 'unknown':
      return <span className="text-xs text-foreground">{shape.preview}</span>;
  }
}
