// Everything the plotter knows between frames, shared by its parts: the page as last measured, the pen's
// path and where the pen is on it, the sparks and flashes, and the clocks.
import { Ink, greenSprites, sprites as sharedSprites, type Sprites } from '../draw.ts';
import { UP, ctaEllipse, type Keyframe, type PlotPath, type Run, type SegmentKind, type Station } from '../path.ts';
import type { Plate, Rect } from '../plates/index.ts';

export interface TitleState {
  el: HTMLElement;
  ink: HTMLElement;
  section: HTMLElement | null;
  run: Run | null;
  left: number;
  right: number;
  top: number;
  bottom: number;
  blockLeft: number;
  blockW: number;
  rv: number;
  edge: number;
}

export interface PlateState {
  el: HTMLElement;
  name: string;
  plate: Plate;
  section: Rect;
  content: Rect;
  title: Rect | null;
  trigger: number;
  p: number;
}

export interface RevealState {
  el: HTMLElement;
  kind: string;
  title: TitleState | null;
  /** A station the pen must reach first, if any. */
  at: string | null;
  top: number;
}

/** A ring of light spreading from a point the pen ignites, in page coordinates. */
export interface Flash {
  x: number;
  y: number;
  t: number;
  size: number;
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  /** Pull downward, in px/s^2. */
  g: number;
}

export interface Pen {
  s: number;
  x: number;
  y: number;
  px: number;
  py: number;
  v: number;
  kind: SegmentKind;
}

export interface PlotState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  root: HTMLElement;
  /** Draw a still background only: no pen, no trail, plates complete. */
  reduce: boolean;
  sprites: Sprites;
  /** The pen's sprites while the final button is pointed at. */
  green: Sprites;
  ink: Ink;

  W: number;
  H: number;
  dpr: number;
  sy: number;
  /** Reading scrollY forces a layout whenever the page changed since the last one, so frames read it only after a scroll. */
  scrolled: boolean;
  maxScroll: number;
  mobile: boolean;
  intensity: number;

  t0: number;
  t: number;
  /** Ambient time: as `t`, but it stands still while the visitor is idle. */
  at: number;
  lastActivity: number;
  idle: boolean;
  /** Changes whenever the page is measured again or fonts load. */
  epoch: number;
  introDone: boolean;
  ignited: boolean;
  emitAcc: number;
  lastMove: number;

  path: PlotPath | null;
  kfs: Keyframe[];
  titles: TitleState[];
  plates: PlateState[];
  reveals: RevealState[];
  railX: number;
  origin: { x: number; y: number };
  heroBottom: number;
  stations: Station[];
  anchors: Map<string, Rect>;

  /** The station the pen circles by time since `t0`, ignoring the scroll meanwhile. */
  ring: { name: string; t0: number } | null;
  /** After its circle the pen stays at this station's end until the visitor scrolls back above its leap. */
  ringFloor: string | null;
  /** The element under the pointer whose height the pen holds; `s` is cached per layout epoch. */
  hold: { el: HTMLElement; s: number | null; epoch: number } | null;
  /** How far the drawn line reaches; ahead of the pen while it holds. */
  inkS: number;
  pen: Pen;

  /** The final button, pulsed once when the pen has finished its journey. */
  ctaEl: HTMLElement | null;
  ctaDone: boolean;
  /** The ellipse round the final button, and the angle the pen has reached circling it, once it is there. */
  ell: ReturnType<typeof ctaEllipse> | null;
  orbit: { from: number; angle: number } | null;
  /** How green the pen is, easing with the pointer on the final button. */
  tint: number;

  flashes: Flash[];
  sparks: Spark[];
  /** Something changed that the next frame must draw. */
  dirty: boolean;
  /** A plate asked for the next frame while it eases toward a target. */
  easing: boolean;
}

export function createState(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, reduce: boolean): PlotState {
  const sprites = sharedSprites();
  const t0 = performance.now();
  return {
    canvas,
    ctx,
    root: document.documentElement,
    reduce,
    sprites,
    green: greenSprites(),
    ink: new Ink(ctx, sprites),
    W: 0,
    H: 0,
    dpr: 1,
    sy: window.scrollY,
    scrolled: false,
    maxScroll: 0,
    mobile: false,
    intensity: 1,
    t0,
    t: 0,
    at: 0,
    lastActivity: t0,
    idle: false,
    epoch: 0,
    introDone: reduce,
    ignited: false,
    emitAcc: 0,
    lastMove: 0,
    path: null,
    kfs: [],
    titles: [],
    plates: [],
    reveals: [],
    railX: 6,
    origin: { x: 0, y: 0 },
    heroBottom: 0,
    stations: [],
    anchors: new Map(),
    ring: null,
    ringFloor: null,
    hold: null,
    inkS: 0,
    pen: { s: 0, x: 0, y: 0, px: 0, py: 0, v: 0, kind: UP },
    ctaEl: null,
    ctaDone: false,
    ell: null,
    orbit: null,
    tint: 0,
    flashes: [],
    sparks: [],
    dirty: true,
    easing: false,
  };
}

/** Whether a page height is on screen. */
export const onScreenY = (st: PlotState, y: number) => y - st.sy > 0 && y - st.sy < st.H;

/** Whether a page height is within `m` pixels of the screen. */
export const near = (st: PlotState, y: number, m: number) => y - st.sy > -m && y - st.sy < st.H + m;
