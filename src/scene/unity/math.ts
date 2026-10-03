// Unity's value types, immutable: every operator returns a new value, so C# struct semantics port 1:1.
// Coordinates are Unity's (left-handed, Y up, Z forward); only the renderer converts to three.js.

export const Mathf = {
  PI: Math.PI,
  Deg2Rad: Math.PI / 180,
  Rad2Deg: 180 / Math.PI,
  Epsilon: 1.401298e-45,
  Infinity: Number.POSITIVE_INFINITY,
  NegativeInfinity: Number.NEGATIVE_INFINITY,
  Abs: Math.abs,
  Sqrt: Math.sqrt,
  Sin: Math.sin,
  Cos: Math.cos,
  Tan: Math.tan,
  Asin: Math.asin,
  Acos: Math.acos,
  Atan: Math.atan,
  Atan2: Math.atan2,
  Pow: Math.pow,
  Exp: Math.exp,
  Log: (v: number, base?: number) => (base === undefined ? Math.log(v) : Math.log(v) / Math.log(base)),
  Log10: Math.log10,
  Floor: Math.floor,
  Ceil: Math.ceil,
  Min: (...v: number[]) => Math.min(...v),
  Max: (...v: number[]) => Math.max(...v),
  // Unity's Sign answers 1 for zero.
  Sign: (v: number) => (v >= 0 ? 1 : -1),
  // .NET rounds half to even.
  Round: (v: number) => {
    const f = Math.floor(v);
    const d = v - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  },
  RoundToInt: (v: number) => Mathf.Round(v),
  FloorToInt: (v: number) => Math.floor(v),
  CeilToInt: (v: number) => Math.ceil(v),
  Clamp: (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v),
  Clamp01: (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v),
  Lerp: (a: number, b: number, t: number) => a + (b - a) * Mathf.Clamp01(t),
  LerpUnclamped: (a: number, b: number, t: number) => a + (b - a) * t,
  InverseLerp: (a: number, b: number, v: number) => (a !== b ? Mathf.Clamp01((v - a) / (b - a)) : 0),
  SmoothStep: (from: number, to: number, t: number) => {
    t = Mathf.Clamp01(t);
    t = -2 * t * t * t + 3 * t * t;
    return to * t + from * (1 - t);
  },
  MoveTowards: (current: number, target: number, maxDelta: number) =>
    Math.abs(target - current) <= maxDelta ? target : current + Mathf.Sign(target - current) * maxDelta,
  Repeat: (t: number, length: number) => Mathf.Clamp(t - Math.floor(t / length) * length, 0, length),
  PingPong: (t: number, length: number) => {
    t = Mathf.Repeat(t, length * 2);
    return length - Math.abs(t - length);
  },
  DeltaAngle: (current: number, target: number) => {
    let d = Mathf.Repeat(target - current, 360);
    if (d > 180) d -= 360;
    return d;
  },
  LerpAngle: (a: number, b: number, t: number) => {
    let d = Mathf.Repeat(b - a, 360);
    if (d > 180) d -= 360;
    return a + d * Mathf.Clamp01(t);
  },
  Approximately: (a: number, b: number) =>
    Math.abs(b - a) < Math.max(1e-6 * Math.max(Math.abs(a), Math.abs(b)), 1.401298e-45 * 8),
  IsNaN: (v: number) => Number.isNaN(v),
};

export class Vector2 {
  readonly x: number;
  readonly y: number;
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  static readonly zero = new Vector2(0, 0);
  static readonly one = new Vector2(1, 1);
  static readonly up = new Vector2(0, 1);
  static readonly down = new Vector2(0, -1);
  static readonly right = new Vector2(1, 0);
  static readonly left = new Vector2(-1, 0);

  add(o: Vector2) {
    return new Vector2(this.x + o.x, this.y + o.y);
  }
  sub(o: Vector2) {
    return new Vector2(this.x - o.x, this.y - o.y);
  }
  mul(s: number) {
    return new Vector2(this.x * s, this.y * s);
  }
  div(s: number) {
    return new Vector2(this.x / s, this.y / s);
  }
  neg() {
    return new Vector2(-this.x, -this.y);
  }
  scale(o: Vector2) {
    return new Vector2(this.x * o.x, this.y * o.y);
  }
  get magnitude() {
    return Math.hypot(this.x, this.y);
  }
  get sqrMagnitude() {
    return this.x * this.x + this.y * this.y;
  }
  get normalized() {
    const m = this.magnitude;
    return m > 1e-5 ? this.div(m) : Vector2.zero;
  }
  withX(x: number) {
    return new Vector2(x, this.y);
  }
  withY(y: number) {
    return new Vector2(this.x, y);
  }
  equals(o: Vector2) {
    return this.sub(o).sqrMagnitude < 9.99999944e-11;
  }
  toV3(z = 0) {
    return new Vector3(this.x, this.y, z);
  }

  static dot(a: Vector2, b: Vector2) {
    return a.x * b.x + a.y * b.y;
  }
  static distance(a: Vector2, b: Vector2) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  static lerp(a: Vector2, b: Vector2, t: number) {
    t = Mathf.Clamp01(t);
    return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
  static lerpUnclamped(a: Vector2, b: Vector2, t: number) {
    return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
  static angle(a: Vector2, b: Vector2) {
    const d = Math.sqrt(a.sqrMagnitude * b.sqrMagnitude);
    if (d < 1e-15) return 0;
    return Math.acos(Mathf.Clamp(Vector2.dot(a, b) / d, -1, 1)) * Mathf.Rad2Deg;
  }
  static signedAngle(a: Vector2, b: Vector2) {
    return Vector2.angle(a, b) * Mathf.Sign(a.x * b.y - a.y * b.x);
  }
  static perpendicular(v: Vector2) {
    return new Vector2(-v.y, v.x);
  }
  static min(a: Vector2, b: Vector2) {
    return new Vector2(Math.min(a.x, b.x), Math.min(a.y, b.y));
  }
  static max(a: Vector2, b: Vector2) {
    return new Vector2(Math.max(a.x, b.x), Math.max(a.y, b.y));
  }
  static moveTowards(cur: Vector2, target: Vector2, maxDelta: number) {
    const d = target.sub(cur);
    const m = d.magnitude;
    return m <= maxDelta || m === 0 ? target : cur.add(d.mul(maxDelta / m));
  }
}

export class Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  static readonly zero = new Vector3(0, 0, 0);
  static readonly one = new Vector3(1, 1, 1);
  static readonly up = new Vector3(0, 1, 0);
  static readonly down = new Vector3(0, -1, 0);
  static readonly right = new Vector3(1, 0, 0);
  static readonly left = new Vector3(-1, 0, 0);
  static readonly forward = new Vector3(0, 0, 1);
  static readonly back = new Vector3(0, 0, -1);
  static readonly positiveInfinity = new Vector3(Infinity, Infinity, Infinity);
  static readonly negativeInfinity = new Vector3(-Infinity, -Infinity, -Infinity);

  add(o: Vector3) {
    return new Vector3(this.x + o.x, this.y + o.y, this.z + o.z);
  }
  sub(o: Vector3) {
    return new Vector3(this.x - o.x, this.y - o.y, this.z - o.z);
  }
  mul(s: number) {
    return new Vector3(this.x * s, this.y * s, this.z * s);
  }
  div(s: number) {
    return new Vector3(this.x / s, this.y / s, this.z / s);
  }
  neg() {
    return new Vector3(-this.x, -this.y, -this.z);
  }
  /** Component-wise product (Vector3.Scale). */
  scale(o: Vector3) {
    return new Vector3(this.x * o.x, this.y * o.y, this.z * o.z);
  }
  get magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  get sqrMagnitude() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  get normalized() {
    const m = this.magnitude;
    return m > 1e-5 ? this.div(m) : Vector3.zero;
  }
  get xy() {
    return new Vector2(this.x, this.y);
  }
  get(i: number) {
    return i === 0 ? this.x : i === 1 ? this.y : this.z;
  }
  with(i: number, v: number) {
    return i === 0 ? this.withX(v) : i === 1 ? this.withY(v) : this.withZ(v);
  }
  withX(x: number) {
    return new Vector3(x, this.y, this.z);
  }
  withY(y: number) {
    return new Vector3(this.x, y, this.z);
  }
  withZ(z: number) {
    return new Vector3(this.x, this.y, z);
  }
  /** Unity's == (approximate). */
  equals(o: Vector3) {
    return this.sub(o).sqrMagnitude < 9.99999944e-11;
  }
  toString() {
    return `(${this.x.toFixed(2)}, ${this.y.toFixed(2)}, ${this.z.toFixed(2)})`;
  }

  static dot(a: Vector3, b: Vector3) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
  static cross(a: Vector3, b: Vector3) {
    return new Vector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  static normalize(v: Vector3) {
    return v.normalized;
  }
  static distance(a: Vector3, b: Vector3) {
    return a.sub(b).magnitude;
  }
  static lerp(a: Vector3, b: Vector3, t: number) {
    return Vector3.lerpUnclamped(a, b, Mathf.Clamp01(t));
  }
  static lerpUnclamped(a: Vector3, b: Vector3, t: number) {
    return new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  }
  static project(v: Vector3, n: Vector3) {
    const sq = Vector3.dot(n, n);
    return sq < Mathf.Epsilon ? Vector3.zero : n.mul(Vector3.dot(v, n) / sq);
  }
  static projectOnPlane(v: Vector3, n: Vector3) {
    const sq = Vector3.dot(n, n);
    return sq < Mathf.Epsilon ? v : v.sub(n.mul(Vector3.dot(v, n) / sq));
  }
  static angle(a: Vector3, b: Vector3) {
    const d = Math.sqrt(a.sqrMagnitude * b.sqrMagnitude);
    if (d < 1e-15) return 0;
    return Math.acos(Mathf.Clamp(Vector3.dot(a, b) / d, -1, 1)) * Mathf.Rad2Deg;
  }
  static signedAngle(from: Vector3, to: Vector3, axis: Vector3) {
    const unsigned = Vector3.angle(from, to);
    const c = Vector3.cross(from, to);
    return unsigned * Mathf.Sign(axis.x * c.x + axis.y * c.y + axis.z * c.z);
  }
  static min(a: Vector3, b: Vector3) {
    return new Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
  }
  static max(a: Vector3, b: Vector3) {
    return new Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
  }
  static moveTowards(cur: Vector3, target: Vector3, maxDelta: number) {
    const d = target.sub(cur);
    const m = d.magnitude;
    return m <= maxDelta || m === 0 ? target : cur.add(d.mul(maxDelta / m));
  }
  static slerp(a: Vector3, b: Vector3, t: number) {
    t = Mathf.Clamp01(t);
    const ma = a.magnitude;
    const mb = b.magnitude;
    if (ma < 1e-6 || mb < 1e-6) return Vector3.lerp(a, b, t);
    const na = a.div(ma);
    const nb = b.div(mb);
    const dot = Mathf.Clamp(Vector3.dot(na, nb), -1, 1);
    const theta = Math.acos(dot) * t;
    let rel = nb.sub(na.mul(dot));
    if (rel.sqrMagnitude < 1e-12) {
      if (dot > 0) return Vector3.lerp(a, b, t);
      rel = Vector3.cross(na, Math.abs(na.x) < 0.9 ? Vector3.right : Vector3.up);
    }
    rel = rel.normalized;
    const dir = na.mul(Math.cos(theta)).add(rel.mul(Math.sin(theta)));
    return dir.mul(ma + (mb - ma) * t);
  }
  static orthoNormal(normal: Vector3, tangent: Vector3): [Vector3, Vector3] {
    const n = normal.normalized;
    const t = Vector3.projectOnPlane(tangent, n).normalized;
    return [n, t];
  }
}

export class Quaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  static readonly identity = new Quaternion(0, 0, 0, 1);

  /** Hamilton product: applies o first, then this. */
  mul(o: Quaternion) {
    return new Quaternion(
      this.w * o.x + this.x * o.w + this.y * o.z - this.z * o.y,
      this.w * o.y + this.y * o.w + this.z * o.x - this.x * o.z,
      this.w * o.z + this.z * o.w + this.x * o.y - this.y * o.x,
      this.w * o.w - this.x * o.x - this.y * o.y - this.z * o.z,
    );
  }

  /** Rotates a vector (Unity's quaternion * vector). */
  mulV(v: Vector3) {
    const { x, y, z, w } = this;
    const x2 = x * 2,
      y2 = y * 2,
      z2 = z * 2;
    const xx = x * x2,
      yy = y * y2,
      zz = z * z2;
    const xy = x * y2,
      xz = x * z2,
      yz = y * z2;
    const wx = w * x2,
      wy = w * y2,
      wz = w * z2;
    return new Vector3(
      (1 - (yy + zz)) * v.x + (xy - wz) * v.y + (xz + wy) * v.z,
      (xy + wz) * v.x + (1 - (xx + zz)) * v.y + (yz - wx) * v.z,
      (xz - wy) * v.x + (yz + wx) * v.y + (1 - (xx + yy)) * v.z,
    );
  }

  get normalized() {
    const m = Math.sqrt(Quaternion.dot(this, this));
    return m < Mathf.Epsilon ? Quaternion.identity : new Quaternion(this.x / m, this.y / m, this.z / m, this.w / m);
  }

  get eulerAngles() {
    // Unity's ZXY order: Euler(x, y, z) = Ry * Rx * Rz.
    const { x, y, z, w } = this;
    const sinX = 2 * (w * x - y * z);
    let ex: number, ey: number, ez: number;
    if (Math.abs(sinX) >= 0.99999) {
      ex = (Math.PI / 2) * Math.sign(sinX);
      ey = Math.atan2(-2 * (x * z - w * y), 1 - 2 * (y * y + z * z));
      ez = 0;
    } else {
      ex = Math.asin(sinX);
      ey = Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
      ez = Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z));
    }
    const n = (r: number) => Mathf.Repeat(r * Mathf.Rad2Deg, 360);
    return new Vector3(n(ex), n(ey), n(ez));
  }

  equals(o: Quaternion) {
    return Quaternion.dot(this, o) > 1 - 1e-6;
  }

  static dot(a: Quaternion, b: Quaternion) {
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  }

  static inverse(q: Quaternion) {
    const n = Quaternion.dot(q, q);
    return n < Mathf.Epsilon ? Quaternion.identity : new Quaternion(-q.x / n, -q.y / n, -q.z / n, q.w / n);
  }

  static angleAxis(degrees: number, axis: Vector3) {
    const a = axis.normalized;
    if (a.sqrMagnitude === 0) return Quaternion.identity;
    const h = degrees * Mathf.Deg2Rad * 0.5;
    const s = Math.sin(h);
    return new Quaternion(a.x * s, a.y * s, a.z * s, Math.cos(h));
  }

  static euler(x: number | Vector3, y = 0, z = 0): Quaternion {
    if (x instanceof Vector3) return Quaternion.euler(x.x, x.y, x.z);
    const qx = Quaternion.angleAxis(x, Vector3.right);
    const qy = Quaternion.angleAxis(y, Vector3.up);
    const qz = Quaternion.angleAxis(z, Vector3.forward);
    return qy.mul(qx).mul(qz);
  }

  static lookRotation(forward: Vector3, up: Vector3 = Vector3.up) {
    const f = forward.normalized;
    if (f.sqrMagnitude < 1e-12) return Quaternion.identity;
    let r = Vector3.cross(up, f);
    if (r.sqrMagnitude < 1e-12) {
      // Up parallel to forward: Unity falls back to the shortest rotation onto forward.
      return Quaternion.fromToRotation(Vector3.forward, f);
    }
    r = r.normalized;
    const u = Vector3.cross(f, r);
    return Quaternion.fromBasis(r, u, f);
  }

  /** Rotation whose columns are the given orthonormal right/up/forward axes. */
  static fromBasis(r: Vector3, u: Vector3, f: Vector3) {
    const m00 = r.x,
      m01 = u.x,
      m02 = f.x;
    const m10 = r.y,
      m11 = u.y,
      m12 = f.y;
    const m20 = r.z,
      m21 = u.z,
      m22 = f.z;
    const tr = m00 + m11 + m22;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2;
      return new Quaternion((m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s);
    }
    if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      return new Quaternion(0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
    }
    if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      return new Quaternion((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
    }
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    return new Quaternion((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
  }

  static fromToRotation(from: Vector3, to: Vector3) {
    const a = from.normalized;
    const b = to.normalized;
    const d = Vector3.dot(a, b);
    if (d >= 1 - 1e-7) return Quaternion.identity;
    if (d <= -1 + 1e-7) {
      let axis = Vector3.cross(Vector3.right, a);
      if (axis.sqrMagnitude < 1e-6) axis = Vector3.cross(Vector3.up, a);
      return Quaternion.angleAxis(180, axis);
    }
    const c = Vector3.cross(a, b);
    return new Quaternion(c.x, c.y, c.z, 1 + d).normalized;
  }

  static slerp(a: Quaternion, b: Quaternion, t: number) {
    return Quaternion.slerpUnclamped(a, b, Mathf.Clamp01(t));
  }

  static slerpUnclamped(a: Quaternion, b: Quaternion, t: number) {
    let cos = Quaternion.dot(a, b);
    let bx = b.x,
      by = b.y,
      bz = b.z,
      bw = b.w;
    if (cos < 0) {
      cos = -cos;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    let k0: number, k1: number;
    if (cos > 0.9995) {
      k0 = 1 - t;
      k1 = t;
    } else {
      const theta = Math.acos(cos);
      const sin = Math.sin(theta);
      k0 = Math.sin((1 - t) * theta) / sin;
      k1 = Math.sin(t * theta) / sin;
    }
    return new Quaternion(a.x * k0 + bx * k1, a.y * k0 + by * k1, a.z * k0 + bz * k1, a.w * k0 + bw * k1).normalized;
  }

  static lerp(a: Quaternion, b: Quaternion, t: number) {
    t = Mathf.Clamp01(t);
    const s = Quaternion.dot(a, b) < 0 ? -1 : 1;
    return new Quaternion(
      a.x + (b.x * s - a.x) * t,
      a.y + (b.y * s - a.y) * t,
      a.z + (b.z * s - a.z) * t,
      a.w + (b.w * s - a.w) * t,
    ).normalized;
  }

  static angle(a: Quaternion, b: Quaternion) {
    const d = Math.min(Math.abs(Quaternion.dot(a, b)), 1);
    return d > 1 - 1e-6 ? 0 : Math.acos(d) * 2 * Mathf.Rad2Deg;
  }

  static rotateTowards(from: Quaternion, to: Quaternion, maxDegrees: number) {
    const angle = Quaternion.angle(from, to);
    return angle === 0 ? to : Quaternion.slerpUnclamped(from, to, Math.min(1, maxDegrees / angle));
  }

  /** Angle in degrees and unit axis. */
  toAngleAxis(): [number, Vector3] {
    const q = this.w < 0 ? new Quaternion(-this.x, -this.y, -this.z, -this.w) : this;
    const angle = 2 * Math.acos(Mathf.Clamp(q.w, -1, 1));
    const s = Math.sqrt(1 - q.w * q.w);
    const axis = s < 1e-6 ? Vector3.right : new Vector3(q.x / s, q.y / s, q.z / s);
    return [angle * Mathf.Rad2Deg, axis];
  }
}

export class Matrix4x4 {
  // Column-major like Unity: m[col*4 + row].
  readonly m: Float64Array;
  constructor(m = Matrix4x4.identityArray()) {
    this.m = m;
  }

  static identityArray() {
    const a = new Float64Array(16);
    a[0] = a[5] = a[10] = a[15] = 1;
    return a;
  }

  static readonly identity = new Matrix4x4();

  static TRS(pos: Vector3, rot: Quaternion, scale: Vector3) {
    const r = rot.mulV(new Vector3(scale.x, 0, 0));
    const u = rot.mulV(new Vector3(0, scale.y, 0));
    const f = rot.mulV(new Vector3(0, 0, scale.z));
    const a = new Float64Array([r.x, r.y, r.z, 0, u.x, u.y, u.z, 0, f.x, f.y, f.z, 0, pos.x, pos.y, pos.z, 1]);
    return new Matrix4x4(a);
  }

  mul(o: Matrix4x4) {
    const a = this.m,
      b = o.m,
      r = new Float64Array(16);
    for (let c = 0; c < 4; c++)
      for (let row = 0; row < 4; row++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k];
        r[c * 4 + row] = s;
      }
    return new Matrix4x4(r);
  }

  multiplyPoint3x4(p: Vector3) {
    const m = this.m;
    return new Vector3(
      m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
      m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
      m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
    );
  }

  multiplyPoint(p: Vector3) {
    const m = this.m;
    const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
    return this.multiplyPoint3x4(p).div(w || 1);
  }

  multiplyVector(v: Vector3) {
    const m = this.m;
    return new Vector3(
      m[0] * v.x + m[4] * v.y + m[8] * v.z,
      m[1] * v.x + m[5] * v.y + m[9] * v.z,
      m[2] * v.x + m[6] * v.y + m[10] * v.z,
    );
  }

  get inverse() {
    const m = this.m,
      inv = new Float64Array(16);
    inv[0] =
      m[5] * m[10] * m[15] -
      m[5] * m[11] * m[14] -
      m[9] * m[6] * m[15] +
      m[9] * m[7] * m[14] +
      m[13] * m[6] * m[11] -
      m[13] * m[7] * m[10];
    inv[4] =
      -m[4] * m[10] * m[15] +
      m[4] * m[11] * m[14] +
      m[8] * m[6] * m[15] -
      m[8] * m[7] * m[14] -
      m[12] * m[6] * m[11] +
      m[12] * m[7] * m[10];
    inv[8] =
      m[4] * m[9] * m[15] -
      m[4] * m[11] * m[13] -
      m[8] * m[5] * m[15] +
      m[8] * m[7] * m[13] +
      m[12] * m[5] * m[11] -
      m[12] * m[7] * m[9];
    inv[12] =
      -m[4] * m[9] * m[14] +
      m[4] * m[10] * m[13] +
      m[8] * m[5] * m[14] -
      m[8] * m[6] * m[13] -
      m[12] * m[5] * m[10] +
      m[12] * m[6] * m[9];
    inv[1] =
      -m[1] * m[10] * m[15] +
      m[1] * m[11] * m[14] +
      m[9] * m[2] * m[15] -
      m[9] * m[3] * m[14] -
      m[13] * m[2] * m[11] +
      m[13] * m[3] * m[10];
    inv[5] =
      m[0] * m[10] * m[15] -
      m[0] * m[11] * m[14] -
      m[8] * m[2] * m[15] +
      m[8] * m[3] * m[14] +
      m[12] * m[2] * m[11] -
      m[12] * m[3] * m[10];
    inv[9] =
      -m[0] * m[9] * m[15] +
      m[0] * m[11] * m[13] +
      m[8] * m[1] * m[15] -
      m[8] * m[3] * m[13] -
      m[12] * m[1] * m[11] +
      m[12] * m[3] * m[9];
    inv[13] =
      m[0] * m[9] * m[14] -
      m[0] * m[10] * m[13] -
      m[8] * m[1] * m[14] +
      m[8] * m[2] * m[13] +
      m[12] * m[1] * m[10] -
      m[12] * m[2] * m[9];
    inv[2] =
      m[1] * m[6] * m[15] -
      m[1] * m[7] * m[14] -
      m[5] * m[2] * m[15] +
      m[5] * m[3] * m[14] +
      m[13] * m[2] * m[7] -
      m[13] * m[3] * m[6];
    inv[6] =
      -m[0] * m[6] * m[15] +
      m[0] * m[7] * m[14] +
      m[4] * m[2] * m[15] -
      m[4] * m[3] * m[14] -
      m[12] * m[2] * m[7] +
      m[12] * m[3] * m[6];
    inv[10] =
      m[0] * m[5] * m[15] -
      m[0] * m[7] * m[13] -
      m[4] * m[1] * m[15] +
      m[4] * m[3] * m[13] +
      m[12] * m[1] * m[7] -
      m[12] * m[3] * m[5];
    inv[14] =
      -m[0] * m[5] * m[14] +
      m[0] * m[6] * m[13] +
      m[4] * m[1] * m[14] -
      m[4] * m[2] * m[13] -
      m[12] * m[1] * m[6] +
      m[12] * m[2] * m[5];
    inv[3] =
      -m[1] * m[6] * m[11] +
      m[1] * m[7] * m[10] +
      m[5] * m[2] * m[11] -
      m[5] * m[3] * m[10] -
      m[9] * m[2] * m[7] +
      m[9] * m[3] * m[6];
    inv[7] =
      m[0] * m[6] * m[11] -
      m[0] * m[7] * m[10] -
      m[4] * m[2] * m[11] +
      m[4] * m[3] * m[10] +
      m[8] * m[2] * m[7] -
      m[8] * m[3] * m[6];
    inv[11] =
      -m[0] * m[5] * m[11] +
      m[0] * m[7] * m[9] +
      m[4] * m[1] * m[11] -
      m[4] * m[3] * m[9] -
      m[8] * m[1] * m[7] +
      m[8] * m[3] * m[5];
    inv[15] =
      m[0] * m[5] * m[10] -
      m[0] * m[6] * m[9] -
      m[4] * m[1] * m[10] +
      m[4] * m[2] * m[9] +
      m[8] * m[1] * m[6] -
      m[8] * m[2] * m[5];
    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    if (det === 0) return Matrix4x4.identity;
    det = 1 / det;
    for (let i = 0; i < 16; i++) inv[i] *= det;
    return new Matrix4x4(inv);
  }
}

export class Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
  constructor(r = 0, g = 0, b = 0, a = 1) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }

  static readonly white = new Color(1, 1, 1, 1);
  static readonly black = new Color(0, 0, 0, 1);
  static readonly clear = new Color(0, 0, 0, 0);
  static readonly gray = new Color(0.5, 0.5, 0.5, 1);
  static readonly grey = Color.gray;
  static readonly red = new Color(1, 0, 0, 1);
  static readonly green = new Color(0, 1, 0, 1);
  static readonly blue = new Color(0, 0, 1, 1);
  static readonly yellow = new Color(1, 0.92156863, 0.015686275, 1);
  static readonly cyan = new Color(0, 1, 1, 1);
  static readonly magenta = new Color(1, 0, 1, 1);

  static hex(h: string) {
    const s = h.replace('#', '');
    const n = (i: number) => parseInt(s.slice(i, i + 2), 16) / 255;
    return new Color(n(0), n(2), n(4), s.length >= 8 ? n(6) : 1);
  }

  withAlpha(a: number) {
    return new Color(this.r, this.g, this.b, a);
  }
  mul(s: number) {
    return new Color(this.r * s, this.g * s, this.b * s, this.a * s);
  }
  mulC(o: Color) {
    return new Color(this.r * o.r, this.g * o.g, this.b * o.b, this.a * o.a);
  }
  add(o: Color) {
    return new Color(this.r + o.r, this.g + o.g, this.b + o.b, this.a + o.a);
  }
  get grayscale() {
    return 0.299 * this.r + 0.587 * this.g + 0.114 * this.b;
  }
  equals(o: Color) {
    return this.r === o.r && this.g === o.g && this.b === o.b && this.a === o.a;
  }

  css(alphaMul = 1) {
    const c = (v: number) => Math.round(Mathf.Clamp01(v) * 255);
    return `rgba(${c(this.r)},${c(this.g)},${c(this.b)},${+Mathf.Clamp01(this.a * alphaMul).toFixed(4)})`;
  }

  static lerp(a: Color, b: Color, t: number) {
    t = Mathf.Clamp01(t);
    return new Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t);
  }

  static RGBToHSV(c: Color): [number, number, number] {
    const max = Math.max(c.r, c.g, c.b),
      min = Math.min(c.r, c.g, c.b);
    const d = max - min;
    let h = 0;
    if (d > 0) {
      if (max === c.r) h = ((c.g - c.b) / d + 6) % 6;
      else if (max === c.g) h = (c.b - c.r) / d + 2;
      else h = (c.r - c.g) / d + 4;
      h /= 6;
    }
    return [h, max === 0 ? 0 : d / max, max];
  }

  static HSVToRGB(h: number, s: number, v: number) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s),
      q = v * (1 - f * s),
      t = v * (1 - (1 - f) * s);
    const k = ((i % 6) + 6) % 6;
    const [r, g, b] = [
      [v, t, p],
      [q, v, p],
      [p, v, t],
      [p, q, v],
      [t, p, v],
      [v, p, q],
    ][k];
    return new Color(r, g, b, 1);
  }
}

export class Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  static readonly zero = new Rect();

  static minMax(xMin: number, yMin: number, xMax: number, yMax: number) {
    return new Rect(xMin, yMin, xMax - xMin, yMax - yMin);
  }

  get xMin() {
    return this.x;
  }
  get yMin() {
    return this.y;
  }
  get xMax() {
    return this.x + this.width;
  }
  get yMax() {
    return this.y + this.height;
  }
  get center() {
    return new Vector2(this.x + this.width / 2, this.y + this.height / 2);
  }
  get size() {
    return new Vector2(this.width, this.height);
  }
  get position() {
    return new Vector2(this.x, this.y);
  }
  get min() {
    return new Vector2(this.xMin, this.yMin);
  }
  get max() {
    return new Vector2(this.xMax, this.yMax);
  }

  contains(p: Vector2 | Vector3) {
    return p.x >= this.xMin && p.x < this.xMax && p.y >= this.yMin && p.y < this.yMax;
  }
  overlaps(o: Rect) {
    return o.xMax > this.xMin && o.xMin < this.xMax && o.yMax > this.yMin && o.yMin < this.yMax;
  }
  expand(d: number) {
    return new Rect(this.x - d, this.y - d, this.width + 2 * d, this.height + 2 * d);
  }
}

export class Ray {
  readonly direction: Vector3;
  readonly origin: Vector3;
  constructor(origin: Vector3, direction: Vector3) {
    this.origin = origin;

    this.direction = direction.normalized;
  }

  getPoint(d: number) {
    return this.origin.add(this.direction.mul(d));
  }
}

export class Plane {
  readonly normal: Vector3;
  readonly distance: number;

  constructor(normal: Vector3, pointOrDistance: Vector3 | number) {
    this.normal = normal.normalized;
    this.distance = typeof pointOrDistance === 'number' ? pointOrDistance : -Vector3.dot(this.normal, pointOrDistance);
  }

  static from3(a: Vector3, b: Vector3, c: Vector3) {
    return new Plane(Vector3.cross(b.sub(a), c.sub(a)), a);
  }

  /** Unity's Plane.Raycast: hit flag and signed enter distance (enter is set even on a miss behind). */
  raycast(ray: Ray): [boolean, number] {
    const vdot = Vector3.dot(ray.direction, this.normal);
    const ndot = -Vector3.dot(ray.origin, this.normal) - this.distance;
    if (Mathf.Approximately(vdot, 0)) return [false, 0];
    const enter = ndot / vdot;
    return [enter > 0, enter];
  }

  getDistanceToPoint(p: Vector3) {
    return Vector3.dot(this.normal, p) + this.distance;
  }

  getSide(p: Vector3) {
    return this.getDistanceToPoint(p) > 0;
  }

  closestPointOnPlane(p: Vector3) {
    return p.sub(this.normal.mul(this.getDistanceToPoint(p)));
  }
}

export class Bounds {
  readonly center: Vector3;
  readonly size: Vector3;
  constructor(center = Vector3.zero, size = Vector3.zero) {
    this.center = center;
    this.size = size;
  }

  get extents() {
    return this.size.mul(0.5);
  }
  get min() {
    return this.center.sub(this.extents);
  }
  get max() {
    return this.center.add(this.extents);
  }

  static minMax(min: Vector3, max: Vector3) {
    return new Bounds(min.add(max).mul(0.5), max.sub(min));
  }

  encapsulate(o: Bounds | Vector3) {
    if (o instanceof Vector3) return Bounds.minMax(Vector3.min(this.min, o), Vector3.max(this.max, o));
    return Bounds.minMax(Vector3.min(this.min, o.min), Vector3.max(this.max, o.max));
  }

  contains(p: Vector3) {
    const a = this.min,
      b = this.max;
    return p.x >= a.x && p.x <= b.x && p.y >= a.y && p.y <= b.y && p.z >= a.z && p.z <= b.z;
  }

  /** Slab test; returns the entry distance or null. */
  intersectRay(ray: Ray): number | null {
    const a = this.min,
      b = this.max;
    let tmin = -Infinity,
      tmax = Infinity;
    for (let i = 0; i < 3; i++) {
      const o = ray.origin.get(i),
        d = ray.direction.get(i);
      if (Math.abs(d) < 1e-12) {
        if (o < a.get(i) || o > b.get(i)) return null;
        continue;
      }
      let t1 = (a.get(i) - o) / d,
        t2 = (b.get(i) - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    if (tmax < 0) return null;
    return Math.max(tmin, 0);
  }

  sqrDistance(p: Vector3) {
    const c = Vector3.max(this.min, Vector3.min(p, this.max));
    return c.sub(p).sqrMagnitude;
  }

  closestPoint(p: Vector3) {
    return Vector3.max(this.min, Vector3.min(p, this.max));
  }
}
