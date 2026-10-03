// IMGUI's event model: one Event per pass, a Layout pass before every event, control ids handed out
// in call order, and hotControl owning a drag - the contract every Scene view handle is written against.
import { Vector2 } from './math.ts';

export const EventType = {
  MouseDown: 0,
  MouseUp: 1,
  MouseMove: 2,
  MouseDrag: 3,
  KeyDown: 4,
  KeyUp: 5,
  ScrollWheel: 6,
  Repaint: 7,
  Layout: 8,
  ValidateCommand: 13,
  ExecuteCommand: 14,
  MouseLeaveWindow: 15,
  MouseEnterWindow: 16,
  Used: 17,
  Ignore: 18,
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const EventModifiers = {
  None: 0,
  Shift: 1,
  Control: 2,
  Alt: 4,
  Command: 8,
  Numeric: 16,
  CapsLock: 32,
  FunctionKey: 64,
} as const;

export const KeyCode = {
  None: 0,
  Backspace: 8,
  Tab: 9,
  Return: 13,
  Escape: 27,
  Space: 32,
  Quote: 39,
  Comma: 44,
  Minus: 45,
  Period: 46,
  Slash: 47,
  Alpha0: 48,
  Alpha1: 49,
  Alpha2: 50,
  Alpha3: 51,
  Alpha4: 52,
  Alpha5: 53,
  Alpha6: 54,
  Alpha7: 55,
  Alpha8: 56,
  Alpha9: 57,
  Semicolon: 59,
  Equals: 61,
  LeftBracket: 91,
  Backslash: 92,
  RightBracket: 93,
  BackQuote: 96,
  A: 97,
  B: 98,
  C: 99,
  D: 100,
  E: 101,
  F: 102,
  G: 103,
  H: 104,
  I: 105,
  J: 106,
  K: 107,
  L: 108,
  M: 109,
  N: 110,
  O: 111,
  P: 112,
  Q: 113,
  R: 114,
  S: 115,
  T: 116,
  U: 117,
  V: 118,
  W: 119,
  X: 120,
  Y: 121,
  Z: 122,
  Delete: 127,
  Keypad0: 256,
  Keypad1: 257,
  Keypad2: 258,
  Keypad3: 259,
  Keypad4: 260,
  Keypad5: 261,
  Keypad6: 262,
  Keypad7: 263,
  Keypad8: 264,
  Keypad9: 265,
  KeypadPeriod: 266,
  KeypadDivide: 267,
  KeypadMultiply: 268,
  KeypadMinus: 269,
  KeypadPlus: 270,
  KeypadEnter: 271,
  KeypadEquals: 272,
  UpArrow: 273,
  DownArrow: 274,
  RightArrow: 275,
  LeftArrow: 276,
  Insert: 277,
  Home: 278,
  End: 279,
  PageUp: 280,
  PageDown: 281,
  F1: 282,
  F2: 283,
  F3: 284,
  F4: 285,
  F5: 286,
  F6: 287,
  F7: 288,
  F8: 289,
  F9: 290,
  F10: 291,
  F11: 292,
  F12: 293,
  Numlock: 300,
  CapsLock: 301,
  RightShift: 303,
  LeftShift: 304,
  RightControl: 305,
  LeftControl: 306,
  RightAlt: 307,
  LeftAlt: 308,
  RightCommand: 309,
  LeftCommand: 310,
  Mouse0: 323,
  Mouse1: 324,
  Mouse2: 325,
  Mouse3: 326,
  Mouse4: 327,
  Mouse5: 328,
  Mouse6: 329,
} as const;
export type KeyCode = number;

const CODE_MAP: Record<string, number> = {
  Backspace: KeyCode.Backspace,
  Tab: KeyCode.Tab,
  Enter: KeyCode.Return,
  Escape: KeyCode.Escape,
  Space: KeyCode.Space,
  Quote: KeyCode.Quote,
  Comma: KeyCode.Comma,
  Minus: KeyCode.Minus,
  Period: KeyCode.Period,
  Slash: KeyCode.Slash,
  Semicolon: KeyCode.Semicolon,
  Equal: KeyCode.Equals,
  BracketLeft: KeyCode.LeftBracket,
  Backslash: KeyCode.Backslash,
  BracketRight: KeyCode.RightBracket,
  Backquote: KeyCode.BackQuote,
  Delete: KeyCode.Delete,
  NumpadDecimal: KeyCode.KeypadPeriod,
  NumpadDivide: KeyCode.KeypadDivide,
  NumpadMultiply: KeyCode.KeypadMultiply,
  NumpadSubtract: KeyCode.KeypadMinus,
  NumpadAdd: KeyCode.KeypadPlus,
  NumpadEnter: KeyCode.KeypadEnter,
  NumpadEqual: KeyCode.KeypadEquals,
  ArrowUp: KeyCode.UpArrow,
  ArrowDown: KeyCode.DownArrow,
  ArrowRight: KeyCode.RightArrow,
  ArrowLeft: KeyCode.LeftArrow,
  Insert: KeyCode.Insert,
  Home: KeyCode.Home,
  End: KeyCode.End,
  PageUp: KeyCode.PageUp,
  PageDown: KeyCode.PageDown,
  NumLock: KeyCode.Numlock,
  CapsLock: KeyCode.CapsLock,
  ShiftLeft: KeyCode.LeftShift,
  ShiftRight: KeyCode.RightShift,
  ControlLeft: KeyCode.LeftControl,
  ControlRight: KeyCode.RightControl,
  AltLeft: KeyCode.LeftAlt,
  AltRight: KeyCode.RightAlt,
  MetaLeft: KeyCode.LeftCommand,
  MetaRight: KeyCode.RightCommand,
};

/**
 * Unity resolves letters through the keyboard layout (the key printing "A" is KeyCode.A on AZERTY too)
 * but digits and punctuation by position.
 */
export function keyCodeFromDom(code: string, key: string): number {
  if (key.length === 1) {
    const c = key.toLowerCase().charCodeAt(0);
    if (c >= 97 && c <= 122 && /^Key[A-Z]$/.test(code)) return c;
  }
  if (/^Key[A-Z]$/.test(code)) return code.toLowerCase().charCodeAt(3);
  if (/^Digit\d$/.test(code)) return KeyCode.Alpha0 + +code[5];
  if (/^Numpad\d$/.test(code)) return KeyCode.Keypad0 + +code[6];
  if (/^F([1-9]|1[0-2])$/.test(code)) return KeyCode.F1 + +code.slice(1) - 1;
  return CODE_MAP[code] ?? KeyCode.None;
}

export function keyCodeName(k: number): string {
  for (const [n, v] of Object.entries(KeyCode)) if (v === k) return n;
  return String(k);
}

export class Event {
  static current: Event = new Event(EventType.Repaint);

  type: EventType;
  readonly rawType: EventType;
  button = 0;
  mousePosition = Vector2.zero;
  delta = Vector2.zero;
  modifiers = 0;
  keyCode: number = KeyCode.None;
  character = '';
  clickCount = 0;
  commandName = '';
  /** Unity sends key repeats as KeyDown too; kept for features that ignore autorepeat. */
  isRepeat = false;

  constructor(type: EventType) {
    this.type = type;
    this.rawType = type;
  }

  get shift() {
    return (this.modifiers & EventModifiers.Shift) !== 0;
  }
  set shift(v: boolean) {
    this.flag(EventModifiers.Shift, v);
  }
  get control() {
    return (this.modifiers & EventModifiers.Control) !== 0;
  }
  set control(v: boolean) {
    this.flag(EventModifiers.Control, v);
  }
  get alt() {
    return (this.modifiers & EventModifiers.Alt) !== 0;
  }
  set alt(v: boolean) {
    this.flag(EventModifiers.Alt, v);
  }
  get command() {
    return (this.modifiers & EventModifiers.Command) !== 0;
  }
  private flag(bit: number, on: boolean) {
    this.modifiers = on ? this.modifiers | bit : this.modifiers & ~bit;
  }
  /** Control on Windows/Linux, Command on macOS. */
  get actionKey() {
    return IS_MAC ? this.command : this.control;
  }
  get isMouse() {
    const t = this.type;
    return (
      t === EventType.MouseDown || t === EventType.MouseUp || t === EventType.MouseMove || t === EventType.MouseDrag
    );
  }
  get isKey() {
    return this.type === EventType.KeyDown || this.type === EventType.KeyUp;
  }
  get isScrollWheel() {
    return this.type === EventType.ScrollWheel;
  }

  use() {
    if (this.type === EventType.Repaint || this.type === EventType.Layout) return;
    this.type = EventType.Used;
  }

  /** Copy for a second pass (Layout before the event, and the event itself). */
  clone(type: EventType = this.rawType) {
    const e = new Event(type);
    e.button = this.button;
    e.mousePosition = this.mousePosition;
    e.delta = this.delta;
    e.modifiers = this.modifiers;
    e.keyCode = this.keyCode;
    e.character = this.character;
    e.clickCount = this.clickCount;
    e.commandName = this.commandName;
    e.isRepeat = this.isRepeat;
    return e;
  }
}

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export const FocusType = { Passive: 0, Keyboard: 1 } as const;

export const MouseButton = { LeftMouse: 0, RightMouse: 1, MiddleMouse: 2 } as const;

/** Control ids are handed out in call order, restarting every pass - stable while the draw order is. */
export const GUIUtility = {
  hotControl: 0,
  keyboardControl: 0,
  nextId: 1,
  stateObjects: new Map<string, unknown>(),

  beginPass() {
    GUIUtility.nextId = 1;
  },

  getControlID(_focus?: number) {
    return GUIUtility.nextId++;
  },

  getStateObject<T>(key: string, make: () => T): T {
    let v = GUIUtility.stateObjects.get(key) as T | undefined;
    if (v === undefined) GUIUtility.stateObjects.set(key, (v = make()));
    return v;
  },
};
