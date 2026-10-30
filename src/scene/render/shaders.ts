// GLSL for the grid and the selection outline.

// A full-screen pass: each pixel finds its own point on the grid plane.
export const GRID_VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Unity's grid: 1-unit lines that fade out with distance over 10-unit lines that carry further,
// levels stepping by 10 as the view zooms. Constants matched to the reference capture.
// Each pixel ray-casts the plane: a quad reaching the horizon rasterizes too coarse a depth for a floor laid on it.
export const GRID_FRAG = /* glsl */ `
uniform vec3 uCamPos;
uniform vec3 uViewDir;
uniform float uSize;
uniform float uOrtho;
uniform float uUnit;
uniform vec2 uOrigin;
uniform vec4 uColor;
uniform vec4 uNear;
uniform vec4 uFar;
uniform float uPlaneY;
uniform vec2 uViewport;
// Near and far clip distances.
uniform vec2 uClip;
// Columns: the ray at the view's centre, then its change per NDC unit in x and in y.
uniform mat3 uRayOrigin;
uniform mat3 uRayDir;

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
  vec2 ndc = gl_FragCoord.xy / uViewport * 2.0 - 1.0;
  vec3 ro = uRayOrigin * vec3(1.0, ndc);
  vec3 rd = uRayDir * vec3(1.0, ndc);
  // rd is one unit long along the view axis, so the hit's distance is its view depth too.
  float hit = (uPlaneY - ro.y) / rd.y;
  vec3 world = ro + rd * hit;
  float depth = uOrtho > 0.5
    ? (hit - uClip.x) / (uClip.y - uClip.x)
    : uClip.y / (uClip.y - uClip.x) * (1.0 - uClip.x / hit);

  // The grid size from the Grid and Snap toolbar scales every level.
  vec2 cell = (world.xz - uOrigin) / uUnit;
  float lod = log(max(uSize / uUnit, 1e-4) * 0.35) / log(10.0);
  float level = floor(lod);
  float t = lod - level;
  float s0 = pow(10.0, max(level, -3.0));
  float dist = uOrtho > 0.5 ? uSize : length(world - uCamPos);
  float a0 = lineAlpha(cell, s0) * (1.0 - t) * (1.0 - smoothstep(uSize * uNear.y, uSize * uNear.z, dist));
  float a1 = lineAlpha(cell, s0 * 10.0) * (1.0 - smoothstep(uSize * uFar.y, uSize * uFar.z, dist));
  float a = max(a0 * uNear.x, a1 * uFar.x);

  vec3 toFrag = normalize(world - uCamPos);
  float grazing = uOrtho > 0.5 ? abs(uViewDir.y) : abs(toFrag.y);
  a *= smoothstep(0.0, 0.1, grazing);

  // Pulled toward the camera like a polygon offset: a pixel's slope plus four steps of the 24-bit buffer.
  float bias = fwidth(depth) + 4.0 / 16777216.0;
  float alpha = uColor.a * a;
  if (!(hit > 0.0) || depth >= 1.0 || alpha <= 0.002) discard;
  gl_FragDepth = max(depth - bias, 0.0);
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

/** Box Select highlight, horizontal half: the distance transform of all four mask channels. */
export const DIST4_H_FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform float uR;
varying vec2 vUv;
void main() {
  vec4 best = vec4(16.0);
  for (int i = -8; i <= 8; i++) {
    float fi = float(i);
    if (abs(fi) > uR) continue;
    vec4 m = texture2D(uMask, vUv + vec2(fi * uTexel.x, 0.0));
    best = min(best, mix(vec4(16.0), vec4(abs(fi)), step(0.5, m)));
  }
  gl_FragColor = best / 16.0;
}`;

// What both highlight passes share: one layer's colour from its fill and rim coverage, selects over deselects.
const HIGHLIGHT_LAYERS = /* glsl */ `
uniform float uWidth;
uniform vec4 uSelect;
uniform vec4 uDeselect;
uniform float uOccluded;
uniform float uFill;
uniform float uOutline;
uniform float uAlpha;
varying vec2 vUv;

vec4 layer(vec3 color, float fillAlpha, float vis, float occ, float rimVis, float rimOcc) {
  rimVis *= uOutline;
  rimOcc *= uOutline * uOccluded;
  float rim = rimVis + rimOcc * (1.0 - rimVis);
  float fill = uFill * fillAlpha * (step(0.5, vis) + step(0.5, occ) * (1.0 - step(0.5, vis)) * uOccluded);
  return vec4(color, max(rim, fill));
}

vec4 overDeselects(vec4 s, vec4 u) {
  float a = s.a + u.a * (1.0 - s.a);
  if (a <= 0.0) return vec4(0.0);
  vec3 c = (s.rgb * s.a + u.rgb * u.a * (1.0 - s.a)) / a;
  return vec4(c, a * uAlpha);
}`;

/**
 * Box Select highlight: what a release selects (r visible, g hidden) and deselects (b visible, a hidden).
 * Each rim grows from its own part and is cut back by the whole silhouette, the hidden one fainter;
 * selects are drawn over deselects, as Blendon draws them.
 */
export const HIGHLIGHT_FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform sampler2D uDist;
uniform vec2 uTexel;
uniform float uR;
${HIGHLIGHT_LAYERS}

vec2 rims(float vis, float occ, float dVis, float dOcc) {
  float outside = 1.0 - max(step(0.5, vis), step(0.5, occ));
  return vec2(clamp(uWidth + 0.5 - dVis, 0.0, 1.0), clamp(uWidth + 0.5 - dOcc, 0.0, 1.0)) * outside;
}

void main() {
  vec4 d = vec4(16.0);
  for (int j = -8; j <= 8; j++) {
    float fj = float(j);
    if (abs(fj) > uR) continue;
    vec4 dx = texture2D(uDist, vUv + vec2(0.0, fj * uTexel.y)) * 16.0;
    d = min(d, sqrt(dx * dx + fj * fj));
  }
  vec4 m = texture2D(uMask, vUv);
  vec2 rs = rims(m.r, m.g, d.r, d.g);
  vec2 ru = rims(m.b, m.a, d.b, d.a);
  vec4 o = overDeselects(
    layer(uSelect.rgb, uSelect.a, m.r, m.g, rs.x, rs.y),
    layer(uDeselect.rgb, uDeselect.a, m.b, m.a, ru.x, ru.y)
  );
  if (o.a <= 0.0) discard;
  gl_FragColor = o;
  #include <colorspace_fragment>
}`;

/** An object's id in r and g, with b set on its front faces only: a back face hides what is behind, never outlines. */
export const OBJECT_ID_FRAG = /* glsl */ `
uniform vec2 uId;
void main() {
  gl_FragColor = vec4(uId, gl_FrontFacing ? 1.0 : 0.0, 1.0);
}`;

// Per pixel, how far the nearest front face of a nearer other object is: x where it shows, y where it is hidden.
// The ids carry their own depth, so a hidden part of one object still finds its neighbours.
const OBJECT_EDGE = /* glsl */ `
uniform vec2 uTexel;
uniform int uReach;

float objectAt(vec4 c) {
  return floor(c.r * 255.0 + 0.5) + floor(c.g * 255.0 + 0.5) * 256.0;
}

vec2 objectEdge(sampler2D ids, sampler2D depth, sampler2D mask, vec4 channel, bool inner, float width) {
  vec2 best = vec2(16.0);
  float self = objectAt(texture2D(ids, vUv));
  // Outside every object is the outer contour, left to whoever draws it.
  if (inner && self < 0.5) return best;
  float selfDepth = texture2D(depth, vUv).r;
  for (int j = -uReach; j <= uReach; j++)
    for (int i = -uReach; i <= uReach; i++) {
      float d = length(vec2(float(i), float(j)));
      if (d > width + 0.5 || d >= max(best.x, best.y)) continue;
      vec2 uv = vUv + vec2(float(i), float(j)) * uTexel;
      vec4 other = texture2D(ids, uv);
      if (other.b < 0.5 || abs(objectAt(other) - self) < 0.5) continue;
      if (self > 0.5 && texture2D(depth, uv).r >= selfDepth) continue;
      if (dot(texture2D(mask, uv), channel) > 0.5) best.x = min(best.x, d);
      else best.y = min(best.y, d);
    }
  return best;
}`;

/**
 * Box Select highlight with Separate Outlines: each marked object rims itself, also over a farther marked one.
 * Fills and visibility still come from the mask; selects and deselects each have their own ids.
 */
export const HIGHLIGHT_SEPARATE_FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform sampler2D uSelectIds;
uniform sampler2D uSelectDepth;
uniform sampler2D uDeselectIds;
uniform sampler2D uDeselectDepth;
uniform vec2 uLayers;
${HIGHLIGHT_LAYERS}
${OBJECT_EDGE}

vec2 rims(vec2 d) {
  return clamp(uWidth + 0.5 - d, 0.0, 1.0);
}

void main() {
  vec4 m = texture2D(uMask, vUv);
  vec2 ds = vec2(16.0), du = vec2(16.0);
  if (uLayers.x > 0.5) ds = objectEdge(uSelectIds, uSelectDepth, uMask, vec4(1.0, 0.0, 0.0, 0.0), false, uWidth);
  if (uLayers.y > 0.5) du = objectEdge(uDeselectIds, uDeselectDepth, uMask, vec4(0.0, 0.0, 1.0, 0.0), false, uWidth);
  vec2 rs = rims(ds);
  vec2 ru = rims(du);
  vec4 o = overDeselects(
    layer(uSelect.rgb, uSelect.a, m.r, m.g, rs.x, rs.y),
    layer(uDeselect.rgb, uDeselect.a, m.b, m.a, ru.x, ru.y)
  );
  if (o.a <= 0.0) discard;
  gl_FragColor = o;
  #include <colorspace_fragment>
}`;

/** Lines Between Objects: the selection's inner lines, where one selected object's edge lies over another. */
export const SELECTION_LINES_FRAG = /* glsl */ `
uniform sampler2D uIds;
uniform sampler2D uDepth;
uniform float uWidth;
uniform vec3 uColor;
varying vec2 vUv;
${OBJECT_EDGE}

void main() {
  vec2 d = objectEdge(uIds, uDepth, uIds, vec4(0.0), true, uWidth);
  float a = clamp(uWidth + 0.5 - min(d.x, d.y), 0.0, 1.0);
  if (a <= 0.0) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;
