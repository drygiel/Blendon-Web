// PieMenuController: one open menu's gesture state - where it spawned, where the cursor points, and
// which of Blender's two styles (hold-and-flick, or tap to latch then click) the gesture became.
import { EditorApplication } from '../../unity/editor.ts';
import { Mathf, Vector2 } from '../../unity/math.ts';
import type { SceneView } from '../../unity/sceneview.ts';
import { SceneTutorial } from '../foundation.ts';
import { reducedMotion } from '../navigation/camera.ts';
import { PieLayout } from './layout.ts';
import { PieMenuData, RadialDirections } from './model.ts';
import { PieMenuStyles } from './renderer.ts';
import { PieMenuSettings } from './settings.ts';

/** What an interaction did to the menu; anything but Open closes it. */
export const PieOutcome = { Open: 0, Executed: 1, Cancelled: 2 } as const;
export type PieOutcome = (typeof PieOutcome)[keyof typeof PieOutcome];

// Blender's pie velocity check: past the confirm threshold the cursor has to settle this long.
const GestureSettleSeconds = 0.02;

/** Half the widest pill a menu is expected to produce; keeps a menu opened near an edge on screen. */
export const MaxItemExtent = 110;

const now = () => EditorApplication.timeSinceStartup;

export class PieMenuController {
  readonly data: PieMenuData;
  readonly view: SceneView;
  readonly shortcutId: string;
  readonly openedAt = now();
  /** Where the cursor really was, before the pie was nudged to fit the view. */
  readonly initCenter: Vector2;
  readonly spawnCenter: Vector2;
  /** Cursor direction from the centre, normalized, in Blender's Y-up space. */
  pieDirection = Vector2.zero;
  distance = 0;
  invalidDirection = true;
  clickStyle = false;
  dragStyle = false;
  highlighted = -1;

  private cursor: Vector2;
  // A pie nudged off an edge sits away from the cursor Unity would have warped onto it, so nothing is
  // aimed at until the hand actually moves.
  private aimed: boolean;
  private gestureEndWait = false;
  private gestureLastPosition = Vector2.zero;
  private gestureCheckedAt = 0;

  constructor(data: PieMenuData, view: SceneView, cursor: Vector2, shortcutId: string) {
    this.data = data;
    this.view = view;
    this.shortcutId = shortcutId;
    this.initCenter = cursor;
    this.spawnCenter = clampToView(cursor, view);
    this.cursor = cursor;
    this.aimed = this.spawnCenter.equals(cursor);
    this.recalculateSegment();
  }

  get unfold() {
    const timeout = PieMenuSettings.AnimationTimeout;
    return timeout <= 0 || reducedMotion() ? 1 : Mathf.Clamp01((now() - this.openedAt) / timeout);
  }

  get isAnimating() {
    return this.unfold < 1 || this.gestureEndWait;
  }

  // Blender's PIE_INITIAL_DIRECTION, off by default as Blender ships it.
  private get usesInitialCenter() {
    const timeout = PieMenuSettings.RecenterTimeout;
    return timeout > 0 && now() - this.openedAt <= timeout;
  }

  track(cursor: Vector2) {
    if (!cursor.equals(this.cursor)) this.aimed = true;
    this.cursor = cursor;
    this.recalculateSegment();
    if (this.clickStyle) return;
    // Unity warps the OS cursor onto a nudged pie and measures from there; a page can't warp the
    // cursor, so the hand still rests where the key was pressed.
    if (cursor.sub(this.initCenter).sqrMagnitude > PieLayout.ClickThresholdSquared) this.dragStyle = true;
    const confirm = PieMenuSettings.ConfirmThreshold;
    if (confirm > 0 && this.distance >= PieMenuSettings.Threshold + confirm) {
      this.gestureEndWait = true;
      this.gestureLastPosition = cursor;
      this.gestureCheckedAt = now();
    }
  }

  /** Advances the tap timeout with a still cursor, and the confirm-threshold settle check. */
  tick(): PieOutcome {
    if (!this.clickStyle && !this.dragStyle && now() - this.openedAt > PieMenuSettings.TapTimeout)
      this.dragStyle = true;
    if (!this.gestureEndWait) return PieOutcome.Open;
    const t = now();
    if (t - this.gestureCheckedAt <= GestureSettleSeconds) return PieOutcome.Open;
    const moved = this.cursor.sub(this.gestureLastPosition).sqrMagnitude;
    this.gestureLastPosition = this.cursor;
    this.gestureCheckedAt = t;
    if (moved >= 1) return PieOutcome.Open;
    return report(this.execute(), 'PieFlick');
  }

  /** A quick, still release latches the menu open; anything else commits, the deadzone cancels. */
  onHotkeyReleased(): PieOutcome {
    if (this.clickStyle) return PieOutcome.Open;
    if (now() - this.openedAt < PieMenuSettings.TapTimeout && !this.dragStyle) {
      this.clickStyle = true;
      return PieOutcome.Open;
    }
    return report(this.execute(), 'PieFlick');
  }

  onConfirmClick(): PieOutcome {
    return report(this.execute(), 'PieTap');
  }

  /** 1-based; null when no enabled item answers (or the numbers are hidden). */
  tryAccelerator(n: number): PieOutcome | null {
    if (!PieMenuSettings.ShowAccelerators) return null;
    const index = n - 1;
    if (index < 0 || index >= this.data.count || !this.data.items[index]?.isEnabled) return null;
    this.highlighted = index;
    return report(this.execute(), 'PieNumber');
  }

  private execute(): PieOutcome {
    if (this.highlighted < 0) return PieOutcome.Cancelled;
    const item = this.data.items[this.highlighted];
    if (!item || !item.isEnabled) return PieOutcome.Cancelled;
    item.action();
    return PieOutcome.Executed;
  }

  private recalculateSegment() {
    const origin = this.usesInitialCenter ? this.initCenter : this.spawnCenter;
    const offset = this.cursor.sub(origin);
    this.distance = offset.magnitude;
    if (this.distance > 1e-6) this.pieDirection = RadialDirections.toMath(offset.div(this.distance));
    this.invalidDirection = !this.aimed || this.distance < PieMenuSettings.Threshold;
    this.highlighted = PieLayout.select(this.data, this.pieDirection, this.invalidDirection);
  }
}

function report(outcome: PieOutcome, signal: string) {
  if (outcome === PieOutcome.Executed) SceneTutorial.report(signal);
  return outcome;
}

// Skipped when the view can't hold the pie: clamping would only drag it away from the cursor. Unity
// uses the wide-pill margin on both axes and warps the cursor along; a page can't warp the cursor, so
// vertically the pie moves only as far as its north and south pills need.
function clampToView(cursor: Vector2, view: SceneView) {
  const mx = PieMenuSettings.Radius + MaxItemExtent;
  const my = PieMenuSettings.Radius + PieMenuStyles.ItemHeight + 6;
  const size = view.cameraViewport.size;
  if (size.x < mx * 2 || size.y < my * 2) return cursor;
  return new Vector2(Mathf.Clamp(cursor.x, mx, size.x - mx), Mathf.Clamp(cursor.y, my, size.y - my));
}
