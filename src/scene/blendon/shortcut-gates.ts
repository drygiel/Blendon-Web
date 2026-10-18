// ShortcutGates: a Blendon key answers in the Scene view only while its feature is switched on. Shut, the key
// is the Editor's command again, which kept it all along. Nothing is written to the keys either way.
import { type GateReader, Keymap, sharedSettings, switchedOn } from '../../bridge/keymap.ts';
import { Prefs } from '../unity/editor.ts';

// Through Prefs, so a value the Scene view set itself counts too.
const reader: GateReader = {
  val: (key) => (Prefs.local.has(key) ? Prefs.local.get(key) : sharedSettings.val(key)),
  pieOn: (pie) => sharedSettings.pieOn(pie),
};

export const ShortcutGates = {
  reader,

  /** What the owner's switches say, whatever the tool context. */
  isSwitchedOn: (id: string) => switchedOn(id, reader),

  /** Shut outside Blendon's tool context: always for some keys, others only while they cover a command. */
  needsContext: (id: string) => Keymap.needsContext(id, reader),

  /** Set by the tool contexts: whether Blendon's own is active. Without them it always is. */
  inBlendonContext: () => true,

  /** Heard now. The Editor's own ids (Undo, Box Select's modifiers) have no gate. */
  isOpen(id: string): boolean {
    if (!id.startsWith('Blendon/')) return true;
    return ShortcutGates.isSwitchedOn(id) && (ShortcutGates.inBlendonContext() || !ShortcutGates.needsContext(id));
  },
};
