// The continuous world: cutaway limestone house, garden, blue promenade, small park, beach and the sea.
import * as THREE from 'three';
import { T, rng } from './tex.js';

// ---------- layout constants ----------
export const L = {
  house: { x0: -3.4, x1: 3.4, z0: -5.4, z1: -1.0, h: 2.35 },
  door: { x: 2.1, z: -1.0, w: 0.9, h: 1.85, hinge: 1.65 },
  gate: { x: 3.0, z: 2.6, w: 1.0 },
  doorIn: { x: 2.1, z: -1.5 }, doorOut: { x: 2.1, z: -0.5 },
  gateIn: { x: 3.0, z: 2.15 }, gateOut: { x: 3.0, z: 3.1 },
  dining: { x: -1.2, z: -2.75, w: 1.5, d: 0.85, y: 0.72 },
  island: { x: -2.35, z: -4.45, w: 1.5, d: 0.55, y: 0.9 },
  sofa: { x: 1.95, z: -4.95 },
  rug: { x: 1.9, z: -3.3 },
  gTable: { x: -0.9, z: 1.05, r: 0.5, y: 0.72 },
  lantern: { x: -2.25, z: 0.15 },
  waterBowl: { x: -0.4, z: -4.95 },
  dogBed: { x: 0.35, z: -1.65 },
  rack: { x: 2.95, z: -1.35 },
  doorBench: { x: 2.95, z: -1.95, y: 0.4 },
  shelf: { x: 3.12, z: -2.9, y: 0.78 },
  slide: { x: 10.6, z: -1.8 },
  swing: { x: 13.4, z: -2.6 },
  parkBench: { x: 8.2, z: -0.4 },
  promBench: [{ x: 6.8, z: 4.35 }, { x: 13.0, z: 4.35 }],
  beachX: 15.5,
};

// ---------- regions / navigation ----------
// H = inside house, G = garden, O = outside (promenade, park, beach)
const RECT = {
  H: [[-3.2, 3.2, -5.2, -1.14]],
  G: [[-3.2, 6.0, -0.86, 2.45]],
  O: [[-3.2, 15.6, 2.78, 4.85], [6.45, 15.6, -4.95, 4.85], [15.5, 29.5, -2.55, 4.85]],
};
export const RECTS = RECT;
export function inDoorway(x, z) { return Math.abs(x - L.door.x) < 0.4 && z > -1.32 && z < -0.68; }
export function inGateway(x, z) { return Math.abs(x - L.gate.x) < 0.48 && z > 2.3 && z < 2.95; }
export function regionAt(x, z) {
  if (x < 3.45 && z < -1.0 && x > -3.45) return 'H';
  if (x < 6.2 && z < 2.6 && z >= -1.0) return 'G';
  return 'O';
}
function clampRects(rects, p) {
  let best = null, bd = 1e9;
  for (const [x0, x1, z0, z1] of rects) {
    const cx = Math.min(x1, Math.max(x0, p.x)), cz = Math.min(z1, Math.max(z0, p.z));
    const d = (cx - p.x) ** 2 + (cz - p.z) ** 2; if (d < bd) { bd = d; best = [cx, cz]; }
  }
  p.x = best[0]; p.z = best[1];
}
// move-constrain a mover {reg} at proposed p (mutated). returns region.
export function constrain(reg, p) {
  if (inDoorway(p.x, p.z) && (reg === 'H' || reg === 'G')) { p.x = Math.min(L.door.x + 0.32, Math.max(L.door.x - 0.32, p.x)); return p.z < -1.0 ? 'H' : 'G'; }
  if (inGateway(p.x, p.z) && (reg === 'G' || reg === 'O')) { p.x = Math.min(L.gate.x + 0.4, Math.max(L.gate.x - 0.4, p.x)); return p.z < 2.6 ? 'G' : 'O'; }
  clampRects(RECT[reg], p); return reg;
}
export function clampPoint(p) { // put any point into nearest walkable region
  const r = regionAt(p.x, p.z); clampRects(RECT[r], p); return r;
}
const ORDER = { H: 0, G: 1, O: 2 };
export function navNext(reg, pos, goal) {
  const gr = regionAt(goal.x, goal.z);
  if (gr === reg) return goal;
  const out = ORDER[gr] > ORDER[reg];
  if (reg === 'H') return (Math.hypot(pos.x - L.doorIn.x, pos.z - L.doorIn.z) < 0.35 || inDoorway(pos.x, pos.z)) ? L.doorOut : L.doorIn;
  if (reg === 'O') return (Math.hypot(pos.x - L.gateOut.x, pos.z - L.gateOut.z) < 0.35 || inGateway(pos.x, pos.z)) ? L.gateIn : L.gateOut;
  // G
  if (out) return (Math.hypot(pos.x - L.gateIn.x, pos.z - L.gateIn.z) < 0.35 || inGateway(pos.x, pos.z)) ? L.gateOut : L.gateIn;
  return (Math.hypot(pos.x - L.doorOut.x, pos.z - L.doorOut.z) < 0.35 || inDoorway(pos.x, pos.z)) ? L.doorIn : L.doorOut;
}
export function zoneAt(x, z) {
  const r = regionAt(x, z);
  if (r === 'H') return 'house'; if (r === 'G') return 'garden';
  if (x >= L.beachX) return 'beach';
  if (x > 6.4 && z < 2.7) return 'park';
  return 'prom';
}
export function groundH(x, z) {
  if (x < 15.5) return 0;
  let h = -0.5 * Math.min(1, (x - 15.5) / 2.0);
  if (z < -2.4) h -= Math.min(3, -2.4 - z) * 0.25;
  if (z > 5.0) h -= Math.min(3, z - 5.0) * 0.3;
  return h;
}
export function surfaceType(x, z) {
  const zn = zoneAt(x, z);
  if (zn === 'house') return 'stone'; if (zn === 'garden' || zn === 'park') return 'grass';
  if (zn === 'beach') return 'sand'; return 'wood';
}

// ---------- materials ----------
function std(p) { return new THREE.MeshStandardMaterial(p); }
function box(w, h, d, m, x, y, z, cast = true) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; return o; }
function cyl(rt, rb, h, m, x, y, z, seg = 20, cast = true) { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; return o; }
function sph(r, m, x, y, z, cast = true) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; return o; }

export function makeMaterials() {
  const lime = T.limestone([2, 2]);
  return {
    lime: std({ map: lime.map, bumpMap: lime.bump, bumpScale: 1.2, roughness: 0.86, color: 0xffffff }),
    limeCap: std({ color: 0xd9dbd8, roughness: 0.9, map: lime.map }),
    terrazzo: std({ map: T.terrazzo([3, 2]), roughness: 0.18, metalness: 0.0, envMapIntensity: 1.1 }),
    wood: std({ map: T.wood([1, 1]), roughness: 0.42, color: 0xffffff }),
    navy: std({ color: 0x14244a, roughness: 0.5 }),
    cobaltGloss: new THREE.MeshPhysicalMaterial({ color: 0x1f4fae, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06, metalness: 0.0 }),
    chrome: std({ color: 0xe6eaee, metalness: 1, roughness: 0.12 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.2, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
    glassThick: new THREE.MeshPhysicalMaterial({ color: 0xd4eefa, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.38, envMapIntensity: 1.8, depthWrite: false }),
    whiteStone: std({ color: 0xf2f3f1, roughness: 0.25 }),
    emerald: std({ color: 0x0f6b55, roughness: 0.65 }),
    lemon: std({ color: 0xf5d00f, roughness: 0.45 }),
    cobalt: std({ color: 0x1f4fae, roughness: 0.6 }),
    fabricNavy: std({ color: 0x1b2d57, roughness: 0.95 }),
    grass: std({ map: T.grass([6, 3]), roughness: 0.95 }),
    grassPark: std({ map: T.grass([7, 8]), roughness: 0.95 }),
    pavers: std({ map: T.pavers([4, 0.45]), roughness: 0.6 }),
    sand: std({ map: T.sand([10, 8]), bumpMap: T.sandBump([10, 8]), bumpScale: 2, roughness: 1, color: 0xd9d2c0 }),
    cliff: std({ map: T.cliff([8, 1]), roughness: 0.95 }),
    leaf: std({ map: T.leaf(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }),
    oliveLeaf: std({ map: T.olive(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.65 }),
    bark: std({ color: 0x5a5148, roughness: 0.95 }),
    terracottaFree: std({ color: 0xe9e9e4, roughness: 0.8 }), // white glazed pots
    rugMat: std({ map: T.stripes('#1f4fae', '#f2f3f0', [6, 1]), roughness: 0.95 }),
    umbrella: std({ map: T.stripes('#1f4fae', '#f4f5f2', [8, 1]), roughness: 0.7, side: THREE.DoubleSide }),
  };
}

// leaf clusters (instanced) for plants with visible veins
function leafCluster(group, mat, centers, count, size, seed) {
  const geo = new THREE.PlaneGeometry(size * 0.5, size);
  geo.translate(0, size * 0.5, 0);
  const im = new THREE.InstancedMesh(geo, mat, count); im.castShadow = true; im.receiveShadow = true;
  const r = rng(seed), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const c = centers[i % centers.length];
    const a = r() * 6.283, b = Math.acos(2 * r() - 1), rr = c.r * Math.cbrt(r());
    p.set(c.x + Math.sin(b) * Math.cos(a) * rr, c.y + Math.cos(b) * rr * 0.7, c.z + Math.sin(b) * Math.sin(a) * rr);
    e.set((r() - 0.5) * 2.4, r() * 6.283, (r() - 0.5) * 2.4); q.setFromEuler(e);
    const k = 0.7 + r() * 0.6; s.set(k, k, k); m4.compose(p, q, s); im.setMatrixAt(i, m4);
    const col = new THREE.Color().setHSL(0.3 + r() * 0.06, 0.35 + r() * 0.2, 0.42 + r() * 0.18); im.setColorAt(i, col);
  }
  group.add(im); return im;
}
function oliveTree(g, M, x, z, h = 2.2, seed = 1) {
  const t = new THREE.Group(); t.position.set(x, groundH(x, z), z); g.add(t);
  const trunk = cyl(0.06, 0.11, h * 0.55, M.bark, 0, h * 0.27, 0, 8); trunk.rotation.z = 0.08; t.add(trunk);
  const br = cyl(0.04, 0.06, h * 0.4, M.bark, 0.15, h * 0.6, 0, 6); br.rotation.z = -0.5; t.add(br);
  const centers = [{ x: 0, y: h * 0.8, z: 0, r: 0.55 }, { x: 0.35, y: h * 0.72, z: 0.1, r: 0.4 }, { x: -0.3, y: h * 0.75, z: -0.1, r: 0.42 }, { x: 0.05, y: h * 0.98, z: 0.05, r: 0.35 }];
  leafCluster(t, M.oliveLeaf, centers, 700, 0.12, seed);
  return t;
}
function pottedPlant(g, M, x, z, kind = 'leafy', s = 1, seed = 3) {
  const t = new THREE.Group(); t.position.set(x, groundH(x, z), z); g.add(t);
  t.add(cyl(0.16 * s, 0.12 * s, 0.3 * s, M.terracottaFree, 0, 0.15 * s, 0, 18));
  t.add(cyl(0.15 * s, 0.15 * s, 0.02, std({ color: 0x3a3029, roughness: 1 }), 0, 0.3 * s, 0, 18, false));
  if (kind === 'agave') {
    const am = std({ color: 0x5f8f86, roughness: 0.6 });
    for (let i = 0; i < 14; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s, 0.45 * s, 5), am); const a = i / 14 * 6.283, tilt = 0.5 + (i % 3) * 0.2; c.position.set(Math.cos(a) * 0.08 * s, 0.45 * s, Math.sin(a) * 0.08 * s); c.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); c.castShadow = true; t.add(c); }
  } else if (kind === 'lemon') {
    t.add(cyl(0.025 * s, 0.03 * s, 0.6 * s, M.bark, 0, 0.6 * s, 0, 6));
    leafCluster(t, M.leaf, [{ x: 0, y: 1.05 * s, z: 0, r: 0.35 * s }], 260, 0.13 * s, seed);
    const lm = std({ color: 0xf5d00f, roughness: 0.5 }), r = rng(seed + 9);
    for (let i = 0; i < 9; i++) { const a = r() * 6.28, rr = 0.28 * s; const l = sph(0.045 * s, lm, Math.cos(a) * rr, (0.9 + r() * 0.3) * s, Math.sin(a) * rr); l.scale.set(1, 0.85, 0.85); t.add(l); }
  } else {
    leafCluster(t, M.leaf, [{ x: 0, y: 0.55 * s, z: 0, r: 0.25 * s }], 120, 0.2 * s, seed);
  }
  return t;
}
function hedge(g, M, x0, x1, z, seed) {
  const centers = []; for (let x = x0; x <= x1; x += 0.35) centers.push({ x, y: 0.3, z, r: 0.25 });
  leafCluster(g, M.oliveLeaf, centers, centers.length * 70, 0.1, seed);
}

export function buildWorld(scene, renderer) {
  const M = makeMaterials();
  const W = { M, colliders: [], surfaces: [], seats: [], anim: [], decals: [] };
  const g = new THREE.Group(); scene.add(g); W.group = g;

  // ---------- sky ----------
  const skyU = { top: { value: new THREE.Color(0x2c6fd6) }, hor: { value: new THREE.Color(0xd3ecff) }, sunDir: { value: new THREE.Vector3(-0.3, 0.8, 0.5).normalize() }, sunCol: { value: new THREE.Color(0xfffbe8) } };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vd; void main(){ float h = clamp(vd.y*1.6,0.0,1.0); vec3 c = mix(hor, top, pow(h,0.6)); float s = max(dot(normalize(vd), sunDir),0.0); c += sunCol*pow(s,180.0)*1.5 + sunCol*pow(s,8.0)*0.12; if(vd.y<0.0) c = hor*0.9; gl_FragColor = vec4(c,1.0);\n#include <colorspace_fragment>\n}',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat); scene.add(sky); W.sky = sky; W.skyU = skyU;

  // environment map from a simple sky scene
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat.clone()); envScene.add(envSky);
  envSky.material.uniforms = { top: { value: new THREE.Color(0x3a7ad8) }, hor: { value: new THREE.Color(0xe6f3ff) }, sunDir: skyU.sunDir, sunCol: skyU.sunCol };
  const ground = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: 0x6f90a8 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -2; envScene.add(ground);
  const pm = new THREE.PMREMGenerator(renderer);
  W.envDay = pm.fromScene(envScene, 0.02).texture;
  envSky.material.uniforms.top.value.set(0x0c1a3a); envSky.material.uniforms.hor.value.set(0x55607a); ground.material.color.set(0x1a2236);
  W.envNight = pm.fromScene(envScene, 0.02).texture;
  scene.environment = W.envDay;
  scene.fog = new THREE.Fog(0xd3ecff, 40, 160); W.fog = scene.fog;

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xa9cdff, 0xe9e6dc, 0.85); scene.add(hemi); W.hemi = hemi;
  const sun = new THREE.DirectionalLight(0xfffaf0, 2.7); sun.position.set(-5, 12, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; scene.add(sun); scene.add(sun.target); W.sun = sun;

  // ---------- sea ----------
  const wn = T.waterNormal(); wn.repeat.set(160, 160);
  const seaMat = std({ color: 0x0f5d8c, roughness: 0.08, metalness: 0.15, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.1 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.set(10, -0.62, 0); sea.receiveShadow = true; g.add(sea); W.sea = sea; W.seaMat = seaMat;
  const wn2 = wn.clone(); wn2.repeat.set(10, 4);
  const shallow = new THREE.Mesh(new THREE.PlaneGeometry(16, 3), std({ color: 0x1aa39a, roughness: 0.1, transparent: true, opacity: 0.45, normalMap: wn2, envMapIntensity: 1 }));
  shallow.rotation.x = -Math.PI / 2; shallow.position.set(23, -0.6, -3.6); g.add(shallow); W.shallow = shallow;
  const foamT = T.foam(); const foam = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.7), new THREE.MeshBasicMaterial({ map: foamT, transparent: true, opacity: 0.8, depthWrite: false }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(23, -0.585, -2.75); g.add(foam); W.foam = foam;

  // ---------- plateau & cliffs ----------
  const plat = box(22, 3, 12.7, M.cliff, 4.75, -1.5, -1.15, false); plat.receiveShadow = true; g.add(plat);
  // top finishes
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 4.4), M.terrazzo); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.005, -3.2); floor.receiveShadow = true; g.add(floor);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 3.6), M.grass); lawn.rotation.x = -Math.PI / 2; lawn.position.set(1.4, 0.004, 0.8); lawn.receiveShadow = true; g.add(lawn);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 2.2), M.lime); back.rotation.x = -Math.PI / 2; back.position.set(1.4, 0.003, -6.5); back.receiveShadow = true; g.add(back);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 4.4), M.grass); side.rotation.x = -Math.PI / 2; side.position.set(4.8, 0.004, -3.2); side.receiveShadow = true; g.add(side);
  const prom = new THREE.Mesh(new THREE.PlaneGeometry(19.4, 2.2), M.pavers); prom.rotation.x = -Math.PI / 2; prom.position.set(6.0, 0.006, 3.8); prom.receiveShadow = true; g.add(prom);
  const park = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 7.9), M.grassPark); park.rotation.x = -Math.PI / 2; park.position.set(11.0, 0.004, -1.1); park.receiveShadow = true; g.add(park);
  // curbs of promenade
  for (const z of [2.72, 4.9]) g.add(box(19.4, 0.06, 0.08, M.whiteStone, 6.0, 0.03, z, false));
  // front railing (low, chrome)
  for (let x = -3.6; x <= 15.4; x += 1.2) g.add(cyl(0.025, 0.025, 0.55, M.chrome, x, 0.27, 5.1, 8));
  const rail = cyl(0.03, 0.03, 19.2, M.chrome, 5.9, 0.55, 5.1, 8); rail.rotation.z = Math.PI / 2; g.add(rail);
  // back railing of park/terrace
  for (let x = 6.4; x <= 15.4; x += 1.2) g.add(cyl(0.025, 0.025, 0.7, M.chrome, x, 0.35, -5.3, 8));
  const rail2 = cyl(0.03, 0.03, 9.2, M.chrome, 10.9, 0.7, -5.3, 8); rail2.rotation.z = Math.PI / 2; g.add(rail2);
  // promenade lamps
  for (const x of [-1.5, 4.5, 9.5, 14.5]) { g.add(cyl(0.035, 0.05, 2.2, M.navy, x, 1.1, 4.75, 10)); const l = sph(0.11, std({ color: 0xffffff, emissive: 0xfff2b0, emissiveIntensity: 0.0, roughness: 0.2 }), x, 2.25, 4.75); g.add(l); W.anim.push({ lamp: l }); }
  W.colliders.push(...[-1.5, 4.5, 9.5, 14.5].map((x) => ({ x, z: 4.75, r: 0.15 })));

  // ---------- beach terrain ----------
  const bg = new THREE.PlaneGeometry(17, 16, 68, 64); bg.rotateX(-Math.PI / 2);
  const pa = bg.attributes.position;
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i) + 23.5, z = pa.getZ(i) - 0.5; pa.setY(i, groundH(x, z) + (x > 17 ? Math.sin(x * 1.3) * Math.cos(z * 1.1) * 0.03 : 0)); }
  bg.computeVertexNormals();
  const beach = new THREE.Mesh(bg, M.sand); beach.position.set(23.5, 0, -0.5); beach.receiveShadow = true; g.add(beach);
  // steps from promenade to sand
  for (let i = 0; i < 4; i++) g.add(box(0.5, 0.12, 2.0, M.whiteStone, 15.7 + i * 0.5, -0.06 - i * 0.12, 3.8, false));
  // umbrella
  const um = new THREE.Group(); um.position.set(22.5, groundH(22.5, 1.2), 1.2); g.add(um);
  um.add(cyl(0.025, 0.025, 2.0, M.chrome, 0, 1.0, 0, 8));
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.4, 16, 1, true), M.umbrella); canopy.position.y = 2.0; canopy.castShadow = true; um.add(canopy);
  W.colliders.push({ x: 22.5, z: 1.2, r: 0.15 });
  // rocks
  const rockM = std({ color: 0x9ba3a6, roughness: 0.9 }); const rr = rng(77);
  for (let i = 0; i < 9; i++) { const x = 17 + rr() * 12, z = -3.5 + rr() * 1.4; const k = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15 + rr() * 0.3, 0), rockM); k.position.set(x, groundH(x, z) - 0.05, z); k.rotation.set(rr() * 3, rr() * 3, 0); k.castShadow = true; g.add(k); }
  for (let i = 0; i < 5; i++) { const x = 26 + rr() * 4, z = 2 + rr() * 3; const k = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rr() * 0.4, 0), rockM); k.position.set(x, groundH(x, z), z); k.castShadow = true; g.add(k); }
  // distant headlands and white houses
  const hillM = std({ color: 0x6f8a7c, roughness: 1 }), wm = std({ color: 0xf3f3ef, roughness: 0.8 });
  for (const [x, z, s] of [[-40, -70, 18], [-15, -90, 14], [50, -80, 22], [80, -60, 16], [30, -110, 20]]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(s, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hillM); h.scale.set(1.6, 0.35, 1); h.position.set(x, -0.62, z); g.add(h);
    for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.2), wm); b.position.set(x + (k - 3) * 2.4, s * 0.25 + Math.sin(k) * 0.6, z + s * 0.55); g.add(b); }
  }
  // boat
  const boat = new THREE.Group(); boat.position.set(14, -0.6, -18); g.add(boat);
  const hull = box(1.8, 0.35, 0.6, M.whiteStone, 0, 0.1, 0); boat.add(hull); boat.add(box(1.8, 0.06, 0.62, M.cobalt, 0, 0.2, 0));
  boat.add(cyl(0.02, 0.02, 1.6, M.chrome, 0, 1, 0, 6));
  const sail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 3, 1, true), std({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.6 })); sail.scale.z = 0.05; sail.position.set(0.25, 1.0, 0); boat.add(sail);
  W.boat = boat;
  // gulls
  const gullM = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  W.gulls = [];
  for (let i = 0; i < 4; i++) {
    const gg = new THREE.Group(); const w1 = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.08), gullM); w1.position.x = 0.17; const w2 = w1.clone(); w2.position.x = -0.17;
    const p1 = new THREE.Group(); p1.add(w1); const p2 = new THREE.Group(); p2.add(w2); gg.add(p1, p2); g.add(gg);
    W.gulls.push({ g: gg, p1, p2, a: i * 1.6, r: 6 + i * 2, cx: 20 + i * 3, cz: -9 - i * 2, h: 4 + i * 0.7, s: 0.15 + i * 0.03 });
  }

  // ---------- house ----------
  const H = L.house, hh = H.h, th = 0.16;
  // back wall with two big windows
  const winY0 = 0.75, winY1 = 2.05;
  const backZ = H.z0 - th / 2;
  const segs = [[-3.48, -2.85], [-0.5, 0.15], [2.75, 3.48]];
  for (const [a, b] of segs) g.add(box(b - a, hh, th, M.lime, (a + b) / 2, hh / 2, backZ));
  for (const [a, b] of [[-2.85, -0.5], [0.15, 2.75]]) {
    g.add(box(b - a, winY0, th, M.lime, (a + b) / 2, winY0 / 2, backZ));
    g.add(box(b - a, hh - winY1, th, M.lime, (a + b) / 2, (hh + winY1) / 2, backZ));
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(b - a, winY1 - winY0), M.glass); gl.position.set((a + b) / 2, (winY0 + winY1) / 2, backZ); g.add(gl);
    // chrome frame
    g.add(box(b - a, 0.03, 0.05, M.chrome, (a + b) / 2, winY0, backZ + 0.06, false));
    g.add(box(b - a, 0.03, 0.05, M.chrome, (a + b) / 2, winY1, backZ + 0.06, false));
    g.add(box(0.03, winY1 - winY0, 0.05, M.chrome, (a + b) / 2, (winY0 + winY1) / 2, backZ + 0.06, false));
  }
  // left wall with window
  const lx = H.x0 - th / 2;
  g.add(box(th, hh, 1.6, M.lime, lx, hh / 2, -4.6)); g.add(box(th, hh, 1.4, M.lime, lx, hh / 2, -1.7));
  g.add(box(th, 0.8, 1.4, M.lime, lx, 0.4, -3.1)); g.add(box(th, hh - 2.0, 1.4, M.lime, lx, (hh + 2.0) / 2, -3.1));
  const lg = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), M.glass); lg.rotation.y = Math.PI / 2; lg.position.set(lx, 1.4, -3.1); g.add(lg);
  // right wall
  const rx = H.x1 + th / 2;
  g.add(box(th, hh, 4.4 + th, M.lime, rx, hh / 2, -3.2));
  // front wall cut low (dollhouse section) + door frame
  const fz = H.z1 + th / 2 - 0.08, cut = 0.32;
  g.add(box(L.door.hinge - 0.08 - H.x0 + th, cut, th, M.lime, (H.x0 - th + L.door.hinge - 0.08) / 2, cut / 2, fz));
  g.add(box(H.x1 + th - (L.door.x + L.door.w / 2 + 0.08), cut, th, M.lime, (H.x1 + th + L.door.x + L.door.w / 2 + 0.08) / 2, cut / 2, fz));
  // wall top caps (section)
  // door jambs + lintel
  const dj = std({ color: 0xf0f1ee, roughness: 0.5 });
  g.add(box(0.12, L.door.h + 0.1, th + 0.04, dj, L.door.hinge - 0.08, (L.door.h + 0.1) / 2, fz));
  g.add(box(0.12, L.door.h + 0.1, th + 0.04, dj, L.door.x + L.door.w / 2 + 0.08, (L.door.h + 0.1) / 2, fz));
  g.add(box(L.door.w + 0.28, 0.14, th + 0.04, dj, L.door.x, L.door.h + 0.1, fz));
  // door leaf
  const doorPivot = new THREE.Group(); doorPivot.position.set(L.door.hinge - 0.02, 0, fz); g.add(doorPivot);
  const leaf = box(L.door.w - 0.04, L.door.h - 0.02, 0.06, M.cobaltGloss, (L.door.w - 0.04) / 2, L.door.h / 2, 0); doorPivot.add(leaf);
  for (let i = 0; i < 2; i++) leaf.add(box(L.door.w * 0.62, L.door.h * 0.32, 0.02, M.cobaltGloss, 0, (i - 0.5) * L.door.h * 0.42, 0.035));
  const knob = sph(0.04, M.chrome, L.door.w * 0.38, 0.02, 0.06); leaf.add(knob);
  const knob2 = sph(0.04, M.chrome, L.door.w * 0.38, 0.02, -0.06); leaf.add(knob2);
  W.door = { pivot: doorPivot, leaf, open: 0, target: 0 };
  // door step + house number tile
  g.add(box(1.2, 0.04, 0.5, M.whiteStone, L.door.x, 0.02, -0.7, false));
  // cornice on top of walls
  g.add(box(H.x1 - H.x0 + th * 2, 0.08, 0.26, M.limeCap, 0, hh + 0.04, backZ));
  g.add(box(0.26, 0.08, 4.6, M.limeCap, lx, hh + 0.04, -3.2)); g.add(box(0.26, 0.08, 4.6, M.limeCap, rx, hh + 0.04, -3.2));
  g.add(box(H.x1 - H.x0 + 0.3, 0.16, 6.4, M.limeCap, 0, -0.08, -3.2, false)); // plinth edge

  // interior ---------------------------------------------------
  // kitchen island (dark wood + white stone top)
  const I = L.island;
  g.add(box(I.w, I.y - 0.04, I.d, M.wood, I.x, (I.y - 0.04) / 2, I.z));
  g.add(box(I.w + 0.06, 0.05, I.d + 0.06, M.whiteStone, I.x, I.y - 0.02, I.z));
  W.surfaces.push({ id: 'island', x0: I.x - I.w / 2, x1: I.x + I.w / 2, z0: I.z - I.d / 2, z1: I.z + I.d / 2, y: I.y });
  for (let k = -1; k <= 1; k++) W.colliders.push({ x: I.x + k * 0.5, z: I.z, r: 0.38 });
  // back counter + shelves on the back wall (left part)
  g.add(box(1.2, 0.85, 0.32, M.wood, -2.65, 0.425, -5.2)); g.add(box(1.24, 0.04, 0.34, M.whiteStone, -2.65, 0.87, -5.2));
  g.add(cyl(0.12, 0.12, 0.02, M.chrome, -2.4, 0.89, -5.1, 16));
  const tap = cyl(0.015, 0.015, 0.25, M.chrome, -2.4, 1.0, -5.28, 8); g.add(tap);
  g.add(box(0.6, 0.03, 0.22, M.wood, -1.6, 1.55, -5.22, false));
  const jarM = std({ color: 0x1f4fae, roughness: 0.25 });
  for (let i = 0; i < 3; i++) g.add(cyl(0.05, 0.05, 0.14, i === 1 ? M.emerald : jarM, -1.8 + i * 0.2, 1.64, -5.22, 12));
  // pitcher (glass) on island — papa's prop
  const pitcher = new THREE.Group(); pitcher.position.set(I.x + 0.5, I.y, I.z); g.add(pitcher);
  const pg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.24, 18, 1, true), M.glassThick); pg.position.y = 0.12; pitcher.add(pg);
  const juiceM = new THREE.MeshPhysicalMaterial({ color: 0xf5d20f, roughness: 0.1, transparent: true, opacity: 0.85, transmission: 0 });
  const pj = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.065, 0.16, 18), juiceM); pj.position.y = 0.08; pitcher.add(pj);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 12, Math.PI), M.glassThick); handle.position.set(0.09, 0.13, 0); handle.rotation.z = -Math.PI / 2; pitcher.add(handle);
  W.pitcher = pitcher; W.juiceM = juiceM;
  // teapot (mama's prop) on back counter
  const teapot = new THREE.Group(); teapot.position.set(I.x - 0.5, I.y, I.z + 0.05); g.add(teapot);
  const tpM = std({ color: 0xf3f4f1, roughness: 0.18 });
  const tb = sph(0.1, tpM, 0, 0.09, 0); tb.scale.y = 0.85; teapot.add(tb);
  const sp = cyl(0.012, 0.022, 0.12, tpM, 0.12, 0.11, 0, 8); sp.rotation.z = -0.9; teapot.add(sp);
  teapot.add(cyl(0.035, 0.035, 0.03, M.cobalt, 0, 0.18, 0, 10));
  W.teapot = teapot; W.teapotHome = teapot.position.clone();
  // fruit basket default spot / bread board etc. (decor)
  g.add(box(0.3, 0.02, 0.2, M.wood, I.x + 0.15, I.y + 0.01, I.z - 0.12, false));

  // dining table (dark wood)
  const D = L.dining;
  g.add(box(D.w, 0.05, D.d, M.wood, D.x, D.y - 0.025, D.z));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.05, D.y - 0.05, 0.05, M.wood, D.x + sx * (D.w / 2 - 0.08), (D.y - 0.05) / 2, D.z + sz * (D.d / 2 - 0.08)));
  W.surfaces.push({ id: 'dining', x0: D.x - D.w / 2, x1: D.x + D.w / 2, z0: D.z - D.d / 2, z1: D.z + D.d / 2, y: D.y });
  W.colliders.push({ x: D.x - 0.4, z: D.z, r: 0.5 }, { x: D.x + 0.4, z: D.z, r: 0.5 });
  // glass tea cups (props) on table
  W.cups = [];
  const teaM = std({ color: 0x8c6d2a, roughness: 0.15, transparent: true, opacity: 0.8 });
  for (const [cx, cz] of [[-0.45, -0.25], [0.45, -0.25], [-0.6, 0.22], [0.6, 0.22]]) {
    const c = new THREE.Group(); c.position.set(D.x + cx, D.y, D.z + cz); g.add(c);
    const cg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.08, 14, 1, true), M.glassThick); cg.position.y = 0.04; c.add(cg);
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.05, 14), teaM); tea.position.y = 0.025; tea.scale.y = 0.01; tea.visible = false; c.add(tea);
    W.cups.push({ g: c, tea, fill: 0 });
  }
  // caustic light patches (refraction through glass)
  const caus = T.caustic();
  const causM = new THREE.MeshBasicMaterial({ map: caus, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x7fb6ff });
  for (const [x, y, z, s] of [[D.x + 0.15, D.y + 0.003, D.z + 0.05, 0.6], [-1.6, 0.012, -4.9, 1.6], [1.4, 0.012, -4.6, 1.4], [I.x - 0.25, I.y + 0.003, I.z + 0.1, 0.45]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.7), causM); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); g.add(p); W.decals.push(p);
  }
  W.causM = causM; W.causT = caus;

  // sofa (navy) + cushions
  const S = L.sofa;
  g.add(box(1.9, 0.4, 0.75, M.fabricNavy, S.x, 0.2, S.z)); g.add(box(1.9, 0.5, 0.18, M.fabricNavy, S.x, 0.55, S.z - 0.3));
  for (const sx of [-1, 1]) g.add(box(0.16, 0.55, 0.75, M.fabricNavy, S.x + sx * 0.95, 0.28, S.z));
  g.add(box(0.35, 0.3, 0.1, M.lemon, S.x - 0.55, 0.55, S.z - 0.15)); g.add(box(0.35, 0.3, 0.1, M.emerald, S.x + 0.55, 0.55, S.z - 0.15));
  W.colliders.push({ x: S.x - 0.5, z: S.z - 0.12, r: 0.36 }, { x: S.x + 0.5, z: S.z - 0.12, r: 0.36 });
  W.seats.push({ id: 'sofa1', x: S.x - 0.45, z: S.z + 0.12, y: 0.42, yaw: 0, type: 'sofa' }, { id: 'sofa2', x: S.x + 0.45, z: S.z + 0.12, y: 0.42, yaw: 0, type: 'sofa' });
  // rug
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), M.rugMat); rug.rotation.x = -Math.PI / 2; rug.position.set(L.rug.x, 0.01, L.rug.z); rug.receiveShadow = true; g.add(rug);
  // shelf on right wall
  const SH = L.shelf;
  g.add(box(0.3, 0.04, 0.9, M.wood, SH.x, SH.y, SH.z)); g.add(box(0.3, 0.04, 0.9, M.wood, SH.x, SH.y + 0.5, SH.z));
  g.add(box(0.3, SH.y, 0.04, M.wood, SH.x, SH.y / 2, SH.z - 0.43)); g.add(box(0.3, SH.y, 0.04, M.wood, SH.x, SH.y / 2, SH.z + 0.43));
  for (let i = 0; i < 4; i++) g.add(box(0.18, 0.22, 0.05, [M.cobalt, M.emerald, M.lemon, M.navy][i], SH.x, SH.y + 0.63, SH.z - 0.3 + i * 0.16, false));
  W.surfaces.push({ id: 'shelf', x0: SH.x - 0.2, x1: SH.x + 0.2, z0: SH.z - 0.42, z1: SH.z + 0.42, y: SH.y + 0.02 });
  W.colliders.push({ x: SH.x, z: SH.z, r: 0.3 });
  // door bench + coat rack
  const DB = L.doorBench;
  g.add(box(0.36, 0.05, 0.7, M.wood, DB.x, DB.y, DB.z)); for (const sz of [-1, 1]) g.add(box(0.3, DB.y, 0.04, M.wood, DB.x, DB.y / 2, DB.z + sz * 0.3));
  W.surfaces.push({ id: 'doorBench', x0: DB.x - 0.18, x1: DB.x + 0.18, z0: DB.z - 0.35, z1: DB.z + 0.35, y: DB.y + 0.025 });
  W.colliders.push({ x: DB.x, z: DB.z, r: 0.25 });
  const RK = L.rack; g.add(cyl(0.02, 0.02, 1.5, M.chrome, RK.x, 0.75, RK.z, 8)); g.add(cyl(0.15, 0.15, 0.02, M.chrome, RK.x, 0.01, RK.z, 16));
  for (let k = 0; k < 3; k++) { const hk = cyl(0.01, 0.01, 0.14, M.chrome, RK.x + Math.cos(k * 2.1) * 0.06, 1.45, RK.z + Math.sin(k * 2.1) * 0.06, 6); hk.rotation.z = 0.8; g.add(hk); }
  W.rackTop = new THREE.Vector3(RK.x, 1.52, RK.z);
  W.colliders.push({ x: RK.x, z: RK.z, r: 0.15 });
  // dog bed + water bowl
  const bed = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.1, 10, 24), M.emerald); bed.rotation.x = -Math.PI / 2; bed.position.set(L.dogBed.x, 0.08, L.dogBed.z); bed.castShadow = true; g.add(bed);
  const bedIn = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), std({ color: 0xe7ebe6, roughness: 1 })); bedIn.rotation.x = -Math.PI / 2; bedIn.position.set(L.dogBed.x, 0.03, L.dogBed.z); g.add(bedIn);
  const bowl = cyl(0.11, 0.08, 0.06, M.chrome, L.waterBowl.x, 0.03, L.waterBowl.z, 18); g.add(bowl);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.095, 18), std({ color: 0x5aa7d6, roughness: 0.05, envMapIntensity: 1.5 })); water.rotation.x = -Math.PI / 2; water.position.set(L.waterBowl.x, 0.055, L.waterBowl.z); g.add(water);
  // indoor plant, floor lamp, art
  pottedPlant(g, M, -3.0, -1.5, 'leafy', 1.4, 5); W.colliders.push({ x: -3.0, z: -1.5, r: 0.25 });
  pottedPlant(g, M, 0.55, -5.1, 'lemon', 1.0, 15); W.colliders.push({ x: 0.55, z: -5.1, r: 0.22 });
  g.add(cyl(0.015, 0.015, 1.5, M.chrome, 3.0, 0.75, -4.6, 8)); g.add(cyl(0.12, 0.18, 0.18, M.whiteStone, 3.0, 1.55, -4.6, 16));
  const art = box(0.9, 0.6, 0.03, std({ map: T.stripes('#0f6b55', '#f2f3f0', [3, 1]), roughness: 0.6 }), -2.0, 1.75, backZ + 0.1, false); g.add(art);
  // house interior lights (evening)
  const il = new THREE.PointLight(0xffe7a8, 0, 7, 1.6); il.position.set(-0.6, 2.0, -3.2); g.add(il); W.houseLight = il;

  // ---------- garden ----------
  // low garden walls with gate
  const gw = 0.42;
  g.add(box(L.gate.x - L.gate.w / 2 - (-3.55), gw, 0.16, M.lime, (-3.55 + L.gate.x - L.gate.w / 2) / 2, gw / 2, 2.6));
  g.add(box(6.3 - (L.gate.x + L.gate.w / 2), gw, 0.16, M.lime, (6.3 + L.gate.x + L.gate.w / 2) / 2, gw / 2, 2.6));
  g.add(box(0.16, gw, 3.7, M.lime, -3.55, gw / 2, 0.8)); g.add(box(0.16, gw, 3.7, M.lime, 6.25, gw / 2, 0.8));
  g.add(box(0.16, gw, 4.6, M.lime, 6.25, gw / 2, -3.3));
  for (const sx of [-1, 1]) g.add(box(0.22, 0.75, 0.22, M.lime, L.gate.x + sx * (L.gate.w / 2 + 0.05), 0.375, 2.6));
  const gateLeaf = box(0.5, 0.5, 0.04, M.cobaltGloss, 0, 0.3, 0); const gp = new THREE.Group(); gp.position.set(L.gate.x - L.gate.w / 2, 0, 2.62); gateLeaf.position.x = 0.25; gp.add(gateLeaf); gp.rotation.y = -1.9; g.add(gp);
  // stepping stones
  for (let i = 0; i < 5; i++) { const t = i / 4; const s = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.03, 18), M.whiteStone); s.position.set(L.door.x + (L.gate.x - L.door.x) * t, 0.015, -0.45 + t * 2.7); s.receiveShadow = true; g.add(s); }
  // garden table (round white stone, chrome pedestal) + chairs + bench
  const GT = L.gTable;
  g.add(cyl(GT.r, GT.r, 0.04, M.whiteStone, GT.x, GT.y - 0.02, GT.z, 28)); g.add(cyl(0.04, 0.05, GT.y - 0.04, M.chrome, GT.x, (GT.y - 0.04) / 2, GT.z, 10)); g.add(cyl(0.25, 0.25, 0.02, M.chrome, GT.x, 0.01, GT.z, 20));
  W.surfaces.push({ id: 'gTable', x0: GT.x - GT.r * 0.75, x1: GT.x + GT.r * 0.75, z0: GT.z - GT.r * 0.75, z1: GT.z + GT.r * 0.75, y: GT.y });
  W.colliders.push({ x: GT.x, z: GT.z, r: 0.55 });
  // garden bench (dark wood) behind table, facing camera
  g.add(box(1.3, 0.05, 0.36, M.wood, GT.x, 0.42, GT.z - 0.85)); g.add(box(1.3, 0.35, 0.05, M.wood, GT.x, 0.65, GT.z - 1.02));
  for (const sx of [-1, 1]) g.add(box(0.05, 0.42, 0.3, M.wood, GT.x + sx * 0.6, 0.21, GT.z - 0.85));
  W.seats.push({ id: 'gbench1', x: GT.x - 0.32, z: GT.z - 0.8, y: 0.44, yaw: 0, type: 'bench' }, { id: 'gbench2', x: GT.x + 0.32, z: GT.z - 0.8, y: 0.44, yaw: 0, type: 'bench' });
  W.colliders.push({ x: GT.x - 0.4, z: GT.z - 0.9, r: 0.25, seat: true }, { x: GT.x + 0.4, z: GT.z - 0.9, r: 0.25, seat: true });
  // table lanterns (jars)
  W.jarLights = [];
  for (const [dx, dz] of [[-0.22, 0.1], [0.25, -0.12]]) {
    const j = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 14), M.glassThick); j.position.set(GT.x + dx, GT.y + 0.06, GT.z + dz); g.add(j);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); fl.position.copy(j.position); fl.visible = false; g.add(fl); W.jarLights.push(fl);
  }
  // lantern post
  const LP = L.lantern, lant = new THREE.Group(); lant.position.set(LP.x, 0, LP.z); g.add(lant);
  lant.add(cyl(0.04, 0.06, 1.35, M.navy, 0, 0.675, 0, 10)); lant.add(cyl(0.16, 0.18, 0.06, M.navy, 0, 0.03, 0, 14));
  const lhead = new THREE.Group(); lhead.position.y = 1.5; lant.add(lhead);
  lhead.add(box(0.26, 0.03, 0.26, M.chrome, 0, -0.15, 0)); const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 4), M.chrome); cap.position.y = 0.2; cap.rotation.y = Math.PI / 4; cap.castShadow = true; lhead.add(cap);
  const lg2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), M.glassThick); lhead.add(lg2);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) lhead.add(box(0.02, 0.3, 0.02, M.chrome, sx * 0.11, 0, sz * 0.11, false));
  const bulbM = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd23c, emissiveIntensity: 0.1, roughness: 0.3 });
  const bulb = sph(0.06, bulbM, 0, 0, 0, false); lhead.add(bulb);
  const glowS = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); glowS.scale.set(1.4, 1.4, 1); lhead.add(glowS);
  const lpl = new THREE.PointLight(0xffd36a, 0, 6, 1.5); lpl.position.set(LP.x, 1.5, LP.z); g.add(lpl);
  const lpl2 = new THREE.PointLight(0xffe08a, 0, 4, 1.6); lpl2.position.set(GT.x, 1.0, GT.z); g.add(lpl2);
  W.lantern = { group: lant, head: lhead, bulbM, glow: glowS, light: lpl, light2: lpl2, pos: new THREE.Vector3(LP.x, 1.5, LP.z) };
  W.colliders.push({ x: LP.x, z: LP.z, r: 0.18 });
  // string lights along the house front edge
  W.bulbs = [];
  const sbM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd76a, emissiveIntensity: 0.0, roughness: 0.3 });
  for (let i = 0; i <= 14; i++) { const t = i / 14; const x = -3.3 + t * 9.3, y = 2.25 - Math.sin(t * Math.PI * 3) * 0.12 * 0 - Math.abs(Math.sin(t * Math.PI * 2)) * 0.25; const b = sph(0.035, sbM, x, y + 0.05, 2.45 - t * 0, false); g.add(b); W.bulbs.push(b); }
  for (const x of [-3.3, 6.0]) g.add(cyl(0.025, 0.025, 2.3, M.navy, x, 1.15, 2.45, 8));
  W.bulbM = sbM;
  // plants in garden
  W.trees = [];
  W.trees.push(oliveTree(g, M, -2.95, 2.05, 2.1, 11)); W.colliders.push({ x: -2.95, z: 2.05, r: 0.25 });
  pottedPlant(g, M, 1.35, -0.6, 'agave', 1, 4); W.colliders.push({ x: 1.35, z: -0.6, r: 0.22 });
  pottedPlant(g, M, 4.8, 0.2, 'lemon', 1.2, 8); W.colliders.push({ x: 4.8, z: 0.2, r: 0.25 });
  pottedPlant(g, M, 5.6, 2.0, 'agave', 1.1, 6); W.colliders.push({ x: 5.6, z: 2.0, r: 0.22 });
  hedge(g, M, -3.2, -1.2, 2.35, 21); hedge(g, M, 4.0, 6.0, 2.35, 22);
  W.colliders.push({ x: -2.2, z: 2.35, r: 0.25 }, { x: -1.6, z: 2.35, r: 0.25 }, { x: 4.4, z: 2.35, r: 0.25 }, { x: 5.2, z: 2.35, r: 0.25 });

  // ---------- park ----------
  W.trees.push(oliveTree(g, M, 7.3, -3.7, 2.5, 31)); W.colliders.push({ x: 7.3, z: -3.7, r: 0.25 });
  W.trees.push(oliveTree(g, M, 14.6, 0.4, 2.3, 32)); W.colliders.push({ x: 14.6, z: 0.4, r: 0.25 });
  W.trees.push(oliveTree(g, M, 15.0, -4.2, 2.0, 33));
  // slide: ladder at back, chute toward +z
  const SL = L.slide, slide = new THREE.Group(); slide.position.set(SL.x, 0, SL.z); g.add(slide);
  for (const sx of [-1, 1]) { slide.add(cyl(0.03, 0.03, 1.2, M.chrome, sx * 0.22, 0.6, -0.55, 8)); slide.add(cyl(0.03, 0.03, 1.2, M.chrome, sx * 0.22, 0.6, -0.15, 8)); }
  for (let i = 0; i < 4; i++) { const r = cyl(0.015, 0.015, 0.44, M.chrome, 0, 0.25 + i * 0.25, -0.55, 6); r.rotation.z = Math.PI / 2; slide.add(r); }
  slide.add(box(0.5, 0.05, 0.45, M.emerald, 0, 1.0, -0.35));
  const chute = box(0.42, 0.04, 1.6, M.lemon, 0, 0.55, 0.55); chute.rotation.x = 0.6; slide.add(chute);
  for (const sx of [-1, 1]) { const r = box(0.03, 0.1, 1.6, M.lemon, sx * 0.22, 0.6, 0.55); r.rotation.x = 0.6; slide.add(r); }
  W.colliders.push({ x: SL.x, z: SL.z - 0.35, r: 0.35 }, { x: SL.x, z: SL.z + 0.5, r: 0.25 });
  W.slideTop = { x: SL.x, y: 1.03, z: SL.z - 0.35 }; W.slideBase = { x: SL.x, z: SL.z - 0.85 }; W.slideEnd = { x: SL.x, z: SL.z + 1.25 };
  // swing
  const SW = L.swing, sw = new THREE.Group(); sw.position.set(SW.x, 0, SW.z); g.add(sw);
  for (const sx of [-1, 1]) { const a = cyl(0.04, 0.04, 1.75, M.emerald, sx * 0.8, 0.85, 0, 8); a.rotation.z = sx * 0.12; sw.add(a); }
  const top = cyl(0.04, 0.04, 1.8, M.emerald, 0, 1.68, 0, 8); top.rotation.z = Math.PI / 2; sw.add(top);
  W.swings = [];
  for (const sx of [-0.38, 0.38]) {
    const p = new THREE.Group(); p.position.set(sx, 1.66, 0); sw.add(p);
    for (const k of [-1, 1]) p.add(cyl(0.006, 0.006, 1.25, M.chrome, k * 0.14, -0.625, 0, 4));
    p.add(box(0.34, 0.03, 0.16, M.wood, 0, -1.25, 0));
    W.swings.push({ pivot: p, x: SW.x + sx, z: SW.z, occupant: null, t: Math.random() * 6 });
  }
  W.colliders.push({ x: SW.x - 0.8, z: SW.z, r: 0.12 }, { x: SW.x + 0.8, z: SW.z, r: 0.12 });
  // park bench
  const PB = L.parkBench;
  g.add(box(1.3, 0.05, 0.36, M.wood, PB.x, 0.42, PB.z)); g.add(box(1.3, 0.35, 0.05, M.wood, PB.x, 0.65, PB.z - 0.17));
  for (const sx of [-1, 1]) g.add(box(0.05, 0.42, 0.3, M.navy, PB.x + sx * 0.6, 0.21, PB.z));
  W.seats.push({ id: 'pbench1', x: PB.x - 0.32, z: PB.z + 0.05, y: 0.44, yaw: 0, type: 'bench' }, { id: 'pbench2', x: PB.x + 0.32, z: PB.z + 0.05, y: 0.44, yaw: 0, type: 'bench' });
  W.colliders.push({ x: PB.x - 0.4, z: PB.z - 0.05, r: 0.24, seat: true }, { x: PB.x + 0.4, z: PB.z - 0.05, r: 0.24, seat: true });
  // promenade benches (face camera / sea)
  for (const B of L.promBench) {
    g.add(box(1.3, 0.05, 0.36, M.wood, B.x, 0.42, B.z - 0.15)); g.add(box(1.3, 0.35, 0.05, M.wood, B.x, 0.65, B.z - 0.32));
    for (const sx of [-1, 1]) g.add(box(0.05, 0.42, 0.3, M.navy, B.x + sx * 0.6, 0.21, B.z - 0.15));
    W.seats.push({ id: 'prb' + B.x + 'a', x: B.x - 0.32, z: B.z - 0.1, y: 0.44, yaw: 0, type: 'bench' }, { id: 'prb' + B.x + 'b', x: B.x + 0.32, z: B.z - 0.1, y: 0.44, yaw: 0, type: 'bench' });
    W.colliders.push({ x: B.x - 0.4, z: B.z - 0.2, r: 0.22, seat: true }, { x: B.x + 0.4, z: B.z - 0.2, r: 0.22, seat: true });
  }
  // shadow blob texture for held items
  W.blobT = T.shadowBlob();
  return W;
}

// palette for day / evening
const C = (h) => new THREE.Color(h);
const DAY = { top: C(0x2c6fd6), hor: C(0xd3ecff), fog: C(0xd3ecff), hemiS: C(0xa9cdff), hemiG: C(0xe9e6dc), hemiI: 0.85, sunC: C(0xfffaf0), sunI: 2.7, sea: C(0x0f5d8c), sunPos: new THREE.Vector3(-5, 12, 6) };
const EVE = { top: C(0x0d1b44), hor: C(0xe8c25a), fog: C(0x5c5a6e), hemiS: C(0x3b4d86), hemiG: C(0x2a2a33), hemiI: 0.45, sunC: C(0xffc874), sunI: 0.55, sea: C(0x0b2b4f), sunPos: new THREE.Vector3(-14, 3, -10) };
export function applyTime(W, scene, e, renderer) {
  const lerpC = (a, b, o) => o.copy(a).lerp(b, e);
  lerpC(DAY.top, EVE.top, W.skyU.top.value); lerpC(DAY.hor, EVE.hor, W.skyU.hor.value);
  lerpC(DAY.fog, EVE.fog, W.fog.color);
  lerpC(DAY.hemiS, EVE.hemiS, W.hemi.color); lerpC(DAY.hemiG, EVE.hemiG, W.hemi.groundColor); W.hemi.intensity = DAY.hemiI + (EVE.hemiI - DAY.hemiI) * e;
  lerpC(DAY.sunC, EVE.sunC, W.sun.color); W.sun.intensity = DAY.sunI + (EVE.sunI - DAY.sunI) * e;
  lerpC(DAY.sea, EVE.sea, W.seaMat.color);
  W.sunOffset = DAY.sunPos.clone().lerp(EVE.sunPos, e);
  W.skyU.sunDir.value.copy(W.sunOffset).normalize();
  scene.environment = e > 0.5 ? W.envNight : W.envDay;
  scene.environmentIntensity = 1 - e * 0.5;
  const lt = W.lantern;
  lt.bulbM.emissiveIntensity = 0.1 + e * 3.5; lt.glow.material.opacity = e * 0.9; lt.light.intensity = e * 6; lt.light2.intensity = e * 2.5;
  W.bulbM.emissiveIntensity = e * 2.5; W.houseLight.intensity = e * 5;
  for (const j of W.jarLights) j.visible = e > 0.3;
  for (const a of W.anim) if (a.lamp) a.lamp.material.emissiveIntensity = e * 2;
  W.causM.opacity = 0.35 * (1 - e);
}
