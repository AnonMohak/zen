// Shared garden layout. World units are metres, Y is up.

export const SAND = { cx: -2, cz: 0, hx: 7, hz: 4.6, r: 0.8 };
export const POND = { cx: 9.6, cz: 1.8, rx: 3.3, rz: 2.5, depth: 0.5 };
export const WATER_Y = -0.12;
export const WALL = { z: -7.2, x0: -10.4, x1: 7.5, height: 1.9, thick: 0.5 };
export const SUN_DIR = { x: -0.62, y: 0.42, z: 0.66 };

// Temple hall: the veranda edge faces the garden (+x). Footprint incl. roof overhang.
export const TEMPLE = { x: -16, z: 0, foot: { x0: -24, x1: -9.6, z0: -8.6, z1: 9.4 } };
// Bamboo fence: back run (along x) and right run (along z), gate in the right run.
export const FENCE = { x: 15.5, z0: WALL.z, z1: 9.5, gateZ: -3.2 };
export const BRIDGE = { x: POND.cx, z: POND.cz };
export const TSUKUBAI = { x: -8.9, z: 8.6, ry: -0.6 };
export const SHISHI = { x: 6.0, z: 3.4, ry: 0.35 };
export const LANTERN = { x: 6.0, z: -1.3 };
export const PAGODA = { x: 21, z: -27 };

// Photo-scanned rocks in the raked sand: scan index, position, yaw, scale.
export const SAND_ROCKS = [
  { i: 4, x: -5.6, z: -1.1, ry: 0.3, s: 1.0 },
  { i: 1, x: -4.0, z: -2.4, ry: 1.1, s: 0.8 },
  { i: 6, x: -0.4, z: 1.8, ry: 2.0, s: 0.85 },
  { i: 2, x: 1.0, z: 2.8, ry: 0.4, s: 0.6 },
  { i: 3, x: 2.6, z: -2.0, ry: 1.2, s: 0.75 },
];

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function sandSdf(x: number, z: number) {
  const qx = Math.abs(x - SAND.cx) - SAND.hx + SAND.r;
  const qz = Math.abs(z - SAND.cz) - SAND.hz + SAND.r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qz), 0) - SAND.r;
}

// Signed distance to the temple footprint (negative inside).
export function templeSdf(x: number, z: number) {
  const f = TEMPLE.foot;
  const qx = Math.abs(x - (f.x0 + f.x1) / 2) - (f.x1 - f.x0) / 2;
  const qz = Math.abs(z - (f.z0 + f.z1) / 2) - (f.z1 - f.z0) / 2;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

export function pondE(x: number, z: number) {
  return Math.hypot((x - POND.cx) / POND.rx, (z - POND.cz) / POND.rz);
}

export function groundHeight(x: number, z: number) {
  const e = pondE(x, z);
  let h = -POND.depth * smoothstep(1.15, 0.55, e);
  const far = smoothstep(3, 9, sandSdf(x, z)) * smoothstep(1.4, 2.4, e) * smoothstep(1, 6, templeSdf(x, z));
  h += far * (0.35 * Math.sin(x * 0.21 + 1.3) * Math.sin(z * 0.17) + 0.15 * Math.sin(x * 0.5 + z * 0.37));
  h += smoothstep(-14, -40, z) * 3.5;
  return h;
}

export const isInWater = (x: number, z: number) => groundHeight(x, z) < WATER_Y;
