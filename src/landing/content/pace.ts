// The Your Pace section: who keeps a contested key on each keyboard preset, and the feature presets.
import type { KeyTokens } from '../ui/KeyCap.tsx';

export interface ContestedKey {
  /** Blendon's command in the plugin's contested-key data. */
  id: string;
  keys: KeyTokens;
  blendon: string;
  unity: string;
  /** Where one click moves Unity's command on the Blendon preset, or a note when Blendon's own takes over. */
  unityTo: KeyTokens | string;
  /** Where Blendon's command goes on the Unity preset, or a note when it has no key or keeps its own. */
  blendonTo: KeyTokens | string;
}

export const CONTESTED_KEYS: ContestedKey[] = [
  {
    id: 'Blendon/Orbit Selected',
    keys: ['Mouse 2', '~drag'],
    blendon: 'Orbit Selected',
    unity: 'Pan',
    unityTo: "Replaced: Blendon's pan does the same on Shift+Mouse 2",
    blendonTo: ['Ctrl', '~+', 'Mouse 2'],
  },
  {
    id: 'Blendon/Move/Grab',
    keys: ['G'],
    blendon: 'Grab',
    unity: 'Cycle Tool Modes',
    unityTo: ['Shift', '~+', 'G'],
    blendonTo: ['Shift', '~+', 'G'],
  },
  {
    id: 'Blendon/Rotate/Grab',
    keys: ['R'],
    blendon: 'Rotate Grab',
    unity: 'Scale tool',
    unityTo: ['Shift', '~+', 'R'],
    blendonTo: ['Shift', '~+', 'R'],
  },
  {
    id: 'Blendon/Scale/Grab',
    keys: ['S'],
    blendon: 'Scale Grab',
    unity: 'Show Tool Settings',
    unityTo: ['Alt', '~+', 'S'],
    blendonTo: "Scale Grab has no key there, Alt+S is ProBuilder's",
  },
  {
    id: 'Blendon/Pie Menus/Draw Mode',
    keys: ['Z'],
    blendon: 'Draw Mode pie',
    unity: 'Toggle Pivot Position',
    unityTo: ['Alt', '~+', 'Z'],
    blendonTo: ['Alt', '~+', 'Z'],
  },
  {
    id: 'Blendon/Pie Menus/Tools',
    keys: ['Q'],
    blendon: 'Tools pie',
    unity: 'View tool',
    unityTo: ['Alt', '~+', 'Q'],
    blendonTo: ['Alt', '~+', 'Q'],
  },
  {
    id: 'Blendon/Pie Menus/View',
    keys: ['`'],
    blendon: 'View pie',
    unity: 'Overlay menu',
    unityTo: ['Ctrl', '~+', '`'],
    blendonTo: ['Ctrl', '~+', '`'],
  },
  {
    id: 'Blendon/All Tools/Vertex Snap',
    keys: ['V'],
    blendon: "Blendon's vertex snap",
    unity: "Unity's vertex snap",
    unityTo: "Replaced: Blendon's is the same mode, without its limits",
    blendonTo: "Blendon's still answers V in its own tool context",
  },
  {
    id: 'Blendon/Context Menu',
    keys: ['Mouse 1'],
    blendon: 'Context menu',
    unity: "Unity's Scene view menu",
    unityTo: "Still there on Shift+Mouse 1, and as the menu's Classic row",
    blendonTo: ['Alt', '~+', 'Mouse 1'],
  },
];

export const FEATURE_PRESETS: [string, string][] = [
  ['Full', 'Every feature on. Your tuning, your keys and your shortcut profile are kept.'],
  [
    'Essentials',
    'Navigation and the transform gizmos, with their grab and vertex-snap keys. Pies, numpad views, the context menu and scene tools stay off, and Unity keeps their keys.',
  ],
  [
    'Tools Only',
    'Just the Move, Rotate, Scale and Transform gizmos, with their grab and vertex-snap keys. Everything else stays off, and Unity keeps every other key.',
  ],
];
