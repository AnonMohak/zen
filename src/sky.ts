import * as THREE from 'three';
import { SUN_DIR } from './layout';

export const HORIZON = new THREE.Color('#f2d3cc');

// Soft morning gradient: pale blue zenith, peach-pink horizon, warm sun glow.
export function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: new THREE.Vector3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z).normalize() },
      uZenith: { value: new THREE.Color('#86aed8') },
      uMid: { value: new THREE.Color('#cbd9ea') },
      uHorizon: { value: HORIZON },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uZenith, uMid, uHorizon;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.25, h));
        c = mix(c, uZenith, smoothstep(0.2, 0.9, h));
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.82, 0.62) * (pow(s, 6.0) * 0.35 + pow(s, 64.0) * 0.6 + pow(s, 900.0) * 6.0);
        if (d.y < 0.0) c = uHorizon;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

// Bakes the sky into a PMREM environment map for reflections and soft fill.
export function skyEnvironment(renderer: THREE.WebGLRenderer, sky: THREE.Mesh) {
  const s = new THREE.Scene();
  s.add(sky.clone());
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(s, 0.02);
  pmrem.dispose();
  return rt.texture;
}
