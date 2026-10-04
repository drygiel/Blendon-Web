import { beforeEach, describe, expect, it } from 'vitest';
import { captureEditorMenu, EditorEdit } from '../../src/scene/blendon/scenetools/scene-menu/editor-menu.ts';
import { buildModel, Group, MenuNode } from '../../src/scene/blendon/scenetools/scene-menu/model.ts';
import { MenuSession } from '../../src/scene/blendon/scenetools/scene-menu/session.ts';
import { Selection, Undo } from '../../src/scene/unity/editor.ts';
import { Vector2, Vector3 } from '../../src/scene/unity/math.ts';
import { GameObject, Scene } from '../../src/scene/unity/scene.ts';
import { SceneView } from '../../src/scene/unity/sceneview.ts';

let scene: Scene;
let cube: GameObject;

beforeEach(() => {
  scene = new Scene();
  Scene.current = scene;
  Undo.init(scene);
  Undo.clearAll();
  new GameObject(scene, 'First');
  cube = new GameObject(scene, 'Cube');
  cube.transform.localPosition = new Vector3(1, 2, 3);
  Selection.set([cube], cube, false);
});

describe('scene menu content', () => {
  it('sorts the Editor entries into the icon row and sections', () => {
    const model = buildModel(captureEditorMenu(), true, []);
    expect(model.quick.map((n) => n.label)).toEqual(['Cut', 'Copy', 'Paste', 'Duplicate', 'Delete']);
    expect(model.sections.map((s) => s.title)).toEqual(['Align', 'Visibility', 'Object', 'Components']);
    // A component's submenu is a folder under the Components heading.
    const transform = model.sections[3].nodes[0];
    expect(transform.isFolder && transform.label).toBe('Transform');
    expect(transform.children.map((n) => n.label)).toEqual(['Copy', 'Paste', 'Reset Property']);
  });

  it('puts prepended extras at the head of their section with a rule after them', () => {
    const extra = new MenuNode('Blendon/Thing', 'Thing', null);
    extra.command = () => {};
    const model = buildModel(captureEditorMenu(), true, [{ group: Group.Align, node: extra, prepend: true }]);
    const align = model.sections[0].nodes;
    expect(align[0]).toBe(extra);
    expect(align[1].separatorBefore).toBe(true);
  });

  it('searches every entry by path, folders included', () => {
    const model = buildModel(captureEditorMenu(), true, []);
    const session = new MenuSession(
      new SceneView(),
      new Vector2(100, 100),
      captureEditorMenu(),
      model,
      'Cube',
      true,
      false,
    );
    session.place('', true);
    session.refilter('reset');
    const hits = session.root.rows.filter((r) => r.kind === 'item').map((r) => r.text + r.node!.label);
    expect(hits).toContain('Transform > Reset Property > Position');
    expect(session.root.selected).toBe(session.root.rows.findIndex((r) => r.kind === 'item' && r.node!.enabled));
  });
});

describe('edit commands', () => {
  it('deletes with one undo step that puts the object back in place', () => {
    EditorEdit.delete();
    expect(scene.roots.map((t) => t.name)).toEqual(['First']);
    Undo.performUndo();
    expect(scene.roots.map((t) => t.name)).toEqual(['First', 'Cube']);
    expect(Selection.activeGameObject).toBe(cube);
  });

  it('duplicates beside the source under a numbered name', () => {
    EditorEdit.duplicate();
    expect(scene.roots.map((t) => t.name)).toEqual(['First', 'Cube', 'Cube (1)']);
    expect(Selection.activeGameObject?.transform.localPosition.equals(new Vector3(1, 2, 3))).toBe(true);
    Undo.performUndo();
    expect(scene.roots.map((t) => t.name)).toEqual(['First', 'Cube']);
  });
});
