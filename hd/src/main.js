// Naija Road Rush HD — stage 1: Lagos on real roads.
import * as THREE from 'three';
import { Track, buildWorld } from './world.js';
import { CARS, buildCar, buildGlbCar, preloadGlb, trafficModels, TRAFFIC_MIX, TRAFFIC_SPEED } from './vehicles.js';
import { AudioSys } from './audio.js';
import { ROAD } from './textures.js';
import { createPost, Particles, SkidMarks, rampMesh } from './fx.js';
import { Account } from './account.js';
import { THEMES, CITY_ORDER } from './themes.js';

const $ = id => document.getElementById(id);
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const Plug = (window.Capacitor && window.Capacitor.Plugins) || {};
const SPEED_SCALE = 1.5;   // world moves 1.5x the displayed speed (arcade feel on real-scale roads)
const KMH = 3.6 / SPEED_SCALE;

// ---------------------------------------------------------------- save data (local for now; Google cloud saves come in stage 2)
const SAVE_KEY = 'nrrHD.v1';
const DEF = { coins: 1000, owned: ['corona'], car: 'corona', colors: {}, best: {}, settings: { tilt: true, sens: 1, autoGas: false, music: true, sfx: true, quality: 'high', cam: 0 } };
let save = (() => { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); if (d) return { ...DEF, ...d, settings: { ...DEF.settings, ...(d.settings || {}) } }; } catch (e) { } return JSON.parse(JSON.stringify(DEF)); })();
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } try { Account.queueSave(save); } catch (e) { } };
AudioSys.settings = save.settings;

// ---------------------------------------------------------------- renderer
const canvas = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 30000);
let post = null;
const sparks = new Particles(scene, 500, true), smoke = new Particles(scene, 400, false), flames = new Particles(scene, 300, true);
const skids = new SkidMarks(scene, 700);
const RAMP = rampMesh();
function resize() {
  const hi = save.settings.quality === 'high';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hi ? 1.6 : 1));
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.shadowMap.enabled = hi;
  if (hi && !post) post = createPost(renderer, scene, camera);
  if (post) post.setSize(innerWidth, innerHeight, renderer.getPixelRatio());
  for (const pt of [sparks, smoke, flames]) pt.setScale(innerHeight * renderer.getPixelRatio());
}
addEventListener('resize', resize); resize();
// if the phone's GPU drops the WebGL context (low memory), recover by reloading the game
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); setTimeout(() => location.reload(), 600); });

// ---------------------------------------------------------------- data
let INDEX = null, CITY = null; const CITY_DATA = {}, groundImgs = {};
async function loadIndex() { INDEX = await (await fetch('tracks/index.json')).json(); }
async function loadCity(id) {
  const prog = p => { $('loadFill').style.width = (p * 100).toFixed(0) + '%'; };
  if (!CITY_DATA[id]) {
    prog(.1); const data = await (await fetch(`tracks/${id}.json`)).json(); prog(.4);
    await Promise.all(data.routes.map(r => new Promise((res, rej) => { const im = new Image(); im.onload = () => { groundImgs[id + '/' + r.id] = im; res(); }; im.onerror = rej; im.src = 'tracks/' + r.ground.img; })));
    CITY_DATA[id] = data;
  }
  CITY = CITY_DATA[id]; CITY.id = id; prog(.6); return CITY;
}

// ---------------------------------------------------------------- input (buttons, keyboard, tilt)
const Input = { left: 0, right: 0, gas: 0, brake: 0, nitro: 0, keys: {}, tiltRaw: 0, tiltNeutral: 0, tiltSeen: false, tiltAsked: false,
  steer() { let s = 0; if (this.left || this.keys.left) s -= 1; if (this.right || this.keys.right) s += 1; if (s) return s;
    if (save.settings.tilt && this.tiltSeen) { let v = (this.tiltRaw - this.tiltNeutral) / (24 / save.settings.sens); if (Math.abs(v) < .05) v = 0; return Math.max(-1, Math.min(1, v)); } return 0; },
  isGas() { return this.gas || this.keys.gas; }, isBrake() { return this.brake || this.keys.brake; }, isNitro() { return this.nitro || this.keys.nitro; } };
const angle = () => (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0);
addEventListener('deviceorientation', e => { if (e.beta == null) return; const a = angle(); let v = a === 90 ? e.beta : (a === -90 || a === 270) ? -e.beta : a === 180 ? -e.gamma : e.gamma; if (typeof v === 'number' && !isNaN(v)) { Input.tiltRaw = v; Input.tiltSeen = true; } });
function requestTilt() { if (Input.tiltAsked || !save.settings.tilt) return; Input.tiltAsked = true; try { const D = window.DeviceOrientationEvent; if (D && typeof D.requestPermission === 'function') D.requestPermission().catch(() => { }); } catch (e) { } }
document.querySelectorAll('#controls .cbtn').forEach(el => {
  const k = el.dataset.k;
  el.addEventListener('pointerdown', e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) { } el.classList.add('on'); if (k === 'horn') { AudioSys.horn(); return; } Input[k] = 1; });
  const up = () => { el.classList.remove('on'); if (k !== 'horn') Input[k] = 0; };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, up)); el.addEventListener('contextmenu', e => e.preventDefault());
});
const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', Space: 'nitro' };
addEventListener('keydown', e => { const k = KEYS[e.code]; if (k) { Input.keys[k] = true; e.preventDefault(); } if (e.code === 'KeyH') AudioSys.horn(); if (e.code === 'KeyC') cycleCam(); if (e.code === 'Escape' || e.code === 'KeyP') { if (G.state === 'race') pause(); else if (G.state === 'paused') resume(); } });
addEventListener('keyup', e => { const k = KEYS[e.code]; if (k) Input.keys[k] = false; });
document.addEventListener('touchmove', e => { if (!e.target.closest('.screen')) e.preventDefault(); }, { passive: false });
document.addEventListener('pointerdown', () => AudioSys.unlock(), { passive: true });
addEventListener('blur', () => { Object.assign(Input, { left: 0, right: 0, gas: 0, brake: 0, nitro: 0 }); Input.keys = {}; if (G.state === 'race') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G.state === 'race') pause(); AudioSys.ctx && AudioSys.ctx.suspend().catch(() => { }); } else AudioSys.ctx && AudioSys.ctx.resume().catch(() => { }); });

// ---------------------------------------------------------------- UI helpers
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden')); if (id) $(id).classList.remove('hidden'); }
function wallet() { document.querySelectorAll('.wv').forEach(e => e.textContent = save.coins.toLocaleString()); }
function toast(t, cls, key) { const now = performance.now(); if (key) { if (G.lastToast[key] && now - G.lastToast[key] < 1400) return; G.lastToast[key] = now; } const b = $('toasts'); if (b.children.length > 3) b.firstChild.remove(); const d = document.createElement('div'); d.className = 'toast ' + (cls || ''); d.textContent = t; b.appendChild(d); setTimeout(() => d.remove(), 1750); }
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
function vibrate(ms) { try { if (NATIVE && Plug.Haptics) { Plug.Haptics.impact({ style: ms >= 100 ? 'HEAVY' : 'MEDIUM' }); return; } navigator.vibrate && navigator.vibrate(ms); } catch (e) { } }

// ---------------------------------------------------------------- game state
const G = { state: 'loading', route: null, track: null, world: null, player: null, rivals: [], traffic: [], opp: [], coins: null, nitroPk: null,
  t: 0, raceTime: 0, cd: 0, shake: 0, lastToast: {}, camMode: save.settings.cam || 0, coinsRun: 0, nitro: .5, nitroOn: false, finished: false, place: 0, resultsShown: false, menuT: 0 };
let TM = null; // traffic models
const trafficMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .25 });
const F = {}; const F2 = {};

async function makeCar(spec, color) { if (spec.glb) { try { return await buildGlbCar(spec); } catch (e) { console.warn('GLB failed, using built-in model', e); } } return buildCar(spec, color); }
function shine(model) {
  model.group.traverse(o => { if (!o.isMesh) return; const m = o.material; if (model.glb && m.map) { m.envMap = G.world.env; m.envMapIntensity = 1.0; return; } if (m === model.paint) { m.envMap = G.world.env; m.envMapIntensity = 1.15; } else if (m.metalness > .8) { m.envMap = G.world.env; m.envMapIntensity = 1.5; } });
}
function carStats(id) { const c = CARS.find(x => x.id === id) || CARS[0]; return c; }
function place(obj, s, x, yaw = 0, roll = 0, reverse = false) {
  const f = G.track.frame(s, F2);
  obj.position.set(f.x + f.nx * x, f.y + .06, f.z + f.nz * x);
  const dx = reverse ? -f.tx : f.tx, dz = reverse ? -f.tz : f.tz;
  obj.rotation.order = 'YXZ'; obj.rotation.y = Math.atan2(-dx, -dz) + yaw; obj.rotation.x = Math.atan(f.slope) * (reverse ? -1 : 1); obj.rotation.z = roll;
  return f;
}

function clearRace() {
  if (G.world) { G.world.dispose(); G.world = null; }
  for (const o of [G.player && G.player.model.group, ...G.rivals.map(r => r.model.group), ...G.traffic.map(t => t.mesh), ...G.opp.map(t => t.mesh), G.coins, G.nitroPk]) if (o) scene.remove(o);
  G.player = null; G.rivals = []; G.traffic = []; G.opp = [];
  if (G.ramps) { G.ramps.forEach(r => scene.remove(r.mesh)); } G.ramps = [];
  sparks.clear(); smoke.clear(); flames.clear(); skids.clear();
}

async function setupRoute(cityId, routeId, forMenu) {
  G.state = 'loading'; clearRace();
  await loadCity(cityId);
  const route = CITY.routes.find(r => r.id === routeId), theme = THEMES[cityId] || THEMES.lagos;
  G.city = cityId; G.theme = theme; G.route = route; G.track = new Track(route);
  renderer.toneMappingExposure = theme.exposure;
  G.world = buildWorld({ scene, renderer, track: G.track, route, theme, groundImg: groundImgs[cityId + '/' + routeId], quality: save.settings.quality, onProgress: p => { $('loadFill').style.width = (60 + p * 40).toFixed(0) + '%'; } });
  if (!TM) TM = trafficModels();
  spawnTraffic(forMenu ? 26 : 40, forMenu ? 18 : 26);
}

const RIVAL_INFO = [{ name: 'Tunde', car: 'lagoon', color: '#d32f2f' }, { name: 'Chioma', car: 'aso', color: '#8e24aa' }, { name: 'Musa', car: 'mercer', color: '#fb8c00' }, { name: 'Ngozi', car: 'spirit', color: '#00acc1' }, { name: 'Emeka', car: 'corona', color: '#43a047' }];
const LANES = [-3.6, 0, 3.6], OPP_LANES = [-9.2, -12.8, -16.4];

function spawnTraffic(nSame, nOpp) {
  const mix = G.theme.traffic, keys = Object.keys(mix), tot = keys.reduce((a, k) => a + mix[k], 0);
  const pickType = () => { let r = Math.random() * tot; for (const k of keys) { r -= mix[k]; if (r <= 0) return k; } return 'car'; };
  const mk = (opp) => { const type = pickType(), m = TM[type][Math.floor(Math.random() * TM[type].length)], mesh = new THREE.Mesh(m.geo, trafficMat); mesh.castShadow = save.settings.quality === 'high'; scene.add(mesh); const sp = TRAFFIC_SPEED[type];
    return { type, mesh, len: m.len, wid: m.wid, lane: Math.floor(Math.random() * 3), x: 0, s: 0, v: (sp[0] + Math.random() * (sp[1] - sp[0])) / KMH, phase: Math.random() * 6, opp }; };
  const L = G.track.length;
  for (let i = 0; i < nSame; i++) { const t = mk(false); t.s = 250 + Math.random() * (L - 400); t.x = LANES[t.lane]; if (t.type === 'brt' || t.type === 'tanker') { t.lane = 2; t.x = LANES[2]; } G.traffic.push(t); }
  for (let i = 0; i < nOpp; i++) { const t = mk(true); t.s = Math.random() * L; t.x = OPP_LANES[t.lane]; G.opp.push(t); }
}

function startRace(cityId, routeId) {
  const meta = INDEX[cityId].routes.find(r => r.id === routeId);
  show(null); $('loading').classList.remove('hidden'); $('loadTxt').textContent = 'Building ' + INDEX[cityId].name + ': ' + meta.name + '…'; $('loadFill').style.width = '10%';
  setTimeout(async () => {
    await setupRoute(cityId, routeId, false);
    const T = G.track;
    // player
    const spec = carStats(save.car), color = save.colors[spec.id] || spec.color;
    const model = await makeCar(spec, color); scene.add(model.group); shine(model);
    G.player = { spec, model, s: 40, x: 1.8, v: 0, xv: 0, steerVis: 0, maxKmh: spec.top, len: model.len, wid: model.wid, y: 0, vy: 0, air: false, roll: 0, rollV: 0, drift: 0, driftT: 0, yaw: 0 };
    // rivals on the grid ahead/beside
    const grid = [[64, -1.8], [64, 1.8], [52, -1.8], [52, 1.8], [40, -1.8]];
    const rivalModels = await Promise.all(RIVAL_INFO.map(ri => makeCar(carStats(ri.car), ri.color)));
    G.rivals = RIVAL_INFO.map((ri, k) => { const s = carStats(ri.car), m = rivalModels[k]; scene.add(m.group); shine(m);
      return { name: ri.name, color: ri.color, model: m, s: grid[k][0], x: grid[k][1], lane: grid[k][1] < 0 ? 0 : 2, v: 0, max: (spec.top * (0.9 + k * 0.012) + Math.random() * 6) / KMH, react: .2 + Math.random() * .6, len: m.len, wid: m.wid, finished: false, finishT: 0, wreck: 0, wy: 0, wvy: 0, spin: 0 }; });
    G.rivals.forEach(r => { r.x = r.lane === 0 ? -1.8 : 1.8; });
    buildPickups(); buildRamps();
    Object.assign(G, { raceTime: 0, coinsRun: 0, nitro: .5, nitroOn: false, finished: false, place: 0, resultsShown: false, lastToast: {}, shake: 0, timeScale: 1, slowT: 0, takedowns: 0 });
    $('loading').classList.add('hidden');
    $('hud').classList.remove('hidden'); $('controls').classList.remove('hidden');
    $('banner').innerHTML = `<h2>${G.theme.label.toUpperCase()}</h2><p>${G.route.name}</p><div class="sub">${G.route.start} → ${G.route.end} · ${(T.length / 1000).toFixed(1)} km of real road</div>`; $('banner').style.opacity = 1;
    G.state = 'countdown'; G.cd = 3.6; G.cdShown = -1;
    if (save.settings.tilt && Input.tiltSeen && Math.abs(Input.tiltRaw) < 30) Input.tiltNeutral = Input.tiltRaw;
    AudioSys.stop(); AudioSys.play(G.theme.music, true);
    resetCam();
  }, 30);
}
const CITY_MUSIC = { bpm: 112, root: 45, prog: [0, 8, 3, 10] };

// coins + nitro pickups (instanced)
function buildPickups() {
  const T = G.track, coins = [], nitros = [];
  for (let s = 180; s < T.length - 150; s += 90 + Math.random() * 110) {
    if (Math.random() < .2) { nitros.push({ s, x: LANES[Math.floor(Math.random() * 3)], got: false }); continue; }
    const lane = LANES[Math.floor(Math.random() * 3)]; for (let k = 0; k < 6; k++) coins.push({ s: s + k * 7, x: lane, got: false });
  }
  const cg = new THREE.CylinderGeometry(.42, .42, .1, 20); cg.rotateZ(Math.PI / 2);
  const cm = new THREE.MeshStandardMaterial({ color: 0xffc107, metalness: .9, roughness: .25, emissive: 0x5a3c00, emissiveIntensity: .6 });
  G.coins = new THREE.InstancedMesh(cg, cm, coins.length); G.coins.userData.list = coins; scene.add(G.coins);
  const ng = new THREE.CapsuleGeometry(.32, .6, 4, 10), nm = new THREE.MeshStandardMaterial({ color: 0x1e88e5, emissive: 0x0d47a1, emissiveIntensity: .9, metalness: .4, roughness: .3 });
  G.nitroPk = new THREE.InstancedMesh(ng, nm, Math.max(1, nitros.length)); G.nitroPk.userData.list = nitros; scene.add(G.nitroPk);
}
function buildRamps() {
  const T = G.track; G.ramps = [];
  // a few ramps on land stretches, right or middle lane
  for (let s = 700; s < T.length - 500; s += 900 + Math.random() * 700) {
    let k = s; while (k < T.length - 400 && T.bridge[T.idx(k)]) k += 50; if (k >= T.length - 400) break;
    const lane = Math.random() < .5 ? 2 : 1, mesh = new THREE.Mesh(RAMP.geo, RAMP.mat); mesh.castShadow = true; scene.add(mesh);
    const r = { s: k, x: LANES[lane], mesh }; place(mesh, k, r.x); mesh.position.y -= .04; G.ramps.push(r); s = k;
  }
}
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
function updatePickups() {
  const T = G.track, ps = G.player.s, spin = G.t * 3;
  for (const [mesh, h] of [[G.coins, 1.0], [G.nitroPk, 1.1]]) {
    const list = mesh.userData.list;
    list.forEach((c, k) => {
      if (c.got || Math.abs(c.s - ps) > 900) { tmpS.set(0, 0, 0); tmpM.compose(tmpP.set(0, -100, 0), tmpQ.identity(), tmpS); mesh.setMatrixAt(k, tmpM); return; }
      const f = T.frame(c.s, F2); tmpP.set(f.x + f.nx * c.x, f.y + h + Math.sin(G.t * 4 + k) * .12, f.z + f.nz * c.x);
      tmpQ.setFromEuler(tmpE.set(0, spin + k, mesh === G.nitroPk ? Math.PI / 2 : 0)); tmpS.set(1, 1, 1); tmpM.compose(tmpP, tmpQ, tmpS); mesh.setMatrixAt(k, tmpM);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- physics
function update(dt) {
  G.t += dt; if (!G.world) return; const P = G.player, T = G.track;
  if (G.state === 'menu') { menuCamera(dt); moveTraffic(dt, null); G.world.update(T.idx(G.menuS), camera.position, dt); return; }
  if (!P) return;
  const racing = G.state === 'race';
  let steer = 0, gas = 0, brake = 0, nos = 0;
  if (racing) { steer = Input.steer(); brake = Input.isBrake() ? 1 : 0; gas = (Input.isGas() || (save.settings.autoGas && !brake)) ? 1 : 0; nos = Input.isNitro() ? 1 : 0; }
  else if (G.state === 'finished') { gas = P.v * KMH < 120 ? 1 : 0; steer = Math.max(-1, Math.min(1, (1.8 - P.x) * .5)); }
  P.steerVis += (steer - P.steerVis) * Math.min(1, dt * 8);
  const kmh0 = P.v * KMH;
  // drift: tap BRAKE while steering at speed; hold the steer to keep sliding (fills nitro)
  if (racing && !P.air) {
    if (!P.drift && brake && Math.abs(steer) > .3 && kmh0 > 75) { P.drift = Math.sign(steer); P.driftT = 0; AudioSys.thud(); }
    if (P.drift && (Math.abs(steer) < .15 || Math.sign(steer) !== P.drift || kmh0 < 50)) { if (P.driftT > 1) { const b = Math.round(P.driftT * 20); G.coinsRun += b; toast(`DRIFT ${P.driftT.toFixed(1)}s  +₦${b}`, 'gold'); } P.drift = 0; skids.lift(); }
    if (P.drift) { brake = 0; P.driftT += dt; G.nitro = Math.min(1, G.nitro + dt * .14); P.v *= 1 - dt * .05; }
  } else if (P.drift) { P.drift = 0; skids.lift(); }
  const f = T.frame(P.s, F);
  const vmax = (P.maxKmh * (G.nitroOn ? 1.25 : 1)) / KMH, kmh = P.v * KMH;
  // nitro
  if (racing && nos && G.nitro > 0) { if (!G.nitroOn) { AudioSys.nitro(); toast('NITRO!', 'blue', 'n'); } G.nitroOn = true; G.nitro = Math.max(0, G.nitro - dt / (3.2 * P.spec.nos)); } else G.nitroOn = false;
  const accel = (34 * P.spec.acc) * (1 - Math.pow(Math.min(1, P.v / vmax), 2)) * (G.nitroOn ? 1.8 : 1); // km/h per second
  if (gas) P.v += accel / KMH * dt; else if (brake) P.v -= 40 * dt; else P.v -= (4 + P.v * .02) * dt;
  if (P.v > vmax) P.v = Math.max(vmax, P.v - 25 * dt);
  P.v = Math.max(0, P.v);
  // steering + centrifugal push
  const lat = P.steerVis * Math.min(9.5, 3 + kmh / 38) * P.spec.grip * (P.drift ? 1.35 : 1) * (P.air ? .25 : 1);
  const push = -f.curv * P.v * P.v * .055 / P.spec.grip;
  P.xv = lat + push; P.x += P.xv * dt;
  // barriers
  const minX = ROAD.ourL + P.wid / 2 + .15, maxX = ROAD.R - P.wid / 2 - .1;
  if (P.x < minX || P.x > maxX) { const side = P.x < minX ? -1 : 1; P.x = Math.max(minX, Math.min(maxX, P.x)); if (kmh > 40) { P.v *= 1 - dt * 1.4; G.shake = Math.max(G.shake, .25); if (Math.random() < .15) AudioSys.thud(); spark(P, side); } }
  P.s += P.v * dt;
  // ramps & air time
  let ground = 0;
  for (const r of G.ramps) { if (Math.abs(P.x - r.x) < 1.9 && P.s > r.s && P.s < r.s + RAMP.L) ground = Math.max(ground, RAMP.H * (P.s - r.s) / RAMP.L); }
  if (!P.air && ground > 0) { P.y = ground; P.onRamp = true; }
  else if (!P.air && P.onRamp && ground === 0) { P.onRamp = false; P.air = true; P.vy = Math.min(14, P.v * (RAMP.H / RAMP.L) * .85 + 2); P.rollV = G.nitroOn ? Math.PI * 2 / Math.max(.6, 2 * P.vy / 22) * (P.x < 0 ? -1 : 1) : 0; P.roll = 0; AudioSys.nitro(); if (P.rollV) toast('BARREL ROLL!', 'gold'); else toast('BIG AIR!', 'gold', 'air'); }
  if (P.air) { P.vy -= 22 * dt; P.y += P.vy * dt; P.roll += P.rollV * dt;
    if (P.y <= 0) { P.y = 0; P.air = false; P.vy = 0; const rolled = Math.abs(P.roll) > 5; P.roll = 0; P.rollV = 0; G.shake = .5; AudioSys.thud(); vibrate(60); landDust(P); G.coinsRun += rolled ? 80 : 30; G.nitro = Math.min(1, G.nitro + (rolled ? .3 : .12)); toast(rolled ? '+₦80 · +NITRO' : '+₦30', 'good'); } }
  else if (!P.onRamp) P.y = 0;  // traffic & rivals
  moveTraffic(dt, P);
  updateRivals(dt);
  collide(P);
  // pickups
  for (const c of G.coins.userData.list) if (!c.got && Math.abs(c.s - P.s) < 2.2 && Math.abs(c.x - P.x) < 1.5) { c.got = true; G.coinsRun += 10; AudioSys.coin(); }
  for (const c of G.nitroPk.userData.list) if (!c.got && Math.abs(c.s - P.s) < 2.5 && Math.abs(c.x - P.x) < 1.6) { c.got = true; G.nitro = Math.min(1, G.nitro + .4); AudioSys.chime(); toast('+NITRO', 'blue'); }
  updatePickups();
  // road name banner
  const nm = (G.route.names || []).filter(([i]) => i <= f.i).pop(); const name = nm ? nm[1] : G.route.name;
  if (name !== G.roadName) { G.roadName = name; const el = $('roadName'); el.textContent = name.toUpperCase(); el.style.opacity = 1; clearTimeout(G.rnT); G.rnT = setTimeout(() => el.style.opacity = 0, 3500); }
  // finish
  if (racing) { G.raceTime += dt; if (P.s >= T.length - 64) finish(); }
  if (G.state === 'finished') { G.finT += dt; if (G.finT > 2.4 && !G.resultsShown) { G.resultsShown = true; results(); } }
  // place models
  P.yaw += ((P.drift ? P.drift * .42 + P.steerVis * .12 : P.steerVis * .06) - P.yaw) * Math.min(1, dt * 6);
  placeCar(P, P.yaw, -P.steerVis * .025 * Math.min(1, kmh / 120) + P.roll);
  if (P.y) { P.model.group.position.y += P.y; if (P.onRamp) P.model.group.rotation.x += Math.atan(RAMP.H / RAMP.L); else if (P.air) P.model.group.rotation.x += Math.max(-.25, Math.min(.2, P.vy * .015)); }
  carFx(P, dt, racing);
  P.model.setBrake(brake && P.v > 1);
  for (const r of G.rivals) { placeCar(r, (r.xv || 0) * .015 + (r.wreck > 0 ? r.spin : 0), r.wreck > 0 ? r.spin * .7 : 0); if (r.wreck > 0) r.model.group.position.y += r.wy; }
  sparks.update(dt); smoke.update(dt); flames.update(dt);
  if (G.slowT > 0) { G.slowT -= dt / Math.max(.2, G.timeScale); if (G.slowT <= 0) G.timeScale = 1; }
  G.world.update(T.idx(P.s), P.model.group.position, dt);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 1.6);
  AudioSys.setEngine(true, Math.min(1.2, P.v / (P.maxKmh / KMH)), G.nitroOn);
  updateCamera(dt);
}
function placeCar(c, yaw, roll) { place(c.model.group, c.s, c.x, yaw, roll); const rot = c.v * 0.016 / .35; for (const w of c.model.wheels) w.rotation.x -= rot; }
const FX = {};
function carPos(c, side = 0, back = 0, up = .4) { const f = G.track.frame(c.s - back, FX); return [f.x + f.nx * (c.x + side), f.y + up + (c.y || 0), f.z + f.nz * (c.x + side), f]; }
function spark(c, side) {
  const [x, y, z, f] = carPos(c, side * (c.wid / 2), 0, .4);
  for (let i = 0; i < 6; i++) sparks.spawn(x, y, z, f.tx * c.v * .6 + (Math.random() - .5) * 6 - side * f.nx * 3, 2 + Math.random() * 4, f.tz * c.v * .6 + (Math.random() - .5) * 6 - side * f.nz * 3, .35 + Math.random() * .3, .12, 0, 1, .75, .25, 1.5, 14);
}
function landDust(c) { for (let i = 0; i < 18; i++) { const [x, y, z] = carPos(c, (Math.random() - .5) * 2, Math.random() * 3, .2); smoke.spawn(x, y, z, (Math.random() - .5) * 5, Math.random() * 2, (Math.random() - .5) * 5, 1.2, .6, 2.2, .75, .72, .68, 2, 0); } }
function carFx(P, dt, racing) {
  const f = G.track.frame(P.s, FX);
  // nitro flames from twin exhausts
  if (G.nitroOn) for (const sx of [-.35, .35]) { const bx = f.x + f.nx * (P.x + sx) - f.tx * (P.len / 2), bz = f.z + f.nz * (P.x + sx) - f.tz * (P.len / 2), by = f.y + .38 + P.y;
    for (let k = 0; k < 2; k++) flames.spawn(bx, by, bz, -f.tx * 18 + (Math.random() - .5) * 2 + f.tx * P.v, (Math.random() - .5) * 1.5, -f.tz * 18 + (Math.random() - .5) * 2 + f.tz * P.v, .12 + Math.random() * .08, .35, -.25, .45, .7, 1, 4, 0); }
  // drift smoke + skid marks
  if (P.drift && !P.air) {
    for (const [k, sx] of [[0, -P.wid / 2 + .2], [1, P.wid / 2 - .2]]) {
      const bx = f.x + f.nx * (P.x + sx) - f.tx * (P.len * .32), bz = f.z + f.nz * (P.x + sx) - f.tz * (P.len * .32);
      skids.add(k, bx, f.y, bz, f.nx, f.nz);
      if (Math.random() < .7) smoke.spawn(bx, f.y + .3, bz, f.tx * P.v * .5 + (Math.random() - .5) * 3, .6 + Math.random(), f.tz * P.v * .5 + (Math.random() - .5) * 3, 1.1 + Math.random() * .6, .5, 2.6, .82, .82, .84, 1.8, -.4);
    }
    screech(true);
  } else screech(false);
}
let screechNode = null;
function screech(on) {
  const A = AudioSys; if (!A.ctx || !save.settings.sfx) return;
  if (on && !screechNode) { const c = A.ctx, s = c.createBufferSource(); s.buffer = A.noise; s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 6; const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(A.sfx); s.start(); g.gain.setTargetAtTime(.35, c.currentTime, .05); screechNode = { s, g }; }
  else if (!on && screechNode) { const n = screechNode; screechNode = null; n.g.gain.setTargetAtTime(0, A.ctx.currentTime, .06); setTimeout(() => { try { n.s.stop(); } catch (e) { } }, 300); }
}
function slowMo(sec) { G.timeScale = .35; G.slowT = sec; }

function moveTraffic(dt, P) {
  const L = G.track.length, ps = P ? P.s : G.menuS;
  for (const t of G.traffic) {
    // simple following: slow down behind slower vehicle in the same lane
    t.s += t.v * dt;
    if (t.knock > 0) { t.knock -= dt; t.x += t.kx * dt; t.kx *= 1 - dt * 1.5; t.kyaw += t.kspin * dt; t.v *= 1 - dt * .8; if (t.knock <= 0) { t.s = -9999; t.kyaw = 0; } }
    else {
      if (G.ramps) for (const r of G.ramps) if (Math.abs(LANES[t.lane] - r.x) < 1 && r.s - t.s > 0 && r.s - t.s < 70) t.lane = t.lane === 1 ? 0 : 1;
      const lx = LANES[t.lane] + (t.type === 'okada' ? Math.sin(G.t * .8 + t.phase) * 1.1 : 0); t.x += (lx - t.x) * Math.min(1, dt * 1.6);
    }
    if (t.s < ps - 160 || t.s > L - 30) { t.knock = 0; t.kyaw = 0; t.s = Math.min(L - 60, ps + 500 + Math.random() * 900); if (t.s < ps + 300) t.s = ps + 300 + Math.random() * 300; t.lane = (t.type === 'brt' || t.type === 'tanker') ? 2 : Math.floor(Math.random() * 3); t.x = LANES[t.lane]; }
    t.mesh.visible = Math.abs(t.s - ps) < 1100;
    if (t.mesh.visible) place(t.mesh, t.s, t.x, t.kyaw || 0);
  }
  for (const t of G.opp) {
    t.s -= t.v * dt;
    if (t.s < ps - 120) t.s = Math.min(L - 10, ps + 600 + Math.random() * 900);
    t.mesh.visible = Math.abs(t.s - ps) < 1100;
    if (t.mesh.visible) place(t.mesh, t.s, t.x, 0, 0, true);
  }
}
function laneFree(s, laneX, range, self) {
  for (const t of G.traffic) if (Math.abs(t.x - laneX) < 2.2 && t.s > s - 6 && t.s < s + range) return false;
  for (const r of G.rivals) if (r !== self && Math.abs(r.x - laneX) < 2 && r.s > s - 6 && r.s < s + range * .5) return false;
  return true;
}
function takedown(r, dx) {
  r.wreck = 2.4; r.wvy = 7; r.wy = 0; r.spinV = (dx >= 0 ? 1 : -1) * (6 + Math.random() * 4); r.spin = 0; r.v *= .35;
  G.takedowns++; G.coinsRun += 100; G.nitro = Math.min(1, G.nitro + .3); P_shake(.8); AudioSys.crash(); vibrate(150); slowMo(.9);
  toast(`TAKEDOWN! ${r.name}  +₦100`, 'gold'); const [x, y, z] = carPos(r, 0, 0, .6); for (let i = 0; i < 26; i++) sparks.spawn(x, y, z, (Math.random() - .5) * 14, Math.random() * 9, (Math.random() - .5) * 14, .6, .15, 0, 1, .7, .2, 1, 14);
}
function knock(t, dx) {
  t.knock = 2.5; t.kx = (dx >= 0 ? 1 : -1) * (5 + Math.random() * 4); t.kspin = (dx >= 0 ? 1 : -1) * (3 + Math.random() * 3); t.kyaw = 0; t.v *= .6; G.player.v *= .93;
  G.coinsRun += 30; P_shake(.45); AudioSys.crash(); vibrate(80); toast('KNOCKDOWN +₦30', 'gold', 'kd');
}
function P_shake(v) { G.shake = Math.max(G.shake, v); }
function updateRivals(dt) {
  const P = G.player, racing = G.state === 'race' || G.state === 'finished';
  for (const r of G.rivals) {
    if (!racing) continue;
    if (r.react > 0) { r.react -= dt; continue; }
    if (r.wreck > 0) { r.wreck -= dt; r.wvy -= 22 * dt; r.wy = Math.max(0, r.wy + r.wvy * dt); r.spin += r.spinV * dt; r.v *= 1 - dt * 1.2; r.s += r.v * dt;
      if (r.wreck <= 0) { r.spin = 0; r.wy = 0; r.s = Math.max(r.s, G.player.s - 90); r.v = G.player.v * .8; r.lane = Math.floor(Math.random() * 3); r.x = LANES[r.lane]; } continue; }
    let target = r.max; const gap = r.s - P.s;
    if (!r.finished) { if (gap > 120) target *= .93; else if (gap < -150) target *= 1.08; } else target *= .5;
    target *= 1 - Math.min(.15, Math.abs(G.track.frame(r.s, F2).curv) * 18);
    // traffic ahead in my lane?
    let blocker = null; for (const t of G.traffic) if (Math.abs(t.x - r.x) < 2.2 && t.s > r.s && t.s - r.s < 45) { if (!blocker || t.s < blocker.s) blocker = t; }
    if (blocker) { const opts = [r.lane - 1, r.lane + 1].filter(l => l >= 0 && l < 3).sort(() => Math.random() - .5); const free = opts.find(l => laneFree(r.s, LANES[l], 50, r)); if (free !== undefined) r.lane = free; else if (blocker.s - r.s < 14) target = Math.min(target, blocker.v * .95); }
    r.v += (target - r.v) * Math.min(1, dt * .55);
    const tx = LANES[r.lane]; r.xv = (tx - r.x) * 2.2; r.x += r.xv * dt;
    r.s += r.v * dt;
    if (!r.finished && r.s >= G.track.length - 64) { r.finished = true; r.finishT = G.raceTime; }
  }
}
function collide(P) {
  const hit = (o, isRival) => {
    if (o.wreck > 0 || o.knock > 0 || P.air) return;
    const ds = o.s - P.s, dx = o.x - P.x;
    if (Math.abs(ds) < (o.len + P.len) / 2 * .92 && Math.abs(dx) < (o.wid + P.wid) / 2 * .86) {
      const rel = (P.v - o.v) * KMH;
      if (isRival && (rel > 22 || G.nitroOn) && G.state === 'race') { takedown(o, dx); return; }
      if (!isRival && G.nitroOn && o.type !== 'brt' && o.type !== 'tanker') { knock(o, dx); return; }
      if (ds > 0 && P.v > o.v) { const hard = (P.v - o.v) * KMH > 50; P.v = o.v * .85; P.s = o.s - (o.len + P.len) / 2 * .93; if (!G.crashCD || G.t - G.crashCD > .6) { G.crashCD = G.t; AudioSys.crash(); G.shake = hard ? .7 : .35; vibrate(hard ? 120 : 50); if (!isRival && Math.random() < .5) setTimeout(() => AudioSys.horn(), 160); } }
      else if (ds <= 0 && isRival && o.v > P.v) { o.v = P.v * .95; }
      else { const push = Math.sign(dx || 1) * .4; P.x -= push * .5; if (isRival) o.x += push * .5; }
    }
  };
  for (const t of G.traffic) if (Math.abs(t.s - P.s) < 14) hit(t, false);
  for (const r of G.rivals) if (Math.abs(r.s - P.s) < 8) hit(r, true);
}

// ---------------------------------------------------------------- camera
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tv = new THREE.Vector3();
const CAMS = [{ d: 7.2, h: 2.5, look: 9 }, { d: 11.5, h: 4.2, look: 14 }, { d: -.6, h: 1.15, look: 40 }];
function resetCam() { const P = G.player, f = G.track.frame(P.s, F); const c = CAMS[G.camMode]; camPos.set(f.x - f.tx * c.d, f.y + c.h, f.z - f.tz * c.d); camera.position.copy(camPos); }
function cycleCam() { G.camMode = (G.camMode + 1) % CAMS.length; save.settings.cam = G.camMode; persist(); }
function updateCamera(dt) {
  const P = G.player, c = CAMS[G.camMode], f = G.track.frame(P.s, F);
  const px = f.x + f.nx * P.x, pz = f.z + f.nz * P.x, py = f.y;
  const back = G.track.frame(P.s - Math.max(0, c.d), F2);
  tv.set(back.x + back.nx * P.x * .85, back.y + c.h, back.z + back.nz * P.x * .85);
  if (c.d < 0) tv.set(px + f.tx * -c.d, py + c.h, pz + f.tz * -c.d);
  camPos.lerp(tv, c.d < 0 ? 1 : Math.min(1, dt * (9 + P.v * .3)));
  const ahead = G.track.frame(P.s + c.look, F2);
  camLook.set(ahead.x + ahead.nx * P.x * .7, ahead.y + (c.d < 0 ? 1.0 : 1.1) + P.y * .6, ahead.z + ahead.nz * P.x * .7);
  camPos.y += (P.y * .8 - (camPos.userY || 0)); camPos.userY = P.y * .8;
  camera.position.copy(camPos);
  if (G.shake > 0) camera.position.add(tv.set((Math.random() - .5) * G.shake * .35, (Math.random() - .5) * G.shake * .25, 0));
  camera.lookAt(camLook);
  const kmh = P.v * KMH, fov = 60 + Math.min(14, kmh / 22) + (G.nitroOn ? 6 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
}
function menuCamera(dt) {
  // aerial fly-over along the route
  const T = G.track; G.menuS = (G.menuS + dt * 45) % (T.length - 200);
  const f = T.frame(G.menuS, F), a = G.t * .08;
  camera.position.set(f.x + Math.cos(a) * 140, f.y + 70 + Math.sin(G.t * .2) * 10, f.z + Math.sin(a) * 140);
  const g = T.frame(G.menuS + 120, F2); camera.lookAt(g.x, g.y, g.z);
  if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
}

// ---------------------------------------------------------------- HUD
let hudTick = 0;
function hud() {
  if (++hudTick % 3) return;
  const P = G.player; if (!P) return;
  $('hSpeed').textContent = Math.round(P.v * KMH);
  $('hCoins').textContent = G.coinsRun; $('hNitro').style.width = (G.nitro * 100).toFixed(0) + '%';
  $('hTime').textContent = fmt(G.raceTime);
  const togo = Math.max(0, G.track.length - 64 - P.s); $('hDist').textContent = (togo / 1000).toFixed(1) + ' km';
  const pos = 1 + G.rivals.filter(r => r.finished || r.s > P.s).length; $('hPos').textContent = pos + '/' + (G.rivals.length + 1);
  const L = G.track.length - 64; let h = ''; for (const r of G.rivals) h += `<div class="dot" style="left:${Math.min(100, r.s / L * 100).toFixed(1)}%;background:${r.color}"></div>`;
  h += `<div class="dot me" style="left:${Math.min(100, P.s / L * 100).toFixed(1)}%"></div>`; $('progress').innerHTML = h;
  if (save.settings.tilt && Input.tiltSeen) { $('tiltInd').classList.remove('hidden'); $('tiltInd').firstElementChild.style.left = (50 + Input.steer() * 45) + '%'; }
}

// ---------------------------------------------------------------- flow
function countdown(dt) {
  G.cd -= dt; const n = Math.ceil(G.cd - .6);
  if (n !== G.cdShown) { G.cdShown = n; const el = $('countdown');
    if (n >= 1 && n <= 3) { el.textContent = n; el.className = ''; AudioSys.beep(false); }
    else if (n <= 0) { el.textContent = 'GO!'; el.className = 'go'; AudioSys.beep(true); G.state = 'race'; setTimeout(() => { if (el.textContent === 'GO!') el.textContent = ''; }, 700); setTimeout(() => $('banner').style.opacity = 0, 500); } }
  // idle physics: keep things placed, rivals waiting
  moveTraffic(dt, G.player); placeCar(G.player, 0, 0); for (const r of G.rivals) placeCar(r, 0, 0); updatePickups(); G.world.update(G.track.idx(G.player.s), G.player.model.group.position, dt); updateCamera(dt);
  AudioSys.setEngine(true, .05, false);
}
function finish() {
  G.state = 'finished'; G.finT = 0; G.nitroOn = false;
  G.place = 1 + G.rivals.filter(r => r.finished).length;
  const el = $('countdown'); el.className = 'go'; el.textContent = ['', '1st!', '2nd', '3rd', '4th', '5th', '6th'][G.place];
  AudioSys.chime();
}
function results() {
  $('countdown').textContent = ''; $('hud').classList.add('hidden'); $('controls').classList.add('hidden');
  const prize = [0, 600, 360, 220, 80, 50, 30][G.place] || 30, total = prize + G.coinsRun;
  save.coins += total; const key = G.city + '/' + G.route.id; const best = save.best[key]; const nb = G.place === 1 && (!best || G.raceTime < best); if (nb) save.best[key] = G.raceTime; persist();
  $('rTitle').textContent = ['', '1st Place!', '2nd Place', '3rd Place', '4th Place', '5th Place', '6th Place'][G.place];
  $('rSub').textContent = `${G.route.name} · ${fmt(G.raceTime)}`;
  $('rLines').innerHTML = [['Finishing position', G.place + ' of 6'], ['Time', fmt(G.raceTime) + (nb ? ' (new best!)' : '')], ['Prize money', '₦' + prize], ['Coins collected', '₦' + G.coinsRun], ['Total earned', '₦' + total]].map(([a, b]) => `<div class="ln"><span>${a}</span><b>${b}</b></div>`).join('');
  const btns = $('rBtns'); btns.innerHTML = '';
  const add = (t, c, fn) => { const b = document.createElement('button'); b.className = 'mbtn ' + c; b.textContent = t; b.onclick = fn; btns.appendChild(b); };
  add('Race again', 'gold', () => startRace(G.city, G.route.id)); add('Other race', 'alt', () => { openRaces(); }); add('Garage', 'alt', () => openGarage()); add('Menu', 'alt', () => goMenu());
  show('sResults'); wallet();
}
function pause() { if (G.state !== 'race' && G.state !== 'countdown') return; G.prev = G.state; G.state = 'paused'; show('sPause'); AudioSys.setEngine(false, 0, false); }
function resume() { if (G.state !== 'paused') return; show(null); G.state = G.prev || 'race'; }
async function goMenu() {
  $('hud').classList.add('hidden'); $('controls').classList.add('hidden'); $('countdown').textContent = ''; $('banner').innerHTML = '';
  if (!G.world || G.player || G.route.id !== 'bridge') { await setupRoute('lagos', 'bridge', true); }
  G.menuS = 300; G.state = 'menu'; show('sMenu'); wallet();
  AudioSys.stop(); AudioSys.play({ bpm: 100, root: 45, prog: [0, 8, 3, 10] }, false);
}
let raceCity = 'lagos';
function openRaces() {
  show('sRaces'); wallet();
  const tabs = $('cityTabs'); tabs.innerHTML = '';
  CITY_ORDER.forEach(id => {
    const th = THEMES[id], ok = !!INDEX[id], b = document.createElement('button');
    b.className = 'ctab' + (id === raceCity ? ' on' : '') + (ok ? '' : ' soon'); b.innerHTML = `${th.label}${ok ? '' : '<small>soon</small>'}`;
    if (ok) b.onclick = () => { raceCity = id; openRaces(); }; tabs.appendChild(b);
  });
  const th = THEMES[raceCity]; $('raceCityTitle').textContent = th.label + ' · ' + th.slogan;
  const list = $('raceList'); list.innerHTML = '';
  INDEX[raceCity].routes.forEach(r => {
    const b = document.createElement('button'); b.className = 'race'; b.style.background = `linear-gradient(160deg, #${th.fog[0].toString(16).padStart(6, '0')}, #0b3d5c 65%, #0a2a1c)`;
    const best = save.best[raceCity + '/' + r.id];
    b.innerHTML = `${best ? `<span class="best">Best ${fmt(best)}</span>` : ''}<h4>${r.name}</h4><div class="d">${r.desc}</div><div class="m">${(r.length / 1000).toFixed(1)} km · ${r.start} → ${r.end}</div>`;
    b.onclick = () => { AudioSys.unlock(); requestTilt(); startRace(raceCity, r.id); }; list.appendChild(b);
  });
}

// ---------------------------------------------------------------- garage (3D turntable)
const gScene = new THREE.Scene(); let gCar = null, gIdx = 0, gEnv = null;
const gCam = new THREE.PerspectiveCamera(40, 1, .1, 200);
function setupGarageScene() {
  if (gEnv) return;
  const pm = new THREE.PMREMGenerator(renderer); import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => { gEnv = pm.fromScene(new RoomEnvironment(), .04).texture; gScene.environment = gEnv; });
  gScene.background = new THREE.Color(0x0d1a14);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: 0x1d2b25, roughness: .35, metalness: .3 })); floor.rotation.x = -Math.PI / 2; gScene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.35, 64), new THREE.MeshBasicMaterial({ color: 0x00c46a })); ring.rotation.x = -Math.PI / 2; ring.position.y = .01; gScene.add(ring);
  const l = new THREE.DirectionalLight(0xffffff, 2); l.position.set(4, 8, 3); gScene.add(l); gScene.add(new THREE.AmbientLight(0xffffff, .4));
}
function openGarage() { setupGarageScene(); gIdx = Math.max(0, CARS.findIndex(c => c.id === save.car)); G.state = 'garage'; show('sGarage'); renderGarage(); AudioSys.stop(); AudioSys.play({ bpm: 96, root: 43, prog: [0, 5, 8, 7] }, false); }
const PAINTS = ['#c62828', '#1e88e5', '#fdd835', '#00a859', '#fb8c00', '#8e24aa', '#f5f5f5', '#212121', '#b0bec5'];
function renderGarage() {
  wallet(); const c = CARS[gIdx], owned = save.owned.includes(c.id), color = save.colors[c.id] || c.color;
  if (gCar) gScene.remove(gCar.group); gCar = null; const token = (renderGarage.t = (renderGarage.t || 0) + 1);
  makeCar(c, color).then(m => { if (token !== renderGarage.t) return; if (gCar) gScene.remove(gCar.group); gCar = m; if (m.glb && gEnv) m.group.traverse(o => { if (o.isMesh) { o.material.envMap = gEnv; o.material.envMapIntensity = 1.3; } }); gScene.add(m.group); });
  $('gBrand').textContent = c.brand.toUpperCase(); $('gName').textContent = c.name; $('gDesc').textContent = c.desc;
  $('gStats').innerHTML = [['Top speed', c.top / 280, c.top + ' km/h'], ['Acceleration', c.acc / 1.45], ['Grip', c.grip / 1.3], ['Nitro', c.nos / 1.45]].map(([n, v, t]) => `<div class="stat"><span>${n}</span><div class="bar"><i style="width:${Math.min(100, v * 100).toFixed(0)}%"></i></div></div>`).join('') + `<div style="font-size:11px;opacity:.7">Top speed ${c.top} km/h</div>`;
  const sw = $('gSw'); sw.innerHTML = ''; if (owned && !c.glb) PAINTS.forEach(p => { const b = document.createElement('button'); b.className = 'sw' + (p === color ? ' sel' : ''); b.style.background = p; b.onclick = () => { save.colors[c.id] = p; persist(); renderGarage(); }; sw.appendChild(b); });
  const buy = $('gBuy');
  if (!owned) { buy.textContent = 'Buy ₦' + c.price.toLocaleString(); buy.disabled = save.coins < c.price; buy.onclick = () => { if (save.coins >= c.price) { save.coins -= c.price; save.owned.push(c.id); save.car = c.id; persist(); AudioSys.chime(); renderGarage(); } }; }
  else if (save.car === c.id) { buy.textContent = '✓ Selected'; buy.disabled = true; }
  else { buy.textContent = 'Drive this car'; buy.disabled = false; buy.onclick = () => { save.car = c.id; persist(); renderGarage(); }; }
}
$('gPrev').onclick = () => { gIdx = (gIdx + CARS.length - 1) % CARS.length; renderGarage(); };
$('gNext').onclick = () => { gIdx = (gIdx + 1) % CARS.length; renderGarage(); };

// ---------------------------------------------------------------- settings
function renderSettings() { document.querySelectorAll('[data-set]').forEach(b => b.classList.toggle('on', !!save.settings[b.dataset.set])); $('sens').value = save.settings.sens; document.querySelectorAll('#qSeg button').forEach(b => b.classList.toggle('on', b.dataset.q === save.settings.quality)); }
document.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { const k = b.dataset.set; save.settings[k] = !save.settings[k]; persist(); renderSettings(); AudioSys.unlock(); AudioSys.applyVol(); if (k === 'tilt' && save.settings.tilt) { Input.tiltAsked = false; requestTilt(); } });
$('sens').oninput = e => { save.settings.sens = parseFloat(e.target.value); persist(); };
document.querySelectorAll('#qSeg button').forEach(b => b.onclick = async () => { save.settings.quality = b.dataset.q; persist(); renderSettings(); resize(); await setupRoute('lagos', 'bridge', true); G.state = 'menu'; show('sSettings'); });

// ---------------------------------------------------------------- wiring
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { AudioSys.unlock(); const g = b.dataset.go;
  if (g === 'menu') { if (G.state === 'garage') { G.state = 'menu'; } show('sMenu'); wallet(); if (G.state !== 'menu') goMenu(); else AudioSys.play({ bpm: 100, root: 45, prog: [0, 8, 3, 10] }, false); }
  else if (g === 'profile') { show('sProfile'); renderAccount(Account.profile); }
  else if (g === 'races') openRaces(); else if (g === 'garage') openGarage(); else if (g === 'settings') { show('sSettings'); renderSettings(); } }));
$('btnPause').onclick = pause; $('btnCam').onclick = cycleCam;
$('pResume').onclick = resume; $('pRestart').onclick = () => startRace(G.city, G.route.id); $('pQuit').onclick = () => goMenu();
$('pCalib').onclick = () => { if (Input.tiltSeen) { Input.tiltNeutral = Input.tiltRaw; toast('Tilt calibrated', 'good'); } else toast('No tilt sensor detected', 'bad'); };
if (NATIVE) {
  try { Plug.StatusBar && Plug.StatusBar.hide(); } catch (e) { }
  try { Plug.SplashScreen && setTimeout(() => Plug.SplashScreen.hide(), 300); } catch (e) { }
  try { Plug.App && Plug.App.addListener('backButton', () => { if (G.state === 'race' || G.state === 'countdown') pause(); else if (G.state === 'paused') resume(); else if (!$('sMenu').classList.contains('hidden')) Plug.App.exitApp(); else goMenu(); }); } catch (e) { }
}

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0; const STEP = 1 / 60; const perf = { t: 0, f: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(.1, (now - last) / 1000); last = now; acc += dt; let n = 0;
  while (acc >= STEP && n < 4) { if (G.state === 'countdown') countdown(STEP); else if (G.state === 'race' || G.state === 'finished' || G.state === 'menu') update(STEP * (G.timeScale || 1)); acc -= STEP; n++; }
  if (n >= 4) acc = 0;
  if (G.state === 'garage') { if (gCar) gCar.group.rotation.y += dt * .5; gCam.aspect = innerWidth / innerHeight; gCam.position.set(0, 2.1, 7.6); gCam.lookAt(0, .6, 0); gCam.updateProjectionMatrix(); renderer.render(gScene, gCam); return; }
  if (G.world) {
    if (post && save.settings.quality === 'high') {
      const P = G.player, kmh = P ? P.v * KMH : 0, racing = G.state === 'race' || G.state === 'finished';
      const target = racing ? Math.min(1, Math.max(0, (kmh - 110) / 160)) * .7 + (G.nitroOn ? .55 : 0) : 0;
      const u = post.speed.uniforms; u.strength.value += (target - u.strength.value) * Math.min(1, dt * 4); u.tint.value += ((G.nitroOn ? .35 : 0) - u.tint.value) * Math.min(1, dt * 4);
      post.render(dt);
    } else renderer.render(scene, camera);
  }
  // adaptive resolution: if the phone struggles (<30 fps for ~3 s), render at a lower pixel ratio
  perf.t += dt; perf.f++;
  if (perf.t > 3) { const fps = perf.f / perf.t; perf.t = 0; perf.f = 0;
    if (fps < 30 && renderer.getPixelRatio() > .75) { renderer.setPixelRatio(Math.max(.75, renderer.getPixelRatio() - .25)); renderer.setSize(innerWidth, innerHeight, false); } }
  if (G.state === 'race' || G.state === 'countdown' || G.state === 'finished') hud();
}
// ---------------------------------------------------------------- accounts
function applyCloudSave(remote, mergeGuest) {
  const local = save;
  const merged = { ...DEF, ...remote, settings: local.settings };
  if (mergeGuest) { // keep the best of guest progress and the cloud profile
    merged.coins = Math.max(local.coins || 0, remote.coins || 0);
    merged.owned = [...new Set([...(remote.owned || []), ...(local.owned || [])])];
    merged.best = { ...(remote.best || {}) }; for (const [k, v] of Object.entries(local.best || {})) if (!merged.best[k] || v < merged.best[k]) merged.best[k] = v;
  }
  save = merged; AudioSys.settings = save.settings; try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { }
  wallet();
}
function renderAccount(p) {
  const name = p ? (p.isGuest ? 'Guest Racer' : p.name) : 'Guest Racer';
  const initial = name.trim()[0] || '?';
  for (const [av, big] of [[$('acctAv'), false], [$('pAv'), true]]) { if (p && p.photo && !p.isGuest) { av.style.backgroundImage = `url(${p.photo})`; av.textContent = ''; } else { av.style.backgroundImage = ''; av.textContent = initial.toUpperCase(); } }
  $('acctName').textContent = name; $('pName').textContent = name;
  $('acctSub').textContent = !Account.enabled ? 'Online accounts coming soon' : !p ? 'Connecting…' : p.isGuest ? `ID ${p.playerId || '…'} · Tap to sign in` : `ID ${p.playerId || '…'} · Cloud save on`;
  $('pId').textContent = p && p.playerId ? p.playerId : '—';
  $('pStat').textContent = !Account.enabled ? 'Accounts will switch on in the next update.' : !p ? 'Connecting…' : p.isGuest ? 'Playing as a guest. Progress is saved on this phone and backed up to your guest profile.' : 'Signed in with Google. Progress is saved to the cloud.';
  $('pGoogle').style.display = (Account.enabled && (!p || p.isGuest)) ? '' : 'none';
  $('pOut').style.display = (p && !p.isGuest) ? '' : 'none';
}
Account.onChange(renderAccount);
$('pGoogle').onclick = async () => { try { $('pGoogle').disabled = true; await Account.signInWithGoogle(); toast('Signed in — progress saved to the cloud', 'good'); } catch (e) { toast('Sign-in failed: ' + (e.message || e).toString().slice(0, 60), 'bad'); } finally { $('pGoogle').disabled = false; } };
$('pOut').onclick = async () => { await Account.flushNow().catch(() => { }); await Account.signOut(); toast('Signed out', 'gold'); };
$('pCopy').onclick = async () => { const id = $('pId').textContent; try { await navigator.clipboard.writeText(id); toast('Player ID copied', 'good'); } catch (e) { toast('ID: ' + id, 'gold'); } };
Account.init(() => save, applyCloudSave).catch(e => console.warn('accounts unavailable', e));

window.__NRRHD = { G, startRace, goMenu, save, CITY: () => CITY, INDEX: () => INDEX, camera, renderer, scene, getPost: () => post };
(async () => {
  try { await loadIndex(); await goMenu(); $('loading').classList.add('hidden'); requestAnimationFrame(frame); }
  catch (e) { $('loadTxt').textContent = 'Could not load: ' + e.message; console.error(e); }
})();
