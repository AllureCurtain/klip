import {
  File,
  FileText,
  Files,
  Folder,
  Image,
  type LucideIcon,
} from 'lucide-react';
import type { ClipboardItem, ImageMetadata } from '@/types';
import { cn } from '@/lib/utils';
import type { ClipKind, FileShape } from './clipboardContentModel';
import { TextClipboardRenderer } from './TextClipboardRenderer';
import { ImageClipboardRenderer } from './ImageClipboardRenderer';
import { FileClipboardRenderer } from './FileClipboardRenderer';

export type ClipTone = {
  border: string;
  selected: string;
  iconBg: string;
  iconText: string;
  dot: string;
};

export type RendererProps = {
  item: ClipboardItem;
  shouldMaskPreview: boolean;
  fileShape: FileShape | null;
  imageMeta: ImageMetadata | null;
  onImageClick: (event: React.MouseEvent) => void;
};

export const CLIP_TONES: Record<ClipKind, ClipTone> = {
  text: {
    border: 'border-l-indigo-400/70',
    selected: 'bg-indigo-500/8',
    iconBg: 'bg-indigo-500/10',
    iconText: 'text-indigo-500 dark:text-indigo-400',
    dot: 'bg-indigo-400',
  },
  image: {
    border: 'border-l-emerald-400/70',
    selected: 'bg-emerald-500/8',
    iconBg: 'bg-emerald-500/10',
    iconText: 'text-emerald-500 dark:text-emerald-400',
    dot: 'bg-emerald-400',
  },
  file: {
    border: 'border-l-sky-400/70',
    selected: 'bg-sky-500/8',
    iconBg: 'bg-sky-500/10',
    iconText: 'text-sky-500 dark:text-sky-400',
    dot: 'bg-sky-400',
  },
  folder: {
    border: 'border-l-amber-400/70',
    selected: 'bg-amber-500/8',
    iconBg: 'bg-amber-500/10',
    iconText: 'text-amber-500 dark:text-amber-400',
    dot: 'bg-amber-400',
  },
};

export const RENDERER_REGISTRY = {
  text: TextClipboardRenderer,
  image: ImageClipboardRenderer,
  file: FileClipboardRenderer,
} satisfies Record<ClipboardItem['content_type'], React.ComponentType<RendererProps>>;

export function ClipboardTypeIcon({
  clipKind,
  fileShape,
  tone,
}: {
  clipKind: ClipKind;
  fileShape: FileShape | null;
  tone: ClipTone;
}) {
  const className = cn('h-3.5 w-3.5 shrink-0', tone.iconText);
  const Icon = getIcon(clipKind, fileShape);
  return <Icon className={className} />;
}

function getIcon(clipKind: ClipKind, fileShape: FileShape | null): LucideIcon {
  switch (clipKind) {
    case 'text':
      return FileText;
    case 'image':
      return Image;
    case 'folder':
      return Folder;
    case 'file':
      if (!fileShape) return File;
      switch (fileShape.kind) {
        case 'single-file':
        case 'multi':
          return Files;
        case 'unknown':
          return File;
        case 'single-folder':
          return Folder;
      }
  }
}
