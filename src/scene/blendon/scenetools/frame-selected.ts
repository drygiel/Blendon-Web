// FrameSelected: each press of Num . steps through a cycle of framings - selection centre, active pivot,
// Unity's own zoom-in frame, back to the view the cycle started from.
import { EditorApplication, Selection, ShortcutManager } from '../../unity/editor.ts';
import { Bounds, Quaternion, Vector3 } from '../../unity/math.ts';
import type { Transform } from '../../unity/scene.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { SceneTutorial } from '../foundation.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { ViewOrbitTween } from '../navigation/camera.ts';
import { FrameSelectedSettings, FrameSelectedStep } from './settings.ts';

interface ViewState {
  pivot: Vector3;
  rotation: Quaternion;
  size: number;
  orthographic: boolean;
}

const ShortcutId = 'Blendon/Frame Selected';

let stepIndex = 0;
let activeAtCycle: Transform | null = null;
let initialView: ViewState | null = null;
// The sequence the running cycle started on, so editing it starts over.
let runningCycle: FrameSelectedStep[] | null = null;
// The view right after our last press, once settled: tells "the user took the camera over" apart.
let settled: ViewState | null = null;
let poll: { view: SceneView; last: ViewState; stable: number } | null = null;

const stateOf = (v: SceneView): ViewState => ({
  pivot: v.pivot,
  rotation: v.rotation,
  size: v.size,
  orthographic: v.orthographic,
});

function nearlySame(a: ViewState, b: ViewState) {
  return (
    a.orthographic === b.orthographic &&
    a.pivot.sub(b.pivot).sqrMagnitude < 0.0005 * 0.0005 &&
    Math.abs(a.size - b.size) < 0.0005 &&
    Quaternion.angle(a.rotation, b.rotation) < 0.05
  );
}

/** InternalEditorUtility.CalculateSelectionBounds: rendered bounds of the selection and below it. */
export function selectionBounds(): Bounds | null {
  let b: Bounds | null = null;
  for (const t of Selection.transforms)
    for (const d of t.walk()) {
      const rb = d.gameObject.visible ? d.gameObject.bounds : null;
      if (rb) b = b ? b.encapsulate(rb) : rb;
    }
  if (b) return b;
  for (const t of Selection.transforms) b = b ? b.encapsulate(t.position) : new Bounds(t.position, Vector3.zero);
  return b;
}

/** SceneView.FrameSelected: the bounds' sphere fills the view, eased over Unity's half second. */
export function unityFrameSelected(v: SceneView) {
  const b = selectionBounds();
  if (!b) return;
  let size = b.extents.magnitude;
  if (size < 1e-6) size = 10;
  ViewOrbitTween.stop();
  v.lookAt(b.center, v.rotation, size, v.orthographic, false);
}

function framePointState(v: SceneView, point: Vector3): ViewState {
  const dir = point.sub(v.camera.position);
  if (dir.sqrMagnitude < 1e-6) return { ...stateOf(v), pivot: point };
  let size = v.size;
  // Keeps the apparent scale: the new pivot sits at the old camera's distance from the point.
  if (!v.orthographic && v.cameraDistance > 1e-4) size *= dir.magnitude / v.cameraDistance;
  return {
    pivot: point,
    rotation: Quaternion.lookRotation(dir.normalized, Vector3.up),
    size,
    orthographic: v.orthographic,
  };
}

function flyTo(v: SceneView, s: ViewState) {
  const f = FrameSelectedSettings;
  ViewOrbitTween.to(v, s.pivot, s.rotation, s.size, s.orthographic, f.AnimationEnabled, f.AnimationDuration);
}

const selectionCenter = () => selectionBounds()?.center ?? Vector3.zero;

// Zoom In has no cheap preview (it is Unity's own fit), so it is never skipped.
function targetOf(v: SceneView, active: Transform, step: FrameSelectedStep): ViewState | null {
  switch (step) {
    case FrameSelectedStep.SelectionCenter:
      return framePointState(v, selectionCenter());
    case FrameSelectedStep.ActivePivot:
      return framePointState(v, active.position);
    case FrameSelectedStep.BackToStart:
      return initialView;
    default:
      return null;
  }
}

// Unity's frame animates over several frames, so its outcome is captured once the pose stops moving.
function pollSettled() {
  if (!poll) return void EditorApplication.update.remove(pollSettled);
  const pose = stateOf(poll.view);
  if (nearlySame(pose, poll.last)) poll.stable++;
  else {
    poll.stable = 0;
    poll.last = pose;
  }
  if (poll.stable < 2) return;
  settled = pose;
  poll = null;
  EditorApplication.update.remove(pollSettled);
}

export const FrameSelected = {
  ShortcutId,
  Settings: FrameSelectedSettings,

  install() {
    ShortcutManager.register(
      ShortcutId,
      () => {
        // Mid-grab Num . is the decimal point being typed; an open pie owns the view.
        if (ViewportGesture.claimed(ShortcutId) || ViewportGesture.busy) return;
        FrameSelected.run();
      },
      false,
      'Num .',
    );
  },

  /** The shortcut's body, also how Isolate View frames. */
  run() {
    if (!FrameSelectedSettings.Enabled) return;
    const v = SceneView.lastActiveSceneView;
    const active = Selection.activeTransform;
    if (!v || !active) return;
    const steps = FrameSelectedSettings.Cycle;
    if (steps.length === 0) return;

    const current = stateOf(v);
    const selectionChanged = active !== activeAtCycle;
    const movedExternally = !selectionChanged && !!settled && !nearlySame(current, settled);
    if (selectionChanged || movedExternally || steps !== runningCycle || stepIndex >= steps.length) {
      activeAtCycle = active;
      runningCycle = steps;
      stepIndex = 0;
      // Captured once per cycle, so Back to Start returns here wherever it sits in the order.
      initialView = current;
    }

    // A step landing where the view already is would look like a dead key, so it is skipped; the
    // last one tried runs regardless, which keeps a one-step cycle working.
    let step = steps[stepIndex];
    let target = targetOf(v, active, step);
    for (let skipped = 1; skipped < steps.length; skipped++) {
      if (!target || !nearlySame(target, current)) break;
      stepIndex = (stepIndex + 1) % steps.length;
      step = steps[stepIndex];
      target = targetOf(v, active, step);
    }

    if (step === FrameSelectedStep.ZoomIn) unityFrameSelected(v);
    else if (target) flyTo(v, target);

    EditorApplication.update.remove(pollSettled);
    if (target) {
      poll = null;
      settled = target;
    } else {
      poll = { view: v, last: stateOf(v), stable: 0 };
      settled = null;
      EditorApplication.update.add(pollSettled);
    }
    stepIndex = (stepIndex + 1) % steps.length;
    SceneTutorial.reportShortcut(ShortcutId);
  },
};
