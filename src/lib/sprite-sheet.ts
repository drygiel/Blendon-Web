// The site's small pictures, all drawn from one sheet that scripts/icon-sprite.ts packs at build time. A picture is
// named by its source path from the project root, e.g. "public/scene/icons/d_MoveTool.png".
import type { CSSProperties } from 'react';
import sheet from 'virtual:icon-sprite';

/** The size the whole picture is drawn at, where the element shows only part of it. */
export interface DrawnSize {
  width: number;
  height: number;
}

const IMAGE = `url("${sheet.url}")`;
const HIDDEN: CSSProperties = { display: 'none' };
const warned = new Set<string>();

/** CSS size and position that lay the picture over the element's box, or over `drawn` from its corner. */
function place(name: string, drawn?: DrawnSize) {
  const part = sheet.parts[name];
  if (!part) {
    if (import.meta.env.DEV && !warned.has(name)) {
      warned.add(name);
      console.warn('Not on the icon sprite:', name);
    }
    return null;
  }
  const [x, y, w, h] = part;
  if (drawn) {
    const sx = drawn.width / w;
    const sy = drawn.height / h;
    return { size: `${sheet.width * sx}px ${sheet.height * sy}px`, position: `${-x * sx}px ${-y * sy}px` };
  }
  // A position of p% puts the sheet's p% point on the box's p% point, which works out at any box size.
  const pct = (at: number, span: number, whole: number) => (whole === span ? '0%' : `${(at / (whole - span)) * 100}%`);
  return {
    size: `${(sheet.width / w) * 100}% ${(sheet.height / h) * 100}%`,
    position: `${pct(x, w, sheet.width)} ${pct(y, h, sheet.height)}`,
  };
}

/** Background that shows the picture filling the element (hidden for a picture the sheet doesn't hold). */
export function spriteBackground(name: string, drawn?: DrawnSize): CSSProperties {
  const p = place(name, drawn);
  if (!p) return HIDDEN;
  return {
    backgroundImage: IMAGE,
    backgroundSize: p.size,
    backgroundPosition: p.position,
    backgroundRepeat: 'no-repeat',
  };
}

/** Mask that cuts the element to the picture's alpha, so the element's background tints it. */
export function spriteMask(name: string, drawn?: DrawnSize): CSSProperties {
  const p = place(name, drawn);
  if (!p) return HIDDEN;
  return {
    maskImage: IMAGE,
    WebkitMaskImage: IMAGE,
    maskSize: p.size,
    WebkitMaskSize: p.size,
    maskPosition: p.position,
    WebkitMaskPosition: p.position,
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
  };
}

let image: Promise<HTMLImageElement> | null = null;
const bitmaps = new Map<string, ImageBitmap | null>();

/** The picture cut out for a canvas, or null until it is ready; `onReady` runs once it is. */
export function spriteBitmap(name: string, onReady: () => void): ImageBitmap | null {
  const known = bitmaps.get(name);
  if (known !== undefined) return known;
  bitmaps.set(name, null);
  const part = sheet.parts[name];
  if (!part || typeof Image === 'undefined') return null;
  image ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = sheet.url;
  });
  // A sheet that fails to load leaves the picture out.
  image
    .then((img) => createImageBitmap(img, ...part))
    .then((bitmap) => {
      bitmaps.set(name, bitmap);
      onReady();
    })
    .catch(() => {});
  return null;
}
