import { describe, expect, it } from 'vitest';
import { Quaternion } from '../../src/scene/unity/math.ts';
import { SceneView } from '../../src/scene/unity/sceneview.ts';

const parts = (q: Quaternion) => [q.x, q.y, q.z, q.w];

describe('the Scene view rotation', () => {
  it('comes back exactly when a saved rotation is put back', () => {
    // A unit rotation whose normalizing moves its last bits (WebKit's camera after its idle orbit).
    const saved = new Quaternion(-0.005054788972612613, 0.9785917813215872, -0.20431948136915773, -0.02421000147301853);
    expect(parts(saved.normalized)).not.toEqual(parts(saved));
    const view = new SceneView();
    view.rotation = saved;
    expect(parts(view.rotation)).toEqual(parts(saved));
    view.lookAtDirect(view.pivot, saved);
    expect(parts(view.rotation)).toEqual(parts(saved));
  });

  it('still normalizes a rotation that is not unit', () => {
    const view = new SceneView();
    view.rotation = new Quaternion(0, 2, 0, 0);
    expect(parts(view.rotation)).toEqual([0, 1, 0, 0]);
  });
});
