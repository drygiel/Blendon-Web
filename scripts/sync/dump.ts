// The Unity dump `pnpm sync` reads (Metadata~/PlaygroundRef, or BLENDON_REF): schema 2, written by the plugin's
// BlendonWebExport on its isolated preferences and a fake shortcut manager. Every file is shape-checked before
// anything is built from it, so a dump from an older exporter fails with a list instead of half a site.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContestState, ContextNeed, PropValue, Tip } from '../../src/plugin/schema.ts';

export const DUMP_SCHEMA = 2;

/** TipCard: `text` as shown on the Blendon preset, `source` as written, {key:} and {setting:} tokens in. */
export interface DumpCard {
  text: string;
  image: string;
  source: string;
}
export interface DumpKeys {
  blendon: string;
  unity: string;
}
export interface DumpMeta {
  schema: number;
  unity: string;
  exportedAt: string;
  counts: { pages: number; props: number; ids: number; known: number };
}
export interface DumpProp {
  name: string;
  ptype: string;
  label: string;
  icon?: string;
  tip: DumpCard;
  value: PropValue;
  default: PropValue;
  options?: string[];
  /** A slider's bounds, from the declaration. */
  min?: number;
  max?: number;
  /** A key row's shortcut id. */
  shortcut?: string;
  /** The setting a row with an Override box reads until ticked, as "Class.Name". */
  follows?: string;
}
export interface DumpHeader {
  image: string;
  video: string;
  footer?: string;
  sections: [string, string][];
  keys: { action: string; active: boolean; bindings: DumpKeys[] }[];
}
export interface Model1 {
  pages: { type: string; switchTip: DumpCard; header?: DumpHeader; props: DumpProp[] }[];
}
export interface DumpRow {
  UnityId: string;
  UnityLabel: string;
  BlendonId: string;
  BlendonLabel: string;
  Key: string;
  Replaces: boolean;
}
export interface DumpShortcut {
  id: string;
  name: string;
  keys: DumpKeys;
  text: string;
  tip: DumpCard;
}
export interface Model2 {
  consts: Record<string, string>;
  pageShortcuts: Record<string, { enabled: boolean; full: boolean; primary: string | null; ids: DumpShortcut[] }>;
  keymap: Record<string, DumpKeys>;
  /** ContextNeedOf of each gated Blendon id, None left out. */
  contextNeed: Record<string, ContextNeed>;
  /** The Blendon Context Only switch ("Type.Prop") that keeps each id to the tool context when on. */
  contextOnly: Record<string, string>;
  known: {
    row: DumpRow;
    editorKey: string;
    blendonAlt: string;
    editorAlt: string;
    cards: Record<ContestState, DumpCard>;
  }[];
  resolutions: (DumpRow & { known: boolean })[];
  featureTips: Record<string, DumpCard | null>;
  /** The Overview text links that carry a card, by tip key. */
  linkTips: Record<string, DumpCard>;
}
export interface DumpPie {
  id: string;
  title: string;
  icon: string;
  shortcutId: string;
  text: string;
  keys: DumpKeys;
  enabled: boolean;
  filled: number;
  desc: string;
  tipGet: DumpCard;
  tipRow: DumpCard;
}
export interface DumpExtra {
  Section: string;
  Label: string;
  InlineSetting_null: boolean;
  Tip: DumpCard;
  InlineTip: DumpCard;
}
export interface Model3 {
  pies: DumpPie[];
  extras: DumpExtra[];
  frameSteps: [string, boolean][];
  modifierLabels: string[];
  modifierOptions: string[];
  enums: Record<string, [string, string][]>;
  layers: string[];
}
export interface Dump {
  meta: DumpMeta;
  m1: Model1;
  m2: Model2;
  m3: Model3;
}

// ---- problems ------------------------------------------------------------------------------------

/** Everything wrong with one sync run, gathered so a single run lists all of it. */
export class Problems {
  private readonly groups = new Map<string, { count: number; example: string }>();
  private readonly order: string[] = [];

  add(message: string, example = '') {
    const g = this.groups.get(message);
    if (g) {
      g.count++;
      return;
    }
    this.groups.set(message, { count: 1, example });
    this.order.push(message);
  }

  /** Runs a step, filing what it throws under a label instead of stopping the run. */
  guard<T>(label: string, step: () => T): T | undefined {
    try {
      return step();
    } catch (e) {
      this.add(label + ': ' + (e instanceof Error ? e.message : String(e)));
      return undefined;
    }
  }

  get count(): number {
    return this.order.length;
  }

  lines(): string[] {
    return this.order.map((m) => {
      const g = this.groups.get(m);
      if (!g?.example) return m;
      return g.count === 1 ? `${m} (at ${g.example})` : `${m} (${g.count}x, first at ${g.example})`;
    });
  }
}

// ---- shape checks --------------------------------------------------------------------------------

/** A check files a problem per mismatch; `at` is the real path, `like` the same with indexes and keys elided. */
type Check = (v: unknown, at: string, like: string, out: Problems) => void;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const kind = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function mismatch(out: Problems, like: string, at: string, v: unknown, want: string) {
  out.add(`${like}: ${v === undefined ? 'missing' : `expected ${want}, got ${kind(v)}`}`, at);
}

const prim =
  (want: 'string' | 'boolean' | 'number'): Check =>
  (v, at, like, out) => {
    if (typeof v !== want) mismatch(out, like, at, v, want);
  };
const str = prim('string');
const bool = prim('boolean');
const num = prim('number');
const value: Check = (v, at, like, out) => {
  if (!['string', 'boolean', 'number'].includes(typeof v)) mismatch(out, like, at, v, 'a value');
};
const optional =
  (c: Check): Check =>
  (v, at, like, out) => {
    if (v !== undefined) c(v, at, like, out);
  };
const nullable =
  (c: Check): Check =>
  (v, at, like, out) => {
    if (v !== null) c(v, at, like, out);
  };
const arr =
  (c: Check): Check =>
  (v, at, like, out) => {
    if (!Array.isArray(v)) return mismatch(out, like, at, v, 'array');
    v.forEach((x, i) => c(x, `${at}[${i}]`, like + '[]', out));
  };
const tuple =
  (...cs: Check[]): Check =>
  (v, at, like, out) => {
    if (!Array.isArray(v) || v.length !== cs.length) return mismatch(out, like, at, v, `[${cs.length}]`);
    cs.forEach((c, i) => c(v[i], `${at}[${i}]`, `${like}[${i}]`, out));
  };
const rec =
  (c: Check): Check =>
  (v, at, like, out) => {
    if (!isObj(v)) return mismatch(out, like, at, v, 'object');
    for (const [k, x] of Object.entries(v)) c(x, `${at}.${k}`, like + '.*', out);
  };
const obj =
  (shape: Record<string, Check>): Check =>
  (v, at, like, out) => {
    if (!isObj(v)) return mismatch(out, like, at, v, 'object');
    for (const [k, c] of Object.entries(shape)) c(v[k], `${at}.${k}`, `${like}.${k}`, out);
  };

const card = obj({ text: str, image: str, source: str });
const contextNeed: Check = (v, at, like, out) => {
  if (v !== 'Always' && v !== 'WhenCovering') mismatch(out, like, at, v, 'Always or WhenCovering');
};
const keys = obj({ blendon: str, unity: str });
const row = obj({ UnityId: str, UnityLabel: str, BlendonId: str, BlendonLabel: str, Key: str, Replaces: bool });

const META = obj({
  schema: num,
  unity: str,
  exportedAt: str,
  counts: obj({ pages: num, props: num, ids: num, known: num }),
});
const MODEL1 = obj({
  pages: arr(
    obj({
      type: str,
      switchTip: card,
      header: optional(
        obj({
          image: str,
          video: str,
          footer: optional(str),
          sections: arr(tuple(str, str)),
          keys: arr(obj({ action: str, active: bool, bindings: arr(keys) })),
        }),
      ),
      props: arr(
        obj({
          name: str,
          ptype: str,
          label: str,
          icon: optional(str),
          tip: card,
          value,
          default: value,
          options: optional(arr(str)),
          min: optional(num),
          max: optional(num),
          shortcut: optional(str),
          follows: optional(str),
        }),
      ),
    }),
  ),
});
const MODEL2 = obj({
  consts: rec(str),
  pageShortcuts: rec(
    obj({
      enabled: bool,
      full: bool,
      primary: nullable(str),
      ids: arr(obj({ id: str, name: str, keys, text: str, tip: card })),
    }),
  ),
  keymap: rec(keys),
  contextNeed: rec(contextNeed),
  contextOnly: rec(str),
  known: arr(
    obj({
      row,
      editorKey: str,
      blendonAlt: str,
      editorAlt: str,
      cards: obj({ Covered: card, Replaced: card, Moved: card, Free: card }),
    }),
  ),
  resolutions: arr((v, at, like, out) => {
    row(v, at, like, out);
    if (isObj(v)) bool(v.known, at + '.known', like + '.known', out);
  }),
  featureTips: rec(nullable(card)),
  linkTips: rec(card),
});
const MODEL3 = obj({
  pies: arr(
    obj({
      id: str,
      title: str,
      icon: str,
      shortcutId: str,
      text: str,
      keys,
      enabled: bool,
      filled: num,
      desc: str,
      tipGet: card,
      tipRow: card,
    }),
  ),
  extras: arr(obj({ Section: str, Label: str, InlineSetting_null: bool, Tip: card, InlineTip: card })),
  frameSteps: arr(tuple(str, bool)),
  modifierLabels: arr(str),
  modifierOptions: arr(str),
  enums: rec(arr(tuple(str, str))),
  layers: arr(str),
});

/** Shape problems of one parsed file, by contract. Exported for the tests. */
export function checkShape(name: 'meta' | 'model' | 'model2' | 'model3', v: unknown, out: Problems): void {
  const c = { meta: META, model: MODEL1, model2: MODEL2, model3: MODEL3 }[name];
  c(v, name + '.json', name + '.json', out);
}

function readJson(path: string, out: Problems): unknown {
  if (!existsSync(path)) {
    out.add(`${path}: missing`);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (e) {
    out.add(`${path}: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

/** A dump card as the site's Tip: `src` only when the card has tokens, so most cards stay one text. */
export function toTip(card: { text: string; image: string; source?: string }): Tip {
  const tip: Tip = { t: card.text, i: card.image };
  if (card.source !== undefined && card.source !== card.text) tip.src = card.source;
  return tip;
}

// Read without trusting the shape, so the C# pages convert even against a dump that breaks the contract.
function looseShortcutTips(m2: unknown): Record<string, Tip> {
  const tips: Record<string, Tip> = {};
  const pages = isObj(m2) && isObj(m2.pageShortcuts) ? Object.values(m2.pageShortcuts) : [];
  for (const p of pages) {
    const ids = isObj(p) && Array.isArray(p.ids) ? (p.ids as unknown[]) : [];
    for (const s of ids) {
      if (!isObj(s) || typeof s.id !== 'string' || !isObj(s.tip)) continue;
      const { text, image, source } = s.tip;
      tips[s.id] = toTip({
        text: typeof text === 'string' ? text : '',
        image: typeof image === 'string' ? image : '',
        source: typeof source === 'string' ? source : undefined,
      });
    }
  }
  return tips;
}

export interface LoadedDump {
  /** Null when anything in the folder breaks the contract; the problems say what. */
  dump: Dump | null;
  /** The constants and shortcut cards, handed back even then so the C# pages can still be checked. */
  consts: Record<string, string>;
  shortcutTips: Record<string, Tip>;
}

/** Reads and checks a dump folder. */
export function loadDump(dir: string, out: Problems): LoadedDump {
  const before = out.count;
  const meta = readJson(join(dir, 'meta.json'), out);
  if (meta !== undefined) {
    checkShape('meta', meta, out);
    const schema = isObj(meta) ? meta.schema : undefined;
    if (typeof schema === 'number' && schema !== DUMP_SCHEMA)
      out.add(`meta.json: schema ${schema}, this sync reads schema ${DUMP_SCHEMA}`);
  }
  const m1 = readJson(join(dir, 'model.json'), out);
  if (m1 !== undefined) checkShape('model', m1, out);
  const m2 = readJson(join(dir, 'model2.json'), out);
  if (m2 !== undefined) checkShape('model2', m2, out);
  const m3 = readJson(join(dir, 'model3.json'), out);
  if (m3 !== undefined) checkShape('model3', m3, out);
  if (!existsSync(join(dir, 'ui', 'ui.json'))) out.add(`${join(dir, 'ui', 'ui.json')}: missing`);

  const rawConsts = isObj(m2) && isObj(m2.consts) ? m2.consts : {};
  const consts = Object.fromEntries(
    Object.entries(rawConsts).filter((e): e is [string, string] => typeof e[1] === 'string'),
  );
  const shortcutTips = looseShortcutTips(m2);
  if (out.count > before) return { dump: null, consts, shortcutTips };
  const dump = { meta: meta as DumpMeta, m1: m1 as Model1, m2: m2 as Model2, m3: m3 as Model3 };
  return { dump, consts, shortcutTips };
}
