// GizmoSettings: the appearance every transform gizmo page shares, read under its own class key.
import { GeneralSettings, sBool, sEnum, sNum } from '../../settings.ts';

export const PlaneHandleShape = { Rectangle: 0, Triangle: 1 } as const;
export type PlaneHandleShape = number;

export interface GizmoDefaults {
  axisLength?: number;
  axisOffset?: number;
  axisThickness?: number;
  planeSize?: number;
  planeOffset?: number;
  screenRingRadius?: number;
}

export class GizmoSettings {
  /** The window's class name, e.g. 'MoveGizmoSettings' or 'TransformMoveSettings'. */
  readonly cls: string;
  protected readonly d: Required<GizmoDefaults>;

  constructor(cls: string, defaults: GizmoDefaults = {}) {
    this.cls = cls;
    this.d = {
      axisLength: 0.83,
      axisOffset: 0.21,
      axisThickness: 1,
      planeSize: 0.0646,
      planeOffset: 0.46,
      screenRingRadius: 0.166,
      ...defaults,
    };
  }

  protected bool(prop: string, d: boolean) {
    return sBool(`${this.cls}.${prop}`, d);
  }

  protected num(prop: string, d: number) {
    return sNum(`${this.cls}.${prop}`, d);
  }

  get Enabled() {
    return GeneralSettings.Enabled && this.bool('Enabled', true);
  }
  get AxisLength() {
    return this.num('AxisLength', this.d.axisLength);
  }
  get AxisOffset() {
    return this.num('AxisOffset', this.d.axisOffset);
  }
  get AxisThickness() {
    return this.num('AxisThickness', this.d.axisThickness);
  }
  get AxisThicknessHover() {
    return this.AxisThickness * 1.1;
  }
  get AxisThicknessActive() {
    return this.AxisThickness;
  }
  get AxisHeadFlat() {
    return this.bool('AxisHeadFlat', true);
  }
  get AxisHeadSize() {
    return this.num('AxisHeadSize', 0.165);
  }
  get AxisHeadOpacityOverride(): number | null {
    return null;
  }
  get PlaneSize() {
    return this.num('PlaneSize', this.d.planeSize);
  }
  get PlaneOffset() {
    return this.num('PlaneOffset', this.d.planeOffset);
  }
  get PlaneShape(): PlaneHandleShape {
    return sEnum(`${this.cls}.PlaneShape`, ['Rectangle', 'Triangle'], PlaneHandleShape.Rectangle);
  }
  get PlaneOutlineThickness() {
    return this.num('PlaneOutlineThickness', 0.686);
  }
  get ScreenRingRadius() {
    return this.num('ScreenRingRadius', this.d.screenRingRadius);
  }
  get DimIdleAxesDuringDrag() {
    return false;
  }
}
