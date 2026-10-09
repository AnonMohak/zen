// Quality presets. Phones and small screens get the light preset.
// Override with ?quality=low or ?quality=high in the URL.

const param = new URLSearchParams(location.search).get('quality');
const coarse = matchMedia('(pointer: coarse)').matches;
const small = Math.min(screen.width, screen.height) < 720;

export const LOW = param ? param === 'low' : coarse || small;

export const Q = LOW
  ? { tex: '1k', shadow: 2048, grass: 45000, petals: 1500, forest: 90, dpr: 1.5, ao: false, bloom: false, hdri: false }
  : { tex: '2k', shadow: 4096, grass: 110000, petals: 3500, forest: 260, dpr: 2, ao: true, bloom: true, hdri: true };
