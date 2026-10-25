import { describe, expect, it } from 'vitest';
import { ClickMode, ClickSelection } from '../../src/scene/blendon/gizmos/core/click-selection.ts';
import { VertexGrab } from '../../src/scene/blendon/gizmos/handles/vertex-grab.ts';
import { Event, EventType, EventModifiers } from '../../src/scene/unity/imgui.ts';
import { Quaternion, Vector3 } from '../../src/scene/unity/math.ts';
import { GameObject, Scene } from '../../src/scene/unity/scene.ts';

const scene = new Scene();
const [a, b, c] = ['A', 'B', 'C'].map((n) => new GameObject(scene, n));
const group = new GameObject(scene, 'Group');
const part = new GameObject(scene, 'Part', group.transform);
const names = (list: GameObject[] | null) => list?.map((o) => o.name) ?? null;
const plan = (mode: ClickMode, selection: GameObject[], active: GameObject | null, picked: GameObject | null) =>
  names(ClickSelection.plan(mode, selection, active, picked, picked));

describe('click-select on a handle', () => {
  it('replaces the selection, and a click on the active object keeps a multi-selection', () => {
    expect(plan(ClickMode.Replace, [a, b], a, c)).toEqual(['C']);
    expect(plan(ClickMode.Replace, [a, b], a, a)).toBeNull();
    expect(plan(ClickMode.Replace, [a], a, null)).toBeNull();
  });

  it('adds with Shift, the clicked one leading, and takes the active one out', () => {
    expect(plan(ClickMode.Add, [a, b], a, c)).toEqual(['C', 'A', 'B']);
    expect(plan(ClickMode.Add, [a, b], a, a)).toEqual(['B']);
    // Already selected and not active: it only becomes active.
    expect(plan(ClickMode.Add, [a, b], a, b)).toEqual(['B', 'A']);
  });

  it('toggles with Ctrl, also a selected parent of the clicked part', () => {
    expect(plan(ClickMode.Toggle, [a, b], a, b)).toEqual(['A']);
    expect(plan(ClickMode.Toggle, [a], a, c)).toEqual(['C', 'A']);
    expect(plan(ClickMode.Toggle, [group, a], a, part)).toEqual(['A']);
    expect(plan(ClickMode.Toggle, [a], a, null)).toBeNull();
  });

  it('stops climbing at a marked object', () => {
    const marked = (go: GameObject) => go === part;
    expect(names(ClickSelection.plan(ClickMode.Toggle, [group, a], a, part, part, marked))).toEqual([
      'Part',
      'Group',
      'A',
    ]);
  });

  it('reads Shift and the action key, and Shift with it is no click', () => {
    const ev = (mods: number) => {
      const e = new Event(EventType.MouseUp);
      e.modifiers = mods;
      return e;
    };
    expect(ClickSelection.modeOf(ev(0))).toBe(ClickMode.Replace);
    expect(ClickSelection.modeOf(ev(EventModifiers.Shift))).toBe(ClickMode.Add);
    const action = navigator.platform.startsWith('Mac') ? EventModifiers.Command : EventModifiers.Control;
    expect(ClickSelection.modeOf(ev(action))).toBe(ClickMode.Toggle);
    expect(ClickSelection.modeOf(ev(action | EventModifiers.Shift))).toBeNull();
  });
});

describe('vertex snap onto a constraint', () => {
  it('lands on the axis point nearest the vertex, on a turned axis too', () => {
    expect(VertexGrab.distanceAlongAxis(new Vector3(2, 1, 0), Vector3.right)).toBeCloseTo(2, 6);
    expect(VertexGrab.distanceAlongAxis(new Vector3(-2, 0, 0), Vector3.right)).toBeCloseTo(-2, 6);
    // A Local X arrow of an object yawed 85 deg runs almost along world -Z.
    const dir = Quaternion.euler(new Vector3(0, 85, 0)).mulV(Vector3.right);
    const gap = new Vector3(-0.2, 0, -2);
    expect(VertexGrab.distanceAlongAxis(gap, dir)).toBeCloseTo(Vector3.dot(gap, dir), 6);
    expect(VertexGrab.distanceAlongAxis(gap, dir)).toBeGreaterThan(1.9);
  });

  it("projects onto the plane in the plane's own directions", () => {
    const [d1, d2] = VertexGrab.distancesAcrossPlane(new Vector3(1, 5, 2), Vector3.right, Vector3.forward);
    expect(d1).toBeCloseTo(1, 6);
    expect(d2).toBeCloseTo(2, 6);
    // Directions that are not orthogonal still give the point the plane reaches.
    const s = new Vector3(1, 0, 1).normalized;
    const [e1, e2] = VertexGrab.distancesAcrossPlane(new Vector3(3, 0, 1), Vector3.right, s);
    const reached = Vector3.right.mul(e1).add(s.mul(e2));
    expect(reached.x).toBeCloseTo(3, 5);
    expect(reached.z).toBeCloseTo(1, 5);
    // Parallel directions fall back to two projections.
    expect(VertexGrab.distancesAcrossPlane(new Vector3(2, 0, 0), Vector3.right, Vector3.right)).toEqual([2, 2]);
  });
});
