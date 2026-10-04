// AxisHandle (one gizmo arrow/box shaft) with its two tip styles, ConeAxisHead and CubeAxisHead.
import { EditorSnapSettings } from '../../../unity/editor.ts';
import { EditorGUI, HandleUtility, Handles } from '../../../unity/handles.ts';
import { Event, EventType, FocusType, GUIUtility } from '../../../unity/imgui.ts';
import { Mathf, Quaternion, Vector3 } from '../../../unity/math.ts';
import { withAlpha, withFade } from '../../color.ts';
import { SceneTutorial, SelectionCache } from '../../foundation.ts';
import { GizmoAxis } from '../axis.ts';
import { InactiveAxisFade, MinVisibleFade } from '../colors.ts';
import type { GizmoSettings } from '../common/gizmo-settings.ts';
import { Signal } from '../common/signal.ts';
import { DragKind, type GizmoDragCoordinator } from '../core/drag.ts';
import { MoveSnap } from '../core/move-snap.ts';
import { ModalNumericParser } from '../core/numeric.ts';
import { ScreenDragSolver } from '../core/screen-drag-solver.ts';
import { AxisLabelDrawer, DrawOverlays } from '../overlays.ts';
import { DrawPrimitives, GizmoRenderer } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';
import { VertexGrab } from './vertex-grab.ts';

export interface AxisHeadStyle {
  drawHeadFlat(tip: Vector3, direction: Vector3, headSize: number): void;
  drawHead(
    controlId: number,
    tip: Vector3,
    direction: Vector3,
    rotation: Quaternion,
    headSize: number,
    eventType: EventType,
  ): void;
}

// Length-to-half-width ratio of the flat arrowhead.
const ArrowTipRatio = 3;

export const ConeAxisHead: AxisHeadStyle = {
  drawHeadFlat(tip, direction, headSize) {
    const triangleCount = Math.trunc(Mathf.Lerp(8, 48, SharedGizmoSettings.Quality / 8));
    let perp = Vector3.cross(direction, GizmoRenderer.cameraNormal());
    if (perp.sqrMagnitude > 1e-6) {
      perp = perp.normalized;
      const arrowTip = tip.add(direction.mul(headSize * 1.2));
      const radius = headSize / ArrowTipRatio;
      const angleStep = 360 / triangleCount;
      const first = tip.add(perp.mul(radius));
      let prev = first;
      // The cone shell as a fan around the shaft.
      for (let i = 1; i <= triangleCount; i++) {
        const next =
          i === triangleCount
            ? first
            : tip.add(
                Quaternion.angleAxis(i * angleStep, direction)
                  .mulV(perp)
                  .mul(radius),
              );
        DrawPrimitives.drawTriangle(arrowTip, prev, next);
        prev = next;
      }
    }
    // A base disc hides the fan's otherwise visible flat edge.
    DrawPrimitives.drawAASolidDisc(tip, direction, (headSize / ArrowTipRatio) * 0.95);
  },
  drawHead(controlId, tip, direction, rotation, headSize, eventType) {
    Handles.coneHandleCap(controlId, tip.add(direction.mul(headSize / 2)), rotation, headSize, eventType);
  },
};

const HeadBoxScale = 0.5;

export const CubeAxisHead: AxisHeadStyle = {
  drawHeadFlat(tip, direction, headSize) {
    if (direction.sqrMagnitude <= 1e-6) return;
    const f = direction.normalized;
    // A stable non-parallel axis, so the box never turns with the camera.
    const ortho = Math.abs(f.y) < 0.9 ? Vector3.up : Vector3.forward;
    const r = Vector3.cross(f, ortho).normalized;
    const u = Vector3.cross(r, f).normalized;
    const h = headSize * 0.5 * HeadBoxScale;
    const c = tip.add(f.mul(h));
    const p = (sf: number, su: number, sr: number) =>
      c
        .add(f.mul(sf * h))
        .add(u.mul(su * h))
        .add(r.mul(sr * h));
    const fUR = p(1, 1, 1),
      fUL = p(1, 1, -1),
      fDR = p(1, -1, 1),
      fDL = p(1, -1, -1);
    const bUR = p(-1, 1, 1),
      bUL = p(-1, 1, -1),
      bDR = p(-1, -1, 1),
      bDL = p(-1, -1, -1);
    DrawPrimitives.drawQuad(fUL, fUR, fDR, fDL);
    DrawPrimitives.drawQuad(bUR, bUL, bDL, bDR);
    DrawPrimitives.drawQuad(fUL, bUL, bUR, fUR);
    DrawPrimitives.drawQuad(fDL, bDL, bDR, fDR);
    DrawPrimitives.drawQuad(fUR, bUR, bDR, fDR);
    DrawPrimitives.drawQuad(bUL, fUL, fDL, bDL);
  },
  drawHead(controlId, tip, direction, rotation, headSize, eventType) {
    Handles.cubeHandleCap(controlId, tip.add(direction.mul(headSize / 2)), rotation, headSize, eventType);
  },
};

export class AxisHandle {
  static readonly NoControl = -1;

  readonly axis: GizmoAxis;
  private readonly coordinator: GizmoDragCoordinator;
  private readonly headStyle: AxisHeadStyle;
  private readonly kind: DragKind;
  private readonly vertexGrab = new VertexGrab();
  private axisOffsetFraction = 0;
  private dragDirection = Vector3.zero;
  // Drag state frozen at the press: the position is rebuilt from the unwrapped virtual cursor.
  private dragPivot = Vector3.zero;
  private fade = 1;
  // Unsnapped distance along the axis, advanced by precision-scaled increments of the reading.
  private freeDistance = 0;
  private freeReading = 0;
  private hasSnapVertex = false;
  private hidden = false;
  private lastPrecision = 1;
  private origin = Vector3.zero;
  private settings!: GizmoSettings;
  private snapVertex = Vector3.zero;
  // Where this handle last drove the gizmo; an unreadable frame holds it.
  private target = Vector3.zero;

  readonly dragStarted = new Signal<[Vector3]>();
  readonly dragged = new Signal<[Vector3]>();
  readonly dragEnded = new Signal();

  constructor(
    axis: GizmoAxis,
    headStyle: AxisHeadStyle,
    coordinator: GizmoDragCoordinator,
    kind: DragKind = DragKind.Axis,
  ) {
    this.axis = axis;
    this.headStyle = headStyle;
    this.coordinator = coordinator;
    this.kind = kind;
  }

  draw(
    settings: GizmoSettings,
    position: Vector3,
    direction: Vector3,
    size: number,
    offsetFraction: number,
    snap: number,
    viewDir: Vector3,
    extraShaftOffset = 0,
    hidden = false,
    moveSnap: MoveSnap = MoveSnap.none,
  ): Vector3 {
    // The id is taken before any early-out so ids stay stable while a hidden handle is dragged.
    const id = GUIUtility.getControlID(FocusType.Passive);
    const dragging = GUIUtility.hotControl === id;
    const fade = dragging ? 1 : GizmoRenderer.axisFade(direction, viewDir, SharedGizmoSettings.ThresholdDegrees);
    if (fade < MinVisibleFade) return Vector3.zero;
    this.settings = settings;
    this.origin = position;
    this.fade = fade;
    this.axisOffsetFraction = offsetFraction;
    this.hidden = hidden;
    const start = position.add(direction.mul(offsetFraction * settings.AxisLength * size + extraShaftOffset));
    const snapshot = this.coordinator.snapshot;
    const wasActive = snapshot.activeDragId === id;
    // Captured before the slider rewrites the event to Used.
    const dragEvent = Event.current.type === EventType.MouseDrag;
    EditorGUI.beginChangeCheck();
    const suppressedAlt = GizmoRenderer.beginAltGrabOverride(id);
    const raw = Handles.slider(id, start, direction, size, this.capFunction, snap);
    GizmoRenderer.endAltGrabOverride(suppressedAlt);
    const changed = EditorGUI.endChangeCheck();
    const moved = changed || (dragEvent && GUIUtility.hotControl === id);
    const snapping = moveSnap.valid ? moveSnap.active : EditorSnapSettings.snapEnabled;
    const precision =
      SharedGizmoSettings.PrecisionHeld && !moveSnap.pickDriven && (moveSnap.valid || !snapping)
        ? SharedGizmoSettings.EffectivePrecisionFactor
        : 1;
    if (moved && GUIUtility.hotControl === id) {
      SceneTutorial.report('HandleAxisDrag');
      SceneTutorial.noteDragModifiers(snapping, SharedGizmoSettings.PrecisionHeld);
    }
    // A move drag owns its position: rebuilt from the virtual cursor, quantised as an absolute distance.
    let target = raw;
    if (moveSnap.valid && GUIUtility.hotControl === id) {
      if (!wasActive) this.target = position;
      else if (!Mathf.Approximately(precision, this.lastPrecision)) this.rebaseGrip();
      if (wasActive && moved) {
        const vertex =
          VertexSnappingUtility.snapsToTarget && !ModalNumericParser.anyNumericInput && this.kind !== DragKind.ScaleAxis
            ? VertexSnappingUtility.tryGetNearestOtherVertex()
            : null;
        if (vertex) {
          this.snapVertex = vertex;
          this.hasSnapVertex = true;
          const carried = this.vertexGrab.track(
            position,
            SelectionCache.deep,
            this.coordinator.wrap.projectionMousePosition,
            this.coordinator.vertexSnapAtDragStart,
          );
          this.freeDistance = VertexGrab.distanceAlongAxis(
            vertex.sub(carried).sub(this.dragPivot),
            this.dragDirection,
            this.axis,
          );
          // Keeps the reading in step so releasing V continues from the vertex.
          const reading = this.tryAxisReading();
          if (reading != null) this.freeReading = reading;
          this.target = this.dragPivot.add(this.dragDirection.mul(this.freeDistance));
          // The target is absolute; the step onto it starts from where the objects actually are.
          snapshot.rebaseRaw(position);
        } else {
          this.hasSnapVertex = false;
          const reading = this.tryAxisReading();
          if (reading != null) {
            this.freeDistance += (reading - this.freeReading) * precision;
            this.freeReading = reading;
            this.target = this.dragPivot.add(
              this.dragDirection.mul(moveSnap.snapAlong(this.dragPivot, this.dragDirection, this.freeDistance)),
            );
          }
        }
      }
      this.lastPrecision = precision;
      target = this.target;
    }
    if (
      dragging &&
      this.hasSnapVertex &&
      VertexSnappingUtility.snapsToTarget &&
      !ModalNumericParser.anyNumericInput &&
      Event.current.type === EventType.Repaint &&
      this.snapsOnCurrentConstraint()
    )
      DrawOverlays.drawAxisAlignedConnector(position, this.snapVertex);
    // A tracked target is already precision-scaled; the snapshot only diffs it.
    const delta = snapshot.preciseDelta(id, target, moved, moveSnap.valid ? 1 : precision);
    if (!wasActive && snapshot.activeDragId === id) {
      this.coordinator.begin(this.kind, position, this.axis);
      this.dragPivot = position;
      this.dragDirection = direction;
      this.freeDistance = 0;
      this.target = position;
      this.hasSnapVertex = false;
      this.lastPrecision = precision;
      this.vertexGrab.release();
      // The grip was taken against this pivot, so zero solves the reading exactly.
      this.freeReading = 0;
      this.dragStarted.invoke(direction);
    }
    if (wasActive && snapshot.activeDragId !== id) {
      this.coordinator.end();
      this.dragEnded.invoke();
      this.coordinator.clickGate.endHandleDrag(() => snapshot.cancel());
    }
    if (GUIUtility.hotControl === id && moved) this.dragged.invoke(delta);
    return delta;
  }

  // A mid-drag X/Y/Z press can leave this handle hot while another constraint drives.
  private snapsOnCurrentConstraint() {
    return this.coordinator.activeKind === DragKind.Axis || this.coordinator.activeKind === DragKind.Plane;
  }

  private tryAxisReading(): number | null {
    const targetScreen = this.coordinator.wrap.virtualMousePosition.add(this.coordinator.screenGrip);
    return ScreenDragSolver.trySolveAxis(this.dragPivot, this.dragDirection, targetScreen, this.freeReading);
  }

  private rebaseGrip() {
    // After a mid-drag axis switch the manual path owns the grip.
    if (this.coordinator.retargeted) return;
    this.coordinator.rebaseScreenGrip(this.dragPivot.add(this.dragDirection.mul(this.freeDistance)));
    this.freeReading = this.freeDistance;
  }

  drawMirrored(
    settings: GizmoSettings,
    position: Vector3,
    direction: Vector3,
    size: number,
    offsetFraction: number,
    extraShaftOffset = 0,
  ) {
    if (Event.current.type !== EventType.Repaint) return;
    if (this.coordinator.activeKind !== this.kind || this.coordinator.activeAxis !== this.axis) return;
    this.drawRepaintOnly(settings, position, direction, size, offsetFraction, extraShaftOffset, 0, 1);
  }

  drawStatic(
    settings: GizmoSettings,
    position: Vector3,
    direction: Vector3,
    size: number,
    offsetFraction: number,
    viewDir: Vector3,
  ) {
    if (Event.current.type !== EventType.Repaint) return;
    const fade = GizmoRenderer.axisFade(direction, viewDir, SharedGizmoSettings.ThresholdDegrees);
    if (fade < MinVisibleFade) return;
    this.drawRepaintOnly(settings, position, direction, size, offsetFraction, 0, AxisHandle.NoControl, fade);
  }

  private drawRepaintOnly(
    settings: GizmoSettings,
    position: Vector3,
    direction: Vector3,
    size: number,
    offsetFraction: number,
    extraShaftOffset: number,
    controlId: number,
    fade: number,
  ) {
    this.settings = settings;
    this.origin = position;
    this.fade = fade;
    this.axisOffsetFraction = offsetFraction;
    this.hidden = false;
    const capPosition = position.add(direction.mul(offsetFraction * settings.AxisLength * size + extraShaftOffset));
    this.capFunction(controlId, capPosition, Quaternion.lookRotation(direction), size, EventType.Repaint);
  }

  private readonly capFunction = (
    controlId: number,
    capPosition: Vector3,
    rotation: Quaternion,
    size: number,
    eventType: EventType,
  ) => {
    const s = this.settings;
    const direction = rotation.mulV(Vector3.forward);
    const tip = capPosition.add(direction.mul(s.AxisLength * size * (1 - this.axisOffsetFraction)));
    const head = s.AxisHeadSize * size;
    // The id and slider still run while hidden, so a drag in progress is untouched.
    if (this.hidden) return;
    switch (eventType) {
      case EventType.Repaint: {
        const c = this.coordinator;
        const axisActive = c.activeKind === this.kind && c.activeAxis === this.axis;
        const otherDragActive = c.activeKind !== DragKind.None && !axisActive;
        // Move keeps idle axes dimmed as a reference during any drag; Scale hides them.
        if (otherDragActive && !s.DimIdleAxesDuringDrag) return;
        const axisHover = !axisActive && GUIUtility.hotControl === 0 && HandleUtility.nearestControl === controlId;
        Handles.color = withFade(
          axisActive ? this.axis.active : axisHover ? this.axis.hover : this.axis.color,
          this.fade * (otherDragActive ? InactiveAxisFade : 1),
        );
        const thickness = axisActive ? s.AxisThicknessActive : axisHover ? s.AxisThicknessHover : s.AxisThickness;
        const shaftStart = axisActive ? this.origin : capPosition;
        DrawPrimitives.drawThickLine(shaftStart, tip, thickness * SharedGizmoSettings.Size);
        // Applied over the shaft's own alpha, not multiplied with it.
        const headOpacity = s.AxisHeadOpacityOverride;
        if (headOpacity != null) Handles.color = withAlpha(Handles.color, headOpacity);
        if (s.AxisHeadFlat) this.headStyle.drawHeadFlat(tip, direction, head);
        else this.headStyle.drawHead(controlId, tip, direction, rotation, head, eventType);
        if (axisActive && SharedGizmoSettings.AxisLabelsEnabled) {
          const dir = this.axis === GizmoAxis.Y ? Vector3.left : Vector3.up;
          const offset = dir.mul(Mathf.Lerp(0.1, 0.13, s.AxisThickness / 10) * size);
          AxisLabelDrawer.draw(this.origin.add(tip).div(2).add(offset), this.axis.label, this.axis.active);
        }
        break;
      }
      case EventType.Layout:
      case EventType.MouseMove: {
        // The whole drawn width is clickable, not just the centre line.
        const lineDist = HandleUtility.distanceToLine(capPosition, tip);
        const halfThickness = s.AxisThicknessHover * SharedGizmoSettings.Size * 0.5;
        HandleUtility.addControl(controlId, Math.max(0, lineDist - halfThickness));
        this.headStyle.drawHead(controlId, tip, direction, rotation, head, eventType);
        break;
      }
    }
  };
}
