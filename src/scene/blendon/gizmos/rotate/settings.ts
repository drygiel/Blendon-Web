// RotateGizmoSettings, and the Transform gizmo's rotate part which follows it for behaviour.
import { ColorDefaults } from '../../color.ts';
import type { ModifierKey } from '../../foundation.ts';
import { sColor, sModifier } from '../../settings.ts';
import { GizmoSettings, type GizmoDefaults } from '../common/gizmo-settings.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';

export class RotateGizmoSettings extends GizmoSettings {
  constructor(cls = 'RotateGizmoSettings', defaults: GizmoDefaults = {}) {
    super(cls, { screenRingRadius: 1, axisThickness: 1.6, ...defaults });
  }

  get RingDepthGradientEnabled() {
    return this.bool('RingDepthGradientEnabled', true);
  }
  get RotateToCursorEnabled() {
    return this.bool('RotateToCursorEnabled', true);
  }
  get LookAtEnabled() {
    return this.bool('LookAtEnabled', true);
  }
  /** Follows the shared Aim key until this page overrides it. */
  get LookAtModifier(): ModifierKey {
    return sModifier(`${this.cls}.LookAtModifier`, SharedGizmoSettings.AimModifier);
  }
  get ScreenRingEnabled() {
    return this.bool('ScreenRingEnabled', true);
  }
  get ScreenRingColor() {
    return sColor(`${this.cls}.ScreenRingColor`, ColorDefaults.ScreenRingColorDefault);
  }
  get TrackballEnabled() {
    return this.bool('TrackballEnabled', true);
  }
  get TrackballRadius() {
    return this.num('TrackballRadius', 0.835);
  }
  get TrackballOpacity() {
    return this.num('TrackballOpacity', 0.11);
  }
  get AngleArcEnabled() {
    return this.bool('AngleArcEnabled', true);
  }
  get AngleArcOpacity() {
    return this.num('AngleArcOpacity', 0.35);
  }
  get DynamicOpacity() {
    return this.bool('DynamicOpacity', true);
  }
}

/** Behaviour and drag feedback follow the standalone Rotate Tool; thickness, rings and trackball are its own. */
export class TransformRotateSettings extends RotateGizmoSettings {
  private readonly standalone: RotateGizmoSettings;

  constructor(standalone: RotateGizmoSettings) {
    super('TransformRotateSettings');
    this.standalone = standalone;
  }

  override get RingDepthGradientEnabled() {
    return this.standalone.RingDepthGradientEnabled;
  }
  override get RotateToCursorEnabled() {
    return this.standalone.RotateToCursorEnabled;
  }
  override get LookAtEnabled() {
    return this.standalone.LookAtEnabled;
  }
  override get LookAtModifier() {
    return this.standalone.LookAtModifier;
  }
  override get AngleArcEnabled() {
    return this.standalone.AngleArcEnabled;
  }
  override get AngleArcOpacity() {
    return this.standalone.AngleArcOpacity;
  }
  override get DynamicOpacity() {
    return this.standalone.DynamicOpacity;
  }
}
