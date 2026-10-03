// SelectionPivot: where the gizmo stands for the current selection.
import { Selection, Tools } from '../../unity/editor.ts';
import { Event } from '../../unity/imgui.ts';
import { Vector3 } from '../../unity/math.ts';
import type { Transform } from '../../unity/scene.ts';
import { combinedBounds } from '../../unity/raycast.ts';
import { SelectionCache } from '../foundation.ts';
import { PivotMode } from './shared-settings.ts';
import { VertexSnappingUtility } from './vertex-snapping.ts';

export const SelectionPivot = {
  getPosition(mode: PivotMode): Vector3 {
    const transforms = SelectionCache.transforms;
    // Vertex snapping puts the gizmo on the point the next drag would pick up.
    if (VertexSnappingUtility.isActive) {
      const grabbed = VertexSnappingUtility.tryGetGrabPoint(Event.current.mousePosition, SelectionCache.deep);
      if (grabbed) return grabbed;
    }
    // A single object keeps Unity's own Pivot/Center toggle.
    if (transforms.length < 2) return Tools.handlePosition;
    return SelectionPivot.ofMultiple(mode, transforms);
  },

  ofMultiple(mode: PivotMode, transforms: Transform[]): Vector3 {
    switch (mode) {
      case PivotMode.IndividualOrigins:
      case PivotMode.ActiveObject:
        return Selection.activeTransform ? Selection.activeTransform.position : median(transforms);
      case PivotMode.BoundingBoxCenter: {
        const objs = transforms.flatMap((t) => [...t.walk()].map((d) => d.gameObject));
        return combinedBounds(objs)?.center ?? median(transforms);
      }
      default:
        return median(transforms);
    }
  },
};

function median(transforms: Transform[]) {
  let sum = Vector3.zero;
  for (const t of transforms) sum = sum.add(t.position);
  return sum.div(Math.max(1, transforms.length));
}
