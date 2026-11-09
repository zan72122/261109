// Procedural textures (canvas). No external image files.
import * as THREE from 'three';

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { srgb = true, rep = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; t.needsUpdate = true; return t;
}
// tileable value noise
function noiseField(n, cells, seed) {
  const r = rng(seed), g = [];
  for (let i = 0; i < cells * cells; i++) g.push(r());
  const at = (x, y) => g[((y % cells + cells) % cells) * cells + ((x % cells + cells) % cells)];
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = x / n * cells, fy = y / n * cells, ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    out[y * n + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  return out;
}
function fbm(n, seed, oct = 4, base = 4) {
  const out = new Float32Array(n * n); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const f = noiseField(n, base << o, seed + o * 97);
    for (let i = 0; i < out.length; i++) out[i] += f[i] * amp;
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function fromField(n, f, colorFn) {
  const c = cv(n, n), x = c.getContext('2d'), img = x.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const [r, g, b] = colorFn(f[i], i % n, (i / n) | 0);
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}

const cache = {};
function memo(k, fn) { return cache[k] || (cache[k] = fn()); }

export const T = {
  limestone: (rep = [1, 1]) => memo('lime' + rep, () => {
    const n = 256, f = fbm(n, 11, 5, 4), r = rng(5);
    const pits = new Float32Array(n * n);
    for (let k = 0; k < 500; k++) { const px = (r() * n) | 0, py = (r() * n) | 0, s = r() < 0.9 ? 1 : 2; for (let a = -s; a <= s; a++) for (let b = -s; b <= s; b++) pits[((py + a + n) % n) * n + (px + b + n) % n] = 1; }
    const col = fromField(n, f, (v, x, y) => { const p = pits[y * n + x]; const k = 222 + v * 30 - p * 26; return [k + 1, k + 1, k - 4]; });
    const bump = fromField(n, f, (v, x, y) => { const k = v * 200 + 30 - pits[y * n + x] * 80; return [k, k, k]; });
    return { map: tex(col, { rep }), bump: tex(bump, { srgb: false, rep }) };
  }),
  terrazzo: (rep = [1, 1]) => memo('terr' + rep, () => {
    const n = 512, c = cv(n, n), x = c.getContext('2d'), r = rng(21);
    x.fillStyle = '#f1f2ef'; x.fillRect(0, 0, n, n);
    const cols = ['#9aa3a8', '#c3c8c6', '#1d2b4a', '#2c6a58', '#7f8b90', '#dfe3e2', '#3a5d9a'];
    for (let k = 0; k < 2600; k++) {
      x.fillStyle = cols[(r() * cols.length) | 0]; x.globalAlpha = 0.5 + r() * 0.5;
      const px = r() * n, py = r() * n, s = 1 + r() * r() * 7; x.beginPath();
      for (let v = 0; v < 5; v++) { const a = v / 5 * 6.283 + r(); x.lineTo(px + Math.cos(a) * s * (0.6 + r() * 0.6), py + Math.sin(a) * s * (0.6 + r() * 0.6)); }
      x.fill();
    }
    x.globalAlpha = 0.35; x.strokeStyle = '#c9cdcb'; x.lineWidth = 2;
    x.strokeRect(0, 0, n, n);
    return tex(c, { rep });
  }),
  wood: (rep = [1, 1]) => memo('wood' + rep, () => {
    const n = 256, f = fbm(n, 31, 4, 2);
    const c = fromField(n, f, (v, x, y) => {
      const g = Math.sin((x * 0.09) + v * 9 + Math.sin(y * 0.02) * 2) * 0.5 + 0.5;
      const k = 0.55 + g * 0.25 + v * 0.2;
      return [74 * k + 8, 50 * k + 4, 36 * k];
    });
    return tex(c, { rep });
  }),
  grass: (rep = [1, 1]) => memo('grass' + rep, () => {
    const n = 512, c = cv(n, n), x = c.getContext('2d'), r = rng(41);
    x.fillStyle = '#3b6e3c'; x.fillRect(0, 0, n, n);
    const cols = ['#2f6141', '#4c8a48', '#5e9a55', '#2a5636', '#6ba760', '#3f7c4a'];
    for (let k = 0; k < 9000; k++) {
      x.strokeStyle = cols[(r() * cols.length) | 0]; x.globalAlpha = 0.6; x.lineWidth = 1 + r();
      const px = r() * n, py = r() * n, l = 3 + r() * 6, a = -1.57 + (r() - 0.5) * 1.2;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
    return tex(c, { rep });
  }),
  sand: (rep = [1, 1]) => memo('sand' + rep, () => {
    const n = 256, f = fbm(n, 51, 4, 8), r = rng(9);
    const c = fromField(n, f, (v) => { const j = (r() - 0.5) * 30; const k = 205 + v * 30 + j; return [k + 18, k + 12, k - 6]; });
    return tex(c, { rep });
  }),
  sandBump: (rep = [1, 1]) => memo('sandb' + rep, () => {
    const n = 256, r = rng(19), f = fbm(n, 52, 3, 4);
    const c = fromField(n, f, (v) => { const k = v * 120 + r() * 120; return [k, k, k]; });
    return tex(c, { srgb: false, rep });
  }),
  pavers: (rep = [1, 1]) => memo('pav' + rep, () => {
    const n = 512, c = cv(n, n), x = c.getContext('2d'), r = rng(61);
    x.fillStyle = '#e8ece9'; x.fillRect(0, 0, n, n);
    const tile = 64;
    for (let ty = 0; ty < n / tile; ty++) for (let tx = 0; tx < n / tile; tx++) {
      const h = 214 + r() * 8, s = 46 + r() * 10, l = 33 + r() * 7;
      x.fillStyle = `hsl(${h},${s}%,${l}%)`;
      x.fillRect(tx * tile + 3, ty * tile + 3, tile - 6, tile - 6);
      for (let k = 0; k < 60; k++) { x.fillStyle = `rgba(255,255,255,${r() * 0.12})`; x.fillRect(tx * tile + 3 + r() * (tile - 8), ty * tile + 3 + r() * (tile - 8), 2, 2); }
    }
    return tex(c, { rep });
  }),
  leaf: () => memo('leaf', () => {
    const w = 64, h = 128, c = cv(w, h), x = c.getContext('2d');
    x.clearRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#2c5e3c'); g.addColorStop(0.5, '#4f8a52'); g.addColorStop(1, '#2f6440');
    x.fillStyle = g; x.beginPath(); x.moveTo(w / 2, 2);
    x.bezierCurveTo(w - 2, h * 0.3, w - 4, h * 0.75, w / 2, h - 2); x.bezierCurveTo(4, h * 0.75, 2, h * 0.3, w / 2, 2); x.fill();
    x.strokeStyle = '#a9cf8f'; x.lineWidth = 2; x.beginPath(); x.moveTo(w / 2, 4); x.lineTo(w / 2, h - 4); x.stroke();
    x.lineWidth = 1; x.strokeStyle = 'rgba(190,225,160,0.7)';
    for (let k = 1; k < 8; k++) { const y = k * h / 9; x.beginPath(); x.moveTo(w / 2, y + 6); x.lineTo(w * 0.15, y - 2); x.moveTo(w / 2, y + 6); x.lineTo(w * 0.85, y - 2); x.stroke(); }
    return tex(c);
  }),
  olive: () => memo('olive', () => {
    const w = 32, h = 128, c = cv(w, h), x = c.getContext('2d');
    x.fillStyle = '#6f8f6a'; x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, 6.283); x.fill();
    x.strokeStyle = '#b8cdb0'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(w / 2, 6); x.lineTo(w / 2, h - 6); x.stroke();
    return tex(c);
  }),
  waterNormal: () => memo('wn', () => {
    const n = 256, c = cv(n, n), x = c.getContext('2d'), img = x.createImageData(n, n), r = rng(71);
    const waves = []; for (let k = 0; k < 14; k++) waves.push({ kx: ((r() * 9) | 0) - 4, ky: ((r() * 9) | 0) + 1, p: r() * 6.28, a: 0.4 + r() });
    for (let y = 0; y < n; y++) for (let xx = 0; xx < n; xx++) {
      let dx = 0, dy = 0;
      for (const w of waves) { const ph = 6.283 * (w.kx * xx + w.ky * y) / n + w.p; const cs = Math.cos(ph) * w.a; dx += cs * w.kx; dy += cs * w.ky; }
      const nx = -dx * 0.04, ny = -dy * 0.04, l = Math.hypot(nx, ny, 1), i = (y * n + xx) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0); return tex(c, { srgb: false });
  }),
  caustic: () => memo('caus', () => {
    const n = 256, c = cv(n, n), x = c.getContext('2d'), img = x.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let xx = 0; xx < n; xx++) {
      const u = xx / n * 6.283, v = y / n * 6.283;
      let s = Math.sin(u * 3 + Math.sin(v * 2) * 1.5) + Math.sin(v * 3 + Math.sin(u * 2) * 1.5) + Math.sin((u + v) * 2);
      s = Math.pow(Math.max(0, 1 - Math.abs(s) * 0.7), 4);
      const i = (y * n + xx) * 4; img.data[i] = 120 * s + 20; img.data[i + 1] = 190 * s + 20; img.data[i + 2] = 255 * s + 30; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0); return tex(c);
  }),
  gingham: () => memo('ging', () => {
    const n = 128, c = cv(n, n), x = c.getContext('2d');
    x.fillStyle = '#f4f5f2'; x.fillRect(0, 0, n, n);
    x.fillStyle = 'rgba(31,111,92,0.55)'; for (let k = 0; k < 4; k++) { x.fillRect(k * 32, 0, 16, n); x.fillRect(0, k * 32, n, 16); }
    return tex(c, { rep: [3, 3] });
  }),
  stripes: (a = '#1f4fae', b = '#f4f5f2', rep = [4, 1]) => memo('str' + a + b + rep, () => {
    const n = 64, c = cv(n, n), x = c.getContext('2d');
    x.fillStyle = b; x.fillRect(0, 0, n, n); x.fillStyle = a; x.fillRect(0, 0, n / 2, n);
    return tex(c, { rep });
  }),
  denim: (rep = [3, 3]) => memo('den' + rep, () => {
    const n = 128, c = cv(n, n), x = c.getContext('2d'), r = rng(81);
    x.fillStyle = '#2f5a95'; x.fillRect(0, 0, n, n);
    for (let k = -n; k < n * 2; k += 3) { x.strokeStyle = `rgba(${r() < 0.5 ? '210,225,245' : '20,35,70'},${0.12 + r() * 0.12})`; x.lineWidth = 1; x.beginPath(); x.moveTo(k, 0); x.lineTo(k + n, n); x.stroke(); }
    return tex(c, { rep });
  }),
  cliff: (rep = [1, 1]) => memo('cliff' + rep, () => {
    const n = 256, f = fbm(n, 91, 5, 3);
    const c = fromField(n, f, (v, x, y) => { const st = Math.sin(y * 0.15 + v * 6) * 0.5 + 0.5; const k = 170 + v * 50 + st * 18; return [k, k + 2, k - 6]; });
    return tex(c, { rep });
  }),
  foam: () => memo('foam', () => {
    const n = 256, c = cv(n, 64), x = c.getContext('2d'), r = rng(3);
    const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,0.85)'); g.addColorStop(0.6, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, n, 64);
    x.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 300; k++) { x.fillStyle = `rgba(0,0,0,${r() * 0.6})`; x.beginPath(); x.arc(r() * n, r() * 64, 1 + r() * 5, 0, 6.283); x.fill(); }
    const t = tex(c, { rep: [8, 1] }); return t;
  }),
  shadowBlob: () => memo('blob', () => {
    const n = 64, c = cv(n, n), x = c.getContext('2d');
    const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); g.addColorStop(0, 'rgba(20,35,70,0.55)'); g.addColorStop(1, 'rgba(20,35,70,0)');
    x.fillStyle = g; x.fillRect(0, 0, n, n); return tex(c);
  }),
  ring: () => memo('ring', () => {
    const n = 128, c = cv(n, n), x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 7; x.beginPath(); x.arc(n / 2, n / 2, n / 2 - 8, 0, 6.283); x.stroke();
    return tex(c);
  }),
  glow: () => memo('glow', () => {
    const n = 64, c = cv(n, n), x = c.getContext('2d');
    const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); g.addColorStop(0, 'rgba(255,240,170,1)'); g.addColorStop(0.3, 'rgba(255,225,120,0.45)'); g.addColorStop(1, 'rgba(255,220,120,0)');
    x.fillStyle = g; x.fillRect(0, 0, n, n); return tex(c);
  }),
};
