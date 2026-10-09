// Procedural ambience with Web Audio: soft wind, a trickle of water,
// a distant wind chime and the odd bird. No audio files are needed.

export function createAmbience() {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const noise = (seconds: number, brown: boolean) => {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  };

  const lfo = (freq: number, depth: number, target: AudioParam) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
  };

  // Wind: brown noise through a slowly breathing low-pass filter.
  const wind = noise(6, true);
  const windLp = ctx.createBiquadFilter();
  windLp.type = 'lowpass';
  windLp.frequency.value = 420;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.45;
  wind.connect(windLp).connect(windGain).connect(master);
  lfo(0.06, 220, windLp.frequency);
  lfo(0.045, 0.2, windGain.gain);
  wind.start();

  // Water: band-passed white noise with a fast, irregular gain.
  const water = noise(4, false);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400;
  bp.Q.value = 0.7;
  const waterGain = ctx.createGain();
  waterGain.gain.value = 0.025;
  water.connect(bp).connect(waterGain).connect(master);
  water.start();
  const trickle = () => {
    const now = ctx.currentTime;
    waterGain.gain.setTargetAtTime(0.012 + Math.random() * 0.03, now, 0.05);
    bp.frequency.setTargetAtTime(900 + Math.random() * 1400, now, 0.08);
  };
  const trickleTimer = setInterval(trickle, 120);

  // Simple echo for the chime and birds.
  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.37;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(master);

  const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
  const chime = () => {
    const n = 1 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const f = notes[(Math.random() * notes.length) | 0] * 2;
      const t0 = ctx.currentTime + k * (0.18 + Math.random() * 0.3);
      for (const [mul, amp] of [
        [1, 0.05],
        [2.76, 0.015],
        [5.4, 0.006],
      ]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f * mul;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(amp, t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4);
        o.connect(g);
        g.connect(master);
        g.connect(delay);
        o.start(t0);
        o.stop(t0 + 4.2);
      }
    }
  };

  const bird = () => {
    const t0 = ctx.currentTime;
    const base = 2800 + Math.random() * 1200;
    const n = 2 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const t = t0 + k * 0.14;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.07);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g);
      g.connect(master);
      g.connect(delay);
      o.start(t);
      o.stop(t + 0.12);
    }
  };

  let chimeT: ReturnType<typeof setTimeout>;
  let birdT: ReturnType<typeof setTimeout>;
  const loopChime = () => {
    chime();
    chimeT = setTimeout(loopChime, 7000 + Math.random() * 12000);
  };
  const loopBird = () => {
    bird();
    birdT = setTimeout(loopBird, 9000 + Math.random() * 18000);
  };
  chimeT = setTimeout(loopChime, 2500);
  birdT = setTimeout(loopBird, 6000);

  // Hollow bamboo knock of the shishi-odoshi: a short pitched thump plus a click.
  const knock = () => {
    const t0 = ctx.currentTime;
    for (const [f, amp, dec] of [
      [520, 0.22, 0.12],
      [1270, 0.07, 0.05],
    ]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * 0.82, t0 + dec);
      g.gain.setValueAtTime(amp, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec * 2.5);
      o.connect(g);
      g.connect(master);
      g.connect(delay);
      o.start(t0);
      o.stop(t0 + dec * 3);
    }
    const click = noise(0.05, false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2500;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.12, t0);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
    click.loop = false;
    click.connect(hp).connect(cg).connect(master);
    click.start(t0);
    click.stop(t0 + 0.05);
  };

  return {
    knock,
    setOn(on: boolean) {
      if (on) ctx.resume();
      master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.6);
    },
    dispose() {
      clearInterval(trickleTimer);
      clearTimeout(chimeT);
      clearTimeout(birdT);
      ctx.close();
    },
  };
}
