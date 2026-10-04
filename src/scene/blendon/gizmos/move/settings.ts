// MoveGizmoSettings, and the Transform gizmo's move part which defers a few rows to it.
import type { ModifierKey } from '../../foundation.ts';
import { sModifier } from '../../settings.ts';
import { GizmoSettings, type GizmoDefaults } from '../common/gizmo-settings.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';

export interface MoveDefaults extends GizmoDefaults {
  planeEnabled?: boolean;
  screenRingEnabled?: boolean;
}

export class MoveGizmoSettings extends GizmoSettings {
  private readonly planeEnabledDefault: boolean;
  private readonly screenRingEnabledDefault: boolean;

  constructor(cls = 'MoveGizmoSettings', defaults: MoveDefaults = {}) {
    super(cls, defaults);
    this.planeEnabledDefault = defaults.planeEnabled ?? true;
    this.screenRingEnabledDefault = defaults.screenRingEnabled ?? true;
  }

  get SurfaceSnapEnabled() {
    return this.bool('SurfaceSnapEnabled', true);
  }
  /** Follows the shared Aim key until this page overrides it. */
  get SurfaceSnapModifier(): ModifierKey {
    return sModifier(`${this.cls}.SurfaceSnapModifier`, SharedGizmoSettings.AimModifier);
  }
  get AxisHeadOpacity() {
    return this.num('AxisHeadOpacity', 0.95);
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
  override get DimIdleAxesDuringDrag() {
    return true;
  }
}

/** The Transform gizmo's arrows: its own look, but tips and surface snap follow the Move Tool. */
export class TransformMoveSettings extends MoveGizmoSettings {
  private readonly standalone: MoveGizmoSettings;

  constructor(standalone: MoveGizmoSettings) {
    super('TransformMoveSettings', {
      planeEnabled: false,
      axisLength: 1.15,
      axisOffset: 1,
      planeOffset: 0.01,
      planeSize: 0.09,
    });
    this.standalone = standalone;
  }

  override get AxisHeadFlat() {
    return this.standalone.AxisHeadFlat;
  }
  override get SurfaceSnapEnabled() {
    return this.standalone.SurfaceSnapEnabled;
  }
  override get SurfaceSnapModifier() {
    return this.standalone.SurfaceSnapModifier;
  }
}
