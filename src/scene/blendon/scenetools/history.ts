// SelectionHistory + ViewHistory: browser-style back/forward over past selections (Mouse 3/4) and past
// Scene view poses (Shift+Mouse 3/4).
import { EditorApplication, Selection, ShortcutManager } from '../../unity/editor.ts';
import { Event, EventType } from '../../unity/imgui.ts';
import { Quaternion, type Vector3 } from '../../unity/math.ts';
import type { GameObject } from '../../unity/scene.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { SceneTutorial } from '../foundation.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { ViewOrbitTween } from '../navigation/camera.ts';
import { SelectionHistorySettings, ViewHistorySettings } from './settings.ts';

const MaxEntries = 100;

// Swapping the selection under a grab or flying the camera mid-grab breaks the gesture; an open pie
// owns the view outright.
const blocked = (id: string) => ViewportGesture.claimed(id) || ViewportGesture.busy;

function push<T>(entries: T[], index: number, entry: T) {
  // Branching into a new entry discards whatever forward history existed.
  entries.splice(index + 1);
  entries.push(entry);
  if (entries.length > MaxEntries) entries.shift();
  return entries.length - 1;
}

// ---- selection ----

const selectionEntries: GameObject[][] = [];
let selectionIndex = -1;
let navigating = false;
// The rect select updates the selection on every drag frame; the whole drag becomes one entry.
let leftHeld = false;
let pending: GameObject[] | null = null;

function recordSelection(objects: GameObject[]) {
  const last = selectionEntries[selectionIndex];
  if (last && last.length === objects.length && last.every((o, i) => o === objects[i])) return;
  selectionIndex = push(selectionEntries, selectionIndex, objects);
}

function flushPending() {
  if (!leftHeld) return;
  leftHeld = false;
  if (pending) recordSelection(pending);
  pending = null;
}

// Destroyed objects (an undone creation) drop out instead of leaving gaps.
function inScene(go: GameObject) {
  for (let t = go.transform; ; t = t.parent!) {
    if (!t.parent) return go.scene.roots.includes(t);
    if (!t.parent.children.includes(t)) return false;
  }
}

function applySelection(objects: GameObject[]) {
  const alive = objects.filter(inScene);
  navigating = true;
  Selection.set(alive, alive.includes(Selection.activeGameObject!) ? Selection.activeGameObject : (alive[0] ?? null));
  navigating = false;
}

export const SelectionHistory = {
  BackShortcutId: 'Blendon/History/Undo Selection',
  ForwardShortcutId: 'Blendon/History/Redo Selection',

  install() {
    Selection.selectionChanged.add(() => {
      if (!SelectionHistorySettings.Enabled || navigating) return;
      const ids = Selection.objects;
      if (leftHeld) pending = ids;
      else recordSelection(ids);
    });
    SceneView.duringSceneGui.add(() => {
      if (!SelectionHistorySettings.Enabled) return;
      const e = Event.current;
      // rawType: a handle uses the release that ends its drag, which would latch the flag forever.
      if (e.rawType === EventType.MouseDown && e.button === 0) leftHeld = true;
      else if ((e.rawType === EventType.MouseUp && e.button === 0) || e.rawType === EventType.MouseMove) flushPending();
    });
    const S = SelectionHistory;
    ShortcutManager.register(S.BackShortcutId, () => !blocked(S.BackShortcutId) && S.moveBack(), false, 'Mouse 3');
    ShortcutManager.register(
      S.ForwardShortcutId,
      () => !blocked(S.ForwardShortcutId) && S.moveForward(),
      false,
      'Mouse 4',
    );
    recordSelection(Selection.objects);
  },

  moveBack() {
    if (!SelectionHistorySettings.Enabled || selectionIndex <= 0) return;
    applySelection(selectionEntries[--selectionIndex]);
    SceneTutorial.reportShortcut(SelectionHistory.BackShortcutId);
  },

  moveForward() {
    if (!SelectionHistorySettings.Enabled || selectionIndex >= selectionEntries.length - 1) return;
    applySelection(selectionEntries[++selectionIndex]);
    SceneTutorial.reportShortcut(SelectionHistory.ForwardShortcutId);
  },
};

// ---- view ----

interface ViewState {
  pivot: Vector3;
  rotation: Quaternion;
  size: number;
  orthographic: boolean;
}

// Only a pose that stayed still this long becomes an entry, so an orbit records just its endpoint.
const SettleDelay = 0.2;
const NavigationTimeout = 2;

const viewEntries: ViewState[] = [];
let viewIndex = -1;
let lastSeen: ViewState | null = null;
let settleTimer = 0;
let flight: { target: ViewState; deadline: number } | null = null;

const stateOf = (v: SceneView): ViewState => ({
  pivot: v.pivot,
  rotation: v.rotation.normalized,
  size: v.size,
  orthographic: v.orthographic,
});

const same = (a: ViewState, b: ViewState) =>
  a.orthographic === b.orthographic &&
  Math.abs(a.size - b.size) < 1e-4 &&
  a.pivot.sub(b.pivot).sqrMagnitude < 1e-8 &&
  Quaternion.angle(a.rotation, b.rotation) < 0.01;

function recordView(state: ViewState) {
  // Wandering off and settling back on the current entry would spend a Back press going nowhere.
  const at = viewEntries[viewIndex];
  if (at && same(at, state)) return;
  viewIndex = push(viewEntries, viewIndex, state);
}

// Unity polls the pose from the editor update; a page only repaints while something moves, so the
// repaint pass notices the change and a timer waits out the settle delay.
function watchView(view: SceneView) {
  if (Event.current.type !== EventType.Repaint || !ViewHistorySettings.Enabled) return;
  const current = stateOf(view);
  if (flight) {
    // An animated jump moves the camera for many frames; none of them is a new pose.
    lastSeen = current;
    if (
      !ViewOrbitTween.isPlaying ||
      same(current, flight.target) ||
      EditorApplication.timeSinceStartup >= flight.deadline
    )
      flight = null;
    return;
  }
  if (!lastSeen) {
    lastSeen = current;
    if (viewEntries.length === 0) recordView(current);
    return;
  }
  if (same(current, lastSeen)) return;
  lastSeen = current;
  clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    if (!flight && lastSeen && same(stateOf(view), lastSeen)) recordView(lastSeen);
  }, SettleDelay * 1000);
}

function applyView(state: ViewState) {
  const v = SceneView.lastActiveSceneView;
  if (!v) return;
  flight = { target: state, deadline: EditorApplication.timeSinceStartup + NavigationTimeout };
  clearTimeout(settleTimer);
  // The tween starts from the live pose, so a second Back bends the flight toward the older entry.
  ViewOrbitTween.to(
    v,
    state.pivot,
    state.rotation,
    state.size,
    state.orthographic,
    ViewHistorySettings.AnimationEnabled,
    ViewHistorySettings.AnimationDuration,
  );
  lastSeen = state;
}

export const ViewHistory = {
  BackShortcutId: 'Blendon/History/Undo View',
  ForwardShortcutId: 'Blendon/History/Redo View',

  install() {
    SceneView.duringSceneGui.add(watchView);
    const V = ViewHistory;
    ShortcutManager.register(
      V.BackShortcutId,
      () => !blocked(V.BackShortcutId) && V.moveBack(),
      false,
      'Shift+Mouse 3',
    );
    ShortcutManager.register(
      V.ForwardShortcutId,
      () => !blocked(V.ForwardShortcutId) && V.moveForward(),
      false,
      'Shift+Mouse 4',
    );
  },

  moveBack() {
    if (!ViewHistorySettings.Enabled || viewIndex <= 0) return;
    applyView(viewEntries[--viewIndex]);
    SceneTutorial.reportShortcut(ViewHistory.BackShortcutId);
  },

  moveForward() {
    if (!ViewHistorySettings.Enabled || viewIndex >= viewEntries.length - 1) return;
    applyView(viewEntries[++viewIndex]);
    SceneTutorial.reportShortcut(ViewHistory.ForwardShortcutId);
  },
};
