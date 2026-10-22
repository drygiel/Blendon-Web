import type { CSSProperties } from 'react';
import { spriteBackground, spriteMask } from '../../lib/sprite-sheet.ts';
import { D } from '../../plugin/window-data.ts';

const HIDDEN: CSSProperties = { display: 'none' };

// Mouse glyphs show only the texture's left ContentWidth (0.6875): 9pt of a 13.09pt-wide image.
const MouseDrawn = { width: 13.09, height: 13 };

/**
 * An icon element's style. Monochrome icons are masked and filled with the tint (GUI.color
 * multiply); `gray` instead shows the texture desaturated at that brightness.
 */
export function iconStyle(name: string, size: number, tint?: string | null, gray?: number): CSSProperties {
  const icon = D.icons[name];
  if (!icon) return HIDDEN;
  const s: CSSProperties = { width: size, height: size, ...spriteBackground(icon) };
  if (gray) return { ...s, filter: `grayscale(1) brightness(${gray})` };
  if (!tint) return s;
  return { ...s, backgroundColor: tint, backgroundBlendMode: 'multiply', ...spriteMask(icon) };
}

export function mouseStyle(name: string, tint = '#D9D9D9'): CSSProperties {
  const icon = D.icons[name];
  if (!icon) return HIDDEN;
  return {
    width: 9,
    height: 13,
    ...spriteBackground(icon, MouseDrawn),
    backgroundColor: tint,
    backgroundBlendMode: 'multiply',
    ...spriteMask(icon, MouseDrawn),
  };
}
