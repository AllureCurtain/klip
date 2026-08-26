import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RendererProps } from './rendererRegistry';
import { systemApi } from '@/lib/tauri';

export function ImageClipboardRenderer({
  item,
  shouldMaskPreview,
  onImageClick,
}: RendererProps) {
  const { t } = useTranslation();
  const [thumbnailUrl, setThumbnailUrl] = useState(item.content || '');
  const recognizedText = item.ocr?.status === 'completed' ? item.ocr.text.trim() : '';
  const previewText = recognizedText || item.preview || t('clipboard.types.image');

  useEffect(() => {
    if (item.content) {
      setThumbnailUrl(item.content);
      return;
    }
    let url = '';
    void systemApi.getImageThumbnail(item.id).then((bytes) => {
      url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      setThumbnailUrl(url);
    }).catch(() => setThumbnailUrl(''));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [item.content, item.id]);

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
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="h-8 w-8 rounded border border-border object-cover transition-colors group-hover/img:border-primary/40" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded border border-border bg-muted text-[9px] text-muted-foreground">IMG</span>
        )}
      </button>
      <div className="flex min-w-0 flex-col">
        <span
          className="truncate text-xs text-muted-foreground transition-colors duration-150 group-hover:text-foreground"
          title={previewText}
        >
          {previewText}
        </span>
      </div>
    </div>
  );
}
