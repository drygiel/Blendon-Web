// Vertex snapping visuals: the selection's vertex field, the pick ring, the edge star and the pivot group.
// The canvas has no depth buffer, so "behind something" is a ray cast toward the camera.
import { Selection, SelectionMode, Undo } from '../../../unity/editor.ts';
import { EditorGUIUtility, GUI, HandleUtility, Handles } from '../../../unity/handles.ts';
import { Event, EventType, FocusType, GUIUtility, KeyCode, MouseButton } from '../../../unity/imgui.ts';
import { Color, Mathf, Ray, Vector2, Vector3 } from '../../../unity/math.ts';
import { raycastObject } from '../../../unity/raycast.ts';
import { GameObject, Scene, type Mesh, type Transform } from '../../../unity/scene.ts';
import { Camera, SceneView, type SceneCamera } from '../../../unity/sceneview.ts';
import { withAlpha, withFade } from '../../color.ts';
import { SelectionCache } from '../../foundation.ts';
import { GeneralSettings } from '../../settings.ts';
import { GizmoColors } from '../colors.ts';
import { DragKind, type GizmoDragCoordinator } from '../core/drag.ts';
import { DrawPrimitives, GizmoRenderer, ScreenScale } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';

const OutlinePixels = 1;

/** Whether nothing in the scene sits between the camera and a point lifted `liftWorld` toward it. */
function visible(cam: SceneCamera, point: Vector3, liftWorld: number) {
  const toPoint = point.sub(cam.position);
  const dist = cam.orthographic ? Vector3.dot(toPoint, cam.forward) : toPoint.magnitude;
  const limit = dist - liftWorld;
  if (limit <= 0) return true;
  const dir = cam.orthographic ? cam.forward : toPoint.div(dist);
  const origin = cam.orthographic ? point.sub(dir.mul(dist)) : cam.position;
  const ray = new Ray(origin, dir);
  const scene = Scene.current;
  if (!scene) return true;
  for (const go of scene.allObjects()) {
    if (!go.mesh || !go.pickable || !go.visible) continue;
    const h = raycastObject(go, ray, limit);
    if (h && h.distance < limit) return false;
  }
  return true;
}

// ---- VertexPreviewHandle --------------------------------------------------------------------------------

const MaxVerticesPerObject = 500;
const MaxVerticesTotal = 4000;
const TargetMarkerScale = 0.6;
// Depth lift toward the camera before the visibility test: a marker sits on the surface it marks.
const PreviewLiftPixels = 64;

/** Constant-size screen squares, one per sampled vertex. */
class MarkerBatch {
  readonly halfPx: number;
  private readonly cam: SceneCamera;
  private readonly ppp: number;
  private readonly worldPerPixelUnit: number;
  private readonly view: Vector2;

  private constructor(cam: SceneCamera, scale: number) {
    this.cam = cam;
    this.ppp = Math.max(1, EditorGUIUtility.pixelsPerPoint);
    const s = ScreenScale.tryBegin();
    this.worldPerPixelUnit = s ? s.worldPerDevicePixel(1) : 0;
    const probe = cam.position.add(cam.forward);
    const halfWorld = scale * HandleUtility.getHandleSize(probe) * SharedGizmoSettings.CenterDotRadius;
    this.halfPx = this.worldPerPixelUnit > 0 ? Math.max(1, Math.round(halfWorld / this.worldPerPixelUnit)) : 1;
    this.view = new Vector2(cam.pixelWidth / this.ppp, cam.pixelHeight / this.ppp);
  }

  static tryBegin(scale = 1) {
    const cam = Camera.current;
    if (!cam) return null;
    const b = new MarkerBatch(cam, scale);
    return b.worldPerPixelUnit > 0 ? b : null;
  }

  /** GUI centre, snapped to the device pixel grid, and whether it shows; null off screen. */
  build(world: Vector3, testDepth: boolean): { x: number; y: number; visible: boolean } | null {
    const g = HandleUtility.worldToGUIPointWithDepth(world);
    if (g.z <= 0) return null;
    const m = 64;
    if (g.x < -m || g.y < -m || g.x > this.view.x + m || g.y > this.view.y + m) return null;
    const wpp = this.cam.orthographic ? this.worldPerPixelUnit : this.worldPerPixelUnit * g.z;
    return {
      x: Math.round(g.x * this.ppp) / this.ppp,
      y: Math.round(g.y * this.ppp) / this.ppp,
      visible: !testDepth || visible(this.cam, world, (PreviewLiftPixels + 1) * wpp),
    };
  }

  drawSquare(x: number, y: number, halfPx: number, color: Color) {
    const ctx = GUI.ctx;
    if (!ctx || color.a <= 0) return;
    const h = halfPx / this.ppp;
    ctx.fillStyle = color.css();
    ctx.fillRect(x - h, y - h, h * 2, h * 2);
  }
}

const sampled = new Map<Mesh, Vector3[]>();

function sampledOf(mesh: Mesh, budget: number) {
  const key = mesh;
  const cached = sampled.get(key);
  const total = mesh.vertexCount;
  const stride = Math.max(1, Math.floor(total / budget));
  // Split corners of a hard-edged mesh share a position; one marker each is enough.
  if (cached && cached.length <= Math.ceil(total / stride)) return cached;
  const seen = new Set<string>();
  const out: Vector3[] = [];
  for (let i = 0; i < total; i += stride) {
    const v = mesh.vertices[i];
    const k = `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  sampled.set(key, out);
  return out;
}

function collect(transforms: Transform[], budget: number, batch: MarkerBatch) {
  const out: { x: number; y: number; visible: boolean }[] = [];
  for (const t of transforms) {
    const mesh = t.gameObject.mesh;
    if (!mesh) continue;
    const m = t.localToWorldMatrix;
    for (const p of sampledOf(mesh, budget)) {
      if (out.length >= MaxVerticesTotal) return out;
      const b = batch.build(m.multiplyPoint3x4(p), true);
      if (b) out.push(b);
    }
  }
  return out;
}

function drawMarkers(markers: { x: number; y: number; visible: boolean }[], batch: MarkerBatch) {
  for (const k of [false, true]) {
    const fill = k ? GizmoColors.VertexPreview : GizmoColors.VertexPreviewOccluded;
    const outline = withAlpha(GizmoColors.Outline, fill.a * 0.1);
    for (const m of markers) if (m.visible === k) batch.drawSquare(m.x, m.y, batch.halfPx + OutlinePixels, outline);
    for (const m of markers) if (m.visible === k) batch.drawSquare(m.x, m.y, batch.halfPx, fill);
  }
}

export const VertexPreviewHandle = {
  /** The field of points a drag could pick up, while V is held and nothing is being dragged. */
  draw(coordinator: GizmoDragCoordinator) {
    if (Event.current.type !== EventType.Repaint) return;
    if (coordinator.activeKind !== DragKind.None || !VertexSnappingUtility.isActive || VertexSnappingUtility.hasPick) return;
    const batch = MarkerBatch.tryBegin();
    if (!batch) return;
    const selection = SelectionCache.deep;
    const budget = Mathf.Clamp(Math.floor(MaxVerticesTotal / Math.max(1, selection.length)), 8, MaxVerticesPerObject);
    drawMarkers(collect(selection, budget, batch), batch);
  },

  /** The object a snap is landing on, in smaller markers. */
  drawTarget(owner: Transform) {
    if (Event.current.type !== EventType.Repaint) return;
    const batch = MarkerBatch.tryBegin(TargetMarkerScale);
    if (!batch) return;
    drawMarkers(collect([owner], MaxVerticesPerObject, batch), batch);
  },

  /** The one vertex the click or snap would use, outlined at full strength and never hidden. */
  drawCandidate(world: Vector3) {
    if (Event.current.type !== EventType.Repaint) return;
    const batch = MarkerBatch.tryBegin();
    const b = batch?.build(world, false);
    if (!batch || !b) return;
    const color = GizmoColors.VertexPickCandidate;
    batch.drawSquare(b.x, b.y, batch.halfPx + OutlinePixels, withAlpha(GizmoColors.Outline, color.a));
    batch.drawSquare(b.x, b.y, batch.halfPx, color);
  },
};

// ---- VertexPickHandle -------------------------------------------------------------------------------------

// Ring radius as a fraction of handle size.
const RadiusFactor = 0.12;
const ClickSlackSquared = 25;
// Whether the last repaint had a vertex to ring; the mode only claims clicks while it does.
let canPick = true;
let rmbArmed = false;
let rmbDownPosition = Vector2.zero;

function tryCandidate() {
  return VertexSnappingUtility.tryGetGrabPoint(Event.current.mousePosition, SelectionCache.deep);
}

function clickedOnSelection(guiPoint: Vector2) {
  const picked = HandleUtility.pickGameObject(guiPoint, false) as GameObject | null;
  return !!picked && SelectionCache.deep.some((t) => t.gameObject === picked);
}

export const VertexPickHandle = {
  /** Pick mode before a vertex is settled: a ring on the candidate, and the click settles it. */
  draw() {
    const ev = Event.current;
    const id = GUIUtility.getControlID(FocusType.Passive);
    if (VertexPickHandle.handleRmbCancel()) return;
    switch (ev.type) {
      case EventType.Layout:
        // Claims the viewport so the Editor's own picking can't change the selection under the choice.
        if (canPick) HandleUtility.addDefaultControl(id);
        break;
      case EventType.MouseDown:
        if (ev.button === 0 && !ev.alt && canPick) {
          GUIUtility.hotControl = id;
          ev.use();
        }
        break;
      case EventType.MouseUp:
        if (ev.button === 0 && GUIUtility.hotControl === id) {
          GUIUtility.hotControl = 0;
          const settled = tryCandidate();
          if (settled) VertexSnappingUtility.confirmPick(settled);
          ev.use();
        }
        break;
      case EventType.KeyDown:
        if (ev.keyCode === KeyCode.Escape) {
          VertexSnappingUtility.exitPickMode();
          ev.use();
        }
        break;
      case EventType.Repaint: {
        const candidate = tryCandidate();
        canPick = !!candidate;
        if (candidate) VertexSnappingUtility.setHoverCandidate(candidate);
        else VertexSnappingUtility.clearHoverCandidate();
        if (candidate) {
          VertexPreviewHandle.drawCandidate(candidate);
          Handles.color = GizmoColors.VertexPickRing;
          DrawPrimitives.drawAACircle(
            candidate,
            GizmoRenderer.cameraNormal(),
            HandleUtility.getHandleSize(candidate) * RadiusFactor,
            SharedGizmoSettings.ScreenRingThickness,
          );
        }
        break;
      }
    }
  },

  /** A click on the selection after a vertex is settled sends the mode back to choosing. */
  handleRepick() {
    const ev = Event.current;
    if (ev.type !== EventType.MouseDown || ev.button !== 0 || ev.alt) return;
    if (!VertexSnappingUtility.hasPick || !clickedOnSelection(ev.mousePosition)) return;
    VertexSnappingUtility.clearPick();
    ev.use();
  },

  /** A right click (not a right drag) leaves pick mode. */
  handleRmbCancel() {
    const ev = Event.current;
    if (ev.type === EventType.Used) return false;
    if (!VertexSnappingUtility.isPickMode || !GeneralSettings.RmbCancelEnabled) {
      rmbArmed = false;
      return false;
    }
    if (ev.rawType === EventType.MouseDown && ev.button === MouseButton.RightMouse && ev.type !== EventType.Layout) {
      rmbArmed = true;
      rmbDownPosition = ev.mousePosition;
      return false;
    }
    if (ev.rawType === EventType.MouseUp && ev.button === MouseButton.RightMouse && rmbArmed && ev.type !== EventType.Layout) {
      rmbArmed = false;
      if (ev.mousePosition.sub(rmbDownPosition).sqrMagnitude > ClickSlackSquared) return false;
      VertexSnappingUtility.exitPickMode();
      ev.use();
      return true;
    }
    return false;
  },
};

// ---- VertexEdgeHighlight ------------------------------------------------------------------------------

const MaxEdges = 24;
const SegmentsPerEdge = 24;
const EdgeLiftPixels = 24;
const MatchEpsilonFactor = 1e-4;
// cos(1 degree): faces this parallel meet along a triangulation diagonal, not a modelled edge.
const CoplanarDot = 0.99985;

interface Candidate {
  point: Vector3;
  normal: Vector3;
  faces: number;
  crease: boolean;
}

let edgeOwner: Transform | null = null;
let edgePick: Vector3 | null = null;
let edgeOwnerVersion = -1;
let endpoints: Vector3[] = [];

function collectEndpoints(mesh: Mesh, local: Vector3, epsSq: number) {
  const v = mesh.vertices,
    t = mesh.triangles;
  const candidates: Candidate[] = [];
  const add = (point: Vector3, normal: Vector3) => {
    if (point.sub(local).sqrMagnitude <= epsSq) return;
    const known = candidates.find((c) => c.point.sub(point).sqrMagnitude <= epsSq);
    if (known) {
      known.faces++;
      known.crease ||= Vector3.dot(known.normal, normal) < CoplanarDot;
      return;
    }
    if (candidates.length < MaxEdges) candidates.push({ point, normal, faces: 1, crease: false });
  };
  for (let i = 0; i + 2 < t.length; i += 3) {
    for (let corner = 0; corner < 3; corner++) {
      if (v[t[i + corner]].sub(local).sqrMagnitude > epsSq) continue;
      const a = v[t[i]];
      let n = Vector3.cross(v[t[i + 1]].sub(a), v[t[i + 2]].sub(a));
      if (n.sqrMagnitude < 1e-16) break;
      n = n.normalized;
      add(v[t[i + ((corner + 1) % 3)]], n);
      add(v[t[i + ((corner + 2) % 3)]], n);
      break;
    }
  }
  // A border edge is real by definition; past that it takes a crease, or it is a quad's diagonal.
  const real = candidates.filter((c) => c.faces < 2 || c.crease).map((c) => c.point);
  // Inside a flat tessellated surface every edge is coplanar; then every edge is shown.
  return real.length ? real : candidates.map((c) => c.point);
}

function resolveIn(t: Transform, vertex: Vector3) {
  const mesh = t.gameObject.mesh;
  if (!mesh || !mesh.vertexCount) return false;
  const local = t.inverseTransformPoint(vertex);
  const eps = mesh.bounds.size.magnitude * MatchEpsilonFactor + 1e-6;
  if (!mesh.bounds.expand(eps * 2).contains(local)) return false;
  const found = collectEndpoints(mesh, local, eps * eps);
  if (!found.length) return false;
  edgeOwner = t;
  edgeOwnerVersion = t.version;
  endpoints = found;
  return true;
}

function resolveEdges(vertex: Vector3, owners: Transform[]) {
  if (edgePick && edgePick.equals(vertex) && (!edgeOwner ? true : edgeOwner.version === edgeOwnerVersion))
    return endpoints.length > 0;
  edgePick = vertex;
  edgeOwner = null;
  endpoints = [];
  return owners.some((t) => resolveIn(t, vertex));
}

function drawStar(vertex: Vector3) {
  const s = ScreenScale.tryBegin();
  const cam = Camera.current;
  if (!s || !cam || !edgeOwner) return;
  const thickness = SharedGizmoSettings.ScreenRingThickness;
  const m = edgeOwner.localToWorldMatrix;
  for (const end of endpoints) {
    const to = m.multiplyPoint3x4(end);
    const length = Vector3.distance(vertex, to);
    if (length < 1e-6) continue;
    for (let i = 0; i < SegmentsPerEdge; i++) {
      const from = (length * i) / SegmentsPerEdge;
      const until = (length * (i + 1)) / SegmentsPerEdge;
      const dir = to.sub(vertex).div(length);
      const a = vertex.add(dir.mul(from)),
        b = vertex.add(dir.mul(until));
      // Full strength at the vertex, gone by the neighbour, so every line points back at the pick.
      const fade = 1 - ((from + until) * 0.5) / length;
      const mid = Vector3.lerp(a, b, 0.5);
      const shown = visible(cam, mid, EdgeLiftPixels * s.worldPerDevicePixel(s.depth(mid)));
      Handles.color = withFade(shown ? GizmoColors.VertexEdge : GizmoColors.VertexEdgeOccluded, fade * fade);
      DrawPrimitives.drawThickSegment(a, b, s.forward, s.halfWidth(s.depth(a), thickness), s.halfWidth(s.depth(b), thickness));
    }
  }
}

export const VertexEdgeHighlight = {
  /** The edges running out of the vertex the next drag would pick up. */
  draw(coordinator: GizmoDragCoordinator, vertex: Vector3) {
    if (Event.current.type !== EventType.Repaint) return;
    if (coordinator.activeKind !== DragKind.None || !VertexSnappingUtility.isActive) return;
    if (resolveEdges(vertex, SelectionCache.deep)) drawStar(vertex);
  },

  drawTarget(vertex: Vector3, owner: Transform) {
    if (Event.current.type !== EventType.Repaint) return;
    if (resolveEdges(vertex, [owner])) drawStar(vertex);
  },
};

// ---- VertexPivotGroup -------------------------------------------------------------------------------------

const UndoName = 'Group at Vertex';

export const VertexPivotGroup = {
  /** Enter over a settled vertex: the selection gets an empty parent standing on it. */
  createAtPick() {
    if (!VertexSnappingUtility.hasPick) return;
    const roots = Selection.getTransforms(SelectionMode.TopLevel);
    const scene = Scene.current;
    if (!roots.length || !scene) return;
    const active = Selection.activeTransform;
    const frame = active && roots.includes(active) ? active : roots[0];
    const point = VertexSnappingUtility.pickedPoint;
    const parent = roots.every((t) => t.parent === roots[0].parent) ? roots[0].parent : null;
    // One undo step for creation, reparenting and placement.
    Undo.incrementCurrentGroup();
    const group = Undo.getCurrentGroup();
    const pivot = new GameObject(scene, roots.length === 1 ? `${frame.name} Pivot` : 'Pivot Group', parent);
    Undo.registerCreatedObjectUndo(pivot, UndoName);
    // The group takes the active object's orientation, so a Local rotation of it turns like the object.
    pivot.transform.setPositionAndRotation(point, frame.rotation);
    for (const t of roots) Undo.setTransformParent(t, pivot.transform, UndoName);
    Undo.collapseUndoOperations(group);
    Undo.setCurrentGroupName(UndoName);
    Selection.activeTransform = pivot.transform;
    VertexSnappingUtility.exitPickMode();
    SceneView.repaintAll();
  },
};
