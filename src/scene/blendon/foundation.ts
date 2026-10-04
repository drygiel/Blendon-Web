// Editor/Foundation essentials the features share: modifier keys, the modal viewport claim, the
// selection cache, cursor-wrap tracking (the browser can't warp the cursor) and renderer raycasts.
import { EditorSnapSettings, Selection } from '../unity/editor.ts';
import { HandleUtility } from '../unity/handles.ts';
import { Event, IS_MAC } from '../unity/imgui.ts';
import { Plane, Ray, Vector2, Vector3 } from '../unity/math.ts';
import { raycastAll } from '../unity/raycast.ts';
import { Scene, type Transform } from '../unity/scene.ts';
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
  transform: Transform;
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
    return null;
  },

  raycastAll(ray: Ray, ignore?: Transform[] | null, maxDistance = Infinity) {
    const scene = Scene.current;
    if (!scene) return [];
    return raycastAll(scene, ray)
      .filter((h) => h.distance <= maxDistance && !ignored(h.gameObject.transform, ignore))
      .map((h) => ({ point: h.point, normal: h.normal }));
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

type Report = { kind: 'shortcut'; id: string } | { kind: 'signal'; signal: string };
const reportListeners = new Set<(r: Report) => void>();

/** SceneTutorial's two report calls, fanned out to the page's task list. */
export const SceneTutorial = {
  reportShortcut(id: string) {
    for (const l of reportListeners) l({ kind: 'shortcut', id });
  },
  report(signal: string) {
    for (const l of reportListeners) l({ kind: 'signal', signal });
  },
  /** Reported from a live drag frame, the only place holding the key is the same as using it. */
  noteDragModifiers(snapping: boolean, precision: boolean) {
    if (snapping) SceneTutorial.report('IncrementalSnap');
    if (precision) SceneTutorial.report('PrecisionDrag');
  },
  listen(l: (r: Report) => void) {
    reportListeners.add(l);
    return () => void reportListeners.delete(l);
  },
};

/** In-scene "which key moved" cards are Editor-profile business; nothing to explain here. */
export const ShortcutTips = {
  note(_id: string) {},
};
