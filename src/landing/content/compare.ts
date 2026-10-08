// The What Changes table: everyday tasks in Unity and with Blendon.
import type { KeyTokens } from '../ui/KeyCap.tsx';

export interface Comparison {
  task: string;
  unity: string;
  blendon: string;
  keys: KeyTokens;
}

export const COMPARISON: Comparison[] = [
  {
    task: 'Look around an object',
    unity: "Orbit turns around the Scene view's pivot, so you frame the object first",
    blendon: 'Orbit turns around the selection, or the point under the cursor',
    keys: ['MMB', '~drag'],
  },
  {
    task: 'Zoom in on a detail',
    unity: 'The wheel zooms toward the pivot in the middle of the view',
    blendon: 'The point under the cursor stays where it is',
    keys: ['Scroll'],
  },
  {
    task: 'Move something exactly 2 m',
    unity: 'Drag a handle, then fix the number in the Inspector',
    blendon: 'Grab, pick the axis, type the distance. No handle, no Inspector',
    keys: ['G', 'X', '2', 'Enter'],
  },
  {
    task: 'Box-select a few objects',
    unity: 'Only objects that fit wholly inside the box are picked',
    blendon: 'Everything the box touches, tested against real triangles',
    keys: ['LMB', '~drag'],
  },
  {
    task: 'Look straight down an axis',
    unity: 'Click a cone of the scene gizmo',
    blendon: 'One numpad key, the View pie or an Alt + middle-mouse flick',
    keys: ['Num 7'],
  },
  {
    task: 'Switch draw mode, pivot or snapping',
    unity: 'Open a dropdown in the toolbar overlays',
    blendon: 'Hold a key and flick a pie menu',
    keys: ['Z', '~/', '.', '~/', 'Shift', '~+', 'S'],
  },
  {
    task: 'Find a menu command',
    unity: "Right-click and scan the Scene view's menu",
    blendon: 'Right-click and type: the same entries, grouped and searchable',
    keys: ['RMB'],
  },
];
