/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ImagePreview } from './ImagePreview';

describe('ImagePreview', () => {
  afterEach(() => {
    cleanup();
  });

  it('labels the download action for assistive technology', () => {
    render(
      <ImagePreview
        src="data:image/png;base64,iVBORw0KGgo="
        alt=""
        metadata={{ width: 24, height: 24, format: 'png' }}
        open
        onOpenChange={() => undefined}
      />
    );

    expect(
      screen.getByRole('button', { name: '下载图片' }).getAttribute('aria-label')
    ).toBe('下载图片');
  });
});
