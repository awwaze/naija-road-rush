// Garage: car classes, upgrades, blueprints, and visual customisation (paint/finish/stripes/rims/glow/spoiler/plate)
// that works on both the built-in procedural cars and AI-scanned GLB cars.
import * as THREE from 'three';

// ---------------------------------------------------------------- catalogue data
export const PAINT_COLORS = ['#c62828', '#e53935', '#ff6d00', '#ffb300', '#fdd835', '#7cb342', '#1b8a3c', '#00897b', '#00acc1', '#1e88e5', '#283593', '#6a1b9a', '#d81b60', '#f5f5f5', '#9e9e9e', '#212121', '#b8860b', '#6d4c41'];
export const FINISHES = { gloss: { label: 'Gloss', rough: .28, metal: .35, price: 0 }, metal: { label: 'Metallic', rough: .22, metal: .85, price: 300 }, matte: { label: 'Matte', rough: .9, metal: .05, price: 400 }, pearl: { label: 'Pearl', rough: .2, metal: .6, pearl: 1, price: 800 } };
export const STRIPES = { none: { label: 'None', price: 0 }, twin: { label: 'Twin racing', price: 250 }, naija: { label: 'Green-White-Green', price: 400 }, side: { label: 'Side band', price: 250 } };
export const RIMS = { stock: { label: 'Stock', price: 0 }, sport: { label: 'Sport 5-spoke', color: 0xc9ced3, metal: .9, spokes: 5, price: 400 }, chrome: { label: 'Chrome mesh', color: 0xf2f2f2, metal: 1, spokes: 10, price: 700 }, black: { label: 'Black rally', color: 0x1c1c1c, metal: .4, spokes: 6, price: 500 }, gold: { label: 'Gold', color: 0xd4a017, metal: 1, spokes: 7, price: 900 } };
export const GLOWS = { none: { label: 'None', price: 0 }, green: { label: 'Naija green', color: 0x00e676, price: 500 }, blue: { label: 'Ice blue', color: 0x2196f3, price: 500 }, purple: { label: 'Purple', color: 0xb000ff, price: 500 }, red: { label: 'Red', color: 0xff1744, price: 500 } };
export const HEADLIGHTS = { white: { label: 'White', rgb: [9, 8.6, 7.6], price: 0 }, xenon: { label: 'Xenon blue', rgb: [5.5, 7, 10], price: 250 }, amber: { label: 'Amber', rgb: [10, 6.5, 2], price: 250 } };
export const PLATE_STATES = [['LAGOS', 'Centre of Excellence'], ['FCT ABUJA', 'Centre of Unity'], ['KANO', 'Centre of Commerce'], ['RIVERS', 'Treasure Base of the Nation'], ['ENUGU', 'Coal City State'], ['EKITI', 'Fountain of Knowledge'], ['CROSS RIVER', 'The People’s Paradise'], ['OYO', 'Pace Setter State'], ['OGUN', 'Gateway State'], ['DELTA', 'The Big Heart']];
export const UPGRADES = { spd: { label: 'Top speed', icon: '⚡' }, acc: { label: 'Acceleration', icon: '🚀' }, han: { label: 'Handling', icon: '🎯' }, nit: { label: 'Nitro', icon: '🔥' } };
export const MAX_LV = 5;

export function defaultCustom(spec) {
  return { up: { spd: 0, acc: 0, han: 0, nit: 0 }, paint: spec.livery?.paint || null, finish: spec.livery?.finish || 'gloss', stripe: spec.livery?.stripe || 'none', stripeCol: spec.livery?.stripeCol || '#f5f5f5',
    rim: spec.livery?.rim || 'stock', glow: spec.livery?.glow || 'none', spoiler: !!spec.livery?.spoiler, head: 'white', plate: randomPlate(), state: 0,
    // an edition's own livery parts come free with the car
    owned: { finish: [...new Set(['gloss', spec.livery?.finish || 'gloss'])], stripe: [...new Set(['none', spec.livery?.stripe || 'none'])], rim: [...new Set(['stock', spec.livery?.rim || 'stock'])], glow: [...new Set(['none', spec.livery?.glow || 'none'])], head: ['white'], spoiler: !!spec.livery?.spoiler } };
}
export function randomPlate() { const L = 'ABCDEFGHJKLMNPRSTUVWXYZ', r = n => Array.from({ length: n }, () => L[Math.floor(Math.random() * L.length)]).join(''); return `${r(3)} ${100 + Math.floor(Math.random() * 899)} ${r(2)}`; }

// ---------------------------------------------------------------- stats, class, upgrades, blueprints
export function upgraded(spec, cust) {
  const u = (cust && cust.up) || {};
  return { ...spec, top: Math.round(spec.top * (1 + .03 * (u.spd || 0))), acc: spec.acc * (1 + .05 * (u.acc || 0)), grip: spec.grip * (1 + .045 * (u.han || 0)), nos: spec.nos * (1 + .07 * (u.nit || 0)) };
}
export function rating(st) { return Math.round(st.top + st.acc * 45 + st.grip * 35 + st.nos * 25); }
export function carClass(st) { const r = rating(st); return r >= 405 ? 'S' : r >= 375 ? 'A' : r >= 350 ? 'B' : r >= 325 ? 'C' : 'D'; }
export const CLASS_COL = { D: '#8d9aa3', C: '#4caf50', B: '#2196f3', A: '#ab47bc', S: '#ffb300' };
export const BP_NEED = { D: 0, C: 8, B: 12, A: 18, S: 25 };
export function stars(cust) { const u = (cust && cust.up) || {}; return Math.floor(((u.spd || 0) + (u.acc || 0) + (u.han || 0) + (u.nit || 0)) / 4); }
export function upgradeCost(spec, lv) { return Math.round(((120 + spec.price * .025) * Math.pow(lv + 1, 1.55)) / 10) * 10; }

// ---------------------------------------------------------------- GLB analysis (paint colour + geometry landmarks)
const analysisCache = new Map();
function analyseTexture(map) {
  const img = map && map.image; if (!img || !img.width) return { mode: 'none' };
  const c = document.createElement('canvas'), w = 128, h = Math.max(1, Math.round(128 * img.height / img.width)); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data;
  const bins = new Float32Array(36), lumBins = new Float32Array(36); let sat = 0, n = 0, darkLum = 0, darkN = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), v = mx, s = mx > 0 ? (mx - mn) / mx : 0; n++;
    if (s > .35 && v > .15) { let hh = mx === mn ? 0 : mx === r ? ((gg - b) / (mx - mn)) % 6 : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4; hh = (hh / 6 + 1) % 1; const k = Math.floor(hh * 36) % 36; bins[k] += s; lumBins[k] += lin(r) * .2126 + lin(gg) * .7152 + lin(b) * .0722; sat += 1; }
    else if (v < .2) { darkLum += lin(r) * .2126 + lin(gg) * .7152 + lin(b) * .0722; darkN++; }
  }
  let best = 0; for (let k = 1; k < 36; k++) if (bins[k] + bins[(k + 35) % 36] + bins[(k + 1) % 36] > bins[best] + bins[(best + 35) % 36] + bins[(best + 1) % 36]) best = k;
  const cnt = sat ? bins[best] + bins[(best + 35) % 36] + bins[(best + 1) % 36] : 0;
  if (sat / n > .08 && cnt > 0) { const lum = (lumBins[best] + lumBins[(best + 35) % 36] + lumBins[(best + 1) % 36]) / Math.max(1, (cnt / .5)); return { mode: 'hue', hue: (best + .5) / 36, lum: Math.max(.03, lum) }; }
  return { mode: 'dark', lum: Math.max(.004, darkN ? darkLum / darkN : .01) };
  function lin(x) { return x <= .04045 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }
}
// landmarks measured from the mesh in car space (front = -z, up = +y): rear deck height, wheel positions/radius
function measure(group, L, W, H) {
  group.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), v = new THREE.Vector3(), m4 = new THREE.Matrix4();
  let deck = H * .55; const lowF = [], lowR = []; let maxX = W / 2;
  group.traverse(o => { if (!o.isMesh || !o.geometry.attributes.position) return; m4.multiplyMatrices(inv, o.matrixWorld); const p = o.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 6000));
    let dk = 0; for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(m4);
      if (v.z > L * .36 && Math.abs(v.x) < W * .3) dk = Math.max(dk, v.y);
      if (v.y < H * .1 && Math.abs(v.x) > W * .3) (v.z < 0 ? lowF : lowR).push(v.z); }
    if (dk) deck = Math.min(H * .85, Math.max(H * .35, dk)); });
  const mid = a => a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;
  const r = Math.min(.4, Math.max(.27, H * .23));
  return { deck, wheelZ: [mid(lowF) ?? -L * .31, mid(lowR) ?? L * .31], r, trackX: maxX - .06 };
}

// ---------------------------------------------------------------- paint shader for scanned (textured) cars
function patchPaint(mat, toCar, info, dims) {
  const U = { uPaint: { value: new THREE.Color(1, 1, 1) }, uPaintOn: { value: 0 }, uMode: { value: info.mode === 'hue' ? 0 : 1 }, uSrcHue: { value: info.hue || 0 }, uSrcLum: { value: info.lum || .05 },
    uRough: { value: .3 }, uMetal: { value: .4 }, uPearl: { value: 0 }, uStripe: { value: 0 }, uStripeCol: { value: new THREE.Color(1, 1, 1) }, uStripeCol2: { value: new THREE.Color(0, .5, .2) },
    uToCar: { value: toCar }, uDims: { value: new THREE.Vector3(dims.L, dims.W, dims.H) } };
  mat.userData.paintU = U;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform mat4 uToCar; varying vec3 vCarP; varying vec3 vCarN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCarP = (uToCar * vec4(transformed, 1.0)).xyz; vCarN = normalize(mat3(uToCar) * objectNormal);');
    sh.fragmentShader = `uniform vec3 uPaint, uStripeCol, uStripeCol2, uDims; uniform float uPaintOn, uMode, uSrcHue, uSrcLum, uRough, uMetal, uPearl, uStripe; varying vec3 vCarP; varying vec3 vCarN; float pMaskG;
vec3 nrrHsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-10)), d/(q.x+1e-10), q.x); }
` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
  { vec3 tc = diffuseColor.rgb; vec3 hv = nrrHsv(pow(max(tc, vec3(0.)), vec3(1./2.2))); float m = 0.;
    if (uMode < .5) { float dh = abs(fract(hv.x - uSrcHue + .5) - .5); m = smoothstep(.1, .05, dh) * smoothstep(.16, .3, hv.y) * smoothstep(.03, .08, hv.z); }
    else { float low = (vCarP.y < uDims.z * .56 || (vCarN.y > .6 && abs(vCarP.z) > uDims.x * .2)) ? 1. : 0.; m = (1. - smoothstep(.12, .22, hv.y)) * (1. - smoothstep(.1, .2, hv.z)) * low; }
    pMaskG = m; float lum = dot(tc, vec3(.2126, .7152, .0722)); float k = clamp(lum / uSrcLum, 0., 2.4);
    vec3 base = uPaintOn > .5 ? mix(tc, uPaint * k, m) : tc;
    float ax = abs(vCarP.x), top = step(.35, vCarN.y), st = 0.; vec3 sc = uStripeCol;
    if (uStripe > .5 && uStripe < 1.5) st = step(ax, .23) * step(.08, ax) * top;
    else if (uStripe > 1.5 && uStripe < 2.5) { st = step(ax, .38) * top; sc = ax < .13 ? uStripeCol : uStripeCol2; }
    else if (uStripe > 2.5) { float y = vCarP.y / uDims.z; st = step(.34, y) * step(y, .43) * step(.6, abs(vCarN.x)); }
    diffuseColor.rgb = mix(base, sc * max(k, .55), st * m); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, uRough, pMaskG);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, uMetal, pMaskG);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n if (uPearl > .5) { float fr = pow(1. - abs(dot(normalize(vViewPosition), normal)), 2.); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb.gbr * 1.15 + vec3(.04), fr * .55 * pMaskG); }');
  };
  mat.customProgramCacheKey = () => 'nrr-paint';
  mat.needsUpdate = true;
}

// ---------------------------------------------------------------- accessories
function rimMesh(style, r) {
  const g = new THREE.Group(), R = RIMS[style], mat = new THREE.MeshStandardMaterial({ color: R.color, metalness: R.metal, roughness: .22 });
  const disc = new THREE.CylinderGeometry(r * .66, r * .66, .03, 24); disc.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(disc, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .6 })));
  const ring = new THREE.TorusGeometry(r * .64, r * .06, 6, 28); ring.rotateY(Math.PI / 2); const rm = new THREE.Mesh(ring, mat); rm.position.x = .02; g.add(rm);
  for (let k = 0; k < R.spokes; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(.03, r * .62, r * (R.spokes > 8 ? .08 : .14)), mat); s.position.set(.025, 0, 0); s.rotation.x = k / R.spokes * Math.PI * 2; s.geometry.translate(0, r * .31, 0); g.add(s); }
  const hub = new THREE.CylinderGeometry(r * .14, r * .14, .05, 12); hub.rotateZ(Math.PI / 2); const hm = new THREE.Mesh(hub, mat); hm.position.x = .03; g.add(hm);
  return g;
}
function plateTexture(text, stateIdx) {
  const [st, motto] = PLATE_STATES[stateIdx % PLATE_STATES.length], c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#1b5e20'; g.lineWidth = 6; g.strokeRect(4, 4, 504, 120);
  g.fillStyle = '#1b5e20'; g.font = '700 18px Arial'; g.textAlign = 'center'; g.fillText('FEDERAL REPUBLIC OF NIGERIA', 256, 24);
  g.fillStyle = '#0d47a1'; g.font = '900 66px "Russo One", Arial'; g.fillText(text.toUpperCase().slice(0, 10), 256, 88);
  g.fillStyle = '#c62828'; g.font = '700 17px Arial'; g.fillText(st + ' · ' + motto, 256, 116);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
let glowTex = null;
function glowTexture() { if (glowTex) return glowTex; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); glowTex = new THREE.CanvasTexture(c); return glowTex; }

// Apply a customisation to a built car model (procedural or GLB). Safe to call again after changes.
export function applyCustom(model, spec, cust) {
  if (!model || !cust) return;
  const g = model.group, L = model.len, W = model.wid;
  // ---- landmarks + paint hooks, computed once per model
  if (!model._cust) {
    model._cust = { mats: [] };
    const box = new THREE.Box3().setFromObject(g), H = Math.max(.9, box.max.y), dims = { L, W, H };
    model._cust.dims = dims;
    if (model.glb) {
      g.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
      g.traverse(o => { if (!o.isMesh || !o.material || !o.material.map || !o.material.isMeshStandardMaterial) return;
        const key = o.material.map.uuid; if (!analysisCache.has(key)) analysisCache.set(key, analyseTexture(o.material.map));
        const toCar = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); patchPaint(o.material, toCar, analysisCache.get(key), dims); model._cust.mats.push(o.material); });
      model._cust.m = measure(g, L, W, H);
    } else model._cust.m = { deck: H * .62, wheelZ: [-L * .32, L * .32], r: .34, trackX: W / 2 - .06 };
    model._cust.acc = new THREE.Group(); g.add(model._cust.acc);
  }
  const C = model._cust, m = C.m, F = FINISHES[cust.finish] || FINISHES.gloss;
  // ---- paint + finish + stripes
  if (model.glb) {
    for (const mat of C.mats) { const U = mat.userData.paintU; if (!U) continue;
      U.uPaintOn.value = cust.paint ? 1 : 0; if (cust.paint) U.uPaint.value.set(cust.paint); // Color.set converts sRGB hex to linear
      U.uRough.value = F.rough; U.uMetal.value = F.metal; U.uPearl.value = F.pearl ? 1 : 0;
      U.uStripe.value = { none: 0, twin: 1, naija: 2, side: 3 }[cust.stripe] || 0; U.uStripeCol.value.set(cust.stripe === 'naija' ? '#f5f5f5' : cust.stripeCol); U.uStripeCol2.value.set('#1b8a3c'); }
  } else if (model.paint) { if (cust.paint) model.paint.color.set(cust.paint); model.paint.roughness = F.rough; model.paint.metalness = F.metal; }
  // ---- accessories (rebuilt each time; cheap)
  const acc = C.acc; while (acc.children.length) acc.remove(acc.children[0]); model.rims = [];
  if (cust.rim && cust.rim !== 'stock') for (const z of m.wheelZ) for (const sx of [-1, 1]) { const r = rimMesh(cust.rim, m.r); r.position.set(sx * (m.trackX + .005), m.r, z); if (sx < 0) r.rotation.y = Math.PI; acc.add(r); model.rims.push(r); }
  if (cust.glow && cust.glow !== 'none') { const gl = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.5, L * 1.15), new THREE.MeshBasicMaterial({ map: glowTexture(), color: GLOWS[cust.glow].color, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false })); gl.rotation.x = -Math.PI / 2; gl.position.y = .03; acc.add(gl); model.glowMesh = gl; } else model.glowMesh = null;
  if (cust.spoiler) {
    const wm = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: .4, metalness: .5 }), z = L * .43, y = m.deck;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(W * .82, .05, .34), wm); wing.position.set(0, y + .3, z); wing.rotation.x = -.12; acc.add(wing);
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.05, .32, .12), wm); p.position.set(sx * W * .26, y + .14, z); acc.add(p); const e = new THREE.Mesh(new THREE.BoxGeometry(.03, .16, .38), wm); e.position.set(sx * W * .41, y + .3, z); acc.add(e); }
  }
  const pt = plateTexture(cust.plate || 'NRR 001 AA', cust.state || 0), pm = new THREE.MeshStandardMaterial({ map: pt, roughness: .5, metalness: .1 });
  for (const [z, ry] of [[L / 2 + .02, 0], [-L / 2 - .02, Math.PI]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(.56, .14), pm); p.position.set(0, C.dims.H * .3, z); p.rotation.y = ry; acc.add(p); }
  if (model.setHeadColor) model.setHeadColor(HEADLIGHTS[cust.head] || HEADLIGHTS.white);
}
// spin custom rims with distance travelled
export function spinRims(model, dist) { if (model && model.rims) for (const r of model.rims) r.rotation.x = -dist / (model._cust ? model._cust.m.r : .34); }

// ---------------------------------------------------------------- showroom stage
export function buildShowroom(scene) {
  scene.background = new THREE.Color(0x05080a); scene.fog = new THREE.Fog(0x05080a, 14, 30);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(20, 64), new THREE.MeshStandardMaterial({ color: 0x0c1114, roughness: .18, metalness: .7 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.75, .14, 64), new THREE.MeshStandardMaterial({ color: 0x1a2226, roughness: .25, metalness: .8 })); disc.position.y = .07; scene.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.68, .035, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 2.2, 1) })); ring.rotation.x = Math.PI / 2; ring.position.y = .15; scene.add(ring);
  // backdrop: curved wall with light strips
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 9, 64, 1, true, Math.PI * .65, Math.PI * .7), new THREE.MeshStandardMaterial({ color: 0x0b1316, roughness: .8, side: THREE.BackSide })); wall.position.y = 4.5; scene.add(wall);
  for (let k = -3; k <= 3; k++) { const a = Math.PI + k * .18, strip = new THREE.Mesh(new THREE.BoxGeometry(.12, 6, .12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.7) })); strip.position.set(Math.sin(a) * 15.6, 4.2, Math.cos(a) * 15.6); scene.add(strip); }
  const key = new THREE.SpotLight(0xffffff, 260, 30, .55, .6, 1.4); key.position.set(4, 8, 5); key.target.position.set(0, .4, 0); scene.add(key, key.target);
  const rim = new THREE.SpotLight(0x8fd9ff, 160, 30, .6, .7, 1.4); rim.position.set(-5, 5, -5); rim.target.position.set(0, .5, 0); scene.add(rim, rim.target);
  scene.add(new THREE.HemisphereLight(0xb8c8d8, 0x101010, .55));
  return { disc, ring };
}
