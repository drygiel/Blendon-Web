// TutorialCurriculum: the six chapters of the Scene View tutorial card, as Blendon ships them.
import { ShortcutManager } from '../../unity/editor.ts';
import { Color } from '../../unity/math.ts';
import { ModifierKeys } from '../foundation.ts';
import { MoveGizmo } from '../gizmos/move/move-gizmo.ts';
import { RotateGizmo } from '../gizmos/rotate/rotate-gizmo.ts';
import { SharedGizmoSettings } from '../gizmos/shared-settings.ts';
import { OrbitSelectedSettings } from '../navigation/orbit-selected.ts';
import { OrientationGizmoSettings } from '../navigation/orientation/gizmo.ts';
import { PanSettings } from '../navigation/pan.ts';
import { ViewportNavSettings } from '../navigation/viewport-nav.ts';
import { ZoomSettings } from '../navigation/zoom.ts';
import { PieMenuSettings } from '../piemenus/settings.ts';
import {
  FrameSelectedSettings,
  IsolateViewSettings,
  SelectionHistorySettings,
  SnapToFloorSettings,
  ViewHistorySettings,
} from '../scenetools/settings.ts';
import { GeneralSettings } from '../settings.ts';

export interface TutorialTask {
  id: string;
  title: string;
  hint: string;
  /** A gesture's signal; empty for a task a shortcut answers. */
  signal: string;
  shortcutIds: string[];
  /** Whether the feature it teaches is switched on. */
  pageEnabled: () => boolean;
  /** Overrides the first shortcut's binding as the keys shown. */
  keys?: () => string;
}

export interface TutorialChapter {
  title: string;
  subtitle: string;
  iconName: string;
  accent: Color;
  tasks: TutorialTask[];
}

const binding = (id: string) => ShortcutManager.bindingText(id);
const modifier = (m: number) => ModifierKeys.displayName(m);

const shortcut = (id: string, title: string, hint: string, page: () => boolean, ...ids: string[]): TutorialTask => ({
  id,
  title,
  hint,
  signal: '',
  shortcutIds: ids,
  pageEnabled: page,
});

const gesture = (
  id: string,
  title: string,
  hint: string,
  signal: string,
  page: () => boolean,
  keys?: () => string,
): TutorialTask => ({ id, title, hint, signal, shortcutIds: [], pageEnabled: page, keys });

export const TutorialTasks = {
  keys(task: TutorialTask) {
    if (task.keys) return task.keys();
    return task.shortcutIds.length ? binding(task.shortcutIds[0]) : '';
  },

  isSkipped(task: TutorialTask) {
    if (!task.pageEnabled()) return true;
    return task.shortcutIds.length > 0 && !TutorialTasks.keys(task);
  },
};

const Pages = {
  OrbitSelected: () => OrbitSelectedSettings.Enabled,
  Pan: () => PanSettings.Enabled,
  Zoom: () => ZoomSettings.Enabled,
  FrameSelected: () => FrameSelectedSettings.Enabled,
  ViewportNav: () => ViewportNavSettings.Enabled,
  MoveGizmo: () => MoveGizmo.instance.settings.Enabled,
  RotateGizmo: () => RotateGizmo.instance.settings.Enabled,
  ScaleGizmo: () => GeneralSettings.Enabled,
  SharedGizmos: () => GeneralSettings.Enabled,
  SnapToFloor: () => SnapToFloorSettings.Enabled,
  IsolateView: () => IsolateViewSettings.Enabled,
  History: () => SelectionHistorySettings.Enabled || ViewHistorySettings.Enabled,
  OrientationGizmo: () => OrientationGizmoSettings.Enabled,
  PieMenus: () => PieMenuSettings.Enabled,
  Overview: () => GeneralSettings.Enabled,
};

export const TutorialCurriculum: TutorialChapter[] = [
  {
    title: 'Navigating the View',
    subtitle: "The camera, Blender's way",
    iconName: 'd_SceneViewCamera',
    accent: Color.hex('#40B8EB'),
    tasks: [
      shortcut(
        'nav.orbit',
        'Orbit around your selection',
        "Select something, then hold the orbit button and drag - the camera turns around the selection, not around the view's own pivot.",
        Pages.OrbitSelected,
        'Blendon/Orbit Selected',
      ),
      gesture(
        'nav.axis-snap',
        'Snap the view to a world axis',
        'Start the orbit drag first, then hold this key: as the view comes near a world axis it locks onto it and drops into orthographic. Let go for a free perspective orbit again.',
        'OrbitAxisSnap',
        Pages.OrbitSelected,
        () => modifier(OrbitSelectedSettings.SnapModifier),
      ),
      shortcut(
        'nav.quick-roll',
        'Roll the view 90°',
        'Hold Alt and flick MMB in any direction - the view rolls 90° that way and lands squarely on the nearest axis view.',
        Pages.OrbitSelected,
        'Blendon/Quick Roll',
      ),
      shortcut(
        'nav.pan',
        'Slide the camera sideways',
        'Pan keeps the point under the cursor anchored, so the scene tracks your hand instead of drifting.',
        Pages.Pan,
        'Blendon/Camera Pan',
      ),
      gesture(
        'nav.zoom',
        'Zoom toward the cursor',
        'Point at something across the scene and scroll - you close in on that, not on the middle of the view.',
        'ZoomWheel',
        Pages.Zoom,
        () => 'Wheel',
      ),
      shortcut(
        'nav.frame',
        'Frame the selection',
        'Press it again without changing the selection to step through the cycle: bounds, pivot, close, then back where you started.',
        Pages.FrameSelected,
        'Blendon/Frame Selected',
      ),
      gesture(
        'nav.axis-view',
        'Jump to an axis view',
        'The numpad views: front, right and top, with the action modifier for the opposite side of each. NumLock has to be on.',
        'AxisView',
        Pages.ViewportNav,
        () => binding('Blendon/Viewport Nav/View Front'),
      ),
    ],
  },
  {
    title: 'Grab, Rotate, Scale',
    subtitle: 'Transform with no handle',
    iconName: 'd_MoveTool',
    accent: Color.hex('#E6574F'),
    tasks: [
      shortcut(
        'grab.move',
        'Grab the selection and move it',
        'The selection follows the cursor across the screen - no handle to hit first.',
        Pages.MoveGizmo,
        'Blendon/Grab',
      ),
      gesture(
        'grab.confirm',
        'Confirm a transform',
        'A left click or Enter drops the selection where it is and ends the grab.',
        'TransformConfirmed',
        Pages.MoveGizmo,
        () => 'Return',
      ),
      gesture(
        'grab.cancel',
        'Cancel a transform',
        'Right-click or Escape mid-grab and everything goes back exactly where it started - one undo step, never a half-applied move.',
        'TransformCancelled',
        Pages.MoveGizmo,
        () => 'Mouse 1',
      ),
      shortcut(
        'grab.rotate',
        'Grab-rotate the selection',
        'The same gesture for rotation: the angle follows the cursor around the pivot.',
        Pages.RotateGizmo,
        'Blendon/Grab Rotate',
      ),
      shortcut(
        'grab.scale',
        'Grab-scale the selection',
        'And for scale: move away from the pivot to grow, toward it to shrink.',
        Pages.ScaleGizmo,
        'Blendon/Grab Scale',
      ),
    ],
  },
  {
    title: 'Handles & Snapping',
    subtitle: 'What the handles land on',
    iconName: 'd_Transform Icon',
    accent: Color.hex('#B861EB'),
    tasks: [
      gesture(
        'handles.axis',
        'Drag an axis handle',
        "The arrows and boxes work as they always did - they just draw Blender's way, and honour everything this tutorial has taught so far.",
        'HandleAxisDrag',
        Pages.MoveGizmo,
      ),
      gesture(
        'handles.plane',
        'Drag a plane handle',
        'The small square between two arrows moves along both of those axes at once.',
        'HandlePlaneDrag',
        Pages.MoveGizmo,
      ),
      gesture(
        'handles.ring',
        'Turn a rotation ring',
        'Switch to the rotate tool and drag one of the coloured rings; the angle follows the cursor around the pivot.',
        'HandleRingDrag',
        Pages.RotateGizmo,
      ),
      gesture(
        'snap.surface',
        'Drop an object onto a surface',
        'Hold this key while moving: the selection follows the surface under the cursor, for placing things on a floor or a wall.',
        'SurfaceSnap',
        Pages.MoveGizmo,
        () => modifier(MoveGizmo.instance.settings.SurfaceSnapModifier),
      ),
      gesture(
        'snap.lookat',
        'Aim an object at something',
        'The same key while rotating aims the selection at whatever is under the cursor.',
        'LookAt',
        Pages.RotateGizmo,
        () => modifier(RotateGizmo.instance.settings.LookAtModifier),
      ),
      gesture(
        'snap.vertex',
        'Snap to a vertex',
        "Unity's own vertex snapping: hold the key, pick up the selection by one of its vertices and drop it onto another object's.",
        'VertexSnap',
        Pages.SharedGizmos,
        () => binding('Blendon/Vertex Snap'),
      ),
      shortcut(
        'snap.virtual-pivot',
        'Pin a virtual pivot',
        'Toggle it, then click a vertex to settle on it - drags snap from that point instead of a default origin, until you toggle the mode off again.',
        Pages.SharedGizmos,
        'Blendon/Pick Virtual Pivot',
      ),
      shortcut(
        'snap.floor',
        'Drop the selection to the floor',
        "Rests each object's bounds on whatever is below it, ignoring its own colliders.",
        Pages.SnapToFloor,
        'Blendon/Snap To Floor',
      ),
    ],
  },
  {
    title: 'Precision',
    subtitle: 'Exact values, mid-drag',
    iconName: 'd_Grid.PickingTool',
    accent: Color.hex('#BF59E6'),
    tasks: [
      gesture(
        'precision.axis',
        'Constrain a drag to one axis',
        'During any drag press X, Y or Z. Press the same key again to switch between global and local; a third press on a G/R/S grab frees the axis.',
        'AxisConstraint',
        Pages.SharedGizmos,
        () => 'X',
      ),
      gesture(
        'precision.numeric',
        'Type an exact value',
        'Mid-drag, type a number and press Enter. The mouse stops driving the moment the first digit lands.',
        'NumericTyped',
        Pages.SharedGizmos,
        () => '0-9',
      ),
      gesture(
        'precision.plane',
        'Lock a plane instead of an axis',
        'Hold this modifier with an axis key to exclude that axis rather than isolate it - the drag then runs across the other two.',
        'PlaneLock',
        Pages.SharedGizmos,
        () => modifier(SharedGizmoSettings.AxisExcludeModifier) + '+X',
      ),
      gesture(
        'precision.snap',
        'Snap to the increment lattice',
        "Hold the action key while dragging to land on Unity's own snap increments; ticks are drawn along the handle as you go.",
        'IncrementalSnap',
        Pages.SharedGizmos,
        () => 'Ctrl',
      ),
      gesture(
        'precision.slow',
        'Slow a drag down for fine work',
        'Hold this key mid-drag: the selection moves a fraction of the distance the cursor does, and every snap step halves.',
        'PrecisionDrag',
        Pages.SharedGizmos,
        () => modifier(SharedGizmoSettings.PrecisionModifier),
      ),
    ],
  },
  {
    title: 'Scene Tools',
    subtitle: 'The rest of the Scene View',
    iconName: 'd_UnityEditor.SceneHierarchyWindow',
    accent: Color.hex('#D98C4C'),
    tasks: [
      shortcut(
        'tools.isolate',
        'Isolate the selection, then leave',
        'Hides everything else while you work. The same key brings the scene back.',
        Pages.IsolateView,
        'Blendon/Isolate View',
      ),
      shortcut(
        'tools.selection-history',
        'Step back through selections',
        "Browser-style back and forward for what you had selected - the mouse's own side buttons by default.",
        Pages.History,
        'Blendon/History/Undo Selection',
        'Blendon/History/Redo Selection',
      ),
      shortcut(
        'tools.view-history',
        'Step back through camera positions',
        'The same pair with the shift modifier undoes where you were looking from, not what was selected.',
        Pages.History,
        'Blendon/History/Undo View',
        'Blendon/History/Redo View',
      ),
      gesture(
        'tools.orientation',
        'Click an axis on the orientation gizmo',
        'The ball in the corner of the view: click a handle to swing round to that axis, drag inside it to orbit, middle-click to toggle projection.',
        'OrientationGizmoClick',
        Pages.OrientationGizmo,
      ),
    ],
  },
  {
    title: 'Pie Menus & Setup',
    subtitle: 'Menus on a key, and setup',
    iconName: 'd_AvatarPivot',
    accent: Color.hex('#598CF2'),
    tasks: [
      gesture(
        'pie.flick',
        'Run a pie item with a flick',
        'Hold the key, flick the mouse toward an item and let go. Direction is all that counts - you never have to land on the button.',
        'PieFlick',
        Pages.PieMenus,
        () => binding('Blendon/Pie Menus/Shading'),
      ),
      gesture(
        'pie.tap',
        'Latch a pie open and click',
        'Tap the same key instead of holding it: the menu stays up, and a left click runs an item.',
        'PieTap',
        Pages.PieMenus,
      ),
      gesture(
        'pie.number',
        'Run a pie item by its number',
        'Every item is numbered; its number key runs it directly while the menu is open.',
        'PieNumber',
        Pages.PieMenus,
        () => '1-8',
      ),
      gesture(
        'setup.settings',
        "Open Blendon's settings",
        'Tools → Blendon in Unity; on this page, the settings window further down. Every feature here can be switched off on its own, and its keys go straight back to the Editor.',
        'SettingsOpened',
        Pages.Overview,
      ),
    ],
  },
];
