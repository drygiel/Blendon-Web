// Blendon's Scene View tutorial card: one chapter at a time, three task rows, the current task's hint,
// and the way on once the chapter is done. Docked bottom right, draggable by its header, foldable.
import { useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { D } from '../../window/data/store.ts';
import { TutorialTasks } from '../blendon/tutorial/curriculum.ts';
import { SceneTutorialCard, TutorialProgress } from '../blendon/tutorial/scene-tutorial.ts';
import type { SceneHost } from '../engine/host.ts';
import { iconUrl } from '../unity/icons.ts';
import type { Color } from '../unity/math.ts';
import { useViewSize } from './view-size.ts';
import styles from './TutorialCard.module.scss';

const Width = 330;
const RightMargin = 12;
const BottomMargin = 26;
const TopMargin = 30;
const HeaderHeight = 9 + 15 + 13 + 8;
const SegmentsBand = 3 + 9;
const RowHeight = 27;
const VisibleRows = 3;
const FooterHeight = 32;
const PillWidth = 258;
const PillHeight = 38;
const HintWidth = Width - 12 * 2 - 14 - 9;

/** Badge.FillFor: the accent's hue at a fixed luma, so every chapter's disc weighs the same. */
function badgeFill(c: Color) {
  const k = 0.34 / Math.max(0.01, c.grayscale);
  const ch = (v: number) => Math.round(Math.min(1, v * k) * 255);
  return `rgb(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)})`;
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** TutorialHintStyle.CalcHeight: 10 pt, word-wrapped to the hint column. */
function hintHeight(text: string) {
  if (!text) return 0;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return 0;
  measureCtx.font = '400 10px Inter, system-ui, sans-serif';
  let lines = 1;
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && measureCtx.measureText(next).width > HintWidth) {
      lines++;
      line = word;
    } else line = next;
  }
  return lines * 13 + 8;
}

// "Shift+Mouse 2" -> ["Shift", "Mouse 2"]; a lone "+" key stays a key.
const tokens = (binding: string) => binding.split(/\+(?=.)/).filter(Boolean);

/** `joined`: a "+" between the caps, where the card has the width to spell the chord out. */
export function KeyCaps({
  binding,
  color,
  dim,
  joined = false,
  className,
}: {
  binding: string;
  color: string;
  dim: boolean;
  joined?: boolean;
  className?: string;
}) {
  return (
    <span className={className ?? styles.caps}>
      {tokens(binding).map((t, i) => {
        const mouse = /^Mouse (\d)$/.exec(t);
        const name = mouse ? D.mouseIcons[Number(mouse[1])] : null;
        const url = name ? `${import.meta.env.BASE_URL}plugin/icons/icon_${name.replace(/ /g, '_')}.png` : null;
        const cap = (
          <span key={i} className={styles.cap + (dim ? ' ' + styles.dim : '')} style={{ color }}>
            {url ? (
              <i
                className={styles.mouse}
                style={{ backgroundColor: color, maskImage: `url(${url})`, WebkitMaskImage: `url(${url})` }}
              />
            ) : (
              t
            )}
          </span>
        );
        return joined && i > 0 ? [<span key={'+' + i}>+</span>, cap] : cap;
      })}
    </span>
  );
}

const Close = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M6.5 6.5 13.5 13.5M13.5 6.5 6.5 13.5" />
  </svg>
);

const Chevron = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d={up ? 'M6.5 11.5 10 8l3.5 3.5' : 'M6.5 8.5 10 12l3.5-3.5'} />
  </svg>
);

export function TutorialCard({ host }: { host: SceneHost }) {
  useSyncExternalStore(SceneTutorialCard.subscribe, () => SceneTutorialCard.version);
  const view = useViewSize(host);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);

  const active = SceneTutorialCard.active;
  const card = SceneTutorialCard.window;
  const chapter = card.chapter;
  const index = card.index;
  const tasks = chapter.tasks;
  const visible = card.visible;

  if (!active) return null;

  const done = (id: string) => TutorialProgress.isDone(id);
  const currentTask = tasks.find((t) => !TutorialTasks.isSkipped(t) && !done(t.id)) ?? null;
  const hint = currentTask?.hint ?? '';
  const hintH = hintHeight(hint);
  const fullHeight = HeaderHeight + SegmentsBand + 1 + 5 + VisibleRows * RowHeight + hintH + 7 + 1 + FooterHeight;

  // Too short or narrow for the checklist: the folded pill; below even that, nothing.
  const fits = (w: number, h: number) => w + RightMargin * 2 <= view.w && h + TopMargin + BottomMargin <= view.h;
  const collapsed = SceneTutorialCard.collapsed || !fits(Width, fullHeight);
  const w = collapsed ? PillWidth : Width;
  const h = collapsed ? PillHeight : fullHeight;
  if (!fits(w, h)) return null;

  const [ox, oy] = SceneTutorialCard.offset;
  let x = view.w - w - RightMargin + ox;
  let y = view.h - h - BottomMargin + oy;
  x = Math.min(Math.max(x, RightMargin), Math.max(RightMargin, view.w - w - RightMargin));
  y = Math.min(Math.max(y, TopMargin), Math.max(TopMargin, view.h - h - RightMargin));
  // Slides in from the right edge, the shortcut-tip card's entrance.
  x = view.w + (x - view.w) * card.slide;

  const { done: doneCount, total } = TutorialProgress.count(chapter);
  const complete = doneCount >= total;
  const last = index >= 5;
  const badge = (
    <span className={styles.badge} style={{ background: badgeFill(chapter.accent) }}>
      <img src={iconUrl(chapter.iconName)} alt="" />
    </span>
  );

  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, ox, oy };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) SceneTutorialCard.setOffset(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y);
  };
  const endDrag = () => (drag.current = null);

  const buttons = (
    <div className={styles.buttons}>
      <button
        type="button"
        className={styles.glyph}
        title={collapsed ? 'Show the checklist again' : 'Collapse to a badge'}
        onClick={() => SceneTutorialCard.toggleCollapsed()}
      >
        <Chevron up={collapsed} />
      </button>
      <button
        type="button"
        className={styles.glyph + ' ' + styles.close}
        title="Skip the tutorial"
        onClick={() => setConfirmSkip(true)}
      >
        <Close />
      </button>
    </div>
  );

  // The task window: three rows at a time, the top one fading and the band sliding up as it leaves.
  const exitAlpha = card.exitAlpha;
  const offset = card.scroll * RowHeight;
  const slots = card.phase === 'sliding' ? VisibleRows + 1 : VisibleRows;
  const rowEls = [];
  for (let slot = 0; slot < slots; slot++) {
    const task = visible[card.windowStart + slot];
    if (!task) break;
    const isDone = done(task.id);
    const current = task === currentTask;
    const alpha = slot === 0 ? exitAlpha : 1;
    const color = isDone ? 'rgba(255,255,255,0.4)' : current ? '#fff' : 'rgba(255,255,255,0.78)';
    const keys = TutorialTasks.keys(task);
    rowEls.push(
      <div key={task.id} className={styles.row + (current ? ' ' + styles.current : '')} style={{ opacity: alpha }}>
        <span className={styles.box + (isDone ? ' ' + styles.boxDone : current ? ' ' + styles.boxCurrent : '')}>
          {isDone ? '✓' : ''}
        </span>
        <span className={styles.task} style={{ color }} title={task.hint}>
          {task.title}
        </span>
        {keys && <KeyCaps binding={keys} color={color} dim={isDone} />}
      </div>,
    );
    if (current && hint)
      rowEls.push(
        <div key="hint" className={styles.hint} style={{ height: hintH }}>
          {hint}
        </div>,
      );
  }

  return (
    <div
      className={styles.card + (collapsed ? ' ' + styles.pill : '')}
      style={{ left: x, top: y, width: w, height: h }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {collapsed ? (
        <div className={styles.pillBody} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}>
          {badge}
          <div className={styles.text}>
            <div className={styles.title}>{chapter.title}</div>
            <div className={styles.subtitle}>
              Chapter {index + 1} of 6 · {doneCount}/{total}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.header} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}>
            {badge}
            <div className={styles.text}>
              <div className={styles.title}>{chapter.title}</div>
              <div className={styles.subtitle}>{chapter.subtitle}</div>
            </div>
          </div>
          <div className={styles.segments}>
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} className={i < index ? styles.segDone : i === index ? styles.segCurrent : ''} />
            ))}
          </div>
          <div className={styles.rule} />
          <div className={styles.window} style={{ height: VisibleRows * RowHeight + hintH }}>
            <div style={{ transform: `translateY(${-offset}px)` }}>{rowEls}</div>
          </div>
          <div className={styles.footer}>
            <span className={complete ? styles.complete : ''}>
              {complete ? 'Chapter complete' : `${doneCount} of ${total} done`}
            </span>
            {complete ? (
              <button type="button" className={styles.next} onClick={() => SceneTutorialCard.advance()}>
                {last ? 'Finish' : `Start chapter ${index + 2}`}
              </button>
            ) : (
              <span>Chapter {index + 1} of 6</span>
            )}
          </div>
        </>
      )}
      {buttons}
      {confirmSkip && (
        <div className={styles.confirm} role="dialog" aria-label="Skip the Blendon tutorial?">
          <p>
            <b>Skip the Blendon tutorial?</b>
            The card stops appearing for the rest of this visit. Everything you have ticked off is kept.
          </p>
          <div>
            <button type="button" onClick={() => setConfirmSkip(false)}>
              Keep Going
            </button>
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                setConfirmSkip(false);
                SceneTutorialCard.skip();
              }}
            >
              Skip Tutorial
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
