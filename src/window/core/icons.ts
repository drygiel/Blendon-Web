import type { CSSProperties } from 'react';
import { D } from '../data/store.ts';

const HIDDEN: CSSProperties = { display: 'none' };

/** Every icon as a custom property on the window root, so items reference them by var(). */
export function iconVars(): CSSProperties {
  const vars: Record<string, string> = {};
  for (const ic of Object.values(D.icons)) vars['--' + ic.v] = `url("${ic.u}")`;
  return vars;
}

/**
 * An icon element's style. Monochrome icons are masked and filled with the tint (GUI.color
 * multiply); `gray` instead shows the texture desaturated at that brightness.
 */
export function iconStyle(name: string, size: number, tint?: string | null, gray?: number): CSSProperties {
  const ic = D.icons[name];
  if (!ic) return HIDDEN;
  const url = `var(--${ic.v})`;
  const s: CSSProperties = { width: size, height: size, backgroundImage: url, backgroundSize: '100% 100%' };
  if (gray) return { ...s, filter: `grayscale(1) brightness(${gray})` };
  if (!tint) return s;
  return {
    ...s,
    backgroundColor: tint,
    backgroundBlendMode: 'multiply',
    WebkitMaskImage: url,
    maskImage: url,
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
  };
}

/** Mouse glyphs show only the texture's left ContentWidth (0.6875): 9pt of a 13.09pt-wide image. */
export function mouseStyle(name: string, tint = '#D9D9D9'): CSSProperties {
  const ic = D.icons[name];
  if (!ic) return HIDDEN;
  const url = `var(--${ic.v})`;
  return {
    width: 9,
    height: 13,
    backgroundImage: url,
    backgroundSize: '13.09px 13px',
    backgroundRepeat: 'no-repeat',
    backgroundColor: tint,
    backgroundBlendMode: 'multiply',
    WebkitMaskImage: url,
    maskImage: url,
    WebkitMaskSize: '13.09px 13px',
    maskSize: '13.09px 13px',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
  };
}
