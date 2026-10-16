// Editor/Foundation essentials the features share: modifier keys, the modal viewport claim, the
// selection cache, cursor-wrap tracking (the browser can't warp the cursor) and renderer raycasts.
import { EditorSnapSettings, Selection } from '../unity/editor.ts';
import { HandleUtility } from '../unity/handles.ts';
import { Event, IS_MAC } from '../unity/imgui.ts';
import { Plane, Ray, Vector2, Vector3 } from '../unity/math.ts';
import { raycastAll } from '../unity/raycast.ts';
import { Ground, Scene, type Transform } from '../unity/scene.ts';
import { SceneView, type SceneCamera } from '../unity/sceneview.ts';

// ---- ModifierKey ------------------------------------------------------------------------------------

export const ModifierKey = { None: 0, Shift: 1, Action: 2, Alt: 3, Control: 4 } as const;
export type ModifierKey = number;
const MODIFIER_NAMES = ['None', 'Shift', 'Action', 'Alt', 'Control'];

export const ModifierKeys = {
  parse(v: unknown): ModifierKey {
    if (typeof v === 'number') return v;
    const i = MODIFIER_NAMES.indexOf(String(v));
    return i < 0 ? ModifierKey.None : i;
  },
  displayName(m: ModifierKey) {
    return m === ModifierKey.Shift
      ? 'Shift'
      : m === ModifierKey.Action
        ? IS_MAC
          ? 'Cmd'
          : 'Ctrl'
        : m === ModifierKey.Alt
          ? IS_MAC
            ? 'Option'
            : 'Alt'
          : m === ModifierKey.Control
            ? 'Control'
            : 'None';
  },
  isHeld(m: ModifierKey, ev: Event | null = Event.current) {
    if (!ev) return false;
    switch (m) {
      case ModifierKey.Shift:
        return ev.shift;
      case ModifierKey.Alt:
        return ev.alt;
      case ModifierKey.Action:
        return IS_MAC ? ev.command : ev.control;
      case ModifierKey.Control:
        return ev.control;
      default:
        return false;
    }
  },
};

// ---- ModalViewportGate ---------------------------------------------------------------------------------

export const ModalViewportGate = {
  owner: null as unknown,
  get isBlocked() {
    return ModalViewportGate.owner != null;
  },
  claim(owner: unknown) {
    ModalViewportGate.owner = owner;
  },
  release(owner: unknown) {
    if (ModalViewportGate.owner === owner) ModalViewportGate.owner = null;
  },
};

// ---- SelectionCache ------------------------------------------------------------------------------------

export const SelectionCache = {
  get transforms(): Transform[] {
    return Selection.transforms;
  },
  get deep(): Transform[] {
    return Selection.getTransforms(2);
  },
  get count() {
    return Selection.transforms.length;
  },
};

// ---- CursorWrapTracker ---------------------------------------------------------------------------------

/**
 * The plugin warps the OS cursor across the view's border mid-drag; a page can't, so the tracker just
 * keeps the unwrapped virtual cursor the gestures are written against.
 */
export class CursorWrapTracker {
  isActive = false;
  virtualMousePosition = Vector2.zero;
  lastStep = Vector2.zero;
  travel = 0;
  readonly wrapOffset = Vector2.zero;
  private start = Vector2.zero;
  private raw = Vector2.zero;

  get totalDelta() {
    return this.raw.sub(this.start);
  }
  get rawMousePosition() {
    return this.raw;
  }
  get projectionMousePosition() {
    return this.raw;
  }

  begin() {
    this.isActive = true;
    this.start = this.raw = this.virtualMousePosition = Event.current.mousePosition;
    this.lastStep = Vector2.zero;
    this.travel = 0;
  }

  update(rawDelta: Vector2, _viewport?: Vector2) {
    this.raw = this.raw.add(rawDelta);
    this.virtualMousePosition = this.raw;
    this.lastStep = rawDelta;
    this.travel += rawDelta.magnitude;
    return rawDelta;
  }

  end() {
    this.isActive = false;
  }

  /** The OS cursor is never warped here, so there is nothing to hold off or pick back up. */
  suspend() {}
  resume() {}
}

/** EditorSnapSettings as Unity 6.0 reads it: holding the action key snaps every increment. */
export const SnapCompat = {
  get angleSnapEnabled() {
    return EditorSnapSettings.angleSnapEnabled || EditorSnapSettings.incrementalSnapActive;
  },
  get scaleSnapEnabled() {
    return EditorSnapSettings.scaleSnapEnabled || EditorSnapSettings.incrementalSnapActive;
  },
  get gridPosition() {
    return EditorSnapSettings.gridPosition;
  },
  get gridRotation() {
    return EditorSnapSettings.gridRotation;
  },
};

export const CursorWrap = {
  isPlausibleViewStep(_viewPoints: number, _cursorPoints: number) {
    return true;
  },
};

// ---- EditorRaycastUtility ----------------------------------------------------------------------------

const ignored = (t: Transform, ignore?: Transform[] | null) => !!ignore && ignore.some((r) => t.isChildOf(r));

export interface SurfaceHit {
  point: Vector3;
  normal: Vector3;
  distance: number;
  /** Null for the demo's ground. */
  transform: Transform | null;
}

function groundHit(ray: Ray, maxDistance: number): SurfaceHit | null {
  const d = Ground.raycast(ray.origin, ray.direction);
  if (d === null || d > maxDistance) return null;
  return { point: ray.getPoint(d), normal: Vector3.up, distance: d, transform: null };
}

export const EditorRaycastUtility = {
  raycast(ray: Ray, ignore?: Transform[] | null, maxDistance = Infinity, only?: Transform[] | null): SurfaceHit | null {
    const scene = Scene.current;
    if (!scene) return null;
    for (const h of raycastAll(scene, ray)) {
      if (h.distance > maxDistance) break;
      const t = h.gameObject.transform;
      if (ignored(t, ignore)) continue;
      if (only && !ignored(t, only)) continue;
      return { point: h.point, normal: h.normal, distance: h.distance, transform: t };
    }
    return only ? null : groundHit(ray, maxDistance);
  },

  raycastAll(ray: Ray, ignore?: Transform[] | null, maxDistance = Infinity) {
    const scene = Scene.current;
    if (!scene) return [];
    const hits = raycastAll(scene, ray)
      .filter((h) => h.distance <= maxDistance && !ignored(h.gameObject.transform, ignore))
      .map((h) => ({ point: h.point, normal: h.normal }));
    const ground = groundHit(ray, maxDistance);
    if (ground) hits.push({ point: ground.point, normal: ground.normal });
    return hits;
  },

  tryGetHitPoint(mouse: Vector2, ignore?: Transform[] | null) {
    return EditorRaycastUtility.raycast(HandleUtility.guiPointToWorldRay(mouse), ignore);
  },

  /** World point under the cursor: the surface there, else the pivot plane, else the pivot. */
  getScreenPoint(): Vector3 {
    const view = SceneView.lastActiveSceneView;
    if (!view) return Vector3.zero;
    const mouse = Event.current.mousePosition;
    const hit = EditorRaycastUtility.tryGetHitPoint(mouse);
    if (hit) return hit.point;
    const plane = new Plane(view.camera.forward, view.pivot);
    const ray = HandleUtility.guiPointToWorldRay(mouse);
    const [ok, t] = plane.raycast(ray);
    return ok ? ray.getPoint(t) : view.pivot;
  },

  isOccluded(point: Vector3, camera: SceneCamera | null, ignore?: Transform[] | null) {
    if (!camera) return false;
    const offset = point.sub(camera.position);
    const d = offset.magnitude;
    if (d < 1e-5) return false;
    const hit = EditorRaycastUtility.raycast(new Ray(camera.position, offset.div(d)), ignore, d);
    return !!hit && hit.distance < d - 0.001;
  },

  pickableTransformsExcept(exclude?: Transform[] | null): Transform[] {
    const scene = Scene.current;
    if (!scene) return [];
    const out: Transform[] = [];
    for (const go of scene.allObjects())
      if (go.mesh && go.visible && go.pickable && !ignored(go.transform, exclude)) out.push(go.transform);
    return out;
  },

  isUnder: (t: Transform, roots: Transform[]) => ignored(t, roots),
};

// ---- Tutorial / tips hooks -------------------------------------------------------------------------------

export type TutorialReport =
  | { kind: 'shortcut'; id: string }
  | { kind: 'signal'; signal: string }
  | { kind: 'command'; key: string }
  | { kind: 'transform'; traits: number };
const reportListeners = new Set<(r: TutorialReport) => void>();

function fanOut(r: TutorialReport) {
  for (const l of reportListeners) l(r);
}

/** SceneTutorial's report calls, fanned out to the tutorial (tutorial/scene-tutorial.ts). */
export const SceneTutorial = {
  /** Keyed by binding id, not key, so a rebind only changes what the rows show. */
  reportShortcut: (id: string) => fanOut({ kind: 'shortcut', id }),
  report: (signal: string) => fanOut({ kind: 'signal', signal }),
  /** A pie item's action id or a context menu entry's key, once it ran. */
  reportCommand(key: string) {
    if (key) fanOut({ kind: 'command', key });
  },
  reportTransform: (traits: number) => fanOut({ kind: 'transform', traits }),
  /** Set by the tutorial: an open task asks for a drag. */
  wantsTransforms: () => false,
  listen(l: (r: TutorialReport) => void) {
    reportListeners.add(l);
    return () => void reportListeners.delete(l);
  },
};

/** What a kept drag or G/R/S grab had. A task asks for a set, any extra is fine. */
export const TransformTraits = {
  None: 0,
  Move: 1 << 0,
  Rotate: 1 << 1,
  Scale: 1 << 2,
  /** G/R/S, no handle under the cursor. */
  Grab: 1 << 3,
  Arrow: 1 << 4,
  Square: 1 << 5,
  Ring: 1 << 6,
  Axis: 1 << 7,
  LocalAxis: 1 << 8,
  Plane: 1 << 9,
  Numeric: 1 << 10,
  Snapped: 1 << 11,
  Precision: 1 << 12,
  Surface: 1 << 13,
  LookAt: 1 << 14,
  /** Released while pulled onto another object's vertex. */
  OnVertex: 1 << 15,
  /** Started from a settled virtual pivot pick. */
  VirtualPivot: 1 << 16,
} as const;

let tOpen = false;
let tGrab = false;
let tTraits = 0;
let tFamily = 0;
let tHandle = 0;

/**
 * Collects TransformTraits over one drag, from the drag coordinator's begin to its end. Closed unless an
 * open task wants a drag, so the notes on drag frames cost one bool read.
 */
export const TutorialTransform = {
  /** For notes that cost something to work out. */
  get open() {
    return tOpen;
  },

  /** `family` and `handle`: the drag kind's Move/Rotate/Scale and which handle, from the coordinator. */
  begin(family: number, handle: number, virtualPivot: boolean) {
    tOpen = SceneTutorial.wantsTransforms();
    if (!tOpen) return;
    tFamily = family;
    tHandle = handle;
    tGrab = false;
    tTraits = virtualPivot ? TransformTraits.VirtualPivot : TransformTraits.None;
  },

  note(traits: number) {
    if (tOpen) tTraits |= traits;
  },

  /** A grab rides the coordinator too, it says so right after begin. */
  noteGrab() {
    if (tOpen) tGrab = true;
  },

  /** Per drag frame. Holding a key only counts on a frame that moved something. */
  noteDragFrame(snapping: boolean, precision: boolean) {
    if (!tOpen) return;
    if (snapping) tTraits |= TransformTraits.Snapped;
    if (precision) tTraits |= TransformTraits.Precision;
  },

  /** `kept`: false for a click or a drag back home. `onVertex`: read before the coordinator clears the target. */
  end(kept: boolean, onVertex: boolean) {
    if (!tOpen) return;
    tOpen = false;
    if (!kept) return;
    let traits = tTraits | tFamily | (tGrab ? TransformTraits.Grab : tHandle);
    if (onVertex) traits |= TransformTraits.OnVertex;
    SceneTutorial.reportTransform(traits);
  },

  cancel() {
    tOpen = false;
  },
};

/** Called by a Blendon action that has just run, naming its shortcut; the card itself is in shortcut-tips.ts. */
export const ShortcutTips = {
  onNote: null as ((id: string) => void) | null,
  note(id: string) {
    ShortcutTips.onNote?.(id);
  },
};
