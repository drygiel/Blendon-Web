// GameObject / Transform / Mesh: just enough of Unity's scene graph for the tools to act on.
import { Bounds, Color, Matrix4x4, Quaternion, Vector3 } from './math.ts';

let nextId = 1;

export class Mesh {
  private boundsCache: Bounds | null = null;

  readonly name: string;
  readonly vertices: Vector3[];
  readonly triangles: number[];
  readonly normals: Vector3[];
  constructor(name: string, vertices: Vector3[], triangles: number[], normals: Vector3[] = []) {
    this.name = name;
    this.vertices = vertices;
    this.triangles = triangles;
    this.normals = normals;
  }

  get vertexCount() {
    return this.vertices.length;
  }

  get bounds() {
    if (!this.boundsCache) {
      let min = Vector3.positiveInfinity;
      let max = Vector3.negativeInfinity;
      for (const v of this.vertices) {
        min = Vector3.min(min, v);
        max = Vector3.max(max, v);
      }
      this.boundsCache = this.vertices.length ? Bounds.minMax(min, max) : new Bounds();
    }
    return this.boundsCache;
  }
}

export class Transform {
  private _localPosition = Vector3.zero;
  private _localRotation = Quaternion.identity;
  private _localScale = Vector3.one;
  private _parent: Transform | null = null;
  readonly children: Transform[] = [];
  private worldCache: Matrix4x4 | null = null;
  /** Bumped on any change of this transform or an ancestor's. */
  version = 0;

  readonly gameObject: GameObject;
  constructor(gameObject: GameObject) {
    this.gameObject = gameObject;
  }

  get name() {
    return this.gameObject.name;
  }

  get parent() {
    return this._parent;
  }

  get root(): Transform {
    return this._parent ? this._parent.root : this;
  }

  get childCount() {
    return this.children.length;
  }

  getChild(i: number) {
    return this.children[i];
  }

  isChildOf(t: Transform) {
    if (this === t) return true;
    for (let p = this._parent; p; p = p._parent) if (p === t) return true;
    return false;
  }

  getSiblingIndex() {
    return this._parent ? this._parent.children.indexOf(this) : this.gameObject.scene.roots.indexOf(this);
  }

  private touch() {
    this.worldCache = null;
    this.version++;
    for (const c of this.children) c.touch();
    this.gameObject.scene.changed(this);
  }

  get localPosition() {
    return this._localPosition;
  }
  set localPosition(v: Vector3) {
    this._localPosition = v;
    this.touch();
  }

  get localRotation() {
    return this._localRotation;
  }
  set localRotation(q: Quaternion) {
    this._localRotation = q.normalized;
    this.touch();
  }

  get localScale() {
    return this._localScale;
  }
  set localScale(v: Vector3) {
    this._localScale = v;
    this.touch();
  }

  get localEulerAngles() {
    return this._localRotation.eulerAngles;
  }
  set localEulerAngles(e: Vector3) {
    this.localRotation = Quaternion.euler(e);
  }

  get localToWorldMatrix(): Matrix4x4 {
    if (!this.worldCache) {
      const local = Matrix4x4.TRS(this._localPosition, this._localRotation, this._localScale);
      this.worldCache = this._parent ? this._parent.localToWorldMatrix.mul(local) : local;
    }
    return this.worldCache;
  }

  get worldToLocalMatrix() {
    return this.localToWorldMatrix.inverse;
  }

  get position(): Vector3 {
    return this._parent ? this._parent.transformPoint(this._localPosition) : this._localPosition;
  }
  set position(p: Vector3) {
    this.localPosition = this._parent ? this._parent.inverseTransformPoint(p) : p;
  }

  get rotation(): Quaternion {
    return this._parent ? this._parent.rotation.mul(this._localRotation) : this._localRotation;
  }
  set rotation(q: Quaternion) {
    this.localRotation = this._parent ? Quaternion.inverse(this._parent.rotation).mul(q) : q;
  }

  get eulerAngles() {
    return this.rotation.eulerAngles;
  }
  set eulerAngles(e: Vector3) {
    this.rotation = Quaternion.euler(e);
  }

  get lossyScale(): Vector3 {
    const p = this._parent ? this._parent.lossyScale : Vector3.one;
    return p.scale(this._localScale);
  }

  get right() {
    return this.rotation.mulV(Vector3.right);
  }
  get up() {
    return this.rotation.mulV(Vector3.up);
  }
  get forward() {
    return this.rotation.mulV(Vector3.forward);
  }

  transformPoint(p: Vector3) {
    return this.localToWorldMatrix.multiplyPoint3x4(p);
  }
  inverseTransformPoint(p: Vector3) {
    return this.worldToLocalMatrix.multiplyPoint3x4(p);
  }
  transformDirection(d: Vector3) {
    return this.rotation.mulV(d);
  }
  inverseTransformDirection(d: Vector3) {
    return Quaternion.inverse(this.rotation).mulV(d);
  }
  transformVector(v: Vector3) {
    return this.localToWorldMatrix.multiplyVector(v);
  }
  inverseTransformVector(v: Vector3) {
    return this.worldToLocalMatrix.multiplyVector(v);
  }

  setPositionAndRotation(p: Vector3, q: Quaternion) {
    this.position = p;
    this.rotation = q;
  }

  rotate(axis: Vector3, degrees: number, world = false) {
    const q = Quaternion.angleAxis(degrees, axis);
    if (world) this.rotation = q.mul(this.rotation);
    else this.localRotation = this._localRotation.mul(q);
  }

  setParent(parent: Transform | null, worldPositionStays = true) {
    if (parent === this._parent) return;
    const pos = this.position,
      rot = this.rotation,
      scale = this.lossyScale;
    const scene = this.gameObject.scene;
    if (this._parent) this._parent.children.splice(this._parent.children.indexOf(this), 1);
    else scene.roots.splice(scene.roots.indexOf(this), 1);
    this._parent = parent;
    if (parent) parent.children.push(this);
    else scene.roots.push(this);
    if (worldPositionStays) {
      this._localPosition = parent ? parent.inverseTransformPoint(pos) : pos;
      this._localRotation = parent ? Quaternion.inverse(parent.rotation).mul(rot) : rot;
      const ps = parent ? parent.lossyScale : Vector3.one;
      this._localScale = new Vector3(scale.x / (ps.x || 1), scale.y / (ps.y || 1), scale.z / (ps.z || 1));
    }
    this.touch();
    scene.hierarchyChanged();
  }

  /** Initial placement of a new object: no world pose to keep. */
  adopt(parent: Transform | null) {
    this._parent = parent;
    if (parent) parent.children.push(this);
    else this.gameObject.scene.roots.push(this);
  }

  /** Raw restore for undo: sets every local value without notifications per field. */
  restore(s: TransformState) {
    this._localPosition = s.p;
    this._localRotation = s.r;
    this._localScale = s.s;
    this.touch();
  }

  snapshot(): TransformState {
    return { p: this._localPosition, r: this._localRotation, s: this._localScale };
  }

  *walk(): Generator<Transform> {
    yield this;
    for (const c of this.children) yield* c.walk();
  }
}

export interface TransformState {
  p: Vector3;
  r: Quaternion;
  s: Vector3;
}

export class GameObject {
  readonly id = nextId++;
  readonly transform: Transform;
  activeSelf = true;
  /** Scene-visibility hide (SceneVisibilityManager), not deactivation. */
  hidden = false;
  mesh: Mesh | null = null;
  color = new Color(0.5, 0.5, 0.5, 1);
  /** Kept out of picking and snapping (helpers like the floor grid). */
  pickable = true;

  readonly scene: Scene;
  name: string;
  constructor(scene: Scene, name: string, parent: Transform | null = null) {
    this.scene = scene;
    this.name = name;

    this.transform = new Transform(this);
    this.transform.adopt(parent);
    scene.hierarchyChanged();
  }

  get activeInHierarchy(): boolean {
    for (let t: Transform | null = this.transform; t; t = t.parent) if (!t.gameObject.activeSelf) return false;
    return true;
  }

  /** World AABB of the mesh, like Renderer.bounds. */
  get bounds(): Bounds | null {
    if (!this.mesh) return null;
    const m = this.transform.localToWorldMatrix;
    const b = this.mesh.bounds;
    let min = Vector3.positiveInfinity;
    let max = Vector3.negativeInfinity;
    for (let i = 0; i < 8; i++) {
      const c = new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      const w = m.multiplyPoint3x4(c);
      min = Vector3.min(min, w);
      max = Vector3.max(max, w);
    }
    return Bounds.minMax(min, max);
  }

  /** Whether it shows in the Scene view: active and not hidden by visibility. */
  get visible() {
    for (let t: Transform | null = this.transform; t; t = t.parent) if (t.gameObject.hidden) return false;
    return this.activeInHierarchy;
  }
}

export class Scene {
  /** The scene the Scene view shows; one at a time here. */
  static current: Scene | null = null;
  readonly roots: Transform[] = [];
  private changeListeners = new Set<(t: Transform) => void>();
  private hierarchyListeners = new Set<() => void>();

  changed(t: Transform) {
    for (const l of this.changeListeners) l(t);
  }

  hierarchyChanged() {
    for (const l of this.hierarchyListeners) l();
  }

  onChange(l: (t: Transform) => void) {
    this.changeListeners.add(l);
    return () => this.changeListeners.delete(l);
  }

  onHierarchyChange(l: () => void) {
    this.hierarchyListeners.add(l);
    return () => this.hierarchyListeners.delete(l);
  }

  *allTransforms(): Generator<Transform> {
    for (const r of [...this.roots]) yield* r.walk();
  }

  *allObjects(): Generator<GameObject> {
    for (const t of this.allTransforms()) yield t.gameObject;
  }

  destroy(go: GameObject) {
    const t = go.transform;
    if (t.parent) t.parent.children.splice(t.parent.children.indexOf(t), 1);
    else this.roots.splice(this.roots.indexOf(t), 1);
    this.hierarchyChanged();
  }

  /** Re-attaches an object removed by destroy, for undo. */
  revive(go: GameObject, parent: Transform | null, index: number) {
    const list = parent ? parent.children : this.roots;
    list.splice(Math.min(index, list.length), 0, go.transform);
    this.hierarchyChanged();
  }
}
