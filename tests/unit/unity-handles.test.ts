import { describe, expect, it } from 'vitest';
import {
  alignedScaleDelta,
  calcDrawOrder,
  CameraViewThreshold,
  cameraViewLerp,
  discDegrees,
  discSectionPoints,
  snapTo,
} from '../../src/scene/engine/unity-native/handle-math.ts';
import { Mathf, Quaternion, Vector3 } from '../../src/scene/unity/math.ts';

const atAngle = (deg: number) => new Vector3(Math.sin(deg * Mathf.Deg2Rad), 0, Math.cos(deg * Mathf.Deg2Rad));
const close = (a: Vector3, b: Vector3) => expect(a.sub(b).magnitude).toBeLessThan(1e-6);

describe("the Editor's handle geometry", () => {
  it('fades an axis between 25 and 15 deg looking along it, 170 and 175 looking at it', () => {
    const z = Vector3.forward;
    expect(cameraViewLerp(atAngle(90), z)).toBe(0);
    expect(cameraViewLerp(atAngle(30), z)).toBe(0);
    expect(cameraViewLerp(atAngle(20), z)).toBeGreaterThan(0.4);
    expect(cameraViewLerp(atAngle(20), z)).toBeLessThan(0.6);
    expect(cameraViewLerp(atAngle(10), z)).toBe(1);
    // Pointing at the camera an axis holds on far longer.
    expect(cameraViewLerp(atAngle(165), z)).toBe(0);
    expect(cameraViewLerp(atAngle(178), z)).toBe(1);
    // Hidden past the threshold: about 19 deg off the line of sight.
    expect(cameraViewLerp(atAngle(18), z)).toBeGreaterThan(CameraViewThreshold);
  });

  it('draws the axes back to front along the view', () => {
    expect(calcDrawOrder(new Vector3(0.1, 0.5, 0.3))).toEqual([1, 2, 0]);
    expect(calcDrawOrder(new Vector3(0.9, -0.2, 0.1))).toEqual([0, 2, 1]);
  });

  it("puts a scale along the handle's axis onto the object's axis that lines up with it", () => {
    const turned = Quaternion.angleAxis(90, Vector3.up);
    close(alignedScaleDelta(new Vector3(2, 1, 1), Quaternion.identity, turned), new Vector3(1, 1, 2));
    close(alignedScaleDelta(new Vector3(1, 3, 1), Quaternion.identity, turned), new Vector3(1, 3, 1));
    close(alignedScaleDelta(new Vector3(2, 1, 1), turned, turned), new Vector3(2, 1, 1));
  });

  it('lays a disc section out from its start, turning by the angle', () => {
    const pts = discSectionPoints(Vector3.zero, Vector3.up, Vector3.forward, 180, 2);
    expect(pts).toHaveLength(60);
    close(pts[0], new Vector3(0, 0, 2));
    close(pts[59], new Vector3(0, 0, -2));
    for (const p of pts) expect(p.magnitude).toBeCloseTo(2, 6);
  });

  it('turns a ring 30 deg per handle size dragged, and snaps to the step', () => {
    expect(discDegrees(1.5, 1.5)).toBe(30);
    expect(snapTo(0.3, 0.25)).toBe(0.25);
    expect(snapTo(-12, 5)).toBe(-10);
    expect(snapTo(0.3, 0)).toBe(0.3);
  });
});
