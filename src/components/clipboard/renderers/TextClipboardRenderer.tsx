import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { truncate } from '@/lib/utils';
import type { RendererProps } from './rendererRegistry';

const RICH_TEXT_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'em',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
] as const;

export function sanitizeRichTextHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...RICH_TEXT_TAGS],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
  });
}

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
  const html = item.formats.find((format) => format.format === 'html')?.content;
  const sanitizedHtml = html ? sanitizeRichTextHtml(html) : '';
  if (sanitizedHtml.trim()) {
    return (
      <div
        className="pointer-events-none max-h-10 overflow-hidden text-xs text-foreground/90 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_code]:font-mono [&_p]:inline [&_pre]:font-mono [&_table]:max-w-full"
        data-testid="rich-text-preview"
        title={fullText}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

  return (
    <span
      className="block truncate font-mono text-xs text-foreground/90 transition-colors duration-150 group-hover:text-foreground group-hover:underline group-hover:decoration-border group-hover:underline-offset-2"
      title={fullText}
    >
      {displayText}
    </span>
  );
}
