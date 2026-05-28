import { useTranslation } from 'react-i18next';
import { truncate } from '@/lib/utils';
import type { RendererProps } from './rendererRegistry';

export function TextClipboardRenderer({
  item,
  shouldMaskPreview,
}: RendererProps) {
  const { t } = useTranslation();

  if (shouldMaskPreview) {
    return (
      <span className="block truncate text-xs text-muted-foreground">
        {t('clipboard.sensitiveHidden')}
      </span>
    );
  }

  const displayText = truncate(item.preview || item.content, 80);
  const fullText = item.content || item.preview || '';
  return (
    <span
      className="block truncate font-mono text-xs text-foreground/90 transition-colors duration-150 group-hover:text-foreground group-hover:underline group-hover:decoration-border group-hover:underline-offset-2"
      title={fullText}
    >
      {displayText}
    </span>
  );
}
