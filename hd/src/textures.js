// Procedural textures (drawn on canvas at startup, so the app ships no image assets).
import * as THREE from 'three';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true; return t;
}
function noise(g, w, h, n, alpha, light, r) {
  for (let i = 0; i < n; i++) { const v = r() < .5; g.fillStyle = v ? `rgba(255,255,255,${alpha * r()})` : `rgba(0,0,0,${alpha * r()})`; const s = 1 + r() * 2.5; g.fillRect(r() * w, r() * h, s, s); }
}

// Road cross-section layout in metres (offset from our carriageway centre; + is right)
export const ROAD = { L: -19, R: 7.5, oppL: -18.2, oppR: -7.4, medL: -7.4, medR: -5.4, ourL: -5.4, ourR: 5.4, shoulderR: 7.5 };
ROAD.W = ROAD.R - ROAD.L;
export const ROAD_TILE = 24; // metres of road per texture repeat

export function roadTexture() {
  const W = 1024, H = 1024, [c, g] = canvas(W, H), r = rng(7);
  const u = o => (o - ROAD.L) / ROAD.W * W;
  g.fillStyle = '#9a9a96'; g.fillRect(0, 0, W, H);                         // kerbs / median
  const asphalt = (a, b) => { g.fillStyle = '#3b3c40'; g.fillRect(u(a), 0, u(b) - u(a), H); };
  asphalt(ROAD.oppL, ROAD.oppR); asphalt(ROAD.ourL, ROAD.ourR);
  g.fillStyle = '#46474b'; g.fillRect(u(ROAD.ourR), 0, u(ROAD.shoulderR) - u(ROAD.ourR), H);  // shoulder
  for (let i = 0; i < 26000; i++) { const v = r(); g.fillStyle = v < .35 ? `rgba(255,255,255,${.05 * r()})` : `rgba(0,0,0,${.14 * r()})`; const sz = 1 + r() * 2; g.fillRect(r() * W, r() * H, sz, sz); }
  // tyre polish in lane centres
  for (const lc of [-3.6, 0, 3.6, -9.2, -12.8, -16.4]) {
    for (const t of [-.8, .8]) { const gr = g.createLinearGradient(u(lc + t - .35), 0, u(lc + t + .35), 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, 'rgba(0,0,0,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(u(lc + t - .35), 0, u(.7), H); }
  }
  // patches & cracks
  for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(${r() < .5 ? '20,20,22' : '80,80,84'},${.15 + r() * .2})`; const x = u(ROAD.ourL) + r() * (u(ROAD.ourR) - u(ROAD.ourL)); g.fillRect(x, r() * H, 10 + r() * 50, 6 + r() * 40); }
  g.strokeStyle = 'rgba(15,15,15,.35)'; g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) { let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - .5) * 30; y += r() * 30; g.lineTo(x, y); } g.stroke(); }
  // markings
  const line = (o, wM, col, dash) => { g.fillStyle = col; const x = u(o - wM / 2), w = u(o + wM / 2) - x;
    if (!dash) g.fillRect(x, 0, w, H); else { const seg = H / (ROAD_TILE / 12); for (let y = 0; y < H; y += seg) g.fillRect(x, y, w, seg * .3); } };
  line(ROAD.ourL + .25, .15, '#e8c43a', false);       // yellow edge by median
  line(ROAD.ourR - .2, .15, '#ececec', false);
  line(-1.8, .13, '#ececec', true); line(1.8, .13, '#ececec', true);
  line(ROAD.oppR - .25, .15, '#e8c43a', false); line(ROAD.oppL + .2, .15, '#ececec', false);
  line(-11.0, .13, '#ececec', true); line(-14.6, .13, '#ececec', true);
  // worn paint
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(40,40,42,${.25 * r()})`; const sz = 1 + r() * 2; g.fillRect(r() * W, r() * H, sz, sz); }
  return tex(c);
}

export function concreteTexture(seed = 3, base = '#b9b6ae') {
  const [c, g] = canvas(256, 256), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 6000, .12, true, r);
  g.fillStyle = 'rgba(60,50,40,.12)'; for (let i = 0; i < 8; i++) g.fillRect(0, r() * 256, 256, 2 + r() * 6);
  return tex(c);
}

// Facades: one texture tile = one window bay (4 m) x one floor (3.3 m), repeated over walls.
export function facadeTextures() {
  const out = {};
  { // glass curtain wall
    const [c, g] = canvas(128, 128), r = rng(11);
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#8fb4c8'); gr.addColorStop(.6, '#4f7891'); gr.addColorStop(1, '#3b5d73');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(50, 0); g.lineTo(0, 90); g.fill();
    g.fillStyle = '#2b3a44'; g.fillRect(0, 0, 128, 6); g.fillRect(0, 0, 4, 128); g.fillRect(62, 0, 3, 128);
    out.glass = tex(c);
  }
  { // painted residential/office block with windows, burglar bars and AC units (Lagos staple)
    const [c, g] = canvas(128, 128), r = rng(12);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128); noise(g, 128, 128, 900, .08, true, r);
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 116, 128, 12);
    g.fillStyle = '#25313a'; g.fillRect(22, 26, 84, 62);
    g.fillStyle = 'rgba(160,200,230,.35)'; g.fillRect(24, 28, 38, 58);
    g.strokeStyle = '#9aa0a6'; g.lineWidth = 2; for (let x = 30; x < 106; x += 10) { g.beginPath(); g.moveTo(x, 26); g.lineTo(x, 88); g.stroke(); }
    g.beginPath(); g.moveTo(22, 57); g.lineTo(106, 57); g.stroke();
    g.fillStyle = '#d9d9d9'; g.fillRect(84, 92, 22, 14); g.fillStyle = '#9e9e9e'; g.fillRect(86, 95, 18, 2); g.fillRect(86, 99, 18, 2);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(18, 88, 92, 4);
    out.block = tex(c);
  }
  { // low-rise: shops, bungalows (wall + window + shutter)
    const [c, g] = canvas(128, 128), r = rng(13);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128); noise(g, 128, 128, 1400, .12, true, r);
    g.fillStyle = 'rgba(80,60,40,.18)'; g.fillRect(0, 100, 128, 28);
    g.fillStyle = '#3a3f44'; g.fillRect(30, 30, 68, 48); g.fillStyle = '#6d757c'; for (let y = 32; y < 78; y += 6) g.fillRect(30, y, 68, 2);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(26, 78, 76, 4);
    out.low = tex(c);
  }
  return out;
}

export function roofTexture() {
  const [c, g] = canvas(128, 128), r = rng(21);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128); noise(g, 128, 128, 3000, .25, true, r);
  g.fillStyle = 'rgba(0,0,0,.1)'; for (let x = 0; x < 128; x += 8) g.fillRect(x, 0, 2, 128);
  return tex(c);
}

export function waterNormal() {
  const S = 256, [c, g] = canvas(S, S), r = rng(31);
  const hgt = new Float32Array(S * S);
  for (let k = 0; k < 22; k++) { const fx = Math.floor(r() * 13) - 6, fy = Math.floor(r() * 13) - 6, ph = r() * 6.28, a = 1 / (2 + Math.hypot(fx, fy));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) hgt[y * S + x] += a * Math.sin((x * fx + y * fy) / S * 6.283 + ph); }
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = hgt[y * S + (x + 1) % S] - hgt[y * S + (x + S - 1) % S], hy = hgt[((y + 1) % S) * S + x] - hgt[((y + S - 1) % S) * S + x];
    let nx = -hx * 1.2, ny = -hy * 1.2, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * S + x) * 4; img.data[i] = (nx * .5 + .5) * 255; img.data[i + 1] = (ny * .5 + .5) * 255; img.data[i + 2] = (nz * .5 + .5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, true, false);
}

// Turns the land/water/green mask (R = land, G = parks) into a coloured ground map + alpha (land only)
export function groundFromMask(img, C = { land: [128, 122, 96], green: [62, 110, 48], shore: [176, 160, 120] }) {
  const s = Math.min(1, 2048 / Math.max(img.width, img.height));
  const W = Math.round(img.width * s), H = Math.round(img.height * s);
  const [mc, mg] = canvas(W, H); mg.drawImage(img, 0, 0, W, H);
  const m = mg.getImageData(0, 0, W, H).data;
  const [cc, cg] = canvas(W, H), [ac, ag] = canvas(W, H);
  const col = cg.createImageData(W, H), al = ag.createImageData(W, H), r = rng(41);
  const land = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) land[i] = m[i * 4] > 127 ? 1 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4, L = land[i], green = m[o + 1] > 127;
    let shore = false; if (L) { for (let d = 1; d <= 3 && !shore; d++) { if (!land[i - d] || !land[i + d] || !land[i - d * W] || !land[i + d * W]) shore = true; } }
    const n = (r() - .5) * 22, n2 = Math.sin(x * .05) * Math.cos(y * .045) * 10;
    let R, G, B;
    if (!L) { R = 30; G = 70; B = 80; }
    else if (shore) { R = C.shore[0] + n; G = C.shore[1] + n; B = C.shore[2] + n; }
    else if (green) { R = C.green[0] + n + n2; G = C.green[1] + n + n2; B = C.green[2] + n; }
    else { R = C.land[0] + n + n2; G = C.land[1] + n + n2; B = C.land[2] + n; }
    col.data[o] = R; col.data[o + 1] = G; col.data[o + 2] = B; col.data[o + 3] = 255;
    const a = L ? 255 : 0; al.data[o] = al.data[o + 1] = al.data[o + 2] = a; al.data[o + 3] = 255;
  }
  cg.putImageData(col, 0, 0); ag.putImageData(al, 0, 0);
  const map = tex(cc, false), alpha = tex(ac, false, false);
  return { map, alpha, landAt: (u, v) => { const x = Math.min(W - 1, Math.max(0, Math.floor(u * W))), y = Math.min(H - 1, Math.max(0, Math.floor(v * H))); return land[y * W + x] === 1; } };
}

export function signTexture(lines, opt = {}) {
  const W = opt.w || 1024, H = opt.h || 256, [c, g] = canvas(W, H);
  g.fillStyle = opt.bg || '#0b6e3a'; g.fillRect(0, 0, W, H);
  if (opt.border !== false) { g.strokeStyle = opt.fg || '#fff'; g.lineWidth = 10; g.strokeRect(14, 14, W - 28, H - 28); }
  g.fillStyle = opt.fg || '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((t, i) => { let fs = (n === 1 ? .5 : .36) * H; g.font = `900 ${fs}px "Russo One","Exo 2",Arial,sans-serif`; while (g.measureText(t).width > W - 70 && fs > 10) { fs -= 2; g.font = `900 ${fs}px "Russo One","Exo 2",Arial,sans-serif`; } g.fillText(t, W / 2, H * (i + .5) / n + (n === 1 ? 4 : 0)); });
  if (opt.checker) { const s = 32; for (let x = 0; x < W; x += s) { g.fillStyle = (x / s) % 2 ? '#111' : '#fff'; g.fillRect(x, 0, s, 18); g.fillStyle = (x / s) % 2 ? '#fff' : '#111'; g.fillRect(x, H - 18, s, 18); } }
  const t = tex(c, false); return t;
}

export function palmLeafTexture() {
  const [c, g] = canvas(128, 256);
  g.clearRect(0, 0, 128, 256);
  g.strokeStyle = '#3d6b2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(64, 256); g.lineTo(64, 0); g.stroke();
  for (let y = 10; y < 250; y += 7) { const w = 60 * Math.sin((y / 256) * Math.PI); g.strokeStyle = y % 14 ? '#2f7d32' : '#43a047'; g.lineWidth = 4; g.beginPath(); g.moveTo(64, y); g.lineTo(64 - w, y + 18); g.moveTo(64, y); g.lineTo(64 + w, y + 18); g.stroke(); }
  const t = tex(c, false); return t;
}
