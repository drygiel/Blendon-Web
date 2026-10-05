// The orientation gizmo's model and painting: settings, projected axis handles, hit tests and the painter.
import { Color, Quaternion, Vector2 } from '../../../unity/math.ts';
import { withAlpha, withFade } from '../../color.ts';
import { GizmoColors } from '../../gizmos/colors.ts';
import { GeneralSettings, sBool, sColor, sNum } from '../../settings.ts';
import { WorldAxes } from '../view-snap.ts';

const K = 'OrientationGizmoSettings.';

export const OrientationGizmoSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(K + 'Enabled', true);
  },
  /** Unity's own scene gizmo leaves the view while Blendon's is shown. */
  get HideNativeGizmo() {
    return sBool(K + 'HideNativeGizmo', true);
  },
  get Radius() {
    return sNum(K + 'Radius', 45);
  },
  get Opacity() {
    return sNum(K + 'Opacity', 1);
  },
  get Padding() {
    return sNum(K + 'Padding', 1);
  },
  get LineThicknessScale() {
    return sNum(K + 'LineThicknessScale', 0.6);
  },
  get OrbitEnabled() {
    return sBool(K + 'OrbitEnabled', true);
  },
  get AnimationEnabled() {
    return sBool(K + 'AnimationEnabled', true);
  },
  get MiddleClickTogglesProjection() {
    return sBool(K + 'MiddleClickTogglesProjection', true);
  },
  get CenterCircleEnabled() {
    return sBool(K + 'CenterCircleEnabled', true);
  },
  get DirectionLabelEnabled() {
    return sBool(K + 'DirectionLabelEnabled', true);
  },
  get NegativeLabelsAlways() {
    return sBool(K + 'NegativeLabelsAlways', false);
  },
  get BackdropColor() {
    return sColor(K + 'BackdropColor', new Color(0.5, 0.5, 0.5, 0.5));
  },
  get BackgroundColor() {
    return sColor(K + 'BackgroundColor', new Color(0.22, 0.22, 0.22, 1));
  },
  DirectionLabelFontSize: 11,
  get DirectionLabelAreaHeight() {
    return OrientationGizmoSettings.DirectionLabelEnabled ? OrientationGizmoSettings.DirectionLabelFontSize + 2 : 0;
  },
};

// Below this projected length an axis points at the viewer; matches ViewAlignment's 0.9999 dot.
const ViewAlignedEpsilon = 1 - 0.9999 * 0.9999;

export class AxisEntry {
  readonly axisIndex: number;
  readonly isPositive: boolean;
  /** -1 fully away from the viewer .. +1 toward it. */
  readonly depth: number;
  /** Offset from the widget centre, GUI space (y down). */
  readonly direction: Vector2;

  constructor(axisIndex: number, isPositive: boolean, depth: number, direction: Vector2) {
    this.axisIndex = axisIndex;
    this.isPositive = isPositive;
    this.depth = depth;
    this.direction = direction;
  }

  get isAxisAligned() {
    return this.direction.sqrMagnitude < ViewAlignedEpsilon;
  }
  get facesViewer() {
    return this.depth >= 0;
  }
  get isOccludedPole() {
    return this.isAxisAligned && !this.facesViewer;
  }
}

export const BallCenterFraction = 0.8;
const BallRadiusFraction = 0.2;
const CenterCircleRadiusFraction = 0.08;
const RingInnerPadding = 2;
const NearCenterThreshold = (BallRadiusFraction + CenterCircleRadiusFraction) / BallCenterFraction + 0.02;

export class GizmoGeometry {
  readonly center: Vector2;
  readonly outerRadius: number;

  constructor(center: Vector2, outerRadius: number) {
    this.center = center;
    this.outerRadius = outerRadius;
  }

  get centerCircleRadius() {
    return this.outerRadius * CenterCircleRadiusFraction;
  }
  backdropRadius(padding: number) {
    return this.outerRadius - Math.max(0, padding) * 0.5;
  }
  handleRadius(padding: number) {
    return this.backdropRadius(padding) - RingInnerPadding * 2;
  }
  ballCenter(e: AxisEntry, handleRadius: number) {
    return this.center.add(e.direction.mul(handleRadius * BallCenterFraction));
  }

  /** The circle follows the shorter side and sits at the top, leaving the rest to the view name. */
  static resolve(width: number, height: number) {
    const square = Math.min(width, height);
    return new GizmoGeometry(new Vector2(width * 0.5, square * 0.5), Math.max(1, square * 0.5));
  }
}

export const AxisProjection = {
  /** The six handles in camera space, farthest first. */
  project(viewRotation: Quaternion): AxisEntry[] {
    const inverse = Quaternion.inverse(viewRotation);
    const out: AxisEntry[] = [];
    for (let axis = 0; axis < 3; axis++) {
      // Camera space has +z into the screen and GUI y grows down, hence the negations.
      const v = inverse.mulV(WorldAxes.get(axis));
      for (const sign of [1, -1])
        out.push(new AxisEntry(axis, sign > 0, -v.z * sign, new Vector2(v.x, -v.y).mul(sign)));
    }
    return out.sort((a, b) => a.depth - b.depth);
  },
  hasViewAlignedAxis: (entries: AxisEntry[]) => entries.some((e) => e.isAxisAligned),
};

export const AxisHitTest = {
  /** The handle nearest where it is drawn, within the widget's circle. */
  handle(entries: AxisEntry[], local: Vector2, g: GizmoGeometry) {
    const p = local.sub(g.center).div(g.outerRadius);
    if (p.sqrMagnitude > 1) return -1;
    let best = -1,
      bestDistance = Infinity;
    entries.forEach((e, i) => {
      if (e.isOccludedPole) return;
      const d = e.direction.mul(BallCenterFraction).sub(p).sqrMagnitude;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    return best;
  },
  center(local: Vector2, g: GizmoGeometry) {
    return local.sub(g.center).sqrMagnitude <= g.centerCircleRadius ** 2;
  },
  isCenterOccluded: (entries: AxisEntry[]) =>
    entries.some((e) => e.facesViewer && e.direction.sqrMagnitude < NearCenterThreshold * NearCenterThreshold),
};

// ---- painting ------------------------------------------------------------------------------------------

const LockedOpacityScale = 0.5;

class AxisPalette {
  private readonly background: Color;
  private readonly locked: boolean;
  readonly opacity: number;

  constructor(background: Color, opacity: number, locked: boolean) {
    this.background = background;
    this.locked = locked;
    this.opacity = opacity * (locked ? LockedOpacityScale : 1);
  }

  private axis(i: number) {
    return this.locked
      ? GizmoColors.NavAxisLocked
      : i === 0
        ? GizmoColors.NavAxisX
        : i === 1
          ? GizmoColors.NavAxisY
          : GizmoColors.NavAxisZ;
  }
  receding(e: AxisEntry) {
    return withFade(Color.lerp(this.background, this.axis(e.axisIndex), (e.depth + 1) * 0.25 + 0.5), this.opacity);
  }
  lineOrigin(e: AxisEntry) {
    return withFade(Color.lerp(this.background, this.axis(e.axisIndex), 0.75), this.opacity);
  }
  negative(e: AxisEntry, aligned: boolean): [Color, Color] {
    let tint = aligned
      ? Color.lerp(GizmoColors.NavAlignedTint, this.axis(e.axisIndex), 0.5)
      : Color.lerp(this.background, this.axis(e.axisIndex), 0.25);
    tint = withFade(withAlpha(tint, Math.min(e.depth + 1, 1)), this.opacity);
    const receding = this.receding(e);
    return aligned ? [receding, tint] : [tint, receding];
  }
  backdrop(c: Color) {
    return withFade(c, this.opacity);
  }
  center(hovered: boolean) {
    return hovered ? GizmoColors.NavCenterHover : withFade(GizmoColors.NavCenter, this.opacity * 0.6);
  }
  glyph(highlighted: boolean, hovered: boolean) {
    return highlighted
      ? withFade(GizmoColors.NavGlyphHighlight, this.opacity)
      : withFade(GizmoColors.NavGlyph, this.opacity * (hovered ? 1 : 0.9));
  }
}

export interface PaintFlags {
  highlightIndex: number;
  hovered: boolean;
  centerHovered: boolean;
  orthographic: boolean;
  rotationLocked: boolean;
}

const LineWidthFraction = 1 / 20;
const RingWidthFraction = 1 / 30;
const GlyphHalfHeight = 0.09;
const GlyphWidthScale = 0.6;
const GlyphAspect = 0.62;

function circle(ctx: CanvasRenderingContext2D, c: Vector2, r: number) {
  ctx.beginPath();
  ctx.arc(c.x, c.y, Math.max(0, r), 0, Math.PI * 2);
  ctx.closePath();
}

function glyph(ctx: CanvasRenderingContext2D, axisIndex: number, center: Vector2, h: number, isPositive: boolean) {
  const w = h * GlyphAspect;
  let { x, y } = center;
  ctx.beginPath();
  if (!isPositive) {
    ctx.moveTo(x - w * 2.2, y - 0.2);
    ctx.lineTo(x - w, y - 0.2);
    ctx.stroke();
    ctx.beginPath();
    // The minus takes the left of the ball, so the letter shifts right to stay centred.
    x += w * 0.6;
  }
  if (axisIndex === 0) {
    ctx.moveTo(x - w, y - h);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y - h);
    ctx.lineTo(x - w, y + h);
  } else if (axisIndex === 1) {
    y += isPositive ? 0.5 : 0.1;
    ctx.moveTo(x - w, y - h);
    ctx.lineTo(x, y);
    ctx.moveTo(x + w, y - h);
    ctx.lineTo(x, y);
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
  } else {
    ctx.moveTo(x - w, y - h);
    ctx.lineTo(x + w, y - h);
    ctx.lineTo(x - w, y + h);
    ctx.lineTo(x + w, y + h);
  }
  ctx.stroke();
}

export const GizmoPainter = {
  draw(ctx: CanvasRenderingContext2D, entries: AxisEntry[], g: GizmoGeometry, flags: PaintFlags) {
    const s = OrientationGizmoSettings;
    const palette = new AxisPalette(s.BackgroundColor, s.Opacity, flags.rotationLocked);
    const strokeScale = g.outerRadius * s.LineThicknessScale;
    const handleRadius = g.handleRadius(s.Padding);
    const anyAligned = AxisProjection.hasViewAlignedAxis(entries);
    if (flags.hovered && !flags.rotationLocked) {
      circle(ctx, g.center, g.backdropRadius(s.Padding));
      ctx.fillStyle = palette.backdrop(s.BackdropColor).css();
      ctx.fill();
    }
    for (const e of entries) {
      // Opposing lines overlap exactly, so one pole draws - unless an axis aims at the viewer.
      if ((!e.isPositive && !anyAligned) || e.isOccludedPole) continue;
      const ball = g.ballCenter(e, handleRadius);
      const from = g.center.sub(e.direction);
      const grad = ctx.createLinearGradient(from.x, from.y, ball.x, ball.y);
      grad.addColorStop(0, palette.lineOrigin(e).css());
      grad.addColorStop(1, palette.receding(e).css());
      ctx.strokeStyle = grad;
      ctx.lineWidth = strokeScale * LineWidthFraction;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(ball.x, ball.y);
      ctx.stroke();
    }
    if (s.CenterCircleEnabled) {
      // A square while orthographic, a circle in perspective.
      const r = g.centerCircleRadius;
      ctx.fillStyle = palette.center(flags.centerHovered).css();
      if (flags.orthographic) ctx.fillRect(g.center.x - r, g.center.y - r, r * 2, r * 2);
      else {
        circle(ctx, g.center, r);
        ctx.fill();
      }
    }
    entries.forEach((e, i) => {
      if (e.isOccludedPole) return;
      const aligned = e.isAxisAligned;
      const highlight = i === flags.highlightIndex;
      const ball = g.ballCenter(e, handleRadius);
      // Handles swell slightly toward the viewer, selling the sphere.
      const scale = (e.depth + 1) * 0.08 + 0.92;
      circle(ctx, ball, handleRadius * BallRadiusFraction * scale);
      if (e.isPositive) {
        ctx.fillStyle = palette.receding(e).css();
        ctx.fill();
      } else {
        // Hollow and washed out: the far side of the sphere.
        const [fill, stroke] = palette.negative(e, aligned);
        ctx.fillStyle = fill.css();
        ctx.fill();
        ctx.strokeStyle = stroke.css();
        ctx.lineWidth = strokeScale * RingWidthFraction;
        ctx.stroke();
      }
      if (!e.isPositive && !highlight && !s.NegativeLabelsAlways && !aligned) return;
      ctx.strokeStyle = palette.glyph(highlight, flags.hovered).css();
      ctx.lineWidth = handleRadius * LineWidthFraction * GlyphWidthScale;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      glyph(ctx, e.axisIndex, ball, handleRadius * GlyphHalfHeight, e.isPositive);
    });
  },
};
