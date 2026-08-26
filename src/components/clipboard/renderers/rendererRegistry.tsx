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

/**
 * Content-type identity comes from the semantic `--content-*` tokens, which each
 * theme family redefines per mode. `folder` shares the file token: §7.2 freezes the
 * vocabulary at text/image/file, and a folder is a filesystem entry.
 */
export const CLIP_TONES: Record<ClipKind, ClipTone> = {
  text: {
    iconBg: 'bg-content-text/10',
    iconText: 'text-content-text',
    dot: 'bg-content-text/70',
  },
  image: {
    iconBg: 'bg-content-image/10',
    iconText: 'text-content-image',
    dot: 'bg-content-image/70',
  },
  file: {
    iconBg: 'bg-content-file/10',
    iconText: 'text-content-file',
    dot: 'bg-content-file/70',
  },
  folder: {
    iconBg: 'bg-content-file/10',
    iconText: 'text-content-file',
    dot: 'bg-content-file/70',
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
