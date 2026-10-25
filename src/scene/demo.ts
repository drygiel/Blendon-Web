// The playground scene: a test yard blocked out in primitives on the grid, like a Unity level in progress.
// Everything sits half a unit down, on the Ground, so an object reset to the origin rests on it.
import { PivotMode, SharedGizmoSettings } from './blendon/gizmos/shared-settings.ts';
import type { SceneHost } from './engine/host.ts';
import { BoxSelect } from './blendon/scenetools/box-select.ts';
import { SelectionHistory } from './blendon/scenetools/history.ts';
import {
  EditorSnapSettings,
  PivotRotation,
  Prefs,
  Selection,
  ShortcutManager,
  Tool,
  Tools,
  Undo,
} from './unity/editor.ts';
import { Color, Mathf, Quaternion, Vector3 } from './unity/math.ts';
import { primitiveMesh, type PrimitiveType } from './unity/primitives.ts';
import { DrawCameraMode, type SceneView } from './unity/sceneview.ts';
import { GameObject, Ground, type Transform } from './unity/scene.ts';

interface Spec {
  name: string;
  mesh?: PrimitiveType;
  position: Vector3;
  euler?: Vector3;
  scale?: Vector3;
  parent?: Transform;
  color?: Color;
}

// Dark industrial paints (sRGB), so the grid's light ink reads on every object.
const Paint = {
  steel: new Color(0.22, 0.32, 0.45),
  teal: new Color(0.14, 0.36, 0.38),
  ochre: new Color(0.58, 0.43, 0.13),
  brick: new Color(0.5, 0.21, 0.17),
  olive: new Color(0.31, 0.37, 0.19),
  violet: new Color(0.33, 0.27, 0.46),
  graphite: new Color(0.19, 0.21, 0.24),
  concrete: new Color(0.3, 0.3, 0.3),
  sand: new Color(0.44, 0.4, 0.32),
};

type Add = (s: Spec) => GameObject;
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

// The reference capture's Scene view camera: the Editor's FOV and size, pose fitted to the capture.
export const DEMO_VIEW = {
  pivot: new Vector3(-1.6135, -0.7232, -3.9295),
  rotation: Quaternion.euler(20.031, 165.2098, 0),
  size: 4.4398,
  fieldOfView: 59.6,
};

export function buildDemoScene(host: SceneHost) {
  const add: Add = (s) => {
    const go = new GameObject(host.scene, s.name, s.parent ?? null);
    if (s.mesh) go.mesh = primitiveMesh(s.mesh);
    if (s.color) go.color = s.color;
    const t = go.transform;
    t.localPosition = s.position;
    if (s.euler) t.localRotation = Quaternion.euler(s.euler);
    if (s.scale) t.localScale = s.scale;
    return go;
  };

  const cube = add({ name: 'Cube', mesh: 'Cube', position: v(-3.9816, 0, -1.1618), color: Paint.steel });
  add({ name: 'Cube (1)', mesh: 'Cube', position: v(-1, 0, -5), color: Paint.teal });
  add({ name: 'Tilted Cube', mesh: 'Cube', position: v(0.5963, 0, -3.1219), euler: v(0, 0, 45), color: Paint.ochre });
  add({ name: 'Sphere', mesh: 'Sphere', position: v(2.3702, 0, -7.0878), color: Paint.violet });
  add({ name: 'Cube (2)', mesh: 'Cube', position: v(13.2528, 0.1677, -4.0396), color: Paint.brick });

  // Out of the opening shot: a slope for surface snapping and a small hierarchy.
  add({
    name: 'Ramp',
    mesh: 'Ramp',
    position: v(-8.2, 0, 1.4),
    euler: v(0, 30, 0),
    scale: v(2, 1, 2.4),
    color: Paint.concrete,
  });
  const group = add({ name: 'Group', position: v(9.6, -0.5, 1.2) });
  add({ name: 'Cylinder', mesh: 'Cylinder', position: v(-0.8, 1, 0), parent: group.transform, color: Paint.olive });
  add({ name: 'Capsule', mesh: 'Capsule', position: v(0.9, 1, 0.4), parent: group.transform, color: Paint.graphite });

  buildYard(add);

  const view = host.view;
  view.cameraSettings.fieldOfView = DEMO_VIEW.fieldOfView;
  view.lookAtDirect(DEMO_VIEW.pivot, DEMO_VIEW.rotation, DEMO_VIEW.size);
  // The reference capture's toolbar: Median Point, Global.
  SharedGizmoSettings.PivotPoint = PivotMode.Median;
  Selection.set([cube], cube, false);
  centerOn(view, cube);
  Undo.clearAll();
}

/**
 * The yard round the opening objects. Tall structures stand back beyond the idle orbit's circle, and the floor
 * between the camera and the Cube stays empty, so the orbit never hides the Cube and a click there hits the floor.
 * Above and left of the Sphere the opening shot stays open too: a box drawn from there starts on empty ground.
 */
function buildYard(add: Add) {
  // A parent on the floor: its children give their height above the Ground.
  const group = (name: string, position: Vector3, yaw = 0) =>
    add({ name, position: position.withY(Ground.y), euler: yaw ? v(0, yaw, 0) : undefined }).transform;
  // Cube and Sphere are 1 m across, Cylinder and Capsule 1 m across and 2 m tall.
  const part = (
    parent: Transform,
    name: string,
    mesh: PrimitiveType,
    position: Vector3,
    scale: Vector3,
    color: Color,
    euler?: Vector3,
  ) => add({ name, mesh, position, scale, color, euler, parent });

  const gantry = group('Gantry', v(-4.5, 0, -13));
  part(gantry, 'Test Pad', 'Cube', v(0, 0.02, 0), v(6.4, 0.04, 2.8), Paint.concrete);
  part(gantry, 'Foot A', 'Cube', v(-3.6, 0.1, 0), v(0.9, 0.2, 1.4), Paint.graphite);
  part(gantry, 'Foot B', 'Cube', v(3.6, 0.1, 0), v(0.9, 0.2, 1.4), Paint.graphite);
  part(gantry, 'Leg A', 'Cube', v(-3.6, 1.8, 0), v(0.4, 3.2, 0.5), Paint.ochre);
  part(gantry, 'Leg B', 'Cube', v(3.6, 1.8, 0), v(0.4, 3.2, 0.5), Paint.ochre);
  part(gantry, 'Beam', 'Cube', v(0, 3.65, 0), v(8, 0.5, 0.6), Paint.ochre);
  part(gantry, 'Trolley', 'Cube', v(1.1, 3.2, 0), v(0.8, 0.4, 0.9), Paint.graphite);
  part(gantry, 'Cable', 'Cylinder', v(1.1, 2.4, 0), v(0.06, 0.6, 0.06), Paint.graphite);
  part(gantry, 'Hook Block', 'Cube', v(1.1, 1.6, 0), v(0.4, 0.4, 0.3), Paint.brick);
  part(gantry, 'Load', 'Cube', v(1.1, 0.44, 0), v(1.2, 0.8, 1), Paint.steel);

  const rack = group('Pipe Rack', v(-2, 0, -16.5));
  for (const [i, x] of [-9, -3, 3, 9].entries()) {
    part(rack, `Post ${i + 1}`, 'Cube', v(x, 1.25, 0), v(0.25, 2.5, 0.25), Paint.graphite);
    part(rack, `Arm ${i + 1}`, 'Cube', v(x, 2.5, 0), v(0.25, 0.2, 1.9), Paint.graphite);
  }
  const lying = v(0, 0, 90);
  part(rack, 'Pipe A', 'Cylinder', v(0, 2.825, -0.5), v(0.45, 10.5, 0.45), Paint.teal, lying);
  part(rack, 'Pipe B', 'Cylinder', v(0, 2.825, 0.1), v(0.45, 10.5, 0.45), Paint.olive, lying);
  part(rack, 'Pipe C', 'Cylinder', v(0, 2.75, 0.62), v(0.3, 10.5, 0.3), Paint.brick, lying);

  const silo = group('Silo', v(-15, 0, -12.5));
  part(silo, 'Plinth', 'Cylinder', v(0, 0.15, 0), v(3, 0.15, 3), Paint.concrete);
  part(silo, 'Tank', 'Cylinder', v(0, 2.1, 0), v(2.6, 1.8, 2.6), Paint.teal);
  part(silo, 'Dome', 'Sphere', v(0, 3.9, 0), v(2.6, 1.2, 2.6), Paint.teal);
  part(silo, 'Band A', 'Cylinder', v(0, 1.3, 0), v(2.68, 0.06, 2.68), Paint.ochre);
  part(silo, 'Band B', 'Cylinder', v(0, 2.9, 0), v(2.68, 0.06, 2.68), Paint.ochre);
  part(silo, 'Rail A', 'Cube', v(-0.24, 2.15, 1.42), v(0.08, 3.7, 0.08), Paint.graphite);
  part(silo, 'Rail B', 'Cube', v(0.24, 2.15, 1.42), v(0.08, 3.7, 0.08), Paint.graphite);
  for (let i = 0; i < 6; i++)
    part(silo, `Rung ${i + 1}`, 'Cube', v(0, 0.7 + i * 0.6, 1.42), v(0.48, 0.06, 0.06), Paint.graphite);

  const mast = group('Mast', v(-14.5, 0, -6));
  part(mast, 'Footing', 'Cube', v(0, 0.2, 0), v(1.2, 0.4, 1.2), Paint.concrete);
  part(mast, 'Pole', 'Cylinder', v(0, 3.4, 0), v(0.18, 3, 0.18), Paint.graphite);
  part(mast, 'Crossbar A', 'Cube', v(0, 4.4, 0), v(1.1, 0.08, 0.08), Paint.graphite);
  part(mast, 'Crossbar B', 'Cube', v(0, 5.2, 0), v(1.6, 0.08, 0.08), Paint.graphite);
  part(mast, 'Beacon', 'Sphere', v(0, 6.55, 0), v(0.3, 0.3, 0.3), Paint.brick);

  // Five steps climb to the deck from the side facing the yard.
  const deck = group('Platform', v(-9.5, 0, -6.5));
  part(deck, 'Deck', 'Cube', v(0, 0.9, 0), v(3, 1.8, 2.6), Paint.concrete);
  for (let k = 1; k <= 5; k++)
    part(deck, `Step ${k}`, 'Cube', v(1.7 + 0.4 * (5 - k), 0.15 * k, 0.6), v(0.4, 0.3 * k, 1.2), Paint.sand);
  for (const [i, [x, z]] of [
    [-1.4, -1.2],
    [1.4, -1.2],
    [-1.4, 1.2],
  ].entries())
    part(deck, `Post ${i + 1}`, 'Cylinder', v(x, 2.3, z), v(0.08, 0.5, 0.08), Paint.ochre);
  part(deck, 'Rail A', 'Cube', v(0, 2.78, -1.2), v(2.88, 0.06, 0.06), Paint.ochre);
  part(deck, 'Rail B', 'Cube', v(-1.4, 2.78, 0), v(0.06, 0.06, 2.48), Paint.ochre);

  const crates = group('Crates', v(-8.2, 0, -2.6), 15);
  part(crates, 'Crate A', 'Cube', v(0, 0.5, 0), v(1, 1, 1), Paint.olive);
  part(crates, 'Crate B', 'Cube', v(1.1, 0.5, 0.1), v(1, 1, 1), Paint.ochre, v(0, 8, 0));
  part(crates, 'Crate C', 'Cube', v(0.5, 0.4, 1.05), v(0.8, 0.8, 0.8), Paint.brick, v(0, -12, 0));
  part(crates, 'Crate D', 'Cube', v(-1.25, 0.3, 0.6), v(0.8, 0.6, 1.6), Paint.steel);
  part(crates, 'Crate E', 'Cube', v(0.05, 1.35, 0), v(0.7, 0.7, 0.7), Paint.sand, v(0, 20, 0));

  const stack = group('Containers', v(1.5, 0, 9.5), 80);
  part(stack, 'Container A', 'Cube', v(0, 1.3, 0), v(6, 2.6, 2.4), Paint.brick);
  part(stack, 'Container B', 'Cube', v(0.4, 3.9, 0.1), v(6, 2.6, 2.4), Paint.teal, v(0, 6, 0));

  const drums = group('Drums', v(3.2, 0, 3.4));
  const drum = v(0.6, 0.45, 0.6);
  part(drums, 'Drum A', 'Cylinder', v(0, 0.45, 0), drum, Paint.brick);
  part(drums, 'Drum B', 'Cylinder', v(0.65, 0.45, 0.1), drum, Paint.ochre);
  part(drums, 'Drum C', 'Cylinder', v(0.3, 0.45, 0.62), drum, Paint.teal);
  part(drums, 'Drum D', 'Cylinder', v(-0.5, 0.45, 0.55), drum, Paint.brick);
  part(drums, 'Drum E', 'Cylinder', v(1.1, 0.3, 1.25), drum, Paint.olive, v(90, 30, 0));

  const genset = group('Generator', v(6.5, 0, -3), -20);
  part(genset, 'Skid', 'Cube', v(0, 0.1, 0), v(3.2, 0.2, 1.6), Paint.graphite);
  part(genset, 'Housing', 'Cube', v(-0.3, 0.85, 0), v(2.2, 1.3, 1.3), Paint.olive);
  part(genset, 'Radiator', 'Cube', v(1.15, 0.75, 0), v(0.5, 1.1, 1.3), Paint.graphite);
  part(genset, 'Control Panel', 'Cube', v(-0.3, 0.9, 0.67), v(0.8, 0.6, 0.04), Paint.steel);
  part(genset, 'Exhaust', 'Cylinder', v(-0.9, 1.9, 0.3), v(0.2, 0.4, 0.2), Paint.graphite);
}

/** Turns the camera, where it stands, to look straight at the object, keeping its distance. */
function centerOn(view: SceneView, go: GameObject) {
  const center = go.bounds?.center ?? go.transform.position;
  const offset = center.sub(view.camera.position);
  const size = offset.magnitude * Math.sin(view.cameraSettings.fieldOfView * 0.5 * Mathf.Deg2Rad);
  view.lookAtDirect(center, Quaternion.lookRotation(offset.normalized, Vector3.up), size);
}

/** Back to the page's first state: the scene as built, the Scene view's toggles and every setting changed here. */
export function resetDemoScene(host: SceneHost) {
  BoxSelect.cancel();
  const scene = host.scene;
  for (const t of [...scene.roots]) scene.destroy(t.gameObject);
  scene.isolation = null;
  scene.visibilityEnabled = true;
  Prefs.local.clear();
  EditorSnapSettings.reset();
  Tools.current = Tool.Move;
  Tools.pivotRotation = PivotRotation.Global;
  const view = host.view;
  view.drawMode = DrawCameraMode.Textured;
  view.sceneLighting = true;
  view.showGrid = true;
  view.isRotationLocked = false;
  view.orthographic = false;
  // Like a scene opened in Single mode, the selection history starts over.
  SelectionHistory.clear();
  buildDemoScene(host);
  ShortcutManager.invalidate();
  Prefs.changed();
  host.requestFrame();
}
