// SharedGizmoSettings: what every transform gizmo shares (appearance, precision, pivot point).
import { Prefs, PivotMode as UnityPivotMode, Tools } from '../../unity/editor.ts';
import { Event } from '../../unity/imgui.ts';
import { Color, Mathf } from '../../unity/math.ts';
import { ModifierKey, ModifierKeys } from '../foundation.ts';
import { sBool, sColor, sModifier, sNum } from '../settings.ts';

/** Blender's pivot-point modes, in the C# enum's order. */
export const PivotMode = { BoundingBoxCenter: 0, Median: 1, IndividualOrigins: 2, ActiveObject: 3 } as const;
export type PivotMode = number;

export const PivotModes = {
  unitySide: (m: PivotMode) =>
    m === PivotMode.IndividualOrigins || m === PivotMode.ActiveObject ? UnityPivotMode.Pivot : UnityPivotMode.Center,
  displayName: (m: PivotMode) =>
    ['Center (Bounding Box)', 'Median Point', 'Pivot (Individual Origins)', 'Active Object'][m] ?? 'Active Object',
  shortName: (m: PivotMode) => ['Center', 'Median', 'Pivot', 'Active'][m] ?? 'Active',
};

const K = 'SharedGizmoSettings.';
const MIN_QUALITY = 0.1;
const MAX_QUALITY = 6;
let precisionKeyHeld = false;

const onSide = (stored: number, fallback: PivotMode) =>
  stored >= 0 && stored <= 3 && PivotModes.unitySide(stored) === PivotModes.unitySide(fallback) ? stored : fallback;

export const GizmoTools = ['MoveGizmoSettings', 'RotateGizmoSettings', 'ScaleGizmoSettings', 'TransformGizmoSettings'];

export const SharedGizmoSettings = {
  get AllToolsEnabled() {
    return GizmoTools.every((t) => sBool(t + '.Enabled', true));
  },
  get AnyToolEnabled() {
    return GizmoTools.some((t) => sBool(t + '.Enabled', true));
  },
  get GhostColor() {
    return sColor(K + 'GhostColor', new Color(0.5, 0.5, 0.5));
  },
  get PrecisionModeEnabled() {
    return sBool(K + 'PrecisionModeEnabled', true);
  },
  get PrecisionModifier() {
    return sModifier(K + 'PrecisionModifier', ModifierKey.Shift);
  },
  get PrecisionFactor() {
    return sNum(K + 'PrecisionFactor', 0.2);
  },
  get EffectivePrecisionFactor() {
    return SharedGizmoSettings.PrecisionModeEnabled ? SharedGizmoSettings.PrecisionFactor : 1;
  },
  /** Switched on and its key held; a grab's cursor poll has no event, so the last answer stands. */
  get PrecisionHeld() {
    precisionKeyHeld = ModifierKeys.isHeld(SharedGizmoSettings.PrecisionModifier, Event.current);
    return SharedGizmoSettings.PrecisionModeEnabled && precisionKeyHeld;
  },
  get AimModifier() {
    return sModifier(K + 'AimModifier', ModifierKey.Alt);
  },
  get AxisExcludeModifier() {
    return sModifier(K + 'AxisExcludeModifier', ModifierKey.Shift);
  },
  get AxisLabelsEnabled() {
    return sBool(K + 'AxisLabelsEnabled', false);
  },
  get Quality() {
    return sNum(K + 'Quality', 3);
  },
  get QualityNormalized() {
    return Mathf.InverseLerp(MIN_QUALITY, MAX_QUALITY, SharedGizmoSettings.Quality);
  },
  qualityLerp(from: number, to: number) {
    return Mathf.Lerp(from, to, SharedGizmoSettings.QualityNormalized);
  },
  get Size() {
    return sNum(K + 'Size', 1);
  },
  get Opacity() {
    return sNum(K + 'Opacity', 0.8);
  },
  get PivotPoint(): PivotMode {
    return Tools.pivotMode === UnityPivotMode.Pivot ? SharedGizmoSettings.PivotSideMode : SharedGizmoSettings.CenterSideMode;
  },
  set PivotPoint(m: PivotMode) {
    if (PivotModes.unitySide(m) === UnityPivotMode.Pivot) Prefs.set(K + 'PivotSideMode', m);
    else Prefs.set(K + 'CenterSideMode', m);
    Tools.pivotMode = PivotModes.unitySide(m);
  },
  get PivotSideMode(): PivotMode {
    return onSide(sNum(K + 'PivotSideMode', PivotMode.IndividualOrigins), PivotMode.IndividualOrigins);
  },
  get CenterSideMode(): PivotMode {
    return onSide(sNum(K + 'CenterSideMode', PivotMode.BoundingBoxCenter), PivotMode.BoundingBoxCenter);
  },
  get PivotMenuEnabled() {
    return sBool(K + 'PivotMenuEnabled', true);
  },
  get PerObjectLocalAxes() {
    return sBool(K + 'PerObjectLocalAxes', false);
  },
  get Contrast() {
    return sNum(K + 'Contrast', 1);
  },
  get ThresholdDegrees() {
    return sNum(K + 'ThresholdDegrees', 30);
  },
  get DragGhostsEnabled() {
    return sBool(K + 'DragGhostsEnabled', true);
  },
  get ClickSelectEnabled() {
    return sBool(K + 'ClickSelectEnabled', true);
  },
  get CenterDotRadius() {
    return sNum(K + 'CenterDotRadius', 0.016);
  },
  get CenterDotOutlineThickness() {
    return sNum(K + 'CenterDotOutlineThickness', 1.3);
  },
  get CenterDotColor() {
    return sColor(K + 'CenterDotColor', new Color(0.965, 0.604, 0.176));
  },
  get TooltipInfoEnabled() {
    return sBool(K + 'TooltipInfoEnabled', true);
  },
  get TooltipInfoSnapToCursor() {
    return sBool(K + 'TooltipInfoSnapToCursor', false);
  },
  get TooltipInfoTopOffset() {
    return Mathf.Clamp01(sNum(K + 'TooltipInfoTopOffset', 0.02));
  },
  get ScreenRingThickness() {
    return sNum(K + 'ScreenRingThickness', 1.3);
  },
  get ScreenRingThicknessHover() {
    return SharedGizmoSettings.ScreenRingThickness * 1.2;
  },
  get ConstraintLineThickness() {
    return sNum(K + 'ConstraintLineThickness', 1);
  },
  get ConstraintLineOpacity() {
    return sNum(K + 'ConstraintLineOpacity', 1);
  },
  get ConstraintLineContrast() {
    return sNum(K + 'ConstraintLineContrast', 1);
  },
  get SnapTicksEnabled() {
    return sBool(K + 'SnapTicksEnabled', true);
  },
  get SnapTickLength() {
    return sNum(K + 'SnapTickLength', 0.15);
  },
  get SnapTickGap() {
    return sNum(K + 'SnapTickGap', 0.06);
  },
};
