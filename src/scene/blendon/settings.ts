// Settings access in the shape of Blendon's EditorPrefs-backed pages: "Class.Property" keys, read
// through Prefs (the window's values when shared, the shipped defaults otherwise).
import { Prefs } from '../unity/editor.ts';
import { Color } from '../unity/math.ts';
import { ModifierKeys, type ModifierKey } from './foundation.ts';

export const sBool = (key: string, d: boolean) => Prefs.bool(key, d);
export const sNum = (key: string, d: number) => Prefs.num(key, d);
export const sStr = (key: string, d: string) => Prefs.str(key, d);

/** An enum stored by name (as the window shows it), read back as its C# ordinal. */
export function sEnum(key: string, names: readonly string[], d: number): number {
  const v = Prefs.get<string | number | boolean>(key, d);
  if (typeof v === 'number') return v;
  const i = names.indexOf(String(v));
  return i < 0 ? d : i;
}

export function sColor(key: string, d: Color): Color {
  const v = Prefs.get<string | number | boolean>(key, '');
  return typeof v === 'string' && v.startsWith('#') ? Color.hex(v) : d;
}

export const sModifier = (key: string, d: ModifierKey): ModifierKey =>
  ModifierKeys.parse(Prefs.get<string | number | boolean>(key, d));

export const GeneralSettings = {
  get Enabled() {
    return sBool('GeneralSettings.Enabled', true);
  },
  get AnimationEnabled() {
    return sBool('GeneralSettings.AnimationEnabled', true);
  },
  get AnimationDuration() {
    return sNum('GeneralSettings.AnimationDuration', 0.35);
  },
  get RmbCancelEnabled() {
    return sBool('GeneralSettings.RmbCancelEnabled', true);
  },
  get RestrictDragToActiveView() {
    return sBool('GeneralSettings.RestrictDragToActiveView', true);
  },
  get AxisColorX() {
    return sColor('GeneralSettings.AxisColorX', Color.hex('#FF3653'));
  },
  get AxisColorY() {
    return sColor('GeneralSettings.AxisColorY', Color.hex('#8ADB00'));
  },
  get AxisColorZ() {
    return sColor('GeneralSettings.AxisColorZ', Color.hex('#2C8FFF'));
  },
  get OutlineColor() {
    return sColor('GeneralSettings.OutlineColor', Color.black);
  },
  get ShowTutorial() {
    return sBool('GeneralSettings.ShowTutorial', true);
  },
  get ShowShortcutTips() {
    return sBool('GeneralSettings.ShowShortcutTips', true);
  },
};
