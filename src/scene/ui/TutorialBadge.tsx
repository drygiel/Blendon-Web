// TutorialBadge: the tutorial's whole Scene view footprint, a link to the checklist page and a skip button in the
// corner. Once started it names the task asked for next, with its keys and a hover card. A ticked task flashes
// its title here for a moment, so the tick is noticed mid-gesture. Dragged by its logo, the spot is kept per
// visitor.
import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from 'react';
import { PlaygroundEvents } from '../../bridge/events.ts';
import { publicUrl } from '../../lib/links.ts';
import { D } from '../../plugin/window-data.ts';
import { findTask, type TutorialTask } from '../blendon/tutorial/curriculum.ts';
import { TutorialProgress } from '../blendon/tutorial/progress.ts';
import { SceneTutorial } from '../blendon/tutorial/scene-tutorial.ts';
import { TutorialBadgeSpot } from '../blendon/tutorial/badge-spot.ts';
import { reducedMotion } from '../blendon/navigation/camera.ts';
import { GeneralSettings } from '../blendon/settings.ts';
import { BlendonContext, blendonContextActive, toggleBlendonKey, ToggleContextId } from '../blendon/tool-context.ts';
import type { SceneHost } from '../engine/host.ts';
import { Selection } from '../unity/editor.ts';
import { KeyCaps } from './KeyCaps.tsx';
import { TipShowDelayMs, TutorialTip } from './TutorialTip.tsx';
import { useViewSize } from './view-size.ts';
import styles from './TutorialBadge.module.scss';

const RightMargin = 12;
/** Clears the gizmo HUD's gutter with as much air under the badge as beside it. */
const BottomMargin = 36;
/** How close a dragged badge may come to the view's edges. */
const EdgeMargin = 4;
const Height = 34;
const PadX = 8;
const TileSize = 22;
const TileGap = 8;
const CheckSize = 14;
const CheckGap = 6;
const CloseSize = 18;
const CloseGap = 10;
/** A long task title is clipped here rather than stretching the badge across the view. */
const MaxTextWidth = 260;
/** Narrower than this and the badge isn't drawn at all. */
const MinTextWidth = 60;
const KeysGap = 10;
/** Keys never take more of a squeezed line than this, the title still needs a word. */
const KeysShare = 0.5;
/** How far the two lines roll past each other while they cross-fade. */
const RollDistance = 6;
const Chrome = PadX + TileSize + TileGap + CloseGap + CloseSize + PadX;

const SlideSeconds = 0.22;
const FlashInSeconds = 0.2;
const FlashHoldSeconds = 2;
const FlashOutSeconds = 0.25;
const FlashSeconds = FlashInSeconds + FlashHoldSeconds + FlashOutSeconds;

// Its own key, not the progress one: Start Over clears progress, not where the badge sits.
const OffsetKey = 'blendon.tutorialBadge';

const Logo = publicUrl('plugin/icons/B@2x.png');

const SwitchText = 'Switch to Blendon';

const clock = () => performance.now() / 1000;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function loadOffset(): [number, number] {
  try {
    const v = JSON.parse(localStorage.getItem(OffsetKey) ?? 'null') as unknown;
    if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number') return [v[0], v[1]];
  } catch {
    // Unreadable or blocked: the default spot.
  }
  return [0, 0];
}

function saveOffset(o: [number, number]) {
  try {
    localStorage.setItem(OffsetKey, JSON.stringify(o));
  } catch {
    // Blocked storage: the spot lasts for this visit.
  }
}

/** 0 shows the resting line, 1 the ticked task. */
function flashAmount(start: number, now: number) {
  if (start < 0) return 0;
  let t = now - start;
  if (t < FlashInSeconds) return easeOutCubic(t / FlashInSeconds);
  t -= FlashInSeconds + FlashHoldSeconds;
  if (t < 0) return 1;
  return 1 - easeOutCubic(t / FlashOutSeconds);
}

const flashing = (start: number, now: number) => start >= 0 && now - start < FlashSeconds;

const Close = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path d="M5.5 5.5 12.5 12.5M12.5 5.5 5.5 12.5" />
  </svg>
);

// One badge per page, so the moment it first showed is kept here, by the progress epoch it showed for.
const shown = { at: 0, epoch: -1 };

/** When the badge slid in. Start Over makes it slide in again, like the first time it showed. */
function shownAtFor(now: number, showing: boolean) {
  if (shown.epoch !== TutorialProgress.epoch) {
    shown.epoch = TutorialProgress.epoch;
    shown.at = 0;
  }
  if (showing && shown.at <= 0) shown.at = now;
  return shown.at;
}

const selectionVersion = () => Selection.version;
const subscribeSelection = (fn: () => void) => {
  Selection.selectionChanged.add(fn);
  return () => Selection.selectionChanged.remove(fn);
};

export function TutorialBadge({ host }: { host: SceneHost }) {
  useSyncExternalStore(TutorialProgress.subscribe, () => TutorialProgress.version);
  // What a task needs reads the selection, which changes without a tick.
  useSyncExternalStore(subscribeSelection, selectionVersion);
  // The tasks teach the Blender way, which Unity's own contexts don't have.
  const switching = !useSyncExternalStore(BlendonContext.subscribe, blendonContextActive);
  const view = useViewSize(host);
  const [, frame] = useReducer((n: number) => n + 1, 0);
  const [offset, setOffset] = useState(loadOffset);
  const [flashState, setFlash] = useState({ start: -1, title: '', epoch: -1 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; last?: [number, number] } | null>(null);
  const [held, setHeld] = useState(false);
  const measure = useRef<HTMLSpanElement>(null);
  const [widths, setWidths] = useState({ rest: 0, keys: 0, done: 0 });
  const [hover, setHover] = useState<{ id: string; shown: boolean } | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  // A tip any input took down stays away until the cursor leaves the line.
  const dismissed = useRef<string | null>(null);

  const now = clock();
  // Start Over leaves no flash owed.
  const flash = flashState.epoch === TutorialProgress.epoch ? flashState : { start: -1, title: '' };

  useEffect(
    () =>
      TutorialProgress.onCompleted((id) =>
        setFlash((prev) => {
          const t = clock();
          const start = prev.epoch === TutorialProgress.epoch ? prev.start : -1;
          // A tick mid-flash keeps the done line up and restarts its hold, no blink in between.
          return {
            start: t - FlashInSeconds * flashAmount(start, t),
            title: findTask(id)?.title ?? '',
            epoch: TutorialProgress.epoch,
          };
        }),
      ),
    [],
  );

  // The resting line: the label until started, then the task asked for next, or what it needs first.
  const task: TutorialTask | null = TutorialProgress.started ? TutorialProgress.current() : null;
  const unmet = !!task && !!task.needsText && !task.needsMet();
  // No keys beside a need, they'd read as the way to meet it.
  const taskText = task ? (unmet ? task.needsText : task.title) : (D.consts.tutorialBadgeLabel ?? 'Blendon Tutorial');
  const taskKeys = task && !unmet ? task.keys() : '';
  const restText = switching ? SwitchText : taskText;
  const keys = switching ? toggleBlendonKey() : taskKeys;

  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    const [rest, caps, done] = [...el.children].map((c) => (c as HTMLElement).offsetWidth);
    setWidths((w) => (w.rest === rest && w.keys === caps && w.done === done ? w : { rest, keys: caps, done }));
  }, [restText, keys, flash.title]);

  const f = flashAmount(flash.start, now);
  const isFlashing = flashing(flash.start, now);
  // The last task's flash is still owed after the tutorial is finished.
  const visible = SceneTutorial.isShowing || (isFlashing && GeneralSettings.Enabled && GeneralSettings.ShowTutorial);
  const fits = Chrome + MinTextWidth + EdgeMargin * 2 <= view.w && Height + EdgeMargin * 2 <= view.h;
  const shownAt = shownAtFor(now, visible && fits);
  const sliding = shownAt > 0 && now - shownAt < SlideSeconds;
  const fading =
    isFlashing && (now - flash.start < FlashInSeconds || now - flash.start >= FlashInSeconds + FlashHoldSeconds);
  const holdEnd = flash.start + FlashInSeconds + FlashHoldSeconds;

  // Slide and flash run on the clock. The hold needs no frames, only a wake-up at its end.
  useEffect(() => {
    if (!visible) return;
    if (sliding || fading) {
      const raf = requestAnimationFrame(frame);
      return () => cancelAnimationFrame(raf);
    }
    if (isFlashing) {
      const wait = holdEnd - clock();
      const timer = window.setTimeout(frame, Math.max(0, wait * 1000));
      return () => window.clearTimeout(timer);
    }
  });

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  useEffect(() => {
    if (!hover) return;
    const dismiss = () => {
      dismissed.current = hover.id;
      window.clearTimeout(hoverTimer.current);
      setHover(null);
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [hover]);

  const keysNatural = keys ? widths.keys : 0;
  const restingWidth = Chrome + Math.min(widths.rest, MaxTextWidth) + (keysNatural ? keysNatural + KeysGap : 0);
  const flashWidth = Chrome + CheckSize + CheckGap + Math.min(widths.done, MaxTextWidth);
  const width = Math.min(lerp(restingWidth, flashWidth, f), view.w - EdgeMargin * 2);

  // Bottom-right spot plus the offset, kept in the view so a shrunk view can't push the badge out. The right
  // edge stays put while the badge widens for a title.
  const anchorX = (w: number) => view.w - w - RightMargin;
  const anchorY = view.h - Height - BottomMargin;
  const clampX = (x: number, w: number) => clamp(x, EdgeMargin, Math.max(EdgeMargin, view.w - w - EdgeMargin));
  const clampY = (y: number) => clamp(y, EdgeMargin, Math.max(EdgeMargin, view.h - Height - EdgeMargin));
  const spotX = clampX(anchorX(width) + offset[0], width);
  const spotY = clampY(anchorY + offset[1]);

  // Docked, not mid-slide, so a card kept clear of the badge doesn't drift.
  const drawn = visible && fits;
  useLayoutEffect(() => {
    TutorialBadgeSpot.setBounds(drawn ? { x: spotX, y: spotY, w: width, h: Height } : null);
  });
  useLayoutEffect(() => () => TutorialBadgeSpot.setBounds(null), []);

  const measuring = (
    <span ref={measure} className={styles.measure} aria-hidden="true">
      <span className={styles.label}>{restText}</span>
      <span>{keys && <KeyCaps binding={keys} color="#fff" dim={false} joined />}</span>
      <span className={styles.label}>{flash.title}</span>
    </span>
  );
  if (!drawn) return measuring;
  // Slides in from the right like the shortcut-tip card. Reduced motion keeps the fades and cuts the moves.
  const slide = reducedMotion() ? 1 : easeOutCubic((now - shownAt) / SlideSeconds);
  const x = Math.round(lerp(view.w, spotX, slide));
  const y = Math.round(spotY);

  const textW = Math.max(0, width - Chrome);
  const keysW = keysNatural ? Math.min(keysNatural, textW * KeysShare) : 0;

  const startDrag = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, ox: spotX - anchorX(width), oy: spotY - anchorY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setHeld(true);
  };
  const moveDrag = (e: PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    // Kept clamped while dragging, so dragging back has no dead zone.
    const nx = clampX(anchorX(width) + d.ox + e.clientX - d.x, width) - anchorX(width);
    const ny = clampY(anchorY + d.oy + e.clientY - d.y) - anchorY;
    d.last = [nx, ny];
    setOffset(d.last);
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setHeld(false);
    if (d.last) saveOffset(d.last);
  };

  const open = () => {
    // The label stands for "start": from now on the line names the first task.
    TutorialProgress.start();
    PlaygroundEvents.emit('openSettings', { page: 'Tutorial' });
  };

  // The key row, where the way back can be seen and rebound.
  const openSwitch = () => PlaygroundEvents.emit('openSettings', { page: 'Overview', hl: ToggleContextId });

  // The task asked for, in detail, while its line is up.
  const tipTask = f < 0.5 && !switching ? task : null;
  const enterLine = (e: PointerEvent<HTMLElement>) => {
    if (!tipTask || e.pointerType !== 'mouse' || drag.current || dismissed.current === tipTask.id) return;
    window.clearTimeout(hoverTimer.current);
    const id = tipTask.id;
    setHover({ id, shown: false });
    hoverTimer.current = window.setTimeout(() => setHover({ id, shown: true }), TipShowDelayMs);
  };
  const leaveLine = () => {
    dismissed.current = null;
    window.clearTimeout(hoverTimer.current);
    setHover(null);
  };
  const tip = hover?.shown && tipTask && hover.id === tipTask.id ? tipTask : null;

  return (
    <>
      {measuring}
      <div
        className={styles.badge}
        style={{ left: x, top: y, width, height: Height }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (hover) {
            dismissed.current = hover.id;
            setHover(null);
          }
        }}
        onWheel={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span
          className={styles.tile + (held ? ' ' + styles.held : '')}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title="Drag to move the badge"
        >
          <img src={Logo} alt="" />
        </span>
        <div
          className={styles.text}
          onPointerEnter={enterLine}
          // The line can change under a still cursor (a tick, a pick on the page).
          onPointerMove={(e) => hover?.id !== tipTask?.id && enterLine(e)}
          onPointerLeave={leaveLine}
        >
          {/* Resting line rolls up and out as the done line rolls in from below. */}
          <div
            className={styles.line}
            style={{ transform: `translateY(${-RollDistance * f}px)`, opacity: 1 - f, zIndex: f < 0.5 ? 1 : 0 }}
          >
            <button
              type="button"
              className={styles.link}
              style={{ maxWidth: Math.max(0, textW - (keysW ? keysW + KeysGap : 0)) }}
              onClick={switching ? openSwitch : open}
              tabIndex={f < 0.5 ? 0 : -1}
            >
              {restText}
            </button>
            {keysW > 0 && (
              <span className={styles.keys} style={{ width: keysW }}>
                <KeyCaps binding={keys} color="#fff" dim={false} joined className={styles.caps} />
              </span>
            )}
          </div>
          {f > 0 && (
            <div
              className={styles.line}
              style={{ transform: `translateY(${RollDistance * (1 - f)}px)`, opacity: f, zIndex: f < 0.5 ? 0 : 1 }}
            >
              <span className={styles.check}>✓</span>
              <button type="button" className={styles.link + ' ' + styles.done} onClick={open} tabIndex={-1}>
                {flash.title}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.close}
          title={D.consts.tutorialBadgeCloseTip || 'Skip the tutorial'}
          aria-label="Skip the tutorial"
          onClick={() => SceneTutorial.skip()}
        >
          <Close />
        </button>
      </div>
      {tip && <TutorialTip task={tip} badge={{ x, y, w: width, h: Height }} view={view} />}
    </>
  );
}
