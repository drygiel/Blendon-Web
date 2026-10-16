// TutorialPageAnimation: plays each tick on the Tutorial page, one at a time. The open task folds to its title,
// its box pops green, then the next task opens. A task chosen by a click folds the open one and opens without
// the pop. Moved on from the page's own render, so a tick made while the page wasn't showing plays the next
// time it is.
import { TutorialTasks } from '../../scene/blendon/tutorial/curriculum.ts';
import { TutorialProgress } from '../../scene/blendon/tutorial/progress.ts';

const CollapseSeconds = 0.3;
const HighlightSeconds = 0.45;
const ExpandSeconds = 0.35;
/** Share of the highlight the box takes to pop. The wash settles over all of it. */
const PopShare = 0.6;
const PopFrom = 0.6;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface RowLook {
  /** 0 folded to its title line, 1 open with picture and hint. */
  open: number;
  /** Green box and title. */
  done: boolean;
  /** Box scale, 1 at rest. */
  pop: number;
  /** 1 at the peak of the green flash, 0 settled. */
  flash: number;
}

interface Step {
  id: string;
  /** Opens once this one has folded. Empty when it wasn't the open task, or none is left. */
  next: string;
  /** Was the open task: folds to its title line, then hands over to next. */
  folds: boolean;
  /** Was ticked: its box pops green. A click-chosen hand-over only folds. */
  pops: boolean;
}

const opensAt = (s: Step) => (s.folds ? CollapseSeconds : 0) + (s.pops ? HighlightSeconds : 0);
const lengthOf = (s: Step) => opensAt(s) + (s.next ? ExpandSeconds : 0);

const look = (open: number, done: boolean, pop = 1, flash = 0): RowLook => ({ open, done, pop, flash });

// Ticks not played yet, in curriculum order. Each waits until the one before it is done.
const pending: string[] = [];
// Done ids already played, or never owed a show.
const seen = new Set<string>();
let epoch = -1;
let shown = '';
let step: Step | null = null;
let stepStart = 0;
let now = 0;

function restart() {
  epoch = TutorialProgress.epoch;
  pending.length = 0;
  seen.clear();
  step = null;
  shown = '';
  for (const t of TutorialTasks) if (TutorialProgress.isDone(t.id)) seen.add(t.id);
}

function collect() {
  for (const t of TutorialTasks)
    if (TutorialProgress.isDone(t.id) && !seen.has(t.id)) {
      seen.add(t.id);
      pending.push(t.id);
    }
}

function begin(s: Step) {
  step = s;
  stepStart = now;
}

/** Finishes a step whose time is up and starts the next one owed. */
function advance() {
  if (step && now - stepStart >= lengthOf(step)) {
    const done = step;
    step = null;
    if (done.folds) shown = done.next;
  }
  if (step || !pending.length) return;
  const id = pending.shift()!;
  // Only the open task folds and hands over. Any other tick just pops where it is.
  const advances = id === shown;
  begin({ id, next: advances ? (TutorialProgress.currentId ?? '') : '', folds: advances, pops: true });
}

/** Nothing owed but the current task changed anyway: chosen by a click, or switched off. */
function follow() {
  const current = TutorialProgress.currentId ?? '';
  if (current === shown) return;
  if (!shown || !current || TutorialProgress.isDone(shown)) {
    shown = current;
    return;
  }
  begin({ id: shown, next: current, folds: true, pops: false });
}

function highlight(t: number) {
  const pop = lerp(PopFrom, 1, easeOutCubic(t / PopShare));
  return look(0, true, pop, 1 - easeOutCubic(t));
}

let reveal = false;

export const TutorialPageAnimation = {
  /** The tab was opened (or the badge clicked): bring the current task into view once it is open. */
  requestReveal() {
    reveal = true;
  },

  /** True once per request, for the row that answers it. */
  takeReveal() {
    const r = reveal;
    reveal = false;
    return r;
  },

  get revealPending() {
    return reveal;
  },

  /**
   * Top of every render of the page, before anything reads a look. The clock is read here once, so every row
   * of one render agrees. `instant` (reduced motion) plays each step in no time.
   */
  sync(seconds: number, instant: boolean) {
    now = seconds;
    if (epoch !== TutorialProgress.epoch) restart();
    collect();
    if (instant) {
      while (step || pending.length) {
        if (step) stepStart = now - lengthOf(step);
        advance();
      }
    } else advance();
    if (!step && !pending.length) follow();
  },

  /** A step is playing: the page asks for another frame. */
  get busy() {
    return step !== null;
  },

  /** Task opening right now, to keep in view as it grows. Null otherwise. */
  get opening(): string | null {
    if (!step || !step.next) return null;
    return now - stepStart >= opensAt(step) ? step.next : null;
  },

  lookOf(id: string): RowLook {
    if (step) {
      let t = now - stepStart;
      if (step.id === id) {
        if (step.folds) {
          if (t < CollapseSeconds) return look(1 - easeOutCubic(t / CollapseSeconds), false);
          t -= CollapseSeconds;
        }
        return step.pops ? highlight(t / HighlightSeconds) : look(0, TutorialProgress.isDone(id));
      }
      // Folded until the one before has folded (and popped), then opens.
      if (step.next === id) return look(easeOutCubic((t - opensAt(step)) / ExpandSeconds), false);
    }
    // A tick still waiting keeps its old look until its turn.
    if (pending.includes(id)) return look(id === shown ? 1 : 0, false);
    if (TutorialProgress.isDone(id)) return look(0, true);
    return look(id === shown ? 1 : 0, false);
  },
};
