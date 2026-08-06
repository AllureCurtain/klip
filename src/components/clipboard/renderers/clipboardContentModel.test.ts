import { describe, expect, it } from 'vitest';
import type { ClipboardItem } from '@/types';
import {
  classifyFile,
  getClipKind,
  parseFileMetadata,
  parseImageMetadata,
} from './clipboardContentModel';

function makeItem(overrides: Partial<ClipboardItem>): ClipboardItem {
  return {
    id: 1,
    content_type: 'text',
    content: 'hello',
    preview: 'hello',
    hash: 'hash',
    size: 5,
    metadata: null,
    source_application: null,
    source_window_title: null,
    is_favorited: false,
    is_sensitive: false,
    sensitivity_reason: null,
    formats: [],
    ocr: null,
    tags: [],
    created_at: 1,
    last_used_at: 1,
    ...overrides,
  };
}

describe('clipboardContentModel', () => {
  it('parses image metadata safely', () => {
    expect(
      parseImageMetadata(
        makeItem({
          content_type: 'image',
          metadata: JSON.stringify({ width: 24, height: 32, format: 'png' }),
        })
      )
    ).toEqual({ width: 24, height: 32, format: 'png' });

    expect(parseImageMetadata(makeItem({ content_type: 'image', metadata: '{' }))).toBeNull();
  });

  it('classifies file, folder, and multi-file metadata', () => {
    const singleFile = makeItem({
      content_type: 'file',
      metadata: JSON.stringify({
        file_count: 1,
        dir_count: 0,
        total_size: 2048,
        items: [{ name: 'report.pdf', is_dir: false, size: 2048 }],
      }),
    });
    const singleFolder = makeItem({
      content_type: 'file',
      metadata: JSON.stringify({
        file_count: 0,
        dir_count: 1,
        total_size: 0,
        items: [{ name: 'Project', is_dir: true, size: 0 }],
      }),
    });
    const multi = makeItem({
      content_type: 'file',
      metadata: JSON.stringify({
        file_count: 2,
        dir_count: 1,
        total_size: 4096,
        items: [
          { name: 'a.txt', is_dir: false, size: 1024 },
          { name: 'Folder', is_dir: true, size: 0 },
        ],
      }),
    });

    expect(classifyFile(singleFile)).toEqual({
      kind: 'single-file',
      name: 'report.pdf',
      size: 2048,
    });
    expect(classifyFile(singleFolder)).toEqual({
      kind: 'single-folder',
      name: 'Project',
    });
    expect(classifyFile(multi)).toMatchObject({
      kind: 'multi',
      fileCount: 2,
      dirCount: 1,
      sampleNames: ['a.txt', 'Folder/'],
    });
  });

  it('maps folders to folder kind and image/text to their direct kinds', () => {
    const folderShape = classifyFile(
      makeItem({
        content_type: 'file',
        metadata: JSON.stringify({
          file_count: 0,
          dir_count: 1,
          total_size: 0,
          items: [{ name: 'Project', is_dir: true, size: 0 }],
        }),
      })
    );

    expect(parseFileMetadata(makeItem({ content_type: 'text' }))).toBeNull();
    expect(getClipKind(makeItem({ content_type: 'text' }), null)).toBe('text');
    expect(getClipKind(makeItem({ content_type: 'image' }), null)).toBe('image');
    expect(getClipKind(makeItem({ content_type: 'file' }), folderShape)).toBe('folder');
  });
});
