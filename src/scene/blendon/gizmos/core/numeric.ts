// ModalNumericParser: the keyboard half of a drag or grab - axis keys, typed values, confirm/cancel.
import { PivotRotation, Tools } from '../../../unity/editor.ts';
import { Event, EventType, KeyCode, MouseButton } from '../../../unity/imgui.ts';
import { Mathf, Vector3 } from '../../../unity/math.ts';
import { ModifierKeys, SceneTutorial } from '../../foundation.ts';
import { GeneralSettings } from '../../settings.ts';
import { GizmoAxis } from '../axis.ts';
import { TransformSpace } from '../hud.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { DragKind } from './drag.ts';

export { TransformSpace };
export const ModalNumericState = { Idle: 0, MouseTransforming: 1, NumericInput: 2 } as const;

export class AxisConstraintMask {
  readonly includesX: boolean;
  readonly includesY: boolean;
  readonly includesZ: boolean;

  constructor(x: boolean, y: boolean, z: boolean) {
    this.includesX = x;
    this.includesY = y;
    this.includesZ = z;
  }

  static readonly All = new AxisConstraintMask(true, true, true);

  static single(axis: GizmoAxis) {
    return axis.index === 0
      ? new AxisConstraintMask(true, false, false)
      : axis.index === 1
        ? new AxisConstraintMask(false, true, false)
        : axis.index === 2
          ? new AxisConstraintMask(false, false, true)
          : AxisConstraintMask.All;
  }

  static plane(excluded: GizmoAxis) {
    return excluded.index === 0
      ? new AxisConstraintMask(false, true, true)
      : excluded.index === 1
        ? new AxisConstraintMask(true, false, true)
        : excluded.index === 2
          ? new AxisConstraintMask(true, true, false)
          : AxisConstraintMask.All;
  }

  includes(axis: GizmoAxis) {
    return axis.index === 0 ? this.includesX : axis.index === 1 ? this.includesY : axis.index === 2 && this.includesZ;
  }

  equals(o: AxisConstraintMask) {
    return this.includesX === o.includesX && this.includesY === o.includesY && this.includesZ === o.includesZ;
  }
}

class AxisBuffer {
  text = '';
  isNegative = false;
  isReciprocal = false;

  get isEmpty() {
    return !this.text && !this.isNegative && !this.isReciprocal;
  }

  clear() {
    this.text = '';
    this.isNegative = false;
    this.isReciprocal = false;
  }

  resolve() {
    if (this.isEmpty) return 0;
    let v = parseFloat(this.text || '0');
    if (!Number.isFinite(v)) v = 0;
    if (this.isReciprocal) v = Mathf.Approximately(v, 0) ? 0 : 1 / v;
    return this.isNegative ? -v : v;
  }
}

const SpaceStep = { Unconstrained: 0, Scene: 1, Alternate: 2 } as const;

// The parser whose digits drive a transform right now, if any.
let typing: ModalNumericParser | null = null;
const setTyping = (p: ModalNumericParser | null) => void (typing = p);

export class ModalNumericParser {
  private backspaceArmed = false;
  private readonly buffer = new AxisBuffer();
  private defaultAxis = GizmoAxis.X;
  private lastAxisKeyIndex = -1;
  private _state: number = ModalNumericState.Idle;
  private step: number = SpaceStep.Unconstrained;
  currentActiveSpace: number = TransformSpace.Global;
  activeMask = AxisConstraintMask.single(GizmoAxis.X);
  isSpaceExplicit = false;
  canReleaseConstraint = false;
  defaultSpaceIsGrid: (() => boolean) | null = null;
  defaultSpaceIsLocal: (() => boolean) | null = null;
  onConfirm: (() => void) | null = null;
  onCancel: (() => void) | null = null;
  onRevertToMouseTransform: (() => void) | null = null;
  onConstraintChanged: (() => void) | null = null;

  static get anyNumericInput() {
    return typing !== null;
  }

  get state() {
    return this._state;
  }
  private set state(v: number) {
    this._state = v;
    if (v === ModalNumericState.NumericInput) setTyping(this);
    else if (typing === this) setTyping(null);
  }

  get isUnconstrained() {
    return this.step === SpaceStep.Unconstrained;
  }

  get currentParsedVector3() {
    const v = this.buffer.resolve();
    const m = this.activeMask;
    return new Vector3(m.includesX ? v : 0, m.includesY ? v : 0, m.includesZ ? v : 0);
  }

  get currentParsedValue() {
    return this.buffer.resolve();
  }

  resolveDeferredIsLocal() {
    return this.defaultSpaceIsLocal ? this.defaultSpaceIsLocal() : Tools.pivotRotation === PivotRotation.Local;
  }

  /** Unity's Grid handle orientation isn't modelled, so only a gizmo's own rule can answer yes. */
  resolveDeferredIsGrid() {
    if (this.resolveDeferredIsLocal()) return false;
    return this.defaultSpaceIsGrid ? this.defaultSpaceIsGrid() : false;
  }

  isActiveAxis(axis: GizmoAxis) {
    return this.activeMask.includes(axis);
  }

  hasExplicitValue(axis: GizmoAxis) {
    return this.activeMask.includes(axis) && !this.buffer.isEmpty;
  }

  getAxisDisplayText(axis: GizmoAxis) {
    if (!this.activeMask.includes(axis) || this.buffer.isEmpty) return '';
    let text = this.buffer.text || '0';
    if (this.buffer.isReciprocal) text = '1/' + text;
    return this.buffer.isNegative ? '-' + text : text;
  }

  resolveDragTarget(): [DragKind, GizmoAxis] {
    const m = this.activeMask;
    if (m.includesX && !m.includesY && !m.includesZ) return [DragKind.Axis, GizmoAxis.X];
    if (!m.includesX && m.includesY && !m.includesZ) return [DragKind.Axis, GizmoAxis.Y];
    if (!m.includesX && !m.includesY && m.includesZ) return [DragKind.Axis, GizmoAxis.Z];
    if (!m.includesX) return [DragKind.Plane, GizmoAxis.X];
    if (!m.includesY) return [DragKind.Plane, GizmoAxis.Y];
    return [DragKind.Plane, GizmoAxis.Z];
  }

  beginMouseTransform(constrainedAxis: GizmoAxis | null, defaultAxis: GizmoAxis | null = null) {
    this.state = ModalNumericState.MouseTransforming;
    this.currentActiveSpace = TransformSpace.Global;
    this.isSpaceExplicit = false;
    this.lastAxisKeyIndex = constrainedAxis?.index ?? -1;
    this.step = constrainedAxis && constrainedAxis.index >= 0 ? SpaceStep.Scene : SpaceStep.Unconstrained;
    this.backspaceArmed = false;
    this.buffer.clear();
    this.defaultAxis = constrainedAxis ?? defaultAxis ?? GizmoAxis.X;
    this.activeMask = AxisConstraintMask.single(this.defaultAxis);
  }

  endMouseTransform() {
    if (this.state === ModalNumericState.MouseTransforming) this.state = ModalNumericState.Idle;
  }

  reset() {
    this.state = ModalNumericState.Idle;
    this.currentActiveSpace = TransformSpace.Global;
    this.isSpaceExplicit = false;
    this.activeMask = AxisConstraintMask.single(GizmoAxis.X);
    this.defaultAxis = GizmoAxis.X;
    this.lastAxisKeyIndex = -1;
    this.step = SpaceStep.Unconstrained;
    this.backspaceArmed = false;
    this.buffer.clear();
  }

  processEvent(ev: Event): boolean {
    if (this.state === ModalNumericState.Idle) return false;
    if (ev.type === EventType.KeyDown) return this.processKeyDown(ev);
    if (ev.rawType !== EventType.MouseDown) return false;
    if (ev.button === MouseButton.LeftMouse) {
      this.confirm();
      return true;
    }
    if (ev.button === MouseButton.RightMouse && GeneralSettings.RmbCancelEnabled) {
      this.cancel();
      return true;
    }
    return false;
  }

  private processKeyDown(ev: Event) {
    const exclude = ModifierKeys.isHeld(SharedGizmoSettings.AxisExcludeModifier, ev);
    switch (ev.keyCode) {
      case KeyCode.X:
        this.handleAxisKey(GizmoAxis.X, exclude);
        return true;
      case KeyCode.Y:
        this.handleAxisKey(GizmoAxis.Y, exclude);
        return true;
      case KeyCode.Z:
        this.handleAxisKey(GizmoAxis.Z, exclude);
        return true;
      case KeyCode.Backspace:
        this.handleBackspace();
        return true;
      case KeyCode.Return:
      case KeyCode.KeypadEnter:
        this.confirm();
        return true;
      case KeyCode.Escape:
        this.cancel();
        return true;
      case KeyCode.Period:
      case KeyCode.KeypadPeriod:
      case KeyCode.Comma:
        this.appendChar('.');
        return true;
      case KeyCode.Minus:
      case KeyCode.KeypadMinus:
        this.backspaceArmed = false;
        this.buffer.isNegative = !this.buffer.isNegative;
        return true;
      case KeyCode.Slash:
      case KeyCode.KeypadDivide:
        this.backspaceArmed = false;
        this.buffer.isReciprocal = !this.buffer.isReciprocal;
        return true;
      default: {
        const k = ev.keyCode;
        const digit =
          k >= KeyCode.Alpha0 && k <= KeyCode.Alpha9
            ? k - KeyCode.Alpha0
            : k >= KeyCode.Keypad0 && k <= KeyCode.Keypad9
              ? k - KeyCode.Keypad0
              : -1;
        if (digit < 0) return false;
        this.appendChar(String(digit));
        return true;
      }
    }
  }

  /** Repeated presses of one axis key step scene orientation -> alternate -> (releasable) none. */
  private handleAxisKey(axis: GizmoAxis, shift: boolean) {
    this.backspaceArmed = false;
    SceneTutorial.report(shift ? 'PlaneLock' : 'AxisConstraint');
    const repeat = this.step !== SpaceStep.Unconstrained && axis.index === this.lastAxisKeyIndex;
    if (repeat)
      this.step =
        this.step === SpaceStep.Scene
          ? SpaceStep.Alternate
          : this.canReleaseConstraint
            ? SpaceStep.Unconstrained
            : SpaceStep.Scene;
    else if (this.step === SpaceStep.Unconstrained) this.step = SpaceStep.Scene;

    if (this.step === SpaceStep.Unconstrained) {
      this.activeMask = AxisConstraintMask.single(this.defaultAxis);
      this.lastAxisKeyIndex = -1;
    } else {
      this.activeMask = shift ? AxisConstraintMask.plane(axis) : AxisConstraintMask.single(axis);
      this.lastAxisKeyIndex = axis.index;
    }
    // The alternate of a world-aligned toolbar is Local; of Local or Grid, Global.
    const alternate = this.step === SpaceStep.Alternate;
    const sceneIsWorld = !this.resolveDeferredIsLocal() && !this.resolveDeferredIsGrid();
    this.currentActiveSpace = alternate && sceneIsWorld ? TransformSpace.Local : TransformSpace.Global;
    this.isSpaceExplicit = alternate;
    this.onConstraintChanged?.();
  }

  private appendChar(c: string) {
    if (this.state === ModalNumericState.MouseTransforming) this.state = ModalNumericState.NumericInput;
    this.backspaceArmed = false;
    this.buffer.text += c;
    SceneTutorial.report('NumericTyped');
  }

  private handleBackspace() {
    const b = this.buffer;
    if (b.text) {
      b.text = b.text.slice(0, -1);
      this.backspaceArmed = false;
      return;
    }
    if (b.isReciprocal) {
      b.isReciprocal = false;
      this.backspaceArmed = false;
      return;
    }
    if (b.isNegative) {
      b.isNegative = false;
      this.backspaceArmed = false;
      return;
    }
    if (!this.backspaceArmed) {
      this.backspaceArmed = true;
      this.onRevertToMouseTransform?.();
      return;
    }
    this.state = ModalNumericState.MouseTransforming;
    this.backspaceArmed = false;
  }

  private confirm() {
    this.onConfirm?.();
    this.reset();
    SceneTutorial.report('TransformConfirmed');
  }

  private cancel() {
    this.onCancel?.();
    this.reset();
    SceneTutorial.report('TransformCancelled');
  }
}
