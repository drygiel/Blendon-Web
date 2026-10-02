// Page header cards (MasterHeader + PageHeader), the Overview's master panel and keyboard presets.
import { Fragment, type CSSProperties } from 'react';
import { useReducedMotion } from '../../lib/hooks.ts';
import type { ItemOf } from '../core/builder.ts';
import { iconStyle } from '../core/icons.ts';
import { capsWidth, rich } from '../core/text.ts';
import { clamp, M, PAL } from '../core/util.ts';
import { D } from '../data/store.ts';
import { Caps, Runs } from './common.tsx';
import { useApp, useTip } from './context.ts';
import { itemBase } from './item-base.ts';

interface Seg {
  label: string;
  sel: boolean;
  pick: () => void;
  tip: { t: string; i?: string; native?: boolean };
}

function SegButton({ seg }: { seg: Seg }) {
  const tip = useTip(seg.tip);
  return (
    <button className={'seg' + (seg.sel ? ' sel' : '')} onClick={seg.pick} {...tip}>
      {seg.label}
    </button>
  );
}

function Segs({ segs }: { segs: Seg[] }) {
  return (
    <div className="segs">
      {segs.map((g) => (
        <SegButton key={g.label} seg={g} />
      ))}
    </div>
  );
}

function Presets({ segs, note, className }: { segs: Seg[]; note: string; className: string }) {
  return (
    <div className={className}>
      {className.includes('stack-prs') && <div className="hrule" />}
      <div className="prh">
        <span style={iconStyle('d_Preset.Context', 14, PAL.text2)} />
        <span>Presets</span>
      </div>
      <Segs segs={segs} />
      <div className="prn">{note}</div>
    </div>
  );
}

function Switch({ on, toggle, label }: { on: boolean; toggle: () => void; label: string }) {
  return (
    <button className={'sw' + (on ? ' on' : '')} onClick={toggle} aria-label={'Enable ' + label} aria-pressed={on}>
      <i />
    </button>
  );
}

/** KeyRunWidth: the caps column is sized from KeyCap.Measure (joined), not from the browser's font. */
const runWidth = (b: string) => (b ? capsWidth(b, 14) : 32);

export function MasterCard({ it }: { it: ItemOf<'master'> }) {
  const app = useApp();
  const reduced = useReducedMotion();
  const base = itemBase(app, it);
  const on = !!app.val(it.pkey);
  const toggle = () => {
    if (!it.dis) app.set(it.pkey, !on);
  };
  const switchTip = useTip(it.tip);
  const sw = (
    <>
      <span className="mtile">
        <span style={iconStyle(it.icon, 18, '#87B8DE')} />
      </span>
      <div className="mtx">
        <div className="mt">{it.title}</div>
        <div className="ms">{it.subtitle}</div>
      </div>
      <Switch on={on} toggle={toggle} label={it.title} />
    </>
  );
  const h = it.header;
  if (!h)
    return (
      <div className={base.cls}>
        <div className="msw" {...switchTip}>
          {sw}
        </div>
      </div>
    );

  const body = app.pageW - 28;
  const beside = body >= 320 + 20 + 300;
  const textW = beside ? body - 340 : body;
  const hcls =
    'hc' + (beside ? ' beside' : ' stacked') + (textW >= 460 && h.sections.length && h.keys.length ? ' hsplit' : '');
  const img = D.headerImages[h.image] ?? '';
  const video = on && !reduced ? (D.headerVideos[h.video] ?? '') : '';
  const imgStyle: CSSProperties | undefined = on ? undefined : { opacity: 0.35 };
  const capsW = h.keys.reduce(
    (m, kk) =>
      Math.max(
        m,
        kk.bindings.reduce((w, b, j) => w + runWidth(b) + (j ? 12 : 0), 0),
      ),
    0,
  );
  let segs: Seg[] | null = null;
  let note = '';
  if (it.gizmoPresets) {
    const pr = app.gizmoPresets();
    note = pr.note;
    segs = pr.labels.map((l, i) => ({
      label: l,
      sel: i === pr.sel,
      pick: () => {
        if (i < D.gizmoPresets.length) app.applyGizmoPreset(i);
      },
      tip: { t: `<size=14><b>${l}</b></size>\n${pr.tips[i] ?? ''}`, native: false },
    }));
  }
  // The card has a slot for the picture in either layout; only the one CSS shows gets it.
  const media = (shown: boolean) =>
    shown && (
      <>
        <img src={img} alt="" style={imgStyle} />
        {video && <video className="hvid" src={video} autoPlay muted loop playsInline preload="auto" />}
      </>
    );
  return (
    <div className={base.cls}>
      <div className={hcls}>
        <div className="hcl">
          <div className="himg">{media(beside)}</div>
          {segs && <Presets className="prs side-prs" segs={segs} note={note} />}
        </div>
        <div className="hcr">
          <div className="msw">{sw}</div>
          <div className="hrule" />
          <div className="himg stack-img">{media(!beside)}</div>
          <div className="hbody" data-off={!on}>
            <div className="hsecs">
              {h.sections.map((s, i) => (
                <div key={i} className="hsec">
                  <div className="hcap">{s[0]}</div>
                  <div className="hrt">
                    <Runs runs={rich(s[1])} />
                  </div>
                </div>
              ))}
            </div>
            {h.keys.length > 0 && (
              <div className="hkeys">
                <div className="hcap">KEYS</div>
                <div className="hkg" style={{ gridTemplateColumns: `${capsW.toFixed(1)}px minmax(0,1fr)` }}>
                  {h.keys.map((kk, i) => (
                    <div key={i} className={'uhk' + (kk.active === false ? ' dis' : '')}>
                      <span className="krun">
                        {kk.bindings.map((b, j) => (
                          <Fragment key={j}>
                            {j > 0 && <span className="kslash">/</span>}
                            {!b && <span className="kun">not set</span>}
                            <Caps binding={b} plus />
                          </Fragment>
                        ))}
                      </span>
                      <span className="kact">
                        <Runs runs={rich(kk.action)} />
                      </span>
                    </div>
                  ))}
                </div>
                {h.footer && (
                  <div className="hfoot">
                    <Runs runs={rich(h.footer)} />
                  </div>
                )}
              </div>
            )}
          </div>
          {segs && <Presets className="prs stack-prs" segs={segs} note={note} />}
        </div>
      </div>
    </div>
  );
}

export function OverviewMaster({ it }: { it: ItemOf<'ovMaster'> }) {
  const app = useApp();
  const on = !!app.val('GeneralSettings.Enabled');
  const switchTip = useTip(it.tip);
  const sel = app.st.preset ?? -1;
  const segs: Seg[] = D.presets.map((p, i) => ({
    label: p.name,
    sel: i === sel,
    pick: () =>
      app.confirm({ title: `Apply "${p.name}"`, body: p.confirm, ok: 'Apply', run: () => app.applyPreset(i) }),
    tip: p.tip,
  }));
  return (
    <div className={'ovm' + (app.pageW < 620 ? ' stacked' : '')}>
      <div className="ovl" {...switchTip}>
        <div className="ovlogo">
          <img src={D.logo} alt="Blendon" />
          <div className="ovsub">Blender-Style Scene View, Gizmos &amp; Pie Menus for Unity</div>
        </div>
        <Switch on={on} toggle={() => app.set('GeneralSettings.Enabled', !on)} label="Blendon" />
      </div>
      <div className="ovdiv" />
      <div className="ovr2">
        <div className="prh">
          <span style={iconStyle('d_Preset.Context', 14, PAL.text2)} />
          <span>Presets</span>
        </div>
        <Segs segs={segs} />
        <div className="prn">
          {on
            ? 'Sets which features are on. Your tuning is left alone, except where a preset changes something.'
            : 'Applying any of these switches Blendon back on.'}
        </div>
      </div>
    </div>
  );
}

export function KeyboardPresets({ it }: { it: ItemOf<'kbPreset'> }) {
  const app = useApp();
  const base = itemBase(app, it);
  const linkTip = useTip({
    t: "Opens Unity's own Shortcuts window, where profiles are created, renamed and switched.",
    native: true,
  });
  const segs: Seg[] = (['Blendon', 'Unity'] as const).map((l, i) => ({
    label: l,
    sel: l === app.st.kbSide,
    pick: () => app.update({ kbSide: l }),
    tip: D.kbTips[i] ?? { t: '' },
  }));
  return (
    <div className={base.cls}>
      <Segs segs={segs} />
      <div className="prn">
        Decides who keeps the keys Blendon and the Editor both want. Each preset is a shortcut profile of its own, so
        your tuning on either one is left alone.
      </div>
      <div className="kbl">
        <span className="nlead">Want an arrangement of your own? Make a profile in </span>
        <span
          className="lnk sm"
          onClick={() =>
            app.demo(
              "In Unity this opens the Editor's Shortcuts window, where shortcut profiles are created, renamed and switched.",
            )
          }
          {...linkTip}
        >
          Unity&apos;s Shortcuts window
        </span>
      </div>
    </div>
  );
}

function ContestedRow({ r, i, grid }: { r: (typeof D.contested)[number]; i: number; grid: CSSProperties }) {
  const app = useApp();
  const bk = app.shortcut(r.bid);
  const uk = app.st.kbSide === 'Blendon' ? r.uMove : r.key;
  const tip = useTip({
    t: `<size=14><b>${r.bl} vs ${r.ul}</b></size>\n${r.tip}${D.consts.contestedLinkHint ?? ''}`,
    i: 'Tips/Overview/ContestedKey.png',
  });
  return (
    <div className={'ct' + (i % 2 ? ' odd' : '')} style={grid} {...tip}>
      <span className="ctn lk" onClick={() => app.goTo('Keyboard')}>
        {r.bl}
      </span>
      <span />
      <span className="ctk">
        <Caps binding={bk} />
        {!bk && <span className="kun">not set</span>}
      </span>
      <span />
      <span className="ctdiv" />
      <span />
      <span
        className="ctu lk"
        onClick={() => app.demo(`In Unity this opens the Editor's Shortcuts window at ${r.ul}.`)}
      >
        {r.ul}
      </span>
      <span />
      <span className="ctk dim">
        <Caps binding={uk} />
        {!uk && <span className="kun">not set</span>}
      </span>
    </div>
  );
}

export function ContestedTable({ it }: { it: ItemOf<'contested'> }) {
  const app = useApp();
  const base = itemBase(app, it);
  const blendon = app.st.kbSide === 'Blendon';
  let widest = 0;
  for (const r of it.rows)
    widest = Math.max(widest, capsWidth(app.shortcut(r.bid), 4), capsWidth(blendon ? r.uMove : r.key, 4));
  // The table always spans the card (band cell): its width minus the cell padding and LabelIndent.
  const tableW = app.pageW - M.cellPadX - (app.st.li ?? 24.3);
  let keyW = Math.min(148, widest);
  const forNames = tableW - (14 + 8 + keyW) * 2;
  const nameW = clamp(forNames * 0.5, 0, 118);
  if (forNames < 0) keyW = Math.max(0, keyW + forNames * 0.5);
  const grid: CSSProperties = {
    gridTemplateColumns: `${nameW}px 8px ${keyW}px 14px 1px 13px minmax(0,1fr) 8px ${keyW}px`,
  };
  return (
    <div className={base.cls}>
      <div className="cth">
        <span className="cthl">{blendon ? 'BLENDON KEEPS' : 'BLENDON MOVED TO'}</span>
        <span className="cthr" style={{ left: nameW + 8 + keyW + 28 + 'px' }}>
          {blendon ? 'UNITY EDITOR MOVED TO' : 'UNITY EDITOR KEEPS'}
        </span>
      </div>
      {it.rows.map((r, i) => (
        <ContestedRow key={r.bid + r.ul} r={r} i={i} grid={grid} />
      ))}
    </div>
  );
}
