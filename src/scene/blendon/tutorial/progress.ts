// TutorialProgress: only the done ids are kept, the current task and finishing are read off them. Kept per visitor
// in the browser, as the plugin keeps it per machine.
import {
  TutorialCurriculum,
  TutorialTasks,
  findTask,
  readDoneFrom,
  type TutorialChapter,
  type TutorialTask,
} from './curriculum.ts';

const StorageKey = 'blendon.tutorial';
// The chapter-at-a-time card's progress, whose done ids carry over.
const OldStorageKey = 'blendon.sceneTutorial';

interface Stored {
  done: string[];
  /** A task the visitor picked to do next, ahead of the first open one. */
  chosen: string;
  /** The badge's label was clicked, so it names a task before the first tick. */
  started: boolean;
}

function read(key: string): Partial<Stored> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<Stored>) : null;
  } catch {
    return null;
  }
}

function load(): Stored {
  const stored = read(StorageKey);
  if (stored) return { done: stored.done ?? [], chosen: stored.chosen ?? '', started: !!stored.started };
  const old = read(OldStorageKey);
  try {
    localStorage.removeItem(OldStorageKey);
  } catch {
    // Blocked storage: nothing to clean up either.
  }
  return { done: old?.done ?? [], chosen: '', started: false };
}

const state = load();
const done = new Set(state.done);
readDoneFrom((id) => done.has(id));
const listeners = new Set<() => void>();
const completedListeners = new Set<(id: string) => void>();
let version = 0;
let epoch = 0;

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
  TutorialProgress.notify();
}

export const TutorialProgress = {
  /** Bumped on every change, for useSyncExternalStore. */
  get version() {
    return version;
  },

  /** Bumped by reset, the only way a done id goes away. */
  get epoch() {
    return epoch;
  },

  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },

  /** A task was ticked, with its id. Not raised by reset. */
  onCompleted: (fn: (id: string) => void) => {
    completedListeners.add(fn);
    return () => void completedListeners.delete(fn);
  },

  /** Something the rows read changed elsewhere: a setting, a binding, the selection. */
  notify() {
    version++;
    for (const l of listeners) l();
  },

  isDone: (id: string) => done.has(id),

  /** Skipped never blocks, so it counts as settled. */
  isSettled: (task: TutorialTask) => done.has(task.id) || task.isSkipped(),

  /** The chosen task while it is still open, else the first one in curriculum order neither done nor skipped. */
  current(): TutorialTask | null {
    // A chosen task switched off falls back without being forgotten.
    const chosen = state.chosen ? findTask(state.chosen) : null;
    if (chosen && !TutorialProgress.isSettled(chosen)) return chosen;
    return TutorialTasks.find((t) => !TutorialProgress.isSettled(t)) ?? null;
  },

  get currentId() {
    return TutorialProgress.current()?.id ?? null;
  },

  /** Every task done or skipped. */
  get finished() {
    return TutorialProgress.current() === null;
  },

  /** A task of the curriculum is ticked. Ids of tasks no longer taught don't count. */
  get anyDone() {
    return TutorialTasks.some((t) => done.has(t.id));
  },

  /** The badge names the task asked for next instead of the tutorial. */
  get started() {
    return TutorialProgress.anyDone || !!state.chosen || state.started;
  },

  get chosenId() {
    return state.chosen;
  },

  start() {
    if (TutorialProgress.started) return;
    state.started = true;
    changed();
  },

  /** False if already done. */
  complete(id: string) {
    if (done.has(id)) return false;
    done.add(id);
    // Done with the detour, back to the task asked for before it.
    if (id === state.chosen) state.chosen = '';
    changed();
    for (const l of completedListeners) l(id);
    return true;
  },

  /** Asks for a task next, until it is ticked. Empty goes back to curriculum order. A done task can't be chosen. */
  choose(id: string) {
    if (id && done.has(id)) return;
    if (id === state.chosen) return;
    state.chosen = id;
    changed();
  },

  /** Done or skipped, and total. A task the demo can't do is left out of both. */
  count(chapter: TutorialChapter) {
    let n = 0;
    let total = 0;
    for (const t of chapter.tasks) {
      if (t.notInDemo) continue;
      total++;
      if (TutorialProgress.isSettled(t)) n++;
    }
    return { done: n, total };
  },

  /** Done or skipped across all chapters, and how many there are to do here. */
  totals() {
    return TutorialCurriculum.reduce(
      (sum, c) => {
        const n = TutorialProgress.count(c);
        return { done: sum.done + n.done, total: sum.total + n.total };
      },
      { done: 0, total: 0 },
    );
  },

  /** Nothing ticked, back to the first task. */
  reset() {
    done.clear();
    state.chosen = '';
    state.started = false;
    epoch++;
    changed();
  },
};
