// ProceduralTextures: SDF bakes for GUI drawing - rounded rects and rings - at exact device-pixel size
// with both colours baked in, so a 1px outline stays crisp at any display scale.
import { Color, Mathf, Rect } from '../unity/math.ts';
import { EditorGUIUtility } from '../unity/handles.ts';
import { composite, withAlpha } from './color.ts';

export type BakedTexture = HTMLCanvasElement | OffscreenCanvas;

function newTexture(w: number, h: number): BakedTexture | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

function write(tex: BakedTexture | null, w: number, h: number, pixel: (px: number, py: number) => Color) {
  if (!tex) return null;
  const ctx = tex.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const c = pixel(px, py);
      const i = (py * w + px) * 4;
      d[i] = c.r * 255;
      d[i + 1] = c.g * 255;
      d[i + 2] = c.b * 255;
      d[i + 3] = c.a * 255;
    }
  ctx.putImageData(img, 0, 0);
  return tex;
}

// Shared stroke-over-fill compositing from one SDF, so fill and stroke never disagree on the boundary.
function insetOutlinePixel(sdf: number, outline: number, fill: Color, stroke: Color) {
  const outer = Mathf.Clamp01(0.5 - sdf);
  const inner = Mathf.Clamp01(0.5 - (sdf + outline));
  return composite(outer > 0 ? inner / outer : 0, outer, fill, stroke);
}

// Divides by the normal's dominant axis so a 45-degree corner doesn't fatten the 1px band.
function cornerAxisScale(qx: number, qy: number) {
  if (qx <= 0 || qy <= 0) return 1;
  const l = Math.sqrt(qx * qx + qy * qy);
  return l > 1e-4 ? Math.max(qx, qy) / l : 1;
}

function bandSdf(cx: number, cy: number, inner: number, outer: number) {
  const d = Math.sqrt(cx * cx + cy * cy);
  const raw = Math.max(d - outer, inner - d);
  return raw / (d > 1e-4 ? Math.max(Math.abs(cx), Math.abs(cy)) / d : 1);
}

export const ProceduralTextures = {
  /** Rounds a rect to device pixels, so a texture baked to match lands texel-for-texel. */
  snapToPixelGrid(r: Rect) {
    const s = EditorGUIUtility.pixelsPerPoint;
    return new Rect(
      Math.round(r.x * s) / s,
      Math.round(r.y * s) / s,
      Math.round(r.width * s) / s,
      Math.round(r.height * s) / s,
    );
  },

  roundedRect(w: number, h: number, radius: number, outline: number, fill: Color, stroke: Color) {
    const hw = w * 0.5,
      hh = h * 0.5;
    return write(newTexture(w, h), w, h, (px, py) => {
      const cx = px + 0.5 - hw,
        cy = py + 0.5 - hh;
      const qx = Math.abs(cx) - (hw - radius),
        qy = Math.abs(cy) - (hh - radius);
      const sdf = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - radius;
      return insetOutlinePixel(sdf / cornerAxisScale(qx, qy), outline, fill, stroke);
    });
  },

  /** Ring with an inset outline on both edges; one pixel of headroom lets the outer edge fade. */
  ring(diameter: number, thickness: number, outline: number, fill: Color, stroke: Color) {
    return ProceduralTextures.ringWithWedge(diameter, thickness, outline, fill, fill, stroke, 0, 0);
  },

  /** The ring with a wedge baked in at a GUI-space (y-down) angle, never rotated after the fact. */
  ringWithWedge(
    diameter: number,
    thickness: number,
    outline: number,
    ringColor: Color,
    wedgeColor: Color,
    stroke: Color,
    wedgeHalfAngle: number,
    wedgeCenterAngle: number,
  ) {
    const half = diameter * 0.5;
    const outer = half - 1;
    const inner = outer - thickness;
    const uncovered = withAlpha(stroke, 0);
    return write(newTexture(diameter, diameter), diameter, diameter, (px, py) => {
      const cx = px + 0.5 - half,
        cy = py + 0.5 - half;
      const sdf = bandSdf(cx, cy, inner, outer);
      const outerMask = Mathf.Clamp01(0.5 - sdf);
      if (outerMask <= 0) return uncovered;
      const innerMask = Mathf.Clamp01(0.5 - (sdf + outline));
      let fill = ringColor;
      if (wedgeHalfAngle > 0) {
        const delta = Math.abs(Mathf.DeltaAngle(wedgeCenterAngle, Math.atan2(cy, cx) * Mathf.Rad2Deg));
        // Arc length, not degrees, so the wedge edge feathers about a pixel at any radius.
        const angularSdf = (delta - wedgeHalfAngle) * Mathf.Deg2Rad * Math.max(Math.sqrt(cx * cx + cy * cy), 1);
        fill = Color.lerp(ringColor, wedgeColor, Mathf.Clamp01(0.5 - angularSdf));
      }
      return composite(innerMask / outerMask, outerMask, fill, stroke);
    });
  },
};
