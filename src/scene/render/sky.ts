// Unity's default procedural sky as the Scene view's environment: it lights the ambient and the reflections.
// Prefiltering it (PMREM) compiles a shader heavy enough to stall the page for most of a second, so the result
// is baked once into public/scene/sky-env.png by `pnpm bake:sky` and loaded as a ready texture.
import * as THREE from 'three';

/** The sky's gradient, as a scene for the PMREM prefilter. */
export function skyScene(): THREE.Scene {
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
  return env;
}

/** Prefilters the sky now, as the bake does; the slow path the baked picture replaces. */
export function prefilterSky(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(skyScene(), 0, 0.1, 100);
  pmrem.dispose();
  return target;
}

let pending: Promise<HTMLImageElement> | null = null;
let baked: HTMLImageElement | null = null;

/** Fetches and decodes the baked environment ahead of the Scene view, so it lights the very first frame. */
export function loadSkyEnvironment(): Promise<HTMLImageElement> {
  pending ??= (async () => {
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}scene/sky-env.png`;
    await img.decode();
    return (baked = img);
  })();
  return pending;
}

function bakedTexture(img: HTMLImageElement): THREE.Texture {
  const tex = new THREE.Texture(img);
  // The prefilter's own layout: three.js samples it as is, with no prefilter of its own.
  tex.mapping = THREE.CubeUVReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Puts the baked environment on `scene`, at once if it is loaded. If the picture cannot be loaded the sky is
 * prefiltered here after all, slow but right. Resolves once the environment is on.
 */
export function applySkyEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Promise<void> {
  if (baked) {
    scene.environment = bakedTexture(baked);
    return Promise.resolve();
  }
  return loadSkyEnvironment().then(
    (img) => void (scene.environment = bakedTexture(img)),
    () => void (scene.environment = prefilterSky(renderer).texture),
  );
}
