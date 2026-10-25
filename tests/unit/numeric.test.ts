import { describe, expect, it } from 'vitest';
import { GizmoAxis } from '../../src/scene/blendon/gizmos/axis.ts';
import { ModalNumericParser, ModalNumericState } from '../../src/scene/blendon/gizmos/core/numeric.ts';
import { Event, EventType, KeyCode } from '../../src/scene/unity/imgui.ts';

const begin = () => {
  const parser = new ModalNumericParser();
  parser.defaultSpaceIsLocal = () => false;
  parser.beginMouseTransform(GizmoAxis.X);
  return parser;
};

const key = (code: number) => {
  const ev = new Event(EventType.KeyDown);
  ev.keyCode = code;
  return ev;
};

const type = (parser: ModalNumericParser, ...codes: number[]) => {
  for (const code of codes) parser.processEvent(key(code));
};

const typed = (...codes: number[]) => {
  const parser = begin();
  type(parser, ...codes);
  const text = parser.getAxisDisplayText(GizmoAxis.X);
  parser.reset();
  return text;
};

const { Alpha0, Alpha1, Alpha2, Alpha5, Alpha9, Period } = KeyCode;
const repeat = (code: number, n: number) => Array<number>(n).fill(code);

describe('modal numeric input limits', () => {
  it('ignores a second decimal point', () => {
    expect(typed(Alpha1, Period, Alpha2, Period, Alpha5)).toBe('1.25');
  });

  it('gives a point typed first its leading zero', () => {
    const parser = begin();
    type(parser, Period, Alpha5);
    expect(parser.state).toBe(ModalNumericState.NumericInput);
    expect(parser.getAxisDisplayText(GizmoAxis.X)).toBe('0.5');
    parser.reset();
  });

  it('keeps only one leading zero and replaces it with the next digit', () => {
    expect(typed(Alpha0, Alpha0, KeyCode.Keypad0)).toBe('0');
    expect(typed(Alpha0, Alpha0, Alpha0, Alpha1)).toBe('1');
  });

  it('keeps zeros after the point', () => {
    expect(typed(Alpha0, Period, Alpha0, Alpha0, Alpha5)).toBe('0.005');
  });

  it('limits each side of the point on its own', () => {
    expect(typed(...repeat(Alpha9, 20))).toBe('99999999');
    expect(typed(...repeat(Alpha9, 7), Period, Alpha5)).toBe('9999999.5');
    expect(typed(...repeat(Alpha9, 10), Period, ...repeat(Alpha9, 10))).toBe('99999999.99999999');
  });

  it('counts zeros after the point toward the fraction limit', () => {
    expect(typed(Period, ...repeat(Alpha0, 20))).toBe('0.00000000');
  });

  it('still consumes a rejected key and toggles sign and reciprocal on a full buffer', () => {
    const parser = begin();
    type(parser, ...repeat(Alpha2, 8));
    expect(parser.processEvent(key(Alpha2))).toBe(true);
    type(parser, KeyCode.Minus, KeyCode.Slash);
    expect(parser.getAxisDisplayText(GizmoAxis.X)).toBe('-1/22222222');
    parser.reset();
  });

  it('frees room under the limit after a backspace', () => {
    expect(typed(...repeat(Alpha1, 8), KeyCode.Backspace, Alpha2)).toBe('11111112');
  });
});

describe('modal numeric hand-back', () => {
  it('hands the drag back to the mouse with the Backspace that leaves nothing typed', () => {
    const parser = begin();
    let handedBack = 0;
    parser.onRevertToMouseTransform = () => handedBack++;
    type(parser, Alpha1, Alpha2);
    expect(parser.state).toBe(ModalNumericState.NumericInput);
    type(parser, KeyCode.Backspace);
    expect(parser.state).toBe(ModalNumericState.NumericInput);
    expect(handedBack).toBe(0);
    type(parser, KeyCode.Backspace);
    expect(parser.state).toBe(ModalNumericState.MouseTransforming);
    expect(handedBack).toBe(1);
    // Nothing typed is left, so a further press has nothing to hand back.
    type(parser, KeyCode.Backspace);
    expect(handedBack).toBe(1);
    parser.reset();
  });

  it('takes the reciprocal and the sign before handing back', () => {
    const parser = begin();
    let handedBack = 0;
    parser.onRevertToMouseTransform = () => handedBack++;
    type(parser, KeyCode.Minus, KeyCode.Slash, Alpha2);
    type(parser, KeyCode.Backspace, KeyCode.Backspace);
    expect(parser.getAxisDisplayText(GizmoAxis.X)).toBe('-0');
    expect(handedBack).toBe(0);
    type(parser, KeyCode.Backspace);
    expect(handedBack).toBe(1);
    expect(parser.state).toBe(ModalNumericState.MouseTransforming);
    parser.reset();
  });

  it("puts a plane handle's typed value on both of its axes", () => {
    const parser = new ModalNumericParser();
    parser.beginPlaneTransform(GizmoAxis.Y);
    type(parser, Alpha2);
    const v = parser.currentParsedVector3;
    expect([v.x, v.y, v.z]).toEqual([2, 0, 2]);
    parser.reset();
    parser.beginPlaneTransform(GizmoAxis.X);
    type(parser, Alpha5);
    const w = parser.currentParsedVector3;
    expect([w.x, w.y, w.z]).toEqual([0, 5, 5]);
    parser.reset();
  });
});
