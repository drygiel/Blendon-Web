// three.js view of the Unity scene: mirrored into a right-handed space (z flipped), lit like the
// default URP setup, with Unity's grid and selection outline drawn on top.
import * as THREE from 'three';
import { EditorApplication, EditorSnapSettings } from '../unity/editor.ts';
import { Quaternion, Vector3 } from '../unity/math.ts';
import { Ground, type GameObject, type Mesh, type Scene } from '../unity/scene.ts';
import { DrawCameraMode, type SceneView } from '../unity/sceneview.ts';
import {
  DIST4_H_FRAG,
  DIST_H_FRAG,
  GRID_FRAG,
  GRID_VERT,
  HIGHLIGHT_FRAG,
  OUTLINE_FRAG,
  POST_FRAG,
  QUAD_VERT,
} from './shaders.ts';
import { applySkyEnvironment } from './sky.ts';
import { techMaterials, techTile, type TechMaterials } from './tech-surface.ts';

const toThreeV = (v: Vector3) => new THREE.Vector3(v.x, v.y, -v.z);
const toThreeQ = (q: Quaternion) => new THREE.Quaternion(-q.x, -q.y, q.z, q.w);

const geometryCache = new WeakMap<Mesh, THREE.BufferGeometry>();

function geometryFor(mesh: Mesh) {
  let g = geometryCache.get(mesh);
  if (g) return g;
  g = new THREE.BufferGeometry();
  const pos = new Float32Array(mesh.vertices.length * 3);
  const nrm = new Float32Array(mesh.vertices.length * 3);
  mesh.vertices.forEach((v, i) => {
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = -v.z;
    const n = mesh.normals[i] ?? Vector3.up;
    nrm[i * 3] = n.x;
    nrm[i * 3 + 1] = n.y;
    nrm[i * 3 + 2] = -n.z;
  });
  // Mirroring flips handedness, so the winding is reversed to keep front faces in front.
  const idx: number[] = [];
  for (let i = 0; i < mesh.triangles.length; i += 3)
    idx.push(mesh.triangles[i], mesh.triangles[i + 2], mesh.triangles[i + 1]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  geometryCache.set(mesh, g);
  return g;
}

interface Entry {
  go: GameObject;
  mesh: THREE.Mesh;
  wire: THREE.LineSegments;
  surface: TechMaterials;
  version: number;
}

/** Unity's scene-view lighting for this demo: the scene's directional light and a sky ambient. */
const LIGHT_EULER = new Vector3(50, 330, 0);
// Unity lights without the 1/pi three.js puts on diffuse, so its intensity 4 would be about 4 * pi here.
// A softer sun and a brighter sky keep the yard's dark paints readable on lit and shaded faces alike.
const LIGHT_INTENSITY = 7.5;
const ENV_INTENSITY = 1.1;
// sRGB input that comes out of the tonemapper as #454545.
const GROUND_RGB = 0.265;
// The grid's height over the Ground, so a floor laid on the Ground shows under the lines.
const GRID_LIFT = 0.001;
// The sun's shadow covers this square round the demo yard's middle, in metres.
const SHADOW_CENTER = new Vector3(0, 0, -3);
const SHADOW_REACH = 26;
const SHADOW_OPACITY = 0.38;

export interface OutlineSets {
  selected: GameObject[];
  children: GameObject[];
  highlight: HighlightSets | null;
}

/** Box Select's preview: what a release selects and deselects, children's meshes included. */
export interface HighlightSets {
  selects: GameObject[];
  deselects: GameObject[];
  /** Marked objects with no mesh anywhere under them, drawn as squares by Box Select itself. */
  markers: GameObject[];
  markerOf: Set<GameObject>;
  /** sRGB colours; alpha is the fill's. */
  selectColor: [number, number, number, number];
  deselectColor: [number, number, number, number];
  fill: boolean;
  outline: boolean;
  /** Rim width in points. */
  width: number;
  occludedOpacity: number;
  alpha: number;
}

/** Every visible pixel's object, as index + 1; read once per box. */
export interface IdCapture {
  width: number;
  height: number;
  /** Device pixels per GUI point. */
  scale: number;
  data: Uint8Array;
}

const colorUniform = () => ({ value: new THREE.Vector4() });

export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly three = new THREE.Scene();
  private readonly persp = new THREE.PerspectiveCamera();
  private readonly ortho = new THREE.OrthographicCamera();
  private readonly entries = new Map<GameObject, Entry>();
  private readonly grid: THREE.Mesh;
  private readonly ground: THREE.Mesh;
  private readonly shadowCatcher: THREE.Mesh;
  private shadowDirty = true;
  private readonly gridMat: THREE.ShaderMaterial;
  private readonly maskTarget: THREE.WebGLRenderTarget;
  private readonly distTarget: THREE.WebGLRenderTarget;
  private readonly maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private readonly distMat: THREE.ShaderMaterial;
  private readonly outlineMat: THREE.ShaderMaterial;
  private readonly distScene = new THREE.Scene();
  private readonly hlMask: THREE.WebGLRenderTarget;
  private readonly hlDist: THREE.WebGLRenderTarget;
  private readonly hlDistMat: THREE.ShaderMaterial;
  private readonly hlMat: THREE.ShaderMaterial;
  private readonly hlDistScene = new THREE.Scene();
  private readonly hlScene = new THREE.Scene();
  private readonly depthOnlyMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  // Select visible, select hidden, deselect visible, deselect hidden: one mask channel each.
  private readonly hlChannels = [
    maskMaterial(THREE.LessEqualDepth, [1, 0, 0, 0]),
    maskMaterial(THREE.GreaterDepth, [0, 1, 0, 0]),
    maskMaterial(THREE.LessEqualDepth, [0, 0, 1, 0]),
    maskMaterial(THREE.GreaterDepth, [0, 0, 0, 1]),
  ];
  private readonly idTarget = new THREE.WebGLRenderTarget(1, 1);
  private readonly idMat = new THREE.ShaderMaterial({
    uniforms: { uId: colorUniform() },
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec4 uId; void main(){ gl_FragColor = uId; }',
  });
  private dpr = 1;
  private warm = false;
  private warming: Promise<void> | null = null;
  private readonly skyReady: Promise<void>;
  private readonly hdrTarget: THREE.WebGLRenderTarget;
  private readonly postMat: THREE.ShaderMaterial;
  private readonly postScene = new THREE.Scene();
  private readonly quadScene = new THREE.Scene();
  private readonly scene: Scene;
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly wireMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
  private readonly wireOverlayMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
  private unlit = false;

  constructor(canvas: HTMLCanvasElement, scene: Scene) {
    this.scene = scene;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    // The sun is fixed, so the shadow map is redrawn only when an object changes, never for the camera.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.three.background = new THREE.Color().setRGB(0.278431, 0.278431, 0.278431, THREE.SRGBColorSpace);

    const light = new THREE.DirectionalLight(
      new THREE.Color().setRGB(1, 0.972, 0.944, THREE.SRGBColorSpace),
      LIGHT_INTENSITY,
    );
    const dir = Quaternion.euler(LIGHT_EULER).mulV(Vector3.forward);
    light.position.copy(toThreeV(SHADOW_CENTER.sub(dir.mul(60))));
    light.target.position.copy(toThreeV(SHADOW_CENTER));
    light.castShadow = true;
    const shadow = light.shadow;
    shadow.mapSize.set(2048, 2048);
    shadow.radius = 1;
    shadow.bias = -0.0004;
    shadow.normalBias = 0.02;
    Object.assign(shadow.camera, {
      left: -SHADOW_REACH,
      right: SHADOW_REACH,
      top: SHADOW_REACH,
      bottom: -SHADOW_REACH,
      near: 1,
      far: 120,
    });
    shadow.camera.updateProjectionMatrix();
    this.three.add(light, light.target);
    this.skyReady = applySkyEnvironment(this.three, this.renderer);
    this.three.environmentIntensity = ENV_INTENSITY;

    // Drawn after the objects and tested against them with a depth it computes itself.
    this.gridMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uCamPos: { value: new THREE.Vector3() },
        uSize: { value: 10 },
        uOrtho: { value: 0 },
        uUnit: { value: 1 },
        uOrigin: { value: new THREE.Vector2() },
        uViewDir: { value: new THREE.Vector3() },
        uColor: { value: new THREE.Vector4(0.214, 0.214, 0.214, 0.4) },
        // Strength, fade start and end (in view sizes), line width.
        uNear: { value: new THREE.Vector4(4, 1, 5, 0) },
        uFar: { value: new THREE.Vector4(1.4, 3, 40, 0.7) },
        uPlaneY: { value: Ground.y + GRID_LIFT },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uClip: { value: new THREE.Vector2(0.01, 1000) },
        uRayOrigin: { value: new THREE.Matrix3() },
        uRayDir: { value: new THREE.Matrix3() },
      },
    });
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.gridMat);
    this.grid.frustumCulled = false;
    this.grid.renderOrder = 10;
    this.three.add(this.grid);

    // A backdrop drawn first without depth, so every object covers it, even one sunk below it. Lands as #454545.
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color().setRGB(GROUND_RGB, GROUND_RGB, GROUND_RGB, THREE.SRGBColorSpace),
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.ground.renderOrder = -1;
    this.ground.frustumCulled = false;
    this.three.add(this.ground);

    // The backdrop takes no light, so the sun's shadows land on a clear floor drawn over it, under the grid.
    this.shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ opacity: SHADOW_OPACITY, depthWrite: false }),
    );
    this.shadowCatcher.receiveShadow = true;
    this.shadowCatcher.renderOrder = 5;
    this.shadowCatcher.frustumCulled = false;
    this.three.add(this.shadowCatcher);

    this.hdrTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: { uColor: { value: this.hdrTarget.texture }, uVignette: { value: 0.2 }, uAspect: { value: 1 } },
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
    this.maskTarget = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
    this.distTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    const texel = new THREE.Vector2(1, 1);
    this.distMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: DIST_H_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: { uMask: { value: this.maskTarget.texture }, uTexel: { value: texel }, uR: { value: 4 } },
    });
    this.outlineMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: OUTLINE_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uMask: { value: this.maskTarget.texture },
        uDist: { value: this.distTarget.texture },
        uTexel: { value: texel },
        uR: { value: 4 },
        uWidth: { value: 2 },
        uSelected: { value: new THREE.Color().setRGB(1, 0.4, 0, THREE.SRGBColorSpace) },
        uChildren: { value: new THREE.Color().setRGB(0.368, 0.466, 0.607, THREE.SRGBColorSpace) },
        uExtra: { value: new THREE.Color(1, 1, 1) },
        uExtraAlpha: { value: 1 },
      },
    });
    this.distScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.distMat));

    this.hlMask = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
    this.hlDist = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.hlDistMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: DIST4_H_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: { uMask: { value: this.hlMask.texture }, uTexel: { value: texel }, uR: { value: 4 } },
    });
    this.hlMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: HIGHLIGHT_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uMask: { value: this.hlMask.texture },
        uDist: { value: this.hlDist.texture },
        uTexel: { value: texel },
        uR: { value: 4 },
        uWidth: { value: 2 },
        uSelect: colorUniform(),
        uDeselect: colorUniform(),
        uOccluded: { value: 0.5 },
        uFill: { value: 0 },
        uOutline: { value: 1 },
        uAlpha: { value: 1 },
      },
    });
    this.hlDistScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hlDistMat));
    this.hlScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hlMat));
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.outlineMat));
  }

  setSize(width: number, height: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    const w = Math.max(1, Math.round(width * dpr)),
      h = Math.max(1, Math.round(height * dpr));
    this.maskTarget.setSize(w, h);
    this.distTarget.setSize(w, h);
    this.hdrTarget.setSize(w, h);
    this.hlMask.setSize(w, h);
    this.hlDist.setSize(w, h);
    this.idTarget.setSize(w, h);
    this.dpr = dpr;
    (this.outlineMat.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
    // Unity's outline is two points wide whatever the display scale.
    const rim = 2 * dpr;
    this.outlineMat.uniforms.uWidth.value = rim;
    this.outlineMat.uniforms.uR.value = this.distMat.uniforms.uR.value = Math.min(8, Math.ceil(rim + 1));
  }

  private sync() {
    const seen = new Set<GameObject>();
    for (const go of this.scene.allObjects()) {
      if (!go.mesh) continue;
      seen.add(go);
      let e = this.entries.get(go);
      if (!e) {
        const geo = geometryFor(go.mesh);
        const surface = techMaterials(techTile(this.renderer), go.mesh, go.color);
        const mesh = new THREE.Mesh(geo, this.unlit ? surface.unlit : surface.lit);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = mesh.receiveShadow = true;
        const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), this.wireMat);
        wire.matrixAutoUpdate = false;
        this.three.add(mesh, wire);
        e = { go, mesh, wire, surface, version: -1 };
        this.entries.set(go, e);
      }
      const t = go.transform;
      if (e.version !== t.version) {
        e.version = t.version;
        this.shadowDirty = true;
        const m = t.localToWorldMatrix.m;
        // S * M * S with S = diag(1, 1, -1).
        const a = Array.from(m);
        for (const i of [2, 6, 14]) a[i] = -a[i];
        for (const i of [8, 9, 11]) a[i] = -a[i];
        e.mesh.matrix.fromArray(a);
        e.mesh.matrixWorldNeedsUpdate = true;
        e.wire.matrix.copy(e.mesh.matrix);
        e.wire.matrixWorldNeedsUpdate = true;
      }
    }
    for (const [go, e] of this.entries)
      if (!seen.has(go)) {
        this.three.remove(e.mesh, e.wire);
        e.wire.geometry.dispose();
        e.surface.lit.dispose();
        e.surface.unlit.dispose();
        this.entries.delete(go);
        this.shadowDirty = true;
      }
  }

  /** Puts every object back in its own surface after a pass that drew it with another material. */
  private restoreSurfaces() {
    for (const e of this.entries.values()) e.mesh.material = this.unlit ? e.surface.unlit : e.surface.lit;
  }

  private camera(view: SceneView): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    const c = view.camera;
    const cam = c.orthographic ? this.ortho : this.persp;
    if (c.orthographic) {
      const h = c.orthographicSize,
        w = h * c.aspect;
      this.ortho.left = -w;
      this.ortho.right = w;
      this.ortho.top = h;
      this.ortho.bottom = -h;
    } else {
      this.persp.fov = c.fieldOfView;
      this.persp.aspect = c.aspect;
    }
    cam.near = c.nearClipPlane;
    cam.far = c.farClipPlane;
    cam.position.copy(toThreeV(c.position));
    cam.quaternion.copy(toThreeQ(c.rotation));
    if (c.orthographic) this.ortho.updateProjectionMatrix();
    else this.persp.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    return cam;
  }

  /**
   * Compiles the programs the first frames use in parallel, off the main thread where the browser can. Linking
   * them on first use instead stalls the page for a moment. Until they are ready the canvas stays hidden.
   */
  private warmUp(cam: THREE.Camera) {
    if (this.warming) return;
    const r = this.renderer;
    const canvas = r.domElement;
    canvas.style.visibility = 'hidden';
    // The environment is part of a lit program, so the sky goes on first.
    this.warming = this.skyReady
      .then(() => {
        // The grid tile and its mipmaps go up now, not on the first visible frame.
        r.initTexture(techTile(r));
        // A program depends on the target it draws into, so each pass compiles against its own.
        r.setRenderTarget(this.hdrTarget);
        const scene = r.compileAsync(this.three, cam);
        // The selection outline's passes: the demo starts with an object selected.
        const probe = new THREE.Mesh(new THREE.PlaneGeometry(), this.maskMat);
        r.setRenderTarget(this.maskTarget);
        const mask = r.compileAsync(probe, cam, this.three);
        r.setRenderTarget(this.distTarget);
        const dist = r.compileAsync(this.distScene, this.quadCam);
        r.setRenderTarget(null);
        const post = r.compileAsync(this.postScene, this.quadCam);
        const rim = r.compileAsync(this.quadScene, this.quadCam);
        return Promise.all([scene, mask, dist, post, rim]).finally(() => probe.geometry.dispose());
      })
      .catch(() => {})
      .then(() => {
        this.warm = true;
        canvas.style.visibility = '';
        EditorApplication.wake();
      });
  }

  render(view: SceneView, outline: OutlineSets) {
    this.sync();
    const cam = this.camera(view);
    if (!this.warm) {
      this.warmUp(cam);
      return;
    }
    const mode = view.drawMode;
    const wireOnly = mode === DrawCameraMode.Wireframe;
    // Unity's Unlit is the Textured draw mode with the scene lighting toggle off.
    this.unlit = !view.sceneLighting;
    this.restoreSurfaces();
    for (const e of this.entries.values()) {
      const vis = e.go.visible;
      const shown = vis && !wireOnly;
      if (e.mesh.visible !== shown) this.shadowDirty = true;
      e.mesh.visible = shown;
      e.wire.visible = vis && (wireOnly || mode === DrawCameraMode.TexturedWire);
      e.wire.material = wireOnly ? this.wireMat : this.wireOverlayMat;
    }

    // The ground follows the camera so it reaches the horizon at any zoom.
    const c = view.camera;
    const reach = Math.max(view.size * 600, 50);
    this.grid.visible = view.showGrid;
    // Only from above, as a one-sided floor in Unity is.
    this.ground.visible = c.position.y > Ground.y;
    this.ground.scale.set(reach * 2, 1, reach * 2);
    this.ground.position.set(c.position.x, Ground.y, -c.position.z);
    this.ground.updateMatrixWorld();
    // Unity's unlit and wireframe modes draw no shadows.
    this.shadowCatcher.visible = this.ground.visible && !this.unlit && !wireOnly;
    this.shadowCatcher.scale.copy(this.ground.scale);
    this.shadowCatcher.position.copy(this.ground.position);
    this.shadowCatcher.updateMatrixWorld();
    const u = this.gridMat.uniforms;
    (u.uCamPos.value as THREE.Vector3).copy(toThreeV(c.position));
    (u.uViewDir.value as THREE.Vector3).copy(toThreeV(c.forward));
    u.uSize.value = view.size;
    u.uUnit.value = Math.max(1e-3, EditorSnapSettings.gridSize.x);
    u.uOrtho.value = c.orthographic ? 1 : 0;
    this.setGridRays(cam);

    const r = this.renderer;
    if (this.shadowDirty) {
      r.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    r.setRenderTarget(this.hdrTarget);
    r.clear();
    r.render(this.three, cam);
    r.setRenderTarget(null);
    r.render(this.postScene, this.quadCam);

    // Selection outline: a mask of what's outlined, then its rim composited over the frame.
    const sets: [GameObject[], number][] = [
      [outline.selected, 0],
      [outline.children, 1],
    ];
    if (sets.some(([l]) => l.length)) {
      const vis = new Map<THREE.Object3D, boolean>();
      this.three.traverse((o) => vis.set(o, o.visible));
      r.setRenderTarget(this.maskTarget);
      r.setClearColor(0x000000, 0);
      r.clear();
      const bg = this.three.background;
      this.three.background = null;
      const channels = [new THREE.Color(1, 0, 0), new THREE.Color(0, 1, 0), new THREE.Color(0, 0, 1)];
      for (const [list, ch] of sets) {
        if (!list.length) continue;
        this.three.traverse((o) => (o.visible = false));
        this.three.visible = true;
        for (const go of list) {
          const e = this.entries.get(go);
          if (e && go.visible) {
            e.mesh.visible = true;
            e.mesh.material = this.maskMat;
          }
        }
        this.maskMat.color = channels[ch];
        this.maskMat.blending = THREE.AdditiveBlending;
        this.maskMat.depthTest = false;
        r.render(this.three, cam);
      }
      this.three.background = bg;
      for (const [o, v] of vis) o.visible = v;
      this.restoreSurfaces();
      r.setRenderTarget(this.distTarget);
      r.render(this.distScene, this.quadCam);
      r.setRenderTarget(null);
      r.render(this.quadScene, this.quadCam);
    }
    if (outline.highlight) this.renderHighlight(outline.highlight, cam);
  }

  /** Each pixel's view ray as an affine function of its NDC position, for the grid's own plane hit. */
  private setGridRays(cam: THREE.PerspectiveCamera | THREE.OrthographicCamera) {
    const u = this.gridMat.uniforms;
    const e = cam.matrixWorld.elements;
    const pos = new THREE.Vector3(e[12], e[13], e[14]);
    const right = new THREE.Vector3(e[0], e[1], e[2]);
    const up = new THREE.Vector3(e[4], e[5], e[6]);
    const forward = new THREE.Vector3(-e[8], -e[9], -e[10]);
    const zero = new THREE.Vector3();
    const origin = u.uRayOrigin.value as THREE.Matrix3;
    const dir = u.uRayDir.value as THREE.Matrix3;
    if (cam instanceof THREE.OrthographicCamera) {
      setColumns(origin, pos, right.multiplyScalar(cam.right), up.multiplyScalar(cam.top));
      setColumns(dir, forward, zero, zero);
    } else {
      const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      setColumns(origin, pos, zero, zero);
      setColumns(dir, forward, right.multiplyScalar(ty * cam.aspect), up.multiplyScalar(ty));
    }
    (u.uClip.value as THREE.Vector2).set(cam.near, cam.far);
    (u.uViewport.value as THREE.Vector2).set(this.hdrTarget.width, this.hdrTarget.height);
  }

  /** Shows only these meshes, each with its material, for one render into the current target. */
  private renderOnly(cam: THREE.Camera, draws: [GameObject, THREE.Material][]) {
    const vis = new Map<THREE.Object3D, boolean>();
    this.three.traverse((o) => vis.set(o, o.visible));
    const bg = this.three.background;
    this.three.background = null;
    this.three.traverse((o) => (o.visible = false));
    this.three.visible = true;
    const used: THREE.Mesh[] = [];
    for (const [go, mat] of draws) {
      const e = this.entries.get(go);
      if (!e) continue;
      e.mesh.visible = true;
      e.mesh.material = mat;
      used.push(e.mesh);
      this.renderer.render(this.three, cam);
      e.mesh.visible = false;
    }
    this.three.background = bg;
    for (const [o, v] of vis) o.visible = v;
    return used;
  }

  private renderHighlight(h: HighlightSets, cam: THREE.Camera) {
    const r = this.renderer;
    const visible = [...this.entries.values()].filter((e) => e.go.visible).map((e) => e.go);
    const meshes = (list: GameObject[]) => list.filter((go) => go.mesh && go.visible);
    r.setRenderTarget(this.hlMask);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    const draws: [GameObject, THREE.Material][] = visible.map((go) => [go, this.depthOnlyMat]);
    const [selVis, selOcc, deVis, deOcc] = this.hlChannels;
    for (const go of meshes(h.selects)) draws.push([go, selVis], [go, selOcc]);
    for (const go of meshes(h.deselects)) draws.push([go, deVis], [go, deOcc]);
    this.renderOnly(cam, draws);
    this.restoreSurfaces();

    const rim = h.width * this.dpr;
    const u = this.hlMat.uniforms;
    u.uWidth.value = rim;
    u.uR.value = this.hlDistMat.uniforms.uR.value = Math.min(8, Math.ceil(rim + 1));
    (u.uSelect.value as THREE.Vector4).fromArray(srgbToLinear(h.selectColor));
    (u.uDeselect.value as THREE.Vector4).fromArray(srgbToLinear(h.deselectColor));
    u.uOccluded.value = h.occludedOpacity;
    u.uFill.value = h.fill ? 1 : 0;
    u.uOutline.value = h.outline ? 1 : 0;
    u.uAlpha.value = h.alpha;
    r.setRenderTarget(this.hlDist);
    r.render(this.hlDistScene, this.quadCam);
    r.setRenderTarget(null);
    r.render(this.hlScene, this.quadCam);
  }

  /** Box Select's Visible Only read of the view: which object owns each pixel, ground and hidden ones aside. */
  captureIds(view: SceneView, objects: GameObject[]): IdCapture {
    this.sync();
    const cam = this.camera(view);
    const r = this.renderer;
    const index = new Map(objects.map((go, i) => [go, i + 1]));
    r.setRenderTarget(this.idTarget);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    const draws: [GameObject, THREE.Material][] = [];
    for (const e of this.entries.values()) {
      if (!e.go.visible) continue;
      const id = index.get(e.go) ?? 0;
      const mat = this.idMat.clone();
      (mat.uniforms.uId.value as THREE.Vector4).set(
        (id & 255) / 255,
        ((id >> 8) & 255) / 255,
        ((id >> 16) & 255) / 255,
        1,
      );
      draws.push([e.go, mat]);
    }
    this.renderOnly(cam, draws);
    for (const [, m] of draws) m.dispose();
    const w = this.idTarget.width,
      h = this.idTarget.height;
    const data = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(this.idTarget, 0, 0, w, h, data);
    r.setRenderTarget(null);
    this.restoreSurfaces();
    return { width: w, height: h, scale: this.dpr, data };
  }

  dispose() {
    this.renderer.dispose();
    this.maskTarget.dispose();
    this.distTarget.dispose();
    this.hdrTarget.dispose();
    this.hlMask.dispose();
    this.hlDist.dispose();
    this.idTarget.dispose();
  }
}

/** Writes one channel of the highlight mask: in front of the scene's depth, or behind it. */
function maskMaterial(depthFunc: THREE.DepthModes, channel: [number, number, number, number]) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Vector4(...channel) } },
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec4 uColor; void main(){ gl_FragColor = uColor; }',
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    depthFunc,
    depthWrite: false,
    // Pulled towards the camera, so the object's own surface counts as in front, not behind.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
}

function setColumns(m: THREE.Matrix3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  m.set(a.x, b.x, c.x, a.y, b.y, c.y, a.z, b.z, c.z);
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const srgbToLinear = ([r, g, b, a]: [number, number, number, number]): [number, number, number, number] => [
  toLinear(r),
  toLinear(g),
  toLinear(b),
  a,
];
