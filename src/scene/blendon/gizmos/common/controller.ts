// GizmoController (a tool gizmo driven from duringSceneGui) and GrabSession (a G/R/S grab with no handle).
import {
  EditorApplication,
  ShortcutManager,
  Tools,
  eventShortcutModifiers,
  type ShortcutArguments,
  type Tool,
} from '../../../unity/editor.ts';
import { EditorGUIUtility } from '../../../unity/handles.ts';
import { Event, EventType, GUIUtility, KeyCode, MouseButton } from '../../../unity/imgui.ts';
import { Quaternion, Rect, Vector3 } from '../../../unity/math.ts';
import type { Transform } from '../../../unity/scene.ts';
import { SceneView, type SceneCamera } from '../../../unity/sceneview.ts';
import { ModalViewportGate, SceneTutorial, SelectionCache } from '../../foundation.ts';
import { GeneralSettings } from '../../settings.ts';
import { GizmoAxis } from '../axis.ts';
import { DragKind, GizmoDragCoordinator } from '../core/drag.ts';
import { ModalNumericParser, ModalNumericState, TransformSpace } from '../core/numeric.ts';
import { CenterDotHandle } from '../handles/free-ring-handle.ts';
import {
  VertexEdgeHighlight,
  VertexPickHandle,
  VertexPivotGroup,
  VertexPreviewHandle,
} from '../handles/vertex-visuals.ts';
import { GizmoHud } from '../hud.ts';
import { SelectionPivot } from '../selection-pivot.ts';
import { PivotMode, SharedGizmoSettings } from '../shared-settings.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';
import { GizmoRegistry } from '../viewport-gesture.ts';
import { GizmoToolsOverride } from './layout.ts';

// Every self-driving gizmo, in construction order; TransformGizmo's parts share its coordinator.
const subscribed: GizmoController[] = [];
// The id one of our handles was last seen holding; only that one is ever released as stranded.
let ownedHotControl = 0;
let modalOwner: GizmoController | null = null;
let leftButtonDown = false;

function anyManipulation() {
  if (modalOwner) return true;
  return subscribed.some((c) => c.coordinator.activeKind !== DragKind.None);
}

GizmoRegistry.modalKey = (ev) => (modalOwner ? modalOwner.numeric.processEvent(ev) : false);
GizmoRegistry.hasModalSession = () => modalOwner != null;
GizmoRegistry.anyManipulation = anyManipulation;

function trackLeftButton(ev: Event) {
  if ((ev.type === EventType.MouseDown || ev.type === EventType.MouseDrag) && ev.button === MouseButton.LeftMouse)
    leftButtonDown = true;
  else if ((ev.type === EventType.MouseUp && ev.button === MouseButton.LeftMouse) || ev.type === EventType.MouseMove)
    leftButtonDown = false;
}

const ownsDragId = (id: number) => subscribed.some((c) => c.coordinator.snapshot.activeDragId === id);

function trackStrandedDrag(ev: Event) {
  const hot = GUIUtility.hotControl;
  if (hot === 0) {
    ownedHotControl = 0;
    return;
  }
  if (ownsDragId(hot)) ownedHotControl = hot;
  // A button-free move while our handle is still hot: its release never arrived.
  if (ev.type === EventType.MouseMove && hot === ownedHotControl) releaseStrandedDrags();
}

function releaseStrandedDrags() {
  if (modalOwner) return;
  const hot = GUIUtility.hotControl;
  if (hot !== 0) {
    if (hot !== ownedHotControl && !ownsDragId(hot)) return;
    GUIUtility.hotControl = 0;
  }
  ownedHotControl = 0;
  for (const c of subscribed) {
    if (c.coordinator.activeKind === DragKind.None && c.coordinator.snapshot.activeDragId === 0) continue;
    c.coordinator.forceRelease();
    c.numeric.reset();
  }
  GizmoHud.end();
  SceneView.repaintAll();
}

EditorApplication.focusChanged.add((hasFocus) => {
  if (!hasFocus) releaseStrandedDrags();
});

export const IndividualOrigins = {
  ownOrigins(coordinator: GizmoDragCoordinator) {
    return SharedGizmoSettings.PivotPoint === PivotMode.IndividualOrigins && multiple(coordinator);
  },
  localAxes(coordinator: GizmoDragCoordinator, numeric: ModalNumericParser) {
    const perObject =
      SharedGizmoSettings.PivotPoint === PivotMode.IndividualOrigins || SharedGizmoSettings.PerObjectLocalAxes;
    return perObject && multiple(coordinator) && IndividualOrigins.effectiveIsLocal(numeric);
  },
  perObjectLines(coordinator: GizmoDragCoordinator, numeric: ModalNumericParser) {
    return IndividualOrigins.ownOrigins(coordinator) || IndividualOrigins.localAxes(coordinator, numeric);
  },
  effectiveIsLocal(numeric: ModalNumericParser) {
    return (
      numeric.currentActiveSpace === TransformSpace.Local ||
      (!numeric.isSpaceExplicit && numeric.resolveDeferredIsLocal())
    );
  },
};

// Two or more snapshotted transforms and no vertex-snap pivot.
const multiple = (c: GizmoDragCoordinator) => c.snapshot.transforms.length >= 2 && !c.vertexModeActive;

export abstract class GizmoController {
  readonly coordinator: GizmoDragCoordinator;
  readonly numeric = new ModalNumericParser();

  protected constructor(coordinator: GizmoDragCoordinator) {
    this.coordinator = coordinator;
  }

  static get modalOwner() {
    return modalOwner;
  }
  static get hasModalSession() {
    return modalOwner != null;
  }
  static get anyManipulation() {
    return anyManipulation();
  }
  static get leftButtonDown() {
    return leftButtonDown;
  }
  protected static setModalOwner(owner: GizmoController | null) {
    modalOwner = owner;
  }

  protected abstract get toolType(): Tool;
  protected abstract get enabled(): boolean;
  protected get shouldDraw() {
    return this.enabled && Tools.current === this.toolType && SelectionCache.count !== 0;
  }
  protected get altArmed() {
    return false;
  }

  abstract gizmoPosition(): Vector3;
  abstract drawHandles(sceneView: SceneView, isOwner: boolean): void;

  protected onDeactivated() {
    if (this.coordinator.snapshot.activeDragId === 0 && this.coordinator.activeKind === DragKind.None) return;
    this.coordinator.cancel();
    this.numeric.reset();
    GizmoHud.end();
  }

  protected onBeforeDraw(_sceneView: SceneView) {}

  protected subscribeSceneGui() {
    SceneView.duringSceneGui.add(this.onSceneGUI);
    if (!subscribed.includes(this)) subscribed.push(this);
  }

  /** Cancels every other running drag; returns the first one's pivot before it moved. */
  static cancelOtherSessions(except: GizmoController): Vector3 | null {
    let pivotBeforeDrag: Vector3 | null = null;
    for (const c of subscribed) {
      if (c === except || c.coordinator.activeKind === DragKind.None) continue;
      pivotBeforeDrag ??= c.coordinator.pivotAtDragStart;
      c.coordinator.cancel();
    }
    return pivotBeforeDrag;
  }

  static otherActiveDragKind(except: GizmoController): DragKind {
    for (const c of subscribed)
      if (c !== except && c.coordinator.activeKind !== DragKind.None) return c.coordinator.activeKind;
    return DragKind.None;
  }

  private readonly onSceneGUI = (sceneView: SceneView) => {
    const ev = Event.current;
    trackLeftButton(ev);
    trackStrandedDrag(ev);
    this.onBeforeDraw(sceneView);
    if (!this.shouldDraw) {
      this.onDeactivated();
      GizmoToolsOverride.release(this);
      return;
    }
    GizmoToolsOverride.acquire(this);
    // A pie menu consumes every event these handles would read.
    if (ModalViewportGate.isBlocked) return;
    if (modalOwner && modalOwner !== this) return;
    const isOwner = this.coordinator.isOwner(sceneView);
    if (!isOwner && GeneralSettings.RestrictDragToActiveView) return;
    if (isOwner) this.coordinator.trackOwnerDrag(ev, sceneView.cameraViewport.size);
    const gizmoPosition = this.gizmoPosition();
    // Pick mode before a vertex is settled: only the ring marking what the next click would choose.
    if (VertexSnappingUtility.isPicking && !modalOwner) {
      VertexEdgeHighlight.draw(this.coordinator, gizmoPosition);
      VertexPreviewHandle.draw(this.coordinator);
      VertexPickHandle.draw();
      return;
    }
    // Under the handles: the edges run out of the point the gizmo stands on.
    VertexEdgeHighlight.draw(this.coordinator, gizmoPosition);
    const target = this.tryLiveSnapTarget();
    if (target) VertexEdgeHighlight.drawTarget(target.vertex, target.owner);
    this.drawHandles(sceneView, isOwner);
    // After the handles, which get first refusal on the press.
    if (this.coordinator.activeKind === DragKind.None) VertexPickHandle.handleRepick();
    VertexPreviewHandle.draw(this.coordinator);
    if (target) {
      VertexPreviewHandle.drawTarget(target.owner);
      VertexPreviewHandle.drawCandidate(target.vertex);
    }
    CenterDotHandle.draw(gizmoPosition, this.coordinator, 1, this.altArmed);
    if (isOwner && SharedGizmoSettings.TooltipInfoEnabled) this.drawHud(sceneView);
  };

  private tryLiveSnapTarget(): { vertex: Vector3; owner: Transform } | null {
    if (Event.current.type !== EventType.Repaint) return null;
    const k = this.coordinator.activeKind;
    if (k !== DragKind.Axis && k !== DragKind.Plane && k !== DragKind.FreeRing) return null;
    if (ModalNumericParser.anyNumericInput || !VertexSnappingUtility.hasTarget) return null;
    if (!VertexSnappingUtility.snapsToTarget) return null;
    const owner = VertexSnappingUtility.targetOwner;
    return owner ? { vertex: VertexSnappingUtility.targetVertex, owner } : null;
  }

  drawHud(sceneView: SceneView) {
    const s = SharedGizmoSettings;
    if (this.numeric.state === ModalNumericState.NumericInput)
      GizmoHud.drawNumericInput(sceneView, this.numeric, s.TooltipInfoTopOffset, s.TooltipInfoSnapToCursor);
    else GizmoHud.draw(sceneView, this.numeric, s.TooltipInfoTopOffset, s.TooltipInfoSnapToCursor);
  }

  protected handleRmbCancelAndNumeric(ev: Event, applyNumeric: () => void): boolean {
    // A grab key pressed mid-drag hands this drag over to that grab.
    if (
      this.coordinator.activeKind !== DragKind.None &&
      GrabSession.tryTakeOverFromDrag(ev, SceneView.currentDrawingSceneView, this.coordinator.activeKind)
    ) {
      ev.use();
      return true;
    }
    if (
      GeneralSettings.RmbCancelEnabled &&
      ev.rawType === EventType.MouseDown &&
      ev.button === MouseButton.RightMouse &&
      this.coordinator.snapshot.activeDragId !== 0
    ) {
      this.coordinator.cancel();
      ev.use();
      return true;
    }
    if (this.numeric.processEvent(ev)) {
      ev.use();
      if (this.numeric.state === ModalNumericState.NumericInput) applyNumeric();
    }
    if (VertexPickHandle.handleRmbCancel()) return true;
    // Escape leaves pick mode, the one Blendon state that otherwise persists.
    if (ev.type === EventType.KeyDown && ev.keyCode === KeyCode.Escape && VertexSnappingUtility.isPickMode) {
      VertexSnappingUtility.exitPickMode();
      ev.use();
      return true;
    }
    // Enter over a settled vertex gives the selection an empty parent standing on it.
    if (
      ev.type === EventType.KeyDown &&
      (ev.keyCode === KeyCode.Return || ev.keyCode === KeyCode.KeypadEnter) &&
      VertexSnappingUtility.hasPick &&
      !anyManipulation()
    ) {
      VertexPivotGroup.createAtPick();
      ev.use();
      return true;
    }
    return false;
  }

  protected static showDragCursor(sceneView: SceneView, cursor: string) {
    EditorGUIUtility.addCursorRect(new Rect(0, 0, sceneView.position.width, sceneView.position.height), cursor);
  }

  protected spaceRotation(space: number, explicitSpace: boolean) {
    return space === TransformSpace.Local
      ? this.localSpaceRotation()
      : explicitSpace
        ? Quaternion.identity
        : this.defaultSpaceRotation();
  }

  protected defaultSpaceRotation() {
    return Tools.handleRotation;
  }

  protected localSpaceRotation() {
    return Tools.handleRotation;
  }
}

// A request older than this was pressed where no pass could serve it.
const RequestLifetimeSeconds = 0.25;
const sessions: GrabSession[] = [];

export abstract class GrabSession extends GizmoController {
  private confirmOnRelease = false;
  private requestedAt = -Infinity;
  private requestedView: SceneView | null = null;
  active = false;

  protected constructor(coordinator: GizmoDragCoordinator) {
    super(coordinator);
    sessions.push(this);
    // A grab can follow the cursor unconstrained, so X, X, X drops the axis as in Blender.
    this.numeric.canReleaseConstraint = true;
    coordinator.onCancelled(() => this.endSession());
    this.numeric.onConfirm = () => this.confirm();
    this.numeric.onCancel = () => this.coordinator.cancel();
    this.numeric.onConstraintChanged = () => this.onConstraintChanged();
  }

  protected override get shouldDraw() {
    return this.active && SelectionCache.count !== 0;
  }
  protected abstract get bindingId(): string;
  protected abstract get grabKind(): DragKind;
  protected get grabAxis() {
    return GizmoAxis.X;
  }
  protected get numericSeedAxis(): GizmoAxis | null {
    return null;
  }
  protected abstract get dragCursor(): string;
  protected abstract ownsDragKind(kind: DragKind): boolean;
  protected abstract onSessionBegan(sceneView: SceneView, camera: SceneCamera, pivot: Vector3): void;
  protected abstract followCursor(): void;
  protected abstract applyNumeric(): void;
  protected abstract onConstraintChanged(): void;
  protected abstract drawSessionOverlays(sceneView: SceneView, isOwner: boolean): void;
  protected onInputPass(_sceneView: SceneView, _ev: Event) {}

  /** The shortcut fires outside a scene pass, so it leaves a request for the next pass of its view. */
  protected request(args: ShortcutArguments | SceneView | null) {
    if (ModalViewportGate.isBlocked) return;
    const view =
      args instanceof SceneView ? args : ((args?.context as SceneView | undefined) ?? SceneView.lastActiveSceneView);
    this.requestedView = view;
    this.requestedAt = EditorApplication.timeSinceStartup;
    view?.repaint();
  }

  static tryTakeOverFromDrag(ev: Event, sceneView: SceneView | null, activeKind: DragKind) {
    if (ev.type !== EventType.KeyDown || !sceneView) return false;
    if (ev.keyCode === KeyCode.None) return false;
    if (modalOwner) return false;
    const mods = eventShortcutModifiers(ev);
    for (const s of sessions) {
      if (!s.enabled || !ShortcutManager.matches(s.bindingId, ev.keyCode, mods)) continue;
      // Already this grab's own kind of operation: the key falls through and the drag goes on.
      if (s.ownsDragKind(activeKind)) return false;
      s.request(sceneView);
      return true;
    }
    return false;
  }

  private inheritsHeldButton() {
    return sessions.some((s) => s !== this && s.active && s.confirmOnRelease);
  }

  private consumeRequest(sceneView: SceneView) {
    if (this.requestedView !== sceneView) return false;
    if (EditorApplication.timeSinceStartup - this.requestedAt > RequestLifetimeSeconds) return false;
    this.requestedAt = -Infinity;
    this.requestedView = null;
    return true;
  }

  protected override onBeforeDraw(sceneView: SceneView) {
    if (this.consumeRequest(sceneView)) this.tryBegin(sceneView);
  }

  private tryBegin(sceneView: SceneView) {
    if (this.active || !this.enabled) return;
    const camera = sceneView.camera;
    if (this.ownsDragKind(GizmoController.otherActiveDragKind(this))) return;
    // Is the gesture this session joins still under a held button? Three signals cover every route in.
    const buttonHeld = leftButtonDown || GUIUtility.hotControl !== 0 || this.inheritsHeldButton();
    const pivotBeforeDrag = GizmoController.cancelOtherSessions(this);
    if (modalOwner || this.coordinator.activeKind !== DragKind.None) return;
    // A cancelled drag's pivot comes from the drag itself, not from where it had moved the selection.
    const pivot = pivotBeforeDrag ?? SelectionPivot.getPosition(SharedGizmoSettings.PivotPoint);
    this.coordinator.begin(this.grabKind, pivot, this.grabAxis, !buttonHeld);
    if (this.coordinator.snapshot.transforms.length === 0) {
      this.coordinator.end();
      return;
    }
    this.active = true;
    this.confirmOnRelease = buttonHeld;
    GizmoController.setModalOwner(this);
    this.numeric.beginMouseTransform(this.numericSeedAxis);
    this.onSessionBegan(sceneView, camera, pivot);
    SceneTutorial.reportShortcut(this.bindingId);
    sceneView.repaint();
  }

  override drawHandles(sceneView: SceneView, isOwner: boolean) {
    const ev = Event.current;
    if (isOwner) {
      this.coordinator.updateActiveView(sceneView.camera);
      this.onInputPass(sceneView, ev);
      if (this.handleRmbCancelAndNumeric(ev, () => this.applyNumeric())) return;
      this.track(sceneView, ev);
    }
    // No handles: nothing is left to grab, and no ids keeps the confirming click from starting a native drag.
    this.drawSessionOverlays(sceneView, isOwner);
    GizmoController.showDragCursor(sceneView, this.dragCursor);
  }

  private track(sceneView: SceneView, ev: Event) {
    // Releasing the button of the gesture this session took over is its confirm.
    if (this.confirmOnRelease && ev.type === EventType.MouseUp && ev.button === MouseButton.LeftMouse) {
      this.confirm();
      ev.use();
      sceneView.repaint();
      return;
    }
    // A right click the parser left alone is still swallowed, or the context menu opens over the grab.
    if (
      (ev.rawType === EventType.MouseDown || ev.rawType === EventType.MouseUp) &&
      ev.button === MouseButton.RightMouse &&
      ev.type !== EventType.Layout
    ) {
      ev.use();
      return;
    }
    if (ev.type === EventType.MouseMove) this.coordinator.wrap.update(ev.delta, sceneView.cameraViewport.size);
    else if (!(ev.type === EventType.MouseDrag && this.confirmOnRelease && ev.button === MouseButton.LeftMouse)) return;
    if (this.numeric.state !== ModalNumericState.NumericInput) this.followCursor();
    ev.use();
    sceneView.repaint();
  }

  protected confirm() {
    this.coordinator.forceRelease();
    this.endSession();
    SceneTutorial.report('TransformConfirmed');
  }

  // Nothing would end a grab once it stops drawing; it would resume mid-air later.
  protected override onDeactivated() {
    if (this.active) this.coordinator.cancel();
  }

  protected endSession() {
    GizmoHud.end();
    this.numeric.reset();
    this.active = false;
    this.confirmOnRelease = false;
    // Only a claim this session holds; a handed-over teardown runs after the next one claimed.
    if (modalOwner === this) GizmoController.setModalOwner(null);
  }
}
