// Vertex snapping visuals: edge highlight, preview markers, the pick ring and the pivot group.
import type { Vector3 } from '../../../unity/math.ts';
import type { Transform } from '../../../unity/scene.ts';
import type { GizmoDragCoordinator } from '../core/drag.ts';

export const VertexEdgeHighlight = {
  draw(_coordinator: GizmoDragCoordinator, _gizmoPosition: Vector3) {},
  drawTarget(_vertex: Vector3, _owner: Transform) {},
};

export const VertexPreviewHandle = {
  draw(_coordinator: GizmoDragCoordinator) {},
  drawTarget(_owner: Transform) {},
  drawCandidate(_vertex: Vector3) {},
};

export const VertexPickHandle = {
  draw() {},
  handleRepick() {},
  handleRmbCancel() {
    return false;
  },
};

export const VertexPivotGroup = {
  createAtPick() {},
};
