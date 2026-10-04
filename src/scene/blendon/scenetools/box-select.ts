// BoxSelect: Blender's box select in the Scene view. A dragged box selects everything it touches, not
// only what fits inside it. The Editor still decides when a press becomes a box - its begin command
// takes hotControl - and this takes it straight back, as the plugin does.
import { BoxSelectIds, BEGIN_COMMAND } from '../../engine/unity-selection.ts';
import type { HighlightSets, IdCapture } from '../../render/renderer.ts';
import {
  EditorApplication,
  Prefs,
  Selection,
  ShortcutManager,
  Tool,
  Tools,
  Undo,
  eventShortcutModifiers,
} from '../../unity/editor.ts';
import { GUI } from '../../unity/handles.ts';
import { Event, EventType, GUIUtility, KeyCode } from '../../unity/imgui.ts';
import { Color, Rect, Vector2, Vector3 } from '../../unity/math.ts';
import { RectPicker } from '../../unity/raycast.ts';
import { Scene, type GameObject } from '../../unity/scene.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { GeneralSettings } from '../settings.ts';
import {
  BoxSelectCombinedMode,
  BoxSelectHighlightStyle,
  BoxSelectInfo,
  BoxSelectOutlineStyle,
  BoxSelectSettings,
  BoxSelectUpdate,
} from './settings.ts';

export const BoxSelectMode = { Replace: 0, Add: 1, Subtract: 2, Intersect: 3, Difference: 4 } as const;
type BoxSelectMode = (typeof BoxSelectMode)[keyof typeof BoxSelectMode];

const VisibleOnlyShortcutId = 'Blendon/Box Select Visible Only';
const MoveBoxShortcutId = 'Blendon/Box Select Move Box';

// The box starts inside the Editor's begin command; a fixed id far above the per-pass ones can't be
// mistaken for any handle's.
const ControlId = 0x426f7853;
// Past this many points from the press, a drag with nothing under it becomes a box.
const DragThreshold = 5;
// Dash and gap length of a dashed outline, in device pixels.
const DashSize = 4;
const InfoOffset = 16;
const InfoCornerRadius = 4;
const MaxListedNames = 8;
const MarkerSize = 18;
const FadeSeconds = 0.12;
const InfoFont = { size: 12, line: 16, padX: 7, padY: 4 };

// ---- Modes ----------------------------------------------------------------------------------------------

/** The held modifiers as the Editor's Box Select bindings read them. */
function holds(id: string, modifiers: number) {
  return ShortcutManager.matches(id, KeyCode.Mouse0, modifiers);
}

function modeFor(ev: Event): BoxSelectMode {
  const mods = eventShortcutModifiers(ev);
  const add = ShortcutManager.getShortcutBinding(BoxSelectIds.Add)?.modifiers ?? 0;
  const invert = ShortcutManager.getShortcutBinding(BoxSelectIds.Invert)?.modifiers ?? 0;
  if (add && invert && (mods & (add | invert)) === (add | invert))
    return BoxSelectSettings.CombinedMode === BoxSelectCombinedMode.Difference
      ? BoxSelectMode.Difference
      : BoxSelectMode.Intersect;
  if (holds(BoxSelectIds.Invert, mods)) return BoxSelectMode.Subtract;
  if (holds(BoxSelectIds.Add, mods)) return BoxSelectMode.Add;
  return BoxSelectMode.Replace;
}

// ---- What a box does to the selection -------------------------------------------------------------------

interface Change {
  /** The selection afterwards, active object first. */
  next: GameObject[];
  /** Hits that were not selected and will be, nearest the box's centre first. */
  added: GameObject[];
  /** Selected objects that will drop out, in the order they were selected. */
  removed: GameObject[];
}

/**
 * What the hits do to the selection the box started from - never the current one, which a live box keeps
 * rewriting. The active object stays active while it survives; otherwise the hit nearest the centre.
 */
function plan(baseline: GameObject[], active: GameObject | null, hits: GameObject[], mode: BoxSelectMode): Change {
  const selected = new Set(baseline);
  const hitSet = new Set(hits);
  const next: GameObject[] = [];
  const added: GameObject[] = [];
  const removed: GameObject[] = [];

  if (mode !== BoxSelectMode.Replace)
    for (const entry of baseline) {
      const under = hitSet.has(entry);
      const keeps = mode === BoxSelectMode.Add ? true : mode === BoxSelectMode.Intersect ? under : !under;
      if (keeps) next.push(entry);
      else removed.push(entry);
    }

  if (mode === BoxSelectMode.Replace || mode === BoxSelectMode.Add || mode === BoxSelectMode.Difference)
    for (const hit of hitSet) {
      const isNew = !selected.has(hit);
      if (isNew) added.push(hit);
      if (isNew || mode === BoxSelectMode.Replace) next.push(hit);
    }

  if (mode === BoxSelectMode.Replace) for (const entry of baseline) if (!hitSet.has(entry)) removed.push(entry);

  const lead = active && next.includes(active) ? active : (next.find((o) => hitSet.has(o)) ?? null);
  // The first entry is the active one, so whichever keeps that role goes to the front.
  if (lead) {
    next.splice(next.indexOf(lead), 1);
    next.unshift(lead);
  }
  return { next, added, removed };
}

/** Only what the release changes is marked; Intersect marks what stays, since what drops lies outside. */
function marked(mode: BoxSelectMode, hits: GameObject[], change: Change) {
  switch (mode) {
    case BoxSelectMode.Replace:
      return { selects: hits, deselects: [] };
    case BoxSelectMode.Add:
      return { selects: change.added, deselects: [] };
    case BoxSelectMode.Subtract:
      return { selects: [], deselects: change.removed };
    case BoxSelectMode.Intersect:
      return { selects: change.next, deselects: [] };
    default:
      return { selects: change.added, deselects: change.removed };
  }
}

function readout(mode: BoxSelectMode, hits: GameObject[], change: Change, count: boolean, names: boolean) {
  const lines: string[] = [];
  if (count && (hits.length > 0 || change.added.length > 0 || change.removed.length > 0)) {
    let line = `${change.next.length} selected`;
    const parts = [];
    if (change.added.length) parts.push('+' + change.added.length);
    if (change.removed.length) parts.push('-' + change.removed.length);
    if (parts.length) line += ` (${parts.join(', ')})`;
    lines.push(line);
  }
  if (names) {
    const { selects, deselects } = marked(mode, hits, change);
    // Only where the box adds to what stays selected; a plain box or Intersect lists the result as is.
    const prefix = mode === BoxSelectMode.Add || mode === BoxSelectMode.Difference ? '+ ' : '';
    const total = selects.length + deselects.length;
    let listed = 0;
    for (const go of selects) {
      if (listed === MaxListedNames) break;
      lines.push(prefix + go.name);
      listed++;
    }
    for (const go of deselects) {
      if (listed === MaxListedNames) break;
      lines.push('- ' + go.name);
      listed++;
    }
    if (total > listed) lines.push(`... and ${total - listed} more`);
  }
  return lines.length ? lines : null;
}

function sameSelection(next: GameObject[]) {
  const cur = Selection.objects;
  if (cur.length !== next.length) return false;
  if (next.length > 0 && next[0] !== Selection.activeGameObject) return false;
  const set = new Set(cur);
  return next.every((o) => set.has(o));
}

/** Writes the change as one undo step, or nothing when it already is the selection. */
function apply(change: Change) {
  if (sameSelection(change.next)) return;
  Undo.incrementCurrentGroup();
  Undo.setCurrentGroupName('Box Select');
  Selection.set(change.next, change.next[0] ?? null);
}

// ---- Hits ------------------------------------------------------------------------------------------------

const projectorFor = (view: SceneView) => {
  const c = view.camera;
  const k = view.pixelsPerPoint || 1;
  return (p: Vector3) => {
    const s = c.worldToScreenPoint(p);
    return new Vector3(s.x / k, (c.pixelHeight - s.y) / k, s.z);
  };
};

/** Visible Only: the pixels each candidate owns, read once while the box is held. */
class Visibility {
  private readonly cap: IdCapture;
  private readonly boxes = new Map<number, Rect>();

  constructor(cap: IdCapture) {
    this.cap = cap;
    const { width, height, data } = cap;
    const ext = new Map<number, [number, number, number, number]>();
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const id = data[i] | (data[i + 1] << 8) | (data[i + 2] << 16);
        if (!id) continue;
        const e = ext.get(id);
        if (!e) ext.set(id, [x, y, x, y]);
        else {
          if (x < e[0]) e[0] = x;
          if (x > e[2]) e[2] = x;
          if (y < e[1]) e[1] = y;
          if (y > e[3]) e[3] = y;
        }
      }
    // Rows come bottom first; GUI points run top down.
    const s = cap.scale;
    for (const [id, [x0, y0, x1, y1]] of ext)
      this.boxes.set(id, Rect.minMax(x0 / s, (height - 1 - y1) / s, (x1 + 1) / s, (height - y0) / s));
  }

  /** Ids (index + 1) whose visible pixels the rect touches, or wholly holds. */
  hits(rect: Rect, fullyEnclosed: boolean) {
    const out = new Set<number>();
    if (fullyEnclosed) {
      for (const [id, b] of this.boxes)
        if (b.xMin >= rect.xMin && b.xMax <= rect.xMax && b.yMin >= rect.yMin && b.yMax <= rect.yMax) out.add(id);
      return out;
    }
    const { width, height, data, scale } = this.cap;
    const x0 = Math.max(0, Math.floor(rect.xMin * scale)),
      x1 = Math.min(width - 1, Math.ceil(rect.xMax * scale));
    const r0 = Math.max(0, Math.floor(height - rect.yMax * scale)),
      r1 = Math.min(height - 1, Math.ceil(height - rect.yMin * scale));
    // Objects whose visible bounds miss the rect are never scanned for.
    let left = 0;
    for (const b of this.boxes.values())
      if (b.xMin <= rect.xMax && b.xMax >= rect.xMin && b.yMin <= rect.yMax && b.yMax >= rect.yMin) left++;
    for (let y = r0; y <= r1 && left > out.size; y++) {
      let i = (y * width + x0) * 4;
      for (let x = x0; x <= x1; x++, i += 4) {
        const id = data[i] | (data[i + 1] << 8) | (data[i + 2] << 16);
        if (id) out.add(id);
      }
    }
    return out;
  }
}

class Drag {
  readonly view: SceneView;
  start: Vector2;
  end: Vector2;
  mode: BoxSelectMode;
  readonly undoGroup = Undo.getCurrentGroup();
  readonly baseline = Selection.objects;
  readonly baselineActive = Selection.activeGameObject;
  appliedLive = false;
  moving = false;
  visibleOnlyKeyHeld = false;
  hits: GameObject[] | null = null;
  resolvedFor: string | null = null;
  info: string[] | null = null;
  readonly picker: RectPicker;
  readonly candidates: GameObject[];
  private visibility: Visibility | null | undefined;

  constructor(view: SceneView, start: Vector2, end: Vector2, mode: BoxSelectMode) {
    this.view = view;
    this.start = start;
    this.end = end;
    this.mode = mode;
    this.candidates = [...(Scene.current?.allObjects() ?? [])].filter((go) => go.mesh && go.visible && go.pickable);
    this.picker = new RectPicker(this.candidates, projectorFor(view));
  }

  /** Clamped to the viewport as the Editor clamps its own box, so dragging past an edge selects up to it. */
  get rect() {
    const size = this.view.cameraViewport.size;
    const clamp = (p: Vector2) => new Vector2(Math.min(Math.max(p.x, 0), size.x), Math.min(Math.max(p.y, 0), size.y));
    const a = clamp(this.start),
      b = clamp(this.end);
    return Rect.minMax(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
  }

  /** Captured on first use; null when the view could not be read, which tests every object whole. */
  visibilityRead() {
    if (this.visibility === undefined) {
      const cap = this.view.captureIds?.(this.candidates);
      this.visibility = cap ? new Visibility(cap) : null;
    }
    return this.visibility;
  }

  resolve(rect: Rect) {
    const enclosed = BoxSelectSettings.RequireFullyEnclosed;
    const vis = BoxSelectSettings.VisibleOnly ? this.visibilityRead() : null;
    let hits: GameObject[];
    if (vis) {
      const ids = vis.hits(rect, enclosed);
      hits = this.candidates.filter((_, i) => ids.has(i + 1));
    } else hits = this.picker.pick(rect, enclosed);
    return sortByDistance(hits, this.view, rect.center);
  }

  change(hits: GameObject[]) {
    return plan(this.baseline, this.baselineActive, hits, this.mode);
  }
}

function sortByDistance(hits: GameObject[], view: SceneView, center: Vector2) {
  const project = projectorFor(view);
  const d = new Map<GameObject, number>();
  for (const go of hits) {
    const p = project(go.transform.position);
    d.set(go, p.z > 0 ? p.xy.sub(center).sqrMagnitude : Number.MAX_VALUE);
  }
  return hits.sort((a, b) => d.get(a)! - d.get(b)!);
}

// ---- The gesture -----------------------------------------------------------------------------------------

let pressView: SceneView | null = null;
let pressAt = Vector2.zero;
let lastDragAt = Vector2.zero;
let hotBeforeCommand = -1;
let drag: Drag | null = null;

// What the last release left fading in its view.
let fade: { view: SceneView; sets: HighlightSets; start: number } | null = null;

function repaint(view: SceneView) {
  view.repaint();
}

function begin(view: SceneView, ev: Event) {
  drag = new Drag(view, pressAt, lastDragAt, modeFor(ev));
  clearFade();
  GUIUtility.hotControl = ControlId;
  // Keys reach a running box as events, as with the Editor's Shortcut Manager standing down.
  GUIUtility.keyboardControl = ControlId;
  updateWhileDragging(drag);
  repaint(view);
}

function end(fadeHighlight: boolean) {
  const d = drag;
  if (GUIUtility.hotControl === ControlId) GUIUtility.hotControl = 0;
  if (GUIUtility.keyboardControl === ControlId) GUIUtility.keyboardControl = 0;
  drag = null;
  if (!d) return;
  const sets = d.view.highlight;
  d.view.highlight = null;
  if (fadeHighlight && sets) startFade(d.view, sets);
}

/** Drops a running box and leaves the selection as it was before it started. */
function cancel() {
  const d = drag;
  if (d?.appliedLive) {
    Undo.revertAllDownToGroup(d.undoGroup + 1);
    apply(plan(d.baseline, d.baselineActive, [], BoxSelectMode.Add));
  }
  end(false);
  if (d) repaint(d.view);
}

function commit(d: Drag) {
  // The release selects exactly what was shown while dragging.
  const hits = d.hits && d.resolvedFor === rectKey(d.rect) ? d.hits : d.resolve(d.rect);
  const change = d.change(hits);
  end(true);
  apply(change);
  // Live pushes one undo step per move; folded into the one the user asks to undo.
  Undo.collapseUndoOperations(d.undoGroup + 1);
  repaint(d.view);
}

const rectKey = (r: Rect) => `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}`;

function updateWhileDragging(d: Drag) {
  const update = BoxSelectSettings.SelectionUpdate;
  if (update === BoxSelectUpdate.OnRelease && BoxSelectSettings.CursorInfo === BoxSelectInfo.None) return;
  const rect = d.rect;
  const key = rectKey(rect);
  if (d.resolvedFor === key) return;
  d.resolvedFor = key;
  d.hits = d.resolve(rect);
  present(d);
}

/** Shows what the hits and the mode mean, however the box is set to show it. */
function present(d: Drag) {
  const hits = d.hits;
  if (!hits) return;
  const change = d.change(hits);
  const info = BoxSelectSettings.CursorInfo;
  d.info =
    info !== BoxSelectInfo.None
      ? readout(d.mode, hits, change, info !== BoxSelectInfo.Names, info !== BoxSelectInfo.Count)
      : null;

  switch (BoxSelectSettings.SelectionUpdate) {
    case BoxSelectUpdate.Live:
      apply(change);
      d.appliedLive = true;
      d.view.highlight = null;
      break;
    case BoxSelectUpdate.Highlight: {
      const { selects, deselects } = marked(d.mode, hits, change);
      d.view.highlight = highlightSets(selects, deselects);
      break;
    }
    default:
      d.view.highlight = null;
  }
}

const rgba = (c: Color): [number, number, number, number] => [c.r, c.g, c.b, c.a];

/** Children too, as the Editor outlines a selected object's children. */
function withChildren(list: GameObject[]) {
  const out = new Set<GameObject>();
  for (const go of list) for (const t of go.transform.walk()) if (t.gameObject.mesh) out.add(t.gameObject);
  return [...out];
}

function highlightSets(selects: GameObject[], deselects: GameObject[]): HighlightSets | null {
  if (!selects.length && !deselects.length) return null;
  const style = BoxSelectSettings.HighlightStyle;
  return {
    selects: withChildren(selects),
    deselects: withChildren(deselects),
    markers: [...selects, ...deselects].filter((go) => !withChildren([go]).length),
    markerOf: new Set(deselects),
    selectColor: rgba(BoxSelectSettings.HighlightColor),
    deselectColor: rgba(BoxSelectSettings.DeselectHighlightColor),
    fill: style !== BoxSelectHighlightStyle.Outline,
    outline: style !== BoxSelectHighlightStyle.Fill,
    width: BoxSelectSettings.HighlightOutlineWidth,
    occludedOpacity: BoxSelectSettings.HighlightOccludedOpacity,
    alpha: 1,
  };
}

// A committed highlight lingers a moment over the selection outline taking its place, outline only.
function startFade(view: SceneView, sets: HighlightSets) {
  fade = { view, sets: { ...sets, fill: false, outline: true }, start: EditorApplication.timeSinceStartup };
  view.highlight = fade.sets;
  EditorApplication.update.add(tickFade);
}

function tickFade() {
  if (!fade) return EditorApplication.update.remove(tickFade);
  const t = (EditorApplication.timeSinceStartup - fade.start) / FadeSeconds;
  if (t >= 1) {
    const view = fade.view;
    clearFade();
    repaint(view);
    return;
  }
  fade.sets.alpha = 1 - t;
  fade.view.highlight = fade.sets;
  repaint(fade.view);
}

function clearFade() {
  EditorApplication.update.remove(tickFade);
  if (fade && fade.view.highlight === fade.sets) fade.view.highlight = null;
  fade = null;
}

function updateMode(d: Drag, ev: Event) {
  const mode = modeFor(ev);
  if (mode === d.mode) return;
  d.mode = mode;
  present(d);
  repaint(d.view);
}

function toggleVisibleOnly(view: SceneView | null) {
  const on = !BoxSelectSettings.VisibleOnly;
  Prefs.set('BoxSelectSettings.VisibleOnly', on);
  view?.showNotification(on ? 'Visible Only' : 'Select Through', 1);
  if (drag) {
    // The running box resolves again against the new rule.
    drag.resolvedFor = null;
    updateWhileDragging(drag);
  }
  view?.repaint();
}

const bindingMatches = (id: string, ev: Event, anyModifiers: boolean) => {
  const b = ShortcutManager.getShortcutBinding(id);
  return !!b && b.keyCode === ev.keyCode && (anyModifiers || b.modifiers === eventShortcutModifiers(ev));
};

/** Keys reach a running box as events: Escape cancels, Move Box carries it, Visible Only flips the rule. */
function handleKey(d: Drag, ev: Event) {
  if (ev.type === EventType.KeyDown && ev.keyCode === KeyCode.Escape) {
    cancel();
    ev.use();
    return true;
  }
  if (ev.type === EventType.KeyDown && bindingMatches(MoveBoxShortcutId, ev, true)) {
    d.moving = true;
    ev.use();
    return true;
  }
  if (ev.type === EventType.KeyUp && bindingMatches(MoveBoxShortcutId, ev, true)) {
    d.moving = false;
    ev.use();
    return true;
  }
  if (ev.type === EventType.KeyDown && bindingMatches(VisibleOnlyShortcutId, ev, false)) {
    if (!d.visibleOnlyKeyHeld) toggleVisibleOnly(d.view);
    d.visibleOnlyKeyHeld = true;
    ev.use();
    return true;
  }
  if (ev.type === EventType.KeyUp && bindingMatches(VisibleOnlyShortcutId, ev, true)) {
    d.visibleOnlyKeyHeld = false;
    return true;
  }
  return false;
}

function onBeforeSceneGui(view: SceneView) {
  const e = Event.current;
  switch (e.rawType) {
    case EventType.MouseDown:
      if (e.button === 0) {
        pressView = view;
        pressAt = e.mousePosition;
        lastDragAt = e.mousePosition;
      }
      break;
    case EventType.MouseDrag:
      if (view === pressView && e.button === 0) lastDragAt = e.mousePosition;
      break;
    case EventType.MouseUp:
      if (e.button === 0) pressView = null;
      break;
    case EventType.MouseMove:
      pressView = null;
      break;
  }
  // The Editor's rect selection runs between this and duringSceneGui; this is hotControl before it.
  if (e.type === EventType.ExecuteCommand && e.commandName === BEGIN_COMMAND) hotBeforeCommand = GUIUtility.hotControl;
}

function onDuringSceneGui(view: SceneView) {
  const e = Event.current;
  const d = drag;

  if (!d) {
    tryBegin(view, e);
    tryBeginCombined(view, e);
    if (e.type === EventType.Repaint && fade?.view === view) drawMarkers(view, fade.sets);
    return;
  }
  if (view !== d.view) return;

  if (e.rawType === EventType.MouseUp && e.button === 0) {
    if (e.type === EventType.MouseUp) d.end = e.mousePosition;
    e.use();
    commit(d);
    return;
  }

  // Something else taking hotControl, or Blendon standing down, means the box lost the drag.
  if (GUIUtility.hotControl !== ControlId || !BoxSelectSettings.Enabled || ViewportGesture.busy) {
    cancel();
    return;
  }

  if (e.rawType === EventType.MouseDown && e.button === 1 && GeneralSettings.RmbCancelEnabled) {
    cancel();
    e.use();
    return;
  }

  if (e.type === EventType.MouseDrag || e.type === EventType.KeyDown || e.type === EventType.KeyUp) updateMode(d, e);
  if (handleKey(d, e)) return;

  switch (e.type) {
    case EventType.MouseDrag:
      if (d.moving) d.start = d.start.add(e.mousePosition.sub(d.end));
      d.end = e.mousePosition;
      e.use();
      updateWhileDragging(d);
      repaint(view);
      break;
    // Only fires with no button held, so the release happened somewhere this never saw.
    case EventType.MouseMove:
      cancel();
      break;
    case EventType.Repaint:
      draw(d);
      break;
  }
}

// hotControl leaving zero on this very command is the Editor's rect selection accepting the drag.
function tryBegin(view: SceneView, e: Event) {
  if (e.type !== EventType.ExecuteCommand || e.commandName !== BEGIN_COMMAND) return;
  const hotBefore = hotBeforeCommand;
  hotBeforeCommand = -1;
  if (hotBefore !== 0 || GUIUtility.hotControl === 0) return;
  if (!BoxSelectSettings.Enabled || ViewportGesture.busy) return;
  if (view !== pressView) {
    GUIUtility.hotControl = 0;
    return;
  }
  begin(view, e);
}

// No Box Select binding holds the add and invert modifiers together, so the Editor never starts that box.
function tryBeginCombined(view: SceneView, e: Event) {
  if (e.type !== EventType.MouseDrag || e.button !== 0 || view !== pressView) return;
  if (GUIUtility.hotControl !== 0 || !BoxSelectSettings.Enabled || ViewportGesture.busy) return;
  if (Tools.current === Tool.View || Tools.viewToolActive) return;
  if (e.mousePosition.sub(pressAt).sqrMagnitude < DragThreshold * DragThreshold) return;
  const mode = modeFor(e);
  if (mode !== BoxSelectMode.Difference && mode !== BoxSelectMode.Intersect) return;
  begin(view, e);
  e.use();
}

// ---- Drawing ---------------------------------------------------------------------------------------------

function draw(d: Drag) {
  const ctx = GUI.ctx;
  if (!ctx) return;
  const rect = d.rect;
  if (d.view.highlight) drawMarkers(d.view, d.view.highlight);
  if (rect.width < 1 && rect.height < 1) return;

  ctx.save();
  ctx.fillStyle = BoxSelectSettings.FillColor.css();
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  const style = BoxSelectSettings.OutlineStyle;
  const px = 1 / (d.view.pixelsPerPoint || 1);
  ctx.strokeStyle = BoxSelectSettings.OutlineColor.css();
  ctx.lineWidth = px;
  if (style !== BoxSelectOutlineStyle.Solid) {
    const dash = (style === BoxSelectOutlineStyle.DashedDense ? DashSize * 0.5 : DashSize) * px;
    ctx.setLineDash([dash, dash]);
  }
  ctx.strokeRect(rect.x + px / 2, rect.y + px / 2, rect.width - px, rect.height - px);
  ctx.restore();

  if (d.info && BoxSelectSettings.CursorInfo !== BoxSelectInfo.None) drawInfo(d, rect, d.info);
}

// Hangs off the cursor's corner of the box towards the opposite one, so it always sits inside the box.
function drawInfo(d: Drag, box: Rect, lines: string[]) {
  const ctx = GUI.ctx!;
  ctx.save();
  ctx.font = `600 ${InfoFont.size}px Inter, system-ui, sans-serif`;
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + InfoFont.padX * 2;
  const h = lines.length * InfoFont.line + InfoFont.padY * 2;
  const size = d.view.cameraViewport.size;
  let x = d.end.x >= d.start.x ? box.xMax - InfoOffset - w : box.xMin + InfoOffset;
  let y = d.end.y >= d.start.y ? box.yMax - InfoOffset - h : box.yMin + InfoOffset;
  x = Math.round(Math.min(Math.max(x, 0), Math.max(0, size.x - w)));
  y = Math.round(Math.min(Math.max(y, 0), Math.max(0, size.y - h)));
  ctx.fillStyle = BoxSelectSettings.NamesBackgroundColor.css();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, InfoCornerRadius);
  ctx.fill();
  ctx.fillStyle = BoxSelectSettings.NamesTextColor.css();
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, x + InfoFont.padX, y + InfoFont.padY + InfoFont.line * (i + 0.5)));
  ctx.restore();
}

/** A square for each marked object with nothing to draw - an empty, here. */
function drawMarkers(view: SceneView, sets: HighlightSets) {
  const ctx = GUI.ctx;
  if (!ctx || !sets.markers.length) return;
  const project = projectorFor(view);
  ctx.save();
  for (const go of sets.markers) {
    const p = project(go.transform.position);
    if (p.z <= 0) continue;
    const c = sets.markerOf.has(go) ? sets.deselectColor : sets.selectColor;
    const color = new Color(c[0], c[1], c[2], 1);
    ctx.fillStyle = sets.fill ? new Color(c[0], c[1], c[2], c[3]).css() : 'transparent';
    ctx.strokeStyle = color.css();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(p.x - MarkerSize / 2 + 0.5, p.y - MarkerSize / 2 + 0.5, MarkerSize - 1, MarkerSize - 1);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// ---- Install -----------------------------------------------------------------------------------------------

/** The selection arithmetic, for the tests. */
export const BoxSelectResolver = { plan, marked, readout };

export const BoxSelect = {
  VisibleOnlyShortcutId,
  MoveBoxShortcutId,

  get isDragging() {
    return drag !== null;
  },

  cancel,

  install() {
    SceneView.beforeSceneGui.add(onBeforeSceneGui);
    SceneView.duringSceneGui.add(onDuringSceneGui);
    EditorApplication.focusChanged.add((has) => {
      if (has) return;
      pressView = null;
      cancel();
    });
    ShortcutManager.register(
      VisibleOnlyShortcutId,
      () => {
        if (!BoxSelectSettings.Enabled || ViewportGesture.busy) return;
        toggleVisibleOnly(SceneView.lastActiveSceneView);
      },
      false,
      'C',
    );
  },
};
