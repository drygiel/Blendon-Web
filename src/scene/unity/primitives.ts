// Unity's built-in primitive meshes, in Unity space: cross(b - a, c - a) points out of the surface.
import { Vector3 } from './math.ts';
import { Mesh } from './scene.ts';

function cube(): Mesh {
  const v: Vector3[] = [];
  const n: Vector3[] = [];
  const t: number[] = [];
  const faces: [Vector3, Vector3, Vector3][] = [
    [Vector3.right, Vector3.up, Vector3.back],
    [Vector3.left, Vector3.up, Vector3.forward],
    [Vector3.up, Vector3.forward, Vector3.right],
    [Vector3.down, Vector3.back, Vector3.right],
    [Vector3.forward, Vector3.up, Vector3.right],
    [Vector3.back, Vector3.up, Vector3.left],
  ];
  for (const [normal, up, right] of faces) {
    const i = v.length;
    const c = normal.mul(0.5);
    const u = up.mul(0.5);
    const r = right.mul(0.5);
    v.push(c.sub(r).sub(u), c.add(r).sub(u), c.add(r).add(u), c.sub(r).add(u));
    n.push(normal, normal, normal, normal);
    pushQuad(v, t, i, normal);
  }
  return new Mesh('Cube', v, t, n);
}

/** Two triangles over 4 consecutive vertices, wound to face `normal`. */
function pushQuad(v: Vector3[], t: number[], i: number, normal: Vector3) {
  const a = v[i],
    b = v[i + 1],
    c = v[i + 2];
  const out = Vector3.dot(Vector3.cross(b.sub(a), c.sub(a)), normal) > 0;
  if (out) t.push(i, i + 1, i + 2, i, i + 2, i + 3);
  else t.push(i, i + 2, i + 1, i, i + 3, i + 2);
}

function sphere(radius = 0.5, lon = 24, lat = 16): Mesh {
  const v: Vector3[] = [];
  const n: Vector3[] = [];
  const t: number[] = [];
  for (let i = 0; i <= lat; i++) {
    const th = (i / lat) * Math.PI;
    for (let j = 0; j <= lon; j++) {
      const ph = (j / lon) * Math.PI * 2;
      const d = new Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      v.push(d.mul(radius));
      n.push(d);
    }
  }
  for (let i = 0; i < lat; i++)
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j,
        b = a + lon + 1;
      tri(v, t, a, b, a + 1);
      tri(v, t, a + 1, b, b + 1);
    }
  return new Mesh('Sphere', v, t, n);
}

/** One triangle wound outward from the origin (convex shapes centred on it). */
function tri(v: Vector3[], t: number[], a: number, b: number, c: number, outward?: Vector3) {
  const pa = v[a],
    pb = v[b],
    pc = v[c];
  const nrm = Vector3.cross(pb.sub(pa), pc.sub(pa));
  if (nrm.sqrMagnitude < 1e-14) return;
  const dir = outward ?? pa.add(pb).add(pc);
  if (Vector3.dot(nrm, dir) >= 0) t.push(a, b, c);
  else t.push(a, c, b);
}

function cylinder(segments = 20): Mesh {
  const v: Vector3[] = [];
  const n: Vector3[] = [];
  const t: number[] = [];
  const r = 0.5;
  for (let s = 0; s <= segments; s++) {
    const a = (s / segments) * Math.PI * 2;
    const d = new Vector3(Math.cos(a), 0, Math.sin(a));
    v.push(d.mul(r).withY(-1), d.mul(r).withY(1));
    n.push(d, d);
  }
  for (let s = 0; s < segments; s++) {
    const i = s * 2;
    const mid = v[i]
      .add(v[i + 3])
      .mul(0.5)
      .withY(0);
    tri(v, t, i, i + 1, i + 2, mid);
    tri(v, t, i + 1, i + 3, i + 2, mid);
  }
  for (const y of [-1, 1]) {
    const c = v.length;
    v.push(new Vector3(0, y, 0));
    n.push(new Vector3(0, y, 0));
    const ring = v.length;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      v.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      n.push(new Vector3(0, y, 0));
    }
    for (let s = 0; s < segments; s++) tri(v, t, c, ring + s, ring + ((s + 1) % segments), new Vector3(0, y, 0));
  }
  return new Mesh('Cylinder', v, t, n);
}

function capsule(lon = 24, latHalf = 8): Mesh {
  const v: Vector3[] = [];
  const n: Vector3[] = [];
  const t: number[] = [];
  const r = 0.5;
  // Rows from the top pole down: the upper hemisphere centred at y=+0.5, the lower at y=-0.5.
  const rows: { y: number; ring: number; ny: number; cy: number }[] = [];
  for (let i = 0; i <= latHalf; i++) {
    const th = (i / latHalf) * (Math.PI / 2);
    rows.push({ y: 0.5 + Math.cos(th) * r, ring: Math.sin(th) * r, ny: Math.cos(th), cy: 0.5 });
  }
  for (let i = 0; i <= latHalf; i++) {
    const th = Math.PI / 2 + (i / latHalf) * (Math.PI / 2);
    rows.push({ y: -0.5 + Math.cos(th) * r, ring: Math.sin(th) * r, ny: Math.cos(th), cy: -0.5 });
  }
  for (const row of rows)
    for (let j = 0; j <= lon; j++) {
      const ph = (j / lon) * Math.PI * 2;
      const c = Math.cos(ph),
        s = Math.sin(ph);
      v.push(new Vector3(c * row.ring, row.y, s * row.ring));
      const k = Math.sqrt(Math.max(0, 1 - row.ny * row.ny));
      n.push(new Vector3(c * k, row.ny, s * k));
    }
  for (let i = 0; i + 1 < rows.length; i++)
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j,
        b = a + lon + 1;
      const out = n[a].add(n[b + 1]);
      tri(v, t, a, b, a + 1, out);
      tri(v, t, a + 1, b, b + 1, out);
    }
  return new Mesh('Capsule', v, t, n);
}

function plane(): Mesh {
  const v: Vector3[] = [];
  const n: Vector3[] = [];
  const t: number[] = [];
  for (let z = 0; z <= 10; z++)
    for (let x = 0; x <= 10; x++) {
      v.push(new Vector3(x - 5, 0, z - 5));
      n.push(Vector3.up);
    }
  for (let z = 0; z < 10; z++)
    for (let x = 0; x < 10; x++) {
      const a = z * 11 + x;
      tri(v, t, a, a + 11, a + 1, Vector3.up);
      tri(v, t, a + 1, a + 11, a + 12, Vector3.up);
    }
  return new Mesh('Plane', v, t, n);
}

/** A ramp (wedge) of unit footprint: a slope rising along +Z, for surface snapping. */
function wedge(): Mesh {
  const v: Vector3[] = [];
  const n: Vector3[] = [];
  const t: number[] = [];
  const P = (x: number, y: number, z: number) => new Vector3(x - 0.5, y - 0.5, z - 0.5);
  const quad = (pts: Vector3[], normal: Vector3) => {
    const i = v.length;
    v.push(...pts);
    for (let k = 0; k < pts.length; k++) n.push(normal);
    if (pts.length === 4) pushQuad(v, t, i, normal);
    else tri(v, t, i, i + 1, i + 2, normal);
  };
  const slope = new Vector3(0, 1, -1).normalized;
  quad([P(0, 0, 0), P(1, 0, 0), P(1, 1, 1), P(0, 1, 1)], slope);
  quad([P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)], Vector3.down);
  quad([P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)], Vector3.forward);
  quad([P(0, 0, 0), P(0, 0, 1), P(0, 1, 1)], Vector3.left);
  quad([P(1, 0, 0), P(1, 0, 1), P(1, 1, 1)], Vector3.right);
  return new Mesh('Ramp', v, t, n);
}

export const PrimitiveType = {
  Cube: 'Cube',
  Sphere: 'Sphere',
  Cylinder: 'Cylinder',
  Capsule: 'Capsule',
  Plane: 'Plane',
  Ramp: 'Ramp',
} as const;
export type PrimitiveType = (typeof PrimitiveType)[keyof typeof PrimitiveType];

const cache = new Map<string, Mesh>();

export function primitiveMesh(type: PrimitiveType): Mesh {
  let m = cache.get(type);
  if (!m) {
    m =
      type === 'Cube'
        ? cube()
        : type === 'Sphere'
          ? sphere()
          : type === 'Cylinder'
            ? cylinder()
            : type === 'Capsule'
              ? capsule()
              : type === 'Plane'
                ? plane()
                : wedge();
    cache.set(type, m);
  }
  return m;
}
