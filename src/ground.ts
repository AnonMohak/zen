import * as THREE from 'three';
import { POND, SAND, groundHeight } from './layout';
import { pbr } from './materials';
import { LOW, Q } from './quality';
import { withWorldPos } from './shaders';

// Ground: raked white gravel with ripple rings around the rocks, moss islands,
// moss outside the gravel, and a muddy bowl for the pond. Gravel and moss use
// Poly Haven scans (gravel_floor, forest_leaves_02), regraded in the shader.
export function createGround(rockIslands: THREE.Vector3[]) {
  const geo = new THREE.PlaneGeometry(110, 110, LOW ? 200 : 300, LOW ? 200 : 300);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const gravel = pbr('gravel_floor');
  const moss = pbr('forest_leaves_02');
  const n = rockIslands.length;
  const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uRocks = { value: rockIslands };
    s.uniforms.uSand = { value: new THREE.Vector4(SAND.cx, SAND.cz, SAND.hx, SAND.hz) };
    s.uniforms.tGravD = { value: gravel.map };
    s.uniforms.tGravN = { value: gravel.normalMap };
    s.uniforms.tGravR = { value: gravel.roughnessMap };
    s.uniforms.tMossD = { value: moss.map };
    s.uniforms.tMossN = { value: moss.normalMap };
    s.uniforms.tMossR = { value: moss.roughnessMap };
    withWorldPos(s);
    if (Q.groundLow) s.defines = { ...s.defines, GROUND_LOW: '' };
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec3 uRocks[${n}];
        uniform vec4 uSand;
        uniform sampler2D tGravD, tGravN, tGravR, tMossD, tMossN, tMossR;
        float sdBox(vec2 p, vec2 b, float r) {
          vec2 q = abs(p) - b + r;
          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        }
        float rockDist(vec2 p) {
          float d = 1e5;
          for (int i = 0; i < ${n}; i++) d = min(d, length(p - uRocks[i].xy) - uRocks[i].z);
          return d;
        }
        const float RAKE = 0.13;
        float rakePhase(vec2 p) {
          float rd = rockDist(p);
          return rd < 1.25 ? rd / RAKE : p.y / RAKE;
        }
        float rakeH(vec2 p) { return 0.5 + 0.5 * cos(rakePhase(p) * 6.2831853); }
        // Two scales, blended by noise, so the tiles do not repeat visibly.
        const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
        vec4 tri(sampler2D t, vec2 p, float size, float mixK) {
          #ifdef GROUND_LOW
          return texture2D(t, p / size);
          #else
          return mix(texture2D(t, p / size), texture2D(t, ROT * p / (size * 2.3) + 0.37), mixK);
          #endif
        }
        vec3 nWorld(vec4 n) { vec3 v = n.xyz * 2.0 - 1.0; return vec3(v.x, v.z, v.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec2 p = vWPos.xz;
        float sd = sdBox(p - uSand.xy, uSand.zw, ${SAND.r.toFixed(2)});
        float rd = rockDist(p);
        float n1 = vnoise(p * 0.7) * 0.65 + vnoise(p * 1.9) * 0.35;
        float island = 1.0 - smoothstep(0.22, 0.34, rd + (n1 - 0.5) * 0.35);
        float moss = max(step(0.0, sd), island);

        float ph = rakePhase(p);
        float rakeFade = (1.0 - moss) * (1.0 - smoothstep(0.3, 0.7, fwidth(ph)));
        float rh = rakeH(p);

        float mk = smoothstep(0.3, 0.7, vnoise(p * 0.3 + 3.0));
        // Sample each set only where it shows (the regions are large and coherent).
        bool useGrav = moss < 0.999;
        bool useMoss = moss > 0.001;
        vec4 gD = useGrav ? tri(tGravD, p, 2.25, mk) : vec4(0.25);
        vec4 mD = useMoss ? tri(tMossD, p, 3.0, mk) : vec4(0.2);
        float gl = dot(gD.rgb, vec3(0.299, 0.587, 0.114));
        float ml = dot(mD.rgb, vec3(0.299, 0.587, 0.114));

        vec3 sandC = mix(vec3(gl), gD.rgb, 0.12) * 2.9 * vec3(0.99, 0.97, 0.93);
        sandC = min(sandC, vec3(0.92));
        sandC *= mix(1.0, 0.84 + 0.18 * rh, rakeFade);
        vec3 mossC = mix(vec3(0.05, 0.10, 0.02), vec3(0.26, 0.36, 0.09), smoothstep(0.02, 0.22, ml));
        mossC *= 0.8 + 0.4 * vnoise(p * 1.3 + 4.0);
        mossC = mix(mossC, mD.rgb * vec3(0.8, 1.0, 0.55), 0.18);
        float depth = clamp(-vWPos.y / ${POND.depth.toFixed(2)}, 0.0, 1.0);
        vec3 mudC = mix(vec3(gl) * vec3(1.1, 0.95, 0.75) * 1.2, vec3(0.05, 0.07, 0.05), smoothstep(0.15, 0.75, depth));

        float mudK = smoothstep(0.03, 0.14, -vWPos.y);
        vec3 groundC = mix(sandC, mossC, moss);
        groundC = mix(groundC, mudC, mudK);
        diffuseColor.rgb = groundC;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(useGrav ? tri(tGravR, p, 2.25, mk).g : 1.0, useMoss ? tri(tMossR, p, 3.0, mk).g : 1.0, moss);
        roughnessFactor = mix(roughnessFactor, 0.35, mudK * 0.6);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        {
          vec3 up = vec3(0.0, 1.0, 0.0);
          vec3 nt = mix(useGrav ? nWorld(tri(tGravN, p, 2.25, mk)) : up, useMoss ? nWorld(tri(tMossN, p, 3.0, mk)) : up, moss);
          vec3 tilt = (nt - up) * mix(0.9, 1.3, moss);
          if (rakeFade > 0.01) {
            float e = 0.01;
            vec2 g = vec2(rakeH(p + vec2(e, 0.0)) - rh, rakeH(p + vec2(0.0, e)) - rh) / e;
            g = clamp(g, -30.0, 30.0) * 0.016 * rakeFade;
            tilt -= vec3(g.x, 0.0, g.y);
          }
          normal = normalize(normal + (viewMatrix * vec4(tilt, 0.0)).xyz);
        }`,
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
