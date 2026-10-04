// Settings of the Scene Tools pages, read through the window's values like every other page.
import { Mathf } from '../../unity/math.ts';
import { ColorDefaults } from '../color.ts';
import { GeneralSettings, sBool, sColor, sEnum, sNum, sStr } from '../settings.ts';

const animated = (k: string) => sBool(k + 'AnimationEnabled', GeneralSettings.AnimationEnabled);
const duration = (k: string) => sNum(k + 'AnimationDuration', GeneralSettings.AnimationDuration);

export const FrameSelectedStep = { SelectionCenter: 0, ActivePivot: 1, ZoomIn: 2, BackToStart: 3 } as const;
export type FrameSelectedStep = (typeof FrameSelectedStep)[keyof typeof FrameSelectedStep];
const StepNames = ['SelectionCenter', 'ActivePivot', 'ZoomIn', 'BackToStart'];

let parsedText: string | null = null;
let cycle: FrameSelectedStep[] = [];

const F = 'FrameSelectedSettings.';
export const FrameSelectedSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(F + 'Enabled', true);
  },
  get AnimationEnabled() {
    return animated(F);
  },
  get AnimationDuration() {
    return duration(F);
  },
  get SequenceText() {
    return sStr(F + 'SequenceText', StepNames.join(','));
  },
  /** The steps one press after another walks through; a new array whenever the text changes. */
  get Cycle(): FrameSelectedStep[] {
    const text = FrameSelectedSettings.SequenceText;
    if (text === parsedText) return cycle;
    parsedText = text;
    // A leading '-' keeps a step's place in the order while leaving it out of the cycle.
    const seen = new Set<number>();
    const out: FrameSelectedStep[] = [];
    for (const token of text.split(',')) {
      const on = token.length > 0 && token[0] !== '-';
      const step = StepNames.indexOf(on ? token : token.replace(/^-+/, ''));
      if (step < 0 || seen.has(step)) continue;
      seen.add(step);
      if (on) out.push(step as FrameSelectedStep);
    }
    cycle = out;
    return cycle;
  },
};

export const SnapDirection = { Down: 0, Up: 1 } as const;

const S = 'SnapToFloorSettings.';
export const SnapToFloorSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(S + 'Enabled', true);
  },
  get Direction() {
    return sEnum(S + 'Direction', ['Down', 'Up'], SnapDirection.Down);
  },
  get AlignToSurface() {
    return sBool(S + 'AlignToSurface', false);
  },
  get SurfaceOffset() {
    return sNum(S + 'SurfaceOffset', 0);
  },
  get AnimationEnabled() {
    return animated(S);
  },
  get AnimationDuration() {
    return duration(S);
  },
};

const I = 'IsolateViewSettings.';
export const IsolateViewSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(I + 'Enabled', true);
  },
  get IncludeChildren() {
    return sBool(I + 'IncludeChildren', true);
  },
  get FrameOnIsolate() {
    return sBool(I + 'FrameOnIsolate', false);
  },
};

export const SelectionHistorySettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool('HistorySettings.Enabled', true);
  },
};

const V = 'ViewHistorySettings.';
export const ViewHistorySettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(V + 'Enabled', true);
  },
  get AnimationEnabled() {
    return animated(V);
  },
  get AnimationDuration() {
    return duration(V);
  },
};

const B = 'BoxSelectSettings.';
export const BoxSelectSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(B + 'Enabled', false);
  },
  get ClickSelectsParent() {
    return sBool(B + 'ClickSelectsParent', true);
  },
  get HierarchyKeys() {
    return sBool(B + 'HierarchyKeys', true);
  },
  get RequireFullyEnclosed() {
    return sBool(B + 'RequireFullyEnclosed', false);
  },
  get CombinedMode() {
    return sEnum(B + 'CombinedMode', ['Intersect', 'Difference'], BoxSelectCombinedMode.Difference);
  },
  get VisibleOnly() {
    return sBool(B + 'VisibleOnly', true);
  },
  get SelectionUpdate() {
    return sEnum(B + 'SelectionUpdate', ['OnRelease', 'Highlight', 'Live'], BoxSelectUpdate.Highlight);
  },
  get CursorInfo() {
    return sEnum(B + 'CursorInfo', ['None', 'Count', 'Names', 'CountAndNames'], BoxSelectInfo.Names);
  },
  get OutlineStyle() {
    return sEnum(B + 'OutlineStyle', ['Solid', 'Dashed', 'DashedDense'], BoxSelectOutlineStyle.DashedDense);
  },
  get OutlineColor() {
    return sColor(B + 'OutlineColor', ColorDefaults.BoxSelectOutlineDefault);
  },
  get FillColor() {
    return sColor(B + 'FillColor', ColorDefaults.BoxSelectFillDefault);
  },
  get HighlightStyle() {
    return sEnum(B + 'HighlightStyle', ['Fill', 'Outline', 'Both'], BoxSelectHighlightStyle.Outline);
  },
  get HighlightOutlineWidth() {
    return Mathf.Clamp(sNum(B + 'HighlightOutlineWidth', 2.1), 0.5, 6);
  },
  get HighlightOccludedOpacity() {
    return Mathf.Clamp01(sNum(B + 'HighlightOccludedOpacity', 0.5));
  },
  get HighlightColor() {
    return sColor(B + 'HighlightColor', ColorDefaults.BoxSelectHighlightDefault);
  },
  get DeselectHighlightColor() {
    return sColor(B + 'DeselectHighlightColor', ColorDefaults.BoxSelectDeselectHighlightDefault);
  },
  get NamesTextColor() {
    return sColor(B + 'NamesTextColor', ColorDefaults.BoxSelectNamesTextDefault);
  },
  get NamesBackgroundColor() {
    return sColor(B + 'NamesBackgroundColor', ColorDefaults.BoxSelectNamesBackgroundDefault);
  },
};

export const BoxSelectCombinedMode = { Intersect: 0, Difference: 1 } as const;
export const BoxSelectUpdate = { OnRelease: 0, Highlight: 1, Live: 2 } as const;
export const BoxSelectInfo = { None: 0, Count: 1, Names: 2, CountAndNames: 3 } as const;
export const BoxSelectOutlineStyle = { Solid: 0, Dashed: 1, DashedDense: 2 } as const;
export const BoxSelectHighlightStyle = { Fill: 0, Outline: 1, Both: 2 } as const;

export const SceneMenuEditActions = { IconRow: 0, List: 1 } as const;

const M = 'SceneMenuSettings.';
export const SceneMenuSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(M + 'Enabled', true);
  },
  get EditActions() {
    return sEnum(M + 'EditActions', ['IconRow', 'List'], SceneMenuEditActions.IconRow);
  },
  get SearchField() {
    return sBool(M + 'SearchField', true);
  },
  get ClassicMenuRow() {
    return sBool(M + 'ClassicMenuRow', true);
  },
  get AddObject() {
    return sBool(M + 'AddObject', true);
  },
  get RepeatLast() {
    return sBool(M + 'RepeatLast', true);
  },
  get FrameSelected() {
    return sBool(M + 'FrameSelected', false);
  },
  get SnapToFloor() {
    return sBool(M + 'SnapToFloor', true);
  },
  get ResetTransform() {
    return sBool(M + 'ResetTransform', false);
  },
  get AlignToActive() {
    return sBool(M + 'AlignToActive', true);
  },
  get TransformClipboard() {
    return sBool(M + 'TransformClipboard', true);
  },
  get TransformClipboardInline() {
    return sBool(M + 'TransformClipboardInline', true);
  },
  get HideAndShow() {
    return sBool(M + 'HideAndShow', true);
  },
  get HideAndShowInline() {
    return sBool(M + 'HideAndShowInline', true);
  },
  get SelectRelated() {
    return sBool(M + 'SelectRelated', false);
  },
  get SelectRelatedInline() {
    return sBool(M + 'SelectRelatedInline', true);
  },
  get Grouping() {
    return sBool(M + 'Grouping', false);
  },
  get GroupingInline() {
    return sBool(M + 'GroupingInline', true);
  },
  get ExtraOrderText() {
    return sStr(M + 'ExtraOrderText', '');
  },
};
