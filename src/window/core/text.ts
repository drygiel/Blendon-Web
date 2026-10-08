import type { CSSProperties } from 'react';
import { D } from '../../plugin/window-data.ts';
import { unityPx } from './util.ts';

export interface Run {
  t: string;
  s: CSSProperties;
}

const richCache = new Map<string, Run[]>();

/** Unity rich text (<b>, <i>, <size=N>, <color=#hex>) -> styled runs. */
export function rich(text: string): Run[] {
  const hit = richCache.get(text);
  if (hit) return hit;
  const runs: Run[] = [];
  const stack: { n: string; v: string | undefined }[] = [];
  const re = /<(\/?)(b|i|size|color)(?:=([^>]*))?>/g;
  let last = 0;
  const style = (): CSSProperties => {
    const s: CSSProperties = {};
    for (const t of stack) {
      if (t.n === 'b') s.fontWeight = 700;
      else if (t.n === 'i') s.fontStyle = 'italic';
      else if (t.n === 'size') s.fontSize = unityPx(Number(t.v)) + 'px';
      else if (t.n === 'color') s.color = t.v;
    }
    return s;
  };
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) runs.push({ t: text.slice(last, m.index), s: style() });
    if (m[1]) {
      for (let i = stack.length - 1; i >= 0; i--)
        if (stack[i]?.n === m[2]) {
          stack.splice(i, 1);
          break;
        }
    } else stack.push({ n: m[2] ?? '', v: m[3] });
    last = re.lastIndex;
  }
  if (last < text.length) runs.push({ t: text.slice(last), s: style() });
  richCache.set(text, runs);
  return runs;
}

export interface CapToken {
  t: string;
  mouse: boolean;
  /** Mouse glyph icon name. */
  icon: string;
}

const MODS = ['Ctrl', 'Control', 'Cmd', 'Command', 'Shift', 'Alt', 'Option'];

/** Unity binding text -> key cap tokens (KeyCap.Split). */
export function capTokens(binding: string | undefined): CapToken[] {
  const out: string[] = [];
  let rest = binding ?? '';
  for (;;) {
    const m = MODS.find((x) => rest.startsWith(x + '+'));
    if (!m) break;
    out.push(m);
    rest = rest.slice(m.length + 1);
  }
  if (rest) out.push(rest);
  return out.map((t) => {
    const mm = /^Mouse ([0-4])$/.exec(t);
    return mm ? { mouse: true, icon: D.mouseIcons[Number(mm[1])] ?? '', t: '' } : { mouse: false, icon: '', t };
  });
}

/** KeyCap.Measure, joined: the width a binding's caps take. */
export function capsWidth(binding: string | undefined, gap: number): number {
  return capTokens(binding).reduce(
    (w, t, i) => w + (t.mouse ? 11 : Math.min(96, t.t.length * 6.4)) + 12 + (i ? gap : 0),
    0,
  );
}

const KEY_NAMES: Record<string, string> = {
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
  NumpadEnter: 'Num Enter',
  Space: 'Space',
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  ArrowUp: 'Up Arrow',
  ArrowDown: 'Down Arrow',
  ArrowLeft: 'Left Arrow',
  ArrowRight: 'Right Arrow',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

interface ModifierEvent {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  code?: string;
}

/** A browser key or mouse event -> Unity's binding text. */
export function bindingFromEvent(e: ModifierEvent, mouseButton?: number): string | null {
  const mods = (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '');
  if (mouseButton != null) return mods + 'Mouse ' + mouseButton;
  const c = e.code ?? '';
  let k: string | null;
  if (/^Key[A-Z]$/.test(c)) k = c.slice(3);
  else if (/^Digit\d$/.test(c)) k = c.slice(5);
  else if (/^Numpad\d$/.test(c)) k = 'Num ' + c.slice(6);
  else if (/^F\d{1,2}$/.test(c)) k = c;
  else k = KEY_NAMES[c] ?? null;
  return k ? mods + k : null;
}
