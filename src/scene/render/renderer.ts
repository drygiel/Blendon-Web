// three.js view of the Unity scene: mirrored into a right-handed space (z flipped), lit like the
// default URP setup, with Unity's grid and selection outline drawn on top.
import * as THREE from 'three';
import { Quaternion, Vector3 } from '../unity/math.ts';
import type { GameObject, Mesh, Scene } from '../unity/scene.ts';
import { DrawCameraMode, type SceneView } from '../unity/sceneview.ts';
import { DIST_H_FRAG, GRID_FRAG, GRID_VERT, OUTLINE_FRAG, POST_FRAG, QUAD_VERT } from './shaders.ts';

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
  version: number;
}

/** Unity's scene-view lighting for this demo: the scene's directional light and a sky ambient. */
const LIGHT_EULER = new Vector3(50, 330, 0);
// Unity lights without the 1/pi three.js puts on diffuse, so its intensity 4 is about 4 * pi here;
// these and the sky below were matched to the reference capture's face colours.
const LIGHT_INTENSITY = 12;
const ENV_INTENSITY = 0.7;

/** The default procedural skybox as an environment: lights the ambient and the reflections. */
function skyEnvironment(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Vector3(0.14, 0.22, 0.45) },
      uHorizon: { value: new THREE.Vector3(0.55, 0.66, 0.85) },
      uGround: { value: new THREE.Vector3(0.11, 0.1, 0.095) },
    },
    vertexShader:
      'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); vec3 c = d.y >= 0.0 ? mix(uHorizon, uZenith, pow(d.y, 0.45)) : mix(uHorizon, uGround, pow(-d.y, 0.25));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0, 0.1, 100).texture;
  pmrem.dispose();
  return tex;
}

export interface OutlineSets {
  selected: GameObject[];
  children: GameObject[];
  extra: GameObject[];
  extraColor: THREE.Color;
}

export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly three = new THREE.Scene();
  private readonly persp = new THREE.PerspectiveCamera();
  private readonly ortho = new THREE.OrthographicCamera();
  private readonly entries = new Map<GameObject, Entry>();
  private readonly grid: THREE.Mesh;
  private readonly gridMat: THREE.ShaderMaterial;
  private readonly maskTarget: THREE.WebGLRenderTarget;
  private readonly distTarget: THREE.WebGLRenderTarget;
  private readonly maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private readonly distMat: THREE.ShaderMaterial;
  private readonly outlineMat: THREE.ShaderMaterial;
  private readonly distScene = new THREE.Scene();
  private readonly hdrTarget: THREE.WebGLRenderTarget;
  private readonly postMat: THREE.ShaderMaterial;
  private readonly postScene = new THREE.Scene();
  private readonly quadScene = new THREE.Scene();
  private readonly scene: Scene;
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly wireMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
  private readonly wireOverlayMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
  private readonly material = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.5, metalness: 0 });
  // Scene lighting off: Unity lights the view with a headlight on the camera instead of the scene's lights.
  private readonly unlitMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalMatrix * normal;
        vView = isOrthographic ? vec3(0.0, 0.0, 1.0) : -p.xyz;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float ndl = max(dot(normalize(vNormal), normalize(vView)), 0.0);
        gl_FragColor = vec4(vec3(0.214) * (0.35 + 1.6 * ndl), 1.0);
      }`,
  });

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
    this.three.background = new THREE.Color().setRGB(0.278431, 0.278431, 0.278431, THREE.SRGBColorSpace);

    const light = new THREE.DirectionalLight(
      new THREE.Color().setRGB(1, 0.972, 0.944, THREE.SRGBColorSpace),
      LIGHT_INTENSITY,
    );
    const dir = Quaternion.euler(LIGHT_EULER).mulV(Vector3.forward);
    light.position.copy(toThreeV(dir.mul(-100)));
    light.target.position.set(0, 0, 0);
    this.three.add(light, light.target);
    this.three.environment = skyEnvironment(this.renderer);
    this.three.environmentIntensity = ENV_INTENSITY;

    this.gridMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uCamPos: { value: new THREE.Vector3() },
        uSize: { value: 10 },
        uOrtho: { value: 0 },
        uViewDir: { value: new THREE.Vector3() },
        uColor: { value: new THREE.Vector4(0.214, 0.214, 0.214, 0.4) },
        // Strength, fade start and end (in view sizes), line width.
        uNear: { value: new THREE.Vector4(4, 1, 5, 0) },
        uFar: { value: new THREE.Vector4(1.4, 3, 40, 0.7) },
      },
    });
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.gridMat);
    this.grid.frustumCulled = false;
    this.grid.renderOrder = 10;
    this.three.add(this.grid);

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
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.matrixAutoUpdate = false;
        const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), this.wireMat);
        wire.matrixAutoUpdate = false;
        this.three.add(mesh, wire);
        e = { go, mesh, wire, version: -1 };
        this.entries.set(go, e);
      }
      const t = go.transform;
      if (e.version !== t.version) {
        e.version = t.version;
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
        this.entries.delete(go);
      }
  }

  private camera(view: SceneView): THREE.Camera {
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

  render(view: SceneView, outline: OutlineSets) {
    this.sync();
    const cam = this.camera(view);
    const mode = view.drawMode;
    const wireOnly = mode === DrawCameraMode.Wireframe;
    // Unity's Unlit is the Textured draw mode with the scene lighting toggle off.
    const unlit = !view.sceneLighting;
    for (const e of this.entries.values()) {
      const vis = e.go.visible;
      e.mesh.visible = vis && !wireOnly;
      e.mesh.material = unlit ? this.unlitMat : this.material;
      e.wire.visible = vis && (wireOnly || mode === DrawCameraMode.TexturedWire);
      e.wire.material = wireOnly ? this.wireMat : this.wireOverlayMat;
    }

    // The grid plane follows the camera so it reaches the horizon at any zoom.
    const c = view.camera;
    const reach = Math.max(view.size * 600, 50);
    this.grid.visible = view.showGrid;
    this.grid.scale.set(reach * 2, 1, reach * 2);
    this.grid.position.set(c.position.x, 0, -c.position.z);
    this.grid.updateMatrixWorld();
    const u = this.gridMat.uniforms;
    (u.uCamPos.value as THREE.Vector3).copy(toThreeV(c.position));
    (u.uViewDir.value as THREE.Vector3).copy(toThreeV(c.forward));
    u.uSize.value = view.size;
    u.uOrtho.value = c.orthographic ? 1 : 0;

    const r = this.renderer;
    r.setRenderTarget(this.hdrTarget);
    r.clear();
    r.render(this.three, cam);
    r.setRenderTarget(null);
    r.render(this.postScene, this.quadCam);

    // Selection outline: a mask of what's outlined, then its rim composited over the frame.
    const sets: [GameObject[], number][] = [
      [outline.selected, 0],
      [outline.children, 1],
      [outline.extra, 2],
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
      for (const e of this.entries.values()) e.mesh.material = unlit ? this.unlitMat : this.material;
      r.setRenderTarget(this.distTarget);
      r.render(this.distScene, this.quadCam);
      r.setRenderTarget(null);
      (this.outlineMat.uniforms.uExtra.value as THREE.Color).copy(outline.extraColor);
      r.render(this.quadScene, this.quadCam);
    }
  }

  dispose() {
    this.renderer.dispose();
    this.maskTarget.dispose();
    this.distTarget.dispose();
    this.hdrTarget.dispose();
  }
}
