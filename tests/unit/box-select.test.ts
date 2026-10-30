import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BoxSelectMode, BoxSelectResolver } from '../../src/scene/blendon/scenetools/box-select.ts';
import { Prefs, Selection } from '../../src/scene/unity/editor.ts';
import { Rect, Vector3 } from '../../src/scene/unity/math.ts';
import { primitiveMesh } from '../../src/scene/unity/primitives.ts';
import { RectPicker } from '../../src/scene/unity/raycast.ts';
import { GameObject, Scene } from '../../src/scene/unity/scene.ts';

const scene = new Scene();
const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((n) => new GameObject(scene, n));
const names = (list: GameObject[]) => list.map((o) => o.name);

describe('box select plan', () => {
  it('replaces with the hits, nearest first, and lists what drops out', () => {
    const change = BoxSelectResolver.plan([a, b], a, [c, b], BoxSelectMode.Replace);
    expect(names(change.next)).toEqual(['C', 'B']);
    expect(names(change.added)).toEqual(['C']);
    expect(names(change.removed)).toEqual(['A']);
  });

  it('keeps the active object first while it survives', () => {
    const change = BoxSelectResolver.plan([a, b], b, [c], BoxSelectMode.Add);
    expect(names(change.next)).toEqual(['B', 'A', 'C']);
  });

  it('subtracts only what was selected and is under the box, marking it for deselection', () => {
    const change = BoxSelectResolver.plan([a, b, c], a, [b, d], BoxSelectMode.Subtract);
    expect(names(change.next)).toEqual(['A', 'C']);
    expect(names(BoxSelectResolver.marked(BoxSelectMode.Subtract, [b, d], change).deselects)).toEqual(['B']);
  });

  it('flips each hit in Difference and keeps the overlap in Intersect', () => {
    const diff = BoxSelectResolver.plan([a, b], a, [b, c], BoxSelectMode.Difference);
    expect(names(diff.next)).toEqual(['A', 'C']);
    const inter = BoxSelectResolver.plan([a, b], a, [b, c], BoxSelectMode.Intersect);
    expect(names(inter.next)).toEqual(['B']);
  });

  it('reads out the count and the changed names', () => {
    const change = BoxSelectResolver.plan([a], a, [b, c], BoxSelectMode.Add);
    expect(BoxSelectResolver.readout(BoxSelectMode.Add, [b, c], change, true, true)).toEqual([
      '3 selected (+2)',
      '+ B',
      '+ C',
    ]);
  });
});

describe('rect picker', () => {
  // Orthographic straight down the z axis: world x, y map to screen x, y one to one.
  const project = (p: Vector3) => new Vector3(p.x * 10, p.y * 10, 1);
  const cube = new GameObject(scene, 'Cube');
  cube.mesh = primitiveMesh('Cube');
  cube.transform.localPosition = new Vector3(5, 5, 0);

  it('touches a mesh the rect only partly covers, and needs all of it when enclosing', () => {
    const picker = new RectPicker([cube], project);
    expect(names(picker.pick(Rect.minMax(52, 52, 80, 80)))).toEqual(['Cube']);
    expect(picker.pick(Rect.minMax(52, 52, 80, 80), true)).toEqual([]);
    expect(names(picker.pick(Rect.minMax(40, 40, 60, 60), true))).toEqual(['Cube']);
    expect(picker.pick(Rect.minMax(60, 60, 80, 80))).toEqual([]);
  });
});

describe('box select outlines', () => {
  const s = new Scene();
  const mesh = (name: string, parent: GameObject | null = null) => {
    const go = new GameObject(s, name, parent?.transform ?? null);
    go.mesh = primitiveMesh('Cube');
    return go;
  };
  const plane = mesh('Plane');
  const cube = mesh('Cube');
  const group = new GameObject(s, 'Group');
  mesh('Left', group);
  mesh('Right', group);
  const light = new GameObject(s, 'Light');
  const groupNames = (groups: GameObject[][] | null) => groups?.map(names) ?? null;

  beforeEach(() => {
    Prefs.local.clear();
    Selection.set([], null, false);
  });
  afterEach(() => {
    Prefs.local.clear();
    Selection.set([], null, false);
    cube.activeSelf = true;
  });

  it('outlines every marked object on its own by default, its children sharing its outline', () => {
    const sets = BoxSelectResolver.highlightSets([plane, group, light], [cube])!;
    expect(sets.separate).toBe(true);
    expect(groupNames(sets.selectGroups)).toEqual([['Plane'], ['Left', 'Right']]);
    expect(groupNames(sets.deselectGroups)).toEqual([['Cube']]);
    expect(names(sets.markers)).toEqual(['Light']);
  });

  it('merges them into one shape with Separate Outlines off', () => {
    Prefs.set('BoxSelectSettings.HighlightSeparateOutlines', false);
    expect(BoxSelectResolver.highlightSets([plane, cube], [])!.separate).toBe(false);
  });

  it('draws no lines between selected objects unless asked', () => {
    Selection.set([plane, cube], plane, false);
    expect(BoxSelectResolver.selectionLines()).toBeNull();
  });

  it('groups the selection for Lines Between Objects, only with two objects that show', () => {
    Prefs.set('BoxSelectSettings.SelectionLinesBetweenObjects', true);
    Selection.set([plane, group, light], plane, false);
    expect(groupNames(BoxSelectResolver.selectionLines())).toEqual([['Plane'], ['Left', 'Right']]);
    Selection.set([plane, light], plane, false);
    expect(BoxSelectResolver.selectionLines()).toBeNull();
    cube.activeSelf = false;
    Selection.set([plane, cube], plane, false);
    expect(BoxSelectResolver.selectionLines()).toBeNull();
  });

  it('draws no lines with Box Select off', () => {
    Prefs.set('BoxSelectSettings.SelectionLinesBetweenObjects', true);
    Prefs.set('BoxSelectSettings.Enabled', false);
    Selection.set([plane, cube], plane, false);
    expect(BoxSelectResolver.selectionLines()).toBeNull();
  });
});
