// The demo's surface: each object's own colour under a technical grid, one baked 1 m tile projected along the
// object's axes and measured from its bounds, so a box's faces start on a whole tile and the grid travels with it.
import * as THREE from 'three';
import type { Color } from '../unity/math.ts';
import type { Mesh } from '../unity/scene.ts';

// Pixels per metre of the baked tile.
const TILE = 1024;

/** The 1 m tile: red is light ink (grid, ruler, marks, labels), green is dark ink (panel seams, hatching). */
function bakeTile(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, TILE, TILE);
  // Additive, so light and dark ink never cover each other.
  g.globalCompositeOperation = 'lighter';
  const light = (a: number) => `rgba(255,0,0,${a})`;
  const dark = (a: number) => `rgba(0,255,0,${a})`;
  const line = (style: string, width: number, x0: number, y0: number, x1: number, y1: number) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };

  // Panel seam on the tile's edge, half on each side, so neighbouring tiles share one groove.
  g.fillStyle = dark(0.9);
  for (const [x, y, w, h] of [
    [0, 0, TILE, 6],
    [0, TILE - 6, TILE, 6],
    [0, 0, 6, TILE],
    [TILE - 6, 0, 6, TILE],
  ])
    g.fillRect(x, y, w, h);

  // Eighth-metre grid, half-metre cross.
  for (let i = 1; i < 8; i++) {
    const p = i * (TILE / 8);
    const half = i === 4;
    line(light(half ? 0.5 : 0.22), half ? 5 : 2, p, 0, p, TILE);
    line(light(half ? 0.5 : 0.22), half ? 5 : 2, 0, p, TILE, p);
  }

  // The plate's outline and corner brackets.
  const inset = 28;
  const far = TILE - inset;
  g.strokeStyle = light(0.85);
  g.lineWidth = 7;
  g.strokeRect(inset, inset, far - inset, far - inset);
  const arm = 76;
  for (const [x, y, dx, dy] of [
    [inset, inset, 1, 1],
    [far, inset, -1, 1],
    [inset, far, 1, -1],
    [far, far, -1, -1],
  ]) {
    line(light(1), 10, x, y, x + dx * arm, y);
    line(light(1), 10, x, y, x, y + dy * arm);
  }

  // Ruler along the bottom edge: 1/32, 1/8 and 1/2 m ticks.
  for (let i = 1; i < 32; i++) {
    const x = i * (TILE / 32);
    const len = i % 16 === 0 ? 52 : i % 4 === 0 ? 34 : 16;
    line(light(0.85), 3, x, far, x, far - len);
  }

  // Centre target.
  g.strokeStyle = light(0.7);
  g.lineWidth = 3;
  g.beginPath();
  g.arc(TILE / 2, TILE / 2, 54, 0, Math.PI * 2);
  g.stroke();
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    line(light(0.7), 3, TILE / 2 + dx * 22, TILE / 2 + dy * 22, TILE / 2 + dx * 92, TILE / 2 + dy * 92);

  // Hatched corner, like a keep-clear marking.
  g.save();
  g.beginPath();
  g.moveTo(far, far - 150);
  g.lineTo(far, far);
  g.lineTo(far - 150, far);
  g.closePath();
  g.clip();
  for (let k = -150; k < 150; k += 30) line(dark(0.75), 12, far + k - 150, far, far + k, far - 150);
  g.restore();

  // Labels, in system monospace fonts so the bake never waits on a web font.
  g.fillStyle = light(0.9);
  g.font = '700 60px ui-monospace, Menlo, Consolas, monospace';
  g.textBaseline = 'alphabetic';
  g.fillText('1.00 M', 64, 124);
  g.fillStyle = light(0.6);
  g.font = '500 30px ui-monospace, Menlo, Consolas, monospace';
  g.fillText('GRID 0.125', 66, 166);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

let tile: THREE.Texture | null = null;

/** The shared tile, baked on first use. */
export function techTile(renderer: THREE.WebGLRenderer) {
  if (!tile) {
    tile = bakeTile();
    tile.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  return tile;
}

// Object-space position and normal back in Unity's left-handed axes, and the object's scale from its matrix.
const VERT_PARS = /* glsl */ `
varying vec3 vTechLocal;
varying vec3 vTechNormal;
varying vec3 vTechScale;
`;

const VERT = /* glsl */ `
vTechLocal = vec3(position.xy, -position.z);
vTechNormal = vec3(normal.xy, -normal.z);
vTechScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
`;

// Each face reads the tile from its own left and bottom edge as seen from outside, so labels are never mirrored.
// Boxes also get a light rim where two of their bounds meet, an edge catching the light.
const FRAG_PARS = /* glsl */ `
uniform sampler2D uTechTile;
uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;
uniform float uFrame;
varying vec3 vTechLocal;
varying vec3 vTechNormal;
varying vec3 vTechScale;

vec2 techInk() {
  vec3 a = (vTechLocal - uBoundsMin) * vTechScale;
  vec3 b = (uBoundsMax - vTechLocal) * vTechScale;
  vec3 n = normalize(vTechNormal);
  vec3 w = pow(abs(n), vec3(8.0));
  w /= w.x + w.y + w.z;
  vec2 uvX = vec2(n.x > 0.0 ? a.z : b.z, a.y);
  vec2 uvY = vec2(b.x, n.y > 0.0 ? b.z : a.z);
  vec2 uvZ = vec2(n.z > 0.0 ? b.x : a.x, a.y);
  vec2 ink = texture2D(uTechTile, uvX).rg * w.x + texture2D(uTechTile, uvY).rg * w.y
    + texture2D(uTechTile, uvZ).rg * w.z;
  if (uFrame > 0.5) {
    vec3 d = min(a, b);
    vec3 fw = fwidth(d);
    vec3 f = 1.0 - smoothstep(vec3(0.014) - fw, vec3(0.014) + fw, d);
    ink.r = max(ink.r, clamp(f.x + f.y + f.z - 1.0, 0.0, 1.0));
  }
  return ink;
}

// Linear colour: seams darken the paint, ink is a lighter tint of it.
vec3 techAlbedo(vec3 base, vec2 ink) {
  vec3 c = base * (1.0 - 0.5 * ink.y);
  return mix(c, min(base * 2.2 + 0.06, vec3(1.0)), ink.x * 0.6);
}
`;

// One cache key for every object's lit material, so they all share one compiled program.
const PROGRAM_KEY = 'blendon-tech';

/** Shapes whose bounds are their faces, so the rim follows real edges. */
const FRAMED = new Set(['Cube', 'Plane']);

export interface TechMaterials {
  lit: THREE.MeshStandardMaterial;
  unlit: THREE.ShaderMaterial;
}

/** A lit and an unlit material for one object: its colour (sRGB) and its mesh's bounds. */
export function techMaterials(tex: THREE.Texture, mesh: Mesh, color: Color): TechMaterials {
  const b = mesh.bounds;
  const uniforms = {
    uTechTile: { value: tex },
    uBoundsMin: { value: new THREE.Vector3(b.min.x, b.min.y, b.min.z) },
    uBoundsMax: { value: new THREE.Vector3(b.max.x, b.max.y, b.max.z) },
    uFrame: { value: FRAMED.has(mesh.name) ? 1 : 0 },
  };
  const paint = new THREE.Color().setRGB(color.r, color.g, color.b, THREE.SRGBColorSpace);

  const lit = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.82, metalness: 0 });
  lit.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT);
    // A faint glow on the ink keeps the grid readable on faces turned from the light.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 techInkValue = techInk();
        vec3 techPaint = diffuseColor.rgb;
        diffuseColor.rgb = techAlbedo(techPaint, techInkValue);
        totalEmissiveRadiance += techPaint * techInkValue.x * 0.18;`,
      );
  };
  lit.customProgramCacheKey = () => PROGRAM_KEY;

  // Scene lighting off: Unity lights the view with a headlight on the camera instead of the scene's lights.
  const unlit = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uPaint: { value: paint } },
    vertexShader: /* glsl */ `
      ${VERT_PARS}
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        ${VERT}
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalMatrix * normal;
        vView = isOrthographic ? vec3(0.0, 0.0, 1.0) : -p.xyz;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      ${FRAG_PARS}
      uniform vec3 uPaint;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float ndl = max(dot(normalize(vNormal), normalize(vView)), 0.0);
        gl_FragColor = vec4(techAlbedo(uPaint, techInk()) * (0.35 + 1.6 * ndl), 1.0);
      }`,
  });
  return { lit, unlit };
}
