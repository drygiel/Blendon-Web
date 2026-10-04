// PieMenuSettings / WireframeToggleSettings. Defaults are Blender's, converted to seconds.
import { ColorDefaults } from '../color.ts';
import { GeneralSettings, sBool, sColor, sNum } from '../settings.ts';

const K = 'PieMenuSettings.';
export const PieMenuSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(K + 'Enabled', true);
  },
  get Radius() {
    return sNum(K + 'Radius', 100);
  },
  get Threshold() {
    return sNum(K + 'Threshold', 12);
  },
  get ConfirmThreshold() {
    return sNum(K + 'ConfirmThreshold', 0);
  },
  get TapTimeout() {
    return sNum(K + 'TapTimeout', 0.2);
  },
  get AnimationTimeout() {
    return sNum(K + 'AnimationTimeout', 0.06);
  },
  get RecenterTimeout() {
    return sNum(K + 'RecenterTimeout', 0);
  },
  get PlaceOnFloor() {
    return sBool(K + 'PlaceOnFloor', true);
  },
  get ShowAccelerators() {
    return sBool(K + 'ShowAccelerators', true);
  },
  get ItemColor() {
    return sColor(K + 'ItemColor', ColorDefaults.PieItemDefault);
  },
  get HighlightColor() {
    return sColor(K + 'HighlightColor', ColorDefaults.PieHighlightDefault);
  },
  get CurrentColor() {
    return sColor(K + 'CurrentColor', ColorDefaults.PieCurrentDefault);
  },
  get TextColor() {
    return sColor(K + 'TextColor', ColorDefaults.PieTextDefault);
  },
  get RingColor() {
    return sColor(K + 'RingColor', ColorDefaults.PieRingDefault);
  },
};

export const WireframeToggleSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool('WireframeToggleSettings.Enabled', true);
  },
};
