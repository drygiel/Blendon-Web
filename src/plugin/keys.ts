// Live keys in tooltip text, ported from the plugin's TipText. {key:shortcut id} becomes the binding the
// shortcut has right now, {setting:Class.Property} the key a modifier setting holds. Filled in when a card is
// shown, so a rebind, the other keyboard preset or a changed modifier reads right at once.
import type { KeyboardPreset, Keys, PropInfo, PropValue, Tip } from './schema.ts';

// Tip.KeyOpen / Tip.KeyEnd / Tip.NoKey.
export const KEY_OPEN = '<b><color=#D98E38>';
export const KEY_END = '</color></b>';
export const NO_KEY = '<color=#92929A>no key</color>';

const KEY_REF = '{key:';
const SETTING_REF = '{setting:';

/** A setting as the resolver reads it: its C# type name, current value and enum options ([value, label]). */
export interface SettingValue {
  k: string;
  v: PropValue;
  o?: [string, string][];
}

/** The live state cards read. Each version must change whenever anything it covers changes. */
export interface TokenSource {
  readonly keysVersion: number;
  readonly settingsVersion: number;
  /** The binding a shortcut has now, "" when it has none; undefined for an id that doesn't exist. */
  binding(id: string): string | undefined;
  /** A setting by "Class.Property"; undefined when there is no such setting. */
  setting(path: string): SettingValue | undefined;
}

/** The one way a card spells a key: the binding's own text, or a dim "no key" when it has none. */
export function keyText(binding: string): string {
  return binding.length === 0 ? NO_KEY : KEY_OPEN + binding + KEY_END;
}

/** One preset's binding from a Keys pair. */
export function presetKey(keys: Keys | undefined, preset: KeyboardPreset): string | undefined {
  return keys && (preset === 'Unity' ? keys.u : keys.b);
}

const warned = new Set<string>();

// A typo or a shortcut that is gone: the token stays in sight so the card reads as broken.
function unknown(token: string): string {
  if (!warned.has(token)) {
    warned.add(token);
    console.warn(`Blendon: tooltip names ${token}, which does not exist.`);
  }
  return token;
}

const inner = (token: string, prefix: string) =>
  token.startsWith(prefix) ? token.slice(prefix.length, token.length - 1) : null;

// ModifierKey.None reads as no key, a modifier by its display name ("Action" is "Ctrl").
function settingText(s: SettingValue): string {
  if (s.k === 'ModifierKey') return s.v === 'None' ? '' : (s.o?.find((o) => o[0] === s.v)?.[1] ?? String(s.v));
  if (typeof s.v === 'boolean') return s.v ? 'True' : 'False';
  return String(s.v);
}

/** Fills every token once, uncached. Anything else in braces ("{0}", "{mod:Ctrl}") is left as it is. */
export function fillTokens(text: string, source: TokenSource): { text: string; readsSettings: boolean } {
  let readsSettings = false;
  const token = (t: string): string | null => {
    const id = inner(t, KEY_REF);
    if (id !== null) {
      const binding = source.binding(id);
      return binding === undefined ? unknown(t) : keyText(binding);
    }
    const path = inner(t, SETTING_REF);
    if (path === null) return null;
    const dot = path.lastIndexOf('.');
    const setting = dot > 0 ? source.setting(path) : undefined;
    if (!setting) return unknown(t);
    readsSettings = true;
    return keyText(settingText(setting));
  };

  let out = '';
  let start = 0;
  for (let open = text.indexOf('{'); open >= 0; open = text.indexOf('{', start)) {
    const close = text.indexOf('}', open);
    if (close < 0) break;
    const t = text.slice(open, close + 1);
    out += text.slice(start, open) + (token(t) ?? t);
    start = close + 1;
  }
  return { text: out + text.slice(start), readsSettings };
}

/**
 * Fills cards against a live source, keeping each filled text until the keys move, or the settings move and
 * a filled text read one (a slider drag writes a setting every frame).
 */
export class TipResolver {
  private readonly source: TokenSource;
  private readonly filled = new Map<string, string>();
  private keysVersion = -1;
  private settingsVersion = -1;
  private readsSettings = false;
  private ver = 0;

  constructor(source: TokenSource) {
    this.source = source;
  }

  /** Bumped whenever a filled-in text may read differently, for holders of a copy. */
  get version(): number {
    this.sync();
    return this.ver;
  }

  resolve(text: string): string {
    if (!text.includes('{')) return text;
    this.sync();
    const hit = this.filled.get(text);
    if (hit !== undefined) return hit;
    const r = fillTokens(text, this.source);
    if (r.readsSettings) this.readsSettings = true;
    this.filled.set(text, r.text);
    return r.text;
  }

  /** The card as shown now. */
  tip(tip: Tip): Tip {
    return { t: this.resolve(tip.src ?? tip.t), i: tip.i };
  }

  private sync() {
    const settingsMoved = this.source.settingsVersion !== this.settingsVersion;
    this.settingsVersion = this.source.settingsVersion;
    if (this.source.keysVersion === this.keysVersion && !(settingsMoved && this.readsSettings)) return;
    this.keysVersion = this.source.keysVersion;
    this.readsSettings = false;
    this.filled.clear();
    this.ver++;
  }
}

/** A fixed source: one preset's keys from the keymap and every setting at its default. */
export function presetSource(
  data: { keymap: Record<string, Keys>; props: Record<string, PropInfo> },
  preset: KeyboardPreset,
): TokenSource {
  return {
    keysVersion: 0,
    settingsVersion: 0,
    binding: (id) => presetKey(data.keymap[id], preset),
    setting: (path) => {
      const p = data.props[path];
      return p && { k: p.k, v: p.d, o: p.o };
    },
  };
}
