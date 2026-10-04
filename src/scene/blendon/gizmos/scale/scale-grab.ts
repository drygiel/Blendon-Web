// ScaleGrab: S scales the selection by the cursor's distance from the pivot.
import {
  EditorSnapSettings,
  PivotRotation,
  ShortcutManager,
  Tool,
  Tools,
  type ShortcutArguments,
} from '../../../unity/editor.ts';
import { HandleUtility, MouseCursor } from '../../../unity/handles.ts';
import { Event, EventType } from '../../../unity/imgui.ts';
import { Vector3 } from '../../../unity/math.ts';
import type { SceneCamera, SceneView } from '../../../unity/sceneview.ts';
import { ShortcutTips } from '../../foundation.ts';
import { GizmoAxis } from '../axis.ts';
import { GrabSession, IndividualOrigins } from '../common/controller.ts';
import { AxisBasis } from '../common/layout.ts';
import { DragKind, GizmoDragCoordinator } from '../core/drag.ts';
import { ModalNumericState } from '../core/numeric.ts';
import { CubeAxisHead } from '../handles/axis-handle.ts';
import { GizmoHud } from '../hud.ts';
import { DrawOverlays } from '../overlays.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { ScaleDragOverlays, ScaleDragSession, ScaleMath } from './scale-parts.ts';
import { ScaleGizmo } from './scale-gizmo.ts';

export class ScaleGrab extends GrabSession {
  static readonly ShortcutId = 'Blendon/Grab Scale';
  private readonly session: ScaleDragSession;

  private static _instance: ScaleGrab | null = null;
  static get instance() {
    return (ScaleGrab._instance ??= new ScaleGrab());
  }

  private constructor() {
    super(new GizmoDragCoordinator());
    this.session = new ScaleDragSession(this.coordinator, this.numeric);
    this.numeric.defaultSpaceIsLocal = () =>
      ScaleGrab.settings.AxisForceLocalOrientation || Tools.pivotRotation === PivotRotation.Local;
    this.subscribeSceneGui();
  }

  static install() {
    ShortcutManager.register(
      ScaleGrab.ShortcutId,
      (args: ShortcutArguments) => {
        ScaleGrab.instance.request(args);
        ShortcutTips.note(ScaleGrab.ShortcutId);
      },
      false,
      'S',
    );
  }

  private static get settings() {
    return ScaleGizmo.instance.settings;
  }
  protected get bindingId() {
    return ScaleGrab.ShortcutId;
  }
  protected get enabled() {
    return ScaleGrab.settings.Enabled;
  }
  protected get toolType() {
    return Tool.Scale;
  }
  protected get grabKind() {
    return DragKind.ScaleRing;
  }
  protected get dragCursor() {
    return MouseCursor.ScaleArrow;
  }
  // Blender's S 2 scales uniformly, so an unconstrained typed factor reaches every axis.
  protected override get numericSeedAxis() {
    return GizmoAxis.Screen;
  }

  protected ownsDragKind(kind: DragKind) {
    return kind === DragKind.ScaleAxis || kind === DragKind.ScalePlane || kind === DragKind.ScaleRing;
  }

  gizmoPosition() {
    return this.coordinator.pivotAtDragStart;
  }

  protected override localSpaceRotation() {
    return ScaleMath.objectRotation();
  }

  protected override defaultSpaceRotation() {
    return ScaleGrab.settings.AxisForceLocalOrientation ? ScaleMath.objectRotation() : Tools.handleRotation;
  }

  protected onSessionBegan(_sceneView: SceneView, _camera: SceneCamera, pivot: Vector3) {
    GizmoHud.startFreeDrag(true);
    this.session.begin(pivot, Vector3.zero);
  }

  protected followCursor() {
    this.session.apply();
  }

  protected applyNumeric() {
    this.session.applyNumeric(
      this.numeric,
      this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit),
    );
  }

  protected onConstraintChanged() {
    const c = this.coordinator;
    const live = () =>
      this.numeric.state === ModalNumericState.NumericInput ? this.applyNumeric() : this.session.apply();
    if (this.numeric.isUnconstrained) {
      c.retarget(this.grabKind, GizmoAxis.X);
      this.session.retarget(Vector3.zero);
      GizmoHud.startFreeDrag(true);
      live();
      return;
    }
    const [kind, axis] = this.numeric.resolveDragTarget();
    c.retarget(kind === DragKind.Axis ? DragKind.ScaleAxis : DragKind.ScalePlane, axis);
    const basis = new AxisBasis(this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit));
    if (kind === DragKind.Axis) {
      const dir = basis.dir(axis);
      this.session.retarget(dir.normalized);
      GizmoHud.startAxisDrag(axis, dir, true);
    } else {
      const [dir1, dir2] = basis.planeDirs(axis);
      const [axis1, axis2] = AxisBasis.planeAxes(axis);
      this.session.retarget(Vector3.cross(dir1, dir2).normalized);
      GizmoHud.startPlaneDrag(axis1, dir1, axis2, dir2, true);
    }
    live();
  }

  protected drawSessionOverlays(sceneView: SceneView, isOwner: boolean) {
    const c = this.coordinator;
    const position = c.pivotAtDragStart;
    const basis = new AxisBasis(this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit));
    const size = HandleUtility.getHandleSize(position) * SharedGizmoSettings.Size;
    ScaleDragOverlays.draw(
      c,
      ScaleGrab.settings,
      basis,
      size,
      EditorSnapSettings.scale,
      this.session.vertexDrag,
      this.session.ratioDelta,
      CubeAxisHead,
      IndividualOrigins.localAxes(c, this.numeric),
    );
    if (isOwner && Event.current.type === EventType.Repaint)
      DrawOverlays.drawCursorLineToGui(position, sceneView.camera, c.wrap.virtualMousePosition);
  }

  protected override endSession() {
    super.endSession();
    this.session.endDrag();
  }
}
