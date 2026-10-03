// GizmoAxis: which axis (or the screen ring/centre) a handle belongs to, with its palette.
import { Color, Vector3 } from '../../unity/math.ts';
import { brighten, contrast, darken, withAlpha, withOpacity } from '../color.ts';
import { GizmoColors } from './colors.ts';
import { SharedGizmoSettings } from './shared-settings.ts';

export class GizmoAxis {
  readonly index: number;
  readonly label: string;

  private constructor(index: number, label: string) {
    this.index = index;
    this.label = label;
  }

  static readonly X = new GizmoAxis(0, 'X');
  static readonly Y = new GizmoAxis(1, 'Y');
  static readonly Z = new GizmoAxis(2, 'Z');
  /** The screen ring / centre handle. */
  static readonly Screen = new GizmoAxis(-1, 'V');
  static readonly all = [GizmoAxis.X, GizmoAxis.Y, GizmoAxis.Z];

  static of(index: number) {
    return index === 0 ? GizmoAxis.X : index === 1 ? GizmoAxis.Y : index === 2 ? GizmoAxis.Z : GizmoAxis.Screen;
  }

  get isCenterDot() {
    return this.index < 0;
  }

  component(v: Vector3) {
    return this.index === 1 ? v.y : this.index === 2 ? v.z : v.x;
  }

  get unit() {
    return this.index === 1 ? Vector3.up : this.index === 2 ? Vector3.forward : Vector3.right;
  }

  get color(): Color {
    switch (this.index) {
      case 0:
        return GizmoColors.AxisColorX;
      case 1:
        return GizmoColors.AxisColorY;
      case 2:
        return GizmoColors.AxisColorZ;
      default:
        return GizmoColors.ScreenRing;
    }
  }

  /** Hover/active are always opaque; only the idle colour follows the Opacity slider. */
  get hover(): Color {
    return withAlpha(this.isCenterDot ? GizmoColors.CenterDotHover : brighten(this.color), 1);
  }

  get active() {
    return this.hover;
  }

  get constrain(): Color {
    if (this.isCenterDot) return GizmoColors.CenterDotActive;
    return withOpacity(
      contrast(this.color, SharedGizmoSettings.ConstraintLineContrast),
      SharedGizmoSettings.ConstraintLineOpacity * 0.9,
    );
  }

  get circleFar() {
    return darken(this.constrain, 0.1);
  }

  get circleNear() {
    return this.active;
  }

  toString() {
    return this.label;
  }
}
