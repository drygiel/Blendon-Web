// Tables: the Overview's feature list, Frame Selected's sequence, the context menu's extra
// entries and the pie menu list.
import type { ReactNode } from 'react';
import type { ItemOf } from '../core/builder.ts';
import { iconStyle } from '../core/icons.ts';
import { pageInfo } from '../core/model.ts';
import type { TipSource } from '../core/state.ts';
import { D } from '../data/store.ts';
import { Caps, Check } from './common.tsx';
import { useApp, useTip } from './context.ts';
import { itemBase } from './item-base.ts';

const HINT = (what: string) => `\n\n<size=9><color=#92929A>${what}</color></size>`;

export function FeatureHead({ it }: { it: ItemOf<'fhead'> }) {
  const app = useApp();
  return (
    <div className={itemBase(app, it).cls}>
      <span className="fhf">FEATURE</span>
      <span className="fhs">SHORTCUT</span>
    </div>
  );
}

export function FeatureRow({ it }: { it: ItemOf<'frow'> }) {
  const app = useApp();
  const page = pageInfo(it.page);
  const enabled = app.pageEnabled(it.page);
  const full = app.pageFull(it.page);
  const sid = D.primaryShortcut[it.page];
  const tip = useTip(D.featureTips[page.label] ?? { t: page.summary + HINT(`Click to open the ${page.label} page`) });
  return (
    <div className={itemBase(app, it).cls}>
      <div className={'fr' + (it.stripe % 2 ? ' odd' : '')} {...tip}>
        <button
          className={'tg' + (full ? ' on' : enabled ? ' mixed' : '')}
          onClick={() => !it.dis && app.setPageEnabled(it.page, !full)}
          aria-label={'Enable ' + page.label}
        >
          <Check />
        </button>
        <span className={'fi' + (enabled ? '' : ' off')} style={iconStyle(page.icon, 16, page.accent)} />
        <span className="ftt lk" data-off={!enabled} onClick={() => app.goTo(it.page)}>
          {page.label}
        </span>
        <span className="fkey" data-dim={!enabled}>
          {sid && <Caps binding={app.shortcut(sid)} />}
          <span className="kun">{!sid && !enabled ? 'off' : ''}</span>
        </span>
      </div>
    </div>
  );
}

export function FeaturePie({ it }: { it: ItemOf<'fpie'> }) {
  const app = useApp();
  const pie = D.pies.find((p) => p.id === it.pie)!;
  const featureOn = !!app.val('PieMenuSettings.Enabled');
  const on = app.pieOn(pie.id);
  const live = featureOn && on;
  const binding = app.shortcut(pie.sid);
  const tip = useTip(
    pie.tipOverview.t ? pie.tipOverview : { t: pie.desc + '\n\nClick to edit this menu.', native: true },
  );
  return (
    <div className={itemBase(app, it).cls}>
      <div className={'fr' + (it.stripe % 2 ? ' odd' : '') + ' sub'}>
        <button
          className={'tg' + (on ? ' on' : '')}
          onClick={() => featureOn && !it.dis && app.setPie(pie.id, !on)}
          disabled={!featureOn}
          aria-label={'Enable ' + pie.title}
        >
          <Check />
        </button>
        <span className={'fi sm' + (live ? '' : ' off')} style={iconStyle(pie.icon, 14, '#598CF2')} />
        <span
          className={'ft2' + (live ? '' : ' muted') + ' lk'}
          onClick={() => app.demo(`In Unity this opens the ${pie.title} pie menu in the pie menu editor.`)}
          {...tip}
        >
          {pie.title}
        </span>
        <span className="fkey">
          {live && <Caps binding={binding} />}
          <span className="kun">{live ? (binding ? '' : 'not set') : 'off'}</span>
        </span>
      </div>
    </div>
  );
}

export function FeatureShortcut({ it }: { it: ItemOf<'fsub'> }) {
  const app = useApp();
  const page = pageInfo(it.page);
  const enabled = app.pageEnabled(it.page);
  const binding = app.shortcut(it.sid);
  const sh = D.shortcuts[it.sid];
  // A shortcut's own card already ends on the Keyboard page note (OverviewTips.Shortcut).
  const tip = useTip(
    sh?.t
      ? { t: sh.t, i: sh.i }
      : { t: `One of ${page.label}'s keys.${HINT('Click to open this shortcut on the Keyboard page')}` },
  );
  return (
    <div className={itemBase(app, it).cls}>
      <div className={'fr' + (it.stripe % 2 ? ' odd' : '') + ' sub'}>
        <span className={'ft2' + (enabled ? '' : ' muted') + ' lk'} onClick={() => app.goTo('Keyboard')} {...tip}>
          {it.name}
        </span>
        <span className="fkey">
          {enabled && <Caps binding={binding} />}
          <span className="kun">{enabled ? (binding ? '' : 'not set') : 'off'}</span>
        </span>
      </div>
    </div>
  );
}

interface OrderProps {
  first: boolean;
  last: boolean;
  up: () => void;
  down: () => void;
  upTip: string;
  downTip: string;
}

function OrderButtons({ first, last, up, down, upTip, downTip }: OrderProps) {
  const upHover = useTip({ t: upTip, native: true });
  const downHover = useTip({ t: downTip, native: true });
  return (
    <>
      <button className={'mv' + (first ? ' off' : '')} onClick={up} {...upHover} aria-label="Move up">
        ▲
      </button>
      <button className={'mv' + (last ? ' off' : '')} onClick={down} {...downHover} aria-label="Move down">
        ▼
      </button>
    </>
  );
}

function Name({ text, muted, tip }: { text: string; muted: boolean; tip: TipSource }) {
  const hover = useTip(tip);
  return (
    <span className={'tnm ' + (muted ? 'muted' : '')} {...hover}>
      {text}
    </span>
  );
}

export function FrameSequence({ it }: { it: ItemOf<'frameSeq'> }) {
  const app = useApp();
  const base = itemBase(app, it);
  const steps = app.frameSteps();
  const onCount = steps.filter((s) => s.on).length;
  const swap = (i: number, j: number) => {
    const a = steps.map((x) => ({ id: x.id, on: x.on }));
    [a[i], a[j]] = [a[j], a[i]];
    app.setFrame(a);
  };
  let press = 0;
  return (
    <div className={base.cls}>
      <i className="mk" style={base.markStyle} hidden={!base.mark} />
      <div className="tbh">
        <span className="tbo">ORDER</span>
      </div>
      {steps.map((s, i) => {
        if (s.on) press++;
        const lock = s.on && onCount <= 1;
        const first = i === 0;
        const last = i === steps.length - 1;
        return (
          <div key={s.id} className={'tr' + (i % 2 ? ' odd' : '')}>
            <button
              className={'tg' + (s.on ? ' on' : '') + (lock ? ' lock' : '')}
              onClick={() => !lock && app.setFrame(steps.map((x, j) => ({ id: x.id, on: j === i ? !x.on : x.on })))}
              aria-label={'Use ' + s.label}
            >
              <Check />
            </button>
            <span className={'tnum ' + (s.on ? '' : 'muted')}>{s.on ? String(press) : '-'}</span>
            <Name text={s.label} muted={!s.on} tip={{ t: s.tip, native: true }} />
            <OrderButtons
              first={first}
              last={last}
              up={() => !first && swap(i, i - 1)}
              down={() => !last && swap(i, i + 1)}
              upTip={first ? 'Already the first step' : 'Take this step one press earlier'}
              downTip={last ? 'Already the last step' : 'Take this step one press later'}
            />
          </div>
        );
      })}
    </div>
  );
}

function InlineCell({ tip, children }: { tip: TipSource; children: ReactNode }) {
  const hover = useTip(tip);
  return (
    <span className="tin" {...hover}>
      {children}
    </span>
  );
}

export function ExtrasTable({ it }: { it: ItemOf<'extras'> }) {
  const app = useApp();
  const order = app.extrasOrder();
  const ids = order.map((e) => e.id ?? '');
  const rows: ReactNode[] = [];
  let stripe = 0;
  for (const [section, caption] of D.extraSections) {
    const inSec = order.map((e, idx) => ({ e, idx })).filter((x) => x.e.section === section);
    if (!inSec.length) continue;
    rows.push(
      <div key={'h' + section} className="tcap">
        {caption}
      </div>,
    );
    inSec.forEach(({ e, idx }, n) => {
      const on = !!app.val(e.prop ?? '');
      const inl = e.inline ? !!app.val(e.inline) : false;
      const prev = n > 0 ? inSec[n - 1].idx : -1;
      const next = n < inSec.length - 1 ? inSec[n + 1].idx : -1;
      rows.push(
        <div key={e.id} className={'tr' + (stripe++ % 2 ? ' odd' : '')}>
          <button
            className={'tg' + (on ? ' on' : '')}
            onClick={() => app.set(e.prop ?? '', !on)}
            aria-label={'Show ' + e.label}
          >
            <Check />
          </button>
          <Name text={e.label} muted={!on} tip={e.tip} />
          <InlineCell
            tip={
              e.inlineTip.t
                ? e.inlineTip
                : { t: 'This entry is a row of its own, so there is nothing to line up', native: true }
            }
          >
            {e.inline ? (
              <button
                className={'tg' + (inl ? ' on' : '') + (on ? '' : ' dis')}
                onClick={() => on && app.set(e.inline!, !inl)}
                aria-label="Inline"
              >
                <Check />
              </button>
            ) : (
              <span className="dash">-</span>
            )}
          </InlineCell>
          <OrderButtons
            first={prev < 0}
            last={next < 0}
            up={() => prev >= 0 && app.moveExtra(ids, idx, prev)}
            down={() => next >= 0 && app.moveExtra(ids, idx, next)}
            upTip={
              prev < 0
                ? 'Already first in its part of the menu'
                : 'Move this entry above the one before it in the same part of the menu'
            }
            downTip={
              next < 0
                ? 'Already last in its part of the menu'
                : 'Move this entry below the one after it in the same part of the menu'
            }
          />
        </div>,
      );
    });
  }
  return (
    <div className={itemBase(app, it).cls}>
      <div className="tbh">
        <span className="tbi">INLINE</span>
        <span className="tbo">ORDER</span>
      </div>
      {rows}
    </div>
  );
}

function PieRow({ id, i }: { id: string; i: number }) {
  const app = useApp();
  const pie = D.pies.find((p) => p.id === id)!;
  const featureOn = !!app.val('PieMenuSettings.Enabled');
  const on = app.pieOn(id);
  const binding = app.shortcut(pie.sid);
  const edit = () => app.demo(`In Unity this opens the ${pie.title} pie menu in the pie menu editor.`);
  const tip = useTip(pie.tipRow.t ? pie.tipRow : { t: pie.desc, native: true });
  const keyTip = useTip({ t: 'Edit this menu to change its shortcut', native: true });
  const itemsTip = useTip({ t: "How many of the ring's slots run something", native: true });
  const editTip = useTip({ t: 'Edit this menu: its items, title, icon and shortcut', native: true });
  const resetTip = useTip({ t: 'Already at its shipped defaults', native: true });
  return (
    <div className={'pr' + (i % 2 ? ' odd' : '')}>
      <button
        className={'tg' + (on ? ' on' : '')}
        onClick={() => featureOn && app.setPie(id, !on)}
        aria-label={'Enable ' + pie.title}
      >
        <Check />
      </button>
      <span className={'pi' + (on ? '' : ' off')} style={iconStyle(pie.icon, 16)} />
      <span className={'pt' + (on ? '' : ' muted') + ' lk'} onClick={edit} {...tip}>
        {pie.title}
      </span>
      <span className="pkey" {...keyTip}>
        {on && <Caps binding={binding} />}
        <span className="kun">{on ? (binding ? '' : 'Not set') : 'Disabled'}</span>
      </span>
      <span className={'pc' + (on ? '' : ' off')} {...itemsTip}>
        {`${pie.filled} item${pie.filled === 1 ? '' : 's'}`}
      </span>
      <button className="ib" onClick={edit} {...editTip} aria-label={'Edit ' + pie.title}>
        <span style={iconStyle('d_ToolsToggle', 12, '#EEEEEE')} />
      </button>
      <button className="ib off" {...resetTip} aria-label={'Reset ' + pie.title}>
        ↺
      </button>
    </div>
  );
}

export function PieTable({ it }: { it: ItemOf<'pieTable'> }) {
  const app = useApp();
  return (
    <div className={itemBase(app, it).cls}>
      {it.header && (
        <div className="pth">
          <span className="ph1">#</span>
          <span className="ph2">TITLE</span>
          <span className="ph3">SHORTCUT</span>
          <span className="ph4">ITEMS</span>
        </div>
      )}
      {it.pies.map((id, i) => (
        <PieRow key={id} id={id} i={i} />
      ))}
    </div>
  );
}

export function PieEmpty({ it }: { it: ItemOf<'pieEmpty'> }) {
  const app = useApp();
  return <div className={itemBase(app, it).cls}>No custom pie menus yet.</div>;
}

export function PieFooter({ it }: { it: ItemOf<'pieFooter'> }) {
  const app = useApp();
  return (
    <div className={itemBase(app, it).cls}>
      <button
        className="nb cfg"
        onClick={() => app.demo('In Unity this shows the pie menu config file in your file browser.')}
      >
        <span style={iconStyle('d_Folder Icon', 12)} />
        Config File
      </button>
      <button
        className="nb add"
        onClick={() => app.demo('In Unity this opens the pie menu editor with a new, empty menu.')}
      >
        <span style={iconStyle('d_Toolbar Plus', 12, '#EEEEEE')} />
        Add
      </button>
    </div>
  );
}
