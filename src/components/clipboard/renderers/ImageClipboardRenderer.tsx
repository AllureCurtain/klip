import { useTranslation } from 'react-i18next';
import type { RendererProps } from './rendererRegistry';

export function ImageClipboardRenderer({
  item,
  shouldMaskPreview,
  onImageClick,
}: RendererProps) {
  const { t } = useTranslation();

  if (shouldMaskPreview) {
    return (
      <span className="block truncate text-xs text-muted-foreground">
        {t('clipboard.sensitiveHidden')}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        className="relative shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background group/img"
        onClick={onImageClick}
        aria-label={t('clipboard.previewImage')}
        title={t('clipboard.previewImage')}
      >
        <img
          src={item.content}
          alt=""
          className="h-8 w-8 rounded border border-border object-cover transition-colors group-hover/img:border-primary/40"
        />
      </button>
      <div className="flex min-w-0 flex-col">
        <span
          className="truncate text-xs text-muted-foreground transition-colors duration-150 group-hover:text-foreground"
          title={item.preview ?? undefined}
        >
          {item.preview}
        </span>
      </div>
    </div>
  );
}
