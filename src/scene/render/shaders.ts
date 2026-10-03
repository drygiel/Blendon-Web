// GLSL for the grid and the selection outline.

export const GRID_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Unity's grid: 1-unit lines that fade out with distance over 10-unit lines that carry further,
// levels stepping by 10 as the view zooms. Constants matched to the reference capture.
export const GRID_FRAG = /* glsl */ `
uniform vec3 uCamPos;
uniform vec3 uViewDir;
uniform float uSize;
uniform float uOrtho;
uniform vec4 uColor;
uniform vec4 uNear;
uniform vec4 uFar;
varying vec3 vWorld;

float lineAlpha(vec2 p, float spacing) {
  vec2 q = p / spacing;
  vec2 fw = fwidth(q);
  vec2 g = abs(fract(q - 0.5) - 0.5) / max(fw, 1e-5);
  float line = clamp(uFar.w - min(g.x, g.y), 0.0, 1.0);
  // Cells under a few pixels blur into a haze; fade them out instead.
  float density = max(fw.x, fw.y);
  return line * (1.0 - smoothstep(0.06, 0.25, density));
}

void main() {
  float lod = log(max(uSize, 1e-4) * 0.35) / log(10.0);
  float level = floor(lod);
  float t = lod - level;
  float s0 = pow(10.0, max(level, -3.0));
  float dist = uOrtho > 0.5 ? uSize : length(vWorld - uCamPos);
  float a0 = lineAlpha(vWorld.xz, s0) * (1.0 - t) * (1.0 - smoothstep(uSize * uNear.y, uSize * uNear.z, dist));
  float a1 = lineAlpha(vWorld.xz, s0 * 10.0) * (1.0 - smoothstep(uSize * uFar.y, uSize * uFar.z, dist));
  float a = max(a0 * uNear.x, a1 * uFar.x);

  vec3 toFrag = normalize(vWorld - uCamPos);
  float grazing = uOrtho > 0.5 ? abs(uViewDir.y) : abs(toFrag.y);
  a *= smoothstep(0.0, 0.1, grazing);

  float alpha = uColor.a * a;
  if (alpha <= 0.002) discard;
  gl_FragColor = vec4(uColor.rgb, min(alpha, 1.0));
  #include <colorspace_fragment>
}`;

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** Horizontal half of the distance transform: per channel, how far the nearest masked pixel is in x. */
export const DIST_H_FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform float uR;
varying vec2 vUv;
void main() {
  vec3 best = vec3(16.0);
  for (int i = -8; i <= 8; i++) {
    float fi = float(i);
    if (abs(fi) > uR) continue;
    vec3 m = texture2D(uMask, vUv + vec2(fi * uTexel.x, 0.0)).rgb;
    best = min(best, mix(vec3(16.0), vec3(abs(fi)), step(0.5, m)));
  }
  gl_FragColor = vec4(best / 16.0, 1.0);
}`;

/** Vertical half, then the rim: pixels outside a shape within uWidth of it, antialiased. */
export const OUTLINE_FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform sampler2D uDist;
uniform vec2 uTexel;
uniform float uR;
uniform float uWidth;
uniform vec3 uSelected;
uniform vec3 uChildren;
uniform vec3 uExtra;
uniform float uExtraAlpha;
varying vec2 vUv;
void main() {
  vec3 d = vec3(16.0);
  for (int j = -8; j <= 8; j++) {
    float fj = float(j);
    if (abs(fj) > uR) continue;
    vec3 dx = texture2D(uDist, vUv + vec2(0.0, fj * uTexel.y)).rgb * 16.0;
    d = min(d, sqrt(dx * dx + fj * fj));
  }
  vec3 inside = texture2D(uMask, vUv).rgb;
  vec3 a = clamp(uWidth + 0.5 - d, 0.0, 1.0) * (1.0 - smoothstep(0.35, 0.65, inside));
  vec4 o = vec4(0.0);
  if (a.r > 0.0 && inside.g < 0.5 && inside.b < 0.5) o = vec4(uSelected, a.r);
  else if (a.g > 0.0 && inside.r < 0.5) o = vec4(uChildren, a.g);
  else if (a.b > 0.0 && inside.r < 0.5) o = vec4(uExtra, a.b * uExtraAlpha);
  if (o.a <= 0.0) discard;
  gl_FragColor = o;
  #include <colorspace_fragment>
}`;

/** URP's uber post as the reference scene had it: Vignette (0.2), then the Neutral tonemapper. */
export const POST_FRAG = /* glsl */ `
uniform sampler2D uColor;
uniform float uVignette;
uniform float uAspect;
varying vec2 vUv;

vec3 neutralCurve(vec3 x, float a, float b, float c, float d, float e, float f) {
  return ((x * (a * x + c * b) + d * e) / (x * (a * x + b) + d * f)) - e / f;
}

vec3 neutralTonemap(vec3 x) {
  const float a = 0.2, b = 0.29, c = 0.24, d = 0.272, e = 0.02, f = 0.3;
  vec3 whiteScale = vec3(1.0) / neutralCurve(vec3(5.3), a, b, c, d, e, f);
  x = neutralCurve(x * whiteScale, a, b, c, d, e, f);
  return x * whiteScale;
}

void main() {
  vec3 c = texture2D(uColor, vUv).rgb;
  vec2 dist = abs(vUv - 0.5) * uVignette * 3.0;
  float vf = clamp(1.0 - dot(dist, dist), 0.0, 1.0);
  c *= vf;
  gl_FragColor = vec4(clamp(neutralTonemap(max(c, 0.0)), 0.0, 1.0), 1.0);
  #include <colorspace_fragment>
}`;
