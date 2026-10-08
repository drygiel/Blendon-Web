import type { CSSProperties } from 'react';
import wordmarkWidths from '../assets/landing/wordmark.png?w=150;300;450;602&format=webp&as=meta:src;width';

/** One width of an image, as vite-imagetools' `as=meta:src;width` lists it. */
export interface ImageWidth {
  src: string;
  width: number;
}

/** An `<img>`'s src and srcSet from its widths. The src is the widest, for anything that skips srcset. */
export function responsive(widths: ImageWidth[]) {
  const sorted = [...widths].sort((a, b) => a.width - b.width);
  return {
    src: sorted[sorted.length - 1]?.src ?? '',
    srcSet: sorted.map((w) => `${w.src} ${w.width}w`).join(', '),
    /** The narrowest width that still covers `px` image pixels. */
    fit: (px: number) => (sorted.find((w) => w.width >= px) ?? sorted[sorted.length - 1])?.src ?? '',
  };
}

/** The Blendon wordmark, 602 x 120 at full size. */
export const WORDMARK = responsive(wordmarkWidths);

/**
 * Hands the `logo-shine` mixin its mask for a wordmark `cssWidth` wide.
 * Each density gets the width the `<img>` srcset picks there, so the mask comes from cache.
 */
export function wordmarkMask(cssWidth: number): CSSProperties {
  const set = [1, 2, 3].map((x) => `url(${WORDMARK.fit(cssWidth * x)}) ${x}x`).join(', ');
  return { '--logo-mask': `image-set(${set})` } as CSSProperties;
}
