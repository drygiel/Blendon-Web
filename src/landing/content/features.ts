// The Features explorer: groups, features and their clips.
import { responsive, type ImageWidth } from '../../lib/images.ts';
import type { KeyTokens } from '../ui/KeyCap.tsx';

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
}

// Posters share the clips' names, each in a few WebP widths for the player's srcset.
const POSTERS = import.meta.glob<ImageWidth[]>('../../assets/landing/posters/*.jpg', {
  eager: true,
  import: 'default',
  query: '?w=640;960;1280&format=webp&as=meta:src;width',
});

/** The still shown in the player until a clip's first frame. */
export const posterOf = (clip: string) => responsive(POSTERS[`../../assets/landing/posters/${clip}.jpg`] ?? []);

export const FEATURES: Feature[] = [
  {
    id: 'orbit',
    group: 'nav',
    title: 'Orbit Selected',
    keys: ['MMB', '~drag'],
    desc: 'Orbit around the selection. Hold Alt to snap to a world axis, flick Alt + MMB to roll 90°.',
    clip: 'OrbitSelected',
  },
  {
    id: 'pan',
    group: 'nav',
    title: 'Camera Pan',
    keys: ['Shift', '~+', 'MMB'],
    desc: 'The point under the cursor stays under the cursor, and the drag wraps past the view edge.',
    clip: 'Pan',
  },
  {
    id: 'zoom',
    group: 'nav',
    title: 'Zoom',
    keys: ['Scroll'],
    desc: "Blender's Scale, Dolly and Continue methods, toward the cursor. Numpad + and − step it from the keyboard.",
    clip: 'Zoom',
  },
  {
    id: 'numpad',
    group: 'nav',
    title: 'Numpad Views',
    keys: ['1', '3', '7', '5', '0'],
    desc: 'Axis views, perspective toggle, orbit steps, reverse view and looking through the camera.',
    clip: 'NumpadViews',
  },
  {
    id: 'ogizmo',
    group: 'nav',
    title: 'Orientation Gizmo',
    keys: ['LMB'],
    desc: "Blender's axis ball in the corner. Click an axis to look down it, drag to orbit, middle-click to toggle perspective.",
    clip: 'OrientationGizmo',
  },
  {
    id: 'history',
    group: 'nav',
    title: 'View History',
    keys: ['Shift', '~+', 'Mouse 3', 'Mouse 4'],
    desc: 'Back and forward through camera positions, like a browser. Selections get the same, without Shift.',
    clip: 'ViewHistory',
  },
  {
    id: 'move',
    group: 'gizmos',
    title: 'Move',
    keys: ['W'],
    desc: 'Arrows, plane handles and a free-move ring. Hold Alt to drop the selection onto the surface under the cursor.',
    clip: 'Move',
  },
  {
    id: 'rotate',
    group: 'gizmos',
    title: 'Rotate',
    keys: ['E'],
    desc: 'Rings that follow the cursor, a trackball and an angle arc. Hold Alt to aim the selection at a surface.',
    clip: 'Rotate',
  },
  {
    id: 'scale',
    group: 'gizmos',
    title: 'Scale',
    keys: ['Shift', '~+', 'R'],
    desc: "Box-tipped axes, plane handles and a uniform-scale circle, with Blender's Global/Local behavior. R alone starts a grab rotate; on the Unity keyboard preset the Scale tool keeps R.",
    clip: 'Scale',
  },
  {
    id: 'transform',
    group: 'gizmos',
    title: 'Transform',
    keys: ['Y'],
    desc: 'All three in one, nested so they never fight. Every gizmo honors Pivot/Center and Local/Global, works with multi-selection and grid snapping, and cancels on right-click.',
    clip: 'Transform',
  },
  {
    id: 'feedback',
    group: 'gizmos',
    title: 'Drag feedback',
    keys: ['Ctrl', 'Shift'],
    desc: 'Live readout, drag ghost, constraint line and snap ticks. Hold Ctrl to step from tick to tick, Shift for a slow, precise drag.',
    clip: 'AllTools',
  },
  {
    id: 'box',
    group: 'tools',
    title: 'Box Select',
    keys: ['LMB', '~drag'],
    desc: 'Selects everything the box touches, tested against real triangles. C includes hidden objects, Space moves the box. Off until you switch it on.',
    clip: 'BoxSelect',
  },
  {
    id: 'frame',
    group: 'tools',
    title: 'Frame Selected',
    keys: ['Num .'],
    desc: 'Each press steps on: the selection, its pivot, a close-up, then back to where you started.',
    clip: 'FrameSelected',
  },
  {
    id: 'isolate',
    group: 'tools',
    title: 'Isolate View',
    keys: ['Num /'],
    desc: 'Hides everything but the selection. Press again to bring the scene back.',
    clip: 'IsolateView',
  },
  {
    id: 'floor',
    group: 'tools',
    title: 'Snap to Floor',
    keys: ['End'],
    desc: 'Drops the selection onto whatever is below it, optionally aligned to the slope.',
    clip: 'SnapToFloor',
  },
  {
    id: 'pies',
    group: 'menus',
    title: 'Pie Menus',
    keys: ['Z', 'Q', 'Shift', '~+', 'A'],
    desc: 'Hold, flick, let go, or tap to keep it open. Eight built-in pies, plus a visual editor for your own that can run any menu command.',
    clip: 'PieMenus',
  },
  {
    id: 'context',
    group: 'menus',
    title: 'Context Menu',
    keys: ['RMB'],
    desc: "Searchable, holds every entry Unity's menu has, plus Add, Snap to Floor, Align and Copy Transform. Shift + RMB opens Unity's own.",
    clip: 'ContextMenu',
  },
];
