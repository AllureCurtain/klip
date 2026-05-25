/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the no-history state as a centered glass card', () => {
    const { container } = render(<EmptyState />);
    const root = container.firstElementChild as HTMLElement;

    expect(screen.getByText('暂无剪贴板历史')).toBeTruthy();
    expect(screen.getByText('复制内容后将自动出现在这里')).toBeTruthy();
    expect(screen.queryByText('Ctrl+Alt+K')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(root.className).toContain('items-center');
    expect(root.className).toContain('justify-center');
  });

  it('renders the favorites empty state without promotional chrome', () => {
    const { container } = render(<EmptyState showFavorites />);
    const root = container.firstElementChild as HTMLElement;

    expect(screen.getByText('暂无收藏')).toBeTruthy();
    expect(screen.getByText('点击条目的星标将其添加到收藏')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
    expect(root.className).toContain('items-center');
    expect(root.className).toContain('justify-center');
  });
});
