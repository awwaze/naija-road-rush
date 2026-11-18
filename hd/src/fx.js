// Visual effects: post-processing (bloom, speed blur, grade), particles, skid marks, ramps.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SpeedShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0 }, center: { value: new THREE.Vector2(.5, .56) }, vignette: { value: .32 }, tint: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; uniform vec2 center; uniform float vignette; uniform float tint; varying vec2 vUv;
    void main(){
      vec2 d = vUv - center; float dist = length(d);
      vec4 c = vec4(0.0); float tot = 0.0;
      float s = strength * smoothstep(0.12, 0.7, dist);
      for (int i = 0; i < 8; i++) { float t = float(i) / 7.0; float w = 1.0 - t * .6; c += texture2D(tDiffuse, vUv - d * s * t * 0.09) * w; tot += w; }
      c /= tot;
      // grade: a touch more contrast/saturation, warm highlights, blue nitro tint
      vec3 col = c.rgb; float l = dot(col, vec3(.299,.587,.114));
      col = mix(vec3(l), col, 1.12); col = (col - .5) * 1.05 + .5;
      col += vec3(.02,.01,-.01) * smoothstep(.5,1.,l);
      col = mix(col, col * vec3(.85,.95,1.15), tint);
      col *= 1.0 - vignette * smoothstep(.35, .95, dist);
      gl_FragColor = vec4(col, c.a);
    }`,
};

export function createPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // clamp extreme HDR values (the sky's sun disc) so bloom can't overflow into Inf/NaN (black/white frames)
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) c = vec4(1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 12.0), 1.0); }' }));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .07, .3, 3.2); composer.addPass(bloom);
  const speed = new ShaderPass(SpeedShader); composer.addPass(speed);
  composer.addPass(new OutputPass());
  return {
    composer, bloom, speed,
    setSize(w, h, pr) { composer.setPixelRatio(pr); composer.setSize(w, h); bloom.resolution.set(w * pr / 2, h * pr / 2); },
    render(dt) { composer.render(dt); },
  };
}

// ---------------- particles (pooled points with per-particle size/alpha/colour)
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t;
}
const DOT = dotTexture();
export class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0; this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max); this.grow = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setAttribute('size', this.aSize); g.setAttribute('alpha', this.aAlpha);
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: DOT }, scale: { value: 600 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, vertexColors: true,
      vertexShader: 'attribute float size; attribute float alpha; varying float vA; varying vec3 vC; uniform float scale; void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying float vA; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); if (gl_FragColor.a < 0.01) discard; }',
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.col = new Float32Array(max * 3); scene.add(this.points);
  }
  setScale(h) { this.points.material.uniforms.scale.value = h * .9; }
  spawn(x, y, z, vx, vy, vz, life, size, grow, r, g, b, drag = 0, grav = 0) {
    let i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life; this.size0[i] = size; this.grow[i] = grow; this.drag[i] = drag; this.grav[i] = grav; this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
  }
  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt; if (this.life[i] <= 0) continue;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i * 3] *= k; this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.grav[i] * dt; this.v[i * 3 + 2] *= k;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      if (w !== i) { for (const arr of [this.p, this.v, this.col]) { arr[w * 3] = arr[i * 3]; arr[w * 3 + 1] = arr[i * 3 + 1]; arr[w * 3 + 2] = arr[i * 3 + 2]; } for (const arr of [this.life, this.maxLife, this.size0, this.grow, this.drag, this.grav]) arr[w] = arr[i]; }
      this.aPos.array[w * 3] = this.p[w * 3]; this.aPos.array[w * 3 + 1] = this.p[w * 3 + 1]; this.aPos.array[w * 3 + 2] = this.p[w * 3 + 2];
      this.aCol.array[w * 3] = this.col[w * 3]; this.aCol.array[w * 3 + 1] = this.col[w * 3 + 1]; this.aCol.array[w * 3 + 2] = this.col[w * 3 + 2];
      this.aSize.array[w] = this.size0[w] + this.grow[w] * (1 - t); this.aAlpha.array[w] = Math.min(1, t * 1.6);
      w++;
    }
    this.n = w; this.points.geometry.setDrawRange(0, w);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
  dispose() { this.points.parent && this.points.parent.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose(); }
}

// ---------------- skid marks (ring buffer of quads on the road)
export class SkidMarks {
  constructor(scene, max = 600) {
    this.max = max; this.i = 0; this.last = [null, null];
    const g = new THREE.BufferGeometry(); this.pos = new Float32Array(max * 6 * 3); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: .55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  add(k, x, y, z, rx, rz) { // k = wheel index (0 left, 1 right); r = lateral unit vector
    const prev = this.last[k]; const w = .13;
    const a = [x - rx * w, y, z - rz * w], b = [x + rx * w, y, z + rz * w];
    if (prev) { const o = (this.i % this.max) * 18, P = this.pos; const q = [prev[0], prev[1], a, prev[1], b, a];
      const quad = [prev[0], a, prev[1], prev[1], a, b];
      for (let j = 0; j < 6; j++) { P[o + j * 3] = quad[j][0]; P[o + j * 3 + 1] = quad[j][1] + .075; P[o + j * 3 + 2] = quad[j][2]; }
      this.i++; this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.setDrawRange(0, Math.min(this.i, this.max) * 6); }
    this.last[k] = [a, b];
  }
  lift() { this.last = [null, null]; }
  clear() { this.i = 0; this.last = [null, null]; this.mesh.geometry.setDrawRange(0, 0); }
  dispose() { this.mesh.parent && this.mesh.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// ---------------- jump ramps
export function rampMesh() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  for (let y = 0; y < 256; y += 32) { g.fillStyle = (y / 32) % 2 ? '#111' : '#ffcc00'; g.fillRect(0, y, 128, 32); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  // wedge: 3.4 m wide, 10 m long, rising to 1.3 m; front (low end) faces -z
  const W = 1.7, L = 10, H = 1.3, v = [
    [-W, 0, 0], [W, 0, 0], [W, H, L], [-W, 0, 0], [W, H, L], [-W, H, L],   // slope (low end at z=0)
    [-W, 0, L], [-W, H, L], [W, H, L], [-W, 0, L], [W, H, L], [W, 0, L],   // back
    [-W, 0, 0], [-W, H, L], [-W, 0, L], [W, 0, 0], [W, 0, L], [W, H, L]];  // sides
  const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1];
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
  geo.rotateY(Math.PI); // low end at z=0, peak at z=-L (cars drive towards -z)
  return { geo, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: .6, side: THREE.DoubleSide }), L, H };
}
