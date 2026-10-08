// The pie menu demo's menus.
import type { KeyTokens } from '../ui/KeyCap.tsx';

export interface PieDemo {
  id: string;
  title: string;
  keys: KeyTokens;
  /** In Blender's pie order: left, up, right, down, then upper-right, lower-right, lower-left, upper-left. */
  items: string[];
  /** Unity editor icon per item, as in the plugin's built-in pies; '' for none. */
  icons: string[];
  /** The item shown as current (tinted blue), or -1. */
  active: number;
  /** Items are independent on/off switches rather than one current choice. */
  toggles?: boolean;
  disabled?: number[];
  note: string;
}

export const PIES: PieDemo[] = [
  {
    id: 'draw',
    title: 'Draw Mode',
    keys: ['Z'],
    items: ['Wireframe', 'Unlit', 'Shaded', 'Wireframe Shaded'],
    icons: ['d_wireframe', 'd_UnlitMode', 'd_Shaded', 'd_ShadedWireframe'],
    active: 2,
    note: 'Shift + Z toggles wireframe without the menu',
  },
  {
    id: 'add',
    title: 'Add Object',
    keys: ['Shift', '~+', 'A'],
    items: ['Cube', 'Empty', 'Sphere', 'Camera', 'Cylinder', 'Light', 'Particle System', 'Plane'],
    icons: [
      'd_PreMatCube',
      'd_GameObject_Icon',
      'd_PreMatSphere',
      'd_Camera_Icon',
      'd_PreMatCylinder',
      'd_Light_Icon',
      'd_ParticleSystem_Icon',
      'd_PreMatQuad',
    ],
    active: -1,
    note: 'New objects land where the pie was opened, resting on the surface',
  },
  {
    id: 'snap',
    title: 'Snapping',
    keys: ['Shift', '~+', 'S'],
    items: ['Incremental', 'Angle', 'Scale', 'Grid'],
    icons: ['d_SnapIncrement', 'd_AngleSnap', 'd_ScaleSnap', 'd_SceneViewSnap'],
    active: 0,
    toggles: true,
    note: "Toggles Unity's own snap settings. Blue means on",
  },
  {
    id: 'orient',
    title: 'Orientation',
    keys: [','],
    items: ['Global', 'Grid', 'Local'],
    icons: ['d_ToolHandleGlobal', 'd_GridAndSnap', 'd_ToolHandleLocal'],
    active: 0,
    note: 'Grid sits where Blender keeps Gimbal',
  },
  {
    id: 'pivot',
    title: 'Pivot Point',
    keys: ['.'],
    items: ['Center', 'Median', 'Active', 'Pivot'],
    icons: ['d_ToolHandleCenter', 'd_RectTool', 'd_AvatarPivot', 'd_ToolHandlePivot'],
    active: 0,
    note: "Blender's four pivot modes, laid out as Blender lays them out",
  },
  {
    id: 'reset',
    title: 'Reset',
    keys: ['/'],
    items: ['Position', 'Scale', 'Rotation', 'All'],
    icons: ['d_MoveTool', 'd_ScaleTool', 'd_RotateTool', 'd_TransformTool'],
    active: -1,
    note: 'Resets the local transform of every selected object, fully undoable',
  },
  {
    id: 'view',
    title: 'View',
    keys: ['`'],
    items: ['Left', 'Top', 'Right', 'Bottom', 'Front', 'Orthographic', 'Camera', 'Back'],
    icons: [
      'NodeChevronLeft',
      'NodeChevronUp',
      'NodeChevronRight',
      'NodeChevronDown',
      '',
      'CameraPreview',
      'd_SceneViewCamera',
      '',
    ],
    active: -1,
    note: "The numpad's camera moves, under the mouse",
  },
  {
    id: 'tools',
    title: 'Tools',
    keys: ['Q'],
    items: ['Move', 'Scale', 'Rotate', 'Transform', 'Rect', 'Edit Box Collider', 'Create Spline', 'View'],
    icons: [
      'd_MoveTool',
      'd_ScaleTool',
      'd_RotateTool',
      'd_TransformTool',
      'd_RectTool',
      'd_BoxCollider_Icon',
      '',
      'd_ViewToolMove',
    ],
    active: 0,
    disabled: [5],
    note: "Edit Box Collider stays greyed: Unity's tool has no public entry point",
  },
];
