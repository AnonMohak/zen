// Quality presets. Phones and small screens get the light preset.
// Override with ?quality=low or ?quality=high, and single settings with e.g. ?tex=1k&ao=0.

const params = new URLSearchParams(location.search);
const param = params.get('quality');
const coarse = matchMedia('(pointer: coarse)').matches;
const small = Math.min(screen.width, screen.height) < 720;

export const LOW = param ? param === 'low' : coarse || small;

export const Q = LOW
  ? { tex: '1k', shadow: 2048, grass: 30000, petals: 1500, forest: 90, dpr: 1.5, ao: false, bloom: false, hdri: false, aniso: 4, groundLow: true }
  : { tex: '2k', shadow: 2048, grass: 70000, petals: 3500, forest: 260, dpr: 2, ao: true, bloom: true, hdri: true, aniso: 8, groundLow: false };

function applyOverrides() {
  for (const key of Object.keys(Q) as (keyof typeof Q)[]) {
    const v = params.get(key);
    if (v === null) continue;
    const cur = Q[key];
    (Q as Record<string, unknown>)[key] = typeof cur === 'number' ? Number(v) : typeof cur === 'boolean' ? v === '1' || v === 'true' : v;
  }
}
applyOverrides();

// Integrated desktop GPUs (Intel UHD/Iris) get a medium preset: same textures
// and lighting, lighter on geometry and post effects. Call once the renderer exists.
export function refineForGpu(gl: WebGL2RenderingContext) {
  if (LOW || param) return;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  if (!/Intel/i.test(name) || /Arc/i.test(name)) return;
  Object.assign(Q, { grass: 45000, petals: 2500, forest: 150, dpr: 1.5, ao: false, aniso: 4, groundLow: true });
  applyOverrides();
}
