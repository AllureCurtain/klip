import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppWindow,
  CalendarClock,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Download,
  File,
  Folder,
  HardDrive,
  RotateCcw,
  ScanText,
  ShieldAlert,
  SquarePen,
  Tags,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useClipboardStore } from '@/stores';
import { useConfigStore } from '@/stores/configStore';
import { cn, formatSize } from '@/lib/utils';
import {
  MAX_CLIPBOARD_NOTE_LENGTH,
  MAX_CLIPBOARD_TITLE_LENGTH,
} from '@/lib/constants';
import type {
  ClipboardItem,
  ClipboardContentAction,
  FileItemSummary,
  FileMetadata,
  ImageMetadata,
} from '@/types';
import { sanitizeRichTextHtml } from './renderers/TextClipboardRenderer';
import {
  parseFileMetadata,
  parseImageMetadata,
} from './renderers/clipboardContentModel';
import { useClipboardContentActions } from './useClipboardContentActions';
import { contentActionPresentation } from './clipboardContentActions';

interface ClipboardDetailDialogProps {
  item: ClipboardItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClipboardDetailDialog({
  item,
  open,
  onOpenChange,
}: ClipboardDetailDialogProps) {
  const { t } = useTranslation();
  const maskSensitivePreviews = useConfigStore(
    (state) => state.config.mask_sensitive_previews
  );
  const {
    copyItem,
    pasteItem,
    copyItemPlainText,
    pasteItemPlainText,
    updateAnnotations,
  } = useClipboardStore();
  const [editingAnnotations, setEditingAnnotations] = useState(false);
  const [customTitleDraft, setCustomTitleDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [savingAnnotations, setSavingAnnotations] = useState(false);
  const shouldMaskPreview = Boolean(
    item?.is_sensitive && maskSensitivePreviews
  );
  const { actions: contentActions, executeAction: executeContentAction } =
    useClipboardContentActions(
      item?.id ?? 0,
      Boolean(item) && !shouldMaskPreview
    );

  useEffect(() => {
    if (!editingAnnotations) {
      setCustomTitleDraft(item?.custom_title ?? '');
      setNoteDraft(item?.note ?? '');
    }
  }, [editingAnnotations, item?.custom_title, item?.id, item?.note]);

  useEffect(() => {
    if (!open) setEditingAnnotations(false);
  }, [open]);

  if (!item) return null;

  const handleSaveAnnotations = async () => {
    setSavingAnnotations(true);
    const updated = await updateAnnotations(item.id, {
      customTitle: customTitleDraft,
      note: noteDraft,
    });
    setSavingAnnotations(false);
    if (updated) setEditingAnnotations(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(36rem,calc(100vh-1rem))] max-h-[calc(100vh-1rem)] w-[44rem] max-w-[calc(100vw-1rem)] grid-rows-none flex-col gap-0 overflow-hidden rounded-lg p-0 sm:max-w-[44rem]"
        closeLabel={t('common.close')}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3 pr-10">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm">
                {shouldMaskPreview
                  ? t('clipboard.detail.title')
                  : item.custom_title || t('clipboard.detail.title')}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t('clipboard.detail.description')}
              </DialogDescription>
              {!shouldMaskPreview && item.note && !editingAnnotations && (
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={item.note}>
                  {item.note}
                </p>
              )}
            </div>
            <DetailActions
              item={item}
              onCopy={() => void copyItem(item.id)}
              onPaste={() => void pasteItem(item.id)}
              onCopyPlainText={() => void copyItemPlainText(item.id)}
              onPastePlainText={() => void pasteItemPlainText(item.id)}
              canEditAnnotations={!shouldMaskPreview}
              onEditAnnotations={() => setEditingAnnotations((current) => !current)}
            />
          </div>
        </DialogHeader>

        {editingAnnotations && !shouldMaskPreview && (
          <AnnotationEditor
            customTitle={customTitleDraft}
            note={noteDraft}
            saving={savingAnnotations}
            onCustomTitleChange={setCustomTitleDraft}
            onNoteChange={setNoteDraft}
            onCancel={() => setEditingAnnotations(false)}
            onSave={() => void handleSaveAnnotations()}
          />
        )}

        <div className="min-h-44 flex-1 overflow-hidden">
          {shouldMaskPreview ? (
            <MaskedDetail />
          ) : (
            <DetailContent
              item={item}
              actions={contentActions}
              onAction={(action) =>
                void executeContentAction(action).catch(() => undefined)
              }
            />
          )}
        </div>

        <DetailFacts item={item} />
      </DialogContent>
    </Dialog>
  );
}

function DetailActions({
  item,
  onCopy,
  onPaste,
  onCopyPlainText,
  onPastePlainText,
  canEditAnnotations,
  onEditAnnotations,
}: {
  item: ClipboardItem;
  onCopy: () => void;
  onPaste: () => void;
  onCopyPlainText: () => void;
  onPastePlainText: () => void;
  canEditAnnotations: boolean;
  onEditAnnotations: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-0.5" aria-label={t('clipboard.detail.actions')}>
      <ActionButton label={t('clipboard.copy')} onClick={onCopy} icon={Copy} />
      <ActionButton
        label={t('clipboard.paste')}
        onClick={onPaste}
        icon={ClipboardPaste}
      />
      {item.content_type === 'text' && (
        <>
          <ActionButton
            label={t('clipboard.copyPlainText')}
            onClick={onCopyPlainText}
            icon={ClipboardCopy}
          />
          <ActionButton
            label={t('clipboard.pastePlainText')}
            onClick={onPastePlainText}
            icon={ClipboardPaste}
          />
        </>
      )}
      {canEditAnnotations && (
        <ActionButton
          label={t('clipboard.detail.editAnnotations')}
          onClick={onEditAnnotations}
          icon={SquarePen}
        />
      )}
    </div>
  );
}

function AnnotationEditor({
  customTitle,
  note,
  saving,
  onCustomTitleChange,
  onNoteChange,
  onCancel,
  onSave,
}: {
  customTitle: string;
  note: string;
  saving: boolean;
  onCustomTitleChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const titleLength = countCharacters(customTitle);
  const noteLength = countCharacters(note);
  const hasLengthError =
    titleLength > MAX_CLIPBOARD_TITLE_LENGTH ||
    noteLength > MAX_CLIPBOARD_NOTE_LENGTH;

  return (
    <div className="shrink-0 border-b border-border/60 px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] sm:items-end">
        <div className="grid min-w-0 gap-1 text-[10px] text-muted-foreground">
          <span className="flex items-center justify-between gap-2">
            <label htmlFor="clipboard-custom-title">
              {t('clipboard.detail.customTitle')}
            </label>
            <span className="font-mono">{titleLength}/{MAX_CLIPBOARD_TITLE_LENGTH}</span>
          </span>
          <Input
            id="clipboard-custom-title"
            value={customTitle}
            aria-invalid={titleLength > MAX_CLIPBOARD_TITLE_LENGTH}
            onChange={(event) => onCustomTitleChange(event.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="grid min-w-0 gap-1 text-[10px] text-muted-foreground">
          <span className="flex items-center justify-between gap-2">
            <label htmlFor="clipboard-note">{t('clipboard.detail.note')}</label>
            <span className="font-mono">{noteLength}/{MAX_CLIPBOARD_NOTE_LENGTH}</span>
          </span>
          <textarea
            id="clipboard-note"
            value={note}
            aria-invalid={noteLength > MAX_CLIPBOARD_NOTE_LENGTH}
            onChange={(event) => onNoteChange(event.target.value)}
            className="h-16 min-h-16 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-xs text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-8 sm:min-h-8 sm:resize-y"
          />
        </div>
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={saving || hasLengthError} onClick={onSave}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function countCharacters(value: string): number {
  return Array.from(value).length;
}

function ActionButton({
  label,
  onClick,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Copy;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon className="size-3.5" />
    </Button>
  );
}

function MaskedDetail() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-44 flex-col items-center justify-center gap-2 px-6 py-10 text-center text-muted-foreground">
      <ShieldAlert className="size-5" aria-hidden="true" />
      <p className="text-xs font-medium">{t('clipboard.sensitiveHidden')}</p>
    </div>
  );
}

function DetailContent({
  item,
  actions,
  onAction,
}: {
  item: ClipboardItem;
  actions: ClipboardContentAction[];
  onAction: (action: ClipboardContentAction) => void;
}) {
  if (item.content_type === 'file') {
    return <FileDetail item={item} actions={actions} onAction={onAction} />;
  }

  let content: React.ReactNode;
  switch (item.content_type) {
    case 'text':
      content = <TextDetail item={item} />;
      break;
    case 'image':
      content = <ImageDetail item={item} />;
      break;
    default:
      content = null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
      <ContentActionBar actions={actions} onAction={onAction} />
    </div>
  );
}

function ContentActionBar({
  actions,
  onAction,
}: {
  actions: ClipboardContentAction[];
  onAction: (action: ClipboardContentAction) => void;
}) {
  const { t } = useTranslation();
  if (actions.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-border/50 px-3 py-2">
      {actions.map((action) => {
        const presentation = contentActionPresentation(action, t);
        const Icon = presentation.icon;
        return (
          <Button
            key={`${action.kind}-${action.target}`}
            variant="ghost"
            size="sm"
            aria-label={presentation.label}
            title={presentation.label}
            onClick={() => onAction(action)}
          >
            <Icon className="size-3.5" />
            {presentation.label}
          </Button>
        );
      })}
    </div>
  );
}

function TextDetail({ item }: { item: ClipboardItem }) {
  const { t } = useTranslation();
  const html = item.formats.find((format) => format.format === 'html')?.content;
  const sanitizedHtml = html ? sanitizeRichTextHtml(html) : '';

  if (!sanitizedHtml.trim()) {
    return <PlainTextContent content={item.content} />;
  }

  return (
    <Tabs defaultValue="plain" className="h-full min-h-0 gap-0">
      <div className="shrink-0 border-b border-border/50 px-4 py-2">
        <TabsList aria-label={t('clipboard.detail.viewMode')}>
          <TabsTrigger value="plain">{t('clipboard.detail.plainText')}</TabsTrigger>
          <TabsTrigger value="rich">{t('clipboard.detail.richText')}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="plain" className="min-h-0 overflow-auto p-4">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
          {item.content}
        </pre>
      </TabsContent>
      <TabsContent value="rich" className="min-h-0 overflow-auto p-4">
        <div
          data-testid="detail-rich-text"
          className="break-words text-sm leading-relaxed text-foreground [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_code]:font-mono [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_pre]:font-mono [&_table]:max-w-full [&_td]:border [&_td]:border-border [&_td]:p-1 [&_th]:border [&_th]:border-border [&_th]:p-1"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      </TabsContent>
    </Tabs>
  );
}

function PlainTextContent({ content }: { content: string }) {
  return (
    <div className="h-full overflow-auto p-4">
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
        {content}
      </pre>
    </div>
  );
}

const MIN_IMAGE_SCALE = 0.5;
const MAX_IMAGE_SCALE = 4;
const IMAGE_SCALE_STEP = 0.25;

function ImageDetail({ item }: { item: ClipboardItem }) {
  const { t } = useTranslation();
  const metadata = parseImageMetadata(item);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    dragRef.current = null;
  }, [item.id]);

  const changeScale = (delta: number) => {
    setScale((current) => {
      const next = Math.min(
        MAX_IMAGE_SCALE,
        Math.max(MIN_IMAGE_SCALE, current + delta)
      );
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const downloadImage = async () => {
    try {
      const response = await fetch(item.content);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `clipboard-image.${metadata?.format || 'png'}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      // The clipboard content remains available even if the browser download fails.
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scale <= 1) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(12rem,1fr)_auto]">
      <div
        data-testid="detail-image-viewport"
        className={cn(
          'relative min-h-0 touch-none overflow-hidden bg-muted/30',
          scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute left-3 top-3 z-10 flex items-center gap-0.5 rounded-full border border-border/60 bg-background/90 p-0.5 shadow-[var(--shadow-ring)] backdrop-blur-sm">
          <ActionButton
            label={t('clipboard.detail.zoomOut')}
            onClick={() => changeScale(-IMAGE_SCALE_STEP)}
            icon={ZoomOut}
          />
          <span className="w-10 text-center font-mono text-[10px] text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <ActionButton
            label={t('clipboard.detail.zoomIn')}
            onClick={() => changeScale(IMAGE_SCALE_STEP)}
            icon={ZoomIn}
          />
          <ActionButton
            label={t('clipboard.detail.resetZoom')}
            onClick={reset}
            icon={RotateCcw}
          />
          <ActionButton
            label={t('clipboard.detail.downloadImage')}
            onClick={() => void downloadImage()}
            icon={Download}
          />
        </div>
        <img
          src={item.content}
          alt={t('clipboard.detail.imageAlt')}
          draggable={false}
          className="h-full w-full select-none object-contain p-3"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center',
          }}
        />
        {metadata && <ImageFormatBadge metadata={metadata} />}
      </div>
      {item.ocr && (
        <div className="max-h-32 overflow-auto border-t border-border/50 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <ScanText className="size-3" aria-hidden="true" />
            {t('clipboard.detail.ocrText')}
          </div>
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
            {getOcrText(item, t)}
          </p>
        </div>
      )}
    </div>
  );
}

function ImageFormatBadge({ metadata }: { metadata: ImageMetadata }) {
  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full border border-border/60 bg-background/90 px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-[var(--shadow-ring)] backdrop-blur-sm">
      <span>{metadata.width} x {metadata.height}</span>
      <span className="uppercase">{metadata.format}</span>
    </div>
  );
}

function getOcrText(
  item: ClipboardItem,
  t: (key: string) => string
): string {
  const ocr = item.ocr;
  if (!ocr) return '';
  if (ocr.status === 'pending') return t('clipboard.ocr.pending');
  if (ocr.status === 'failed') {
    return ocr.error || t('clipboard.ocr.failed');
  }
  return ocr.text.trim() || t('clipboard.ocr.empty');
}

interface FileDetailEntry {
  path: string;
  summary: FileItemSummary | null;
}

function FileDetail({
  item,
  actions,
  onAction,
}: {
  item: ClipboardItem;
  actions: ClipboardContentAction[];
  onAction: (action: ClipboardContentAction) => void;
}) {
  const { t } = useTranslation();
  const metadata = parseFileMetadata(item);
  const entries = useMemo(
    () => buildFileEntries(item.content, metadata),
    [item.content, metadata]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {metadata && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 px-4 py-2 text-[10px] text-muted-foreground">
          <span>{t('clipboard.fileCount', { count: metadata.file_count })}</span>
          <span>{t('clipboard.folderCount', { count: metadata.dir_count ?? 0 })}</span>
          <span>{formatSize(metadata.total_size)}</span>
        </div>
      )}
      <div className="min-h-0 overflow-y-auto overflow-x-hidden">
        {entries.map((entry, index) => {
          const isDirectory = entry.summary?.is_dir ?? false;
          const Icon = isDirectory ? Folder : File;
          const entryActions = actions.filter(
            (action) => action.target === entry.path
          );
          return (
            <div
              key={`${entry.path}-${index}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 border-b border-border/40 px-4 py-3 last:border-b-0"
            >
              <Icon className="mt-0.5 size-3.5 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex min-w-0 items-baseline gap-2">
                  <p className="truncate text-xs font-medium text-foreground">
                    {entry.summary?.name || fileNameFromPath(entry.path)}
                  </p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {isDirectory ? t('clipboard.folder') : t('clipboard.file')}
                  </span>
                </div>
                <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {entry.path}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {entry.summary && !entry.summary.is_dir && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {formatSize(entry.summary.size)}
                  </span>
                )}
                {entryActions.length > 0 && (
                  <div className="flex items-center gap-0.5">
                    {entryActions.map((action) => {
                      const presentation = contentActionPresentation(action, t);
                      return (
                        <ActionButton
                          key={action.kind}
                          label={presentation.label}
                          onClick={() => onAction(action)}
                          icon={presentation.icon}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildFileEntries(
  content: string,
  metadata: FileMetadata | null
): FileDetailEntry[] {
  let paths: string[] = [];
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed)) {
      paths = parsed.filter((value): value is string => typeof value === 'string');
    }
  } catch {
    if (content.trim()) paths = [content];
  }

  if (paths.length === 0 && content.trim()) paths = [content];
  return paths.map((path, index) => ({
    path,
    summary: metadata?.items?.[index] ?? null,
  }));
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function DetailFacts({ item }: { item: ClipboardItem }) {
  const { t, i18n } = useTranslation();
  const createdAt = new Date(item.created_at).toLocaleString(i18n.language);

  return (
    <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 bg-muted/25 px-4 py-3 text-[10px] sm:grid-cols-4">
      <Fact
        icon={AppWindow}
        label={t('clipboard.detail.source')}
        value={item.source_application || t('clipboard.detail.unknown')}
        detail={item.source_window_title}
      />
      <Fact
        icon={CalendarClock}
        label={t('clipboard.detail.capturedAt')}
        value={createdAt}
      />
      <Fact
        icon={HardDrive}
        label={t('clipboard.detail.size')}
        value={formatSize(item.size)}
      />
      <Fact
        icon={Tags}
        label={t('clipboard.detail.tags')}
        value={
          item.tags.length > 0
            ? item.tags.map((tag) => tag.name).join(t('clipboard.summarySeparator'))
            : t('clipboard.detail.none')
        }
      />
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof AppWindow;
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-1.5">
      <Icon className="mt-0.5 size-3 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-muted-foreground">{label}</p>
        <p className="truncate text-foreground" title={value}>{value}</p>
        {detail && (
          <p className="truncate text-muted-foreground" title={detail}>{detail}</p>
        )}
      </div>
    </div>
  );
}
