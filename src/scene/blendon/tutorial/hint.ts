// Tutorial hints with their key tokens filled in, as TutorialTask.Hint does with TipText.Resolve: a rebind or the
// other keyboard preset reads right at once.
import { sharedTips } from '../../../bridge/keymap.ts';
import { KEY_END, KEY_OPEN, NO_KEY } from '../../../plugin/keys.ts';

/** Unity rich text, keys bold in the cards' key colour, from the page's one keymap and the window's settings. */
export function resolveHint(text: string): string {
  return sharedTips().resolve(text);
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
