// Setting rows: toggle, slider, popup, layer mask, colour and shortcut fields (SettingsControls).
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react';
import type { ItemOf } from '../core/builder.ts';
import { iconStyle } from '../core/icons.ts';
import { pageInfo } from '../core/model.ts';
import { bindingFromEvent, capTokens } from '../core/text.ts';
import { accented, clamp, fmtNum, hexToRgb, roundToRange } from '../core/util.ts';
import { D } from '../../plugin/window-data.ts';
import { Caps, Check } from './common.tsx';
import { useApp, useTip } from './context.ts';
import { indent, itemBase } from './item-base.ts';

type PropItem = ItemOf<'tog' | 'sld' | 'pop' | 'col' | 'msk'>;

/** A General override row's Override toggle and the link to the value it follows. */
function OverrideColumn({ it }: { it: PropItem }) {
  const app = useApp();
  const key = it.pkey;
  const src = pageInfo(it.srcPage ?? 'Overview');
  const srcVal = app.val(it.src ?? '');
  const p = D.props[it.src ?? ''];
  const shown = p?.o
    ? (p.o.find((o) => o[0] === srcVal) ?? [0, srcVal])[1]
    : typeof srcVal === 'boolean'
      ? srcVal
        ? 'True'
        : 'False'
      : String(srcVal);
  const toggle = () => {
    if (it.dis) return;
    const v = app.val(key);
    app.update((s) => ({ ovr: { ...s.ovr, [key]: !it.ovr }, vals: { ...s.vals, [key]: v! } }));
  };
  const ovrTip = useTip({
    t: `Keep a value on this page instead of following the ${src.label} page\n\n${src.label} page: ${String(shown)}`,
    native: true,
  });
  const srcTip = useTip({ t: `Show the value this follows on the ${src.label} page`, native: true });
  return (
    <div className="ovb">
      <button className={'tg' + (it.ovr ? ' on' : '')} onClick={toggle} {...ovrTip} aria-label="Override">
        <Check />
      </button>
      <span className="ovt" onClick={toggle}>
        Override
      </span>
      <button
        className="src"
        onClick={() => app.goTo(src.id, it.src)}
        {...srcTip}
        aria-label="Show the value this follows"
      >
        <span style={iconStyle(src.icon, 14, src.accent)} />
      </button>
    </div>
  );
}

function PropRow({ it, children, override = true }: { it: PropItem; children: ReactNode; override?: boolean }) {
  const app = useApp();
  const base = itemBase(app, it);
  const tip = useTip(it.tip);
  return (
    <div className={base.cls} onContextMenu={base.onContextMenu} data-hl={base.hl}>
      <i className="mk" style={base.markStyle} hidden={!base.mark} />
      <div className="lbl" {...tip}>
        {indent(it.label)}
      </div>
      {children}
      {override && it.ovrRow && <OverrideColumn it={it} />}
    </div>
  );
}

export function ToggleField({ it }: { it: PropItem }) {
  const app = useApp();
  const { live } = itemBase(app, it);
  const on = !!app.val(it.pkey);
  return (
    <PropRow it={it}>
      <div className="fld">
        <button
          className={'tg' + (on ? ' on' : '')}
          onClick={() => live && app.set(it.pkey, !on)}
          aria-label={it.label}
          aria-pressed={on}
        >
          <Check />
        </button>
      </div>
    </PropRow>
  );
}

export function SliderField({ it }: { it: PropItem }) {
  const app = useApp();
  const { live } = itemBase(app, it);
  const key = it.pkey;
  const min = it.min ?? 0;
  const max = it.max ?? 1;
  const v = app.num(key);
  const pct = clamp((v - min) / (max - min), 0, 1);
  const edit = app.st.edit;
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!live || e.button !== 0) return;
    const track = e.currentTarget;
    const apply = (ev: { clientX: number }) => {
      const r = track.getBoundingClientRect();
      const t = clamp((ev.clientX - r.left - 5) / Math.max(1, r.width - 10), 0, 1);
      app.set(key, roundToRange(min + t * (max - min), min, max));
    };
    apply(e);
    app.dismissTip();
    app.update({ dragKey: key });
    app.startDrag(apply, () => app.update({ dragKey: null }));
  };
  const commit = () => {
    if (edit?.key !== key) return;
    const n = parseFloat(edit.text);
    app.update((s) => ({
      edit: null,
      vals: isFinite(n) ? { ...s.vals, [key]: clamp(n, Math.min(min, max), Math.max(min, max)) } : s.vals,
    }));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit();
      e.currentTarget.blur();
    }
    if (e.key === 'Escape') {
      app.update({ edit: null });
      e.currentTarget.blur();
    }
  };
  return (
    <PropRow it={it}>
      <div className="fld">
        <div className="trk" onPointerDown={down}>
          <i className="line" />
          <i
            className={'th' + (app.st.dragKey === key ? ' act' : '')}
            style={{ left: `calc((100% - 10px) * ${pct.toFixed(4)})` }}
          />
        </div>
        <input
          className="nbox"
          type="text"
          inputMode="decimal"
          value={edit?.key === key ? edit.text : fmtNum(v)}
          onChange={(e) => app.update({ edit: { key, text: e.target.value } })}
          onBlur={commit}
          onKeyDown={onKey}
          disabled={!live}
          aria-label={it.label}
        />
      </div>
    </PropRow>
  );
}

function PopupButton({ text, onClick }: { text: string; onClick: (e: MouseEvent<HTMLElement>) => void }) {
  return (
    <div className="fld">
      <button className="pp" onClick={onClick}>
        <span className="ppt">{text}</span>
        <i className="arr" />
      </button>
    </div>
  );
}

export function PopupField({ it }: { it: PropItem }) {
  const app = useApp();
  const { live } = itemBase(app, it);
  const p = D.props[it.pkey];
  const v = app.val(it.pkey);
  const opt = p.o?.find((o) => o[0] === v);
  return (
    <PropRow it={it}>
      <PopupButton
        text={opt ? opt[1] : String(v)}
        onClick={(e) => {
          if (!live) return;
          app.openMenu(
            e,
            (p.o ?? []).map((o) => ({ label: o[1], value: o[0], on: o[0] === v })),
            (val) => app.set(it.pkey, val as string),
          );
        }}
      />
    </PropRow>
  );
}

export function MaskField({ it }: { it: PropItem }) {
  const app = useApp();
  const { live } = itemBase(app, it);
  const key = it.pkey;
  const v = app.num(key);
  const layers = D.layers;
  const all = layers.reduce((m, l) => m | (1 << l[0]), 0);
  const has = (i: number) => v === -1 || (v & (1 << i)) !== 0;
  const on = layers.filter((l) => has(l[0]));
  const text =
    v === -1 || on.length === layers.length
      ? 'Everything'
      : v === 0 || !on.length
        ? 'Nothing'
        : on.length === 1
          ? on[0][1]
          : 'Mixed...';
  const click = (e: MouseEvent<HTMLElement>) => {
    if (!live) return;
    const items = [
      { label: 'Nothing', value: 'none', on: v === 0 },
      { label: 'Everything', value: 'all', on: v === -1 },
      ...layers.map((l) => ({ label: l[1], value: l[0], on: has(l[0]) })),
    ];
    app.openMenu(e, items, (val) => {
      if (val === 'none') return app.set(key, 0);
      if (val === 'all') return app.set(key, -1);
      const m = (v === -1 ? all : v) ^ (1 << Number(val));
      app.set(key, (m & all) === all ? -1 : m);
    });
  };
  return (
    <PropRow it={it} override={false}>
      <PopupButton text={text} onClick={click} />
    </PropRow>
  );
}

export function ColorField({ it }: { it: PropItem }) {
  const app = useApp();
  const { live } = itemBase(app, it);
  const raw = app.val(it.pkey);
  const v = typeof raw === 'string' && raw ? raw : '#000000FF';
  const c = hexToRgb(v);
  return (
    <PropRow it={it} override={false}>
      <div className="fld">
        <label className="cf">
          <span className="cfs" style={{ background: `rgb(${c[0]},${c[1]},${c[2]})` }} />
          <span className="cfa">
            <i style={{ width: Math.round(c[3] * 100) + '%' }} />
          </span>
          <input
            type="color"
            value={'#' + v.replace('#', '').slice(0, 6).toLowerCase()}
            onChange={(e) => {
              const a = v.replace('#', '').slice(6, 8) || 'FF';
              app.set(it.pkey, '#' + e.target.value.replace('#', '').toUpperCase() + a);
            }}
            disabled={!live}
            aria-label={it.label}
          />
        </label>
        <span
          className="cfe"
          onClick={() => live && app.demo('In Unity the eyedropper picks a color from anywhere on the screen.')}
        >
          <span style={iconStyle('d_EyeDropper.Large', 14, '#C4C4C4')} />
        </span>
      </div>
    </PropRow>
  );
}

const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph'];

export function ShortcutField({ it }: { it: ItemOf<'sc'> }) {
  const app = useApp();
  const base = itemBase(app, it);
  const live = !it.dis;
  const id = it.sid;
  const binding = app.shortcut(id);
  const capturing = app.st.capturing === id;
  const canRestore = live && app.shortcutChanged(id);
  const canClear = live && !!binding;
  const tip = useTip(it.tip);
  const plateTip = useTip({
    t:
      (binding ? `<b>${binding}</b>\n\n` : '') +
      'Click, then press the key combination (or a non-left mouse button) to bind. Esc cancels.',
    native: true,
  });
  const restoreTip = useTip({ t: "Restore this shortcut's default key combination", native: true });
  const clearTip = useTip({ t: 'Clear this shortcut', native: true });
  const press = (e: MouseEvent<HTMLButtonElement>) => {
    if (!live) return;
    if (e.button === 0) {
      app.dismissTip();
      app.update({ capturing: id });
      e.currentTarget.focus();
      return;
    }
    if (capturing && e.button > 0) {
      e.preventDefault();
      const b = bindingFromEvent(e, e.button === 2 ? 1 : e.button === 1 ? 2 : e.button);
      if (b) app.setShortcut(id, b);
    }
  };
  const keyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') return app.update({ capturing: null });
    if (MODIFIER_KEYS.includes(e.key)) return;
    const b = bindingFromEvent(e);
    if (b) app.setShortcut(id, b);
  };
  return (
    <div className={base.cls} onContextMenu={base.onContextMenu} data-hl={base.hl}>
      <i className="mk" style={base.markStyle} hidden={!base.mark} />
      <div className="lbl" {...tip}>
        {indent(it.label)}
      </div>
      <div className="fld scf">
        <button
          className={'scp' + (capturing ? ' cap' : '')}
          style={capturing ? { background: accented(it.acc) } : undefined}
          onMouseDown={press}
          onKeyDown={keyDown}
          onBlur={() => capturing && app.update({ capturing: null })}
          onContextMenu={(e) => capturing && e.preventDefault()}
          {...plateTip}
          aria-label={'Shortcut for ' + it.label}
        >
          <span className="pt">{capturing ? 'Press a key…' : binding ? '' : 'Not set'}</span>
          <span className="caps">{!capturing && capTokens(binding).length > 0 && <Caps binding={binding} />}</span>
        </button>
        <button
          className={'gb rs' + (canRestore ? '' : ' off')}
          onClick={(e) => {
            e.stopPropagation();
            if (canRestore) app.clearShortcutOverride(id);
          }}
          {...restoreTip}
          aria-label="Restore default"
        >
          ↺
        </button>
        <button
          className={'gb cl' + (canClear ? '' : ' off')}
          onClick={(e) => {
            e.stopPropagation();
            if (canClear) app.setShortcut(id, '');
          }}
          {...clearTip}
          aria-label="Clear shortcut"
        >
          <span style={iconStyle('d_Close', 15)} />
        </button>
      </div>
    </div>
  );
}
