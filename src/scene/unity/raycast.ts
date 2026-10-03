// Renderer-based scene queries (no physics), like Blendon's EditorRaycastUtility and Unity's picking.
import { Bounds, Ray, Rect, Vector2, Vector3 } from './math.ts';
import type { GameObject, Scene } from './scene.ts';

export interface RaycastHit {
  gameObject: GameObject;
  point: Vector3;
  normal: Vector3;
  distance: number;
  triangleIndex: number;
}

/** Nearest hit of a world ray against one object's mesh, or null. */
export function raycastObject(go: GameObject, ray: Ray, maxDistance = Infinity): RaycastHit | null {
  const mesh = go.mesh;
  if (!mesh) return null;
  const b = go.bounds;
  if (!b || b.intersectRay(ray) === null) return null;
  const toLocal = go.transform.worldToLocalMatrix;
  const toWorld = go.transform.localToWorldMatrix;
  const o = toLocal.multiplyPoint3x4(ray.origin);
  const d = toLocal.multiplyVector(ray.direction);
  const v = mesh.vertices,
    t = mesh.triangles;
  let best = Infinity,
    bestTri = -1;
  for (let i = 0; i < t.length; i += 3) {
    const s = intersectTriangle(o, d, v[t[i]], v[t[i + 1]], v[t[i + 2]]);
    if (s !== null && s < best) {
      best = s;
      bestTri = i / 3;
    }
  }
  if (bestTri < 0) return null;
  const pLocal = o.add(d.mul(best));
  const point = toWorld.multiplyPoint3x4(pLocal);
  const distance = Vector3.distance(ray.origin, point);
  if (distance > maxDistance) return null;
  const a = v[t[bestTri * 3]],
    bb = v[t[bestTri * 3 + 1]],
    c = v[t[bestTri * 3 + 2]];
  const nLocal = Vector3.cross(bb.sub(a), c.sub(a));
  // Normals transform by the inverse transpose; for TRS that's the rotation with inverse scale.
  const s = go.transform.lossyScale;
  const nScaled = new Vector3(nLocal.x / (s.x || 1), nLocal.y / (s.y || 1), nLocal.z / (s.z || 1));
  const normal = go.transform.rotation.mulV(nScaled).normalized;
  return { gameObject: go, point, normal, distance, triangleIndex: bestTri };
}

/** Möller-Trumbore, both faces; ray parameter or null. */
function intersectTriangle(o: Vector3, d: Vector3, a: Vector3, b: Vector3, c: Vector3): number | null {
  const e1 = b.sub(a),
    e2 = c.sub(a);
  const p = Vector3.cross(d, e2);
  const det = Vector3.dot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const tv = o.sub(a);
  const u = Vector3.dot(tv, p) * inv;
  if (u < 0 || u > 1) return null;
  const q = Vector3.cross(tv, e1);
  const w = Vector3.dot(d, q) * inv;
  if (w < 0 || u + w > 1) return null;
  const s = Vector3.dot(e2, q) * inv;
  return s > 1e-7 ? s : null;
}

export interface QueryFilter {
  ignore?: Set<GameObject>;
  /** Hidden and inactive objects are skipped unless this is set. */
  includeHidden?: boolean;
}

export function raycastAll(scene: Scene, ray: Ray, filter: QueryFilter = {}): RaycastHit[] {
  const hits: RaycastHit[] = [];
  for (const go of scene.allObjects()) {
    if (!go.mesh || !go.pickable) continue;
    if (!filter.includeHidden && !go.visible) continue;
    if (filter.ignore?.has(go)) continue;
    const h = raycastObject(go, ray);
    if (h) hits.push(h);
  }
  return hits.sort((a, b) => a.distance - b.distance);
}

export function raycastScene(scene: Scene, ray: Ray, filter: QueryFilter = {}): RaycastHit | null {
  return raycastAll(scene, ray, filter)[0] ?? null;
}

/** Objects whose projected surface overlaps a GUI rect; project maps world to GUI points. */
export function objectsInRect(
  scene: Scene,
  rect: Rect,
  project: (p: Vector3) => Vector3,
  filter: QueryFilter = {},
): GameObject[] {
  const out: GameObject[] = [];
  for (const go of scene.allObjects()) {
    if (!go.mesh || !go.pickable) continue;
    if (!filter.includeHidden && !go.visible) continue;
    if (filter.ignore?.has(go)) continue;
    const m = go.transform.localToWorldMatrix;
    const pts = go.mesh.vertices.map((v) => project(m.multiplyPoint3x4(v)));
    const t = go.mesh.triangles;
    let hit = false;
    for (let i = 0; i < t.length && !hit; i += 3) {
      const a = pts[t[i]],
        b = pts[t[i + 1]],
        c = pts[t[i + 2]];
      if (a.z <= 0 || b.z <= 0 || c.z <= 0) continue;
      hit = triangleOverlapsRect(a.xy, b.xy, c.xy, rect);
    }
    if (hit) out.push(go);
  }
  return out;
}

function triangleOverlapsRect(a: Vector2, b: Vector2, c: Vector2, r: Rect) {
  const tri = [a, b, c];
  if (tri.some((p) => r.contains(p))) return true;
  const corners = [
    new Vector2(r.xMin, r.yMin),
    new Vector2(r.xMax, r.yMin),
    new Vector2(r.xMax, r.yMax),
    new Vector2(r.xMin, r.yMax),
  ];
  if (corners.some((p) => pointInTriangle(p, a, b, c))) return true;
  // Separating axis over the triangle's edge normals and the rect's two axes.
  const axes = [
    new Vector2(1, 0),
    new Vector2(0, 1),
    ...[0, 1, 2].map((i) => {
      const e = tri[(i + 1) % 3].sub(tri[i]);
      return new Vector2(-e.y, e.x);
    }),
  ];
  for (const ax of axes) {
    const pt = tri.map((p) => Vector2.dot(p, ax));
    const pr = corners.map((p) => Vector2.dot(p, ax));
    if (Math.max(...pt) < Math.min(...pr) || Math.max(...pr) < Math.min(...pt)) return false;
  }
  return true;
}

function pointInTriangle(p: Vector2, a: Vector2, b: Vector2, c: Vector2) {
  const s = (p1: Vector2, p2: Vector2, p3: Vector2) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = s(p, a, b),
    d2 = s(p, b, c),
    d3 = s(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0,
    pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** World vertices of an object's mesh. */
export function worldVertices(go: GameObject): Vector3[] {
  if (!go.mesh) return [];
  const m = go.transform.localToWorldMatrix;
  return go.mesh.vertices.map((v) => m.multiplyPoint3x4(v));
}

export function combinedBounds(objects: GameObject[]): Bounds | null {
  let b: Bounds | null = null;
  for (const go of objects) {
    const ob = go.bounds;
    if (ob) b = b ? b.encapsulate(ob) : ob;
  }
  return b;
}
