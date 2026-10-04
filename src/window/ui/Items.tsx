// One builder item -> its row, by kind.
import { MANUAL_URL } from '../../lib/links.ts';
import type { Item, ItemOf } from '../core/builder.ts';
import { iconStyle } from '../core/icons.ts';
import { extent, preferredHeight, settings } from '../gizmo/gizmo.ts';
import { ContestedTable, KeyboardPresets, MasterCard, OverviewMaster } from './Cards.tsx';
import { Runs } from './common.tsx';
import { useApp, useTip } from './context.ts';
import { ColorField, MaskField, PopupField, ShortcutField, SliderField, ToggleField } from './Fields.tsx';
import { indent, itemBase } from './item-base.ts';
import {
  ExtrasTable,
  FeatureHead,
  FeaturePie,
  FeatureRow,
  FeatureShortcut,
  FrameSequence,
  PieEmpty,
  PieFooter,
  PieTable,
} from './Tables.tsx';

// Unity's preview rect against the row the layout reserves for it: a little taller (the layout
// takes the difference back in the gap after the card) and starting a little higher.
const PREV_TRIM = 3.05;
const PREV_LIFT = 1.2;

function Caption({ it }: { it: ItemOf<'cap'> }) {
  return (
    <div className="cap">
      <span className="cic" style={iconStyle(it.icon, 16, it.acc)} />
      <span className="ctx">{it.text}</span>
    </div>
  );
}

function NativeNote({ it }: { it: ItemOf<'nat'> }) {
  const app = useApp();
  const tip = useTip({ t: it.hint, native: true });
  return (
    <div className={itemBase(app, it).cls}>
      <div className="lbl" />
      <div className="fld nat">
        <span className="nlead">{it.lead}</span>
        <span
          className="lnk sm"
          onClick={() => app.demo(`In Unity this opens the Editor's Shortcuts window at ${it.ul}.`)}
          {...tip}
        >
          {it.link}
        </span>
      </div>
    </div>
  );
}

function Note({ it }: { it: ItemOf<'note'> }) {
  const app = useApp();
  const tip = useTip(it.tip);
  return (
    <div className={itemBase(app, it).cls} {...tip}>
      <Runs runs={it.runs} />
    </div>
  );
}

function Banner({ it }: { it: ItemOf<'banner'> }) {
  const app = useApp();
  const cls = 'bn' + (it.warn ? ' warn' : ' info') + (it.indent ? ' ind' : '') + (it.lead ? ' lead' : '');
  const link = it.link;
  let body = <Runs runs={it.runs} />;
  if (link) {
    const i = it.runs.findIndex((r) => r.t === link.word);
    const text = (from: number, to?: number) =>
      it.runs
        .slice(from, to)
        .map((r) => r.t)
        .join('');
    body = (
      <>
        {text(0, i)}
        <span
          className="blk"
          style={{ color: link.accent }}
          onClick={() => app.goTo(link.page, 'GeneralSettings.AxisColorX')}
        >
          {link.word}
        </span>
        {text(i + 1)}
      </>
    );
  }
  return (
    <div className={cls}>
      <i className="bdg">
        <b />
        <b />
      </i>
      <div className="btx">{body}</div>
    </div>
  );
}

function PageLink({ it }: { it: ItemOf<'plink'> }) {
  const app = useApp();
  const tip = useTip(it.tip);
  return (
    <div className={itemBase(app, it).cls}>
      <button className="plb" onClick={() => app.goTo(it.page)} {...tip}>
        <span className="pli" style={iconStyle(it.icon, 14, it.accent)} />
        <span>{it.text}</span>
      </button>
    </div>
  );
}

// The Overview's one text link is the manual, which the site carries too.
function TextLink({ it }: { it: ItemOf<'link'> }) {
  const app = useApp();
  const tip = useTip(it.tip);
  const open = () => {
    app.dismissTip();
    window.open(MANUAL_URL, '_blank', 'noopener');
  };
  return (
    <div className={itemBase(app, it).cls}>
      <span className="nlead">{it.lead}</span>
      <span className="lnk sm" onClick={open} {...tip}>
        {it.text}
      </span>
    </div>
  );
}

function GizmoPreview({ it }: { it: ItemOf<'prev'> }) {
  const app = useApp();
  const [up, down] = extent(settings(app, it.owner));
  const H = preferredHeight(up, down);
  const live = !it.dis;
  const registry = app.inst.gizmos;
  return (
    <div className="it-prev" style={{ height: H - PREV_TRIM }}>
      <canvas
        ref={(el) => {
          if (!el) return;
          registry.set(it.owner, { el, live });
          return () => {
            if (registry.get(it.owner)?.el === el) registry.delete(it.owner);
          };
        }}
        // Palette.DisabledTint: a switched-off tool's picture is faded, and stops spinning.
        style={{ top: -PREV_LIFT, height: H, opacity: it.dis ? 0.45 : undefined }}
        role="img"
        aria-label="Live 3D preview of the gizmo"
      />
    </div>
  );
}

function ActionRow({ it }: { it: ItemOf<'action'> }) {
  const app = useApp();
  const tip = useTip(it.tip);
  const click = () => {
    if (it.dis) return;
    if (it.act === 'restart')
      app.confirm({
        title: 'Start the tutorial over?',
        body: 'Every task will be un-ticked and the card goes back to chapter one.',
        ok: 'Start Over',
        run: () => window.dispatchEvent(new Event('blendon:tutorial-restart')),
      });
    else window.dispatchEvent(new Event('blendon:tips-reset'));
  };
  return (
    <div className={itemBase(app, it).cls}>
      <div className="lbl" {...tip}>
        {indent(it.label)}
      </div>
      <div className="fld fr2">
        <button className="nb" onClick={click} {...tip}>
          {it.btn}
        </button>
      </div>
    </div>
  );
}

const ioDemo = (t: string) =>
  /import/i.test(t)
    ? 'In Unity this loads Blendon settings from a file you pick.'
    : /export/i.test(t)
      ? 'In Unity this saves every Blendon setting to a file.'
      : `In Unity this opens ${t}.`;

function ActionPair({ it }: { it: ItemOf<'actions2'> }) {
  const app = useApp();
  const aTip = useTip(it.a.tip);
  const bTip = useTip(it.b.tip);
  return (
    <div className={itemBase(app, it).cls}>
      <div className="lbl" />
      <div className="fld utwo">
        <button className="nb" onClick={() => app.demo(ioDemo(it.a.text))} {...aTip}>
          {it.a.text}
        </button>
        <button className="nb" onClick={() => app.demo(ioDemo(it.b.text))} {...bTip}>
          {it.b.text}
        </button>
      </div>
    </div>
  );
}

export function ItemView({ it }: { it: Item }) {
  switch (it.k) {
    case 'cap':
      return <Caption it={it} />;
    case 'tog':
      return <ToggleField it={it} />;
    case 'sld':
      return <SliderField it={it} />;
    case 'pop':
      return <PopupField it={it} />;
    case 'msk':
      return <MaskField it={it} />;
    case 'col':
      return <ColorField it={it} />;
    case 'sc':
      return <ShortcutField it={it} />;
    case 'nat':
      return <NativeNote it={it} />;
    case 'note':
      return <Note it={it} />;
    case 'banner':
      return <Banner it={it} />;
    case 'plink':
      return <PageLink it={it} />;
    case 'link':
      return <TextLink it={it} />;
    case 'space':
      return <div style={{ height: it.h }} />;
    case 'prev':
      return <GizmoPreview it={it} />;
    case 'action':
      return <ActionRow it={it} />;
    case 'actions2':
      return <ActionPair it={it} />;
    case 'master':
      return <MasterCard it={it} />;
    case 'ovMaster':
      return <OverviewMaster it={it} />;
    case 'kbPreset':
      return <KeyboardPresets it={it} />;
    case 'contested':
      return <ContestedTable it={it} />;
    case 'fhead':
      return <FeatureHead it={it} />;
    case 'frow':
      return <FeatureRow it={it} />;
    case 'fpie':
      return <FeaturePie it={it} />;
    case 'fsub':
      return <FeatureShortcut it={it} />;
    case 'frameSeq':
      return <FrameSequence it={it} />;
    case 'extras':
      return <ExtrasTable it={it} />;
    case 'pieTable':
      return <PieTable it={it} />;
    case 'pieEmpty':
      return <PieEmpty it={it} />;
    case 'pieFooter':
      return <PieFooter it={it} />;
  }
}
