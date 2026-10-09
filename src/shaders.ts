import type * as THREE from 'three';

export const uTime = { value: 0 };

type Shader = THREE.WebGLProgramParametersWithUniforms;

export const NOISE = /* glsl */ `
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`;

// Adds a world-space position varying (vWPos) to a built-in material.
export function withWorldPos(s: Shader) {
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      #ifdef USE_INSTANCING
        vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`,
    );
  s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${NOISE}`);
}

// Gritty stone surface: bumps the normal with 3D value noise in world space.
export function stoneDetail(mat: THREE.MeshStandardMaterial, scale = 9, amount = 0.6) {
  mat.onBeforeCompile = (s) => {
    withWorldPos(s);
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float sd0 = vnoise3(vWPos * ${scale.toFixed(1)}) * 0.6 + vnoise3(vWPos * ${(scale * 3.1).toFixed(1)}) * 0.4;
        diffuseColor.rgb *= 0.82 + 0.3 * sd0;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 q = vWPos * ${scale.toFixed(1)};
          float e = 0.15;
          float h0 = vnoise3(q) + 0.5 * vnoise3(q * 3.1);
          vec3 gr = vec3(
            vnoise3(q + vec3(e, 0, 0)) + 0.5 * vnoise3((q + vec3(e, 0, 0)) * 3.1),
            vnoise3(q + vec3(0, e, 0)) + 0.5 * vnoise3((q + vec3(0, e, 0)) * 3.1),
            vnoise3(q + vec3(0, 0, e)) + 0.5 * vnoise3((q + vec3(0, 0, e)) * 3.1)) - h0;
          normal = normalize(normal - (viewMatrix * vec4(gr, 0.0)).xyz * ${amount.toFixed(2)});
        }`,
      );
  };
}

// Wind sway for tree parts. Height above `base` sets how far a vertex moves.
export function swayVertex(base = 1.6, flutter = 0) {
  return /* glsl */ `
  {
    vec4 swp = modelMatrix * vec4(transformed, 1.0);
    float hh = max(0.0, swp.y - ${base.toFixed(2)});
    float gust = 0.6 + 0.4 * sin(uTime * 0.23 + swp.x * 0.05);
    float s = (sin(uTime * 0.9 + swp.x * 0.35 + swp.z * 0.2) * 0.5 + sin(uTime * 1.7 + swp.x * 0.8) * 0.25) * gust;
    transformed.x += s * hh * 0.03;
    transformed.z += cos(uTime * 0.7 + swp.z * 0.3) * hh * 0.018 * gust;
    transformed += vec3(sin(uTime * 5.0 + swp.x * 13.0), cos(uTime * 4.3 + swp.z * 11.0), sin(uTime * 4.7 + swp.y * 9.0)) * ${flutter.toFixed(4)} * hh;
  }`;
}
