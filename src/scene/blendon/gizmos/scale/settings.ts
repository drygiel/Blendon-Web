// ScaleGizmoSettings, and the Transform gizmo's scale part which follows it for tips and orientation.
import { ColorDefaults } from '../../color.ts';
import { sColor } from '../../settings.ts';
import { GizmoSettings, type GizmoDefaults } from '../common/gizmo-settings.ts';

export interface ScaleDefaults extends GizmoDefaults {
  planeEnabled?: boolean;
  screenRingEnabled?: boolean;
  outerRingSupported?: boolean;
}

export class ScaleGizmoSettings extends GizmoSettings {
  private readonly planeEnabledDefault: boolean;
  private readonly screenRingEnabledDefault: boolean;
  /** The composite drops the outer pick ring, whose click-anywhere fallback would swallow its other handles. */
  readonly OuterRingInteractive: boolean;

  constructor(cls = 'ScaleGizmoSettings', defaults: ScaleDefaults = {}) {
    super(cls, defaults);
    this.planeEnabledDefault = defaults.planeEnabled ?? true;
    this.screenRingEnabledDefault = defaults.screenRingEnabled ?? true;
    this.OuterRingInteractive = defaults.outerRingSupported ?? true;
  }

  get AxisForceLocalOrientation() {
    return this.bool('AxisForceLocalOrientation', false);
  }
  get AxisHeadOpacity() {
    return this.num('AxisHeadOpacity', 1);
  }
  override get AxisHeadOpacityOverride(): number | null {
    return this.AxisHeadOpacity;
  }
  get PlaneEnabled() {
    return this.bool('PlaneEnabled', this.planeEnabledDefault);
  }
  get ScreenRingEnabled() {
    return this.bool('ScreenRingEnabled', this.screenRingEnabledDefault);
  }
  get OuterScreenRingRadius() {
    return this.num('OuterScreenRingRadius', 1);
  }
  get ScreenRingColor() {
    return sColor(`${this.cls}.ScreenRingColor`, ColorDefaults.ScreenRingColorDefault);
  }
}

export class TransformScaleSettings extends ScaleGizmoSettings {
  private readonly standalone: ScaleGizmoSettings;

  constructor(standalone: ScaleGizmoSettings) {
    super('TransformScaleSettings', {
      planeEnabled: false,
      outerRingSupported: false,
      axisLength: 0.62,
      screenRingEnabled: false,
    });
    this.standalone = standalone;
  }

  override get AxisHeadFlat() {
    return this.standalone.AxisHeadFlat;
  }
  override get AxisForceLocalOrientation() {
    return this.standalone.AxisForceLocalOrientation;
  }
}
