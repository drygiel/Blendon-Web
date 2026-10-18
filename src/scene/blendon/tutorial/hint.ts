// Tutorial hints with their key tokens filled in, as TutorialTask.Hint does with TipText.Resolve: a rebind or the
// other keyboard preset reads right at once.
import { SharedSettings } from '../../../bridge/settings.ts';
import {
  fillTokens,
  KEY_END,
  KEY_OPEN,
  NO_KEY,
  presetKey,
  presetSource,
  type TokenSource,
} from '../../../plugin/keys.ts';
import type { KeyboardPreset } from '../../../plugin/schema.ts';
import { D } from '../../../plugin/window-data.ts';

/** The preset the settings window is on, Blendon's until it has loaded. */
export function keyPreset(): KeyboardPreset {
  return SharedSettings.reader?.kbSide() === 'Unity' ? 'Unity' : 'Blendon';
}

/**
 * The keys hint tokens read: the dump's keymap for the window's preset, with the window's own bindings and values
 * over it once it has loaded. The one place to point at the bridge's live keymap when it has one.
 */
export function hintKeys(): TokenSource {
  const preset = presetSource(D, keyPreset());
  const reader = SharedSettings.reader;
  if (!reader) return preset;
  return {
    ...preset,
    // A gate leaves the binding alone, so a switched-off feature's hint still names its key, as in the Editor.
    binding: (id) => (D.shortcuts[id] ? reader.shortcut(id) : presetKey(D.keymap[id], keyPreset())),
    setting: (path) => {
      const s = preset.setting(path);
      return s && { ...s, v: reader.val(path) ?? s.v };
    },
  };
}

/** Unity rich text, keys bold in the cards' key colour. */
export function resolveHint(text: string): string {
  return text.includes('{') ? fillTokens(text, hintKeys()).text : text;
}

export interface HintRun {
  t: string;
  /** A key, drawn like a card's key. */
  key?: boolean;
  /** The dim "no key" of an unbound shortcut. */
  none?: boolean;
}

const NO_KEY_TEXT = NO_KEY.replace(/<[^>]*>/g, '');

/** A resolved hint split into plain text, keys and "no key", for a page that draws it with markup. */
export function hintRuns(rich: string): HintRun[] {
  const runs: HintRun[] = [];
  let at = 0;
  while (at < rich.length) {
    const key = rich.indexOf(KEY_OPEN, at);
    const none = rich.indexOf(NO_KEY, at);
    const next = key < 0 ? none : none < 0 ? key : Math.min(key, none);
    if (next < 0) break;
    if (next > at) runs.push({ t: rich.slice(at, next) });
    if (next === none) {
      runs.push({ t: NO_KEY_TEXT, none: true });
      at = none + NO_KEY.length;
      continue;
    }
    const end = rich.indexOf(KEY_END, key + KEY_OPEN.length);
    if (end < 0) break;
    runs.push({ t: rich.slice(key + KEY_OPEN.length, end), key: true });
    at = end + KEY_END.length;
  }
  if (at < rich.length) runs.push({ t: rich.slice(at) });
  return runs;
}
