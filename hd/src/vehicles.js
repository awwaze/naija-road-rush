// Procedural 3D vehicles. Player/rival cars use glossy multi-material models;
// traffic is merged into one geometry per vehicle (vertex colours) to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Invented brands (real car-maker names need licences)
export const CARS = [
  { id: 'corona', brand: 'Toyo', name: 'Corona LE', desc: 'The reliable Lagos favourite', price: 0, top: 210, acc: 1.0, grip: 1.0, nos: 1.0, style: 'sedan', color: '#c62828' },
  { id: 'spirit', brand: 'Hondo', name: 'Spirit Hatch', desc: 'Nimble, quick off the line', price: 3000, top: 222, acc: 1.15, grip: 1.1, nos: 1.0, style: 'hatch', color: '#1e88e5' },
  { id: 'mercer', brand: 'Mercer', name: 'S-Class Executive', desc: 'Smooth, powerful, very official', price: 8000, top: 238, acc: 1.1, grip: 1.15, nos: 1.15, style: 'exec', color: '#212121' },
  { id: 'aso', brand: 'Aso Motors', name: 'V8 Hammer', desc: 'Big engine, bigger attitude', price: 14000, top: 252, acc: 1.28, grip: 1.02, nos: 1.25, style: 'muscle', color: '#fdd835' },
  { id: 'lagoon', brand: 'Lagoon', name: 'RS Super', desc: 'Built for Third Mainland at dawn (AI-modelled test car)', price: 25000, top: 275, acc: 1.38, grip: 1.25, nos: 1.4, style: 'gt', color: '#00a859', glb: 'models/test-ai-supercar.glb', len: 4.55 },
];

const STY = {
  sedan: { L: 4.6, W: 1.82, body: [[-2.3, .3], [-2.32, .7], [-2.2, .9], [-1.2, .96], [1.15, .96], [1.6, .9], [2.25, .74], [2.32, .5], [2.28, .3]], cab: [[-1.3, .95], [-.9, 1.42], [.45, 1.44], [1.18, .95]], wb: 1.38, wr: .34 },
  hatch: { L: 4.1, W: 1.78, body: [[-2.02, .3], [-2.05, .8], [-1.95, 1.0], [1.0, .98], [1.5, .9], [2.0, .74], [2.06, .5], [2.02, .3]], cab: [[-1.98, .98], [-1.85, 1.5], [.35, 1.52], [1.05, .98]], wb: 1.25, wr: .33 },
  exec: { L: 5.0, W: 1.9, body: [[-2.5, .32], [-2.52, .74], [-2.38, .94], [-1.3, 1.0], [1.3, 1.0], [1.8, .95], [2.45, .8], [2.52, .55], [2.48, .32]], cab: [[-1.45, .99], [-.95, 1.47], [.55, 1.49], [1.35, .99]], wb: 1.52, wr: .36 },
  muscle: { L: 4.75, W: 1.95, body: [[-2.38, .3], [-2.4, .82], [-2.3, .92], [-1.1, .94], [1.3, .94], [2.3, .86], [2.4, .6], [2.36, .3]], cab: [[-1.2, .93], [-.7, 1.3], [.3, 1.32], [1.05, .93]], wb: 1.45, wr: .37, spoiler: true, stripes: true },
  gt: { L: 4.55, W: 1.98, body: [[-2.28, .28], [-2.3, .72], [-2.15, .82], [-1.2, .86], [1.0, .84], [2.0, .66], [2.3, .44], [2.26, .28]], cab: [[-1.35, .85], [-.65, 1.17], [.25, 1.19], [1.05, .85]], wb: 1.4, wr: .36, spoiler: true },
};

function profileShape(pts, archR, wb, wr) {
  // side profile, with wheel arches cut into the bottom edge
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) { const [x, y] = pts[i], [px, py] = pts[i - 1]; s.quadraticCurveTo(px + (x - px) * .5 + (i % 2 ? .02 : -.02), py + (y - py) * .5 + .015, x, y); }
  const by = pts[pts.length - 1][1], ar = wr + .07;
  s.lineTo(wb + ar, by); s.absarc(wb, by, ar, 0, Math.PI, false); s.lineTo(-wb + ar, by); s.absarc(-wb, by, ar, 0, Math.PI, false);
  s.lineTo(pts[0][0], pts[0][1]);
  return s;
}
function extrude(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10, steps: 1 });
  g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2); return g; // length now along -z (front = -z)
}
function quadPts(pts) { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; }

const shared = {};
function mats() {
  if (shared.m) return shared.m;
  shared.m = {
    glass: new THREE.MeshStandardMaterial({ color: 0x0d1418, roughness: .05, metalness: .9 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: .92 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: .25, metalness: .95 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: .6 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: .1, metalness: 1 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 1.2, roughness: .2 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .5 }),
  };
  return shared.m;
}

// Detailed player / rival car. Returns { group, wheels[], setBrake(on), body material }
export function buildCar(spec, color) {
  const st = STY[spec.style] || STY.sedan, M = mats(), g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color || spec.color), metalness: .55, roughness: .28, clearcoat: 1, clearcoatRoughness: .04 });
  const bodyW = st.W - .16;
  const body = new THREE.Mesh(extrude(profileShape(st.body, 0, st.wb, st.wr), bodyW, .08), paint); body.castShadow = true; g.add(body);
  const cab = new THREE.Mesh(extrude(quadPts(st.cab), st.W * .8, .06), M.glass); cab.castShadow = true; g.add(cab);
  // painted roof panel + pillars
  const [c0, c1, c2, c3] = st.cab;
  const roof = new THREE.Mesh(extrude(quadPts([[c1[0] + .08, c1[1] - .03], [c1[0] + .05, c1[1] + .03], [c2[0] - .02, c2[1] + .03], [c2[0], c2[1] - .03]]), st.W * .8 + .06, .04), paint); g.add(roof);
  if (st.stripes) { const sm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .3 }); for (const x of [-.18, .18]) { const s = new THREE.Mesh(new THREE.BoxGeometry(.16, .02, st.L * .98), sm); s.position.set(x, st.body[3][1] + .03, 0); g.add(s); } }
  if (st.spoiler) { const sp = new THREE.Mesh(new THREE.BoxGeometry(st.W * .9, .06, .32), paint); sp.position.set(0, st.body[2][1] + .28, st.L / 2 - .22); g.add(sp); for (const x of [-.6, .6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.06, .26, .12), M.black); p.position.set(x, st.body[2][1] + .14, st.L / 2 - .22); g.add(p); } }
  // lights
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a0f14, emissive: 0xff1a1a, emissiveIntensity: .35, roughness: .3 });
  const rearY = st.body[1][1] - .14, frontY = st.body[st.body.length - 2][1] - .1;
  for (const x of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(.48, .14, .06), tailMat); t.position.set(x * (st.W / 2 - .32), rearY, st.L / 2 + .02); g.add(t);
    const h = new THREE.Mesh(new THREE.BoxGeometry(.42, .12, .06), M.head); h.position.set(x * (st.W / 2 - .32), frontY, -st.L / 2 - .02); g.add(h);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(.18, .1, .12), paint); mirror.position.set(x * (st.W / 2 + .06), c0[1] + .12, -st.L / 2 + (st.L / 2 + c3[0]) * .8 + .2); g.add(mirror);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(.52, .13, .02), M.plate); plate.position.set(0, rearY - .16, st.L / 2 + .04); g.add(plate);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(st.W * .5, .14, .04), spec.style === 'exec' ? M.chrome : M.black); grille.position.set(0, frontY - .02, -st.L / 2 - .03); g.add(grille);
  const diff = new THREE.Mesh(new THREE.BoxGeometry(st.W * .8, .12, .05), M.black); diff.position.set(0, .3, st.L / 2 + .01); g.add(diff);
  // wheels
  const wheels = [], tyreGeo = new THREE.CylinderGeometry(st.wr, st.wr, .26, 22); tyreGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(st.wr * .66, st.wr * .66, .27, 12); rimGeo.rotateZ(Math.PI / 2);
  for (const zx of [[-st.wb, -1], [-st.wb, 1], [st.wb, -1], [st.wb, 1]]) {
    const w = new THREE.Group(); w.position.set(zx[1] * (st.W / 2 - .17), st.wr, zx[0]);
    const ty = new THREE.Mesh(tyreGeo, M.tyre); ty.castShadow = true; w.add(ty); w.add(new THREE.Mesh(rimGeo, M.rim));
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(.28, st.wr * 1.1, .08), M.rim); w.add(spoke); const spoke2 = spoke.clone(); spoke2.rotation.x = Math.PI / 2; w.add(spoke2);
    g.add(w); wheels.push(w);
  }
  // soft contact shadow
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(st.W * 1.15, st.L * 1.05), shadowMat()); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; g.add(sh);
  let tailBase = .35, braking = false;
  return { group: g, wheels, len: st.L, wid: st.W, paint, headY: frontY, rearY,
    setBrake(on) { braking = on; tailMat.emissiveIntensity = on ? (tailBase > 1 ? 6 : 2.4) : tailBase; },
    setNight(on) { tailBase = on ? 2.2 : .35; tailMat.emissiveIntensity = braking ? (on ? 6 : 2.4) : tailBase; M.head.emissiveIntensity = on ? 8 : 1.2; } };
}
let _shadow;
function shadowMat() {
  if (_shadow) return _shadow;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _shadow = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }); return _shadow;
}

// ---------------- traffic (one merged geometry per model) ----------------
function colored(geo, hex) { const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (!geo.index) return geo; return geo.toNonIndexed(); }
function box(w, h, d, x, y, z, hex) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return colored(g.toNonIndexed(), hex); }
function cyl(r, w, x, y, z, hex, seg = 12) { const g = new THREE.CylinderGeometry(r, r, w, seg); g.rotateZ(Math.PI / 2); g.translate(x, y, z); return colored(g.toNonIndexed(), hex); }
function wheelsOf(W, zs, r, list) { for (const z of zs) for (const s of [-1, 1]) list.push(cyl(r, .24, s * (W / 2 - .1), r, z, '#151515')); }
function strip(parts) { return parts.map(p => { const g = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; }); }
function merged(parts) { const g = mergeGeometries(strip(parts)); g.computeBoundingSphere(); return g; }

export function trafficModels() {
  const out = {};
  const carGeo = (hex, style) => {
    const st = STY[style];
    const body = colored(extrude(profileShape(st.body, 0, st.wb, st.wr), st.W - .16, .06), hex);
    const cab = colored(extrude(quadPts(st.cab), st.W * .8, .05), '#1a2228');
    const parts = [body, cab, box(.4, .12, .05, -(st.W / 2 - .3), st.body[1][1] - .14, st.L / 2 + .02, '#d01818'), box(.4, .12, .05, (st.W / 2 - .3), st.body[1][1] - .14, st.L / 2 + .02, '#d01818')];
    wheelsOf(st.W, [-st.wb, st.wb], st.wr, parts); return { geo: merged(parts), len: st.L, wid: st.W };
  };
  out.car = ['#b71c1c', '#1565c0', '#eeeeee', '#212121', '#9e9e9e', '#5d4037', '#2e7d32', '#bdbdbd'].map((c, i) => carGeo(c, ['sedan', 'hatch', 'exec'][i % 3]));
  out.taxi = [carGeo('#f9c41a', 'sedan')];
  // Danfo (yellow minibus with black stripes)
  out.danfo = [0, 1].map(k => {
    const L = 4.9, W = 1.95, parts = [box(W, 1.55, L, 0, 1.15, 0, '#f6c21a'), box(W + .02, .12, L + .02, 0, .92, 0, '#111111'), box(W + .02, .08, L + .02, 0, 1.12, 0, '#111111'),
      box(W + .03, .5, L * .78, 0, 1.6, -.1, '#1a2228'), box(W * .86, .5, .05, 0, 1.55, -L / 2 - .01, '#1a2228'), box(W * .9, .45, .05, 0, 1.6, L / 2 + .01, '#1a2228'),
      box(W * .9, .08, L * .7, 0, 2.0, .2, '#5d4037'), box(.9, .35, .8, -.3, 2.2, .6, k ? '#8d6e63' : '#3e6b8a'), box(.7, .3, .7, .4, 2.18, -.4, '#a1887f'),
      box(.3, .2, .05, -.75, .7, L / 2 + .01, '#d01818'), box(.3, .2, .05, .75, .7, L / 2 + .01, '#d01818')];
    wheelsOf(W, [-1.6, 1.6], .36, parts); return { geo: merged(parts), len: L, wid: W };
  });
  // BRT bus
  out.brt = [(() => { const L = 12, W = 2.55, parts = [box(W, 2.6, L, 0, 1.75, 0, '#1565c0'), box(W + .02, .3, L + .02, 0, 1.05, 0, '#c62828'), box(W + .03, .9, L * .9, 0, 2.3, 0, '#16222c'), box(W * .9, 1.1, .05, 0, 2.2, L / 2 + .02, '#16222c'), box(W * .9, .3, .05, 0, 3.0, -L / 2 - .02, '#ffd54f'), box(.4, .3, .05, -1, .9, L / 2 + .02, '#d01818'), box(.4, .3, .05, 1, .9, L / 2 + .02, '#d01818')]; wheelsOf(W, [-4, 3.8], .5, parts); return { geo: merged(parts), len: L, wid: W }; })()];
  // Keke (tricycle)
  out.keke = [['#f6c21a', '#2e7d32'], ['#f6c21a', '#f6c21a']].map(([a, b]) => { const L = 2.7, W = 1.35, parts = [box(W, .8, L * .8, 0, .75, .1, a), box(W + .05, .08, L, 0, 1.75, 0, b), box(.06, .9, .06, -W / 2 + .05, 1.3, .9, '#222'), box(.06, .9, .06, W / 2 - .05, 1.3, .9, '#222'), box(.06, .9, .06, -W / 2 + .05, 1.3, -.8, '#222'), box(.06, .9, .06, W / 2 - .05, 1.3, -.8, '#222'), box(.7, .5, .5, 0, 1.4, .4, '#4e342e'), box(.2, .12, .05, -.45, .6, L / 2 - .2, '#d01818'), box(.2, .12, .05, .45, .6, L / 2 - .2, '#d01818')]; parts.push(cyl(.26, .2, -W / 2 + .1, .26, .8, '#151515'), cyl(.26, .2, W / 2 - .1, .26, .8, '#151515'), cyl(.26, .14, 0, .26, -1.1, '#151515')); return { geo: merged(parts), len: L, wid: W }; });
  // Okada (motorbike + rider)
  out.okada = ['#1e88e5', '#e53935', '#43a047'].map(sh => { const parts = [box(.3, .35, 1.6, 0, .6, 0, '#222222'), box(.42, .22, .7, 0, .9, .15, '#333333'), box(.5, .65, .35, 0, 1.35, .15, sh), box(.3, .3, .3, 0, 1.85, .1, '#111111'), box(.7, .06, .06, 0, 1.1, -.55, '#444'), box(.14, .55, .14, -.18, .75, .05, '#263238'), box(.14, .55, .14, .18, .75, .05, '#263238'), box(.1, .08, .05, 0, .78, .81, '#d01818')]; parts.push(cyl(.3, .12, 0, .3, -.65, '#151515'), cyl(.3, .12, 0, .3, .65, '#151515')); return { geo: merged(parts), len: 2.0, wid: .8 }; });
  // Fuel tanker
  out.tanker = [(() => { const L = 10, W = 2.5, parts = [box(W, 2.3, 2.4, 0, 1.6, -L / 2 + 1.2, '#e0e0e0'), box(W * .9, .8, .05, 0, 2.1, -L / 2 - .01, '#1a2228'), box(W * .7, .4, L - 2.6, 0, .9, 1.2, '#333')]; const t = new THREE.CylinderGeometry(1.15, 1.15, L - 2.8, 16); t.rotateX(Math.PI / 2); t.translate(0, 2.05, 1.3); parts.push(colored(t.toNonIndexed(), '#cfd2d4')); parts.push(box(W + .02, .25, L - 2.8, 0, 2.05, 1.3, '#ef6c00'), box(.4, .3, .05, -1, .9, L / 2 + .02, '#d01818'), box(.4, .3, .05, 1, .9, L / 2 + .02, '#d01818')); wheelsOf(W, [-3.6, 2.2, 3.6], .5, parts); return { geo: merged(parts), len: L, wid: W }; })()];
  return out;
}
export const TRAFFIC_MIX = { lagos: { car: 34, taxi: 8, danfo: 26, brt: 6, keke: 10, okada: 10, tanker: 6 } };
export const TRAFFIC_SPEED = { car: [55, 85], taxi: [55, 80], danfo: [50, 75], brt: [45, 60], keke: [30, 42], okada: [45, 70], tanker: [40, 55] }; // km/h

// ---------------- detailed models from GLB files (e.g. AI-generated or artist-made)
const glbCache = {};
export function preloadGlb(url) {
  if (!glbCache[url]) glbCache[url] = new Promise((res, rej) => new GLTFLoader().load(url, g => res(g.scene), undefined, rej));
  return glbCache[url];
}
export async function buildGlbCar(spec) {
  const src = await preloadGlb(spec.glb);
  const m = src.clone(true), g = new THREE.Group();
  const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const lengthAlongZ = size.z >= size.x, L = lengthAlongZ ? size.z : size.x, s = (spec.len || 4.5) / L;
  m.scale.setScalar(s); m.position.set(-ctr.x * s, -box.min.y * s, -ctr.z * s);
  const holder = new THREE.Group(); holder.add(m); holder.rotation.y = lengthAlongZ ? Math.PI : -Math.PI / 2; // front -> -z
  g.add(holder);
  let paint = null;
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; const mat = o.material = o.material.clone(); mat.roughness = Math.min(mat.roughness ?? 1, .38); mat.metalness = Math.max(mat.metalness ?? 0, .35); paint = paint || mat; } });
  const W = (lengthAlongZ ? size.x : size.z) * s;
  // brake lights overlay + contact shadow
  const tail = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a1a, emissiveIntensity: 0, transparent: true, opacity: .0 });
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.15, spec.len * 1.05), shadowMat()); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; g.add(sh);
  // night lights for AI models (they have no separate light meshes): glowing head/tail strips, hidden by day
  const H = size.y * s, lights = new THREE.Group(); lights.visible = false; g.add(lights);
  const headM = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.6, 7.6) }), tailM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, .15, .12) });
  for (const x of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(.36, .1, .04), headM); h.position.set(x * (W / 2 - .34), H * .42, -spec.len / 2 - .03); lights.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(.4, .1, .04), tailM); t.position.set(x * (W / 2 - .3), H * .5, spec.len / 2 + .03); lights.add(t);
  }
  return { group: g, wheels: [], len: spec.len, wid: W, paint, glb: true, headY: H * .42,
    setBrake(on) { tailM.color.setRGB(on ? 7 : 3.2, on ? .3 : .15, on ? .25 : .12); }, setNight(on) { lights.visible = on; } };
}
