// A port of Blendon's GizmoPreview (a PreviewRenderUtility camera plus Handles) and of the
// Move/Rotate/Scale/Transform *GizmoPreview draw paths onto a 2D canvas. Geometry is built in
// Unity's world space exactly as the C# builds it and projected through the same camera; every
// Handles polygon becomes one canvas fill, in the same order, so translucent parts stack the same.
import type { PropValue } from '../data/schema.ts';
import { clamp, hexToRgb } from '../core/util.ts';

type V3 = [number, number, number];
type Color = [number, number, number, number];

const RIGHT: V3 = [1, 0, 0];
const UP: V3 = [0, 1, 0];
const FWD: V3 = [0, 0, 1];
const ZERO: V3 = [0, 0, 0];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sqr = (a: V3) => dot(a, a);
const normalize = (a: V3): V3 => {
  const m = Math.sqrt(sqr(a));
  return m > 1e-5 ? mul(a, 1 / m) : [0, 0, 0];
};
const c01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * c01(t);
const DEG = Math.PI / 180;

/** Quaternion.AngleAxis(deg, axis) * v. */
function rotate(v: V3, deg: number, axis: V3): V3 {
  const k = normalize(axis);
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

/** Vector3.Angle. */
function angle(a: V3, b: V3) {
  const d = Math.sqrt(sqr(a) * sqr(b));
  return d < 1e-15 ? 0 : Math.acos(Math.max(-1, Math.min(1, dot(a, b) / d))) / DEG;
}

interface Basis {
  r: V3;
  u: V3;
  f: V3;
}

/**
 * Quaternion.LookRotation(forward, up) as a basis; colinear vectors fall back to
 * FromToRotation(forward-axis, forward), which keeps world right as the roll reference.
 */
function look(forward: V3, up: V3 = UP): Basis {
  const f = normalize(forward);
  let r = normalize(cross(up, f));
  if (sqr(r) < 1e-10) r = RIGHT;
  return { r, u: cross(f, r), f };
}

// ---- colours (GizmoColors / ColorFx / ColorMath) ----
const hex = (h: PropValue | undefined): Color => {
  const c = hexToRgb(typeof h === 'string' && h ? h : '#000000');
  return [c[0] / 255, c[1] / 255, c[2] / 255, c[3]];
};
const contrast = (c: Color, k: number): Color => [
  c01(0.5 + (c[0] - 0.5) * k),
  c01(0.5 + (c[1] - 0.5) * k),
  c01(0.5 + (c[2] - 0.5) * k),
  c[3],
];
const withA = (c: Color, a: number): Color => [c[0], c[1], c[2], a];

// ---- camera (GizmoPreview) ----
const DISTANCE = 6;
const HALF_FOV = 16 * DEG;
const BASE_SCALE = 0.95;
const HANDLE_POINTS = 80;
const FILL = 0.92;
const VIEW_DIR = normalize([-0.55, 0.42, -1]);
const AXIS_DROP = 0.2;

/** Degrees per second of the idle spin. */
export const SPEED = 15;

/** GizmoPreview.PreferredHeight from the extent above and below the pivot, in handle sizes. */
export const preferredHeight = (up: number, down: number) =>
  clamp((Math.max(up + down, 0.01) * BASE_SCALE * HANDLE_POINTS) / FILL, 150, 320);

interface Camera {
  pos: V3;
  r: V3;
  u: V3;
  f: V3;
  /** Projects into CSS px. */
  F: number;
  /** What HandleUtility measures against, from the whole-pixel render target PreviewRenderUtility uses. */
  Fg: number;
  cx: number;
  cy: number;
}

/** W x H in CSS px. */
function camera(viewDir: V3, aimY: number, W: number, H: number, dpr: number): Camera {
  const b = look(mul(viewDir, -1), UP);
  const F = H / 2 / Math.tan(HALF_FOV);
  const Fg = Math.max(1, Math.floor(H * dpr)) / 2 / Math.tan(HALF_FOV) / dpr;
  return { pos: add([0, aimY, 0], mul(viewDir, DISTANCE)), r: b.r, u: b.u, f: b.f, F, Fg, cx: W / 2, cy: H / 2 };
}
const depth = (cam: Camera, p: V3) => dot(sub(p, cam.pos), cam.f);
const handleSize = (cam: Camera, p: V3) => (HANDLE_POINTS * depth(cam, p)) / cam.Fg;
const halfWidth = (cam: Camera, p: V3, px: number) => (px * 0.5 * Math.max(depth(cam, p), 1e-4)) / cam.Fg;

function project(cam: Camera, p: V3): [number, number] {
  const d = sub(p, cam.pos);
  const z = dot(d, cam.f);
  return [cam.cx + (dot(d, cam.r) / z) * cam.F, cam.cy - (dot(d, cam.u) / z) * cam.F];
}

const css = (c: Color) =>
  `rgba(${Math.round(c01(c[0]) * 255)},${Math.round(c01(c[1]) * 255)},${Math.round(c01(c[2]) * 255)},${c01(c[3])})`;

// DrawPrimitives.PlaneAxes.
function planeAxes(normal: V3): [V3, V3] {
  let a = normalize(cross(normal, UP));
  if (sqr(a) < 0.001) a = normalize(cross(normal, RIGHT));
  return [a, cross(normal, a)];
}

function circlePoints(segs: number, center: V3, normal: V3, radius: number): V3[] {
  const [a, b] = planeAxes(normal);
  const out: V3[] = [];
  for (let i = 0; i < segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    out.push(add(center, mul(add(mul(a, Math.cos(t)), mul(b, Math.sin(t))), radius)));
  }
  return out;
}

function ringRef(axis: V3): V3 {
  let r = cross(axis, UP);
  if (sqr(r) < 0.001) r = cross(axis, RIGHT);
  return normalize(r);
}

// Handles.ConeHandleCap / CubeHandleCap: Unity's own meshes through the "Handles Shaded" material,
// back faces culled. Its lighting, measured off a render: a view-facing term plus a sky/ground
// hemisphere, both multiplying Handles.color.
const SKY = [0.318, 0.341, 0.389].map((v) => Math.pow(v, 2.2));
const GROUND = [0.07, 0.064, 0.052].map((v) => Math.pow(v, 2.2));
const HEMI = [0.9856, 0.9786, 0.9744];
const BIAS = [-0.0023, -0.0024, -0.0027];

function lit(cam: Camera, n: V3, ch: number) {
  const ey = dot(n, cam.u);
  const ez = -dot(n, cam.f);
  const g = GROUND[ch];
  return 1.3752 * ez + HEMI[ch] * (g + (SKY[ch] - g) * (ey * 0.5 + 0.5)) + BIAS[ch];
}

interface Face {
  v: V3[];
  n: V3[];
}

const CONE: Face[] = (() => {
  const ring = (k: number): [number, number] => {
    const a = k * 22.5 * DEG;
    return [Math.cos(a), Math.sin(a)];
  };
  const out: Face[] = [];
  for (let k = 0; k < 16; k++) {
    const a = ring(k);
    const b = ring(k + 1);
    const m = ring(k + 0.5);
    out.push({
      v: [
        [a[0] * 0.4, a[1] * 0.4, -0.5],
        [0, 0, 0.7],
        [b[0] * 0.4, b[1] * 0.4, -0.5],
      ],
      n: [
        [a[0] * 0.949, a[1] * 0.949, 0.316],
        [m[0] * 0.934, m[1] * 0.934, 0.358],
        [b[0] * 0.949, b[1] * 0.949, 0.316],
      ],
    });
    out.push({
      v: [
        [0, 0, -0.5],
        [b[0] * 0.4, b[1] * 0.4, -0.5],
        [a[0] * 0.4, a[1] * 0.4, -0.5],
      ],
      n: [
        [0, 0, -1],
        [0, 0, -1],
        [0, 0, -1],
      ],
    });
  }
  return out;
})();

const CUBE: Face[] = (() => {
  const out: Face[] = [];
  const normals: V3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (const n of normals) {
    const [a, b]: [V3, V3] = n[0]
      ? [
          [0, 1, 0],
          [0, 0, 1],
        ]
      : n[1]
        ? [
            [0, 0, 1],
            [1, 0, 0],
          ]
        : [
            [1, 0, 0],
            [0, 1, 0],
          ];
    const c = mul(n, 0.5);
    const A = mul(a, 0.5);
    const B = mul(b, 0.5);
    out.push({ v: [sub(sub(c, A), B), add(sub(c, A), B), add(add(c, A), B), sub(add(c, A), B)], n: [n, n, n, n] });
  }
  return out;
})();

type Fill = string | ((ctx: CanvasRenderingContext2D) => CanvasGradient);

let meshCanvas: HTMLCanvasElement | null = null;

/** One render pass: the canvas, its camera and the current Handles.color. */
class Pass {
  readonly ctx: CanvasRenderingContext2D;
  readonly cam: Camera;
  readonly S: GizmoSettings;
  col: Color = [1, 1, 1, 1];

  constructor(ctx: CanvasRenderingContext2D, cam: Camera, S: GizmoSettings) {
    this.ctx = ctx;
    this.cam = cam;
    this.S = S;
  }

  poly(pts: V3[], fill?: string | CanvasGradient, ctx: CanvasRenderingContext2D = this.ctx) {
    if (this.col[3] <= 0 && !fill) return;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const s = project(this.cam, p);
      if (i) ctx.lineTo(s[0], s[1]);
      else ctx.moveTo(s[0], s[1]);
    });
    ctx.closePath();
    ctx.fillStyle = fill ?? css(this.col);
    ctx.fill();
    // A mesh is rasterised whole on the GPU, so its own triangles must not leave antialiased seams.
    if (ctx !== this.ctx) {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  normal() {
    return this.cam.f;
  }

  qualityLerp(a: number, b: number) {
    return lerp(a, b, (this.S.quality - 0.1) / (6 - 0.1));
  }

  /** DrawPrimitives.DrawSegment: a camera-facing quad, ends pushed out a hair so joints overlap. */
  segment(p0: V3, p1: V3, viewDir: V3, hw0: number, hw1: number) {
    let dir = sub(p1, p0);
    if (sqr(dir) < 1e-12) return;
    dir = normalize(dir);
    let perp = cross(dir, viewDir);
    if (sqr(perp) < 1e-10) return;
    perp = normalize(perp);
    p0 = sub(p0, mul(dir, 0.0003));
    p1 = add(p1, mul(dir, 0.0003));
    this.poly([sub(p0, mul(perp, hw0)), sub(p1, mul(perp, hw1)), add(p1, mul(perp, hw1)), add(p0, mul(perp, hw0))]);
  }

  thickLine(a: V3, b: V3, px: number) {
    this.segment(a, b, this.normal(), halfWidth(this.cam, a, px), halfWidth(this.cam, b, px));
  }

  polyline(px: number, closed: boolean, pts: V3[]) {
    if (pts.length < 2) return;
    const hw = pts.map((p) => halfWidth(this.cam, p, px));
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % pts.length;
      this.segment(pts[i], pts[j], this.normal(), hw[i], hw[j]);
    }
  }

  disc(center: V3, normal: V3, radius: number) {
    let segs = Math.trunc(this.qualityLerp(8, 48));
    segs = Math.trunc(lerp(8, segs, radius / 0.05));
    this.poly(circlePoints(segs, center, normal, radius));
  }

  circle(center: V3, normal: V3, radius: number, px: number) {
    this.polyline(px, true, circlePoints(Math.ceil(this.qualityLerp(8, 144)), center, normal, radius));
  }

  /** RingOverlays.DrawFrontHalfRing: the camera-facing half of an idle axis ring. */
  frontHalfRing(position: V3, axis: V3, radius: number, px: number, viewDir: V3) {
    const u = ringRef(axis);
    const v = normalize(cross(axis, u));
    const du = dot(u, viewDir);
    const dv = dot(v, viewDir);
    if (Math.abs(du) < 0.05 && Math.abs(dv) < 0.05) {
      this.circle(position, axis, radius, px);
      return;
    }
    let t0 = Math.atan2(-du, dv) / DEG;
    const tm = (t0 + 90) * DEG;
    if (dot(add(mul(u, Math.cos(tm)), mul(v, Math.sin(tm))), viewDir) > 0) t0 += 180;
    const segs = Math.ceil(this.qualityLerp(4, 60));
    const pts: V3[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = (t0 + (i / segs) * 180) * DEG;
      pts.push(add(position, mul(add(mul(u, Math.cos(t)), mul(v, Math.sin(t))), radius)));
    }
    this.polyline(px, false, pts);
  }

  mesh(faces: Face[], position: V3, basis: Basis, size: number) {
    const cam = this.cam;
    const col = this.col;
    const a = c01(col[3]);
    const main = this.ctx;
    const toWorld = (v: V3) =>
      add(position, add(add(mul(basis.r, v[0] * size), mul(basis.u, v[1] * size)), mul(basis.f, v[2] * size)));
    const rot = (n: V3) => add(add(mul(basis.r, n[0]), mul(basis.u, n[1])), mul(basis.f, n[2]));
    // The preview target is a float buffer: a lit colour past 1 still blends at full strength
    // and is only clamped afterwards. Premultiplied by alpha here, and added below, to match.
    const shade = (l: number[]) => css([a * col[0] * l[0], a * col[1] * l[1], a * col[2] * l[2], 1]);
    const tris: [V3[], Fill][] = [];
    for (const face of faces) {
      const w = face.v.map(toWorld);
      const ns = face.n.map(rot);
      const c = mul(w.reduce(add, ZERO), 1 / w.length);
      const nAvg = ns.reduce(add, ZERO);
      if (dot(nAvg, sub(cam.pos, c)) <= 0) continue;
      const s = w.map((p) => project(cam, p));
      const Ls = [0, 1, 2].map((ch) => ns.map((n) => lit(cam, n, ch)));
      if (Ls.every((l) => Math.max(...l) - Math.min(...l) < 1e-3)) {
        tris.push([w, shade(Ls.map((l) => l[0]))]);
        continue;
      }
      // Per-vertex lighting is affine across a triangle, so a linear gradient along its slope
      // reproduces the Gouraud ramp - stops added so a channel saturating mid-face clamps there.
      const fit = (l: number[]): [number, number, number] => {
        const [p0, p1, p2] = s as [[number, number], [number, number], [number, number]];
        const d = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
        if (Math.abs(d) < 1e-9) return [l[0], 0, 0];
        const gx = ((l[1] - l[0]) * (p2[1] - p0[1]) - (l[2] - l[0]) * (p1[1] - p0[1])) / d;
        const gy = ((l[2] - l[0]) * (p1[0] - p0[0]) - (l[1] - l[0]) * (p2[0] - p0[0])) / d;
        return [l[0] - gx * p0[0] - gy * p0[1], gx, gy];
      };
      const fits = Ls.map(fit);
      const f0 = fits[0];
      const gl = Math.hypot(f0[1], f0[2]);
      if (gl < 1e-9) {
        tris.push([w, shade(Ls.map((l) => l[0]))]);
        continue;
      }
      const ux = f0[1] / gl;
      const uy = f0[2] / gl;
      const proj = s.map((p) => p[0] * ux + p[1] * uy);
      const lo = Math.min(...proj);
      const hi = Math.max(...proj);
      const cx = (s[0][0] + s[1][0] + s[2][0]) / 3;
      const cy = (s[0][1] + s[1][1] + s[2][1]) / 3;
      const mid = cx * ux + cy * uy;
      const x0 = cx + (lo - mid) * ux;
      const y0 = cy + (lo - mid) * uy;
      const x1 = cx + (hi - mid) * ux;
      const y1 = cy + (hi - mid) * uy;
      tris.push([
        w,
        (ctx) => {
          const grad = ctx.createLinearGradient(x0, y0, x1, y1);
          for (let i = 0; i <= 6; i++) {
            const t = i / 6;
            const x = x0 + (x1 - x0) * t;
            const y = y0 + (y1 - y0) * t;
            grad.addColorStop(t, shade(fits.map((f) => f[0] + f[1] * x + f[2] * y)));
          }
          return grad;
        },
      ]);
    }
    // Rasterised whole off to the side, so the mesh's own triangles neither seam nor stack, then
    // laid down as dst * (1 - alpha) + alpha * colour: a black cut-out, then an additive pass.
    meshCanvas ??= document.createElement('canvas');
    if (meshCanvas.width !== main.canvas.width || meshCanvas.height !== main.canvas.height) {
      meshCanvas.width = main.canvas.width;
      meshCanvas.height = main.canvas.height;
    }
    const ctx = meshCanvas.getContext('2d')!;
    for (const pass of [0, 1]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, meshCanvas.width, meshCanvas.height);
      ctx.setTransform(main.getTransform());
      for (const [w, fill] of tris) this.poly(w, pass ? (typeof fill === 'function' ? fill(ctx) : fill) : '#000', ctx);
      main.save();
      main.setTransform(1, 0, 0, 1, 0, 0);
      main.globalAlpha = pass ? 1 : a;
      main.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      main.drawImage(meshCanvas, 0, 0);
      main.restore();
    }
  }
}

// ---- shared view-angle fades (GizmoRenderer) ----
const axisFade = (dir: V3, viewDir: V3, th: number) => {
  if (th <= 0) return 1;
  let a = angle(viewDir, dir);
  a = Math.min(a, 180 - a);
  return c01(a / th);
};
const planeFade = (n: V3, viewDir: V3, th: number) => {
  if (th <= 0) return 1;
  let a = angle(viewDir, n);
  a = Math.min(a, 180 - a);
  return c01((90 - a) / th);
};
const MIN_FADE = 0.05;

/** GizmoRenderer.SortByDepth: farthest first, the nearest drawn last. */
function sortByDepth(cam: Camera, pts: V3[]): number[] {
  const d = pts.map((p) => depth(cam, p));
  const o = [0, 1, 2];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2 - i; j++)
      if (d[o[j]] < d[o[j + 1]]) {
        const t = o[j];
        o[j] = o[j + 1]!;
        o[j + 1] = t;
      }
  return o;
}
const clampAxisOffset = (dir: V3, viewDir: V3, offset: number, size: number) =>
  Math.max(offset, (dot(dir, viewDir) <= 0 ? 1 : -1) * size);
const clampPlaneOffset = (p: V3, d1: V3, d2: V3, viewDir: V3, size: number, offset: number, planeSize: number) =>
  add(
    p,
    add(
      mul(d1, clampAxisOffset(d1, viewDir, offset, planeSize) * size),
      mul(d2, clampAxisOffset(d2, viewDir, offset, planeSize) * size),
    ),
  );

// ---- the parts ----
const AXES = [RIGHT, UP, FWD];
const PLANE_D1 = [RIGHT, UP, FWD];
const PLANE_D2 = [UP, FWD, RIGHT];
const PLANE_N = [FWD, RIGHT, UP];
const PLANE_AXIS = [2, 0, 1];

function planeCorners(shape: string, pivot: V3, center: V3, d1: V3, d2: V3, half: number): V3[] {
  const l1 = mul(d1, half);
  const l2 = mul(d2, half);
  if (shape !== 'Triangle')
    return [sub(sub(center, l1), l2), sub(add(center, l1), l2), add(add(center, l1), l2), add(sub(center, l1), l2)];
  const i1 = mul(l1, dot(sub(center, pivot), d1) >= 0 ? -1 : 1);
  const i2 = mul(l2, dot(sub(center, pivot), d2) >= 0 ? -1 : 1);
  return [add(add(center, i1), i2), add(sub(center, i1), i2), sub(add(center, i1), i2)];
}

interface AxisPart {
  enabled: boolean;
  axisLength: number;
  axisOffset: number;
  axisThickness: number;
  headFlat: boolean;
  headSize: number;
  headOpacity: number;
  planeEnabled: boolean;
  planeShape: string;
  planeSize: number;
  planeOffset: number;
  planeOutline: number;
  ringEnabled: boolean;
  ringRadius: number;
}

interface ScalePart extends AxisPart {
  outerInteractive: boolean;
  outerRadius: number;
  ringColor: Color;
}

interface RotatePart {
  enabled: boolean;
  axisLength: number;
  axisThickness: number;
  trackEnabled: boolean;
  trackRadius: number;
  trackOpacity: number;
  ringEnabled: boolean;
  ringRadius: number;
  ringColor: Color;
}

export interface GizmoSettings {
  opacity: number;
  quality: number;
  size: number;
  threshold: number;
  dotRadius: number;
  dotOutline: number;
  ringThickness: number;
  axis: Color[];
  outline: Color;
  dot: Color;
  screenRing: Color;
  parts:
    | { combined?: false; move?: AxisPart; rotate?: RotatePart; scale?: ScalePart }
    | { combined: true; move: AxisPart; rotate: RotatePart; scale: ScalePart };
}

/** HandleLayout.DrawPlanesAndAxes with PlaneHandle/AxisHandle.DrawStatic, for Move (cone) and Scale (cube). */
function planesAndAxes(P: Pass, g: AxisPart, size: number, viewDir: V3, cone: boolean) {
  const S = P.S;
  const cam = P.cam;
  const pos = ZERO;
  if (g.planeEnabled) {
    const at = [0, 1, 2].map((i) =>
      clampPlaneOffset(pos, PLANE_D1[i], PLANE_D2[i], viewDir, size, g.planeOffset, g.planeSize),
    );
    for (const i of sortByDepth(cam, at)) {
      const fade = planeFade(PLANE_N[i], viewDir, S.threshold);
      if (fade < MIN_FADE) continue;
      const base = S.axis[PLANE_AXIS[i]];
      const corners = planeCorners(g.planeShape, pos, at[i], PLANE_D1[i], PLANE_D2[i], size * g.planeSize);
      P.col = withA(base, base[3] * S.opacity * fade * 0.5);
      P.poly(corners);
      P.col = withA(base, base[3] * S.opacity * fade);
      P.polyline(g.planeOutline, true, corners);
    }
  }
  if (!cone && !(g.axisLength > 0)) return;
  for (const i of sortByDepth(
    cam,
    AXES.map((d) => mul(d, size)),
  )) {
    const dir = AXES[i];
    const fade = axisFade(dir, viewDir, S.threshold);
    if (fade < MIN_FADE) continue;
    const start = mul(dir, g.axisOffset * g.axisLength * size);
    const tip = mul(dir, g.axisLength * size);
    const head = g.headSize * size;
    const axisCol = S.axis[i];
    P.col = withA(axisCol, axisCol[3] * fade);
    P.thickLine(start, tip, g.axisThickness * S.size);
    P.col = withA(P.col, g.headOpacity);
    if (cone) {
      if (g.headFlat) coneFlat(P, tip, dir, head);
      else P.mesh(CONE, add(tip, mul(dir, head / 2)), look(dir), head);
    } else if (g.headFlat) cubeFlat(P, tip, dir, head);
    else P.mesh(CUBE, add(tip, mul(dir, head / 2)), look(dir), head);
  }
}

/** ConeAxisHead.DrawHeadFlat: a fan of triangles round the shaft plus a disc over the base. */
function coneFlat(P: Pass, tip: V3, dir: V3, head: number) {
  const count = Math.trunc(lerp(8, 48, P.S.quality / 8));
  let perp = cross(dir, P.normal());
  if (sqr(perp) > 1e-6) {
    perp = normalize(perp);
    const apex = add(tip, mul(dir, head * 1.2));
    const radius = head / 3;
    const first = add(tip, mul(perp, radius));
    let prev = first;
    for (let i = 1; i <= count; i++) {
      const next = i === count ? first : add(tip, mul(rotate(perp, (i * 360) / count, dir), radius));
      P.poly([apex, prev, next]);
      prev = next;
    }
  }
  P.disc(tip, dir, (head / 3) * 0.95);
}

/** CubeAxisHead.DrawHeadFlat: a box of six flat quads, its back face on the shaft tip. */
function cubeFlat(P: Pass, tip: V3, dir: V3, head: number) {
  if (sqr(dir) <= 1e-6) return;
  const f = normalize(dir);
  const r = normalize(cross(f, Math.abs(f[1]) < 0.9 ? UP : FWD));
  const u = normalize(cross(r, f));
  const h = head * 0.5 * 0.5;
  const c = add(tip, mul(f, h));
  const v = (a: number, b: number, d: number) => add(add(add(c, mul(f, a * h)), mul(u, b * h)), mul(r, d * h));
  const fUR = v(1, 1, 1);
  const fUL = v(1, 1, -1);
  const fDR = v(1, -1, 1);
  const fDL = v(1, -1, -1);
  const bUR = v(-1, 1, 1);
  const bUL = v(-1, 1, -1);
  const bDR = v(-1, -1, 1);
  const bDL = v(-1, -1, -1);
  P.poly([fUL, fUR, fDR, fDL]);
  P.poly([bUR, bUL, bDL, bDR]);
  P.poly([fUL, bUL, bUR, fUR]);
  P.poly([fDL, bDL, bDR, fDR]);
  P.poly([fUR, bUR, bDR, fDR]);
  P.poly([bUL, fUL, fDL, bDL]);
}

/** CenterDotHandle.Draw at rest. */
function centerDot(P: Pass) {
  const S = P.S;
  if (S.dotRadius < 0.003) return;
  const size = handleSize(P.cam, ZERO) * S.dotRadius;
  P.col = withA(S.outline, S.dot[3]);
  P.disc(ZERO, P.normal(), size * S.dotOutline);
  P.col = S.dot;
  P.disc(ZERO, P.normal(), size);
}

function drawMove(P: Pass, g: AxisPart, size: number) {
  const viewDir = normalize(sub(ZERO, P.cam.pos));
  planesAndAxes(P, g, size, viewDir, true);
  if (g.ringEnabled) {
    P.col = P.S.screenRing;
    P.circle(ZERO, P.normal(), size * g.ringRadius, P.S.ringThickness);
  }
  centerDot(P);
}

function drawScale(P: Pass, g: ScalePart, size: number) {
  const viewDir = normalize(sub(ZERO, P.cam.pos));
  planesAndAxes(P, g, size, viewDir, false);
  if (g.ringEnabled) {
    P.col = g.ringColor;
    if (g.outerInteractive && g.outerRadius > 0) P.circle(ZERO, P.normal(), size * g.outerRadius, P.S.ringThickness);
    if (g.ringRadius <= 0) P.mesh(CUBE, ZERO, { r: RIGHT, u: UP, f: FWD }, size * g.headSize * 1.5);
    else P.circle(ZERO, P.normal(), size * g.ringRadius, P.S.ringThickness);
  }
  centerDot(P);
}

function drawRotate(P: Pass, g: RotatePart, size: number) {
  const S = P.S;
  const viewDir = normalize(sub(ZERO, P.cam.pos));
  if (g.trackEnabled) {
    P.col = [1, 1, 1, S.opacity * g.trackOpacity];
    P.disc(ZERO, P.normal(), size * g.trackRadius);
  }
  if (g.ringEnabled) {
    P.col = g.ringColor;
    P.circle(ZERO, P.normal(), size * g.ringRadius, S.ringThickness);
  }
  for (const i of sortByDepth(
    P.cam,
    AXES.map((d) => mul(d, size)),
  )) {
    P.col = S.axis[i]!;
    P.frontHalfRing(ZERO, AXES[i], size * g.axisLength, g.axisThickness, viewDir);
  }
  centerDot(P);
}

// ---- extents (the *GizmoPreview.Extent methods), in handle sizes ----
function moveExtent(g: AxisPart): [number, number] {
  const axis = g.axisLength + g.headSize * 1.2;
  const plane = g.planeEnabled ? Math.max(g.planeOffset, g.planeSize) + g.planeSize : 0;
  const ring = g.ringEnabled ? g.ringRadius : 0;
  const out = Math.max(axis, plane);
  return [Math.max(out, ring), Math.max(out * AXIS_DROP, ring)];
}

function rotateExtent(g: RotatePart): [number, number] {
  const r = Math.max(g.axisLength, Math.max(g.ringEnabled ? g.ringRadius : 0, g.trackEnabled ? g.trackRadius : 0));
  return [r, r];
}

function scaleExtent(g: ScalePart): [number, number] {
  const axis = g.axisLength + g.headSize * 0.5;
  const plane = g.planeEnabled ? Math.max(g.planeOffset, g.planeSize) + g.planeSize : 0;
  const inner = g.ringRadius > 0 ? g.ringRadius : g.headSize * 0.5;
  const outer = g.outerInteractive && g.outerRadius > 0 ? g.outerRadius : 0;
  const ring = g.ringEnabled ? Math.max(inner, outer) : 0;
  const out = Math.max(axis, plane);
  return [Math.max(out, ring), Math.max(out * AXIS_DROP, ring)];
}

/** Anything that reads the window's setting values. */
export interface ValueSource {
  val(key: string): PropValue | undefined;
}

/** The preview settings of a gizmo page, read off the window's own values. */
export function settings(app: ValueSource, page: string): GizmoSettings {
  const v = (k: string) => app.val(k);
  const n = (k: string) => Number(v(k));
  const col = (k: string) => hex(v(k));
  const opacity = n('SharedGizmoSettings.Opacity');
  const k = n('SharedGizmoSettings.Contrast');
  const on = !!v('GeneralSettings.Enabled') || v('GeneralSettings.Enabled') === undefined;
  const axisPart = (p: string): AxisPart => ({
    enabled: on && !!v(p + '.Enabled'),
    axisLength: n(p + '.AxisLength'),
    axisOffset: n(p + '.AxisOffset'),
    axisThickness: n(p + '.AxisThickness'),
    headFlat: !!v(p + '.AxisHeadFlat'),
    headSize: n(p + '.AxisHeadSize'),
    headOpacity: n(p + '.AxisHeadOpacity'),
    planeEnabled: !!v(p + '.PlaneEnabled'),
    planeShape: String(v(p + '.PlaneShape')),
    planeSize: n(p + '.PlaneSize'),
    planeOffset: n(p + '.PlaneOffset'),
    planeOutline: n(p + '.PlaneOutlineThickness'),
    ringEnabled: !!v(p + '.ScreenRingEnabled'),
    ringRadius: n(p + '.ScreenRingRadius'),
  });
  const scale = (p: string, outer: boolean): ScalePart => ({
    ...axisPart(p),
    outerInteractive: outer,
    outerRadius: n(p + '.OuterScreenRingRadius'),
    ringColor: col(p + '.ScreenRingColor'),
  });
  const rotate = (p: string): RotatePart => ({
    enabled: on && !!v(p + '.Enabled'),
    axisLength: n(p + '.AxisLength'),
    axisThickness: n(p + '.AxisThickness'),
    trackEnabled: !!v(p + '.TrackballEnabled'),
    trackRadius: n(p + '.TrackballRadius'),
    trackOpacity: n(p + '.TrackballOpacity'),
    ringEnabled: !!v(p + '.ScreenRingEnabled'),
    ringRadius: n(p + '.ScreenRingRadius'),
    ringColor: col(p + '.ScreenRingColor'),
  });
  let parts: GizmoSettings['parts'];
  if (page === 'MoveGizmoSettings') parts = { move: axisPart('MoveGizmoSettings') };
  else if (page === 'RotateGizmoSettings') parts = { rotate: rotate('RotateGizmoSettings') };
  else if (page === 'ScaleGizmoSettings') parts = { scale: scale('ScaleGizmoSettings', true) };
  else
    parts = {
      scale: scale('TransformScaleSettings', false),
      rotate: rotate('TransformRotateSettings'),
      move: axisPart('TransformMoveSettings'),
      combined: true,
    };
  return {
    opacity,
    quality: n('SharedGizmoSettings.Quality'),
    size: n('SharedGizmoSettings.Size'),
    threshold: n('SharedGizmoSettings.ThresholdDegrees'),
    dotRadius: n('SharedGizmoSettings.CenterDotRadius'),
    dotOutline: n('SharedGizmoSettings.CenterDotOutlineThickness'),
    ringThickness: n('SharedGizmoSettings.ScreenRingThickness'),
    axis: (['X', 'Y', 'Z'] as const).map((a) => {
      const c = contrast(col('GeneralSettings.AxisColor' + a), k);
      return withA(c, c[3] * opacity);
    }),
    outline: contrast(col('GeneralSettings.OutlineColor'), k),
    dot: contrast(col('SharedGizmoSettings.CenterDotColor'), k),
    screenRing: [1, 1, 1, 0.9 * opacity],
    parts,
  };
}

/** The extent above and below the pivot GizmoPreview.PreferredHeight is measured from. */
export function extent(S: GizmoSettings): [number, number] {
  const p = S.parts;
  if (!p.combined) {
    if (p.move) return moveExtent(p.move);
    if (p.rotate) return rotateExtent(p.rotate);
    return p.scale ? scaleExtent(p.scale) : [1, 0.2];
  }
  let up = 0;
  let down = 0;
  const take = (e: [number, number]) => {
    up = Math.max(up, e[0]);
    down = Math.max(down, e[1]);
  };
  if (p.scale.enabled) take(scaleExtent(p.scale));
  if (p.rotate.enabled) take(rotateExtent(p.rotate));
  if (p.move.enabled) take(moveExtent(p.move));
  return up + down < 0.01 ? [1, 0.2] : [up, down];
}

/** GizmoPreview.Draw: the camera orbits world Y by yaw; the gizmo itself always draws at identity. */
export function draw(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, S: GizmoSettings, yaw: number) {
  const [up, down] = extent(S);
  const viewDir = rotate(VIEW_DIR, yaw, UP);
  // Provisional camera at the pivot, for the handle size the framing is built on.
  const size = handleSize(camera(viewDir, 0, W, H, dpr), ZERO) * BASE_SCALE;
  const P = new Pass(ctx, camera(viewDir, (up - down) * 0.5 * size, W, H, dpr), S);
  const p = S.parts;
  if (!p.combined) {
    if (p.move) drawMove(P, p.move, size);
    else if (p.rotate) drawRotate(P, p.rotate, size);
    else if (p.scale) drawScale(P, p.scale, size);
    return;
  }
  if (p.move.enabled) drawMove(P, p.move, size);
  if (p.scale.enabled) drawScale(P, p.scale, size);
  if (p.rotate.enabled) drawRotate(P, p.rotate, size);
}
