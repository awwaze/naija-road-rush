// Game modes: shared props (checkpoint arches, police stops) and mode settings.
// Objects are built in "road space": local x = sideways across the road (same as lane x), local -z = forward.
import * as THREE from 'three';
import { ROAD } from './textures.js';

export const MODE_INFO = {
  career: { name: 'Career', short: 'Career', rivals: true, traffic: [40, 26], hint: 'Finish in the <b>top 3</b> to unlock the next stage. Rivals get faster on every stage. Gold, silver and bronze medals to collect.' },
  race: { name: 'Quick Race', short: 'Race', rivals: true, traffic: [40, 26], hint: 'You vs 5 rivals on real roads. Dodge danfos, kekes and okadas · grab ₦ coins and N₂O.' },
  rush: { name: 'Traffic Rush', short: 'Rush', rivals: false, traffic: [64, 34], hint: 'Heavy traffic, no rivals. Score for speed and <b>near misses</b> (chain them for combos). <b>3 big crashes</b> and your car is finished. Reach the end for a big bonus.' },
  trial: { name: 'Time Trial', short: 'Trial', rivals: false, traffic: [16, 12], hint: 'Reach each <b>checkpoint</b> before the clock runs out: every checkpoint adds time. Fewer cars, more speed.' },
};

function labelTexture(lines, bg, fg, w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((t, i) => { const sz = i === 0 ? h * .42 : h * .22; g.font = `900 ${sz}px "Russo One", Arial, sans-serif`; g.fillText(t, w / 2, h * (lines.length === 1 ? .5 : i === 0 ? .4 : .76)); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// Checkpoint arch spanning our carriageway (green, glowing at night)
export function checkpointArch(n, night) {
  const g = new THREE.Group(), x0 = ROAD.ourL - .6, x1 = ROAD.R + .4, w = x1 - x0, mid = (x0 + x1) / 2;
  const postM = new THREE.MeshStandardMaterial({ color: 0x00a859, roughness: .4, metalness: .3 });
  for (const x of [x0, x1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.5, 6.4, .5), postM); p.position.set(x, 3.2, 0); g.add(p); }
  const tex = labelTexture([n === 'FINISH' ? 'FINISH' : 'CHECKPOINT', n === 'FINISH' ? '' : 'CHECKPOINT ' + n], '#00a859', '#ffffff');
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, .3), [postM, postM, postM, postM,
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: night ? 1.1 : .25 }),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: night ? 1.1 : .25 })]);
  board.position.set(mid, 6.2, 0); g.add(board);
  return g;
}

// Roadside police stop on the right shoulder: patrol van with flashing light bar, officer, cones
export function policeStop(night) {
  const g = new THREE.Group(), x = ROAD.R + 2.2;
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .45, metalness: .2 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x0d3c8c, roughness: .5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14202a, roughness: .2, metalness: .6 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: .9 });
  const van = new THREE.Group(); van.position.set(x, 0, 0); g.add(van);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.7, 4.8), white); body.position.y = 1.2; van.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.97, .32, 4.82), blue); stripe.position.y = 1.0; van.add(stripe);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.97, .55, 3.6), dark); glass.position.set(0, 1.72, .3); van.add(glass);
  const ws = new THREE.Mesh(new THREE.BoxGeometry(1.8, .6, .05), dark); ws.position.set(0, 1.62, -2.41); van.add(ws);
  const tex = labelTexture(['POLICE'], '#0d3c8c', '#ffffff', 256, 64);
  for (const sx of [-1, 1]) { const lbl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, .5), new THREE.MeshBasicMaterial({ map: tex })); lbl.position.set(sx * .99, 1.32, .2); lbl.rotation.y = sx * Math.PI / 2; van.add(lbl); }
  const tg = new THREE.CylinderGeometry(.36, .36, .26, 14); tg.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-.92, -1.6], [.92, -1.6], [-.92, 1.6], [.92, 1.6]]) { const w = new THREE.Mesh(tg, tyre); w.position.set(wx, .36, wz); van.add(w); }
  // light bar: red + blue halves that flash
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, .25, .2) }), blu = new THREE.MeshBasicMaterial({ color: new THREE.Color(.25, .6, 6) });
  const lr = new THREE.Mesh(new THREE.BoxGeometry(.7, .16, .34), red); lr.position.set(-.38, 2.13, -.6); van.add(lr);
  const lb = new THREE.Mesh(new THREE.BoxGeometry(.7, .16, .34), blu); lb.position.set(.38, 2.13, -.6); van.add(lb);
  // officer in uniform with cap, waving traffic down
  const uni = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: .8 }), skin = new THREE.MeshStandardMaterial({ color: 0x5a3a28, roughness: .8 });
  const vest = new THREE.MeshStandardMaterial({ color: 0xc6ff00, emissive: 0x6f8f00, emissiveIntensity: night ? .8 : .15, roughness: .6 });
  const off = new THREE.Group(); off.position.set(ROAD.R + .6, 0, -6.5); g.add(off);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(.36, .9, .24), uni); legs.position.y = .45; off.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(.48, .65, .28), vest); torso.position.y = 1.22; off.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 8), skin); head.position.y = 1.7; off.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .1, 10), uni); cap.position.y = 1.84; off.add(cap);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(.12, .6, .12), uni); arm.geometry.translate(0, .3, 0); arm.position.set(-.3, 1.45, 0); off.add(arm);
  // cones narrowing the shoulder
  const coneM = new THREE.MeshStandardMaterial({ color: 0xff6d00, emissive: 0x6a2a00, emissiveIntensity: night ? .9 : .2, roughness: .6 }), coneG = new THREE.ConeGeometry(.22, .7, 10); coneG.translate(0, .35, 0);
  for (let k = 0; k < 7; k++) { const c = new THREE.Mesh(coneG, coneM); c.position.set(ROAD.R - .3 - k * .12, 0, -24 + k * 4); g.add(c); }
  let glow = null;
  if (night) { glow = new THREE.PointLight(0x4060ff, 0, 26, 1.6); glow.position.set(x, 2.6, -.6); g.add(glow); }
  g.userData.tick = t => { const on = Math.floor(t * 6) % 2 === 0; lr.visible = on; lb.visible = !on; arm.rotation.z = -.4 - Math.sin(t * 5) * .6; if (glow) { glow.intensity = 10; glow.color.setHex(on ? 0xff3030 : 0x3050ff); } };
  return g;
}

// Warning sign before the police stop
export function policeSign(night) {
  const g = new THREE.Group(), tex = labelTexture(['POLICE CHECKPOINT', 'SLOW DOWN · 66 km/h'], '#ffd600', '#111111');
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 4.4, 8), new THREE.MeshStandardMaterial({ color: 0x9aa3a8, metalness: .7, roughness: .4 })); post.position.set(ROAD.R + 1.2, 2.2, 0); g.add(post);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: night ? .9 : .1, side: THREE.DoubleSide }));
  b.position.set(ROAD.R + .4, 4.1, 0); g.add(b);
  return g;
}
