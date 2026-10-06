// Copy and media for the landing page sections.
import posterAllTools from '../../assets/landing/posters/AllTools.jpg';
import posterBoxSelect from '../../assets/landing/posters/BoxSelect.jpg';
import posterContextMenu from '../../assets/landing/posters/ContextMenu.jpg';
import posterFrameSelected from '../../assets/landing/posters/FrameSelected.jpg';
import posterIsolateView from '../../assets/landing/posters/IsolateView.jpg';
import posterMove from '../../assets/landing/posters/Move.jpg';
import posterNumpadViews from '../../assets/landing/posters/NumpadViews.jpg';
import posterOrbitSelected from '../../assets/landing/posters/OrbitSelected.jpg';
import posterOrientationGizmo from '../../assets/landing/posters/OrientationGizmo.jpg';
import posterPan from '../../assets/landing/posters/Pan.jpg';
import posterPieMenus from '../../assets/landing/posters/PieMenus.jpg';
import posterRotate from '../../assets/landing/posters/Rotate.jpg';
import posterScale from '../../assets/landing/posters/Scale.jpg';
import posterSnapToFloor from '../../assets/landing/posters/SnapToFloor.jpg';
import posterTransform from '../../assets/landing/posters/Transform.jpg';
import posterViewHistory from '../../assets/landing/posters/ViewHistory.jpg';
import posterZoom from '../../assets/landing/posters/Zoom.jpg';
import slideOverview from '../../assets/landing/slides/overview.jpg';
import slideKeyboard from '../../assets/landing/slides/keyboard.jpg';
import slideOrbitSelected from '../../assets/landing/slides/orbit-selected.jpg';
import slideZoom from '../../assets/landing/slides/zoom.jpg';
import slideViewportNav from '../../assets/landing/slides/viewport-nav.jpg';
import slideSharedGizmos from '../../assets/landing/slides/shared-gizmos.jpg';
import slideBoxSelect from '../../assets/landing/slides/box-select.jpg';
import slidePieMenus from '../../assets/landing/slides/pie-menus.jpg';
import slideSceneMenu from '../../assets/landing/slides/scene-menu.jpg';
import slideHistory from '../../assets/landing/slides/history.jpg';

/** A leading "~" marks a plain separator ("+", "/", "drag"); everything else is a keycap. */
export type KeyTokens = string[];

export type FeatureGroupId = 'nav' | 'gizmos' | 'tools' | 'menus';

export const FEATURE_GROUPS: { id: FeatureGroupId; label: string }[] = [
  { id: 'nav', label: 'Navigation' },
  { id: 'gizmos', label: 'Transform gizmos' },
  { id: 'tools', label: 'Scene tools' },
  { id: 'menus', label: 'Menus' },
];

export interface Feature {
  id: string;
  group: FeatureGroupId;
  title: string;
  keys: KeyTokens;
  desc: string;
  /** Clip in public/plugin/video, shared with the settings window's page headers. */
  clip: string;
  poster: string;
}

export const FEATURES: Feature[] = [
  {
    id: 'orbit',
    group: 'nav',
    title: 'Orbit Selected',
    keys: ['MMB', '~drag'],
    desc: 'Orbit around the selection. Hold Alt to snap to a world axis, flick Alt + MMB to roll 90°.',
    clip: 'OrbitSelected',
    poster: posterOrbitSelected,
  },
  {
    id: 'pan',
    group: 'nav',
    title: 'Camera Pan',
    keys: ['Shift', '~+', 'MMB'],
    desc: 'The point under the cursor stays under the cursor, and the drag wraps past the view edge.',
    clip: 'Pan',
    poster: posterPan,
  },
  {
    id: 'zoom',
    group: 'nav',
    title: 'Zoom',
    keys: ['Scroll'],
    desc: "Blender's Scale, Dolly and Continue methods, toward the cursor. Numpad + and − step it from the keyboard.",
    clip: 'Zoom',
    poster: posterZoom,
  },
  {
    id: 'numpad',
    group: 'nav',
    title: 'Numpad Views',
    keys: ['1', '3', '7', '5', '0'],
    desc: 'Axis views, perspective toggle, orbit steps, reverse view and looking through the camera.',
    clip: 'NumpadViews',
    poster: posterNumpadViews,
  },
  {
    id: 'ogizmo',
    group: 'nav',
    title: 'Orientation Gizmo',
    keys: ['LMB'],
    desc: "Blender's axis ball in the corner. Click an axis to look down it, drag to orbit, middle-click to toggle perspective.",
    clip: 'OrientationGizmo',
    poster: posterOrientationGizmo,
  },
  {
    id: 'history',
    group: 'nav',
    title: 'View History',
    keys: ['Shift', '~+', 'Mouse 3', 'Mouse 4'],
    desc: 'Back and forward through camera positions, like a browser. Selections get the same, without Shift.',
    clip: 'ViewHistory',
    poster: posterViewHistory,
  },
  {
    id: 'move',
    group: 'gizmos',
    title: 'Move',
    keys: ['W'],
    desc: 'Arrows, plane handles and a free-move ring. Hold Alt to drop the selection onto the surface under the cursor.',
    clip: 'Move',
    poster: posterMove,
  },
  {
    id: 'rotate',
    group: 'gizmos',
    title: 'Rotate',
    keys: ['E'],
    desc: 'Rings that follow the cursor, a trackball and an angle arc. Hold Alt to aim the selection at a surface.',
    clip: 'Rotate',
    poster: posterRotate,
  },
  {
    id: 'scale',
    group: 'gizmos',
    title: 'Scale',
    keys: ['Shift', '~+', 'R'],
    desc: "Box-tipped axes, plane handles and a uniform-scale circle, with Blender's Global/Local behavior. R alone starts a grab rotate; on the Unity keyboard preset the Scale tool keeps R.",
    clip: 'Scale',
    poster: posterScale,
  },
  {
    id: 'transform',
    group: 'gizmos',
    title: 'Transform',
    keys: ['Y'],
    desc: 'All three in one, nested so they never fight. Every gizmo honors Pivot/Center and Local/Global, works with multi-selection and grid snapping, and cancels on right-click.',
    clip: 'Transform',
    poster: posterTransform,
  },
  {
    id: 'feedback',
    group: 'gizmos',
    title: 'Drag feedback',
    keys: ['Ctrl', 'Shift'],
    desc: 'Live readout, drag ghost, constraint line and snap ticks. Hold Ctrl to step from tick to tick, Shift for a slow, precise drag.',
    clip: 'AllTools',
    poster: posterAllTools,
  },
  {
    id: 'box',
    group: 'tools',
    title: 'Box Select',
    keys: ['LMB', '~drag'],
    desc: 'Selects everything the box touches, tested against real triangles. C includes hidden objects, Space moves the box. Off until you switch it on.',
    clip: 'BoxSelect',
    poster: posterBoxSelect,
  },
  {
    id: 'frame',
    group: 'tools',
    title: 'Frame Selected',
    keys: ['Num .'],
    desc: 'Each press steps on: the selection, its pivot, a close-up, then back to where you started.',
    clip: 'FrameSelected',
    poster: posterFrameSelected,
  },
  {
    id: 'isolate',
    group: 'tools',
    title: 'Isolate View',
    keys: ['Num /'],
    desc: 'Hides everything but the selection. Press again to bring the scene back.',
    clip: 'IsolateView',
    poster: posterIsolateView,
  },
  {
    id: 'floor',
    group: 'tools',
    title: 'Snap to Floor',
    keys: ['End'],
    desc: 'Drops the selection onto whatever is below it, optionally aligned to the slope.',
    clip: 'SnapToFloor',
    poster: posterSnapToFloor,
  },
  {
    id: 'pies',
    group: 'menus',
    title: 'Pie Menus',
    keys: ['Z', 'Q', 'Shift', '~+', 'A'],
    desc: 'Hold, flick, let go, or tap to keep it open. Eight built-in pies, plus a visual editor for your own that can run any menu command.',
    clip: 'PieMenus',
    poster: posterPieMenus,
  },
  {
    id: 'context',
    group: 'menus',
    title: 'Context Menu',
    keys: ['RMB'],
    desc: "Searchable, holds every entry Unity's menu has, plus Add, Snap to Floor, Align and Copy Transform. Shift + RMB opens Unity's own.",
    clip: 'ContextMenu',
    poster: posterContextMenu,
  },
];

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

export interface SettingsSlide {
  title: string;
  sub: string;
  desc: string;
  chips: string[];
  image: string;
}

export const SETTINGS_SLIDES: SettingsSlide[] = [
  {
    title: 'Blendon',
    sub: 'What Blendon does, what is switched on, and the keys it answers to',
    desc: "The start page. A master switch, three feature presets and the keyboard preset that decides who keeps a contested key. Clashes are listed side by side: Blendon keeps Grab on G, and Unity's Cycle Tool Modes moves to Shift + G.",
    chips: ['Master switch', 'Full · Essentials · Tools Only', 'Blendon / Unity keys'],
    image: slideOverview,
  },
  {
    title: 'Keyboard',
    sub: 'Every key Blendon answers to, in one table',
    desc: "Every shortcut Blendon declares, grouped by feature. Change one here and the feature's own page changes with it, because one binding sits behind both rows. Selecting Default in Edit → Shortcuts undoes every key change at once.",
    chips: ['Rebind', 'Reset one key', 'Clear', 'Open feature page'],
    image: slideKeyboard,
  },
  {
    title: 'Orbit Selected',
    sub: "Turn the camera around whatever is selected, not the Scene View's pivot",
    desc: 'Each feature page opens with an illustrated card: how it works, what to know, every key. Below it sits the tuning. With Depth on, orbiting with nothing selected turns around the surface under the cursor.',
    chips: ['Depth', 'Show Pivot Dot', 'Sensitivity', 'Snap View to World Axis', 'Quick Roll'],
    image: slideOrbitSelected,
  },
  {
    title: 'Zoom',
    sub: 'Wheel and keyboard zoom that moves toward the cursor rather than the centre',
    desc: 'Pick how the wheel zooms: Scale in even steps, Dolly flies the camera in, Continue zooms further the faster you roll. With Zoom To Cursor, the point under the cursor stays where it is.',
    chips: ['Method', 'Zoom To Cursor', 'Invert Direction', 'Sensitivity', 'Keyboard Zoom'],
    image: slideZoom,
  },
  {
    title: 'Numpad Views',
    sub: "Blender's numpad: axis views, stepped orbit, projection toggle",
    desc: 'Each keypad key sends the view to a fixed angle around the pivot, and the same key always lands on the same view. With Orbit Selected on, the steps turn around the selection. Animate flies to each view instead of cutting.',
    chips: ['Animate', 'Axis views', 'Orbit steps', 'Toggle Projection'],
    image: slideViewportNav,
  },
  {
    title: 'All Tools',
    sub: 'Settings the four tools below share - size, snapping, precision, readouts',
    desc: "One switch for all four transform gizmos and everything a drag shares: the ghost of where it started, the constraint line, snap ticks and the live readout. Each tool's own page then multiplies or overrides what it needs.",
    chips: ['Blender · Unity+ · Custom', 'Pivot Point Menu', 'Vertex Snapping', 'Precision Mode'],
    image: slideSharedGizmos,
  },
  {
    title: 'Box Select',
    sub: 'Drag a box that selects everything it touches, not just what fits inside it',
    desc: 'The box is tested against real shapes, so a long diagonal object counts only where the box actually crosses it. Visible Only skips what is hidden behind other objects. The feature ships switched off until you turn it on.',
    chips: ['Select Prefab Roots', 'Visible Only', 'Click Selects Parent', 'Hierarchy keys'],
    image: slideBoxSelect,
  },
  {
    title: 'Pie Menus',
    sub: 'Radial menus you hold a key to open - the shipped ones and your own',
    desc: 'One place for how every pie behaves: how far a flick must travel, how long a tap may last, whether items show their numbers. Eight menus ship with Blendon, and you can add up to eight of your own from any Blendon action or Unity menu command.',
    chips: ['Deadzone', 'Tap Timeout', 'Show Numbers', 'Place On Floor'],
    image: slidePieMenus,
  },
  {
    title: 'Context Menu',
    sub: "Right-click the Scene View for a grouped, searchable menu with every entry Unity's has",
    desc: "Every entry of the Editor's own menu, grouped and with its keys, plus a search field: just start typing. The Extra Entries table adds Blendon's own actions, and a right-click that drags still flies through the scene.",
    chips: ['Edit Actions', 'Search Field', 'Classic Menu Row', 'Extra Entries'],
    image: slideSceneMenu,
  },
  {
    title: 'Navigation History',
    sub: 'Step back and forward through selections and camera positions',
    desc: "Selection History and View History, each with its own switch. Both work like a browser's back and forward on the mouse side buttons, keep up to 100 steps, and start a fresh trail when you pick something new after going back.",
    chips: ['Selection History', 'View History', 'Back / Forward', 'Animate'],
    image: slideHistory,
  },
];

export const SHORTCUTS: [string, KeyTokens][] = [
  ['Orbit', ['MMB']],
  ['Quick Roll', ['Alt', '~+', 'MMB', '~flick']],
  ['Pan', ['Shift', '~+', 'MMB']],
  ['Zoom', ['Scroll', 'Num +', 'Num −']],
  ['Front / Right / Top', ['Num 1', 'Num 3', 'Num 7']],
  ['Opposite side', ['Ctrl', '~+', 'Num 1', 'Num 3', 'Num 7']],
  ['Perspective / Ortho', ['Num 5']],
  ['Orbit steps', ['Num 2', 'Num 4', 'Num 6', 'Num 8']],
  ['Reverse view', ['Num 9']],
  ['Camera view', ['Num 0']],
  ['Selection history', ['Mouse 3', 'Mouse 4']],
  ['View history', ['Shift', '~+', 'Mouse 3', 'Mouse 4']],
  ['Box Select', ['LMB', '~drag']],
  ['Grab / Rotate / Scale', ['G', 'R', 'S']],
  ['Vertex snap', ['~hold', 'V']],
  ['Virtual pivot', ['Shift', '~+', 'V']],
  ['Move / Rotate / Transform tool', ['W', 'E', 'Y']],
  ['Scale tool', ['Shift', '~+', 'R']],
  ['Frame Selected / Isolate View', ['Num .', '~/', 'Num /']],
  ['Snap to Floor', ['End']],
  ['Select parent / children', ['[', ']']],
  ['Draw Mode pie / Wireframe', ['Z', '~/', 'Shift', '~+', 'Z']],
  ['Add Object / Snapping pie', ['Shift', '~+', 'A', '~/', 'Shift', '~+', 'S']],
  ['Orientation / Pivot Point pie', [',', '~/', '.']],
  ['Reset / View / Tools pie', ['/', '`', 'Q']],
  ['Context menu', ['RMB']],
];
