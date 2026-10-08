// Turns parsed DrawSettings bodies into the settings window's op lists (see src/plugin/schema.ts).
import type { Cond, Op } from '../../src/plugin/schema.ts';
import { splitArgs, stringConcat, type Stmt } from './csharp.ts';

// Static owners referenced from other settings classes.
const STATIC_OWNERS: Record<string, string> = {
  General: 'GeneralSettings',
  'SharedGizmoSettings.Instance': 'SharedGizmoSettings',
  shared: 'SharedGizmoSettings',
  'Zoom.Settings': 'ZoomSettings',
  'FrameSelected.Settings': 'FrameSelectedSettings',
  'IsolateView.Settings': 'IsolateViewSettings',
  'PieMenu.Settings': 'PieMenuSettings',
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
};

export type Helper = (ctx: Ctx, args: string[]) => Op[];

export class Ctx {
  readonly alias: Record<string, string | null> = {};
  readonly owner: string;
  readonly consts: Record<string, string>;

  constructor(owner: string, consts: Record<string, string>) {
    this.owner = owner;
    this.consts = consts;
  }

  /** A constant by C# name, resolved against the owner's class like the compiler would. */
  constant(name: string, owner = this.owner): string {
    if (name.startsWith('"')) return stringConcat(name) ?? '';
    if (name.includes('.')) {
      const v = this.consts[name];
      if (v === undefined) throw new Error('Unknown constant ' + name);
      return v;
    }
    for (const cls of [CONST_CLASS[owner] ?? owner, owner]) {
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

  /** "() => Prop" or a member path, as "Type.Prop". */
  prop(expr: string): string {
    const e = expr.trim().replace(/^\(\)\s*=>\s*/, '');
    const alias = this.alias[e];
    if (alias) return alias;
    for (const [k, v] of Object.entries(STATIC_OWNERS))
      if (e.startsWith(k + '.')) return v + '.' + e.slice(k.length + 1);
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
    if (t === 'ColorsEditable' || t === 'SharedGizmoSettings.ColorsEditable') return ['v', 'GeneralSettings.Enabled'];
    if (t === 'AnyToolEnabled') return ['f', 'anyTool'];
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

export function convert(ctx: Ctx, stmts: Stmt[], helpers: Record<string, Helper>): Op[] {
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
    if (
      ['return', 's.EndAppearance()', 'var enabled = Enabled', 'var shared = SharedGizmoSettings.Instance'].includes(
        text,
      )
    ) {
      if (text === 'var enabled = Enabled') ctx.alias.enabled = ctx.owner + '.Enabled';
      continue;
    }
    if (['var combined', 'var extent', 'var pending', '_pending'].some((p) => text.startsWith(p))) continue;
    const assign = /^var (\w+) = (.*)$/.exec(text);
    if (assign && assign[2]?.startsWith('s.')) {
      const sub = convert(ctx, [['stmt', assign[2]]], helpers);
      ops.push(...sub);
      const last = sub[sub.length - 1];
      const name = assign[1] ?? '';
      if (last && (last[0] === 'tog' || last[0] === 'gtog' || last[0] === 'imod')) ctx.alias[name] = last[1];
      if (last && last[0] === 'prev') ctx.alias[name] = null;
      continue;
    }
    const parsed = call(text);
    if (!parsed) throw new Error('Unrecognised statement: ' + text);
    ops.push(...callOps(ctx, parsed[0], parsed[1], text, helpers));
  }
  return ops;
}

function callOps(ctx: Ctx, fn: string, args: string[], text: string, helpers: Record<string, Helper>): Op[] {
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
      return [['tog', ctx.prop(a(0))]];
    case 's.Slider':
      return [['sld', ctx.prop(a(0)), num(a(2)), num(a(3))]];
    case 's.EnumPopup':
    case 's.ModifierField':
      return [['pop', ctx.prop(a(0))]];
    case 's.ColorField':
      return [['col', ctx.prop(a(0))]];
    case 's.LayerMaskField':
      return [['msk', ctx.prop(a(0))]];
    case 's.GeneralToggle':
      return [['gtog', ctx.prop(a(0)), ctx.prop(a(2))]];
    case 's.GeneralEnumPopup':
      return [['gpop', ctx.prop(a(0)), ctx.prop(a(2))]];
    case 's.GeneralSlider':
      return [['gsld', ctx.prop(a(0)), ctx.prop(a(2)), num(a(3)), num(a(4))]];
    case 's.InheritedModifierField':
      return [['imod', ctx.prop(a(0)), ctx.prop(a(2)), lastName(a(3))]];
    case 's.ShortcutField':
      if (a(0).startsWith('()')) return [['sc', ctx.constant(a(2)), ctx.prop(a(0))]];
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
      const icon = a(2).startsWith('"') ? (stringConcat(a(2)) ?? '') : ctx.constant(a(2));
      const sw = o + (o === 'SharedGizmoSettings' ? '.AllToolsEnabled' : '.Enabled');
      return [['master', 'gizmo', icon, stringConcat(a(3)) ?? '', sw]];
    }
    case 's.GizmoPreviewCard':
      return [['prev', o]];
    case 's.BeginGroupCard':
      return [['card', lastName(a(0))]];
    case 's.EndGroupCard':
      return [['endcard']];
  }
  const helper = helpers[fn];
  if (helper) return helper(ctx, args);
  throw new Error('Unknown call ' + fn + ' in ' + text);
}
