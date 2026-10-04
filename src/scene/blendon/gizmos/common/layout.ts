// AxisBasis, HandleLayout, ScreenRingCap and GizmoToolsOverride: the small pieces every gizmo lays itself out with.
import { Tools } from '../../../unity/editor.ts';
import { HandleUtility } from '../../../unity/handles.ts';
import { GUIUtility } from '../../../unity/imgui.ts';
import { Quaternion, Vector3 } from '../../../unity/math.ts';
import type { SceneCamera } from '../../../unity/sceneview.ts';
import { GizmoAxis } from '../axis.ts';
import { DragKind, type GizmoDragCoordinator } from '../core/drag.ts';
import { DrawPrimitives, GizmoRenderer } from '../rendering.ts';

export class AxisBasis {
  readonly right: Vector3;
  readonly up: Vector3;
  readonly forward: Vector3;

  constructor(rotation: Quaternion) {
    this.right = rotation.mulV(Vector3.right);
    this.up = rotation.mulV(Vector3.up);
    this.forward = rotation.mulV(Vector3.forward);
  }

  dir(axis: GizmoAxis) {
    return axis === GizmoAxis.X ? this.right : axis === GizmoAxis.Y ? this.up : this.forward;
  }

  planeDirs(excluded: GizmoAxis): [Vector3, Vector3] {
    return excluded === GizmoAxis.Z
      ? [this.right, this.up]
      : excluded === GizmoAxis.X
        ? [this.up, this.forward]
        : [this.forward, this.right];
  }

  otherDirs(axis: GizmoAxis): [Vector3, Vector3] {
    return axis === GizmoAxis.X
      ? [this.up, this.forward]
      : axis === GizmoAxis.Y
        ? [this.right, this.forward]
        : [this.right, this.up];
  }

  static planeAxes(excluded: GizmoAxis): [GizmoAxis, GizmoAxis] {
    return excluded === GizmoAxis.Z
      ? [GizmoAxis.X, GizmoAxis.Y]
      : excluded === GizmoAxis.X
        ? [GizmoAxis.Y, GizmoAxis.Z]
        : [GizmoAxis.Z, GizmoAxis.X];
  }
}

export const HandleLayout = {
  drawPlanesAndAxes(
    position: Vector3,
    size: number,
    camera: SceneCamera | null,
    basis: AxisBasis,
    drawPlanes: boolean,
    planeOffset: number,
    planeSize: number,
    planeHandles: { reassertHitPriority(): void }[],
    planeOrder: number[],
    axisOrder: number[],
    sort: boolean,
    planeClampViewDir: Vector3,
    drawPlane: (i: number, dir1: Vector3, dir2: Vector3, normal: Vector3) => void,
    drawAxis: (i: number, dir: Vector3) => void,
  ) {
    const dir1s = [basis.right, basis.up, basis.forward];
    const dir2s = [basis.up, basis.forward, basis.right];
    const normals = [basis.forward, basis.right, basis.up];
    if (drawPlanes) {
      if (sort)
        GizmoRenderer.sortPlanesByDepth(
          position,
          planeOffset,
          planeSize,
          size,
          camera,
          dir1s,
          dir2s,
          planeClampViewDir,
          planeOrder,
        );
      for (const i of planeOrder) drawPlane(i, dir1s[i], dir2s[i], normals[i]);
    }
    const axisDirs = [basis.right, basis.up, basis.forward];
    if (sort) GizmoRenderer.sortAxesByDepth(position, size, camera, axisDirs, axisOrder);
    for (const i of axisOrder) drawAxis(i, axisDirs[i]);
    // Planes sit under the arrows on screen but must still win a press inside their own square.
    if (drawPlanes) for (const i of planeOrder) planeHandles[i].reassertHitPriority();
  },
};

export const ScreenRingCap = {
  facingNormal(coordinator: GizmoDragCoordinator, ringKind: DragKind) {
    return coordinator.activeKind === ringKind ? coordinator.activeViewNormal : GizmoRenderer.cameraNormal();
  },

  state(coordinator: GizmoDragCoordinator, ringKind: DragKind, controlId: number) {
    const active = coordinator.activeKind === ringKind;
    if (coordinator.activeKind !== DragKind.None && !active) return { active: false, hover: false, visible: false };
    const hover = !active && GUIUtility.hotControl === 0 && HandleUtility.nearestControl === controlId;
    return { active, hover, visible: true };
  },

  drawShape(position: Vector3, normal: Vector3, radius: number, thickness: number, square: boolean) {
    if (square) DrawPrimitives.drawScreenSquare(position, normal, radius, thickness);
    else DrawPrimitives.drawAACircle(position, normal, radius, thickness);
  },

  hitTestCircle(controlId: number, position: Vector3, radius: number) {
    HandleUtility.addControl(controlId, HandleUtility.distanceToCircle(position, radius));
  },

  hitTestSquare(controlId: number, position: Vector3, normal: Vector3, halfSize: number) {
    HandleUtility.addControl(
      controlId,
      HandleUtility.distanceToRectangle(position, Quaternion.lookRotation(normal), halfSize),
    );
  },
};

const owners = new Set<unknown>();

/** Hides Unity's own handles while any Blendon gizmo draws in their place. */
export const GizmoToolsOverride = {
  acquire(owner: unknown) {
    if (owners.has(owner)) return;
    owners.add(owner);
    Tools.hidden = true;
  },
  release(owner: unknown) {
    if (owners.delete(owner) && owners.size === 0) Tools.hidden = false;
  },
  isHeldBy(owner: unknown) {
    return owners.has(owner);
  },
};
