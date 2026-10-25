import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ViewOrbitTween } from '../../src/scene/blendon/navigation/camera.ts';
import { ViewportNavActions } from '../../src/scene/blendon/navigation/viewport-nav.ts';
import { FrameSelected } from '../../src/scene/blendon/scenetools/frame-selected.ts';
import { SelectionHistory } from '../../src/scene/blendon/scenetools/history.ts';
import { SnapToFloor } from '../../src/scene/blendon/scenetools/snap-to-floor.ts';
import { Prefs, Selection } from '../../src/scene/unity/editor.ts';
import { Bounds, Quaternion, Vector3 } from '../../src/scene/unity/math.ts';
import { primitiveMesh } from '../../src/scene/unity/primitives.ts';
import { GameObject, Ground, Scene } from '../../src/scene/unity/scene.ts';
import { SceneView } from '../../src/scene/unity/sceneview.ts';

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

function box(scene: Scene, name: string, position: Vector3, scale = Vector3.one, parent: GameObject | null = null) {
  const go = new GameObject(scene, name, parent?.transform ?? null);
  go.mesh = primitiveMesh('Cube');
  go.transform.localPosition = position;
  go.transform.localScale = scale;
  return go;
}

describe('Snap to Floor', () => {
  let scene: Scene;

  beforeEach(() => {
    scene = new Scene();
    Scene.current = scene;
    Prefs.local.clear();
    // The landing is read at once, not after a bounce.
    Prefs.local.set('SnapToFloorSettings.AnimationEnabled', false);
  });

  afterEach(() => {
    Selection.set([], null, false);
    Prefs.local.clear();
  });

  const snap = (go: GameObject) => {
    Selection.set([go], go, false);
    SnapToFloor.run();
    return go.transform.position;
  };

  it('lands a pivot outside its body on the table under the body', () => {
    // Table top at y = 0.5, edge at x = 1.
    box(scene, 'Table', Vector3.zero, v(2, 1, 2));
    const thing = new GameObject(scene, 'Thing');
    thing.transform.localPosition = v(1.4, 3, 0);
    // The body spans x 0.1 to 1.1, the pivot hangs past the edge.
    box(scene, 'Body', v(-0.8, 0, 0), Vector3.one, thing);
    expect(snap(thing).y).toBeCloseTo(1, 4);
  });

  it('rests on the first thing any corner of the footprint meets', () => {
    box(scene, 'Table', Vector3.zero, v(2, 1, 2));
    // Its middle is past the edge, one side of it is over the table.
    const crate = box(scene, 'Crate', v(1.3, 4, 0));
    expect(snap(crate).y).toBeCloseTo(1, 4);
  });

  it('takes no support from a neighbour the footprint only touches', () => {
    box(scene, 'Wall', v(0, 1, 0), v(2, 3, 2));
    const crate = box(scene, 'Crate', v(1.5, 4, 0));
    expect(snap(crate).y).toBeCloseTo(Ground.y + 0.5, 4);
  });

  it('measures the contact along the surface normal for a tilted box', () => {
    const offsets = [v(0, -1, 0), v(0, 1, 0), v(0.5, -1, 0)];
    expect(SnapToFloor.support(offsets, Quaternion.identity, Vector3.up)).toBeCloseTo(1, 6);
    const tilt = Quaternion.euler(v(0, 0, 45));
    const normal = tilt.mulV(Vector3.up);
    // The tilt turns the body, so its reach along the normal is the untilted one.
    expect(SnapToFloor.support(offsets, tilt, normal)).toBeCloseTo(1, 6);
    const landed = SnapToFloor.landing(v(0, 5, 0), Vector3.down, Vector3.up, v(0, 2, 0), 1);
    expect(landed.y).toBeCloseTo(3, 6);
  });
});

describe('Frame Selected outside its cycle', () => {
  it("fits the selection's bounding sphere, a point as a unit box", () => {
    const fit = FrameSelected.tryFitBounds(new Bounds(v(1, 2, 3), v(2, 2, 2)));
    expect(fit?.pivot.equals(v(1, 2, 3))).toBe(true);
    expect(fit?.size).toBeCloseTo(Math.sqrt(3), 6);
    expect(FrameSelected.tryFitBounds(new Bounds(v(0, 0, 0), Vector3.zero))?.size).toBeCloseTo(Math.sqrt(0.75), 6);
    expect(FrameSelected.tryFitBounds(null)).toBeNull();
  });
});

describe('a running view flight', () => {
  afterEach(() => ViewOrbitTween.stop());

  it('lands where it was heading before a zoom, pan or orbit acts', () => {
    const view = new SceneView();
    const target = Quaternion.euler(v(90, 0, 0));
    ViewOrbitTween.to(view, v(0, 10, 0), target, 3, false, true);
    expect(ViewOrbitTween.isPlaying).toBe(true);
    expect(ViewOrbitTween.pendingRotation(view).equals(target)).toBe(true);
    expect(ViewOrbitTween.land(view)).toBe(true);
    expect(ViewOrbitTween.isPlaying).toBe(false);
    expect(Quaternion.angle(view.rotation, target)).toBeLessThan(1e-3);
    expect(view.pivot.sub(v(0, 10, 0)).magnitude).toBeLessThan(1e-4);
    expect(view.size).toBeCloseTo(3, 5);
    // Nothing on its way: nothing to land.
    expect(ViewOrbitTween.land(view)).toBe(false);
  });

  it('turns two quick numpad steps two whole steps', () => {
    const view = new SceneView();
    view.lookAtDirect(Vector3.zero, Quaternion.identity, 5);
    ViewportNavActions.orbitStep(1, 0);
    ViewportNavActions.orbitStep(1, 0);
    const heading = ViewOrbitTween.pendingRotation(view);
    expect(Quaternion.angle(heading, Quaternion.identity)).toBeCloseTo(2 * 15, 3);
  });
});

describe('Selection History', () => {
  const scene = new Scene();
  Scene.current = scene;
  const [a, b, c] = ['A', 'B', 'C'].map((n) => box(scene, n, Vector3.zero));
  SelectionHistory.install();

  it('steps over entries whose objects are gone, and stays put without a live one', () => {
    SelectionHistory.clear();
    for (const go of [a, b, c]) Selection.set([go], go);
    scene.destroy(b);
    SelectionHistory.moveBack();
    expect(Selection.objects).toEqual([a]);
    // Nothing live before A: the selection stays.
    SelectionHistory.moveBack();
    expect(Selection.objects).toEqual([a]);
    SelectionHistory.moveForward();
    expect(Selection.objects).toEqual([c]);
  });

  it('starts over with a new scene', () => {
    Selection.set([a], a);
    Selection.set([c], c);
    SelectionHistory.clear();
    SelectionHistory.moveBack();
    expect(Selection.objects).toEqual([c]);
  });
});
