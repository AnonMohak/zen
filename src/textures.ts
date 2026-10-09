import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function toTexture(c: HTMLCanvasElement, color = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function petalPath(g: CanvasRenderingContext2D, len: number, w: number) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-w, -len * 0.3, -w * 0.9, -len * 0.95, -len * 0.12, -len);
  g.lineTo(0, -len * 0.86);
  g.lineTo(len * 0.12, -len);
  g.bezierCurveTo(w * 0.9, -len * 0.95, w, -len * 0.3, 0, 0);
}

// Five-petal sakura flower with a pink heart and stamens.
export function flowerTexture() {
  const [c, g] = canvas(128, 128);
  g.translate(64, 64);
  for (let i = 0; i < 5; i++) {
    g.save();
    g.rotate((i * Math.PI * 2) / 5);
    const grad = g.createLinearGradient(0, 0, 0, -58);
    grad.addColorStop(0, '#f6a9bd');
    grad.addColorStop(0.35, '#ffe1e9');
    grad.addColorStop(1, '#fff8fa');
    g.fillStyle = grad;
    petalPath(g, 60, 30);
    g.fill();
    g.restore();
  }
  g.fillStyle = '#d9466f';
  g.beginPath();
  g.arc(0, 0, 8, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#c95a7a';
  g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 16 + (i % 3) * 3;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    g.stroke();
    g.fillStyle = '#f1c25b';
    g.beginPath();
    g.arc(Math.cos(a) * r, Math.sin(a) * r, 2, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c);
}

// A single notched petal for the falling particles.
export function petalTexture() {
  const [c, g] = canvas(64, 64);
  g.translate(32, 62);
  const grad = g.createLinearGradient(0, 0, 0, -60);
  grad.addColorStop(0, '#f39bb2');
  grad.addColorStop(0.4, '#ffdce6');
  grad.addColorStop(1, '#fff5f8');
  g.fillStyle = grad;
  petalPath(g, 60, 30);
  g.fill();
  return toTexture(c);
}

// Cherry bark: dark red-brown with horizontal lenticels and a few fissures.
export function barkTexture() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#4b3a34';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 4000; i++) {
    const v = 50 + Math.random() * 40;
    g.fillStyle = `rgba(${v + 10},${v - 5},${v - 10},0.25)`;
    g.fillRect(Math.random() * 256, Math.random() * 512, 2 + Math.random() * 8, 1 + Math.random() * 3);
  }
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 512;
    const w = 8 + Math.random() * 30;
    g.fillStyle = 'rgba(160,140,120,0.55)';
    g.fillRect(x, y, w, 1.5);
    if (x + w > 256) g.fillRect(x - 256, y, w, 1.5);
    g.fillStyle = 'rgba(20,12,10,0.5)';
    g.fillRect(x, y + 1.5, w, 1);
  }
  g.strokeStyle = 'rgba(15,10,8,0.6)';
  for (let i = 0; i < 18; i++) {
    let x = Math.random() * 256;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 16) {
      x += (Math.random() - 0.5) * 6;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return toTexture(c, true, true);
}

// Ochre earthen wall with oil stains and rain streaks (after Ryoan-ji).
export function wallTexture() {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = '#b79b74';
  g.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 256;
    const r = 20 + Math.random() * 90;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.6;
    grad.addColorStop(0, dark ? 'rgba(90,64,40,0.22)' : 'rgba(220,200,165,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 1024;
    const len = 20 + Math.random() * 140;
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, 'rgba(70,50,35,0.25)');
    grad.addColorStop(1, 'rgba(70,50,35,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 1 + Math.random() * 4, len);
  }
  for (let i = 0; i < 9000; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},0.05)`;
    g.fillRect(Math.random() * 1024, Math.random() * 256, 1.5, 1.5);
  }
  return toTexture(c, true, true);
}

// Grey roof tiles in rows.
export function tileTexture() {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#4b4d50';
  g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x += 16) {
    const grad = g.createLinearGradient(x, 0, x + 16, 0);
    grad.addColorStop(0, '#2c2e31');
    grad.addColorStop(0.5, '#6a6d70');
    grad.addColorStop(1, '#2c2e31');
    g.fillStyle = grad;
    g.fillRect(x, 0, 16, 128);
  }
  for (let y = 0; y < 128; y += 32) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, y, 256, 3);
  }
  return toTexture(c, true, true);
}
