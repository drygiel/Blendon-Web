// ColorMath / ColorFx / ColorDefaults: every colour operation Blendon's drawing goes through.
import { Color, Mathf } from '../unity/math.ts';
import { SharedGizmoSettings } from './gizmos/shared-settings.ts';

export const withFade = (c: Color, opacity: number) => new Color(c.r, c.g, c.b, c.a * opacity);
export const withAlpha = (c: Color, alpha: number) => new Color(c.r, c.g, c.b, alpha);
export const toward = (c: Color, target: Color, t: number) => withAlpha(Color.lerp(c, target, t), c.a);
export const shade = (c: Color, k: number, alpha: number) => new Color(c.r * k, c.g * k, c.b * k, alpha);
export const desaturated = (c: Color) => shade(Color.white, c.grayscale, c.a);
export const darken = (c: Color, amount: number) =>
  new Color(Mathf.Clamp01(c.r - amount), Mathf.Clamp01(c.g - amount), Mathf.Clamp01(c.b - amount), c.a);

export function brighten(c: Color, amount = 0.22, desaturate = 0.5) {
  const [h, s, v] = Color.RGBToHSV(c);
  return withAlpha(Color.HSVToRGB(h, Mathf.Clamp01(s - amount * desaturate), Mathf.Clamp01(v + amount)), c.a);
}

export function composite(fillFraction: number, coverage: number, fill: Color, stroke: Color) {
  const r = fill.mul(fillFraction).add(stroke.mul(1 - fillFraction));
  return new Color(r.r, r.g, r.b, coverage * Mathf.Lerp(stroke.a, fill.a, fillFraction));
}

/** Alpha scaled by the gizmo Opacity slider and `extra`. */
export const withOpacity = (c: Color, extra = 1) =>
  new Color(c.r, c.g, c.b, c.a * SharedGizmoSettings.Opacity * extra);

/** Each channel pushed away from mid-grey by the Contrast slider (or `contrast`). */
export function contrast(c: Color, k = -1, alpha = -1) {
  k = k <= -1 ? SharedGizmoSettings.Contrast : k;
  alpha = alpha <= -1 ? c.a : alpha;
  const f = (v: number) => Mathf.Clamp01(0.5 + (v - 0.5) * k);
  return new Color(f(c.r), f(c.g), f(c.b), alpha);
}

export const ColorDefaults = {
  PieCurrentHoverBoost: 0.15,
  PieTitleFade: 0.75,
  PieAcceleratorFade: 0.55,
  PieDisabledFade: 0.35,
  AxisXDefault: new Color(1, 0.212, 0.325),
  AxisYDefault: new Color(0.541, 0.859, 0),
  AxisZDefault: new Color(0.173, 0.561, 1),
  CenterDotDefault: new Color(0.965, 0.604, 0.176),
  OutlineDefault: Color.black,
  GhostDefault: new Color(0.5, 0.5, 0.5),
  ScreenRingColorDefault: new Color(0.937, 0.937, 0.937, 0.933),
  NavBackdropDefault: new Color(0.5, 0.5, 0.5, 0.5),
  NavDepthFadeDefault: new Color(0.22, 0.22, 0.22, 1),
  BoxSelectOutlineDefault: new Color(1, 1, 1, 0.914),
  BoxSelectFillDefault: new Color(0.867, 0.867, 0.867, 0.149),
  BoxSelectHighlightDefault: new Color(1, 0.357, 0, 0.125),
  BoxSelectDeselectHighlightDefault: new Color(0.9, 0.05, 0.25, 0.125),
  BoxSelectNamesTextDefault: Color.white,
  BoxSelectNamesBackgroundDefault: new Color(0, 0, 0, 0.757),
  PieItemDefault: new Color(0.14, 0.14, 0.14, 0.94),
  PieHighlightDefault: new Color(0.31, 0.31, 0.31, 0.98),
  PieCurrentDefault: new Color(0.28, 0.45, 0.7, 0.96),
  PieTextDefault: new Color(0.83, 0.83, 0.83, 1),
  PieRingDefault: new Color(0.1, 0.1, 0.1, 0.85),
  PieIconPlateHover: new Color(1, 1, 1, 0.16),
};
