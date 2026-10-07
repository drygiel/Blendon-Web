// The plotter's drawing vocabulary: strokes that draw themselves up to a progress value, labels that type
// themselves, and the glow sprites of the pen.

export type RGB = readonly [number, number, number];

export const NEUTRAL: RGB = [228, 224, 216];
export const AMBER: RGB = [242, 163, 58];
export const HOT: RGB = [255, 228, 186];
export const WHITE: RGB = [255, 250, 240];
export const RED: RGB = [229, 83, 75];
export const GREEN: RGB = [124, 195, 90];
export const BLUE: RGB = [74, 127, 208];

export const MONO = '500 10.5px "JetBrains Mono", ui-monospace, Consolas, monospace';
export const MONO_S = '500 9.5px "JetBrains Mono", ui-monospace, Consolas, monospace';
export const SERIF = 'italic 17px "Instrument Serif", Georgia, serif';
export const SERIF_S = 'italic 15px "Instrument Serif", Georgia, serif';
export const SANS = '500 13px "IBM Plex Sans", "Segoe UI", sans-serif';

export const TAU = Math.PI * 2;

export type Pt = [number, number];
export type Pt3 = [number, number, number];

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** Stable pseudo-random in [0, 1) for decorative variation. */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a).toFixed(3)})`;

export function circlePts(cx: number, cy: number, r: number, a0: number, sweep: number, n: number, ry = r): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]);
  }
  return out;
}

export function rectPts(cx: number, cy: number, w: number, h: number): Pt[] {
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  return [
    [x0, y0],
    [x0 + w, y0],
    [x0 + w, y0 + h],
    [x0, y0 + h],
    [x0, y0],
  ];
}

/** A perspective camera orbiting the origin; returns screen x, y and depth. */
export function camera(cx: number, cy: number, scale: number, dist: number, yaw: number, pitch: number) {
  const cyw = Math.cos(yaw);
  const syw = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return (x: number, y: number, z: number): Pt3 => {
    const X = x * cyw - z * syw;
    const z0 = x * syw + z * cyw;
    const Y = y * cp + z0 * sp;
    const Z = -y * sp + z0 * cp + dist;
    const f = scale / Z;
    return [cx + X * f, cy - Y * f, Z];
  };
}

function radial(size: number, stops: [number, string][]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

export interface Sprites {
  glowL: HTMLCanvasElement;
  glowS: HTMLCanvasElement;
  streak: HTMLCanvasElement;
}

let shared: Sprites | null = null;

/** One set of sprites for the whole page. */
export function sprites(): Sprites {
  return (shared ??= makeSprites());
}

function makeSprites(): Sprites {
  const streak = document.createElement('canvas');
  streak.width = 256;
  streak.height = 4;
  const g = streak.getContext('2d');
  if (g) {
    const gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, 'rgba(242,163,58,0)');
    gr.addColorStop(0.5, 'rgba(255,222,176,0.9)');
    gr.addColorStop(1, 'rgba(242,163,58,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 4);
  }
  return {
    glowL: radial(256, [
      [0, 'rgba(255,214,150,0.9)'],
      [0.12, 'rgba(242,163,58,0.5)'],
      [0.42, 'rgba(230,110,30,0.11)'],
      [1, 'rgba(230,110,30,0)'],
    ]),
    glowS: radial(64, [
      [0, 'rgba(255,255,255,1)'],
      [0.22, 'rgba(255,224,170,0.95)'],
      [0.55, 'rgba(242,163,58,0.35)'],
      [1, 'rgba(242,163,58,0)'],
    ]),
    streak,
  };
}

export interface StrokeOpts {
  /** Base colour once cooled. */
  c?: RGB;
  /** How far toward amber the stroke glows while drawing. */
  hm?: number;
  /** Base alpha. */
  a?: number;
  /** Extra brightness while hot, as a multiple of the base alpha. */
  hb?: number;
  w?: number;
  dash?: number[] | null;
  arrow?: boolean;
  arrowSize?: number;
  noTip?: boolean;
  linear?: boolean;
  /** For 3D strokes: alpha factor of the far side. */
  back?: number;
}

export interface LabelOpts {
  font?: string;
  align?: CanvasTextAlign;
  c?: RGB;
  a?: number;
}

/**
 * Drawing for one plate. `p` is the plate's progress; a stroke given the window [a, b] draws itself as `p`
 * crosses it, glows amber while it does, then cools to its base colour.
 */
export class Ink {
  p = 0;
  /** Background intensity; scales every alpha. */
  I = 1;
  readonly ctx: CanvasRenderingContext2D;
  readonly sprites: Sprites;

  constructor(ctx: CanvasRenderingContext2D, sprites: Sprites) {
    this.ctx = ctx;
    this.sprites = sprites;
  }

  seg(a: number, b: number) {
    return clamp((this.p - a) / (b - a));
  }

  private heat(q0: number, b: number) {
    return q0 < 1 ? 1 : 1 - clamp((this.p - b) / 0.12);
  }

  sprite(img: CanvasImageSource, x: number, y: number, size: number, a: number) {
    const { ctx } = this;
    ctx.globalAlpha = clamp(a);
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  spark(x: number, y: number, a: number) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.sprite(this.sprites.glowS, x, y, 20, a * Math.min(1.2, this.I));
    ctx.restore();
  }

  dot(x: number, y: number, r: number, c: RGB, a: number) {
    const { ctx } = this;
    ctx.fillStyle = rgba(c, a);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  arrowHead(x: number, y: number, ang: number, size: number, c: RGB, a: number) {
    const { ctx } = this;
    ctx.fillStyle = rgba(c, a);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(ang - 0.42) * size, y - Math.sin(ang - 0.42) * size);
    ctx.lineTo(x - Math.cos(ang + 0.42) * size, y - Math.sin(ang + 0.42) * size);
    ctx.closePath();
    ctx.fill();
  }

  /** A polyline drawn up to the progress inside [a, b]; returns its tip. */
  poly(pts: Pt[], a: number, b: number, o: StrokeOpts = {}): Pt | null {
    const q0 = this.seg(a, b);
    if (q0 <= 0 || pts.length < 2) return null;
    const { ctx } = this;
    const q = o.linear ? q0 : easeInOut(q0);
    const n = pts.length;
    const ls = new Float64Array(n);
    for (let i = 1; i < n; i++) ls[i] = ls[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const target = ls[n - 1] * q;
    const h = this.heat(q0, b);
    const col = mix(o.c ?? NEUTRAL, AMBER, h * (o.hm ?? 0.9));
    const alpha = (o.a ?? 0.16) * this.I * (1 + h * (o.hb ?? 2.2));
    ctx.strokeStyle = rgba(col, alpha);
    ctx.lineWidth = o.w ?? 1;
    ctx.setLineDash(o.dash ?? []);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    let tip: Pt = pts[0];
    let tipAng = 0;
    for (let i = 1; i < n; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      tipAng = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      if (ls[i] <= target) {
        ctx.lineTo(p1[0], p1[1]);
        tip = p1;
        continue;
      }
      const f = (target - ls[i - 1]) / (ls[i] - ls[i - 1] || 1);
      tip = [lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f)];
      ctx.lineTo(tip[0], tip[1]);
      break;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (o.arrow && q > 0.97) this.arrowHead(tip[0], tip[1], tipAng, o.arrowSize ?? 7, col, Math.min(1, alpha * 1.5));
    if (q0 < 1 && !o.noTip) this.spark(tip[0], tip[1], 0.55);
    return tip;
  }

  /** As `poly`, for 3D points through a projection; the far side of a shape is dimmer. */
  poly3(pts: Pt3[], project: (x: number, y: number, z: number) => Pt3, a: number, b: number, o: StrokeOpts = {}) {
    const q0 = this.seg(a, b);
    if (q0 <= 0 || pts.length < 2) return;
    const { ctx } = this;
    const q = easeInOut(q0);
    const sp = pts.map((p) => project(p[0], p[1], p[2]));
    const ls = new Float64Array(sp.length);
    for (let i = 1; i < sp.length; i++)
      ls[i] = ls[i - 1] + Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]);
    const target = ls[sp.length - 1] * q;
    const h = this.heat(q0, b);
    const col = mix(o.c ?? NEUTRAL, AMBER, h * (o.hm ?? 0.9));
    const base = (o.a ?? 0.15) * this.I * (1 + h * 1.6);
    const front = new Path2D();
    const back = new Path2D();
    let tip: Pt | null = null;
    for (let i = 1; i < sp.length; i++) {
      if (ls[i - 1] >= target) break;
      const p0 = sp[i - 1];
      const p1 = sp[i];
      let x1 = p1[0];
      let y1 = p1[1];
      if (ls[i] > target) {
        const f = (target - ls[i - 1]) / (ls[i] - ls[i - 1] || 1);
        x1 = lerp(p0[0], x1, f);
        y1 = lerp(p0[1], y1, f);
      }
      const pa = p1[2] + p0[2] > 0 ? front : back;
      pa.moveTo(p0[0], p0[1]);
      pa.lineTo(x1, y1);
      tip = [x1, y1];
    }
    ctx.lineWidth = o.w ?? 1;
    ctx.setLineDash(o.dash ?? []);
    ctx.strokeStyle = rgba(col, base * (o.back ?? 0.3));
    ctx.stroke(back);
    ctx.strokeStyle = rgba(col, base);
    ctx.stroke(front);
    ctx.setLineDash([]);
    if (q0 < 1 && tip) this.spark(tip[0], tip[1], 0.5);
  }

  /** Text typed out across [a, b], with a block cursor while it types. */
  label(str: string, x: number, y: number, a: number, b: number, o: LabelOpts = {}) {
    const q = this.seg(a, b);
    if (q <= 0) return;
    const { ctx } = this;
    const txt = str.slice(0, Math.round(str.length * q));
    ctx.font = o.font ?? MONO;
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = 'alphabetic';
    const h = q < 1 ? 1 : 1 - clamp((this.p - b) / 0.15);
    ctx.fillStyle = rgba(mix(o.c ?? NEUTRAL, AMBER, h * 0.8), (o.a ?? 0.42) * this.I * (1 + h * 0.6));
    ctx.fillText(txt, x, y);
    if (q < 1) {
      const w = ctx.measureText(txt).width;
      const cx = o.align === 'right' ? x + 2 : o.align === 'center' ? x + w / 2 + 2 : x + w + 2;
      ctx.fillStyle = rgba(AMBER, 0.9 * Math.min(1, this.I));
      ctx.fillRect(cx, y - 9, 6, 11);
    }
  }
}
