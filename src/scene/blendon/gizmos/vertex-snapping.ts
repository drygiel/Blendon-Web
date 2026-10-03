// VertexSnappingUtility: Blendon's vertex snapping (V) and virtual pivot pick (Shift+V).
import { Vector2, Vector3 } from '../../unity/math.ts';
import type { Transform } from '../../unity/scene.ts';

export const VertexSnappingUtility = {
  isActive: false,
  isPicking: false,
  isPickMode: false,
  hasPick: false,
  pickedPoint: Vector3.zero,
  hasTarget: false,
  snapsToTarget: false,
  targetVertex: Vector3.zero,
  targetOwner: null as Transform | null,

  tryGetGrabPoint(_mouse: Vector2, _deep: Transform[]): Vector3 | null {
    return null;
  },

  exitPickMode() {
    VertexSnappingUtility.isPickMode = false;
    VertexSnappingUtility.isPicking = false;
  },
};
