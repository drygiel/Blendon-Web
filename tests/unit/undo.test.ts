import { beforeEach, describe, expect, it } from 'vitest';
import { EditorEdit } from '../../src/scene/blendon/scenetools/scene-menu/editor-menu.ts';
import { Selection, Undo } from '../../src/scene/unity/editor.ts';
import { Vector3 } from '../../src/scene/unity/math.ts';
import { GameObject, Scene, SceneVisibilityManager } from '../../src/scene/unity/scene.ts';

let scene: Scene;
let a: GameObject;
let b: GameObject;
let c: GameObject;

// What the host does before each key or mouse press: the Editor's next undo group.
const press = () => Undo.incrementCurrentGroup();
const hidden = () => [...scene.allObjects()].filter((o) => !o.visible).map((o) => o.name);

beforeEach(() => {
  scene = new Scene();
  Scene.current = scene;
  Undo.init(scene);
  a = new GameObject(scene, 'A');
  b = new GameObject(scene, 'B');
  c = new GameObject(scene, 'C', b.transform);
  Selection.set([a], a, false);
  Undo.clearAll();
});

describe('undo stack and groups', () => {
  it('undoes and redoes a recorded change, and a new record drops the redo', () => {
    press();
    Undo.recordObject(a.transform, 'Move');
    a.transform.position = new Vector3(1, 0, 0);
    Undo.performUndo();
    expect(a.transform.position.equals(Vector3.zero)).toBe(true);
    Undo.performRedo();
    expect(a.transform.position.x).toBe(1);
    Undo.performUndo();
    press();
    Undo.recordObject(b.transform, 'Move');
    expect(Undo.getRecords()).toEqual({ undo: ['Move'], redo: [] });
  });

  it('keeps the first state of a group and folds collapsed groups into one step', () => {
    press();
    const group = Undo.getCurrentGroup();
    Undo.recordObject(a.transform, 'Move');
    a.transform.position = new Vector3(1, 0, 0);
    press();
    Undo.recordObject(a.transform, 'Move');
    a.transform.position = new Vector3(2, 0, 0);
    expect(Undo.getRecords().undo).toEqual(['Move', 'Move']);
    Undo.collapseUndoOperations(group);
    expect(Undo.getRecords().undo).toEqual(['Move']);
    Undo.performUndo();
    expect(a.transform.position.equals(Vector3.zero)).toBe(true);
  });

  it('makes a selection change after an edit its own step once a press opened a new group', () => {
    press();
    Undo.recordObject(a.transform, 'Move');
    a.transform.position = new Vector3(1, 0, 0);
    press();
    Selection.set([b], b);
    expect(Undo.getRecords().undo).toEqual(['Move', 'Selection Change']);
    Undo.performUndo();
    expect(Selection.activeGameObject).toBe(a);
    expect(a.transform.position.x).toBe(1);
  });

  it('puts an unparented child back at its place among its siblings', () => {
    const d = new GameObject(scene, 'D', b.transform);
    press();
    Undo.setTransformParent(c.transform, null, 'Unparent');
    expect(b.transform.children.map((t) => t.name)).toEqual(['D']);
    Undo.performUndo();
    expect(b.transform.children.map((t) => t.name)).toEqual(['C', 'D']);
    expect(d.transform.getSiblingIndex()).toBe(1);
  });

  it('brings a duplicate back below its source on redo', () => {
    press();
    EditorEdit.duplicate();
    expect(scene.roots.map((t) => t.name)).toEqual(['A', 'A (1)', 'B']);
    Undo.performUndo();
    expect(scene.roots.map((t) => t.name)).toEqual(['A', 'B']);
    expect(Selection.activeGameObject).toBe(a);
    Undo.performRedo();
    expect(scene.roots.map((t) => t.name)).toEqual(['A', 'A (1)', 'B']);
    expect(Selection.activeGameObject?.name).toBe('A (1)');
  });
});

describe('scene visibility', () => {
  it('records a hide as one step that undo shows again and redo hides again', () => {
    press();
    SceneVisibilityManager.hide([b], true);
    expect(hidden()).toEqual(['B', 'C']);
    expect(Undo.getRecords().undo).toEqual(['Hide GameObjects']);
    Undo.performUndo();
    expect(hidden()).toEqual([]);
    Undo.performRedo();
    expect(hidden()).toEqual(['B', 'C']);
  });

  it('undoes Hide Others in one step and Show All back to what was hidden', () => {
    press();
    SceneVisibilityManager.hideAll();
    SceneVisibilityManager.show([a], true);
    expect(hidden()).toEqual(['B', 'C']);
    press();
    SceneVisibilityManager.showAll();
    expect(Undo.getRecords().undo).toEqual(['Hide All', 'Show All']);
    Undo.performUndo();
    expect(hidden()).toEqual(['B', 'C']);
    Undo.performUndo();
    expect(hidden()).toEqual([]);
  });

  it('keeps isolation on a layer of its own: hides made inside it are dropped on exit', () => {
    press();
    SceneVisibilityManager.hide([a], false);
    press();
    SceneVisibilityManager.isolate([a], true);
    // Isolating a hidden object shows it until the isolation ends.
    expect(hidden()).toEqual(['B', 'C']);
    press();
    SceneVisibilityManager.show([c], false);
    expect(hidden()).toEqual(['B']);
    press();
    SceneVisibilityManager.exitIsolation();
    expect(SceneVisibilityManager.isCurrentStageIsolated()).toBe(false);
    expect(hidden()).toEqual(['A']);
  });

  it('undoes Isolate and Exit Isolation, the layer included', () => {
    press();
    SceneVisibilityManager.isolate([b], true);
    press();
    SceneVisibilityManager.hide([c], false);
    press();
    SceneVisibilityManager.exitIsolation();
    expect(Undo.getRecords().undo).toEqual(['Isolate GameObjects', 'Hide GameObjects', 'Exit Isolation']);
    Undo.performUndo();
    expect(SceneVisibilityManager.isCurrentStageIsolated()).toBe(true);
    expect(hidden()).toEqual(['A', 'C']);
    Undo.performUndo();
    Undo.performUndo();
    expect(SceneVisibilityManager.isCurrentStageIsolated()).toBe(false);
    expect(hidden()).toEqual([]);
    Undo.performRedo();
    expect(hidden()).toEqual(['A']);
  });

  it("shows everything while the view's visibility toggle is off, isolation included", () => {
    press();
    SceneVisibilityManager.isolate([a], false);
    scene.visibilityEnabled = false;
    expect(hidden()).toEqual([]);
    scene.visibilityEnabled = true;
    expect(hidden()).toEqual(['B', 'C']);
  });

  it('a deleted hidden object comes back hidden', () => {
    press();
    SceneVisibilityManager.hide([a], false);
    press();
    EditorEdit.delete();
    Undo.performUndo();
    expect(scene.roots.map((t) => t.name)).toEqual(['A', 'B']);
    expect(hidden()).toEqual(['A']);
  });
});
