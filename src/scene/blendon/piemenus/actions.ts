// PieAction + ActionCatalog: everything Blendon's pies can do, described rather than placed. An action
// holds no slot and no view; createItem binds it to the view the pie opened in.
import { EditorSnapSettings, PivotRotation, Selection, Tool, Tools, Undo } from '../../unity/editor.ts';
import { HandleUtility } from '../../unity/handles.ts';
import { Plane, Quaternion, Vector3, type Vector2 } from '../../unity/math.ts';
import { primitiveMesh, type PrimitiveType } from '../../unity/primitives.ts';
import { GameObject, Scene, type Transform } from '../../unity/scene.ts';
import type { SceneView } from '../../unity/sceneview.ts';
import { EditorRaycastUtility, SelectionCache } from '../foundation.ts';
import { PivotModes, SharedGizmoSettings, type PivotMode } from '../gizmos/shared-settings.ts';
import { ViewportNavActions } from '../navigation/viewport-nav.ts';
import { ViewAlignment } from '../navigation/view-snap.ts';
import { PieItem } from './model.ts';
import { PieMenu } from './pie-menu.ts';
import { PieMenuSettings } from './settings.ts';
import { ShadingMode, ShadingModes } from './shading-modes.ts';

type ViewQuery<T> = (view: SceneView | null) => T;

interface ActionOptions {
  isCurrent?: ViewQuery<boolean>;
  isEnabled?: ViewQuery<boolean>;
  /** A live label, re-read per open (the projection toggle names what it would switch to). */
  label?: ViewQuery<string>;
}

export class PieAction {
  static readonly Root = 'Blendon';
  readonly id: string;
  readonly category: string;
  readonly name: string;
  readonly iconName: string;
  private readonly run: (view: SceneView | null) => void;
  private readonly options: ActionOptions;

  constructor(
    category: string,
    name: string,
    iconName: string,
    run: (view: SceneView | null) => void,
    options: ActionOptions = {},
  ) {
    this.category = category;
    this.name = name;
    this.iconName = iconName;
    this.id = `${PieAction.Root}/${category}/${name}`;
    this.run = run;
    this.options = options;
  }

  /** A slot's content bound to the view; a user's own icon or name wins over the action's. */
  createItem(view: SceneView | null, iconOverride = '', labelOverride = '') {
    const o = this.options;
    const label = labelOverride || (o.label ? o.label(view) : this.name);
    return new PieItem(
      label,
      iconOverride || this.iconName,
      () => this.run(view),
      o.isCurrent ? () => o.isCurrent!(view) : null,
      o.isEnabled ? () => o.isEnabled!(view) : null,
    );
  }
}

// Not reachable in the browser Scene view: greyed, as Unity greys a tool it can't offer.
const unavailable: ActionOptions = { isEnabled: () => false };

// ---- Shading ----

const shading = (mode: ShadingMode, name: string, icon: string) =>
  new PieAction('Shading', name, icon, (v) => v && ShadingModes.apply(v, mode), {
    isCurrent: (v) => !!v && ShadingModes.current(v) === mode,
  });

export const ShadingActions = [
  shading(ShadingMode.Wireframe, 'Wireframe', 'd_wireframe'),
  shading(ShadingMode.Unlit, 'Unlit', 'd_UnlitMode'),
  shading(ShadingMode.Shaded, 'Shaded', 'd_Shaded'),
  shading(ShadingMode.WireframeShaded, 'Wireframe Shaded', 'd_ShadedWireframe'),
];

// ---- Snapping: straight onto EditorSnapSettings' own persistent toggles ----

export const SnappingActions = [
  new PieAction(
    'Snapping',
    'Incremental',
    'd_SnapIncrement',
    () => {
      if (!EditorSnapSettings.gridSnapActive) EditorSnapSettings.snapEnabled = !EditorSnapSettings.snapEnabled;
      EditorSnapSettings.gridSnapEnabled = false;
    },
    { isCurrent: () => EditorSnapSettings.incrementalSnapActive },
  ),
  new PieAction(
    'Snapping',
    'Angle',
    'd_AngleSnap',
    () => (EditorSnapSettings.angleSnapEnabled = !EditorSnapSettings.angleSnapEnabled),
    { isCurrent: () => EditorSnapSettings.angleSnapEnabled },
  ),
  new PieAction(
    'Snapping',
    'Scale',
    'd_ScaleSnap',
    () => (EditorSnapSettings.scaleSnapEnabled = !EditorSnapSettings.scaleSnapEnabled),
    { isCurrent: () => EditorSnapSettings.scaleSnapEnabled },
  ),
  new PieAction(
    'Snapping',
    'Grid',
    'd_SceneViewSnap',
    () => (EditorSnapSettings.snapEnabled = EditorSnapSettings.gridSnapEnabled = !EditorSnapSettings.gridSnapEnabled),
    { isCurrent: () => EditorSnapSettings.gridSnapActive },
  ),
];

// ---- Tools Handle: Unity's handle rotation and position toggles ----

const rotation = (name: string, value: number, icon: string) =>
  new PieAction('Tools Handle', name, icon, () => (Tools.pivotRotation = value), {
    isCurrent: () => Tools.pivotRotation === value,
  });

export const ToolsHandleActions = [
  rotation('Global', PivotRotation.Global, 'd_ToolHandleGlobal'),
  rotation('Local', PivotRotation.Local, 'd_ToolHandleLocal'),
  rotation('Grid', PivotRotation.Grid, 'd_GridAndSnap'),
];

// ---- Pivot Point: filed under full names, shown by the toolbar's short ones ----

const pivot = (mode: PivotMode, icon: string) => {
  // Each Unity side's default mode stays pickable with the pivot menu off.
  const alwaysOn = mode === 0 || mode === 2;
  return new PieAction(
    'Pivot Point',
    PivotModes.displayName(mode),
    icon,
    () => (SharedGizmoSettings.PivotPoint = mode),
    {
      isCurrent: () => SharedGizmoSettings.PivotPoint === mode,
      isEnabled: () => alwaysOn || SharedGizmoSettings.PivotMenuEnabled,
      label: () => PivotModes.shortName(mode),
    },
  );
};

export const PivotPointActions = [
  pivot(0, 'd_ToolHandleCenter'),
  pivot(1, 'd_RectTool'),
  pivot(2, 'd_ToolHandlePivot'),
  pivot(3, 'd_AvatarPivot'),
];

// ---- Reset: Blender's Alt+G/R/S over the selection's local transform ----

function atRest(t: Transform, p: boolean, r: boolean, s: boolean) {
  return (
    (!p || t.localPosition.equals(Vector3.zero)) &&
    (!r || t.localRotation.equals(Quaternion.identity)) &&
    (!s || t.localScale.equals(Vector3.one))
  );
}

export const ResetActions = {
  apply(targets: Transform[], p: boolean, r: boolean, s: boolean) {
    Undo.incrementCurrentGroup();
    for (const t of targets) {
      // Recording a transform already at rest would add a history entry that undoes nothing.
      if (atRest(t, p, r, s)) continue;
      Undo.recordObject(t, 'Reset Transform');
      if (p) t.localPosition = Vector3.zero;
      if (r) t.localRotation = Quaternion.identity;
      if (s) t.localScale = Vector3.one;
    }
  },

  applies: (targets: Transform[], p: boolean, r: boolean, s: boolean) => targets.some((t) => !atRest(t, p, r, s)),

  all: [] as PieAction[],
};

const reset = (name: string, p: boolean, r: boolean, s: boolean, icon: string) =>
  new PieAction('Reset', name, icon, () => ResetActions.apply(SelectionCache.transforms, p, r, s), {
    isEnabled: () => ResetActions.applies(SelectionCache.transforms, p, r, s),
  });

ResetActions.all = [
  reset('Position', true, false, false, 'd_MoveTool'),
  reset('Scale', false, false, true, 'd_ScaleTool'),
  reset('Rotation', false, true, false, 'd_RotateTool'),
  reset('All', true, true, true, 'd_TransformTool'),
];

// ---- Add Object, placed where the pie was opened ----

let spawnPoint: Vector3 | null = null;

// The surface under the cursor, else the camera-facing plane through the pivot.
function resolveSpawn(view: SceneView, guiPoint: Vector2) {
  const hit = EditorRaycastUtility.tryGetHitPoint(guiPoint);
  if (hit) return hit.point;
  const ray = HandleUtility.guiPointToWorldRay(guiPoint);
  const [ok, t] = new Plane(view.camera.forward, view.pivot).raycast(ray);
  return ok ? ray.getPoint(t) : view.pivot;
}

function uniqueName(scene: Scene, base: string) {
  const taken = new Set([...scene.allObjects()].filter((o) => !o.transform.parent).map((o) => o.name));
  if (!taken.has(base)) return base;
  let i = 1;
  while (taken.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

export const SpawnPlacement = {
  install() {
    PieMenu.opened.add((view, guiPoint) => (spawnPoint = resolveSpawn(view, guiPoint)));
  },

  /** Aims the next creation at a point of a menu that is not a pie, the context menu's own cursor. */
  aim(view: SceneView, guiPoint: Vector2) {
    spawnPoint = resolveSpawn(view, guiPoint);
  },

  /** Creation and placement are one undo step, so one Ctrl+Z removes the object. */
  create(name: string, mesh: PrimitiveType | null) {
    const scene = Scene.current;
    if (!scene) return;
    Undo.incrementCurrentGroup();
    const go = new GameObject(scene, uniqueName(scene, name));
    if (mesh) go.mesh = primitiveMesh(mesh);
    Undo.registerCreatedObjectUndo(go, 'Create ' + go.name);
    Selection.set([go], go);
    if (spawnPoint) {
      go.transform.position = spawnPoint;
      // Lifts a centre-pivoted primitive so its base, not its centre, meets the point.
      const b = go.bounds;
      if (PieMenuSettings.PlaceOnFloor && b) go.transform.position = spawnPoint.add(new Vector3(0, b.extents.y, 0));
    }
    Undo.setCurrentGroupName('Create ' + go.name);
  },
};

const add = (name: string, mesh: PrimitiveType | null, icon: string, available = true) =>
  new PieAction('Add Object', name, icon, () => SpawnPlacement.create(name, mesh), available ? {} : unavailable);

export const AddObjectActions = [
  add('Empty', null, 'd_GameObject Icon'),
  add('Cube', 'Cube', 'd_PreMatCube'),
  add('Sphere', 'Sphere', 'd_PreMatSphere'),
  add('Cylinder', 'Cylinder', 'd_PreMatCylinder'),
  add('Plane', 'Plane', 'd_PreMatQuad'),
  // Components the browser scene has no rendering for.
  add('Light', null, 'd_Light Icon', false),
  add('Camera', null, 'd_Camera Icon', false),
  add('Particle System', null, 'd_ParticleSystem Icon', false),
];

// ---- View: the numpad's camera moves under the mouse ----

const snap = (name: string, icon: string, axis: number, positive: boolean) =>
  new PieAction('View', name, icon, () => ViewportNavActions.snapToView(axis, positive), {
    isCurrent: (v) => ViewAlignment.isExactlyAligned(v, axis, positive),
  });

export const ViewActions = [
  snap('Left', 'NodeChevronLeft', 0, false),
  snap('Right', 'NodeChevronRight', 0, true),
  snap('Top', 'NodeChevronUp', 1, true),
  snap('Bottom', 'NodeChevronDown', 1, false),
  snap('Front', '', 2, true),
  snap('Back', '', 2, false),
  new PieAction('View', 'Toggle Projection', 'CameraPreview', () => ViewportNavActions.toggleProjection(), {
    label: (v) => (v?.orthographic ? 'Perspective' : 'Orthographic'),
  }),
  new PieAction('View', 'Camera', 'd_SceneViewCamera', () => ViewportNavActions.alignToCamera()),
];

// ---- Unity's own tools ----

const tool = (name: string, value: Tool, icon: string) =>
  new PieAction('Tools', name, icon, () => (Tools.current = value), { isCurrent: () => Tools.current === value });

export const UnityToolActions = [
  tool('Move', Tool.Move, 'd_MoveTool'),
  tool('Rotate', Tool.Rotate, 'd_RotateTool'),
  tool('Scale', Tool.Scale, 'd_ScaleTool'),
  tool('Transform', Tool.Transform, 'd_TransformTool'),
  // Tools the browser Scene view doesn't have.
  new PieAction('Tools', 'Rect', 'd_RectTool', () => {}, unavailable),
  new PieAction('Tools', 'View', 'd_ViewToolMove', () => {}, unavailable),
  new PieAction('Tools', 'Edit Box Collider', 'd_BoxCollider Icon', () => {}, unavailable),
  new PieAction('Tools', 'Create Spline', '', () => {}, unavailable),
];

export const ActionCatalog = {
  all: (): PieAction[] => [
    ...SnappingActions,
    ...ViewActions,
    ...ShadingActions,
    ...ToolsHandleActions,
    ...PivotPointActions,
    ...ResetActions.all,
    ...AddObjectActions,
    ...UnityToolActions,
  ],

  find(id: string | null | undefined) {
    if (!id) return null;
    return ActionCatalog.all().find((a) => a.id === id) ?? null;
  },
};
