// TransformGizmo: Move, Rotate and Scale on one shared drag, like Blender's combined gizmo.
import { Tool } from '../../../unity/editor.ts';
import type { SceneView } from '../../../unity/sceneview.ts';
import { GeneralSettings, sBool } from '../../settings.ts';
import { GizmoController } from '../common/controller.ts';
import { DragKind, GizmoDragCoordinator } from '../core/drag.ts';
import { MoveGizmo } from '../move/move-gizmo.ts';
import { TransformMoveSettings } from '../move/settings.ts';
import { RotateGizmo } from '../rotate/rotate-gizmo.ts';
import { TransformRotateSettings } from '../rotate/settings.ts';
import { ScaleGizmo } from '../scale/scale-gizmo.ts';
import { TransformScaleSettings } from '../scale/settings.ts';
import { SelectionPivot } from '../selection-pivot.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';

export class TransformGizmoSettings {
  readonly Move = new TransformMoveSettings(MoveGizmo.instance.settings);
  readonly Rotate = new TransformRotateSettings(RotateGizmo.instance.settings);
  readonly Scale = new TransformScaleSettings(ScaleGizmo.instance.settings);

  get Enabled() {
    return GeneralSettings.Enabled && sBool('TransformGizmoSettings.Enabled', true);
  }
}

export class TransformGizmo extends GizmoController {
  readonly settings = new TransformGizmoSettings();
  private readonly move: MoveGizmo;
  private readonly rotate: RotateGizmo;
  private readonly scale: ScaleGizmo;

  private static _instance: TransformGizmo | null = null;
  static get instance() {
    return (TransformGizmo._instance ??= new TransformGizmo());
  }

  private constructor() {
    super(new GizmoDragCoordinator());
    this.move = new MoveGizmo(this.settings.Move, this.coordinator);
    this.rotate = new RotateGizmo(this.settings.Rotate, this.coordinator);
    this.scale = new ScaleGizmo(this.settings.Scale, this.coordinator);
    this.subscribeSceneGui();
  }

  protected get toolType() {
    return Tool.Transform;
  }
  protected get enabled() {
    return this.settings.Enabled;
  }
  protected override get altArmed() {
    const s = this.settings;
    return (s.Rotate.Enabled && this.rotate.lookAtArmed) || (s.Move.Enabled && this.move.surfaceSnapArmed);
  }

  // Each drag defers to its owning part, which knows how to stay on the grabbed pivot or vertex.
  gizmoPosition() {
    switch (this.coordinator.activeKind) {
      case DragKind.Axis:
      case DragKind.Plane:
      case DragKind.FreeRing:
        return this.move.gizmoPosition();
      case DragKind.Ring:
      case DragKind.Trackball:
        return this.rotate.gizmoPosition();
      case DragKind.ScaleAxis:
      case DragKind.ScalePlane:
      case DragKind.ScaleRing:
        return this.scale.gizmoPosition();
      default:
        return SelectionPivot.getPosition(SharedGizmoSettings.PivotPoint);
    }
  }

  drawHandles(sceneView: SceneView, isOwner: boolean) {
    // Draw order is z-order and tie-break pick priority: arrows at the back, boxes above, rings on top.
    // The arrows still run (hidden) during a rotate or scale drag so the ids after them never shift.
    const k = this.coordinator.activeKind;
    const rotatingOrScaling =
      k === DragKind.Ring ||
      k === DragKind.Trackball ||
      k === DragKind.ScaleAxis ||
      k === DragKind.ScalePlane ||
      k === DragKind.ScaleRing;
    const s = this.settings;
    if (s.Move.Enabled) this.move.drawHandles(sceneView, isOwner, rotatingOrScaling);
    if (s.Scale.Enabled) this.scale.drawHandles(sceneView, isOwner);
    if (s.Rotate.Enabled) this.rotate.drawHandles(sceneView, isOwner);
  }

  // The HUD and its numeric session belong to whichever part owns the drag.
  override drawHud(sceneView: SceneView) {
    switch (this.coordinator.activeKind) {
      case DragKind.Ring:
      case DragKind.Trackball:
        this.rotate.drawHud(sceneView);
        break;
      case DragKind.ScaleAxis:
      case DragKind.ScalePlane:
      case DragKind.ScaleRing:
        this.scale.drawHud(sceneView);
        break;
      default:
        this.move.drawHud(sceneView);
    }
  }
}
