// Boxes and labels read from the page, in page coordinates: `top` and `bottom` include the scroll offset.
import type { Rect } from '../plates/index.ts';

export function pageRect(el: Element, sy: number): Rect {
  const r = el.getBoundingClientRect();
  const top = r.top + sy;
  return {
    left: r.left,
    right: r.right,
    top,
    bottom: top + r.height,
    w: r.width,
    h: r.height,
    cx: r.left + r.width / 2,
    cy: top + r.height / 2,
  };
}

export function contentRect(el: Element, sy: number): Rect {
  const r = pageRect(el, sy);
  const cs = getComputedStyle(el);
  r.left += parseFloat(cs.paddingLeft) || 0;
  r.right -= parseFloat(cs.paddingRight) || 0;
  r.w = r.right - r.left;
  r.cx = (r.left + r.right) / 2;
  return r;
}

/** A section's number and name, from its eyebrow ("01 / VIDEO") or its data-hud attribute. */
export function sectionLabel(sec: HTMLElement | null | undefined): [string, string] {
  const text = sec?.dataset.hud ?? sec?.querySelector('[data-eyebrow]')?.textContent ?? '';
  const [num = '', name = ''] = text.split(' / ');
  return [num.trim(), name.trim()];
}
