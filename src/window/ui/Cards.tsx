// Page header cards (MasterHeader + PageHeader), the Overview's master panel and keyboard presets.
import { Fragment, type CSSProperties } from 'react';
import { Keymap } from '../../bridge/keymap.ts';
import { useReducedMotion } from '../../lib/hooks.ts';
import { Sprite } from '../../lib/Sprite.tsx';
import type { ItemOf } from '../core/builder.ts';
import { iconStyle } from '../core/icons.ts';
import { capsWidth, rich } from '../core/text.ts';
import { clamp, M, PAL } from '../core/util.ts';
import { KEY_END, KEY_OPEN, presetKey } from '../../plugin/keys.ts';
import type { ContestState, ContestedRow as Row, KeyboardPreset, Keys, Tip } from '../../plugin/schema.ts';
import { D } from '../../plugin/window-data.ts';
import type { TipSource } from '../core/state.ts';
import { Caps, Runs } from './common.tsx';
import { useApp, useTip } from './context.ts';
import { itemBase } from './item-base.ts';

interface Seg {
  label: string;
  sel: boolean;
  pick: () => void;
  tip: TipSource;
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
  const app = useApp();
  return (
    <div className={className}>
      {className.includes('stack-prs') && <div className="hrule" />}
      <div className="prh">
        <span style={iconStyle('d_Preset.Context', 14, app.skin(PAL.text2))} />
        <span>Presets</span>
      </div>
      <Segs segs={segs} />
      <div className="prn">{note}</div>
    </div>
  );
}

export function Switch({ on, toggle, label }: { on: boolean; toggle: () => void; label: string }) {
  return (
    <button className={'sw' + (on ? ' on' : '')} onClick={toggle} aria-label={'Enable ' + label} aria-pressed={on}>
      <i />
    </button>
  );
}

/** KeyRunWidth: the caps column is sized from KeyCap.Measure (joined), not from the browser's font. */
const runWidth = (b: string) => (b ? capsWidth(b, 14) : 32);

/** HeaderSectionsMinText and HeaderActionMinText: narrowest column and action before they stack. */
const SECTIONS_MIN = 260;
const ACTION_MIN = 200;

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
        <span style={iconStyle(it.icon, 18, app.skin('#87B8DE'))} />
      </span>
      <div className="mtx">
        <div className="mt">{it.title}</div>
        <div className="ms">{it.subtitle}</div>
      </div>
      <Switch on={on} toggle={toggle} label={it.title} />
    </>
  );
  const h = it.header;
  const preset = app.keyboardPreset();
  const bindingsOf = (kk: { bindings: Keys[] }) => kk.bindings.map((b) => presetKey(b, preset) ?? '');
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
  const img = D.headerImages[h.image] ?? '';
  const video = on && !reduced ? (D.headerVideos[h.video] ?? '') : '';
  const imgStyle: CSSProperties | undefined = on ? undefined : { opacity: 0.35 };
  const capsW = h.keys.reduce(
    (m, kk) =>
      Math.max(
        m,
        bindingsOf(kk).reduce((w, b, j) => w + runWidth(b) + (j ? 12 : 0), 0),
      ),
    0,
  );
  // HeaderBody: halves when both fit, else the keys take what their actions need and the sections the rest.
  const half = (textW - 22) / 2;
  const keysW = Math.max(half, capsW + 10 + ACTION_MIN);
  const split = h.sections.length > 0 && h.keys.length > 0 && textW - 22 - keysW >= SECTIONS_MIN;
  const keysColW = split ? keysW : textW;
  // Too narrow for a readable action beside the caps, so every action goes under its own.
  const under = keysColW - capsW - 10 < ACTION_MIN;
  const hcls = 'hc' + (beside ? ' beside' : ' stacked') + (split ? ' hsplit' : '');
  const bodyStyle: CSSProperties | undefined =
    split && keysW > half ? { gridTemplateColumns: `minmax(0,1fr) ${keysW.toFixed(1)}px` } : undefined;
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
      tip: { t: `<size=14><b>${pr.names[i] ?? l}</b></size>\n${pr.tips[i] ?? ''}`, native: false },
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
          <div className="hbody" data-off={!on} style={bodyStyle}>
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
                <div
                  className={'hkg' + (under ? ' under' : '')}
                  style={under ? undefined : { gridTemplateColumns: `${capsW.toFixed(1)}px minmax(0,1fr)` }}
                >
                  {h.keys.map((kk, i) => (
                    <div key={i} className={'uhk' + (kk.active === false ? ' dis' : '')}>
                      <span className="krun">
                        {bindingsOf(kk).map((b, j) => (
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
  const sel = app.currentPreset();
  const segs: Seg[] = D.presets.map((p, i) => ({
    label: p.name,
    sel: i === sel,
    // The lit preset is already in force, so there is nothing to ask about.
    pick: () =>
      i !== sel &&
      app.confirm({
        title: `Apply "${p.name}"`,
        body: p.confirm + '\n\nApply it now?',
        ok: 'Apply',
        run: () => app.applyPreset(i),
      }),
    tip: p.tip,
  }));
  return (
    <div className={'ovm' + (app.pageW < 620 ? ' stacked' : '')}>
      <div className="ovl" {...switchTip}>
        <div className="ovlogo">
          <Sprite className="ovwm" name={D.logo} label="Blendon" />
          <div className="ovsub">Blender-Style Scene View, Gizmos &amp; Pie Menus for Unity</div>
        </div>
        <Switch on={on} toggle={() => app.setMaster(!on)} label="Blendon" />
      </div>
      <div className="ovdiv" />
      <div className="ovr2">
        <div className="prh">
          <span style={iconStyle('d_Preset.Context', 14, app.skin(PAL.text2))} />
          <span>Presets</span>
        </div>
        <Segs segs={segs} />
        <div className="prn">{on ? D.consts.presetsOn : D.consts.presetsOff}</div>
      </div>
    </div>
  );
}

// Tip markup (Settings.Tip) for the cards built here, the way OverviewPage builds them.
const TITLE_OPEN = '<size=14><b>';
const TITLE_END = '</b></size>\n';
const SECTION = '\n\n<size=9><b><color=#92929A>';
const SECTION_END = '</color></b></size>\n';
const NOTE = '\n\n<size=9><color=#92929A>';
const END = '</color></size>';
const UNITY_OPEN = '<b><color=#3DB892>';
const UNITY_END = '</color></b>';
const keyText = (key: string) => KEY_OPEN + key + KEY_END;

// The rows each preset card names, keys read off the table so the card can't promise other keys.
const CARD_ROWS = ['Blendon/Move/Grab', 'Blendon/Rotate/Grab', 'Blendon/Orbit Selected', 'Blendon/Pan'];

function rowKeys(key: (row: Row) => string) {
  const parts: string[] = [];
  for (const id of CARD_ROWS) {
    const row = D.known[id];
    if (row) parts.push(row.bl + ' ' + keyText(key(row)));
  }
  return parts.join(', ') + '.';
}

function blenderCard() {
  const grab = D.known['Blendon/Move/Grab'];
  const moved = grab ? ', like ' + UNITY_OPEN + grab.ul + UNITY_END + ' to ' + keyText(grab.editorAlt) : '';
  return (
    TITLE_OPEN +
    'Blendon Keys' +
    TITLE_END +
    "Blender's keys answer in the Scene View." +
    SECTION +
    "BLENDON'S" +
    SECTION_END +
    rowKeys((row) => row.key) +
    SECTION +
    "THE EDITOR'S COMMANDS" +
    SECTION_END +
    'Move one modifier aside' +
    moved +
    ', so they work in the Scene View too. The table below gives any one its key back.' +
    NOTE +
    "Written to your shortcut profile. On Unity's read-only Default, Blendon offers a copy" +
    END
  );
}

function unityCard() {
  return (
    TITLE_OPEN +
    'Unity Keys' +
    TITLE_END +
    'The Editor keeps every key it has, and Blendon moves instead.' +
    SECTION +
    'BLENDON MOVES TO' +
    SECTION_END +
    rowKeys((row) => row.blendonAlt) +
    ' The table below gives any one its key back.' +
    NOTE +
    "Written to your shortcut profile. On Unity's read-only Default, Blendon offers a copy" +
    END
  );
}

let presetCards: Tip[] | null = null;

export function KeyboardPresets({ it }: { it: ItemOf<'kbPreset'> }) {
  const app = useApp();
  const base = itemBase(app, it);
  const linkTip = useTip({
    t: "Opens Unity's own Shortcuts window, where every key and profile can be changed.",
    native: true,
  });
  const sel = app.keyboardPreset();
  const cards = (presetCards ??= [blenderCard(), unityCard()].map((t, i) => ({ t, i: D.kbTips[i]?.i ?? '' })));
  const segs: Seg[] = (['Blendon', 'Unity'] as const).map((l: KeyboardPreset, i) => ({
    label: l,
    sel: l === sel,
    pick: () => app.applyKeyboardPreset(l),
    tip: cards[i] ?? { t: '' },
  }));
  return (
    <div className={base.cls}>
      <Segs segs={segs} />
      <div className="prn">
        Decides who gets the keys Blendon and the Editor both want, the other side moves one modifier aside. The button
        on a row below swaps just that pair.
      </div>
      <div className="kbl">
        <span className="nlead">Want to tune keys one by one? Use </span>
        <span
          className="lnk sm"
          onClick={() =>
            app.demo("In Unity this opens the Editor's Shortcuts window, where every key and profile can be changed.")
          }
          {...linkTip}
        >
          Unity&apos;s Shortcuts window
        </span>
      </div>
    </div>
  );
}

const RESET_TIP = "Give the Editor's command its own key back. Blendon covers it again.";

// OverviewContestedTable.ActionTipFor.
function actionTip(r: Row, state: ContestState): string {
  const theirs = `the Editor's "${r.ul}"`;
  const ours = `Blendon's "${r.bl}"`;
  if (state === 'Covered')
    return `Put ${theirs} on ${r.editorAlt}, so it works in the Scene View too. Blendon keeps ${r.key}.`;
  if (state === 'Moved' && r.replaces) return RESET_TIP;
  if (state === 'Moved')
    return `Swap: ${theirs} takes ${r.key} back, ${ours} ${r.blendonAlt ? 'moves to ' + r.blendonAlt : 'is left without a key'}.`;
  return `Swap: ${ours} takes ${r.key} back, ${theirs} moves to ${r.editorAlt}.`;
}

/** Swaps the pair: a moved command takes its key back, anything else gives it to Blendon. Only listed rows. */
function RowAction({ r, state }: { r: Row; state: ContestState }) {
  const app = useApp();
  const back = state === 'Moved';
  const tip = useTip({ t: actionTip(r, state), native: true });
  return (
    <button
      className="ctb"
      onClick={() => {
        app.dismissTip();
        Keymap.act(r, state);
      }}
      aria-label={back ? 'Reset' : 'Move aside'}
      {...tip}
    >
      {back ? '↺' : '↪'}
    </button>
  );
}

function ContestedRow({ r, i, grid }: { r: Row; i: number; grid: CSSProperties }) {
  const app = useApp();
  const state = app.contestState(r);
  const bk = app.shortcut(r.bid);
  const uk = app.shortcut(r.uid);
  // One card for the row, by what it says now.
  const tip = useTip(r.cards[state]);
  // Muted while covered: the key is there, but the Scene View doesn't hear it.
  const covered = state === 'Covered';
  return (
    <div className={'ct' + (i % 2 ? ' odd' : '')} style={grid} {...tip}>
      <span className="ctn lk" onClick={() => app.goTo('Keyboard', r.bid)}>
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
      <span className={'ctk' + (covered ? ' dim' : '')}>
        <Caps binding={uk} />
        {!uk && <span className="kun">not set</span>}
      </span>
      <span />
      <RowAction r={r} state={state} />
    </div>
  );
}

// OverviewContestedTable's columns: action + key twice, either side of a rule. The glyph is one row square.
const ACTION_W = 20;
const TABLE_GAP = 10;

export function ContestedTable({ it }: { it: ItemOf<'contested'> }) {
  const app = useApp();
  const base = itemBase(app, it);
  let widest = 0;
  for (const r of it.rows)
    widest = Math.max(widest, capsWidth(app.shortcut(r.bid), 4), capsWidth(app.shortcut(r.uid), 4));
  // The table always spans the card (band cell): its width minus the cell padding and LabelIndent.
  const tableW = app.pageW - M.cellPadX - (app.st.li ?? 24.3) - ACTION_W - TABLE_GAP;
  let keyW = Math.min(148, widest);
  const forNames = tableW - (14 + 8 + keyW) * 2;
  const nameW = clamp(forNames * 0.5, 0, 118);
  if (forNames < 0) keyW = Math.max(0, keyW + forNames * 0.5);
  const grid: CSSProperties = {
    gridTemplateColumns: `${nameW}px 8px ${keyW}px 14px 1px 13px minmax(0,1fr) 8px ${keyW}px ${TABLE_GAP}px ${ACTION_W}px`,
  };
  return (
    <div className={base.cls}>
      <div className="cth">
        <span className="cthl">BLENDON</span>
        <span className="cthr" style={{ left: nameW + 8 + keyW + 28 + 'px' }}>
          UNITY EDITOR
        </span>
      </div>
      {it.rows.map((r, i) => (
        <ContestedRow key={r.bid + r.ul} r={r} i={i} grid={grid} />
      ))}
    </div>
  );
}
