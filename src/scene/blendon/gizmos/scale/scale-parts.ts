// What Scale's gizmo and grab share: the scale math, the drag session and the overlays.
import { EditorSnapSettings, Selection, Tools } from '../../../unity/editor.ts';
import { HandleUtility, Handles } from '../../../unity/handles.ts';
import { Event, EventType } from '../../../unity/imgui.ts';
import { Mathf, Plane, Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import { withFade } from '../../color.ts';
import { SnapCompat } from '../../foundation.ts';
import { GizmoAxis } from '../axis.ts';
import { GizmoColors } from '../colors.ts';
import { IndividualOrigins } from '../common/controller.ts';
import { AxisBasis } from '../common/layout.ts';
import { DragKind, type GizmoDragCoordinator } from '../core/drag.ts';
import type { ModalNumericParser } from '../core/numeric.ts';
import { ScreenDragSolver } from '../core/screen-drag-solver.ts';
import type { AxisHeadStyle } from '../handles/axis-handle.ts';
import { GizmoHud } from '../hud.ts';
import { DrawGhosts, DrawOverlays } from '../overlays.ts';
import { DrawPrimitives, GizmoRenderer } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';
import type { ScaleGizmoSettings } from './settings.ts';

function axisScaleFactor(localAxisWorldDir: Vector3, ratio: number, kind: DragKind, projRef: Vector3) {
  const t = localAxisWorldDir.add(ScaleMath.projectOntoDragSubspace(localAxisWorldDir, kind, projRef).mul(ratio - 1));
  return (Vector3.dot(t, localAxisWorldDir) < 0 ? -1 : 1) * t.magnitude;
}

function anisoTransform(v: Vector3, reference: Quaternion, factor: Vector3) {
  const r = reference.mulV(Vector3.right),
    u = reference.mulV(Vector3.up),
    f = reference.mulV(Vector3.forward);
  return v
    .add(r.mul(Vector3.dot(v, r) * (factor.x - 1)))
    .add(u.mul(Vector3.dot(v, u) * (factor.y - 1)))
    .add(f.mul(Vector3.dot(v, f) * (factor.z - 1)));
}

const objectRotation = () => (Selection.activeTransform ? Selection.activeTransform.rotation : Tools.handleRotation);

export const ScaleMath = {
  MinRatio: 0.0001,
  objectRotation,

  projectOntoDragSubspace(v: Vector3, kind: DragKind, projRef: Vector3) {
    if (kind === DragKind.ScaleAxis) return projRef.mul(Vector3.dot(projRef, v));
    if (kind === DragKind.ScalePlane) return v.sub(projRef.mul(Vector3.dot(projRef, v)));
    return v;
  },

  localAxisFactor(ratio: number, kind: DragKind, axis: GizmoAxis) {
    const i = axis.index;
    if (kind === DragKind.ScaleAxis) return new Vector3(i === 0 ? ratio : 1, i === 1 ? ratio : 1, i === 2 ? ratio : 1);
    // A plane's identity is its excluded axis: the other two scale.
    return new Vector3(i === 0 ? 1 : ratio, i === 1 ? 1 : ratio, i === 2 ? 1 : ratio);
  },

  localScaleFactors(ratio: number, kind: DragKind, projRef: Vector3, refRotation = objectRotation()) {
    return new Vector3(
      axisScaleFactor(refRotation.mulV(Vector3.right), ratio, kind, projRef),
      axisScaleFactor(refRotation.mulV(Vector3.up), ratio, kind, projRef),
      axisScaleFactor(refRotation.mulV(Vector3.forward), ratio, kind, projRef),
    );
  },

  localScaleFactorsAniso(factor: Vector3, reference: Quaternion, objRotation: Quaternion) {
    const f = (axis: Vector3) => {
      const t = anisoTransform(axis, reference, factor);
      return (Vector3.dot(t, axis) < 0 ? -1 : 1) * t.magnitude;
    };
    return new Vector3(
      f(objRotation.mulV(Vector3.right)),
      f(objRotation.mulV(Vector3.up)),
      f(objRotation.mulV(Vector3.forward)),
    );
  },

  anisoTransformVector: anisoTransform,

  mouseOffset(origin: Vector3, guiPoint: Vector2) {
    const camera = GizmoRenderer.currentCamera();
    if (!camera) return Vector3.zero;
    const ray = HandleUtility.guiPointToWorldRay(guiPoint);
    const [hit, d] = new Plane(camera.forward, origin).raycast(ray);
    return hit ? ray.getPoint(d).sub(origin) : Vector3.zero;
  },
};

/** One scale drag: the ratio of the cursor's distance from the pivot now to at the press. */
export class ScaleDragSession {
  private readonly coordinator: GizmoDragCoordinator;
  private readonly numeric: ModalNumericParser;
  private effectiveRatio = 1;
  // Precision accumulates scaled-down changes, so releasing Shift never snaps to the full-speed value.
  private prevRawRatio = 1;
  // The dragged direction (axis) or plane normal (plane).
  private projRef = Vector3.zero;
  private startDirection = Vector3.forward;
  private startMouseDistance = 1;
  ratioDelta = 0;
  vertexDrag = false;

  constructor(coordinator: GizmoDragCoordinator, numeric: ModalNumericParser) {
    this.coordinator = coordinator;
    this.numeric = numeric;
  }

  begin(gizmoPos: Vector3, projRef: Vector3) {
    this.vertexDrag = VertexSnappingUtility.isActive;
    this.projRef = projRef;
    const offset = ScaleMath.mouseOffset(gizmoPos, this.coordinator.wrap.virtualMousePosition);
    this.startMouseDistance = Math.max(offset.magnitude, 1e-3);
    this.startDirection = offset.sqrMagnitude > 1e-6 ? offset.normalized : Vector3.forward;
    this.prevRawRatio = 1;
    this.effectiveRatio = 1;
    this.ratioDelta = 0;
  }

  retarget(projRef: Vector3) {
    this.projRef = projRef;
  }

  endDrag() {
    this.vertexDrag = false;
  }

  apply() {
    const camera = GizmoRenderer.currentCamera();
    if (!camera) return;
    const c = this.coordinator;
    const start = c.pivotAtDragStart;
    const hit = ScreenDragSolver.tryCursorOnPlane(
      new Plane(camera.forward, start),
      HandleUtility.worldToGUIPoint(start),
      c.wrap.virtualMousePosition,
    );
    if (!hit) return;
    const offset = hit.sub(start);
    const sign = Vector3.dot(offset, this.startDirection) < 0 ? -1 : 1;
    let raw = (sign * offset.magnitude) / this.startMouseDistance;
    if (Math.abs(raw) < ScaleMath.MinRatio) raw = sign * ScaleMath.MinRatio;
    let rawDelta = raw - this.prevRawRatio;
    this.prevRawRatio = raw;
    const s = SharedGizmoSettings;
    if (s.PrecisionHeld) rawDelta *= s.EffectivePrecisionFactor;
    this.effectiveRatio += rawDelta;
    let ratio = this.effectiveRatio;
    // The accumulator stays unsnapped, so toggling the modifiers re-rounds from the true ratio.
    const snap = s.PrecisionHeld ? EditorSnapSettings.scale * 0.5 : EditorSnapSettings.scale;
    if (SnapCompat.scaleSnapEnabled && snap > 0) ratio = Mathf.Round(ratio / snap) * snap;
    if (Math.abs(ratio) < ScaleMath.MinRatio) ratio = (ratio < 0 ? -1 : 1) * ScaleMath.MinRatio;
    this.ratioDelta = ratio - 1;
    const kind = c.activeKind;
    const individual =
      IndividualOrigins.localAxes(c, this.numeric) && (kind === DragKind.ScaleAxis || kind === DragKind.ScalePlane);
    const axisFactor = ScaleMath.localAxisFactor(ratio, kind, c.activeAxis);
    // The HUD reports the dragged ratio, not per-axis factors that spread unevenly on rotated objects.
    const hudFactor = individual ? axisFactor : ScaleMath.localScaleFactors(ratio, kind, this.projRef);
    GizmoHud.setAbsoluteDelta(
      kind === DragKind.ScaleAxis
        ? new Vector3(this.ratioDelta, this.ratioDelta, this.ratioDelta)
        : hudFactor.sub(Vector3.one),
    );
    const { transforms, snapshots } = c.snapshot;
    const spread = this.spreadsPositions(transforms.length);
    c.snapshot.record('Scale');
    transforms.forEach((t, i) => {
      const factor = individual
        ? axisFactor
        : ScaleMath.localScaleFactors(ratio, kind, this.projRef, snapshots[i].rotation);
      t.localScale = snapshots[i].localScale.scale(factor);
      // Positions follow the same resize about the pivot, so the pivot (or snapped vertex) stays put.
      if (spread) {
        const off = snapshots[i].position.sub(start);
        const projRef = individual ? snapshots[i].rotation.mulV(c.activeAxis.unit) : this.projRef;
        t.position = start.add(off).add(ScaleMath.projectOntoDragSubspace(off, kind, projRef).mul(ratio - 1));
      }
    });
  }

  private spreadsPositions(count: number) {
    return this.vertexDrag || (count >= 2 && !IndividualOrigins.ownOrigins(this.coordinator));
  }

  applyNumeric(numeric: ModalNumericParser, referenceRotation: Quaternion) {
    const c = this.coordinator;
    const { transforms, snapshots } = c.snapshot;
    if (!transforms.length) return;
    const raw = numeric.currentParsedVector3;
    const factor = new Vector3(
      numeric.hasExplicitValue(GizmoAxis.X) ? raw.x : 1,
      numeric.hasExplicitValue(GizmoAxis.Y) ? raw.y : 1,
      numeric.hasExplicitValue(GizmoAxis.Z) ? raw.z : 1,
    );
    const individual = IndividualOrigins.localAxes(c, numeric);
    const pivot = c.pivotAtDragStart;
    const spread = this.spreadsPositions(transforms.length);
    c.snapshot.record('Scale');
    transforms.forEach((t, i) => {
      const local = individual
        ? factor
        : ScaleMath.localScaleFactorsAniso(factor, referenceRotation, snapshots[i].rotation);
      t.localScale = snapshots[i].localScale.scale(local);
      if (spread)
        t.position = pivot.add(
          anisoTransform(
            snapshots[i].position.sub(pivot),
            individual ? snapshots[i].rotation : referenceRotation,
            factor,
          ),
        );
    });
  }
}

export const ScaleDragOverlays = {
  draw(
    coordinator: GizmoDragCoordinator,
    settings: ScaleGizmoSettings,
    basis: AxisBasis,
    size: number,
    snap: number,
    vertexDrag: boolean,
    ratioDelta: number,
    headStyle: AxisHeadStyle,
    individualLocal: boolean,
  ) {
    if (Event.current.type !== EventType.Repaint) return;
    const shared = SharedGizmoSettings;
    const start = coordinator.pivotAtDragStart;
    const { transforms, snapshots } = coordinator.snapshot;
    const ghostSize = () => HandleUtility.getHandleSize(start) * shared.Size;
    switch (coordinator.activeKind) {
      case DragKind.ScaleAxis: {
        const axis = coordinator.activeAxis;
        const dir = basis.dir(axis);
        if (individualLocal)
          transforms.forEach((_, i) =>
            DrawOverlays.drawConstraintLine(
              snapshots[i].position,
              snapshots[i].rotation.mulV(axis.unit),
              axis.constrain,
            ),
          );
        else DrawOverlays.drawConstraintLine(start, dir, axis.constrain);
        if (shared.DragGhostsEnabled) drawGhostAxis(settings, start, dir, ghostSize(), headStyle);
        if (shared.SnapTicksEnabled && SnapCompat.scaleSnapEnabled && snap > 0) {
          const [o1, o2] = basis.otherDirs(axis);
          DrawOverlays.drawLinearSnapTicksStep(
            start,
            dir,
            DrawOverlays.bestSnapTickPerpendicular(o1, o2),
            settings.AxisLength * size * ratioDelta,
            settings.AxisLength * size * snap,
          );
        }
        break;
      }
      case DragKind.ScalePlane: {
        const [dir1, dir2] = basis.planeDirs(coordinator.activeAxis);
        if (individualLocal) {
          const [a1, a2] = AxisBasis.planeAxes(coordinator.activeAxis);
          transforms.forEach((_, i) =>
            DrawOverlays.drawPlaneConstraintLines(
              snapshots[i].position,
              coordinator.activeAxis,
              snapshots[i].rotation.mulV(a1.unit),
              snapshots[i].rotation.mulV(a2.unit),
            ),
          );
        } else DrawOverlays.drawPlaneConstraintLines(start, coordinator.activeAxis, dir1, dir2);
        if (shared.DragGhostsEnabled) {
          const g = ghostSize();
          DrawGhosts.drawGhostCenterDot(start, g);
          DrawGhosts.drawGhostPlane(
            start,
            dir1,
            dir2,
            coordinator.viewDirAtDragStart,
            g,
            settings.PlaneOffset,
            settings.PlaneSize,
            settings.PlaneOutlineThickness,
            settings.PlaneShape,
          );
        }
        if (shared.SnapTicksEnabled && SnapCompat.scaleSnapEnabled && snap > 0) {
          const dist = settings.PlaneOffset * size * ratioDelta;
          const step = settings.PlaneOffset * size * snap;
          DrawOverlays.drawLinearSnapTicksStep(start, dir1, dir2, dist, step);
          DrawOverlays.drawLinearSnapTicksStep(start, dir2, dir1, dist, step);
        }
        break;
      }
      case DragKind.ScaleRing: {
        if (!shared.DragGhostsEnabled) break;
        const g = ghostSize();
        DrawGhosts.drawGhostCenterDot(start, g);
        if (vertexDrag) {
          Handles.color = GizmoColors.Ghost;
          DrawPrimitives.drawScreenSquare(
            start,
            coordinator.activeViewNormal,
            g * settings.ScreenRingRadius,
            shared.ScreenRingThickness,
          );
        } else
          DrawGhosts.drawGhostRing(
            start,
            g,
            settings.ScreenRingRadius,
            shared.ScreenRingThickness,
            coordinator.activeViewNormal,
          );
        break;
      }
    }
  },
};

function drawGhostAxis(
  settings: ScaleGizmoSettings,
  origin: Vector3,
  dir: Vector3,
  size: number,
  headStyle: AxisHeadStyle,
) {
  const tip = origin.add(dir.mul(settings.AxisLength * size));
  const head = settings.AxisHeadSize * size;
  DrawGhosts.drawGhostCenterDot(origin, size);
  Handles.color = GizmoColors.Ghost;
  DrawPrimitives.drawThickLine(origin, tip, settings.AxisThickness * SharedGizmoSettings.Size);
  Handles.color = withFade(GizmoColors.Ghost, 0.9);
  if (settings.AxisHeadFlat) headStyle.drawHeadFlat(tip, dir, head);
  else headStyle.drawHead(0, tip, dir, Quaternion.lookRotation(dir), head, EventType.Repaint);
}
