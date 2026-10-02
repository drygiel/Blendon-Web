// Small helpers shared by the window's layout, controls and gizmo preview.

export const PAL = {
  brand: '#46607C',
  brandHover: '#597089',
  window: '#383838',
  sunken: '#2B2B2B',
  card: '#3F3F3F',
  raised: '#4A4A4A',
  border: '#212121',
  text: '#D9D9D9',
  text2: '#A6A6A6',
  caption: '#808080',
  link: '#58A6FF',
  linkHover: '#79B8FF',
  warnText: '#FFC76B',
  destructive: '#FF5C54',
};

/** Layout metrics of SettingsEditorWindow, in points. */
export const M = {
  headerH: 60,
  footerH: 46,
  chromePad: 14,
  contentPad: 12,
  sb: 14,
  sideItem: 32,
  sideRail: 30,
  sideGroup: 16,
  sidePadT: 5,
  sidePadB: 5,
  sideGap: 3,
  sideSb: 15,
  sideMin: 167,
  sideMax: 320,
  sideCollapsed: 34,
  sideFooter: 26,
  minContent: 400,
  railGap: 9,
  labelW: 180,
  gridBreak: 760,
  gutter: 18,
  cellPadX: 20,
  foldPadX: 40,
  cardPadX: 28,
  searchW: 250,
  searchMin: 130,
  headerTextMin: 190,
  tabH: 25,
  pieMinW: 511,
};

export const MIN_QUERY = 3;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** "#RRGGBB" or "#RRGGBBAA" -> [r, g, b (0..255), a (0..1)]. */
export function hexToRgb(h: string): [number, number, number, number] {
  h = h.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  ];
}

export function rgba(h: string, a?: number): string {
  const c = hexToRgb(h);
  return `rgba(${c[0]},${c[1]},${c[2]},${a ?? c[3]})`;
}

/** Text with Unity rich-text tags removed. */
export const plain = (s: string | undefined) => (s ?? '').replace(/<[^>]*>/g, '');

export function fmtNum(v: number): string {
  return isFinite(v) ? String(+v.toFixed(6)) : '0';
}

/** SettingsControls.RoundToRange: 1% of the range decides the decimals. */
export function roundToRange(v: number, min: number, max: number): number {
  const step = Math.abs(max - min) * 0.01;
  if (step <= 0) return v;
  const d = clamp(-Math.round(Math.log10(step)), 0, 15);
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

/** Badge.FillFor: the accent shaded to a fixed luma. */
export function badgeFill(hex: string): string {
  const c = hexToRgb(hex);
  const g = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  const k = 0.34 / Math.max(0.01, g);
  return `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
}

/** Unity at 175% sets text at whole device pixels (banker's rounding), so 10pt draws at 18/1.75. */
export function unityPx(pt: number): number {
  const px = pt * 1.75;
  const f = Math.floor(px);
  const d = px - f;
  const r = d > 0.5 || (d === 0.5 && f % 2) ? f + 1 : f;
  return +(r / 1.75).toFixed(3);
}

/** GUI.contentColor multiplies the style's own text colour (miniLabel family: #D2D2D2). */
export function tinted(hex: string, k?: number): string {
  const c = hexToRgb(hex);
  const f = k ?? 210 / 255;
  return `rgb(${Math.round(c[0] * f)},${Math.round(c[1] * f)},${Math.round(c[2] * f)})`;
}

/** ColorMath.Brighten (HSV: s -= .11, v += .22). */
export function brighten(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((x, i) => (i < 3 ? x / 255 : x)) as [number, number, number, number];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const s = clamp((mx ? d / mx : 0) - 0.11, 0, 1);
  const v = clamp(mx + 0.22, 0, 1);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m0 = v - c;
  const [rr, gg, bb] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `rgb(${Math.round((rr + m0) * 255)},${Math.round((gg + m0) * 255)},${Math.round((bb + m0) * 255)})`;
}

/** ButtonPlate.Accented: the capture plate tint. */
export function accented(hex: string): string {
  const a = hexToRgb(hex)
    .slice(0, 3)
    .map((x) => x / 255);
  const gray = 0.299 * (a[0] ?? 0) + 0.587 * (a[1] ?? 0) + 0.114 * (a[2] ?? 0);
  const muted = a.map((x) => x + (gray - x) * 0.6);
  const base = 0x58 / 255;
  let f = muted.map((x) => base + (x - base) * 0.35);
  const l = 0.299 * (f[0] ?? 0) + 0.587 * (f[1] ?? 0) + 0.114 * (f[2] ?? 0);
  if (l > 0.38) f = f.map((x) => (x * 0.38) / l);
  return `rgba(${f.map((x) => Math.round(x * 255)).join(',')},0.88)`;
}
