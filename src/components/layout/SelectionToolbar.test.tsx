/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionToolbar } from './SelectionToolbar';

describe('SelectionToolbar', () => {
  afterEach(cleanup);

  it('renders selection actions as a quiet inline utility row', () => {
    const { container } = render(
      <SelectionToolbar
        selectedCount={0}
        tags={[{ id: 1, name: 'Work', color: '#2563eb', created_at: 0 }]}
        onFavoriteSelected={vi.fn()}
        onAssignTagToSelected={vi.fn()}
        onDeleteSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );
    const root = container.firstElementChild as HTMLElement;

    expect(screen.getByText('选择要批量处理的条目')).toBeTruthy();
    expect(root.className).not.toContain('bg-muted/25');
    expect(root.className).not.toContain('border-t');
    expect(screen.getByRole('button', { name: '收藏已选' }).className).toContain(
      'size-5'
    );
    expect(screen.getByRole('button', { name: '删除已选' }).className).toContain(
      'size-5'
    );
    expect(screen.getByRole('button', { name: '清除选择' }).className).toContain(
      'size-5'
    );
  });

  it('keeps tag assignment compact while preserving accessible names', () => {
    render(
      <SelectionToolbar
        selectedCount={2}
        tags={[{ id: 1, name: 'Work', color: '#2563eb', created_at: 0 }]}
        onFavoriteSelected={vi.fn()}
        onAssignTagToSelected={vi.fn()}
        onDeleteSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    const assignButton = screen.getByRole('button', { name: '分配 Work' });

    expect(screen.getByText('已选择 2 项')).toBeTruthy();
    expect(assignButton.className).toContain('h-5');
    expect(assignButton.className).toContain('max-w-16');
  });
});
