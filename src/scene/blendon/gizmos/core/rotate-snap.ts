// RotateSnap: precision and angle snap shared by every cursor-driven turn - rings, trackball and the R grab.
import { EditorSnapSettings } from '../../../unity/editor.ts';
import { Mathf } from '../../../unity/math.ts';
import { SnapCompat } from '../../foundation.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';

export const RotateSnap = {
  get active() {
    return SnapCompat.angleSnapEnabled && EditorSnapSettings.rotate > 0;
  },

  /** Precision halves it, matching the midpoint ticks. */
  get step() {
    return SharedGizmoSettings.PrecisionHeld ? EditorSnapSettings.rotate * 0.5 : EditorSnapSettings.rotate;
  },

  /** Scales a frame's travel, so letting go of the modifier is no jump. */
  get precisionScale() {
    return SharedGizmoSettings.PrecisionHeld ? SharedGizmoSettings.EffectivePrecisionFactor : 1;
  },

  /**
   * Rounds the running total: a frame's delta is tiny next to a step and would always round to 0, and the total
   * stays unsnapped so toggling snap re-rounds from the true angle.
   */
  snap(total: number) {
    if (!RotateSnap.active) return total;
    const step = RotateSnap.step;
    return Mathf.Round(total / step) * step;
  },
};
