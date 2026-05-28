/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptureStatusBar } from './CaptureStatusBar';

describe('CaptureStatusBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when clipboard capture is normal', () => {
    const { container } = render(
      <CaptureStatusBar
        monitorEnabled
        privacyModeUntil={0}
        now={1_000}
        onResumeMonitoring={vi.fn()}
        onEndPrivacyMode={vi.fn()}
      />
    );

    expect(container.textContent).toBe('');
  });

  it('shows paused monitoring and resumes capture', () => {
    const onResumeMonitoring = vi.fn();
    render(
      <CaptureStatusBar
        monitorEnabled={false}
        privacyModeUntil={0}
        now={1_000}
        onResumeMonitoring={onResumeMonitoring}
        onEndPrivacyMode={vi.fn()}
      />
    );

    expect(screen.getByText('监听已暂停')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '恢复' }));

    expect(onResumeMonitoring).toHaveBeenCalledTimes(1);
  });

  it('shows active privacy mode and ends it', () => {
    const onEndPrivacyMode = vi.fn();
    render(
      <CaptureStatusBar
        monitorEnabled
        privacyModeUntil={61_000}
        now={1_000}
        onResumeMonitoring={vi.fn()}
        onEndPrivacyMode={onEndPrivacyMode}
      />
    );

    expect(screen.getByText('隐私模式剩余 1 分钟')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '结束' }));

    expect(onEndPrivacyMode).toHaveBeenCalledTimes(1);
  });
});
