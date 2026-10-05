// The playground scene: a few primitives on the grid, like a fresh Unity scene being blocked out.
// Everything sits half a unit down, on the Ground, so an object reset to the origin rests on it.
import { PivotMode, SharedGizmoSettings } from './blendon/gizmos/shared-settings.ts';
import type { SceneHost } from './engine/host.ts';
import { BoxSelect } from './blendon/scenetools/box-select.ts';
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
import { Mathf, Quaternion, Vector3 } from './unity/math.ts';
import { primitiveMesh, type PrimitiveType } from './unity/primitives.ts';
import { DrawCameraMode, type SceneView } from './unity/sceneview.ts';
import { GameObject, type Transform } from './unity/scene.ts';

interface Spec {
  name: string;
  mesh?: PrimitiveType;
  position: Vector3;
  euler?: Vector3;
  scale?: Vector3;
  parent?: Transform;
}

// The reference capture's Scene view camera: the Editor's FOV and size, pose fitted to the capture.
export const DEMO_VIEW = {
  pivot: new Vector3(-1.6135, -0.7232, -3.9295),
  rotation: Quaternion.euler(20.031, 165.2098, 0),
  size: 4.4398,
  fieldOfView: 59.6,
};

export function buildDemoScene(host: SceneHost) {
  const add = (s: Spec) => {
    const go = new GameObject(host.scene, s.name, s.parent ?? null);
    if (s.mesh) go.mesh = primitiveMesh(s.mesh);
    const t = go.transform;
    t.localPosition = s.position;
    if (s.euler) t.localRotation = Quaternion.euler(s.euler);
    if (s.scale) t.localScale = s.scale;
    return go;
  };

  const cube = add({ name: 'Cube', mesh: 'Cube', position: new Vector3(-3.9816, 0, -1.1618) });
  add({ name: 'Cube (1)', mesh: 'Cube', position: new Vector3(-1, 0, -5) });
  add({ name: 'Tilted Cube', mesh: 'Cube', position: new Vector3(0.5963, 0, -3.1219), euler: new Vector3(0, 0, 45) });
  add({ name: 'Sphere', mesh: 'Sphere', position: new Vector3(2.3702, 0, -7.0878) });
  add({ name: 'Cube (2)', mesh: 'Cube', position: new Vector3(13.2528, 0.1677, -4.0396) });

  // Out of the opening shot: a slope for surface snapping and a small hierarchy.
  add({
    name: 'Ramp',
    mesh: 'Ramp',
    position: new Vector3(-8.2, 0, 1.4),
    euler: new Vector3(0, 30, 0),
    scale: new Vector3(2, 1, 2.4),
  });
  const group = add({ name: 'Group', position: new Vector3(9.6, -0.5, 1.2) });
  add({ name: 'Cylinder', mesh: 'Cylinder', position: new Vector3(-0.8, 1, 0), parent: group.transform });
  add({ name: 'Capsule', mesh: 'Capsule', position: new Vector3(0.9, 1, 0.4), parent: group.transform });

  const v = host.view;
  v.cameraSettings.fieldOfView = DEMO_VIEW.fieldOfView;
  v.lookAtDirect(DEMO_VIEW.pivot, DEMO_VIEW.rotation, DEMO_VIEW.size);
  // The reference capture's toolbar: Median Point, Global.
  SharedGizmoSettings.PivotPoint = PivotMode.Median;
  Selection.set([cube], cube, false);
  centerOn(v, cube);
  Undo.clearAll();
}

/** Turns the camera, where it stands, to look straight at the object, keeping its distance. */
function centerOn(v: SceneView, go: GameObject) {
  const center = go.bounds?.center ?? go.transform.position;
  const offset = center.sub(v.camera.position);
  const size = offset.magnitude * Math.sin(v.cameraSettings.fieldOfView * 0.5 * Mathf.Deg2Rad);
  v.lookAtDirect(center, Quaternion.lookRotation(offset.normalized, Vector3.up), size);
}

/** Back to the page's first state: the scene as built, the Scene view's toggles and every setting changed here. */
export function resetDemoScene(host: SceneHost) {
  BoxSelect.cancel();
  const scene = host.scene;
  for (const t of [...scene.roots]) scene.destroy(t.gameObject);
  scene.isolated = null;
  scene.visibilityEnabled = true;
  Prefs.local.clear();
  EditorSnapSettings.reset();
  Tools.current = Tool.Move;
  Tools.pivotRotation = PivotRotation.Global;
  const v = host.view;
  v.drawMode = DrawCameraMode.Textured;
  v.sceneLighting = true;
  v.showGrid = true;
  v.isRotationLocked = false;
  v.orthographic = false;
  buildDemoScene(host);
  ShortcutManager.invalidate();
  Prefs.changed();
  host.requestFrame();
}
