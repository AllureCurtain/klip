import type {
  ClipboardItem,
  FileMetadata,
  ImageMetadata,
} from '@/types';

export type FileShape =
  | { kind: 'single-file'; name: string; size: number }
  | { kind: 'single-folder'; name: string }
  | {
      kind: 'multi';
      fileCount: number;
      dirCount: number;
      totalSize: number;
      sampleNames: string[];
    }
  | { kind: 'unknown'; preview: string };

export type ClipKind = 'text' | 'image' | 'file' | 'folder';

export function parseFileMetadata(item: ClipboardItem): FileMetadata | null {
  if (item.content_type !== 'file' || !item.metadata) return null;
  try {
    return JSON.parse(item.metadata) as FileMetadata;
  } catch {
    return null;
  }
}

export function parseImageMetadata(item: ClipboardItem): ImageMetadata | null {
  if (item.content_type !== 'image' || !item.metadata) return null;
  try {
    return JSON.parse(item.metadata) as ImageMetadata;
  } catch {
    return null;
  }
}

export function classifyFile(item: ClipboardItem): FileShape {
  const meta = parseFileMetadata(item);
  if (!meta) {
    return { kind: 'unknown', preview: item.preview ?? '' };
  }

  const fileCount = meta.file_count ?? 0;
  const dirCount = meta.dir_count ?? 0;
  const total = fileCount + dirCount;
  const items = meta.items ?? [];

  if (total === 1 && items.length >= 1) {
    const only = items[0];
    return only.is_dir
      ? { kind: 'single-folder', name: only.name }
      : { kind: 'single-file', name: only.name, size: only.size };
  }

  return {
    kind: 'multi',
    fileCount,
    dirCount,
    totalSize: meta.total_size ?? 0,
    sampleNames: items.slice(0, 3).map((it) => (it.is_dir ? `${it.name}/` : it.name)),
  };
}

export function getClipKind(item: ClipboardItem, fileShape: FileShape | null): ClipKind {
  if (item.content_type === 'text') return 'text';
  if (item.content_type === 'image') return 'image';
  if (fileShape?.kind === 'single-folder') return 'folder';
  if (
    fileShape?.kind === 'multi' &&
    fileShape.dirCount > 0 &&
    fileShape.fileCount === 0
  ) {
    return 'folder';
  }
  return 'file';
}
