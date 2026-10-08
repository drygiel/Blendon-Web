// Runs in the page scripts/bake-sky.html opens: prefilters the sky and copies the result texel for texel into
// the canvas, sRGB-encoded, for scripts/bake-sky.ts to save as public/scene/sky-env.png.
import * as THREE from 'three';
import { prefilterSky } from './sky.ts';

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true });
const target = prefilterSky(renderer);
renderer.setPixelRatio(1);
renderer.setSize(target.width, target.height, false);

const copy = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: { map: { value: target.texture } },
  vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
  // The canvas's bottom row is the texture's first, as a texture loaded from the picture has it again.
  fragmentShader: `uniform sampler2D map; out vec4 color;
    vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main(){ color = vec4(srgb(clamp(texelFetch(map, ivec2(gl_FragCoord.xy), 0).rgb, 0.0, 1.0)), 1.0); }`,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copy);
quad.frustumCulled = false;
const scene = new THREE.Scene();
scene.add(quad);
renderer.render(scene, new THREE.OrthographicCamera());

(window as unknown as { skyPng?: string }).skyPng = renderer.domElement.toDataURL('image/png');
