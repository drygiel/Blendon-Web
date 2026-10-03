// GizmoHud: Blender's Δ readout at the top centre during a drag, and the red error notice.
import { EditorApplication } from '../../unity/editor.ts';
import { GUI, Handles, type RichStyle } from '../../unity/handles.ts';
import { Event, EventType } from '../../unity/imgui.ts';
import { Color, Mathf, Rect, Vector2, Vector3 } from '../../unity/math.ts';
import type { SceneView } from '../../unity/sceneview.ts';
import { GizmoAxis } from './axis.ts';

const Pre = 'Δ';
const Gray = '#B0B0B0';
const CornerRadius = 4;
const MONO = 'Consolas, "JetBrains Mono", ui-monospace, monospace';

const HudStyle: RichStyle = { fontSize: 10, font: MONO, color: Color.hex('#EBEBEB'), padding: [5, 5, 2, 2] };
const ErrorStyle: RichStyle = { fontSize: 10, font: MONO, color: Color.hex('#FFEBEB'), padding: [6, 6, 3, 3] };
const HudBackground = Color.hex('#141414').withAlpha(0.7);
const ErrorBackground = Color.hex('#B81C1C').withAlpha(0.92);

const DragMode = { None: 0, Axis: 1, Plane: 2, Free: 3, Rotate: 4, RotateFree: 5 } as const;

export const TransformSpace = { Global: 0, Local: 1 } as const;

/** What the HUD reads off a drag's numeric session. */
export interface NumericReadout {
  readonly currentActiveSpace: number;
  readonly isSpaceExplicit: boolean;
  resolveDeferredIsLocal(): boolean;
  resolveDeferredIsGrid(): boolean;
  readonly activeMask: { includesX: boolean; includesY: boolean; includesZ: boolean };
  getAxisDisplayText(axis: GizmoAxis): string;
  isActiveAxis(axis: GizmoAxis): boolean;
}

const hex = (c: Color) => {
  const h = (v: number) =>
    Math.round(Mathf.Clamp01(v) * 255)
      .toString(16)
      .padStart(2, '0');
  return '#' + h(c.r) + h(c.g) + h(c.b);
};
const tc = (text: string, color = '#FFEAEA') => `<color=${color}>${text}</color>`;
const axisColor = (a: GizmoAxis) => hex(a.color);
const fmt = (v: number, digits: number, positive = ' ') => {
  const r = v.toFixed(digits);
  return r.startsWith('-') ? r : positive + r;
};
const F = (v: number, p = ' ') => fmt(v, 2, p);
const FAngle = (v: number, p = ' ') => fmt(v, 1, p);

const st = {
  mode: DragMode.None as number,
  isScale: false,
  axis1: GizmoAxis.X,
  axis2: GizmoAxis.Y,
  dir1: Vector3.zero,
  dir2: Vector3.zero,
  total: Vector3.zero,
  error: { message: '', at: Vector2.zero, until: -Infinity, owner: null as SceneView | null },
};

function spaceLabel(p: NumericReadout) {
  return p.currentActiveSpace === TransformSpace.Local
    ? 'Local'
    : p.isSpaceExplicit
      ? 'Global'
      : p.resolveDeferredIsLocal()
        ? 'Local'
        : p.resolveDeferredIsGrid()
          ? 'Grid'
          : 'Global';
}

function renderLabel(view: SceneView, text: string, topOffset: number, snapToCursor: boolean) {
  Handles.beginGUI();
  const size = GUI.richSize(text, HudStyle);
  const bottomOffset = 26;
  const vp = view.position.size;
  let x: number, y: number;
  if (snapToCursor) {
    const mp = Event.current.mousePosition;
    x = Mathf.Clamp(mp.x + 16, 0, Math.max(0, vp.x - size.x));
    y = Mathf.Clamp(mp.y + size.y - 16, 0, Math.max(0, vp.y - size.y - bottomOffset));
  } else {
    x = Math.round((vp.x - size.x) * 0.5);
    y = Math.round(Mathf.Clamp01(topOffset) * Math.max(0, vp.y - size.y - bottomOffset));
  }
  const rect = new Rect(x, y, size.x, size.y);
  GUI.drawRoundedRect(rect, CornerRadius, HudBackground);
  GUI.richLabel(rect, text, HudStyle);
  Handles.endGUI();
}

const scaleFactor = (a: GizmoAxis) => 1 + a.component(st.total);

export const GizmoHud = {
  get totalDelta() {
    return st.total;
  },

  startAxisDrag(axis: GizmoAxis, dir: Vector3, isScale = false) {
    Object.assign(st, { mode: DragMode.Axis, axis1: axis, dir1: dir.normalized, total: Vector3.zero, isScale });
  },

  startPlaneDrag(a1: GizmoAxis, d1: Vector3, a2: GizmoAxis, d2: Vector3, isScale = false) {
    Object.assign(st, {
      mode: DragMode.Plane,
      axis1: a1,
      dir1: d1.normalized,
      axis2: a2,
      dir2: d2.normalized,
      total: Vector3.zero,
      isScale,
    });
  },

  startFreeDrag(isScale = false) {
    Object.assign(st, { mode: DragMode.Free, total: Vector3.zero, isScale });
  },

  startRotateDrag(axis: GizmoAxis, dir: Vector3) {
    Object.assign(st, { mode: DragMode.Rotate, axis1: axis, dir1: dir.normalized, total: Vector3.zero, isScale: false });
  },

  startRotateFreeDrag() {
    Object.assign(st, { mode: DragMode.RotateFree, total: Vector3.zero, isScale: false });
  },

  accumulateDelta(d: Vector3) {
    st.total = st.total.add(d);
  },

  setAbsoluteDelta(d: Vector3 | number) {
    st.total = typeof d === 'number' ? new Vector3(d, 0, 0) : d;
  },

  end() {
    st.mode = DragMode.None;
    st.total = Vector3.zero;
    st.isScale = false;
  },

  draw(view: SceneView, parser: NumericReadout, topOffset = 0.02, snapToCursor = false) {
    if (st.mode === DragMode.None || Event.current.type !== EventType.Repaint) return;
    const coord = tc(spaceLabel(parser), Gray);
    const unit = tc(st.isScale ? '' : 'm', Gray);
    const lbl = (a: GizmoAxis) => tc(Pre + a.label.toLowerCase(), axisColor(a));
    let text: string;
    switch (st.mode) {
      case DragMode.Axis: {
        const d = st.isScale ? scaleFactor(st.axis1) : Vector3.dot(st.total, st.dir1);
        text = `${lbl(st.axis1)}: ${F(d)}${unit}  ${coord}`;
        break;
      }
      case DragMode.Plane: {
        const d1 = st.isScale ? scaleFactor(st.axis1) : Vector3.dot(st.total, st.dir1);
        const d2 = st.isScale ? scaleFactor(st.axis2) : Vector3.dot(st.total, st.dir2);
        const mag = st.isScale ? scaleFactor(st.axis1) : Math.sqrt(d1 * d1 + d2 * d2);
        text = `${lbl(st.axis1)}: ${F(d1)}${unit}  ${lbl(st.axis2)}: ${F(d2)}${unit}  ${tc(`(${F(mag, '')}${unit})`, Gray)}  ${coord}`;
        break;
      }
      case DragMode.Rotate:
        text = `${lbl(st.axis1)}: ${FAngle(st.total.x)}°  ${coord}`;
        break;
      case DragMode.RotateFree: {
        const t = st.total;
        text =
          `${tc('Δx', axisColor(GizmoAxis.X))}: ${FAngle(t.x)}°  ${tc('Δy', axisColor(GizmoAxis.Y))}: ${FAngle(t.y)}°  ` +
          `${tc('Δz', axisColor(GizmoAxis.Z))}: ${FAngle(t.z)}°  ${tc(`(${FAngle(t.magnitude, '')}°)`, Gray)}  ${tc('Free', Gray)}`;
        break;
      }
      default: {
        const t = st.total;
        const k = st.isScale ? 1 : 0;
        const fmag = st.isScale ? 1 + t.x : t.magnitude;
        text =
          `${tc(Pre + 'x', axisColor(GizmoAxis.X))}: ${F(k + t.x)}${unit}  ${tc(Pre + 'y', axisColor(GizmoAxis.Y))}: ${F(k + t.y)}${unit}  ` +
          `${tc(Pre + 'z', axisColor(GizmoAxis.Z))}: ${F(k + t.z)}${unit}  ${tc(`(${F(fmag, '')}${unit})`, Gray)}  ${coord}`;
      }
    }
    renderLabel(view, text, topOffset, snapToCursor);
  },

  drawNumericInput(view: SceneView, parser: NumericReadout, topOffset = 0.02, snapToCursor = false) {
    if (Event.current.type !== EventType.Repaint) return;
    const mask = parser.activeMask;
    const unitText = st.mode === DragMode.Rotate || st.mode === DragMode.RotateFree ? '°' : st.isScale ? 'x' : 'm';
    const unit = tc(unitText, Gray);
    let text = '';
    for (const [inc, a] of [
      [mask.includesX, GizmoAxis.X],
      [mask.includesY, GizmoAxis.Y],
      [mask.includesZ, GizmoAxis.Z],
    ] as [boolean, GizmoAxis][]) {
      if (!inc) continue;
      let shown = parser.getAxisDisplayText(a);
      if (parser.isActiveAxis(a)) shown += '|';
      text += `${tc(Pre + a.label.toLowerCase(), axisColor(a))}: ${shown}${unit}  `;
    }
    renderLabel(view, text + tc(spaceLabel(parser), Gray), topOffset, snapToCursor);
  },

  showError(owner: SceneView, message: string, at: Vector2, time = 0) {
    st.error = { owner, message, at, until: EditorApplication.timeSinceStartup + time + 0.001 };
  },

  updateErrorPosition(owner: SceneView, at: Vector2) {
    if (owner === st.error.owner) st.error.at = at;
  },

  drawError(view: SceneView) {
    if (Event.current.type !== EventType.Repaint) return;
    const e = st.error;
    if (view !== e.owner || EditorApplication.timeSinceStartup >= e.until) return;
    Handles.beginGUI();
    const size = GUI.richSize(e.message, ErrorStyle);
    const vp = view.position.size;
    const x = Mathf.Clamp(e.at.x + 16, 0, Math.max(0, vp.x - size.x));
    const y = Mathf.Clamp(e.at.y + 16, 0, Math.max(0, vp.y - size.y));
    const rect = new Rect(x, y, size.x, size.y);
    GUI.drawRoundedRect(rect, CornerRadius, ErrorBackground);
    GUI.richLabel(rect, e.message, ErrorStyle);
    Handles.endGUI();
    view.repaint();
  },
};
