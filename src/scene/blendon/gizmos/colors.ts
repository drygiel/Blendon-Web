// GizmoColors: every colour Blendon draws into the scene, derived from the settings.
import { Color } from '../../unity/math.ts';
import { contrast, withAlpha, withFade, withOpacity } from '../color.ts';
import { GeneralSettings } from '../settings.ts';
import { SharedGizmoSettings } from './shared-settings.ts';

export const MinVisibleFade = 0.05;
export const InactiveAxisFade = 0.8;

const vertexModeDot = Color.white;

export const GizmoColors = {
  get DebugMarker() {
    return Color.red;
  },
  get Outline() {
    return contrast(GeneralSettings.OutlineColor);
  },
  get AxisColorX() {
    return withOpacity(contrast(GeneralSettings.AxisColorX));
  },
  get AxisColorY() {
    return withOpacity(contrast(GeneralSettings.AxisColorY));
  },
  get AxisColorZ() {
    return withOpacity(contrast(GeneralSettings.AxisColorZ));
  },
  get NavAxisX() {
    return withAlpha(contrast(GeneralSettings.AxisColorX), 1);
  },
  get NavAxisY() {
    return withAlpha(contrast(GeneralSettings.AxisColorY), 1);
  },
  get NavAxisZ() {
    return withAlpha(contrast(GeneralSettings.AxisColorZ), 1);
  },
  get CenterDot() {
    return contrast(SharedGizmoSettings.CenterDotColor);
  },
  get CenterDotHover() {
    return contrast(Color.white);
  },
  get CenterDotActive() {
    return contrast(Color.white);
  },
  get SnapTickMajor() {
    return withOpacity(Color.white, 0.7);
  },
  get SnapTickMinor() {
    return withOpacity(Color.white, 0.4);
  },
  get ScreenRing() {
    return withOpacity(Color.white, 0.9);
  },
  get ScreenRingHover() {
    return withAlpha(GizmoColors.ScreenRing, 1);
  },
  get ScreenRingActive() {
    return withAlpha(GizmoColors.ScreenRing, 1);
  },
  TrackBall: Color.white,
  get CursorLine() {
    return withFade(Color.white, 0.9);
  },
  VertexModeDot: vertexModeDot,
  get LookAtLine() {
    return withAlpha(vertexModeDot, 1);
  },
  get LookAtLineOccluded() {
    return withFade(GizmoColors.LookAtLine, 0.1);
  },
  get LookAtSurface() {
    return withOpacity(vertexModeDot, 0.35);
  },
  get LookAtSurfaceOccluded() {
    return withFade(GizmoColors.LookAtSurface, 0.5);
  },
  get LookAtSurfaceOutlineOccluded() {
    return withFade(GizmoColors.LookAtLine, 0.5);
  },
  VertexPreview: Color.white,
  get VertexPreviewOccluded() {
    return withFade(Color.white, 0.15);
  },
  VertexPickRing: Color.white,
  get VertexPickCandidate() {
    return GizmoColors.CenterDot;
  },
  get VertexEdge() {
    return GizmoColors.CenterDot;
  },
  get VertexEdgeOccluded() {
    return withFade(GizmoColors.VertexEdge, 0.4);
  },
  get Ghost() {
    return withOpacity(SharedGizmoSettings.GhostColor, 0.85);
  },
  get GhostPlane() {
    return withOpacity(SharedGizmoSettings.GhostColor, 0.5);
  },
  NavAxisLocked: Color.gray,
  NavGlyph: new Color(0.05, 0.05, 0.05, 1),
  NavGlyphHighlight: Color.white,
  NavCenter: Color.white,
  NavCenterHover: Color.white,
  NavAlignedTint: Color.white,
  NavLabel: Color.white,
  NavLockIcon: Color.white,
  NavLockIconLocked: Color.red,
  get NavPanelBackground() {
    return withFade(Color.black, 0.6);
  },
  PieHighlightedText: Color.white,
};
