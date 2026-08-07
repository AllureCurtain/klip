import {
  AppWindow,
  Check,
  CircleAlert,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  LoaderCircle,
  ScanText,
  ShieldAlert,
  Star,
  Tags,
  Trash2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useConfigStore } from '@/stores/configStore';
import { formatTime, cn } from '@/lib/utils';
import { springs, cardVariants } from '@/lib/motion';
import type { ClipboardItem as ClipboardItemType } from '@/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePreview } from './ImagePreview';
import { useClipboardItemActions } from './useClipboardItemActions';
import {
  classifyFile,
  getClipKind,
  parseImageMetadata,
} from './renderers/clipboardContentModel';
import {
  CLIP_TONES,
  ClipboardTypeIcon,
  RENDERER_REGISTRY,
} from './renderers/rendererRegistry';

interface ClipboardItemProps {
  item: ClipboardItemType;
  index: number;
  ageIndex?: number;
  isSelected: boolean;
  selectionMode?: boolean;
  onSelect?: () => void;
}

export function ClipboardItem({
  item,
  ageIndex = 0,
  isSelected,
  selectionMode = false,
  onSelect,
}: ClipboardItemProps) {
  const { t } = useTranslation();
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const maskSensitivePreviews = useConfigStore(
    (state) => state.config.mask_sensitive_previews
  );
  const {
    copied,
    confirmDelete,
    tagMenuOpen,
    tags,
    isBatchSelected,
    handleClick,
    handleCopy,
    handleCopyPlainText,
    handlePastePlainText,
    handleDelete,
    handleToggleFavorite,
    handleToggleTagMenu,
    handleTagAction,
    handleToggleSelected,
  } = useClipboardItemActions({ item, selectionMode, onSelect });

  const fileShape = useMemo(
    () => (item.content_type === 'file' ? classifyFile(item) : null),
    [item]
  );
  const imageMeta = useMemo(
    () => (item.content_type === 'image' ? parseImageMetadata(item) : null),
    [item]
  );
  const clipKind = getClipKind(item, fileShape);
  const tone = CLIP_TONES[clipKind];
  const Renderer = RENDERER_REGISTRY[item.content_type];
  const shouldMaskPreview = item.is_sensitive && maskSensitivePreviews;
  const opacityForAge = Math.max(0.85, 1 - ageIndex * 0.005);
  const typeLabel = t(`clipboard.types.${clipKind}`);
  const strongRowState = copied || (selectionMode && isBatchSelected);

  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isSelected]);

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImagePreviewOpen(true);
  };

  return (
    <>
      <motion.div
        data-testid="clipboard-item"
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
          'rounded-xl px-2.5',
          'bg-[var(--glass-bg)] backdrop-blur-sm',
          'border border-[var(--glass-border)]',
          'transition-[background-color,border-color] duration-200',
          'hover:bg-card/70 hover:border-border/70',
          isSelected && !strongRowState && 'border-primary/30 bg-primary/5',
          strongRowState &&
            'border-primary/35 bg-primary/8 text-foreground shadow-[var(--shadow-ring)]'
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
          <ClipboardTypeIcon clipKind={clipKind} fileShape={fileShape} tone={tone} />
        </span>

        <div className="min-w-0 flex-1">
          <Renderer
            item={item}
            shouldMaskPreview={shouldMaskPreview}
            fileShape={fileShape}
            imageMeta={imageMeta}
            onImageClick={handleImageClick}
          />
          <MetaLine
            item={item}
            copied={copied}
            imageMeta={imageMeta}
            toneDot={tone.dot}
            typeLabel={typeLabel}
          />
        </div>

        <RowActions
          item={item}
          confirmDelete={confirmDelete}
          tagMenuOpen={tagMenuOpen}
          tags={tags}
          onCopy={handleCopy}
          onCopyPlainText={handleCopyPlainText}
          onPastePlainText={handlePastePlainText}
          onDelete={handleDelete}
          onTagAction={handleTagAction}
          onToggleFavorite={handleToggleFavorite}
          onToggleTagMenu={handleToggleTagMenu}
        />
      </motion.div>

      {item.content_type === 'image' && (
        <ImagePreview
          src={item.content}
          alt=""
          metadata={
            imageMeta
              ? {
                  width: imageMeta.width,
                  height: imageMeta.height,
                  format: imageMeta.format,
                }
              : undefined
          }
          open={imagePreviewOpen}
          onOpenChange={setImagePreviewOpen}
        />
      )}
    </>
  );
}

function MetaLine({
  item,
  copied,
  imageMeta,
  toneDot,
  typeLabel,
}: {
  item: ClipboardItemType;
  copied: boolean;
  imageMeta: { width: number; height: number; format: string } | null;
  toneDot: string;
  typeLabel: string;
}) {
  const { t } = useTranslation();
  const imageDetails = imageMeta
    ? `${imageMeta.width}x${imageMeta.height} ${imageMeta.format}`
    : null;
  const ocr = item.content_type === 'image' ? item.ocr : null;
  const ocrLabel = ocr
    ? ocr.status === 'pending'
      ? t('clipboard.ocr.pending')
      : ocr.status === 'failed'
        ? t('clipboard.ocr.failed')
        : ocr.text.trim()
          ? t('clipboard.ocr.completed')
          : t('clipboard.ocr.empty')
    : null;
  const sourceLabel = item.source_application ?? item.source_window_title;
  const sourceTitle = [item.source_application, item.source_window_title]
    .filter((value): value is string => Boolean(value))
    .join(' - ');

  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[10px] text-muted-foreground/70">
      <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
        <span className={cn('size-1.5 rounded-full', toneDot)} />
        <span>{typeLabel}</span>
      </span>
      <span className="shrink-0 text-muted-foreground/40" aria-hidden="true">
        .
      </span>
      <span className="shrink-0">{formatTime(item.created_at)}</span>
      {sourceLabel && (
        <>
          <span className="shrink-0 text-muted-foreground/40" aria-hidden="true">
            .
          </span>
          <span
            className="inline-flex min-w-0 max-w-24 items-center gap-0.5 text-muted-foreground"
            title={sourceTitle}
            data-testid="clipboard-source"
          >
            <AppWindow className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{sourceLabel}</span>
          </span>
        </>
      )}
      {imageDetails && (
        <>
          <span className="shrink-0 text-muted-foreground/40" aria-hidden="true">
            .
          </span>
          <span className="shrink-0">{imageDetails}</span>
        </>
      )}
      {ocr && ocrLabel && (
        <>
          <span className="shrink-0 text-muted-foreground/40" aria-hidden="true">
            .
          </span>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-0.5',
              ocr.status === 'failed' && 'text-destructive',
              ocr.status === 'completed' && 'text-emerald-600 dark:text-emerald-400'
            )}
            title={ocr.error ?? (ocr.text.trim() || ocrLabel)}
            data-testid="ocr-status"
          >
            {ocr.status === 'pending' ? (
              <LoaderCircle className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
            ) : ocr.status === 'failed' ? (
              <CircleAlert className="h-2.5 w-2.5" aria-hidden="true" />
            ) : (
              <ScanText className="h-2.5 w-2.5" aria-hidden="true" />
            )}
            {ocrLabel}
          </span>
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
}

function RowActions({
  item,
  confirmDelete,
  tagMenuOpen,
  tags,
  onDelete,
  onCopy,
  onCopyPlainText,
  onPastePlainText,
  onTagAction,
  onToggleFavorite,
  onToggleTagMenu,
}: {
  item: ClipboardItemType;
  confirmDelete: boolean;
  tagMenuOpen: boolean;
  tags: Array<{ id: number; name: string; color: string | null }>;
  onDelete: (event: React.MouseEvent) => void;
  onCopy: (event: React.MouseEvent) => void;
  onCopyPlainText: (event: React.MouseEvent) => void;
  onPastePlainText: (event: React.MouseEvent) => void;
  onTagAction: (event: React.MouseEvent, tagId: number, assigned: boolean) => void;
  onToggleFavorite: (event: React.MouseEvent) => void;
  onToggleTagMenu: (event: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0 rounded-full bg-card/90 opacity-0 shadow-[var(--shadow-raised)] backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100',
        (item.is_favorited || confirmDelete) && 'opacity-100'
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('clipboard.copy')}
        title={t('clipboard.copy')}
        className="size-6"
        onClick={onCopy}
      >
        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
      </Button>
      {item.content_type === 'text' && (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('clipboard.copyPlainText')}
            title={t('clipboard.copyPlainText')}
            className="size-6"
            onClick={onCopyPlainText}
          >
            <ClipboardCopy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('clipboard.pastePlainText')}
            title={t('clipboard.pastePlainText')}
            className="size-6"
            onClick={onPastePlainText}
          >
            <ClipboardPaste className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={item.is_favorited ? t('clipboard.unfavorite') : t('clipboard.favorite')}
        title={item.is_favorited ? t('clipboard.unfavorite') : t('clipboard.favorite')}
        className="size-6"
        onClick={onToggleFavorite}
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
            onClick={onToggleTagMenu}
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
                    onClick={(e) => onTagAction(e, tag.id, assigned)}
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
        className={cn('size-6', confirmDelete && 'text-destructive')}
        onClick={onDelete}
      >
        <Trash2
          className={cn(
            'h-3 w-3',
            confirmDelete
              ? 'text-destructive'
              : 'text-muted-foreground hover:text-destructive'
          )}
        />
      </Button>
    </div>
  );
}
