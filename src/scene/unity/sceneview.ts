// The Scene view camera model, matching Unity 6's SceneView: pivot/rotation/size, with the camera
// parked size/sin(fov/2) behind the pivot (2*size when orthographic) and an animated ortho fade.
import { Mathf, Matrix4x4, Quaternion, Ray, Rect, Vector2, Vector3 } from './math.ts';

export const kOrthoThresholdAngle = 3;
export const kDefaultPerspectiveFov = 60;
export const kDefaultRotation = new Quaternion(-0.08717, 0.89959, -0.21045, -0.37262);

/** Unity's BaseAnimValue easing: quartic ease-out over 1/speed seconds. */
export class AnimFloat {
  private from: number;
  private to: number;
  private t = 1;

  readonly speed: number;
  constructor(value: number, speed = 2) {
    this.speed = speed;

    this.from = this.to = value;
  }

  get target() {
    return this.to;
  }

  get value() {
    const v = 1 - this.t;
    return this.from + (this.to - this.from) * (1 - v * v * v * v);
  }

  get isAnimating() {
    return this.t < 1;
  }

  set(target: number, instant = false) {
    if (instant) {
      this.from = this.to = target;
      this.t = 1;
      return;
    }
    if (target === this.to) return;
    this.from = this.value;
    this.to = target;
    this.t = 0;
  }

  /** Advances; true while still moving. */
  step(dt: number) {
    if (this.t >= 1) return false;
    this.t = Math.min(1, this.t + dt * this.speed);
    return this.t < 1;
  }
}

/** The camera Unity renders the Scene view with; derived from the SceneView every time it is read. */
export class SceneCamera {
  position = Vector3.zero;
  rotation = Quaternion.identity;
  fieldOfView = kDefaultPerspectiveFov;
  orthographic = false;
  orthographicSize = 1;
  nearClipPlane = 0.03;
  farClipPlane = 1000;
  /** Device pixels. */
  pixelWidth = 1;
  pixelHeight = 1;

  get aspect() {
    return this.pixelWidth / Math.max(1, this.pixelHeight);
  }

  get pixelRect() {
    return new Rect(0, 0, this.pixelWidth, this.pixelHeight);
  }

  get forward() {
    return this.rotation.mulV(Vector3.forward);
  }
  get right() {
    return this.rotation.mulV(Vector3.right);
  }
  get up() {
    return this.rotation.mulV(Vector3.up);
  }

  /** The transform-like view Unity code reads through camera.transform. */
  get transform() {
    return {
      position: this.position,
      rotation: this.rotation,
      forward: this.forward,
      right: this.right,
      up: this.up,
      transformDirection: (d: Vector3) => this.rotation.mulV(d),
      inverseTransformDirection: (d: Vector3) => Quaternion.inverse(this.rotation).mulV(d),
      transformPoint: (p: Vector3) => this.position.add(this.rotation.mulV(p)),
      inverseTransformPoint: (p: Vector3) => Quaternion.inverse(this.rotation).mulV(p.sub(this.position)),
    };
  }

  private get tanHalf() {
    return Math.tan(this.fieldOfView * 0.5 * Mathf.Deg2Rad);
  }

  /** Unity's worldToCameraMatrix: camera space looks down -Z. */
  get worldToCameraMatrix() {
    const flip = Matrix4x4.TRS(Vector3.zero, Quaternion.identity, new Vector3(1, 1, -1));
    return flip.mul(Matrix4x4.TRS(this.position, this.rotation, Vector3.one).inverse);
  }

  /** OpenGL-style projection, as Unity reports it. */
  get projectionMatrix() {
    const a = new Float64Array(16);
    const n = this.nearClipPlane,
      f = this.farClipPlane;
    if (this.orthographic) {
      const h = this.orthographicSize,
        w = h * this.aspect;
      a[0] = 1 / w;
      a[5] = 1 / h;
      a[10] = -2 / (f - n);
      a[14] = -(f + n) / (f - n);
      a[15] = 1;
    } else {
      const t = 1 / this.tanHalf;
      a[0] = t / this.aspect;
      a[5] = t;
      a[10] = (f + n) / (n - f);
      a[11] = -1;
      a[14] = (2 * f * n) / (n - f);
    }
    return new Matrix4x4(a);
  }

  /** Pixels from the bottom-left, z = depth along the view axis. */
  worldToScreenPoint(p: Vector3) {
    const d = p.sub(this.position);
    const x = Vector3.dot(d, this.right);
    const y = Vector3.dot(d, this.up);
    const z = Vector3.dot(d, this.forward);
    let nx: number, ny: number;
    if (this.orthographic) {
      nx = x / (this.orthographicSize * this.aspect);
      ny = y / this.orthographicSize;
    } else {
      // Unity divides by |z| behind the camera too, which mirrors points back into view.
      const w = Math.abs(z) < 1e-7 ? 1e-7 : z;
      nx = x / (w * this.tanHalf * this.aspect);
      ny = y / (w * this.tanHalf);
    }
    return new Vector3((nx + 1) * 0.5 * this.pixelWidth, (ny + 1) * 0.5 * this.pixelHeight, z);
  }

  worldToViewportPoint(p: Vector3) {
    const s = this.worldToScreenPoint(p);
    return new Vector3(s.x / this.pixelWidth, s.y / this.pixelHeight, s.z);
  }

  screenToWorldPoint(s: Vector3) {
    const nx = (s.x / this.pixelWidth) * 2 - 1;
    const ny = (s.y / this.pixelHeight) * 2 - 1;
    if (this.orthographic) {
      return this.position
        .add(this.right.mul(nx * this.orthographicSize * this.aspect))
        .add(this.up.mul(ny * this.orthographicSize))
        .add(this.forward.mul(s.z));
    }
    const dir = this.forward.add(this.right.mul(nx * this.tanHalf * this.aspect)).add(this.up.mul(ny * this.tanHalf));
    return this.position.add(dir.mul(s.z));
  }

  screenPointToRay(s: Vector2 | Vector3) {
    const nx = (s.x / this.pixelWidth) * 2 - 1;
    const ny = (s.y / this.pixelHeight) * 2 - 1;
    if (this.orthographic) {
      const origin = this.position
        .add(this.right.mul(nx * this.orthographicSize * this.aspect))
        .add(this.up.mul(ny * this.orthographicSize))
        .add(this.forward.mul(this.nearClipPlane));
      return new Ray(origin, this.forward);
    }
    const dir = this.forward.add(this.right.mul(nx * this.tanHalf * this.aspect)).add(this.up.mul(ny * this.tanHalf));
    return new Ray(this.position.add(dir.mul(this.nearClipPlane)), dir);
  }
}

export const DrawCameraMode = { Textured: 0, Wireframe: 1, TexturedWire: 2 } as const;
export type DrawCameraMode = (typeof DrawCameraMode)[keyof typeof DrawCameraMode];

export interface SceneViewState {
  pivot: Vector3;
  rotation: Quaternion;
  size: number;
  orthographic: boolean;
}

/** An event with handlers called in subscription order (C# multicast delegate). */
export class Hook<T> {
  private list: ((arg: T) => void)[] = [];
  add(fn: (arg: T) => void) {
    if (!this.list.includes(fn)) this.list.push(fn);
  }
  remove(fn: (arg: T) => void) {
    const i = this.list.indexOf(fn);
    if (i >= 0) this.list.splice(i, 1);
  }
  invoke(arg: T) {
    for (const fn of [...this.list]) fn(arg);
  }
}

/** One Scene view: what Unity's SceneView exposes to editor code. */
export class SceneView {
  static readonly beforeSceneGui = new Hook<SceneView>();
  static readonly duringSceneGui = new Hook<SceneView>();
  static lastActiveSceneView: SceneView | null = null;
  static currentDrawingSceneView: SceneView | null = null;
  static get sceneViews() {
    return SceneView.lastActiveSceneView ? [SceneView.lastActiveSceneView] : [];
  }
  static repaintAll() {
    SceneView.lastActiveSceneView?.repaint();
  }

  private _pivot = Vector3.zero;
  private _rotation = kDefaultRotation;
  private _size = 10;
  private readonly ortho = new AnimFloat(0, 2);

  readonly camera = new SceneCamera();
  readonly cameraSettings = { fieldOfView: kDefaultPerspectiveFov, easingEnabled: false };
  isRotationLocked = false;
  sceneLighting = true;
  drawMode: DrawCameraMode = DrawCameraMode.Textured;
  /** Effects/skybox flags are not modelled; the grid is. */
  showGrid = true;

  /** Window rect in points (the viewport only; there is no toolbar strip in the browser). */
  position = new Rect(0, 0, 800, 600);
  pixelsPerPoint = 1;

  /** Set by the host: schedules a repaint. */
  onRepaint: () => void = () => {};

  constructor() {
    SceneView.lastActiveSceneView = this;
    this.updateCamera();
  }

  get cameraViewport() {
    return new Rect(0, 0, this.position.width, this.position.height);
  }

  get pivot() {
    return this._pivot;
  }
  set pivot(v: Vector3) {
    this.flight = null;
    this._pivot = v;
    this.updateCamera();
  }

  get rotation() {
    return this._rotation;
  }
  set rotation(q: Quaternion) {
    if (this.isRotationLocked) return;
    this.flight = null;
    this._rotation = q.normalized;
    this.updateCamera();
  }

  get size() {
    return this._size;
  }
  set size(v: number) {
    this.flight = null;
    this._size = Mathf.Clamp(v, 1e-5, 3.2e34);
    this.updateCamera();
  }

  get orthographic() {
    return this.ortho.target > 0.5;
  }
  set orthographic(v: boolean) {
    this.ortho.set(v ? 1 : 0);
    this.updateCamera();
    this.repaint();
  }

  /** Switches projection without the cross-fade. */
  setOrthographicInstant(v: boolean) {
    this.ortho.set(v ? 1 : 0, true);
    this.updateCamera();
  }

  get isOrthoAnimating() {
    return this.ortho.isAnimating;
  }

  /** The authored FOV faded toward zero during an ortho switch. */
  private get fadedFov() {
    return Mathf.LerpUnclamped(this.cameraSettings.fieldOfView, 0, this.ortho.value);
  }

  get cameraDistance() {
    const fov = this.fadedFov;
    if (fov > kOrthoThresholdAngle) return this._size / Math.sin(fov * 0.5 * Mathf.Deg2Rad);
    return this._size * 2;
  }

  /** Advances the projection fade and a LookAt flight; true while animating. */
  tick(dt: number) {
    let moving = this.ortho.step(dt);
    const f = this.flight;
    if (f) {
      f.t = Math.min(1, f.t + dt * 2);
      const v = 1 - f.t;
      const k = 1 - v * v * v * v;
      this._pivot = Vector3.lerpUnclamped(f.from.pivot, f.to.pivot, k);
      this._rotation = Quaternion.slerp(f.from.rotation, f.to.rotation, k);
      this._size = f.from.size + (f.to.size - f.from.size) * k;
      if (f.t >= 1) this.flight = null;
      moving = true;
    }
    this.updateCamera();
    return moving || this.flight !== null;
  }

  private flight: { from: SceneViewState; to: SceneViewState; t: number } | null = null;

  /** Unity's LookAt: instant, or eased over half a second with the projection cross-faded. */
  lookAt(point: Vector3, rotation: Quaternion, size: number, orthographic: boolean, instant: boolean) {
    if (instant) {
      this.flight = null;
      this._pivot = point;
      if (!this.isRotationLocked) this._rotation = rotation.normalized;
      this._size = Math.abs(size);
      this.ortho.set(orthographic ? 1 : 0, true);
    } else {
      this.flight = {
        from: this.state(),
        to: {
          pivot: point,
          rotation: this.isRotationLocked ? this._rotation : rotation.normalized,
          size: Math.abs(size),
          orthographic,
        },
        t: 0,
      };
      this.ortho.set(orthographic ? 1 : 0);
    }
    this.updateCamera();
    this.repaint();
  }

  updateCamera() {
    const cam = this.camera;
    const fov = this.fadedFov;
    cam.rotation = this._rotation;
    if (fov > kOrthoThresholdAngle) {
      cam.orthographic = false;
      cam.fieldOfView = fov;
    } else {
      cam.orthographic = true;
      cam.orthographicSize = this._size;
    }
    cam.position = this._pivot.add(this._rotation.mulV(new Vector3(0, 0, -this.cameraDistance)));
    const far = this._size * 2000;
    cam.farClipPlane = Math.max(far, 1);
    cam.nearClipPlane = Math.max(far * 0.000005, 1e-5);
    cam.pixelWidth = Math.max(1, Math.round(this.position.width * this.pixelsPerPoint));
    cam.pixelHeight = Math.max(1, Math.round(this.position.height * this.pixelsPerPoint));
  }

  repaint() {
    this.onRepaint();
  }

  /** SceneView.ShowNotification: a message centred in the view that fades after a moment. */
  notification: { text: string; until: number } | null = null;

  showNotification(text: string, seconds = 1.5) {
    this.notification = { text, until: performance.now() / 1000 + seconds };
    this.repaint();
  }

  lookAtDirect(point: Vector3, rotation: Quaternion, size?: number) {
    this.flight = null;
    this._pivot = point;
    if (!this.isRotationLocked) this._rotation = rotation.normalized;
    if (size !== undefined) this._size = size;
    this.updateCamera();
    this.repaint();
  }

  state(): SceneViewState {
    return { pivot: this._pivot, rotation: this._rotation, size: this._size, orthographic: this.orthographic };
  }

  /** Unity's GetPerspectiveCameraDistance. */
  static getPerspectiveCameraDistance(objectSize: number, fov: number) {
    return objectSize / Math.sin(fov * 0.5 * Mathf.Deg2Rad);
  }
}

/** Camera.current: the Scene camera while a Scene view pass runs. */
export const Camera = {
  get current(): SceneCamera | null {
    return (SceneView.currentDrawingSceneView ?? SceneView.lastActiveSceneView)?.camera ?? null;
  },
};
