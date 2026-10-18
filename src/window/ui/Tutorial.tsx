// The Tutorial page (TutorialPage, TutorialTaskRow): a header card with the badge switch and overall progress,
// then one card per chapter listing every task, the current one open with its picture, hint and clip.
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { publicUrl } from '../../lib/links.ts';
import { D } from '../../plugin/window-data.ts';
import {
  findTask,
  shortcutSwitchedOn,
  TutorialCurriculum,
  type TutorialTask,
} from '../../scene/blendon/tutorial/curriculum.ts';
import { TutorialProgress } from '../../scene/blendon/tutorial/progress.ts';
import { SceneTutorial } from '../../scene/blendon/tutorial/scene-tutorial.ts';
import { TutorialHint } from '../../scene/ui/TutorialHint.tsx';
import type { ItemOf } from '../core/builder.ts';
import { iconStyle } from '../core/icons.ts';
import { pageInfo, type WindowModel } from '../core/model.ts';
import type { TipSource } from '../core/state.ts';
import { TutorialPageAnimation, type RowLook } from '../core/tutorial-anim.ts';
import { clamp, rgba, tinted } from '../core/util.ts';
import { Switch } from './Cards.tsx';
import { Caps } from './common.tsx';
import { useApp, useTip } from './context.ts';
import { itemBase } from './item-base.ts';

const ShowKey = 'GeneralSettings.ShowTutorial';
const ContentPadding = 12;

// Palette.Tutorial* and the text colours, dark skin.
const TextPrimary = [217, 217, 217];
const TextSecondary = [166, 166, 166];
const DoneText = '#9BDDAB';
const Caption = '#808080';

const mix = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

const Tip = {
  title: (t: string) => '<size=14><b>' + t + '</b></size>\n',
  note: (t: string) => '\n\n<size=9><color=#92929A>' + t + '</color></size>',
};

// ---- frames -----------------------------------------------------------------------------------------

const frameListeners = new Set<() => void>();
let frameVersion = 0;
let raf = 0;
let syncedFor = -1;

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function sync() {
  syncedFor = TutorialProgress.version;
  TutorialPageAnimation.sync(performance.now() / 1000, reducedMotion());
}

// Nothing repaints an idle page, so a playing step drives its own frames and stops when its time is up.
function tick() {
  raf = 0;
  sync();
  frameVersion++;
  for (const l of frameListeners) l();
  if (TutorialPageAnimation.busy && frameListeners.size) raf = requestAnimationFrame(tick);
}

function kick() {
  if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(tick);
}

TutorialProgress.subscribe(kick);

function subscribeFrames(fn: () => void) {
  frameListeners.add(fn);
  kick();
  return () => void frameListeners.delete(fn);
}

/** Re-renders on every tick and animation frame. A tick the page hasn't seen yet is taken in right away. */
function useTutorialFrame() {
  useSyncExternalStore(subscribeFrames, () => frameVersion);
  if (syncedFor !== TutorialProgress.version) sync();
}

// ---- reveal -----------------------------------------------------------------------------------------

/** Least scroll that shows the whole row, its top when it is taller than the view. */
function scrollIntoView(app: WindowModel, el: HTMLElement) {
  const scroll = app.inst.scroll;
  if (!scroll) return;
  const top = el.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
  let y = scroll.scrollTop;
  if (top + el.offsetHeight + ContentPadding > y + scroll.clientHeight)
    y = top + el.offsetHeight + ContentPadding - scroll.clientHeight;
  if (top - ContentPadding < y) y = top - ContentPadding;
  y = clamp(y, 0, Math.max(0, scroll.scrollHeight - scroll.clientHeight));
  if (Math.abs(y - scroll.scrollTop) < 0.5) return;
  scroll.scrollTop = y;
  app.syncScrollbars();
}

// ---- rows -------------------------------------------------------------------------------------------

/** Page whose rows hold the shortcut. Null when only the Keyboard page lists it. */
function ownerOf(shortcutId: string) {
  for (const info of D.catalog)
    if (info.id !== 'Keyboard' && D.pageShortcuts[info.id]?.includes(shortcutId)) return info.id;
  return null;
}

/** What to switch on to get the task back (TutorialTaskRow.SkipReason). */
function skipReason(app: WindowModel, task: TutorialTask) {
  if (task.notInDemo) return 'Not in this demo: ' + task.notInDemo;
  if (!app.val('GeneralSettings.Enabled')) return 'Skipped while Blendon is switched off';

  switch (task.skippedBy()) {
    case 'page':
      return 'Skipped while ' + pageInfo(task.page).label + ' is switched off. Switch it on to do this task';
    case 'switch':
      return 'Skipped while ' + task.switchText + '. Change that to do this task';
    case 'earlier':
      return (
        'Skipped while ' +
        earlierTitles(task) +
        ' skipped. This task builds on ' +
        (task.earlierIds.length > 1 ? 'one of them' : 'it')
      );
  }

  // A feature switched off on a page that stays on shuts its key, e.g. one of the two histories.
  const shortcut = task.shortcutIds[0] ?? task.keysShortcutId;
  const owner = shortcut && !shortcutSwitchedOn(shortcut) ? ownerOf(shortcut) : null;
  if (owner)
    return (
      'Skipped while its feature is switched off on the ' +
      pageInfo(owner).label +
      ' page. Switch it on to do this task'
    );

  return 'Skipped while its shortcut has no key. Give it one on the Keyboard page to do this task';
}

// "A" is / "A" and "B" are
function earlierTitles(task: TutorialTask) {
  const titles = task.earlierIds.map((id) => '"' + (findTask(id)?.title ?? id) + '"');
  return titles.join(' and ') + (titles.length > 1 ? ' are' : ' is');
}

interface RowInfo {
  keys: string;
  skipped: boolean;
  /** Open, not skipped and not the current one: a click makes it current. */
  choosable: boolean;
  tip: TipSource;
  /** Where its keys are set, for the gear; null for no gear. */
  gear: { page: string; hl?: string; tip: string } | null;
}

function rowInfo(app: WindowModel, task: TutorialTask, currentId: string | null): RowInfo {
  const skipped = task.isSkipped();
  const choosable = !skipped && !TutorialProgress.isDone(task.id) && task.id !== currentId;
  let text = Tip.title(task.title) + task.hint;
  if (skipped) text += Tip.note(skipReason(app, task));
  else if (choosable) text += Tip.note(D.consts.tutorialChooseNote ?? '');

  // The shortcut's own page, not the Keyboard list, so the reader stays with the tool.
  const shortcut = task.shortcutIds[0] ?? task.keysShortcutId;
  const keysPage = shortcut ? (ownerOf(shortcut) ?? task.page) : task.keysSetting ? task.page : task.keysPage || null;
  // A switched-off feature has no keys to set, but its page has the switch.
  const page = keysPage ?? (skipped && !task.notInDemo ? task.page : null);
  const label = page ? pageInfo(page).label : '';
  return {
    keys: task.keys(),
    skipped,
    choosable,
    tip: { t: text, url: publicUrl(task.picture), ar: task.aspect },
    gear: page
      ? {
          page,
          hl: shortcut || task.keysSetting || undefined,
          tip: keysPage ? `Change the keys on the ${label} page` : `Open the ${label} page`,
        }
      : null,
  };
}

/** Picture and hint under the title line, laid out at full height and clipped to what shows. */
function Detail({ task, open }: { task: TutorialTask; open: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!outer.current || !inner.current) return;
    outer.current.style.height = open >= 1 ? '' : inner.current.offsetHeight * open + 'px';
  });
  const picture = publicUrl(task.picture);
  const video = open >= 1 && task.clip && !reducedMotion() ? publicUrl(task.clip) : '';
  return (
    <div className="tutd" ref={outer} style={open >= 1 ? undefined : { height: 0 }}>
      <div className="tutdi" ref={inner} style={open >= 1 ? undefined : { opacity: open }}>
        <div className="tutpic" style={{ aspectRatio: task.aspect || '16 / 9' }}>
          <img src={picture} alt="" />
          {video && (
            <video key={video} src={video} poster={picture} autoPlay muted loop playsInline aria-hidden="true" />
          )}
        </div>
        <div className="tuthint">
          <TutorialHint text={task.hint} />
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  look,
  current,
  dis,
}: {
  task: TutorialTask;
  look: RowLook;
  current: string | null;
  dis: boolean;
}) {
  const app = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const info = rowInfo(app, task, current);
  const open = look.open;
  const skipped = info.skipped && !look.done && open <= 0;
  // Folded rows only, an opening one is already on its way to current.
  const choosable = info.choosable && !look.done && open <= 0 && !dis;
  const tip = useTip(info.tip);
  const gearTip = useTip(info.gear ? { t: info.gear.tip, native: true } : null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (TutorialPageAnimation.opening === task.id) scrollIntoView(app, el);
    else if (open >= 1 && TutorialPageAnimation.revealPending && task.id === current) {
      TutorialPageAnimation.takeReveal();
      // After the page switch's own scroll to the top, which waits a frame too.
      requestAnimationFrame(() => scrollIntoView(app, el));
    }
  });

  const color = look.done ? DoneText : skipped ? rgba(Caption, 0.5) : mix(TextSecondary, TextPrimary, open);
  const ground: CSSProperties = look.done
    ? { background: `rgba(82,217,115,${(0.06 + 0.24 * look.flash).toFixed(3)})` }
    : open > 0
      ? { background: `rgba(255,255,255,${(0.045 * open).toFixed(4)})` }
      : {};
  const box: CSSProperties = look.done
    ? { transform: `scale(${look.pop})` }
    : {
        borderColor:
          open > 0
            ? `rgba(${Math.round(255 + (237 - 255) * open)},${Math.round(255 + (140 - 255) * open)},${Math.round(255 + (38 - 255) * open)},${(0.26 + 0.74 * open).toFixed(3)})`
            : undefined,
        opacity: skipped ? 0.5 : undefined,
      };
  return (
    <div ref={ref} className={'tutr' + (choosable ? ' pick' : '') + (open >= 0.5 ? ' cur' : '')}>
      <i className="tutg" style={ground} />
      {open > 0 && !look.done && <i className="tutrail" style={{ opacity: open }} />}
      <div className="tutl">
        <div
          className="tutt"
          {...tip}
          onMouseDown={(e) => {
            if (!choosable || e.button !== 0) return;
            app.dismissTip();
            TutorialProgress.choose(task.id);
          }}
        >
          <span className={'tutbox' + (look.done ? ' done' : '')} style={box}>
            {look.done ? '✓' : ''}
          </span>
          <span className="tutname" style={{ color }}>
            {task.title}
          </span>
          {skipped ? (
            <span className="tuttag">{task.notInDemo ? 'DEMO' : 'OFF'}</span>
          ) : (
            info.keys && (
              <span className={'tutkeys' + (look.done ? ' dim' : '')}>
                <Caps binding={info.keys} tint={color} />
              </span>
            )
          )}
        </div>
        {info.gear ? (
          <button
            className="tutgear"
            disabled={dis}
            onClick={() => {
              app.dismissTip();
              if (info.gear) app.goTo(info.gear.page, info.gear.hl);
            }}
            {...gearTip}
            aria-label={info.gear.tip}
          >
            <span style={iconStyle('d_Settings', 12, 'var(--gc)')} />
          </button>
        ) : (
          <span className="tutgear" />
        )}
      </div>
      {open > 0 && <Detail task={task} open={open} />}
    </div>
  );
}

// ---- items ------------------------------------------------------------------------------------------

/** The page's opening card: the badge switch beside the page name, the progress and Start Over under it. */
export function TutorialHeader({ it }: { it: ItemOf<'tutHeader'> }) {
  const app = useApp();
  useTutorialFrame();
  const base = itemBase(app, it);
  const on = !!app.val(ShowKey);
  const info = pageInfo('Tutorial');
  const C = D.consts;
  const switchTip = useTip(it.tip);
  const startTip = useTip({ t: C.tutorialStartOverTip ?? '', i: C.tutorialStartOverImage ?? '' });
  useEffect(() => TutorialPageAnimation.requestReveal(), []);

  const { done, total } = TutorialProgress.totals();
  const status = TutorialProgress.finished
    ? `Finished - all ${total} tasks done or skipped.`
    : `${done} of ${total} tasks done` + (on ? '.' : ', paused while the badge is off.');
  return (
    <div className={base.cls + ' tuth'}>
      <div className="msw" {...switchTip}>
        <span className="mtile">
          <span style={iconStyle(info.icon, 18, '#87B8DE')} />
        </span>
        <div className="mtx">
          <div className="mt">{info.label}</div>
          <div className="ms">{info.summary}</div>
        </div>
        <Switch on={on} toggle={() => !it.dis && app.set(ShowKey, !on)} label={info.label} />
      </div>
      <div className="tutrule" />
      {/* One segment per chapter, as wide as its share of the tasks. Green once complete. */}
      <div className="tutbar">
        {TutorialCurriculum.map((c) => {
          const n = TutorialProgress.count(c);
          return (
            <i key={c.title} style={{ flexGrow: n.total }}>
              {n.done > 0 && (
                <b
                  className={n.done >= n.total ? 'full' : ''}
                  style={{ width: ((100 * n.done) / Math.max(1, n.total)).toFixed(2) + '%' }}
                />
              )}
            </i>
          );
        })}
      </div>
      <div className="tutstat">
        <span>{status}</span>
        <button
          className="nb"
          disabled={it.dis}
          onClick={() =>
            app.confirm({
              title: C.tutorialRestartTitle ?? '',
              body: C.tutorialRestartBody ?? '',
              ok: 'Start Over',
              run: () => SceneTutorial.restart(),
            })
          }
          {...startTip}
        >
          {'↺  Start Over'}
        </button>
      </div>
    </div>
  );
}

/** One chapter's section card: its tasks, their keys, and a tick per task done. */
export function TutorialChapter({ it }: { it: ItemOf<'tutChapter'> }) {
  useTutorialFrame();
  const chapter = TutorialCurriculum[it.index];
  const { done, total } = TutorialProgress.count(chapter);
  const complete = done >= total;
  const current = TutorialProgress.currentId;
  return (
    <div className={'tutc' + (it.dis ? ' dis' : '')} style={{ '--acc': rgba(chapter.accent, 0.55) } as CSSProperties}>
      <div className="tutch">
        <span className="chtile" style={{ background: rgba(chapter.accent, 0.16) }}>
          <span style={iconStyle(chapter.iconName, 11, chapter.accent)} />
        </span>
        <span className="chl" style={{ color: tinted(chapter.accent) }}>
          {chapter.title.toUpperCase()}
        </span>
        <span className="tutsub">{chapter.subtitle}</span>
        {complete && <span className="tutbox done">✓</span>}
        <span className="tutcount" style={complete ? { color: DoneText } : undefined}>
          {done}/{total}
        </span>
      </div>
      <div className="tutrows">
        {chapter.tasks.map((t) => (
          <TaskRow key={t.id} task={t} look={TutorialPageAnimation.lookOf(t.id)} current={current} dis={it.dis} />
        ))}
      </div>
    </div>
  );
}
