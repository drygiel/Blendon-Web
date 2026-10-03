// The playground scene: a few primitives on the grid, like a fresh Unity scene being blocked out.
import type { SceneHost } from './engine/host.ts';
import { Selection, Undo } from './unity/editor.ts';
import { Quaternion, Vector3 } from './unity/math.ts';
import { primitiveMesh, type PrimitiveType } from './unity/primitives.ts';
import { GameObject, type Transform } from './unity/scene.ts';

interface Spec {
  name: string;
  mesh?: PrimitiveType;
  position: Vector3;
  euler?: Vector3;
  scale?: Vector3;
  parent?: Transform;
}

export const DEMO_VIEW = {
  pivot: new Vector3(0.75, 0.45, 0.35),
  rotation: Quaternion.euler(22, 163, 0),
  size: 3.3,
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

  const cube = add({ name: 'Cube', mesh: 'Cube', position: new Vector3(-1.5, 0.5, -0.4), euler: new Vector3(0, 352, 0) });
  add({ name: 'Cube (1)', mesh: 'Cube', position: new Vector3(0.9, 0.5, 0.9) });
  add({ name: 'Tilted Cube', mesh: 'Cube', position: new Vector3(3.6, 0.707, 1.3), euler: new Vector3(0, 20, 45) });
  add({ name: 'Sphere', mesh: 'Sphere', position: new Vector3(3.3, 0.5, -0.1) });

  // Out of the opening shot: a slope for surface snapping and a small hierarchy.
  add({ name: 'Ramp', mesh: 'Ramp', position: new Vector3(-8.2, 0.5, 1.4), euler: new Vector3(0, 30, 0), scale: new Vector3(2, 1, 2.4) });
  const group = add({ name: 'Group', position: new Vector3(9.6, 0, 1.2) });
  add({ name: 'Cylinder', mesh: 'Cylinder', position: new Vector3(-0.8, 1, 0), parent: group.transform });
  add({ name: 'Capsule', mesh: 'Capsule', position: new Vector3(0.9, 1, 0.4), parent: group.transform });

  const v = host.view;
  v.lookAtDirect(DEMO_VIEW.pivot, DEMO_VIEW.rotation, DEMO_VIEW.size);
  Selection.set([cube], cube, false);
  Undo.clearAll();
}
