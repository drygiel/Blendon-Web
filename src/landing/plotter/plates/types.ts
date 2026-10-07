import type { Ink } from '../draw.ts';
import type { plotStore } from '../store.ts';

/** A box in page coordinates: `top` and `bottom` include the scroll offset. */
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface PlateCtx {
  ink: Ink;
  ctx: CanvasRenderingContext2D;
  /** Scroll offset; subtract it from page y to get screen y. */
  sy: number;
  /** Seconds of ambient motion: it stops while the visitor is idle, so nothing jumps when it resumes. */
  t: number;
  /** Canvas pixels per CSS pixel. */
  dpr: number;
  /** Changes whenever the page is measured again or fonts load; caches keyed on it stay valid in between. */
  epoch: number;
  W: number;
  H: number;
  mobile: boolean;
  reduce: boolean;
  /** The section the plate belongs to, and its content box inside the side padding. */
  section: Rect;
  content: Rect;
  /** The section's title box, if it has one. */
  title: Rect | null;
  anchor: (name: string) => Rect | null;
  /** Progress of a part of the plate that starts drawing when `r` comes into view. */
  progressAt: (r: Rect) => number;
  /** How far the section has scrolled through the viewport, 0 to 1, for scrubbed values. */
  scrub: number;
  store: typeof plotStore;
}

export interface Plate {
  /** Returns true while something eases toward a target, so the plotter draws the next frame too. */
  draw: (c: PlateCtx) => boolean | void;
  /** Anchor whose top starts the plate drawing; the section's top by default. */
  at?: string;
  /** Moves on its own while on screen, so the plotter keeps rendering, at a reduced rate. */
  animated?: boolean;
  /** Draws with the opening animation, by time, instead of by scroll. */
  intro?: boolean;
  /** Draws while the pen circles this station, instead of by scroll. */
  station?: string;
  /** Bends the page grid around the station's point like space around a black hole. */
  warp?: boolean;
}
