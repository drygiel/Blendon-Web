// Turns parsed page view bodies (the plugin's <Page>Page.Draw methods) into the settings window's op lists
// (see src/plugin/schema.ts).
import type { Cond, Op, Tip } from '../../src/plugin/schema.ts';
import { splitArgs, stringConcat, type Stmt } from './csharp.ts';

// Expressions that hold a settings object, by the class they hold. A view reads its model through one of these.
const MODELS: Record<string, string> = {
  General: 'GeneralSettings',
  'GeneralSettings.Instance': 'GeneralSettings',
  'SharedGizmoSettings.Instance': 'SharedGizmoSettings',
  'MoveGizmo.Instance.Settings': 'MoveGizmoSettings',
  'RotateGizmo.Instance.Settings': 'RotateGizmoSettings',
  'ScaleGizmo.Instance.Settings': 'ScaleGizmoSettings',
  'TransformGizmo.Instance.Settings': 'TransformGizmoSettings',
  'OrbitSelected.Settings': 'OrbitSelectedSettings',
  'Pan.Settings': 'PanSettings',
  'Zoom.Settings': 'ZoomSettings',
  'ViewportNav.Settings': 'ViewportNavSettings',
  'OrientationGizmo.Settings': 'OrientationGizmoSettings',
  'FrameSelected.Settings': 'FrameSelectedSettings',
  'IsolateView.Settings': 'IsolateViewSettings',
  'SnapToFloor.Settings': 'SnapToFloorSettings',
  'BoxSelect.Settings': 'BoxSelectSettings',
  'SelectionHistory.Settings': 'HistorySettings',
  'ViewHistory.Settings': 'ViewHistorySettings',
  'PieMenu.Settings': 'PieMenuSettings',
  'WireframeToggle.Settings': 'WireframeToggleSettings',
  'SceneMenu.Settings': 'SceneMenuSettings',
};

/** The settings class behind each page with a switch of its own. */
export const PAGE_OWNER: Record<string, string> = {
  OrbitSelected: 'OrbitSelectedSettings',
  Pan: 'PanSettings',
  Zoom: 'ZoomSettings',
  ViewportNav: 'ViewportNavSettings',
  OrientationGizmo: 'OrientationGizmoSettings',
  MoveGizmo: 'MoveGizmoSettings',
  RotateGizmo: 'RotateGizmoSettings',
  ScaleGizmo: 'ScaleGizmoSettings',
  TransformGizmo: 'TransformGizmoSettings',
  FrameSelected: 'FrameSelectedSettings',
  IsolateView: 'IsolateViewSettings',
  SnapToFloor: 'SnapToFloorSettings',
  BoxSelect: 'BoxSelectSettings',
  SceneMenu: 'SceneMenuSettings',
};

// The page an inherited row links to, by the class of the setting it follows.
const OWNER_PAGE: Record<string, string> = {
  ...Object.fromEntries(Object.entries(PAGE_OWNER).map(([page, owner]) => [owner, page])),
  GeneralSettings: 'Overview',
  SharedGizmoSettings: 'SharedGizmos',
};

// The class whose constants a bare identifier resolves to, per owner type.
const CONST_CLASS: Record<string, string> = {
  HistorySettings: 'HistorySettings',
  SelectionHistorySettings: 'HistorySettings',
  TransformMoveSettings: 'MoveGizmoSettings',
  TransformRotateSettings: 'RotateGizmoSettings',
  TransformScaleSettings: 'ScaleGizmoSettings',
};

const NUMBER_NAMES: Record<string, number> = {
  MinQuality: 0.1,
  MaxQuality: 6,
  MinOutlineWidth: 0.5,
  MaxOutlineWidth: 3,
  MinSnapTickLength: 0.01,
  MaxSnapTickLength: 0.3,
  'Zoom.MinStep': 0.01,
  'Zoom.MaxStep': 0.9,
};

/** What the Unity dump knows about a setting that its drawing call no longer spells out. */
export interface PropFacts {
  /** A slider's bounds, from the declaration. */
  range(prop: string): [number, number] | undefined;
  /** The setting a row with an Override box reads until ticked. */
  follows(prop: string): string | undefined;
  /** A key row's shortcut. */
  shortcut(prop: string): string | undefined;
  /** The key row a settings class draws for a shortcut. */
  binding(owner: string, shortcutId: string): string | undefined;
}

export const NO_FACTS: PropFacts = {
  range: () => undefined,
  follows: () => undefined,
  shortcut: () => undefined,
  binding: () => undefined,
};

export type Helper = (ctx: Ctx, args: string[]) => Op[];

/** The helper a call needs, looked up when the call is met (another view's Draw method, a table...). */
export type Helpers = (fn: string, ctx: Ctx) => Helper | undefined;

export class Ctx {
  readonly alias: Record<string, string | null> = {};
  /** Local names holding a settings object, by the class they hold. */
  readonly models: Record<string, string>;
  readonly owner: string;
  /** The view class the body is written in, whose own constants come first. */
  readonly view: string;
  readonly consts: Record<string, string>;
  readonly facts: PropFacts;
  /** Each shortcut's own card, as written (tokens in), for rows that take the label from the call. */
  readonly shortcutTips: Record<string, Tip>;

  constructor(
    owner: string,
    consts: Record<string, string>,
    shortcutTips: Record<string, Tip> = {},
    options: { view?: string; facts?: PropFacts; models?: Record<string, string> } = {},
  ) {
    this.owner = owner;
    this.consts = consts;
    this.shortcutTips = shortcutTips;
    this.view = options.view ?? owner;
    this.facts = options.facts ?? NO_FACTS;
    this.models = { ...options.models };
  }

  shortcutTip(id: string): Tip {
    const tip = this.shortcutTips[id];
    if (!tip) throw new Error('No card for shortcut ' + id + ' in the dump');
    return tip;
  }

  /** A constant by C# name, resolved against the view and then the owner's class like the compiler would. */
  constant(name: string, owner = this.owner): string {
    if (name.startsWith('"')) return stringConcat(name) ?? '';
    if (name.includes('.')) {
      const v = this.consts[name];
      if (v === undefined) throw new Error('Unknown constant ' + name);
      return v;
    }
    for (const cls of [this.view, CONST_CLASS[owner] ?? owner, owner]) {
      const v = this.consts[cls + '.' + name];
      if (v !== undefined) return v;
    }
    throw new Error('Unknown constant ' + owner + '.' + name);
  }

  constantOr(name: string, fallback: string, owner = this.owner): string {
    try {
      return this.constant(name, owner);
    } catch {
      return fallback;
    }
  }

  /** The class a settings object expression holds: a local, a static instance, or a Transform part. */
  modelOf(expr: string): string | undefined {
    const e = expr.trim();
    const local = this.models[e] ?? MODELS[e];
    if (local) return local;
    const part = /^(.+)\.(Move|Rotate|Scale)$/.exec(e);
    if (part && this.modelOf(part[1] ?? '') === 'TransformGizmoSettings') return 'Transform' + part[2] + 'Settings';
    return undefined;
  }

  /** A setting as "Type.Prop": a declaration ("m.DepthSetting"), a property on a model, or a local alias. */
  prop(expr: string): string {
    const e = expr.trim().replace(/^\(\)\s*=>\s*/, '');
    const alias = this.alias[e];
    if (alias) return alias;
    const dot = e.lastIndexOf('.');
    if (dot > 0) {
      const model = this.modelOf(e.slice(0, dot));
      if (model) return model + '.' + e.slice(dot + 1).replace(/(.)Setting$/, '$1');
    }
    if (/^\w+$/.test(e)) return this.owner + '.' + e;
    throw new Error('Unresolved property ' + e);
  }
}

// ---- boolean expressions ----------------------------------------------------------------------

function tokenize(e: string): string[] {
  return e.match(/&&|\|\||==|!=|!|\(|\)|is \{ \} \w+|[\w.]+\(\)|[\w.]+(?:\([^()]*\))?/g) ?? [];
}

export function cond(ctx: Ctx, expr: string): Cond {
  const e = expr.trim().replace(/^new EditorGUI\.DisabledScope\((.*)\)$/, '$1');
  const toks = tokenize(e);
  let pos = 0;
  const peek = () => toks[pos];
  const take = () => toks[pos++] ?? '';

  const atom = (): Cond => {
    const t = take();
    if (t === '!') return ['!', atom()];
    if (t === '(') {
      const v = or();
      take();
      return v;
    }
    if (/^(ModifierKey|BoxSelectUpdate|BoxSelectHighlightStyle|BoxSelectInfo|SnapDirection)\.\w+$/.test(t))
      return ['c', t.split('.')[1] ?? ''];
    if (t === 'NumLockState.IsOff') return ['c', false];
    // GeneralSettings.ColorsEditable is Enabled under another name.
    if (/^(?:\w+\.)?ColorsEditable$/.test(t)) return ['v', 'GeneralSettings.Enabled'];
    if (/^(?:\w+\.)?AnyToolEnabled$/.test(t)) return ['f', 'anyTool'];
    if (t.endsWith('.SupportsBounds()'))
      return ['f', 'supportsBounds', ['v', ctx.prop(t.slice(0, -'.SupportsBounds()'.length))]];
    if (t.endsWith('.WrapsAtEdge()'))
      return ['f', 'wrapsAtEdge', ['v', ctx.prop(t.slice(0, -'.WrapsAtEdge()'.length))]];
    const clash = /^(?:SharedGizmoSettings\.)?AimModifierClash\((.*)\)$/.exec(t);
    if (clash) {
      if (peek()?.startsWith('is {')) take();
      return ['f', 'aimClash', ['v', ctx.prop(clash[1] ?? '')]];
    }
    if (t === '0') return ['c', 0];
    return ['v', ctx.prop(t)];
  };
  const cmp = (): Cond => {
    let a = atom();
    while (peek() === '==' || peek() === '!=') {
      const op = take() as '==' | '!=';
      a = [op, a, atom()];
    }
    return a;
  };
  const and = (): Cond => {
    let a = cmp();
    while (peek() === '&&') {
      take();
      a = ['&&', a, cmp()];
    }
    return a;
  };
  const or = (): Cond => {
    let a = and();
    while (peek() === '||') {
      take();
      a = ['||', a, and()];
    }
    return a;
  };
  return or();
}

// ---- statements -------------------------------------------------------------------------------

function call(text: string): [string, string[]] | null {
  const m = /^(?:var \w+ = |if \()?\s*([\w.]+)\((.*)\)\s*$/.exec(text);
  return m ? [m[1] ?? '', splitArgs(m[2] ?? '')] : null;
}

export function num(s: string): number {
  const t = s.trim().replace(/f+$/, '');
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return Number(t);
  const v = NUMBER_NAMES[t];
  if (v === undefined) throw new Error('Unknown number ' + s);
  return v;
}

const bodyOf = (st: Stmt): Stmt[] => (st[0] === 'block' ? st[1] : [st]);
const lastName = (s: string) => s.split('.').pop() ?? '';

// Rows whose value a later statement reads through the name the view assigned it to.
const VALUE_OPS = new Set(['tog', 'gtog', 'pop', 'gpop', 'imod', 'sld', 'gsld', 'col']);

export function convert(ctx: Ctx, stmts: Stmt[], helpers: Helpers): Op[] {
  const ops: Op[] = [];
  let i = 0;
  while (i < stmts.length) {
    const st = stmts[i++];
    if (!st) break;
    if (st[0] === 'block') {
      ops.push(...convert(ctx, st[1], helpers));
      continue;
    }
    if (st[0] === 'using') {
      ops.push(['dis', cond(ctx, st[1]), convert(ctx, bodyOf(st[2]), helpers)]);
      continue;
    }
    if (st[0] === 'if') {
      const c = st[1];
      if (c === '!s.BeginAppearance()') {
        // Everything up to EndAppearance belongs to the fold.
        const rest: Stmt[] = [];
        let j = i;
        for (; j < stmts.length; j++) {
          const sj = stmts[j];
          if (!sj || (sj[0] === 'stmt' && sj[1] === 's.EndAppearance()')) break;
          rest.push(sj);
        }
        ops.push(['fold', 'Appearance', convert(ctx, rest, helpers)]);
        i = j + 1;
        continue;
      }
      const numLock = /^s\.Toggle\((.*)\) && NumLockState\.IsOff$/.exec(c);
      if (numLock) {
        ops.push(['tog', ctx.prop(splitArgs(numLock[1] ?? '')[0] ?? '')]);
        continue;
      }
      const elseOps = st[3] ? convert(ctx, bodyOf(st[3]), helpers) : null;
      ops.push(['if', cond(ctx, c), convert(ctx, bodyOf(st[2]), helpers), elseOps]);
      continue;
    }
    const text = st[1];
    if (text === 'return' || text === 's.EndAppearance()') continue;
    const assign = /^var (\w+) = (.*)$/.exec(text);
    if (assign) {
      const name = assign[1] ?? '';
      const value = assign[2] ?? '';
      // A local holding a settings object: "var m = Pan.Settings", "var shared = SharedGizmoSettings.Instance".
      const model = ctx.modelOf(value);
      if (model) {
        ctx.models[name] = model;
        continue;
      }
      if (value.startsWith('s.')) {
        const sub = convert(ctx, [['stmt', value]], helpers);
        ops.push(...sub);
        const last = sub[sub.length - 1];
        if (last && VALUE_OPS.has(last[0])) ctx.alias[name] = last[1] as string;
        if (last && last[0] === 'prev') ctx.alias[name] = null;
        continue;
      }
      // A switch read once for the scope below it: "var enabled = m.Enabled".
      if (/^[\w.]+$/.test(value)) {
        ctx.alias[name] = ctx.prop(value);
        continue;
      }
      // Preview geometry the site lays out on its own.
      if (name === 'extent') continue;
    }
    if (text.startsWith('_pending')) continue;
    const parsed = call(text);
    if (!parsed) throw new Error('Unrecognised statement: ' + text);
    ops.push(...callOps(ctx, parsed[0], parsed[1], text, helpers));
  }
  return ops;
}

// One row drawn from a declaration. A row with an Override box (a Mirrored setting) reads its source until ticked.
function row(ctx: Ctx, fn: string, arg: string): Op[] {
  const prop = ctx.prop(arg);
  const source = ctx.facts.follows(prop);
  const general = source?.startsWith('GeneralSettings.');
  switch (fn) {
    case 's.Toggle':
      if (source && !general) throw new Error('No row for ' + prop + ', which follows ' + source);
      return [source ? ['gtog', prop, source] : ['tog', prop]];
    case 's.EnumPopup':
      if (source && !general) throw new Error('No row for ' + prop + ', which follows ' + source);
      return [source ? ['gpop', prop, source] : ['pop', prop]];
    case 's.ModifierField': {
      if (!source) return [['pop', prop]];
      if (general) return [['gpop', prop, source]];
      const page = OWNER_PAGE[source.split('.')[0] ?? ''];
      if (!page) throw new Error('No page for ' + source + ', which ' + prop + ' follows');
      return [['imod', prop, source, page]];
    }
    case 's.Slider': {
      const range = ctx.facts.range(prop);
      if (!range) throw new Error('No range for slider ' + prop + ' in the dump');
      if (source && !general) throw new Error('No row for ' + prop + ', which follows ' + source);
      return [source ? ['gsld', prop, source, range[0], range[1]] : ['sld', prop, range[0], range[1]]];
    }
    case 's.ColorField':
      if (source) throw new Error('No row for ' + prop + ', which follows ' + source);
      return [['col', prop]];
    default:
      if (source) throw new Error('No row for ' + prop + ', which follows ' + source);
      return [['msk', prop]];
  }
}

function callOps(ctx: Ctx, fn: string, args: string[], text: string, helpers: Helpers): Op[] {
  const o = ctx.owner;
  const a = (n: number) => args[n] ?? '';
  switch (fn) {
    case 's.SubLabel': {
      const title = stringConcat(a(0)) ?? '';
      let icon = args.length > 1 && a(1).startsWith('"') ? (stringConcat(a(1)) ?? '') : '';
      if (args.length > 1 && !a(1).startsWith('"') && !a(1).startsWith('minWidth')) icon = ctx.constant(a(1));
      let space: number | ['previewSpace', number, number] = 15;
      let minWidth: number | string = 0;
      for (const x of args.slice(2)) {
        if (x.startsWith('minWidth:')) {
          const v = x.split(':').slice(1).join(':').trim();
          const named: Record<string, number> = { ListMinWidth: 572, 'OverviewContestedTable.MinWidth': 0 };
          minWidth = v.includes('FullWidth') ? 1e9 : (named[v] ?? v);
        } else if (x.includes('preview')) space = ['previewSpace', 15, 11];
        else space = num(x);
      }
      return [['sub', title, icon, space, minWidth]];
    }
    case 's.Toggle':
    case 's.EnumPopup':
    case 's.ModifierField':
    case 's.Slider':
    case 's.ColorField':
    case 's.LayerMaskField':
      return row(ctx, fn, a(0));
    case 's.ContextOnlyToggle': {
      // SettingsControls.ContextOnlyToggle: the row, noted while Blendon never enters its context by itself.
      const prop = ctx.prop(a(0));
      const note = ctx.constant('SettingsControls.NoContextNote');
      const tip = ctx.constant('SettingsControls.NoContextTip');
      return [
        ['tog', prop],
        ['if', ['&&', ['v', prop], ['!', ['f', 'anyTool']]], [['note', note, tip]], null],
      ];
    }
    case 's.ShortcutField':
      if (args.length === 1) {
        // A key row declared on the page: its label and card are the setting's, its shortcut the dump's.
        const prop = ctx.prop(a(0));
        const id = ctx.facts.shortcut(prop);
        if (!id) throw new Error('No shortcut for key row ' + prop + ' in the dump');
        return [['sc', id, prop]];
      }
      if (args.length === 2) {
        // ShortcutRows passes the shortcut's own card as written, so the site resolves its keys live.
        const id = ctx.constant(a(1));
        const tip = ctx.shortcutTip(id);
        return [['sc', id, null, stringConcat(a(0)) ?? '', tip.src ?? tip.t, tip.i]];
      }
      return [
        [
          'sc',
          ctx.constant(a(2)),
          null,
          stringConcat(a(0)) ?? '',
          ctx.constantOr(a(1), ''),
          args.length > 3 ? ctx.constant(a(3)) : '',
        ],
      ];
    case 's.MirroredShortcut': {
      // The owning page's key row, grayed with that page.
      const page = lastName(a(0));
      const id = ctx.constant(a(1));
      const owner = PAGE_OWNER[page];
      const prop = owner ? ctx.facts.binding(owner, id) : undefined;
      if (!prop) throw new Error('No key row for ' + id + ' on page ' + page);
      return [['dis', ['!', ['f', 'pageEnabled', page]], [['sc', id, prop]]]];
    }
    case 's.NativeCollisionNote':
      return [['nat', ctx.constant(a(0))]];
    case 's.Note':
      if (a(0).startsWith('SharedGizmoSettings.ClashNote') || a(0).startsWith('ClashNote'))
        return [['clash', ctx.constant('ClashInfoText', 'SharedGizmoSettings')]];
      return [['note', ctx.constant(a(0)), a(1) !== '""' ? ctx.constant(a(1)) : '']];
    case 's.Info':
      return [['info', ctx.constant(a(0))]];
    case 's.Warning':
      return [['warn', ctx.constant(a(0))]];
    case 's.InfoLink':
      return [['ilink', stringConcat(a(0)) ?? '', stringConcat(a(1)) ?? '', stringConcat(a(2)) ?? '', lastName(a(3))]];
    case 's.PageLink':
      return [['plink', lastName(a(0)), stringConcat(a(1)) ?? '']];
    case 'EditorGUILayout.Space':
      return [['space', num(a(0))]];
    case 's.MasterHeader':
      if (a(0).startsWith('SettingsPage.')) return [['master', 'page', lastName(a(0)), ctx.prop(a(1))]];
      return [
        ['master', 'custom', stringConcat(a(0)) ?? '', stringConcat(a(1)) ?? '', ctx.constant(a(2)), ctx.prop(a(3))],
      ];
    case 'GizmoAppearancePresets.DrawHeader': {
      // (s, icon, title, subtitle, enabled), or for All Tools (s, page, icon, title, subtitle, on, setOn).
      const at = a(1).startsWith('"') ? 1 : 2;
      const icon = a(at).startsWith('"') ? (stringConcat(a(at)) ?? '') : ctx.constant(a(at));
      const sw = o + (o === 'SharedGizmoSettings' ? '.AllToolsEnabled' : '.Enabled');
      return [['master', 'gizmo', icon, stringConcat(a(at + 1)) ?? '', sw]];
    }
    case 's.GizmoPreviewCard':
      return [['prev', o]];
    case 's.BeginGroupCard':
      return [['card', lastName(a(0))]];
    case 's.EndGroupCard':
      return [['endcard']];
  }
  const helper = helpers(fn, ctx);
  if (helper) return helper(ctx, args);
  throw new Error('Unknown call ' + fn + ' in ' + text);
}
