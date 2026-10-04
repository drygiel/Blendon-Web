// SceneTutorial + TutorialProgress: which tasks are done, which chapter is open, and the card's own
// state. Kept per visitor in the browser; the card reads it through subscribe().
import { SceneTutorial as Reports } from '../foundation.ts';
import { GeneralSettings } from '../settings.ts';
import { TutorialCurriculum, TutorialTasks, type TutorialChapter, type TutorialTask } from './curriculum.ts';

const StorageKey = 'blendon.sceneTutorial';

interface Stored {
  done: string[];
  chapter: number;
  finished: boolean;
  collapsed: boolean;
  offset: [number, number];
}

function load(): Stored {
  const empty: Stored = { done: [], chapter: 0, finished: false, collapsed: false, offset: [0, 0] };
  try {
    const raw = localStorage.getItem(StorageKey);
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<Stored>) } : empty;
  } catch {
    return empty;
  }
}

const SlideSeconds = 0.22;
// A done row waits, fades, then the band scrolls one row up to bring in the next task.
const TaskExitDelay = 3;
const TaskFadeSeconds = 0.35;
const TaskSlideSeconds = 0.28;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const clock = () => performance.now() / 1000;

/** TutorialCard's scroll: three rows at a time, a finished top row fading and sliding off. */
export class TutorialWindow {
  readonly chapter: TutorialChapter;
  readonly index: number;
  /** Tasks with the switched-off ones taken out: a skipped task would hold a row forever. */
  readonly visible: TutorialTask[];
  windowStart: number;
  phase: 'none' | 'fading' | 'sliding' = 'none';
  phaseStart = 0;
  shownAt = clock();
  private readonly doneAt = new Map<string, number>();
  private advanced = false;

  constructor(index: number) {
    this.index = index;
    this.chapter = TutorialCurriculum[index];
    this.visible = this.chapter.tasks.filter((t) => !TutorialTasks.isSkipped(t));
    // Opens on whatever is unfinished: a chapter half done earlier starts where it was left.
    const first = this.visible.findIndex((t) => !done.has(t.id));
    this.windowStart = first < 0 ? this.visible.length : first;
  }

  get slide() {
    return easeOutCubic((clock() - this.shownAt) / SlideSeconds);
  }

  get exitAlpha() {
    if (this.phase === 'fading') return 1 - easeOutCubic((clock() - this.phaseStart) / TaskFadeSeconds);
    return this.phase === 'sliding' ? 0 : 1;
  }

  /** How far the band has scrolled into the next row, 0 to 1. */
  get scroll() {
    return this.phase === 'sliding' ? easeOutCubic((clock() - this.phaseStart) / TaskSlideSeconds) : 0;
  }

  /** Advances the scroll; true while there is still something to animate or wait for. */
  tick() {
    const t = clock();
    if (this.phase === 'none') {
      // Each done task starts its own clock as soon as it is seen, so a burst of completions clears together.
      for (let v = this.windowStart; v < this.visible.length; v++) {
        const id = this.visible[v].id;
        if (!this.doneAt.has(id) && done.has(id)) this.doneAt.set(id, t);
      }
      const top = this.visible[this.windowStart];
      const at = top ? this.doneAt.get(top.id) : undefined;
      if (at !== undefined && t - at >= TaskExitDelay) {
        this.phase = 'fading';
        this.phaseStart = t;
      }
    } else if (this.phase === 'fading' && t - this.phaseStart >= TaskFadeSeconds) {
      this.phase = 'sliding';
      this.phaseStart = t;
    } else if (this.phase === 'sliding' && t - this.phaseStart >= TaskSlideSeconds) {
      this.windowStart++;
      this.phase = 'none';
    }
    // The last row scrolled off a finished chapter: the next one comes in by itself.
    if (
      !this.advanced &&
      this.phase === 'none' &&
      this.windowStart >= this.visible.length &&
      TutorialProgress.isChapterComplete(this.chapter) &&
      this.index < TutorialCurriculum.length - 1
    ) {
      this.advanced = true;
      SceneTutorialCard.advance();
      return false;
    }
    const top = this.visible[this.windowStart];
    return this.phase !== 'none' || (!!top && done.has(top.id)) || t - this.shownAt < SlideSeconds;
  }
}

const state = load();
const done = new Set(state.done);
// Skipping lasts for this visit only: a page has no settings window to bring the card back from.
let skipped = false;
const listeners = new Set<() => void>();
let version = 0;
let card: TutorialWindow | null = null;
let raf = 0;

function notify() {
  version++;
  for (const l of listeners) l();
}

// Repaints the card while it animates; stops as soon as nothing moves or waits.
function pump() {
  raf = 0;
  if (!SceneTutorialCard.active) return;
  const more = SceneTutorialCard.window.tick();
  notify();
  if (more) raf = requestAnimationFrame(pump);
}

function kick() {
  if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(pump);
}

function save() {
  state.done = [...done];
  try {
    localStorage.setItem(StorageKey, JSON.stringify(state));
  } catch {
    // Private windows and blocked storage: progress just doesn't outlive the page.
  }
}

function changed() {
  save();
  notify();
  kick();
}

export const TutorialProgress = {
  isDone: (id: string) => done.has(id),

  count(chapter: TutorialChapter) {
    let n = 0;
    for (const t of chapter.tasks) if (done.has(t.id) || TutorialTasks.isSkipped(t)) n++;
    return { done: n, total: chapter.tasks.length };
  },

  isChapterComplete(chapter: TutorialChapter) {
    const c = TutorialProgress.count(chapter);
    return c.done >= c.total;
  },
};

export const SceneTutorialCard = {
  get active() {
    return GeneralSettings.Enabled && GeneralSettings.ShowTutorial && !state.finished && !skipped;
  },
  get chapterIndex() {
    return Math.min(Math.max(state.chapter, 0), TutorialCurriculum.length - 1);
  },
  get chapter() {
    return TutorialCurriculum[SceneTutorialCard.chapterIndex];
  },
  get collapsed() {
    return state.collapsed;
  },
  get offset() {
    return state.offset;
  },

  subscribe: (fn: () => void) => {
    listeners.add(fn);
    kick();
    return () => void listeners.delete(fn);
  },

  /** Bumped on every change and animation frame, for useSyncExternalStore. */
  get version() {
    return version;
  },

  /** The open chapter's card state, rebuilt when the chapter changes. */
  get window() {
    if (!card || card.index !== SceneTutorialCard.chapterIndex)
      card = new TutorialWindow(SceneTutorialCard.chapterIndex);
    return card;
  },

  advance() {
    if (SceneTutorialCard.chapterIndex >= TutorialCurriculum.length - 1) state.finished = true;
    else state.chapter = SceneTutorialCard.chapterIndex + 1;
    changed();
  },

  toggleCollapsed() {
    state.collapsed = !state.collapsed;
    changed();
  },

  setOffset(x: number, y: number) {
    state.offset = [x, y];
    changed();
  },

  skip() {
    skipped = true;
    changed();
  },

  restart() {
    done.clear();
    state.chapter = 0;
    state.finished = false;
    state.collapsed = false;
    skipped = false;
    card = null;
    changed();
  },

  /** A gesture done somewhere on the page that the card can't see (opening the settings window). */
  report: (signal: string) => Reports.report(signal),

  install() {
    // Blendon's settings are the window further down the page; using it is opening them.
    window.addEventListener('blendon:settings-opened', () => Reports.report('SettingsOpened'));
    Reports.listen((r) => {
      if (!SceneTutorialCard.active) return;
      let any = false;
      for (const task of SceneTutorialCard.chapter.tasks) {
        if (done.has(task.id) || TutorialTasks.isSkipped(task)) continue;
        const answers = r.kind === 'signal' ? task.signal === r.signal : task.shortcutIds.includes(r.id);
        if (!answers) continue;
        done.add(task.id);
        any = true;
      }
      if (any) changed();
    });
  },
};
