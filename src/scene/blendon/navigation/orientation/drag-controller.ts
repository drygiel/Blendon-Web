// OrientationGizmoElement + GizmoDragController: the orientation gizmo's state and pointer handling.
// The page feeds it pointer events in element-local points; it paints into a 2D context.
import { Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import type { SceneView } from '../../../unity/sceneview.ts';
import { SceneTutorial } from '../../foundation.ts';
import { GeneralSettings } from '../../settings.ts';
import { TurntableOrbit } from '../camera.ts';
import { OrbitSelected, OrbitSelectedSettings } from '../orbit-selected.ts';
import { ViewAlignment, ViewSnap, WorldAxes } from '../view-snap.ts';
import { AxisHitTest, AxisProjection, GizmoGeometry, GizmoPainter, OrientationGizmoSettings, type AxisEntry } from './gizmo.ts';

const DragThresholdPixels = 3;
let anyDragging = false;

export class OrientationGizmoElement {
  readonly view: SceneView;
  private entries: AxisEntry[] = [];
  private projectedRotation: Quaternion | null = null;
  private centerHovered = false;
  private hoverIndex = -1;
  hovered = false;
  // Drag state.
  private pressed = false;
  private downPosition = Vector2.zero;
  private dragStartPivot = Vector3.zero;
  private dragStartRotation = Quaternion.identity;
  private orbitCenter = Vector3.zero;
  isDragging = false;
  /** Set when anything the painter shows changed. */
  onDirty: () => void = () => {};

  constructor(view: SceneView) {
    this.view = view;
  }

  static get anyDragging() {
    return anyDragging;
  }

  private get settings() {
    return OrientationGizmoSettings;
  }

  get isInteractive() {
    return this.settings.Enabled;
  }

  /** Overlay size in points: the circle plus the view-name strip under it. */
  get size() {
    const w = Math.max(2, this.settings.Radius * 2);
    return new Vector2(w, w + this.settings.DirectionLabelAreaHeight);
  }

  geometry(width: number, height: number) {
    return GizmoGeometry.resolve(width, height);
  }

  private ensureProjection() {
    const r = this.view.rotation;
    if (this.projectedRotation && this.projectedRotation.equals(r)) return;
    this.entries = AxisProjection.project(r);
    this.projectedRotation = r;
  }

  hitTestHandle(local: Vector2, g: GizmoGeometry) {
    if (!this.isInteractive || this.view.isRotationLocked) return -1;
    this.ensureProjection();
    return AxisHitTest.handle(this.entries, local, g);
  }

  hitTestCenter(local: Vector2, g: GizmoGeometry) {
    if (!this.isInteractive) return false;
    this.ensureProjection();
    return !AxisHitTest.isCenterOccluded(this.entries) && AxisHitTest.center(local, g);
  }

  containsPoint(local: Vector2, g: GizmoGeometry) {
    return local.sub(g.center).sqrMagnitude <= g.outerRadius * g.outerRadius;
  }

  updateHover(local: Vector2, g: GizmoGeometry) {
    const center = this.settings.CenterCircleEnabled && this.hitTestCenter(local, g);
    const index = center ? -1 : this.hitTestHandle(local, g);
    if (center === this.centerHovered && index === this.hoverIndex) return;
    this.centerHovered = center;
    this.hoverIndex = index;
    this.onDirty();
  }

  setHovered(on: boolean) {
    if (this.hovered === on) return;
    this.hovered = on;
    if (!on) {
      this.hoverIndex = -1;
      this.centerHovered = false;
    }
    this.onDirty();
  }

  paint(ctx: CanvasRenderingContext2D, g: GizmoGeometry) {
    if (!this.isInteractive) return;
    this.ensureProjection();
    // No axis ball lights up while the centre circle is hovered.
    const highlight = this.hovered && !this.isDragging && !this.centerHovered ? this.hoverIndex : -1;
    GizmoPainter.draw(ctx, this.entries, g, {
      highlightIndex: highlight,
      hovered: this.hovered,
      centerHovered: this.centerHovered,
      orthographic: this.view.orthographic,
      rotationLocked: this.view.isRotationLocked,
    });
  }

  /** The aligned view's name, or '' when looking along no axis exactly. */
  get directionLabel() {
    const d = ViewAlignment.exactDirection(this.view);
    return d >= 0 ? WorldAxes.Directions[d].name : '';
  }

  // ---- GizmoDragController ----

  /** True when the press is the gizmo's (the page captures the pointer then). */
  pointerDown(button: number, local: Vector2, g: GizmoGeometry) {
    if (!this.settings.Enabled || !this.containsPoint(local, g)) return false;
    // Blender's gizmo toggles projection on a plain middle click.
    if (button === 1 && this.settings.MiddleClickTogglesProjection) {
      ViewSnap.toggleProjection(this.view, this.settings.AnimationEnabled);
      return false;
    }
    if (button !== 0) return false;
    this.pressed = true;
    this.downPosition = local;
    this.isDragging = false;
    anyDragging = false;
    return true;
  }

  pointerMove(local: Vector2, g: GizmoGeometry, rightHeld: boolean) {
    if (!this.pressed) {
      this.updateHover(local, g);
      return;
    }
    if (rightHeld && GeneralSettings.RmbCancelEnabled) {
      this.cancel();
      return;
    }
    const delta = local.sub(this.downPosition);
    const v = this.view;
    if (!this.isDragging) {
      if (delta.magnitude <= DragThresholdPixels) return;
      if (!this.settings.OrbitEnabled || v.isRotationLocked) return;
      this.isDragging = true;
      anyDragging = true;
      this.dragStartRotation = v.rotation;
      this.dragStartPivot = v.pivot;
      this.orbitCenter = OrbitSelected.resolveOrbitCenter(v);
    }
    const o = OrbitSelectedSettings;
    const rotation = TurntableOrbit.rotate(this.dragStartRotation, delta, o.HorizontalOrbitDegreesPerPixel, o.VerticalTiltDegreesPerPixel);
    v.pivot = TurntableOrbit.pivotAround(this.orbitCenter, this.dragStartPivot.sub(this.orbitCenter), this.dragStartRotation, rotation);
    v.rotation = rotation;
    v.repaint();
    this.onDirty();
  }

  pointerUp(local: Vector2, g: GizmoGeometry) {
    if (!this.pressed) return;
    if (!this.isDragging) this.click(local, g);
    this.reset();
  }

  /** A press that never crossed the drag threshold: the centre toggles projection, a handle snaps to its view. */
  private click(local: Vector2, g: GizmoGeometry) {
    const s = this.settings;
    if (s.CenterCircleEnabled && this.hitTestCenter(local, g)) {
      ViewSnap.toggleProjection(this.view, s.AnimationEnabled);
      return;
    }
    const index = this.hitTestHandle(local, g);
    if (index < 0) return;
    const e = this.entries[index];
    ViewSnap.toHandle(this.view, e.axisIndex, e.isPositive, s.AnimationEnabled);
    SceneTutorial.report('OrientationGizmoClick');
  }

  keyEscape() {
    if (!this.isDragging) return false;
    this.cancel();
    return true;
  }

  cancel() {
    if (this.isDragging) {
      this.view.pivot = this.dragStartPivot;
      this.view.rotation = this.dragStartRotation;
      this.view.repaint();
    }
    this.reset();
  }

  private reset() {
    this.pressed = false;
    this.isDragging = false;
    anyDragging = false;
    this.onDirty();
  }

  toggleProjection() {
    ViewSnap.toggleProjection(this.view, this.settings.AnimationEnabled);
  }

  toggleRotationLock() {
    this.view.isRotationLocked = !this.view.isRotationLocked;
    this.view.repaint();
    this.onDirty();
  }
}

/** Whether any orientation gizmo drag is running, for the navigation state. */
export const GizmoDragController = {
  get anyDragging() {
    return anyDragging;
  },
};
