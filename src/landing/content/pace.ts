// The Your Pace section: who keeps a contested key on each keyboard preset, and the feature presets.
import type { KeyTokens } from '../ui/KeyCap.tsx';

export interface ContestedKey {
  /** Blendon's command in the plugin's contested-key data. */
  id: string;
  keys: KeyTokens;
  blendon: string;
  unity: string;
  /** Where Unity's command goes on the Blendon preset, or a note when Blendon's own takes over. */
  unityTo: KeyTokens | string;
  /** Where Blendon's command goes on the Unity preset. */
  blendonTo: KeyTokens;
}

export const CONTESTED_KEYS: ContestedKey[] = [
  {
    id: 'Blendon/Orbit Selected',
    keys: ['MMB', '~drag'],
    blendon: 'Orbit Selected',
    unity: 'Pan',
    unityTo: ['Shift', '~+', 'MMB'],
    blendonTo: ['Ctrl', '~+', 'MMB'],
  },
  {
    id: 'Blendon/Grab',
    keys: ['G'],
    blendon: 'Grab',
    unity: 'Cycle Tool Modes',
    unityTo: ['Shift', '~+', 'G'],
    blendonTo: ['Shift', '~+', 'G'],
  },
  {
    id: 'Blendon/Grab Rotate',
    keys: ['R'],
    blendon: 'Grab Rotate',
    unity: 'Scale tool',
    unityTo: ['Shift', '~+', 'R'],
    blendonTo: ['Shift', '~+', 'R'],
  },
  {
    id: 'Blendon/Grab Scale',
    keys: ['S'],
    blendon: 'Grab Scale',
    unity: 'Show Tool Settings',
    unityTo: ['Alt', '~+', 'S'],
    blendonTo: ['Alt', '~+', 'S'],
  },
  {
    id: 'Blendon/Pie Menus/Shading',
    keys: ['Z'],
    blendon: 'Draw Mode pie',
    unity: 'Toggle Pivot Position',
    unityTo: ['Alt', '~+', 'Z'],
    blendonTo: ['Alt', '~+', 'Z'],
  },
  {
    id: 'Blendon/Vertex Snap',
    keys: ['V'],
    blendon: "Blendon's vertex snap",
    unity: "Unity's vertex snap",
    unityTo: "Switched off: Blendon's is the same mode, without its limits",
    blendonTo: ['Alt', '~+', 'V'],
  },
];

export const FEATURE_PRESETS: [string, string][] = [
  ['Full', 'Everything on, every value back to the shipped defaults. Your own pie menus are kept.'],
  [
    'Essentials',
    'Navigation and the transform gizmos, with their grab and vertex-snap keys. Pies, numpad views, the context menu and scene tools stay off, and Unity keeps their keys.',
  ],
  [
    'Tools Only',
    'Just the Move, Rotate, Scale and Transform gizmos, with their grab and vertex-snap keys. Everything else stays off, and Unity keeps every other key.',
  ],
];
