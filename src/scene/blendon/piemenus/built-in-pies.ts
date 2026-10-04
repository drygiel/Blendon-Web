// BuiltInPies: the eight pies Blendon ships, as clutch shortcuts over the shipped default content
// (PieMenus.defaults.json), plus Shift+Z's wireframe toggle.
import { ShortcutManager, ShortcutStage, type ShortcutArguments } from '../../unity/editor.ts';
import { editorIcon } from '../../unity/icons.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { ShortcutTips } from '../foundation.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { ActionCatalog, SpawnPlacement } from './actions.ts';
import { PieMenuData } from './model.ts';
import { PieMenu } from './pie-menu.ts';
import { WireframeToggleSettings } from './settings.ts';
import { ShadingMode, ShadingModes } from './shading-modes.ts';

interface PieDef {
  shortcutId: string;
  /** Blender's key, used when the window has no binding of its own. */
  key: string;
  title: string;
  /** [action id, icon]; a slot's position in the list is its place on the ring. */
  items: [string, string][];
}

const P = 'Blendon/Pie Menus/';

export const BuiltInPies: PieDef[] = [
  {
    shortcutId: P + 'Shading',
    key: 'Z',
    title: 'Draw Mode',
    items: [
      ['Blendon/Shading/Wireframe', 'd_wireframe'],
      ['Blendon/Shading/Unlit', 'd_UnlitMode'],
      ['Blendon/Shading/Shaded', 'd_Shaded'],
      ['Blendon/Shading/Wireframe Shaded', 'd_ShadedWireframe'],
    ],
  },
  {
    shortcutId: P + 'Add Object',
    key: 'Shift+A',
    title: 'Add Object',
    items: [
      ['Blendon/Add Object/Cube', 'd_PreMatCube'],
      ['Blendon/Add Object/Empty', 'd_GameObject Icon'],
      ['Blendon/Add Object/Sphere', 'd_PreMatSphere'],
      ['Blendon/Add Object/Camera', 'd_Camera Icon'],
      ['Blendon/Add Object/Cylinder', 'd_PreMatCylinder'],
      ['Blendon/Add Object/Light', 'd_Light Icon'],
      ['Blendon/Add Object/Particle System', 'd_ParticleSystem Icon'],
      ['Blendon/Add Object/Plane', 'd_PreMatQuad'],
    ],
  },
  {
    shortcutId: P + 'Snapping',
    key: 'Shift+S',
    title: 'Snapping',
    items: [
      ['Blendon/Snapping/Incremental', 'd_SnapIncrement'],
      ['Blendon/Snapping/Angle', 'd_AngleSnap'],
      ['Blendon/Snapping/Scale', 'd_ScaleSnap'],
      ['Blendon/Snapping/Grid', 'd_SceneViewSnap'],
    ],
  },
  {
    shortcutId: P + 'Tools Handle',
    key: ',',
    title: 'Orientation',
    items: [
      ['Blendon/Tools Handle/Global', 'd_ToolHandleGlobal'],
      ['Blendon/Tools Handle/Grid', 'd_GridAndSnap'],
      ['Blendon/Tools Handle/Local', 'd_ToolHandleLocal'],
    ],
  },
  {
    shortcutId: P + 'Pivot Point',
    key: '.',
    title: 'Pivot Point',
    items: [
      ['Blendon/Pivot Point/Center (Bounding Box)', 'd_ToolHandleCenter'],
      ['Blendon/Pivot Point/Median Point', 'd_RectTool'],
      ['Blendon/Pivot Point/Active Object', 'd_AvatarPivot'],
      ['Blendon/Pivot Point/Pivot (Individual Origins)', 'd_ToolHandlePivot'],
    ],
  },
  {
    shortcutId: P + 'Reset',
    key: '/',
    title: 'Reset',
    items: [
      ['Blendon/Reset/Position', 'd_MoveTool'],
      ['Blendon/Reset/Scale', 'd_ScaleTool'],
      ['Blendon/Reset/Rotation', 'd_RotateTool'],
      ['Blendon/Reset/All', 'd_TransformTool'],
    ],
  },
  {
    shortcutId: P + 'View',
    key: '`',
    title: 'View',
    items: [
      ['Blendon/View/Left', 'NodeChevronLeft'],
      ['Blendon/View/Top', 'NodeChevronUp'],
      ['Blendon/View/Right', 'NodeChevronRight'],
      ['Blendon/View/Bottom', 'NodeChevronDown'],
      ['Blendon/View/Front', ''],
      ['Blendon/View/Toggle Projection', 'CameraPreview'],
      ['Blendon/View/Camera', 'd_SceneViewCamera'],
      ['Blendon/View/Back', ''],
    ],
  },
  {
    shortcutId: P + 'Unity Tools',
    key: 'Q',
    title: 'Tools',
    items: [
      ['Blendon/Tools/Move', 'd_MoveTool'],
      ['Blendon/Tools/Scale', 'd_ScaleTool'],
      ['Blendon/Tools/Rotate', 'd_RotateTool'],
      ['Blendon/Tools/Transform', 'd_TransformTool'],
      ['Blendon/Tools/Rect', 'd_RectTool'],
      ['Blendon/Tools/Edit Box Collider', 'd_BoxCollider Icon'],
      ['Blendon/Tools/Create Spline', ''],
      ['Blendon/Tools/View', 'd_ViewToolMove'],
    ],
  },
];

function build(def: PieDef, view: SceneView) {
  return new PieMenuData(
    def.title,
    def.items.map(([id, icon]) => ActionCatalog.find(id)?.createItem(view, icon) ?? null),
  );
}

function handle(def: PieDef, args: ShortcutArguments) {
  if (args.stage === ShortcutStage.End) {
    PieMenu.notifyHotkeyReleased(def.shortcutId);
    return;
  }
  const view = (args.context as SceneView | null) ?? SceneView.lastActiveSceneView;
  if (!view) return;
  // An empty ring would open and swallow every event until dismissed.
  const data = build(def, view);
  if (data.directionMask === 0) return;
  PieMenu.request(data, view, def.shortcutId);
  ShortcutTips.note(def.shortcutId);
}

// ---- Shift+Z: into Wireframe and back out to whatever was showing ----

const WireframeShortcutId = 'Blendon/Toggle Wireframe';
const previous = new WeakMap<SceneView, ShadingMode>();

function toggleWireframe(args: ShortcutArguments) {
  if (!WireframeToggleSettings.Enabled) return;
  // Mid-grab this key is Blender's plane lock, owned by the manipulation.
  if (ViewportGesture.claimed(WireframeShortcutId)) return;
  if (ViewportGesture.busy) return;
  const view = (args.context as SceneView | null) ?? SceneView.lastActiveSceneView;
  if (!view) return;
  const current = ShadingModes.current(view);
  if (current === ShadingMode.Wireframe) {
    ShadingModes.apply(view, previous.get(view) ?? ShadingMode.Shaded);
  } else {
    previous.set(view, current);
    ShadingModes.apply(view, ShadingMode.Wireframe);
  }
  ShortcutTips.note(WireframeShortcutId);
}

export const PieMenus = {
  install() {
    PieMenu.install();
    SpawnPlacement.install();
    for (const def of BuiltInPies) {
      ShortcutManager.register(def.shortcutId, (args) => handle(def, args), true, def.key);
      // Icons load lazily; fetched up front so a first open doesn't reflow as they arrive.
      for (const [, icon] of def.items) editorIcon(icon);
    }
    ShortcutManager.register(WireframeShortcutId, toggleWireframe, false, 'Shift+Z');
  },
};
