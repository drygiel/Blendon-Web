// The Shortcuts section's sheet of keys, under each keyboard preset.
import type { KeyTokens } from '../ui/KeyCap.tsx';

/** An action, its keys on the Blendon preset, and on the Unity preset where they differ. */
export type ShortcutRow = [action: string, blendon: KeyTokens, unity?: KeyTokens];

export const SHORTCUTS: ShortcutRow[] = [
  ['Orbit', ['MMB'], ['Ctrl', '~+', 'MMB']],
  ['Quick Roll', ['Alt', '~+', 'MMB', '~flick'], ['Ctrl', '~+', 'Shift', '~+', 'MMB', '~flick']],
  ['Pan', ['Shift', '~+', 'MMB'], ['Alt', '~+', 'MMB']],
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
  ['Grab / Rotate / Scale', ['G', 'R', 'S'], ['Shift', '~+', 'G', '~/', 'Shift', '~+', 'R', '~/', 'Alt', '~+', 'S']],
  ['Vertex snap', ['~hold', 'V'], ['~hold', 'Alt', '~+', 'V']],
  ['Virtual pivot', ['Shift', '~+', 'V'], ['Alt', '~+', 'Shift', '~+', 'V']],
  ['Move / Rotate / Transform tool', ['W', 'E', 'Y']],
  ['Scale tool', ['Shift', '~+', 'R'], ['R']],
  ['Frame Selected / Isolate View', ['Num .', '~/', 'Num /']],
  ['Snap to Floor', ['End']],
  ['Select parent / children', ['[', ']']],
  ['Draw Mode pie / Wireframe', ['Z', '~/', 'Shift', '~+', 'Z'], ['Alt', '~+', 'Z', '~/', 'Shift', '~+', 'Z']],
  ['Add Object / Snapping pie', ['Shift', '~+', 'A', '~/', 'Shift', '~+', 'S']],
  ['Orientation / Pivot Point pie', [',', '~/', '.']],
  ['Reset / View / Tools pie', ['/', '`', 'Q'], ['/', '~/', 'Ctrl', '~+', '`', '~/', 'Alt', '~+', 'Q']],
  ['Context menu', ['RMB'], ['Alt', '~+', 'RMB']],
];
