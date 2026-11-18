// Builds the 3D world for a race route from real OpenStreetMap data.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import * as TX from './textures.js';

const R = TX.ROAD;
const CHUNK = 100; // track points (400 m) per chunk

// ---------------------------------------------------------------- track maths
export class Track {
  constructor(route) {
    const n = route.pts.length / 2;
    this.n = n; this.step = 4; this.length = (n - 1) * 4; this.route = route;
    this.P = new Float32Array(n * 3); this.T = new Float32Array(n * 2); this.N = new Float32Array(n * 2);
    this.curv = new Float32Array(n); this.bridge = route.bridge;
    for (let i = 0; i < n; i++) { this.P[i * 3] = route.pts[i * 2]; this.P[i * 3 + 1] = route.elev[i]; this.P[i * 3 + 2] = route.pts[i * 2 + 1]; }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = this.P[b * 3] - this.P[a * 3], tz = this.P[b * 3 + 2] - this.P[a * 3 + 2]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      this.T[i * 2] = tx; this.T[i * 2 + 1] = tz; this.N[i * 2] = -tz; this.N[i * 2 + 1] = tx;
    }
    const raw = new Float32Array(n);
    for (let i = 1; i < n - 1; i++) { const nx = this.N[(i - 1) * 2], nz = this.N[(i - 1) * 2 + 1]; raw[i] = (this.T[(i + 1) * 2] * nx + this.T[(i + 1) * 2 + 1] * nz) / 8; }
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -6; k <= 6; k++) { const j = i + k; if (j >= 0 && j < n) { s += raw[j]; c++; } } this.curv[i] = s / c; }
  }
  // frame at distance s: position, tangent, right, slope
  frame(s, o) {
    const f = Math.max(0, Math.min(this.length - 0.001, s)) / 4, i = Math.floor(f), t = f - i, j = Math.min(this.n - 1, i + 1), P = this.P;
    o.x = P[i * 3] + (P[j * 3] - P[i * 3]) * t; o.y = P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * t; o.z = P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * t;
    let tx = this.T[i * 2] + (this.T[j * 2] - this.T[i * 2]) * t, tz = this.T[i * 2 + 1] + (this.T[j * 2 + 1] - this.T[i * 2 + 1]) * t; const l = Math.hypot(tx, tz) || 1;
    o.tx = tx / l; o.tz = tz / l; o.nx = -o.tz; o.nz = o.tx; o.i = i; o.slope = (P[j * 3 + 1] - P[i * 3 + 1]) / 4; o.curv = this.curv[i]; o.bridge = this.bridge[i];
    return o;
  }
  idx(s) { return Math.max(0, Math.min(this.n - 1, Math.round(s / 4))); }
}

// ---------------------------------------------------------------- helpers
function strip(track, i0, i1, profile, opt = {}) {
  // sweeps a cross-section profile [[offset, height], ...] along track points i0..i1
  const m = profile.length, cnt = i1 - i0 + 1, pos = new Float32Array(cnt * m * 3), uv = new Float32Array(cnt * m * 2), idx = [];
  const P = track.P, N = track.N; let ul = [0]; for (let k = 1; k < m; k++) ul.push(ul[k - 1] + Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]));
  for (let c = 0; c < cnt; c++) {
    const i = i0 + c, x = P[i * 3], y = P[i * 3 + 1] + (opt.lift || 0), z = P[i * 3 + 2], nx = N[i * 2], nz = N[i * 2 + 1];
    for (let k = 0; k < m; k++) {
      const [o, h] = profile[k], v = (c * m + k);
      pos[v * 3] = x + nx * o; pos[v * 3 + 1] = (opt.flat ? (opt.flatY || 0) : y) + h; pos[v * 3 + 2] = z + nz * o;
      uv[v * 2] = opt.uFn ? opt.uFn(o, k) : ul[k] / (opt.uScale || 2); uv[v * 2 + 1] = i * 4 / (opt.vScale || 4);
    }
    if (c > 0) for (let k = 0; k < m - 1; k++) { const a = (c - 1) * m + k, b = a + 1, d = c * m + k, e = d + 1; if (opt.flip) idx.push(a, d, b, b, d, e); else idx.push(a, b, d, b, e, d); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function runs(flags, i0, i1, want) { // contiguous index runs where flags == want
  const out = []; let s = -1;
  for (let i = i0; i <= i1; i++) { const ok = !!flags[i] === want; if (ok && s < 0) s = i; if ((!ok || i === i1) && s >= 0) { const e = ok ? i : i - 1; if (e > s) out.push([s, e]); s = -1; } }
  return out;
}
function rnd(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- world
export function buildWorld({ scene, renderer, track, route, groundImg, quality, onProgress }) {
  const group = new THREE.Group(); scene.add(group);
  const disposables = [];
  const keep = (...xs) => { disposables.push(...xs); return xs[0]; };
  const n = track.n, high = quality === 'high';

  // ---------- sky, sun, environment
  const sky = new Sky(); sky.scale.setScalar(45000);
  const u = sky.material.uniforms; u.turbidity.value = 6.5; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 24), THREE.MathUtils.degToRad(215));
  u.sunPosition.value.copy(sunDir);
  const pmrem = new THREE.PMREMGenerator(renderer); const skyScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(450); Object.assign(sky2.material.uniforms.sunPosition.value, sunDir);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = u[k].value;
  skyScene.add(sky2); const env = pmrem.fromScene(skyScene, 0, 0.1, 1000).texture; scene.environment = env; scene.environmentIntensity = 0.55; keep(env);
  group.add(sky);
  scene.fog = new THREE.Fog(0xaebfc8, 350, high ? 2400 : 1400);
  const hemi = new THREE.HemisphereLight(0xcfe0f0, 0x4a3f30, 0.35); group.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6c4, 2.1); sun.position.copy(sunDir).multiplyScalar(300);
  if (high) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const c = sun.shadow.camera; c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 10; c.far = 700; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; }
  group.add(sun); group.add(sun.target);

  // ---------- materials
  const roadTex = keep(TX.roadTexture()), concTex = keep(TX.concreteTexture()), fac = TX.facadeTextures(), roofTex = keep(TX.roofTexture());
  Object.values(fac).forEach(t => keep(t));
  const mRoad = keep(new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.88, metalness: 0 }));
  const mConc = keep(new THREE.MeshStandardMaterial({ map: concTex, roughness: 0.9 }));
  const mConcDark = keep(new THREE.MeshStandardMaterial({ map: concTex, color: 0x8d8a83, roughness: 0.95 }));
  const mMetal = keep(new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.35, metalness: 0.8 }));
  const mGlass = keep(new THREE.MeshStandardMaterial({ map: fac.glass, vertexColors: true, roughness: 0.12, metalness: 0.75 }));
  const mBlock = keep(new THREE.MeshStandardMaterial({ map: fac.block, vertexColors: true, roughness: 0.82 }));
  const mLow = keep(new THREE.MeshStandardMaterial({ map: fac.low, vertexColors: true, roughness: 0.9 }));
  const mRoof = keep(new THREE.MeshStandardMaterial({ map: roofTex, vertexColors: true, roughness: 0.95 }));
  const mTank = keep(new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }));

  // ---------- water + ground
  const wn = keep(TX.waterNormal());
  const mWater = keep(new THREE.MeshStandardMaterial({ color: 0x24525c, roughness: 0.06, metalness: 0.15, normalMap: wn, normalScale: new THREE.Vector2(0.3, 0.3), polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6 }));
  const WSIZE = 12000, WTILE = 26; wn.repeat.set(WSIZE / WTILE, WSIZE / WTILE);
  const water = new THREE.Mesh(keep(new THREE.PlaneGeometry(WSIZE, WSIZE, 60, 60)), mWater); water.rotation.x = -Math.PI / 2; water.position.set(track.P[0], -1.2, track.P[2]); water.receiveShadow = false; group.add(water);
  const gr = route.ground, gm = TX.groundFromMask(groundImg); keep(gm.map, gm.alpha);
  const mGround = keep(new THREE.MeshStandardMaterial({ map: gm.map, alphaMap: gm.alpha, alphaTest: 0.5, roughness: 1 }));
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(gr.w, gr.h)), mGround); ground.rotation.x = -Math.PI / 2; ground.position.set(gr.minx + gr.w / 2, 0, gr.minz + gr.h / 2); ground.receiveShadow = high; group.add(ground);
  const landAt = (x, z) => gm.landAt((x - gr.minx) / gr.w, (z - gr.minz) / gr.h);

  // ---------- road, barriers, bridge deck per chunk
  const chunks = [];
  const uRoad = o => (o - R.L) / R.W;
  const deckProfileUnder = [[R.R + .3, -0.6], [R.R + .3, -1.7], [R.L - .3, -1.7], [R.L - .3, -0.6]];
  const median = [[-7.3, 0], [-7.1, .25], [-6.55, .86], [-6.25, .86], [-5.7, .25], [-5.5, 0]];
  const parapetR = [[R.R, 0], [R.R, .95], [R.R + .3, .95], [R.R + .3, -.6]];
  const parapetL = [[R.L - .3, -.6], [R.L - .3, .95], [R.L, .95], [R.L, 0]];
  const railR = [[R.R + .05, 1.05], [R.R + .05, 1.18], [R.R + .25, 1.18], [R.R + .25, 1.05]];
  const railL = [[R.L - .25, 1.05], [R.L - .25, 1.18], [R.L - .05, 1.18], [R.L - .05, 1.05]];
  const kerbR = [[R.R, 0], [R.R, .16], [R.R + 2.6, .16], [R.R + 2.6, -.1]];
  const kerbL = [[R.L - 2.6, -.1], [R.L - 2.6, .16], [R.L, .16], [R.L, 0]];
  for (let a = 0; a < n - 1; a += CHUNK) {
    const b = Math.min(n - 1, a + CHUNK), cg = new THREE.Group(); cg.userData = { a, b };
    const road = new THREE.Mesh(keep(strip(track, a, b, [[R.L, 0.06], [R.R, 0.06]], { uFn: uRoad, vScale: TX.ROAD_TILE })), mRoad); road.receiveShadow = high; cg.add(road);
    const med = new THREE.Mesh(keep(strip(track, a, b, median, { lift: .06, uScale: 1, vScale: 3 })), mConc); med.castShadow = high; med.receiveShadow = high; cg.add(med);
    for (const [s, e] of runs(track.bridge, a, b, true)) {
      cg.add(new THREE.Mesh(keep(strip(track, s, e, deckProfileUnder, { lift: .06, uScale: 3, vScale: 6 })), mConcDark));
      const pr = new THREE.Mesh(keep(strip(track, s, e, parapetR, { lift: .06, uScale: 1, vScale: 3 })), mConc); pr.receiveShadow = high; cg.add(pr);
      cg.add(new THREE.Mesh(keep(strip(track, s, e, parapetL, { lift: .06, uScale: 1, vScale: 3 })), mConc));
      cg.add(new THREE.Mesh(keep(strip(track, s, e, railR, { lift: .06 })), mMetal)); cg.add(new THREE.Mesh(keep(strip(track, s, e, railL, { lift: .06 })), mMetal));
    }
    for (const [s, e] of runs(track.bridge, a, b, false)) {
      const kr = new THREE.Mesh(keep(strip(track, s, e, kerbR, { lift: .06, uScale: 1, vScale: 3 })), mConc); kr.receiveShadow = high; cg.add(kr);
      cg.add(new THREE.Mesh(keep(strip(track, s, e, kerbL, { lift: .06, uScale: 1, vScale: 3 })), mConc));
    }
    chunks.push(cg); group.add(cg);
  }

  // ---------- bridge piers + median lamps (instanced)
  const tmpM = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const pierIdx = []; for (let i = 0; i < n; i += 8) if (track.bridge[i] && track.P[i * 3 + 1] > 2) pierIdx.push(i);
  const pierGeo = keep(new THREE.BoxGeometry(1.5, 1, 1.5)); pierGeo.translate(0, .5, 0);
  const capGeo = keep(new THREE.BoxGeometry(27, 1.1, 2.2));
  const piers = new THREE.InstancedMesh(pierGeo, mConcDark, pierIdx.length * 3), caps = new THREE.InstancedMesh(capGeo, mConcDark, pierIdx.length);
  pierIdx.forEach((i, k) => {
    const x = track.P[i * 3], y = track.P[i * 3 + 1], z = track.P[i * 3 + 2], nx = track.N[i * 2], nz = track.N[i * 2 + 1];
    const ang = Math.atan2(nx, nz); q.setFromAxisAngle(up, ang);
    [-15, -6, 3].forEach((o, j) => { ps.set(x + nx * o, -0.6, z + nz * o); sc.set(1, y - 1.7 + 0.6, 1); tmpM.compose(ps, q, sc); piers.setMatrixAt(k * 3 + j, tmpM); });
    const mo = (R.L + R.R) / 2; ps.set(x + nx * mo, y - 2.2, z + nz * mo); sc.set(1, 1, 1); q.setFromAxisAngle(up, ang + Math.PI / 2); tmpM.compose(ps, q, sc); caps.setMatrixAt(k, tmpM);
  });
  group.add(piers, caps);
  // lamp posts on the median
  const pole = keep(new THREE.CylinderGeometry(.09, .14, 11, 6)); pole.translate(0, 5.5, 0);
  const arm1 = keep(new THREE.BoxGeometry(2.6, .1, .1)); arm1.translate(1.2, 10.8, 0);
  const arm2 = keep(new THREE.BoxGeometry(2.6, .1, .1)); arm2.translate(-1.2, 10.8, 0);
  const head1 = keep(new THREE.BoxGeometry(.7, .16, .32)); head1.translate(2.4, 10.7, 0);
  const head2 = keep(new THREE.BoxGeometry(.7, .16, .32)); head2.translate(-2.4, 10.7, 0);
  const lampGeo = keep(mergeGeometries([pole, arm1, arm2, head1, head2]));
  const lampIdx = []; for (let i = 6; i < n; i += 10) lampIdx.push(i);
  const lamps = new THREE.InstancedMesh(lampGeo, mMetal, lampIdx.length);
  lampIdx.forEach((i, k) => { const nx = track.N[i * 2], nz = track.N[i * 2 + 1]; ps.set(track.P[i * 3] + nx * -6.4, track.P[i * 3 + 1] + .9, track.P[i * 3 + 2] + nz * -6.4); q.setFromAxisAngle(up, Math.atan2(nx, nz) - Math.PI / 2); sc.set(1, 1, 1); tmpM.compose(ps, q, sc); lamps.setMatrixAt(k, tmpM); });
  lamps.castShadow = high; group.add(lamps);
  onProgress && onProgress(.45);

  // ---------- buildings (real footprints), merged per chunk and material
  const palette = ['#e8d9b5', '#f1ede4', '#e9b98f', '#a9c6d8', '#e6cf6e', '#d59f86', '#c9c1b0', '#9fc2a8', '#e2ab7f', '#c7d1d9', '#f0e0c0'];
  const glassTint = ['#b9d4e3', '#a8c9c0', '#c9d3db', '#9fb7cf'];
  const bChunks = new Map();
  const tanks = [];
  const col = new THREE.Color();
  for (const b of route.buildings) {
    const ci = Math.floor(b.i / CHUNK);
    if (!bChunks.has(ci)) bChunks.set(ci, { glass: { p: [], u: [], c: [] }, block: { p: [], u: [], c: [] }, low: { p: [], u: [], c: [] }, roof: { p: [], u: [], c: [] } });
    const C = bChunks.get(ci), r = rnd(b.f[0] * 1000 + b.f[1] * 7);
    const kind = b.h > 30 ? 'glass' : b.h > 9 ? 'block' : 'low';
    col.set(kind === 'glass' ? glassTint[Math.floor(r() * 4)] : palette[Math.floor(r() * palette.length)]);
    const W = C[kind], f = b.f, m = f.length / 2, h = b.h; let per = 0;
    for (let k = 0; k < m; k++) {
      const x0 = f[k * 2], z0 = f[k * 2 + 1], x1 = f[((k + 1) % m) * 2], z1 = f[((k + 1) % m) * 2 + 1], L = Math.hypot(x1 - x0, z1 - z0);
      const u0 = per / 4, u1 = (per + L) / 4, v1 = h / 3.3; per += L;
      // outward-facing quad (footprint is CCW in x,z => outward normal faces the viewer when ordered this way)
      W.p.push(x0, 0, z0, x1, h, z1, x1, 0, z1, x0, 0, z0, x0, h, z0, x1, h, z1);
      W.u.push(u0, 0, u1, v1, u1, 0, u0, 0, u0, v1, u1, v1);
      for (let t = 0; t < 6; t++) W.c.push(col.r, col.g, col.b);
    }
    // roof
    const shape = []; for (let k = 0; k < m; k++) shape.push(new THREE.Vector2(f[k * 2], f[k * 2 + 1]));
    const tri = THREE.ShapeUtils.triangulateShape(shape, []);
    const rc = kind === 'glass' ? 0.55 : 0.62 + r() * .2;
    for (let [i0, i1, i2] of tri) {
      // order each roof triangle so its normal points up (+y)
      const cr = (f[i1 * 2] - f[i0 * 2]) * (f[i2 * 2 + 1] - f[i0 * 2 + 1]) - (f[i1 * 2 + 1] - f[i0 * 2 + 1]) * (f[i2 * 2] - f[i0 * 2]);
      const order = cr > 0 ? [i0, i2, i1] : [i0, i1, i2];
      for (const ii of order) { C.roof.p.push(f[ii * 2], h, f[ii * 2 + 1]); C.roof.u.push(f[ii * 2] / 8, f[ii * 2 + 1] / 8); C.roof.c.push(rc, rc * .98, rc * .95); }
    }
    if (kind !== 'glass' && r() < .45 && m > 2) { let cx = 0, cz = 0; for (let k = 0; k < m; k++) { cx += f[k * 2]; cz += f[k * 2 + 1]; } tanks.push([cx / m + (r() - .5) * 2, h, cz / m + (r() - .5) * 2, r()]); }
  }
  const mats = { glass: mGlass, block: mBlock, low: mLow, roof: mRoof };
  for (const [ci, C] of bChunks) {
    const target = chunks[Math.min(chunks.length - 1, ci)];
    for (const k of Object.keys(C)) {
      if (!C[k].p.length) continue;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(C[k].p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(C[k].u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C[k].c, 3)); g.computeVertexNormals();
      const mesh = new THREE.Mesh(keep(g), mats[k]); mesh.castShadow = high; mesh.receiveShadow = high; target.add(mesh);
    }
  }
  const tankGeo = keep(new THREE.CylinderGeometry(.75, .75, 1.5, 10)); tankGeo.translate(0, .75, 0);
  const tankMesh = new THREE.InstancedMesh(tankGeo, mTank, tanks.length);
  tanks.forEach(([x, y, z], k) => { tmpM.makeTranslation(x, y, z); tankMesh.setMatrixAt(k, tmpM); }); group.add(tankMesh);
  onProgress && onProgress(.7);

  // ---------- palms along land stretches
  const palmIdx = []; const pr = rnd(77);
  for (let i = 10; i < n; i += 3) {
    if (track.bridge[i]) continue;
    for (const side of [1, -1]) {
      if (pr() > .38) continue;
      const o = side > 0 ? R.R + 3 + pr() * 7 : R.L - 3 - pr() * 7, x = track.P[i * 3] + track.N[i * 2] * o, z = track.P[i * 3 + 2] + track.N[i * 2 + 1] * o;
      if (landAt(x, z)) palmIdx.push([x, z, 7 + pr() * 6, pr() * 6.28, (pr() - .5) * .3]);
    }
  }
  const trunk = keep(new THREE.CylinderGeometry(.16, .26, 1, 7, 4)); trunk.translate(0, .5, 0);
  const mTrunk = keep(new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 1 }));
  const leafTex = keep(TX.palmLeafTexture());
  const mLeaf = keep(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: .45, side: THREE.DoubleSide, roughness: .8 }));
  const leaves = []; for (let k = 0; k < 9; k++) { const p = new THREE.PlaneGeometry(1.2, 4.2, 1, 3); const pa = p.attributes.position; for (let v = 0; v < pa.count; v++) { const y = pa.getY(v) + 2.1; pa.setY(v, y); pa.setZ(v, -0.12 * y * y); } p.rotateX(-Math.PI / 2 + .25); p.rotateY(k / 9 * Math.PI * 2); leaves.push(p); }
  const crownGeo = keep(mergeGeometries(leaves)); leaves.forEach(l => l.dispose());
  const trunks = new THREE.InstancedMesh(trunk, mTrunk, palmIdx.length), crowns = new THREE.InstancedMesh(crownGeo, mLeaf, palmIdx.length);
  palmIdx.forEach(([x, z, h, rot, lean], k) => {
    q.setFromEuler(new THREE.Euler(lean, rot, 0)); sc.set(1, h, 1); ps.set(x, 0, z); tmpM.compose(ps, q, sc); trunks.setMatrixAt(k, tmpM);
    const top = new THREE.Vector3(0, h, 0).applyQuaternion(q); ps.set(x + top.x, top.y, z + top.z); sc.set(1, 1, 1); q.setFromEuler(new THREE.Euler(0, rot, 0)); tmpM.compose(ps, q, sc); crowns.setMatrixAt(k, tmpM);
  });
  trunks.castShadow = crowns.castShadow = high; group.add(trunks, crowns);

  // ---------- overhead signs / gantries / landmarks
  const gantries = [];
  const addGantry = (i, lines, opt = {}) => {
    i = Math.max(1, Math.min(n - 2, i));
    const x = track.P[i * 3], y = track.P[i * 3 + 1] + .06, z = track.P[i * 3 + 2], nx = track.N[i * 2], nz = track.N[i * 2 + 1], ang = Math.atan2(nx, nz) - Math.PI / 2;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ang;
    const span0 = opt.full ? R.L : R.ourL - .4, span1 = R.R + .2, w = span1 - span0, mid = (span0 + span1) / 2;
    const postGeo = new THREE.BoxGeometry(.4, 7.2, .4); keep(postGeo);
    for (const o of [span0, span1]) { const p = new THREE.Mesh(postGeo, opt.postMat || mMetal); p.position.set(o, 3.6, 0); p.castShadow = high; g.add(p); }
    const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(w, .5, .5)), opt.postMat || mMetal); beam.position.set(mid, 6.9, 0); g.add(beam);
    const st = keep(TX.signTexture(lines, opt.sign || {}));
    const sw = opt.signW || Math.min(w - 1, 12), sh = opt.signH || sw * (opt.sign && opt.sign.h ? opt.sign.h / (opt.sign.w || 1024) : .25);
    const board = new THREE.Mesh(keep(new THREE.PlaneGeometry(sw, sh)), keep(new THREE.MeshStandardMaterial({ map: st, roughness: .6, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: .05 })));
    board.position.set(opt.signX ?? 0, 6.9 + sh / 2 - .1, .3); g.add(board);
    const back = new THREE.Mesh(keep(new THREE.PlaneGeometry(sw, sh)), mMetal); back.position.copy(board.position); back.position.z = .26; back.rotation.y = Math.PI; g.add(back);
    group.add(g); gantries.push(g); return g;
  };
  addGantry(15, ['START'], { sign: { bg: '#00a859', checker: true }, full: false });
  addGantry(n - 16, ['FINISH'], { sign: { bg: '#111111', checker: true } });
  const nm = route.names || [];
  nm.forEach(([i, name], k) => { if (i > 40 && i < n - 60) addGantry(i - 20, [name.toUpperCase()], { sign: { bg: '#0b6e3a' }, signX: 1.5 }); });
  if (route.id === 'bridge') { addGantry(60, ['THIRD MAINLAND BRIDGE', 'LAGOS ISLAND  ·  IKOYI  ·  V.I.  →'], { sign: { bg: '#0b6e3a', h: 300 }, signW: 10, signH: 3 }); addGantry(Math.floor(n * .55), ['ADENIJI ADELE  ·  OBALENDE  →'], { sign: { bg: '#0b6e3a' }, signX: 1.5 }); }
  if (route.id === 'lekki') {
    // Lekki Toll Plaza canopy across the road near the finish
    const i = n - 40, x = track.P[i * 3], y = track.P[i * 3 + 1] + .06, z = track.P[i * 3 + 2], nx = track.N[i * 2], nz = track.N[i * 2 + 1];
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(nx, nz) - Math.PI / 2;
    const mWhite = keep(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .5 })), mBlue = keep(new THREE.MeshStandardMaterial({ color: 0x0d47a1, roughness: .5 })), mRed = keep(new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: .5 }));
    const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(30, 1.4, 14)), mWhite); roof.position.set((R.L + R.R) / 2, 7.4, 0); roof.castShadow = high; g.add(roof);
    const band = new THREE.Mesh(keep(new THREE.BoxGeometry(30.2, .5, 14.2)), mRed); band.position.set((R.L + R.R) / 2, 6.6, 0); g.add(band);
    const st = keep(TX.signTexture(['LEKKI TOLL PLAZA'], { bg: '#0d47a1', w: 1024, h: 160, border: false }));
    for (const zf of [7.15, -7.15]) { const s = new THREE.Mesh(keep(new THREE.PlaneGeometry(16, 2.5)), keep(new THREE.MeshStandardMaterial({ map: st, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: .2 }))); s.position.set((R.L + R.R) / 2, 7.4, zf); if (zf < 0) s.rotation.y = Math.PI; g.add(s); }
    const boothGeo = keep(new THREE.BoxGeometry(1.4, 2.6, 4));
    for (const o of [-16.4, -12.8, -9.2, -3.6, 0, 3.6].map(v => v + 1.8).concat([R.ourL + .2])) { if (Math.abs(o - (-6.4)) < 1.2) continue; const b = new THREE.Mesh(boothGeo, mBlue); b.position.set(o, 1.3, 0); b.castShadow = high; g.add(b); const p = new THREE.Mesh(postGeoFor(keep), mWhite); p.position.set(o, 4.4, 0); g.add(p); }
    group.add(g); gantries.push(g);
  }
  onProgress && onProgress(.9);

  function postGeoFor(k) { const g = new THREE.CylinderGeometry(.25, .25, 4.2, 8); k(g); return g; }

  // ---------- per-frame update: chunk visibility, sun follows the player, water ripples
  const ahead = high ? 520 : 330;
  function update(i, pos, dt) {
    for (const c of chunks) { const { a, b } = c.userData; c.visible = b > i - 40 && a < i + ahead; }
    sun.position.set(pos.x + sunDir.x * 300, pos.y + sunDir.y * 300, pos.z + sunDir.z * 300); sun.target.position.set(pos.x, pos.y, pos.z);
    water.position.x = pos.x; water.position.z = pos.z; // keep the huge water plane centred (texture is world-tiled)
    wn.offset.x = (pos.x / WTILE) % 1 + G_wave.t * .03; wn.offset.y = (-pos.z / WTILE) % 1 + G_wave.t * .02;
    G_wave.t += dt;
  }
  const G_wave = { t: 0 };
  function dispose() { scene.remove(group); group.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); disposables.forEach(d => d.dispose && d.dispose()); pmrem.dispose(); scene.environment = null; scene.fog = null; }
  onProgress && onProgress(1);
  return { group, update, dispose, landAt, sunDir, env };
}
