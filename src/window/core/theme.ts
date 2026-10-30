// GeneralSettings.SettingsTheme: the window drawn in the editor skin (Unity) or in its own Light or Dark
// palette (Palette.Skin's theme values). The site emulates the dark skin, so Unity is the dark skin.
import type { CSSProperties } from 'react';
import { hexToRgb } from './util.ts';

export type SettingsTheme = 'Unity' | 'Light' | 'Dark';

export const THEME_KEY = 'GeneralSettings.SettingsTheme';

export const asTheme = (v: unknown): SettingsTheme => (v === 'Light' || v === 'Dark' ? v : 'Unity');

/** GUI.contentColor times the style's own text colour, channel by channel. */
export function mul(a: string, b: string): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const h = (i: number) =>
    Math.round(((x[i] ?? 0) * (y[i] ?? 0)) / 255)
      .toString(16)
      .padStart(2, '0');
  return ('#' + h(0) + h(1) + h(2)).toUpperCase();
}

/** "#RRGGBB" at an alpha, as CSS. */
const wash = (hex: string, a: number) => {
  const c = hexToRgb(hex);
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
};

/**
 * Palette.Skin pairs keyed by the dark-skin value the site is drawn with: [light skin, forced Dark, forced
 * Light]. A forced theme without its own value falls back by side, Dark to the dark skin, Light to the light.
 */
const PAIRS: Record<string, [string, string?, string?]> = {
  // Page accents (Palette.Accent*).
  '#F29E2E': ['#9A5B07'],
  '#9EA8B8': ['#636A77'],
  '#EB73A6': ['#AD4571'],
  '#40B8EB': ['#167199'],
  '#8C66F2': ['#7449E8'],
  '#33D9C7': ['#0C776C'],
  '#9ED940': ['#4F7414'],
  '#BF59E6': ['#A037C9'],
  '#E6574F': ['#C4342C'],
  '#52D973': ['#207936'],
  '#598CF2': ['#3365CA'],
  '#B861EB': ['#973ECC'],
  '#F2D933': ['#796A08'],
  '#D98C4C': ['#9B5A24'],
  '#4CD9A6': ['#137556'],
  '#F2805A': ['#B04A24'],
  // Chrome a page's text or icons name directly.
  '#46607C': ['#2E6DB4', '#3671C9', '#2563EB'],
  '#87B8DE': ['#4A6E89', '#8FB9E8', '#3660A8'],
  '#58A6FF': ['#08529A', '#82B4FF', '#1D5FD6'],
  '#D9D9D9': ['#0A0A0A', '#F2F2F4', '#1A1A1F'],
  '#A6A6A6': ['#3D3D3D', '#B4B4C0', '#4F4F5B'],
  '#808080': ['#5A5A5A', '#9A9AA8', '#6D6D78'],
  '#8F8F8F': ['#6A6A6A', '#9A9AA5', '#5E5E6A'],
  '#ED8C26': ['#A45502'],
  '#9BDDAB': ['#1E6A31'],
  '#FFC76B': ['#7A4A00'],
};

/** The theme's value for a colour the site has as the dark skin's; Unity and unknown colours pass. */
export function skin(hex: string, theme: SettingsTheme): string {
  if (theme === 'Unity') return hex;
  const p = PAIRS[hex.toUpperCase()];
  if (!p) return hex;
  return theme === 'Dark' ? (p[1] ?? hex) : (p[2] ?? p[0]);
}

interface Tones {
  ground: string;
  sunken: string;
  well: string;
  card: string;
  raised: string;
  raisedHover: string;
  border: string;
  text: string;
  text2: string;
  caption: string;
  brand: string;
  brandHover: string;
  brandPress: string;
  link: string;
  linkHover: string;
  btn: string;
  btnHover: string;
  btnBorder: string;
  btnText: string;
  danger: string;
  dangerHover: string;
  dangerText: string;
  ghost: string;
  ghostHover: string;
  ghostBorder: string;
  ghostText: string;
  toggle: string;
  toggleHover: string;
  scFill: string;
  scHover: string;
  infoFill: string;
  infoBorder: string;
  infoText: string;
  /** Unity's label and miniLabel text: ThemedLabels writes TextPrimary and TextSecondary over them. */
  label: string;
  mini: string;
}

const DARK: Tones = {
  ground: '#161619',
  sunken: '#121214',
  well: '#1C1C20',
  card: '#212125',
  raised: '#2A2A30',
  raisedHover: '#333339',
  border: '#2E2E35',
  text: '#F2F2F4',
  text2: '#B4B4C0',
  caption: '#9A9AA8',
  brand: '#3671C9',
  brandHover: '#4480D8',
  brandPress: '#2A5CA8',
  link: '#82B4FF',
  linkHover: '#9CC4FF',
  btn: '#2E2E34',
  btnHover: '#3A3A41',
  btnBorder: '#101012',
  btnText: '#F2F2F4',
  danger: '#3B1D1B',
  dangerHover: '#4C2522',
  dangerText: '#F2998B',
  ghost: '#28282D',
  ghostHover: '#33333A',
  ghostBorder: '#141416',
  ghostText: '#D8D8DE',
  toggle: '#1E2A3A',
  toggleHover: '#28384E',
  scFill: '#141416',
  scHover: '#1D1D21',
  infoFill: '#1D2531',
  infoBorder: '#2C3A50',
  infoText: '#C2CEDE',
  label: '#F2F2F4',
  mini: '#B4B4C0',
};

const LIGHT: Tones = {
  ground: '#F4F4F6',
  sunken: '#ECECF0',
  well: '#EAEAEE',
  card: '#FFFFFF',
  raised: '#F6F6F9',
  raisedHover: '#EFEFF2',
  border: '#D9D9E0',
  text: '#1A1A1F',
  text2: '#4F4F5B',
  caption: '#6D6D78',
  brand: '#2563EB',
  brandHover: '#3B76F0',
  brandPress: '#1D4FC4',
  link: '#1D5FD6',
  linkHover: '#2E6FE3',
  btn: '#FFFFFF',
  btnHover: '#F4F4F6',
  btnBorder: '#C6C6D0',
  btnText: '#1A1A1F',
  danger: '#FDEAE8',
  dangerHover: '#FAD9D5',
  dangerText: '#BE3B2F',
  ghost: '#F1F1F4',
  ghostHover: '#E9E9EE',
  ghostBorder: '#D2D2DB',
  ghostText: '#2A2A33',
  toggle: '#B4B4BE',
  toggleHover: '#C2C2CB',
  scFill: '#F0F0F3',
  scHover: '#E8E8EC',
  infoFill: '#EEF4FD',
  infoBorder: '#CFE0F7',
  infoText: '#4A5160',
  label: '#1A1A1F',
  mini: '#4F4F5B',
};

/** A forced theme's custom properties; the stylesheet's own values are the Unity (dark skin) look. */
function forced(t: Tones, light: boolean): Record<string, string> {
  // Two-value Palette entries resolve by side: the dark skin's under Dark, the light skin's under Light.
  const ink = light ? '#000000' : '#FFFFFF';
  const side = (dark: string, lightSkin: string) => (light ? lightSkin : dark);
  return {
    '--w-ground': t.ground,
    '--w-sunken': t.sunken,
    '--w-well': t.well,
    '--w-card': t.card,
    '--w-raised': t.raised,
    '--w-raised-hover': t.raisedHover,
    '--w-border': t.border,
    '--w-rule': wash(ink, light ? 0.085 : 0.055),
    '--w-header-line': wash(ink, light ? 0.15 : 0.11),
    '--w-stripe': wash(ink, light ? 0.035 : 0.03),
    '--w-chip': wash(ink, light ? 0.07 : 0.032),
    '--w-chip-hover': wash(ink, light ? 0.11 : 0.05),
    '--w-hover': wash(ink, light ? 0.08 : 0.045),
    '--w-text': t.text,
    '--w-text2': t.text2,
    '--w-caption': t.caption,
    '--w-label': t.label,
    '--w-mini': t.mini,
    '--w-label-focus': t.label,
    // Tinted labels: a palette colour times the style it is drawn with.
    '--w-caption-mini': mul(t.caption, t.mini),
    '--w-caption-label': mul(t.caption, t.label),
    '--w-caption-text': mul(t.caption, t.text),
    '--w-text2-mini': mul(t.text2, t.mini),
    '--w-text-label': mul(t.text, t.label),
    '--w-text-text': mul(t.text, t.text),
    '--w-text-mini': mul(t.text, t.mini),
    '--w-ghost-mini': mul(t.ghostText, t.mini),
    '--w-link-mini': mul(t.link, t.mini),
    '--w-link-hover-mini': mul(t.linkHover, t.mini),
    '--w-link-label': mul(t.link, t.label),
    '--w-link-hover-label': mul(t.linkHover, t.label),
    // Glyphs drawn dimmer than the caption tier keep their step below it.
    '--w-glyph': mul(t.caption, '#BEBEBE'),
    '--w-glyph-off': mul(t.caption, '#909090'),
    '--w-brand': t.brand,
    '--w-brand-hover': t.brandHover,
    '--w-brand-press': t.brandPress,
    '--w-link': t.link,
    '--w-link-hover': t.linkHover,
    '--w-btn': t.btn,
    '--w-btn-hover': t.btnHover,
    '--w-btn-border': t.btnBorder,
    '--w-btn-text': t.btnText,
    '--w-danger': t.danger,
    '--w-danger-hover': t.dangerHover,
    '--w-danger-text': t.dangerText,
    '--w-ghost': t.ghost,
    '--w-ghost-hover': t.ghostHover,
    '--w-ghost-border': t.ghostBorder,
    '--w-toggle': t.toggle,
    '--w-toggle-hover': t.toggleHover,
    '--w-sc': t.scFill,
    '--w-sc-hover': t.scHover,
    '--w-info-fill': t.infoFill,
    '--w-info-border': t.infoBorder,
    '--w-info-text': t.infoText,
    '--w-key-fill': wash(ink, light ? 0.08 : 0.07),
    '--w-key-fill-dim': wash(ink, light ? 0.04 : 0.035),
    '--w-key-border': wash(ink, light ? 0.25 : 0.17),
    '--w-key-border-dim': wash(ink, light ? 0.15 : 0.1),
    '--w-warn-fill': side('rgba(71, 48, 18, 0.55)', 'rgba(243, 226, 194, 0.9)'),
    '--w-warn-border': side('rgba(255, 158, 41, 0.32)', 'rgba(196, 136, 26, 0.55)'),
    '--w-warn-text': side('#FFC76B', '#7A4A00'),
    '--w-warn-badge': side('#B8700F', '#C08211'),
    '--w-hl-fill': side('rgba(255, 235, 59, 0.14)', 'rgba(199, 154, 0, 0.22)'),
    '--w-hl-border': side('rgba(255, 235, 59, 0.75)', 'rgba(168, 131, 0, 0.95)'),
    '--w-notice': side('#212124', '#D6D6D8'),
    '--w-notice-border': wash(ink, light ? 0.22 : 0.13),
    '--w-track': wash(ink, light ? 0.14 : 0.1),
    '--w-orange': side('#ED8C26', '#A45502'),
    '--w-done': side('#52D973', '#207936'),
    '--w-done-glyph': side('#0F2417', '#FFFFFF'),
    '--w-box-fill': wash(ink, light ? 0.06 : 0.04),
    '--w-box-border': wash(ink, light ? 0.35 : 0.26),
    '--w-row-wash': wash(ink, light ? 0.07 : 0.045),
    '--w-text-half': wash(t.text, 0.5),
    '--w-pie-accent': side('#598CF2', '#3365CA'),
  };
}

const VARS: Record<SettingsTheme, CSSProperties> = {
  Unity: {},
  Dark: forced(DARK, false),
  Light: forced(LIGHT, true),
};

/** The window root's custom properties for a theme; none for Unity, whose look is the stylesheet's own. */
export const themeVars = (theme: SettingsTheme): CSSProperties => VARS[theme];

/** The palette tones a theme draws with, for colours set from code. */
export function tones(theme: SettingsTheme): Tones | null {
  return theme === 'Dark' ? DARK : theme === 'Light' ? LIGHT : null;
}
