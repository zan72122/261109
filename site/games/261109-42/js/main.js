// みんないるよ！うみのおうち — game logic: one-finger hero, autonomous family, outings, music, memory.
import * as THREE from 'three';
import { buildWorld, applyTime, L, constrain, clampPoint, regionAt, zoneAt, groundH, surfaceType, RECTS, inDoorway, inGateway } from './world.js';
import { makeHuman, animHuman, makeDog, animDog, makeHat } from './people.js';
import { AudioSys } from './audio.js';
import { T } from './tex.js';

const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const pickR = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------- renderer / scene ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 900);
const W = buildWorld(scene, renderer);
const audio = new AudioSys(); audio.loadManifest();
window.__game = { audio, W };

let time = 0;
const S = {
  outing: false, prep: false, prepT: 0, evening: false, eveningT: 0, guestIn: false, guestInvited: false, guestGreetT: 0,
  friendArrived: false, unpacked: false, firstInput: false, lastInput: 0, heroSaidOut: -99, hintDone: false,
  stats: { feast: 0, fetch: 0, music: 0, outing: 0, evening: 0, gifts: 0 }, cool: {}, lastVoiceT: 0, outSeen: {},
  nextCall: 22, homeSince: 0, friendDue: 0,
};
const can = (k, s) => { if ((S.cool[k] || -99) > time) return false; S.cool[k] = time + s; return true; };

// ---------- save ----------
const SKEY = 'umino42_save_v1';
let saved = null; try { saved = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { saved = null; }

// ---------- characters ----------
const chars = [];
const ana = new Uint8Array(128);
function mkChar(id, rig, o = {}) {
  const c = {
    id, rig, pos: new V3(), yaw: 0, yawTarget: null, reg: 'H', goal: null, goalTol: 0.12, speed: o.speed || 1.3, speedMul: 1, vel: 0, moveSpeed: 0,
    isDog: rig.kind === 'dog', kid: !!o.kid, rad: o.rad || 0.16,
    st: { pose: 'idle', poseT: 0, speed: 0, talk: 0, lookYaw: 0, lookPitch: 0, reach: 0, smile: 0, hold: false, sitDrop: 0, clapT: 0, hitL: 0, hitR: 0, wag: 0.3 },
    holding: null, seat: null, gen: null, pri: 0, wait: 0, waitFn: null, look: null, lookUntil: 0, talkUntil: 0, analyser: null,
    withHero: false, present: true, stepAcc: 0, fixedY: null, onCancel: null, prop: null, voice: o.voice || null, rate: o.rate || 1,
  };
  scene.add(rig.root); chars.push(c); return c;
}
const denim = T.denim();
const hero = mkChar('hero', makeHuman({ name: 'hero', kid: true, shirt: 0xf4f5f2, shortSleeve: true, dress: 0x2f5a95, dressMap: denim, pants: 0, bareLegs: true, hair: 0x2a1d16, hairStyle: 'bob', shoes: 0xf2cf0c }), { speed: 4.2, kid: true, rad: 0.14 });
const papa = mkChar('papa', makeHuman({ name: 'papa', shirt: 0x2a5db8, pants: 0x1b2a4a, hair: 0x1c1612, hairStyle: 'short', shoes: 0x2b2420, glasses: true, scale: 1.0 }), { speed: 1.25 });
const mama = mkChar('mama', makeHuman({ name: 'mama', shirt: 0xf4f5f2, apron: 0x0f6b55, dress: 0x1b2d57, pants: 0, bareLegs: true, hair: 0x2b1c14, hairStyle: 'bun', shoes: 0x1b2d57, scale: 0.95 }), { speed: 1.3 });
const sib = mkChar('sib', makeHuman({ name: 'sib', kid: true, shirt: 0xf4f5f2, stripes: 0x1b2d57, shortSleeve: true, pantsMap: denim, pants: 0, shorts: true, bareLegs: true, hair: 0x241a14, hairStyle: 'short', shoes: 0x1f4fae, scale: 0.9 }), { speed: 1.7, kid: true, rad: 0.13 });
const guest = mkChar('guest', makeHuman({ name: 'guest', kid: true, shirt: 0xf4f5f2, shortSleeve: true, dress: 0x0f6b55, pants: 0, bareLegs: true, hair: 0x3a2618, hairStyle: 'tails', shoes: 0xf4f5f2, scale: 0.97 }), { speed: 1.6, kid: true, rad: 0.14 });
const friend = mkChar('friend', makeHuman({ name: 'friend', kid: true, shirt: 0xf5d00f, shortSleeve: true, pants: 0x1b2d57, shorts: true, bareLegs: true, hair: 0x15110e, hairStyle: 'bob', shoes: 0x1b2d57, scale: 0.95 }), { speed: 1.6, kid: true, rad: 0.14, rate: 1.1 });
const dog = mkChar('dog', makeDog(), { speed: 1.6, rad: 0.15 });
const npcs = [papa, mama, sib, guest, friend, dog];
const family = [papa, mama, sib, dog];
// props worn/held by NPCs
const mamaHat = makeHat('white'); mamaHat.scale.setScalar(1.35); mamaHat.visible = false; mama.rig.hatAnchor.add(mamaHat);
const basket = new THREE.Group();
{ const bm = new THREE.MeshStandardMaterial({ color: 0xd9d3c3, roughness: 0.9 }); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.14, 16), bm); b.position.y = 0.07; b.castShadow = true; basket.add(b); const h = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.01, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1f4fae, roughness: 0.5 })); h.position.y = 0.14; basket.add(h); const cl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.16), new THREE.MeshStandardMaterial({ map: T.gingham(), roughness: 0.9 })); cl.position.y = 0.14; basket.add(cl); }
basket.visible = false; scene.add(basket);
const basketState = { where: 'home', pos: new V3() }; // home | papa | ground

// ---------- items ----------
const items = []; const chairs = [];
const std = (p) => new THREE.MeshStandardMaterial(p);
function mkItem(id, kind, mesh, home, o = {}) {
  const it = { id, kind, mesh, pos: new V3(home.x, home.y, home.z), yaw: o.yaw || 0, home: { ...home }, state: 'free', holder: null, moved: false, spread: false, vel: new V3(), rolling: false, reg: regionAt(home.x, home.z), h: o.h || 0.12, packable: !!o.packable, bite: 0, seats: null };
  mesh.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.userData.pick = it; } });
  scene.add(mesh); items.push(it); return it;
}
function buildItems() {
  const M = W.M, D = L.dining, I = L.island;
  // cake
  { const g = new THREE.Group(); const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.015, 24), M.whiteStone); plate.position.y = 0.008; g.add(plate);
    const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 24), std({ color: 0xfbfbf7, roughness: 0.55 })); cake.position.y = 0.065; g.add(cake);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.02, 24, 1, true), std({ color: 0xf5d00f, roughness: 0.4 })); band.position.y = 0.04; g.add(band);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; const s = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 12), std({ color: 0xf7d814, roughness: 0.35 })); s.position.set(Math.cos(a) * 0.07, 0.12, Math.sin(a) * 0.07); s.rotation.x = 0.3; g.add(s); }
    const mint = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), std({ color: 0x1f7a4a })); mint.position.y = 0.125; g.add(mint);
    mkItem('cake', 'food', g, { x: D.x - 0.25, y: D.y, z: D.z + 0.05 }, { h: 0.14 }); }
  // fruit bowl
  { const g = new THREE.Group(); const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 10, 0, 6.283, Math.PI / 2, Math.PI / 2), M.glassThick); bowl.scale.y = 0.55; bowl.position.y = 0.075; g.add(bowl);
    const cols = [0xf5d00f, 0xf5d00f, 0x7fb33a, 0x2a3f8f, 0x7fb33a, 0xf5d00f, 0x2a3f8f];
    cols.forEach((c, i) => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), std({ color: c, roughness: 0.45 })); const a = i / cols.length * 6.283; f.position.set(Math.cos(a) * 0.06 * (i % 2 ? 1 : 0.4), 0.06 + (i % 3) * 0.025, Math.sin(a) * 0.06); if (c === 0xf5d00f) f.scale.set(1, 0.85, 0.85); g.add(f); });
    mkItem('fruit', 'food', g, { x: I.x - 0.05, y: I.y, z: I.z + 0.05 }, { h: 0.13 }); }
  // juice glass
  { const g = new THREE.Group(); const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.14, 16, 1, true), M.glassThick); gl.position.y = 0.07; g.add(gl);
    const j = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 16), W.juiceM); j.position.y = 0.055; g.add(j);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 6), std({ color: 0x1f4fae })); straw.position.set(0.015, 0.13, 0); straw.rotation.z = 0.2; g.add(straw);
    mkItem('juice', 'drink', g, { x: D.x + 0.35, y: D.y, z: D.z + 0.08 }, { h: 0.15 }); }
  // sandwich plate (packed for picnic by default)
  { const g = new THREE.Group(); const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.015, 20), M.whiteStone); plate.position.y = 0.008; g.add(plate);
    for (let i = 0; i < 2; i++) { const w = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.025, 3), std({ color: 0xf6f3e8, roughness: 0.9 })); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.083, 0.012, 3), std({ color: 0x2e8a3e, roughness: 0.7 })); const b2 = b.clone(); b.position.y = 0.012; l.position.y = 0.03; b2.position.y = 0.048; w.add(b, l, b2); w.position.set(i ? 0.05 : -0.05, 0.015, 0); w.rotation.y = i ? 0.5 : 2.1; g.add(w); }
    mkItem('sandwich', 'food', g, { x: I.x - 0.35, y: I.y, z: I.z + 0.12 }, { h: 0.08, packable: true }); }
  // ball (dog starts holding it)
  { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 12), std({ color: 0xf5d00f, roughness: 0.5 })); b.position.y = 0.075; g.add(b); const s = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 24), std({ color: 0x1f4fae, roughness: 0.5 })); s.position.y = 0.075; g.add(s); g.userData.ball = b;
    mkItem('ball', 'ball', g, { x: 0.9, y: 0, z: -1.9 }, { h: 0.15 }); }
  // drum
  { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.13, 22, 1, true), M.cobaltGloss); body.position.y = 0.065; body.material.side = THREE.DoubleSide; g.add(body);
    const skin = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.008, 22), std({ color: 0xf4f2ea, roughness: 0.7 })); skin.position.y = 0.13; g.add(skin);
    for (const y of [0.012, 0.128]) { const r = new THREE.Mesh(new THREE.TorusGeometry(y > 0.1 ? 0.13 : 0.11, 0.008, 6, 22), M.chrome); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
    mkItem('drum', 'instrument', g, { x: L.rug.x + 0.35, y: 0, z: L.rug.z + 0.3 }, { h: 0.14 }); }
  // tambourine
  { const g = new THREE.Group(); const r = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 24), M.wood); r.rotation.x = Math.PI / 2; r.position.y = 0.02; g.add(r);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; const j = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 10), M.chrome); j.position.set(Math.cos(a) * 0.09, 0.02, Math.sin(a) * 0.09); j.rotation.z = Math.PI / 2; j.rotation.y = -a; g.add(j); }
    mkItem('tamb', 'instrument', g, { x: L.shelf.x, y: L.shelf.y + 0.02, z: L.shelf.z + 0.1 }, { h: 0.05 }); }
  // picnic blanket (folded / spread)
  { const g = new THREE.Group(); const gm = std({ map: T.gingham(), roughness: 0.95 });
    const folded = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.24), gm); folded.position.y = 0.035; g.add(folded);
    const sp = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.012, 1.0), gm); sp.position.y = 0.008; sp.visible = false; g.add(sp);
    g.userData.folded = folded; g.userData.spreadMesh = sp;
    mkItem('blanket', 'blanket', g, { x: L.doorBench.x, y: L.doorBench.y + 0.025, z: L.doorBench.z + 0.05 }, { h: 0.07, packable: true }); }
  // hats
  { const y = makeHat('yellow'); mkItem('hatY', 'hat', y, { x: W.rackTop.x, y: W.rackTop.y - 0.1, z: W.rackTop.z }, { h: 0.12 });
    const w = makeHat('white'); mkItem('hatW', 'hat', w, { x: W.rackTop.x, y: W.rackTop.y - 0.1, z: W.rackTop.z }, { h: 0.1 }); }
  // chairs (draggable)
  const cm = W.M.wood, cush = std({ color: 0x1f4fae, roughness: 0.85 });
  const mkChair = (id, x, z, yaw, garden) => {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), garden ? W.M.navy : cm); seat.position.y = 0.44; g.add(seat);
    if (!garden) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.035, 0.36), cush); c.position.y = 0.475; g.add(c); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.44, 0.035), garden ? W.M.chrome : cm); l.position.set(sx * 0.17, 0.22, sz * 0.17); g.add(l); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.04), garden ? W.M.navy : cm); back.position.set(0, 0.68, -0.19); g.add(back);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(g);
    const ch = { id, mesh: g, pos: new V3(x, 0, z), yaw, reg: regionAt(x, z), isChair: true, home: { x, z, yaw } };
    g.traverse((m) => { if (m.isMesh) m.userData.pick = ch; });
    ch.seat = { id: 'seat_' + id, type: 'chair', chair: ch, occ: null };
    chairs.push(ch); return ch;
  };
  const D2 = L.dining;
  mkChair('c1', D2.x - 0.38, D2.z - 0.72, 0); mkChair('c2', D2.x + 0.38, D2.z - 0.72, 0);
  mkChair('c3', D2.x - 1.05, D2.z + 0.05, Math.PI / 2); mkChair('c4', D2.x + 1.05, D2.z + 0.05, -Math.PI / 2);
  mkChair('g1', L.gTable.x - 0.78, L.gTable.z + 0.25, Math.PI / 2, true); mkChair('g2', L.gTable.x + 0.78, L.gTable.z + 0.25, -Math.PI / 2, true);
}
buildItems();
const IT = Object.fromEntries(items.map((i) => [i.id, i]));
for (const s of W.seats) s.occ = null;
for (const sw of W.swings) { sw.seat = { id: 'swing' + sw.x, type: 'swing', swing: sw, occ: null }; }

// blob shadow under lifted items
const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: W.blobT, transparent: true, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.visible = false; scene.add(blob);
const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: T.ring(), transparent: true, depthWrite: false, opacity: 0 }));
ring.rotation.x = -Math.PI / 2; scene.add(ring);
// crumbs / sand particles
const parts = [];
const partGeo = new THREE.SphereGeometry(0.012, 5, 4);
function puff(p, color, n = 6, up = 1) { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color, transparent: true })); m.position.copy(p); scene.add(m); parts.push({ m, v: new V3(rand(-0.6, 0.6), rand(0.5, 1.4) * up, rand(-0.6, 0.6)), life: 0.7 }); } }
const sandcastles = [];

// ---------- seats ----------
function seatPos(s) {
  if (s.type === 'chair') { const c = s.chair; return { x: c.pos.x, z: c.pos.z, y: 0.47, yaw: c.yaw }; }
  if (s.type === 'swing') { const sw = s.swing, a = sw.pivot.rotation.x; return { x: sw.x, z: sw.z + Math.sin(a) * 1.25, y: 1.66 - Math.cos(a) * 1.25 + 0.03, yaw: 0 }; }
  if (s.type === 'ground') { return { x: s.x, z: s.z, y: groundH(s.x, s.z) + 0.06, yaw: s.yaw }; }
  if (s.type === 'blanket') { const b = s.item; return { x: b.pos.x + s.dx, z: b.pos.z + s.dz, y: b.pos.y + 0.07, yaw: s.yaw }; }
  return { x: s.x, z: s.z, y: s.y, yaw: s.yaw };
}
function allSeats() {
  const out = [...W.seats, ...chairs.map((c) => c.seat), ...W.swings.map((s) => s.seat)];
  const b = IT.blanket; if (b.spread && b.seats) out.push(...b.seats);
  return out;
}
function findSeat(p, maxD, c, filter) {
  let best = null, bd = maxD;
  for (const s of allSeats()) {
    if (s.occ && s.occ !== c) continue; if (filter && !filter(s)) continue;
    const q = seatPos(s); if (regionAt(q.x, q.z) !== regionAt(p.x, p.z)) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function groundSeat(center, c, r = 0.6) {
  let best = null, bd = -1;
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * Math.PI * 2 + 0.3; const p = { x: center.x + Math.sin(a) * r, z: center.z + Math.cos(a) * r };
    const reg = regionAt(p.x, p.z); if (reg !== regionAt(center.x, center.z)) continue; const q = { ...p }; clampPoint(q); if (Math.hypot(q.x - p.x, q.z - p.z) > 0.05) continue;
    let md = 9; for (const o of chars) if (o !== c && o.present) md = Math.min(md, d2(o.pos, p));
    for (const o of colliders()) md = Math.min(md, Math.hypot(o.x - p.x, o.z - p.z) - o.r);
    const facing = Math.cos(a) * 0.15; // prefer seats behind (facing camera)
    if (md - facing > bd) { bd = md - facing; best = p; best.a = a; }
  }
  if (!best) return null;
  return { type: 'ground', x: best.x, z: best.z, yaw: Math.atan2(center.x - best.x, center.z - best.z), occ: null, temp: true };
}

// ---------- colliders ----------
let _cols = null;
function colliders() { return _cols || (_cols = W.colliders.concat(chairs.map((c) => ({ x: c.pos.x, z: c.pos.z, r: 0.22, chair: c })))); }


// ---------- grid navigation (A*) over house, garden and outside; portals are the door and the gate ----------
const NAV = { x0: -3.4, z0: -5.4, cs: 0.2, nx: 167, nz: 53 };
NAV.free = new Uint8Array(NAV.nx * NAV.nz); NAV.key = '';
function navCell(x, z) { return [Math.round((x - NAV.x0) / NAV.cs), Math.round((z - NAV.z0) / NAV.cs)]; }
function navPos(i, j) { return { x: NAV.x0 + i * NAV.cs, z: NAV.z0 + j * NAV.cs }; }
function inRects(x, z) {
  if (inDoorway(x, z) && Math.abs(x - L.door.x) < 0.34) return true;
  if (inGateway(x, z) && Math.abs(x - L.gate.x) < 0.42) return true;
  for (const k in RECTS) for (const [a, b, c, d] of RECTS[k]) if (x >= a - 1e-6 && x <= b + 1e-6 && z >= c - 1e-6 && z <= d + 1e-6) return true;
  return false;
}
function navRebuild() {
  const key = chairs.map((c) => c.pos.x.toFixed(1) + c.pos.z.toFixed(1)).join('|');
  if (key === NAV.key) return; NAV.key = key;
  const cols = colliders();
  for (let j = 0; j < NAV.nz; j++) for (let i = 0; i < NAV.nx; i++) {
    const p = navPos(i, j); let f = inRects(p.x, p.z) ? 1 : 0;
    if (f) for (const o of cols) { const dx = p.x - o.x, dz = p.z - o.z; const R = o.r + 0.19; if (dx * dx + dz * dz < R * R) { f = 0; break; } }
    NAV.free[j * NAV.nx + i] = f;
  }
}
function navFree(i, j) { return i >= 0 && j >= 0 && i < NAV.nx && j < NAV.nz && NAV.free[j * NAV.nx + i] === 1; }
function nearestFree(i, j) {
  if (navFree(i, j)) return [i, j];
  for (let r = 1; r < 12; r++) { let best = null, bd = 1e9; for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue; if (navFree(i + a, j + b)) { const d = a * a + b * b; if (d < bd) { bd = d; best = [i + a, j + b]; } } } if (best) return best; }
  return null;
}
function losFree(a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 0.08);
  for (let k = 1; k < n; k++) { const t = k / n; const [i, j] = navCell(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t); if (!navFree(i, j)) return false; }
  return true;
}
const _g = new Float32Array(NAV.nx * NAV.nz), _came = new Int32Array(NAV.nx * NAV.nz), _stamp = new Uint32Array(NAV.nx * NAV.nz), _closed = new Uint32Array(NAV.nx * NAV.nz); let _st = 0;
function findPath(from, to) {
  navRebuild();
  const s = nearestFree(...navCell(from.x, from.z)), t = nearestFree(...navCell(to.x, to.z));
  if (!s || !t) return null;
  const goalP = navFree(...navCell(to.x, to.z)) ? { x: to.x, z: to.z } : navPos(t[0], t[1]);
  if (losFree(from, goalP)) return [goalP];
  _st++; const NX = NAV.nx, si = s[1] * NX + s[0], ti = t[1] * NX + t[0];
  const heap = []; const push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const h = (i) => { const x = i % NX, z = (i / NX) | 0; const dx = Math.abs(x - t[0]), dz = Math.abs(z - t[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  _g[si] = 0; _stamp[si] = _st; _came[si] = -1; push(si, h(si));
  let found = false, iters = 0;
  while (heap.length && iters++ < 12000) {
    const [, cur] = pop(); if (_closed[cur] === _st) continue; _closed[cur] = _st;
    if (cur === ti) { found = true; break; }
    const cx = cur % NX, cz = (cur / NX) | 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (!a && !b) continue; const nx = cx + a, nz = cz + b; if (!navFree(nx, nz)) continue;
      if (a && b && (!navFree(cx + a, cz) || !navFree(cx, cz + b))) continue;
      const ni = nz * NX + nx, ng = _g[cur] + (a && b ? 1.414 : 1);
      if (_stamp[ni] === _st && ng >= _g[ni]) continue;
      _stamp[ni] = _st; _g[ni] = ng; _came[ni] = cur; push(ni, ng + h(ni));
    }
  }
  if (!found) return [goalP];
  const cells = []; for (let k = ti; k !== -1; k = _came[k]) cells.push(navPos(k % NX, (k / NX) | 0)); cells.reverse();
  cells[cells.length - 1] = goalP;
  // string pulling
  const out = []; let a = from, k = 0;
  while (k < cells.length) { let far = k; for (let m = cells.length - 1; m > k; m--) if (losFree(a, cells[m])) { far = m; break; } out.push(cells[far]); a = cells[far]; k = far + 1; }
  return out;
}

// ---------- task system ----------
const PRI = { IDLE: 1, CALL: 2, SOCIAL: 3, REACT: 4 };
function cancelTask(c) {
  if (c.onCancel) { const f = c.onCancel; c.onCancel = null; f(); }
  c.gen = null; c.pri = 0; c.wait = 0; c.waitFn = null; c.goal = null; c.speedMul = 1; c.fixedY = null;
  c.st.pose = c.seat ? (c.seat.type === 'chair' || c.seat.type === 'bench' || c.seat.type === 'sofa' ? 'sit' : 'sitGround') : 'idle';
}
function setTask(c, gen, pri) {
  if (!c.present) return false;
  if (c.gen && pri < c.pri) return false;
  cancelTask(c); c.gen = gen; c.pri = pri; return true;
}
function stepTask(c, dt) {
  if (!c.gen) { pickIdle(c); if (!c.gen) return; }
  if (c.wait > 0) { c.wait -= dt; return; }
  if (c.waitFn) { if (!c.waitFn()) return; c.waitFn = null; }
  let r; const g = c.gen;
  try { r = g.next(); } catch (e) { console.warn(c.id, e); r = { done: true }; }
  if (c.gen !== g) return; // replaced by a new task while running
  if (r.done) { const f = c.onCancel; c.onCancel = null; if (f) f(); c.gen = null; c.pri = 0; c.goal = null; c.speedMul = 1; return; }
  const v = r.value;
  if (typeof v === 'number') c.wait = v; else if (typeof v === 'function') c.waitFn = v;
}
const until = (s, cond) => { const te = time + s; return () => time > te || (cond ? cond() : false); };
function posOf(t) { return t.pos ? t.pos : t; }
function face(c, t) { const p = posOf(t); c.yawTarget = Math.atan2(p.x - c.pos.x, p.z - c.pos.z); }
function standUp(c) {
  if (!c.seat) return; const s = c.seat, q = seatPos(s);
  if (s.occ === c) s.occ = null; c.seat = null; c.fixedY = null;
  if (s.type !== 'ground' && s.type !== 'blanket') { const p = { x: q.x + Math.sin(q.yaw) * 0.38, z: q.z + Math.cos(q.yaw) * 0.38 }; c.reg = constrain(regionAt(p.x, p.z), p); c.pos.x = p.x; c.pos.z = p.z; }
  if (s.type === 'swing') s.swing.occupant = null;
  c.st.pose = 'idle';
}
function* go(c, x, z, o = {}) {
  standUp(c); const p = { x, z }; clampPoint(p);
  c.goal = p; c.goalTol = o.tol || 0.14; c.speedMul = o.run ? (c.isDog ? 1.7 : 1.55) : (o.slow ? 0.7 : 1);
  const t0 = time; yield () => !c.goal || time - t0 > (o.timeout || 25);
  c.goal = null; c.speedMul = 1;
}
function* goNear(c, t, r = 0.8, o = {}) {
  const tp = posOf(t); let a = Math.atan2(c.pos.x - tp.x, c.pos.z - tp.z); if (o.angle != null) a = o.angle;
  yield* go(c, tp.x + Math.sin(a) * r, tp.z + Math.cos(a) * r, o); face(c, t);
}
function* sit(c, s) {
  if (!s) return;
  const q = seatPos(s);
  if (s.type === 'ground' || s.type === 'blanket') yield* go(c, q.x, q.z, { tol: 0.15 });
  else if (s.type === 'chair') yield* go(c, q.x - Math.sin(q.yaw) * 0.42, q.z - Math.cos(q.yaw) * 0.42, { tol: 0.25, timeout: 12 });
  else yield* go(c, q.x + Math.sin(q.yaw) * 0.4, q.z + Math.cos(q.yaw) * 0.4, { tol: 0.2, timeout: 12 });
  if (s.occ && s.occ !== c) return;
  s.occ = c; c.seat = s; if (s.type === 'swing') s.swing.occupant = c;
  c.st.pose = (s.type === 'ground' || s.type === 'blanket') ? 'sitGround' : (s.type === 'swing' ? 'swing' : 'sit');
  if (!c.isDog) sfxAt('sit', c.pos, 0.8);
  yield 0.4;
}
function* doPose(c, name, dur) { c.st.pose = name; c.st.poseT = 0; yield dur; c.st.pose = sitPoseOf(c); }
function sitPoseOf(c) { if (!c.seat) return 'idle'; const t = c.seat.type; return (t === 'ground' || t === 'blanket') ? 'sitGround' : t === 'swing' ? 'swing' : 'sit'; }

// ---------- speech ----------
function camTargetDist(p) { return d2(p, camT); }
function say(c, ids, o = {}) {
  const dist = camTargetDist(c.pos);
  const vol = clamp(1.15 - (dist - 3) / 9, 0.3, 1) * (o.vol || 1);
  S.lastVoiceT = time;
  return audio.say(ids, { who: c, pri: o.pri || 2, reply: o.reply, vol, rate: c.rate });
}
function sfxAt(name, p, vol = 1, extra = {}) { const dist = camTargetDist(p); audio.sfx(name, { vol: vol * clamp(1.2 - (dist - 3) / 8, 0.15, 1), ...extra }); }

// ---------- hold / give ----------
function attach(it, c) {
  if (it.holder && it.holder !== c && it.holder.holding === it) it.holder.holding = null;
  if (it.spread) unspread(it);
  it.state = 'held'; it.holder = c; it.rolling = false; c.holding = it;
}
function release(it) { if (it.holder && it.holder.holding === it) it.holder.holding = null; it.holder = null; it.state = 'free'; }
function surfaceAt(x, z, reg) {
  for (const s of W.surfaces) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && regionAt(x, z) === (reg || regionAt(x, z))) return s;
  return null;
}
function nearestSurface(p, maxD) {
  let best = null, bd = maxD, bp = null;
  for (const s of W.surfaces) {
    const cx = clamp(p.x, s.x0 + 0.08, s.x1 - 0.08), cz = clamp(p.z, s.z0 + 0.08, s.z1 - 0.08);
    if (regionAt(cx, cz) !== regionAt(p.x, p.z)) continue;
    const d = Math.hypot(cx - p.x, cz - p.z); if (d < bd) { bd = d; best = s; bp = { x: cx, z: cz }; }
  }
  return best ? { s: best, p: bp } : null;
}
function placeItem(it, x, z, o = {}) {
  release(it);
  const p = { x, z }; it.reg = clampPoint(p);
  const s = surfaceAt(p.x, p.z);
  it.pos.set(p.x, s ? s.y : groundH(p.x, p.z), p.z); it.rolling = false; it.vel.set(0, 0, 0);
  if (it.kind === 'blanket' && !s && !o.folded) spreadBlanket(it);
  if (!o.silent) {
    if (it.kind === 'ball') sfxAt('bounce', it.pos); else if (it.kind === 'blanket') sfxAt('blanket', it.pos); else if (it.kind === 'food' || it.kind === 'drink') { sfxAt('koton', it.pos); sfxAt('clink', it.pos, 0.5); } else sfxAt('koton', it.pos, 0.8, { pitch: 0.8 });
  }
  return s;
}
function spreadBlanket(it) {
  it.spread = true; it.mesh.userData.folded.visible = false; it.mesh.userData.spreadMesh.visible = true;
  it.mesh.userData.spreadMesh.scale.set(0.2, 1, 0.2);
  if (!it.seats) it.seats = [[-0.4, -0.45, 0], [0.4, -0.45, 0], [-0.7, 0.05, Math.PI / 2], [0.7, 0.05, -Math.PI / 2], [-0.3, 0.42, Math.PI], [0.3, 0.42, Math.PI]].map(([dx, dz, yaw], i) => ({ id: 'bl' + i, type: 'blanket', item: it, dx: dx * 0.9, dz: dz * 0.9, yaw, occ: null }));
}
function unspread(it) {
  it.spread = false; it.mesh.userData.folded.visible = true; it.mesh.userData.spreadMesh.visible = false;
  if (it.seats) for (const s of it.seats) if (s.occ) { const c = s.occ; standUp(c); }
}

// ---------- hero ----------
const heroHats = { worn: null };
function wearHat(it) {
  if (heroHats.worn && heroHats.worn !== it) { const old = heroHats.worn; old.state = 'free'; old.holder = null; hero.rig.hatAnchor.remove(old.mesh); scene.add(old.mesh); old.pos.set(W.rackTop.x, W.rackTop.y - 0.1, W.rackTop.z); old.reg = 'H'; old.onRack = true; old.moved = true; }
  release(it); it.state = 'worn'; it.onRack = false; heroHats.worn = it; scene.remove(it.mesh); hero.rig.hatAnchor.add(it.mesh); it.mesh.position.set(0, 0, 0); it.mesh.rotation.set(-0.12, 0, 0); it.mesh.scale.setScalar(1.4);
  audio.sfx('hatOn'); puff(new V3().setFromMatrixPosition(hero.rig.hatAnchor.matrixWorld), 0xffffff, 6);
}

// ---------- reactions & events ----------
function homeMembers(reg) { return npcs.filter((c) => c.present && !c.withHero && (reg ? (c.reg === reg || (reg !== 'O' && c.reg !== 'O')) : true)); }
function partyOf(region) {
  if (region === 'O') return npcs.filter((c) => c.present && (c.withHero || c.reg === 'O'));
  return npcs.filter((c) => c.present && !c.withHero && c.reg !== 'O');
}
function npcReceive(c, it, from) {
  S.stats.gifts++;
  if (c === guest || c === friend) S.guestInvited = true;
  if (c.isDog) {
    if (it.kind === 'ball') { attach(it, c); startFetch(it, 'gift', hero, PRI.REACT); }
    else { placeItem(it, c.pos.x + Math.sin(c.yaw) * 0.4, c.pos.z + Math.cos(c.yaw) * 0.4); setTask(c, (function* () { c.st.pose = 'sniff'; sfxAt('sniff', c.pos); c.st.wag = 1; yield 1.2; c.st.pose = 'sit'; yield 1.5; })(), PRI.REACT); if (it.kind === 'food') startFeast(it, null); }
    return;
  }
  setTask(c, receiveTask(c, it, from), PRI.REACT);
}
function* receiveTask(c, it, from) {
  attach(it, c); face(c, hero); c.st.smile = 1;
  sfxAt('give', c.pos, 0.7);
  if (it.kind === 'food') {
    if (c === guest || c === friend) say(c, ['guest_ja_02', 'guest_en_02'], { reply: true, pri: 3 });
    else if (c === mama) say(c, ['mama_ja_03', 'mama_en_01'], { reply: true });
    else if (c === papa) say(c, 'papa_ja_02', { reply: true });
    else if (c === sib) say(c, ['sibling_en_01', 'sibling_ja_01'], { reply: true });
    yield* doPose(c, 'eat', 1.6); sfxAt('munch', c.pos); bite(it);
    const ns = nearestSurface(c.pos, 1.3); const fw = { x: c.pos.x + Math.sin(c.yaw) * 0.45, z: c.pos.z + Math.cos(c.yaw) * 0.45 };
    const bl = IT.blanket; const onBl = bl.spread && d2(bl.pos, c.pos) < 1.6;
    if (onBl) placeItem(it, bl.pos.x + rand(-0.2, 0.2), bl.pos.z + rand(-0.15, 0.15)); else if (ns) placeItem(it, ns.p.x, ns.p.z); else placeItem(it, fw.x, fw.z);
    startFeast(it, c);
    yield* eatTask(c, it, it.pos.clone(), true);
    return;
  }
  if (it.kind === 'drink') {
    yield* doPose(c, 'drink', 1.4); sfxAt('sip', c.pos);
    if (c === papa) { say(c, 'papa_ja_01'); if (d2(hero.pos, c.pos) < 2.5) say(hero, 'hero_en_01', { reply: true }); }
    else if (c === guest || c === friend) say(c, 'guest_en_02', { reply: true });
    yield 0.6;
    const ns = nearestSurface(c.pos, 1.3); if (ns) placeItem(it, ns.p.x, ns.p.z); else placeItem(it, c.pos.x + Math.sin(c.yaw) * 0.4, c.pos.z + Math.cos(c.yaw) * 0.4);
    if (zoneAt(it.pos.x, it.pos.z) !== 'house') { startFeast(it, c); yield* sitNearTask(c, it.pos.clone(), 10); }
    return;
  }
  if (it.kind === 'ball') {
    yield* doPose(c, 'throw', 0.5);
    const to = throwTarget(c); throwBall(it, c, to); sfxAt('whoosh', c.pos, 0.7);
    startFetch(it, 'thrown', c);
    yield 0.5; return;
  }
  if (it.kind === 'instrument') {
    if (c === sib) { beginMusic(); yield* sibMusic(c, it); return; }
    yield* doPose(c, 'drum', 0.8); sfxAt(it.id === 'tamb' ? 'tamb' : 'drum', c.pos);
    startMusic(null);
    yield 1.2;
    placeItem(it, c.pos.x + Math.sin(c.yaw) * 0.35, c.pos.z + Math.cos(c.yaw) * 0.35);
    return;
  }
  if (it.kind === 'blanket') {
    standUp(c);
    const p = { x: c.pos.x + Math.sin(c.yaw) * 0.9, z: c.pos.z + Math.cos(c.yaw) * 0.9 };
    yield* doPose(c, 'carry', 0.6);
    placeItem(it, p.x, p.z);
    if (!it.spread) spreadBlanket(it);
    startFeast(it, null);
    return;
  }
  if (it.kind === 'hat') {
    yield* goNear(c, hero, 0.55);
    yield* doPose(c, 'give', 0.6);
    wearHat(it);
    if (c === mama) say(c, 'mama_en_01');
    if (can('heroThanks', 8)) say(hero, 'hero_en_01', { reply: true });
    return;
  }
  release(it);
}
function bite(it) { it.bite = 1; const p = it.pos.clone(); p.y += 0.12; puff(p, 0xf7f3e6, 5, 0.5); }
function throwTarget(c) {
  const reg = c.reg;
  if (reg === 'H') return { x: rand(-0.5, 2.5), z: rand(-2.3, -1.4) };
  if (reg === 'G') return { x: rand(-1.8, 5.2), z: rand(-0.4, 2.1) };
  const p = { x: c.pos.x + rand(-3, 3), z: c.pos.z + rand(-2.5, 1.5) }; clampPoint(p); return p;
}
function throwBall(it, from, to) {
  release(it); const fp = from.pos ? from.pos : from;
  it.pos.set(fp.x, (fp.y || 0) + 0.8, fp.z); it.reg = from.reg || regionAt(fp.x, fp.z);
  const T = 0.75; it.vel.set((to.x - fp.x) / T, 3.4, (to.z - fp.z) / T); it.rolling = true;
}

// --- feast / picnic: gather people around an item, each in their own role ---
let lastFeast = { t: -99, id: null };
function startFeast(it, firstEater) {
  if (time - lastFeast.t < 4 && lastFeast.id === it.id) return;
  lastFeast = { t: time, id: it.id };
  const reg = regionAt(it.pos.x, it.pos.z), zone = zoneAt(it.pos.x, it.pos.z);
  const party = partyOf(reg).filter((c) => c.pri < PRI.REACT || c === firstEater);
  if (!party.length) return;
  S.stats.feast++;
  if (party.includes(guest)) S.guestInvited = true;
  const isBlanket = it.kind === 'blanket';
  const center = it.pos.clone();
  const eaters = party.filter((c) => c === guest || c === friend);
  if (!eaters.length) { const k = party.find((c) => c === sib) || party.find((c) => !c.isDog); if (k) eaters.push(k); }
  // opening line by place
  later(0.4, () => {
    if (zone === 'beach') { if (party.includes(guest)) say(guest, 'guest_ja_04', { pri: 3 }); else say(mama, 'mama_ja_05'); }
    else if (zone === 'garden') { if (party.includes(mama)) say(mama, 'mama_ja_06'); }
    else if (zone === 'park' || zone === 'prom') { if (party.includes(guest)) say(guest, 'guest_ja_04'); }
  });
  for (const c of party) {
    if (c === firstEater) continue; // continues inside its own receive task
    if (c.isDog) { setTask(c, dogNear(c, center), PRI.SOCIAL); continue; }
    if (eaters.includes(c)) { setTask(c, eatTask(c, it, center, false), PRI.SOCIAL); continue; }
    if (c === mama) { setTask(c, zone === 'house' && !isBlanket ? teaService(c, it, center) : drinkService(c, it, center), PRI.SOCIAL); continue; }
    if (c === papa) { setTask(c, zone === 'house' && !isBlanket ? chairService(c, it, center) : sitNearTask(c, center, 14), PRI.SOCIAL); continue; }
    setTask(c, sitNearTask(c, center, 14, true), PRI.SOCIAL);
  }
}
function seatNear(c, center, maxD = 1.35) {
  const s = findSeat(center, maxD, c, (s) => s.type !== 'swing');
  return s || groundSeat(center, c, IT.blanket.spread && d2(IT.blanket.pos, center) < 0.8 ? 0.75 : 0.6);
}
function* eatTask(c, it, center, already) {
  if (!already) { yield rand(0.2, 1.2); }
  const s = seatNear(c, center); if (s) yield* sit(c, s);
  face(c, center);
  if (!already && (c === guest || c === friend)) { yield 0.5; if (can('guestYum', 6)) say(c, ['guest_en_02', 'guest_ja_02']); }
  for (let k = 0; k < 3; k++) {
    c.st.pose = c.seat ? 'sitEat' : 'eat'; c.st.poseT = 0; yield 1.3; sfxAt('munch', c.pos, 0.8); if (d2(it.pos, center) < 0.3) bite(it);
    c.st.pose = sitPoseOf(c); c.look = hero; c.lookUntil = time + 2; yield rand(1.2, 2.5);
  }
  yield until(10, () => d2(hero.pos, center) > 6);
}
function* dogNear(c, center) {
  yield* goNear(c, center, 0.7); c.st.pose = 'lie'; c.st.wag = 0.8; yield until(12, () => d2(hero.pos, center) > 6); c.st.pose = 'idle';
}
function* sitNearTask(c, center, dur, greet) {
  yield rand(0.3, 1.5);
  const s = seatNear(c, center); if (s) yield* sit(c, s); face(c, center);
  if (greet && c === sib && can('sibGreet', 15)) say(c, ['sibling_en_01', 'sibling_ja_01']);
  for (let k = 0; k < 3; k++) { yield rand(2, 4); c.look = pickR([hero, guest, mama, papa]); c.lookUntil = time + 2; if (Math.random() < 0.3) { c.st.pose = c.seat ? 'sitClap' : 'clap'; c.st.clapT = 0.2; sfxAt('clap', c.pos, 0.4); yield 0.4; c.st.pose = sitPoseOf(c); } }
  yield until(dur, () => d2(hero.pos, center) > 6);
}
function* teaService(c, it, center) {
  // fetch teapot from the island, pour for everyone at the table
  const tp = W.teapot;
  yield* go(c, tp.position.x, L.island.z + 0.62); c.yawTarget = Math.PI; yield 0.3;
  yield* doPose(c, 'reach', 0.5);
  c.prop = tp; c.onCancel = () => { returnTeapot(); };
  yield* goNear(c, center, 0.75);
  c.st.pose = 'pour'; c.st.poseT = 0; sfxAt('pour', c.pos, 0.9, { dur: 1.6 });
  for (const cup of W.cups) cup.target = 1;
  say(c, d2(hero.pos, center) < 1.8 ? ['mama_ja_02', 'mama_en_01'] : 'mama_ja_02', { pri: 3 });
  if (d2(hero.pos, center) < 1.8 && can('heroThanks', 10)) later(1.6, () => say(hero, 'hero_en_01', { reply: true }));
  yield 1.8; c.st.pose = 'idle';
  // put the pot back and come sit
  yield* go(c, L.island.x - 0.5, L.island.z + 0.62); c.yawTarget = Math.PI; yield* doPose(c, 'reach', 0.4);
  returnTeapot(); c.onCancel = null;
  const s = seatNear(c, center, 1.6); if (s) yield* sit(c, s); face(c, center);
  yield until(12, () => d2(hero.pos, center) > 6);
}
function returnTeapot() { mama.prop = null; W.teapot.position.copy(W.teapotHome); W.teapot.rotation.set(0, 0, 0); }
function* drinkService(c, it, center) {
  yield rand(0.3, 1);
  yield* goNear(c, center, 0.7); yield* doPose(c, 'give', 0.7);
  if (can('mamaHere', 8)) say(c, 'mama_en_01', { pri: 2 });
  const s = seatNear(c, center, 1.6); if (s) yield* sit(c, s); face(c, center);
  if (zoneAt(center.x, center.z) === 'beach' && can('mamaWind', 25)) { yield 2; say(c, 'mama_ja_05'); }
  yield until(12, () => d2(hero.pos, center) > 6);
}
function* chairService(c, it, center) {
  // pull an empty chair closer to where the food is
  const free = chairs.filter((ch) => !ch.seat.occ && ch.reg === regionAt(center.x, center.z)).sort((a, b) => d2(a.pos, center) - d2(b.pos, center));
  const ch = free[free.length > 1 ? 1 : 0];
  if (ch) {
    yield* goNear(c, ch.pos, 0.45);
    yield* doPose(c, 'carry', 0.3);
    // slot near the food at the table edge
    const tgt = chairSlotNear(center, ch);
    const from = ch.pos.clone(), y0 = ch.yaw, t0 = time, dur = 0.9;
    sfxAt('chair', ch.pos);
    c.st.pose = 'carry';
    while (time - t0 < dur) { const k = (time - t0) / dur; ch.pos.lerpVectors(from, new V3(tgt.x, 0, tgt.z), k); ch.yaw = lerpAngle(y0, tgt.yaw, k); c.pos.x = ch.pos.x - Math.sin(ch.yaw) * 0.42; c.pos.z = ch.pos.z - Math.cos(ch.yaw) * 0.42 + 0.0; yield 0; }
    ch.pos.set(tgt.x, 0, tgt.z); ch.yaw = tgt.yaw; c.st.pose = 'idle';
    face(c, center);
    if (can('papaChair', 10)) say(c, 'papa_ja_02', { pri: 3 });
    yield 1.0;
  }
  const s = seatNear(c, center, 1.8); if (s) yield* sit(c, s); face(c, center);
  yield until(12, () => d2(hero.pos, center) > 6);
}
function chairSlotNear(center, ch) {
  const D = L.dining; const slots = [];
  for (const dx of [-0.38, 0.38]) { slots.push({ x: D.x + dx, z: D.z - 0.72, yaw: 0 }); slots.push({ x: D.x + dx, z: D.z + 0.72, yaw: Math.PI }); }
  slots.push({ x: D.x - 1.05, z: D.z + 0.05, yaw: Math.PI / 2 }, { x: D.x + 1.05, z: D.z + 0.05, yaw: -Math.PI / 2 });
  const onTable = surfaceAt(center.x, center.z);
  if (!onTable || onTable.id !== 'dining') { const a = Math.atan2(ch.pos.x - center.x, ch.pos.z - center.z); return { x: center.x + Math.sin(a) * 0.6, z: center.z + Math.cos(a) * 0.6, yaw: a + Math.PI }; }
  const freeSlots = slots.filter((s) => chairs.every((o) => o === ch || d2(o.pos, s) > 0.35));
  freeSlots.sort((a, b) => d2(a, center) - d2(b, center));
  return freeSlots[0] || { x: ch.pos.x, z: ch.pos.z, yaw: ch.yaw };
}

// --- dog fetch ---
function startFetch(ball, mode, thrower, pri = PRI.SOCIAL) {
  if (!dog.present) return;
  if (!setTask(dog, dogFetch(dog, ball, mode, thrower), pri)) return;
  dog.fetching = true;
  if (sib.present && sib.pri < PRI.SOCIAL && sameParty(sib, dog)) setTask(sib, chaseTask(sib, dog), PRI.SOCIAL);
  if (guest.present && S.guestIn && guest.pri < PRI.SOCIAL && sameParty(guest, dog) && Math.random() < 0.45) setTask(guest, chaseTask(guest, dog, true), PRI.SOCIAL);
  for (const c of [papa, mama]) if (c.present && c.pri <= PRI.IDLE && sameParty(c, dog)) { c.look = dog; c.lookUntil = time + 4; c.st.smile = 1; }
}
function sameParty(a, b) { return (a.withHero && b.withHero && S.outing) || (a.reg !== 'O' && b.reg !== 'O' && !a.withHero && !b.withHero) || a.reg === b.reg; }
function* dogFetch(d, ball, mode, thrower) {
  d.st.wag = 1; d.onCancel = () => { d.fetching = false; if (ball.holder === d) placeItem(ball, d.pos.x, d.pos.z, { silent: true }); };
  if (mode === 'gift' || ball.holder === d) {
    sfxAt('bark', d.pos, 0.8);
    if (can('heroDog', 14) && d2(hero.pos, d.pos) < 2.5) say(hero, 'hero_ja_02', { pri: 3 });
    // run around the garden (or around the hero outside) with the ball
    const pts = [];
    if (d.reg === 'O') { for (let k = 0; k < 3; k++) { const p = { x: hero.pos.x + rand(-3, 3), z: hero.pos.z + rand(-2.5, 1.5) }; clampPoint(p); pts.push(p); } }
    else { const gp = [{ x: 0.4, z: 0.6 }, { x: 4.6, z: 1.6 }, { x: -1.9, z: 1.9 }, { x: 2.0, z: 2.0 }, { x: 5.2, z: -0.4 }]; gp.sort(() => Math.random() - 0.5); pts.push(...gp.slice(0, 3)); }
    for (const p of pts) { yield* go(d, p.x, p.z, { run: true, tol: 0.3 }); if (Math.random() < 0.4) sfxAt('bark', d.pos, 0.5); }
  } else {
    yield () => !ball.rolling || false;
    yield* go(d, ball.pos.x, ball.pos.z, { run: true, tol: 0.22 });
    yield () => !ball.rolling; yield* go(d, ball.pos.x, ball.pos.z, { run: true, tol: 0.2 });
    attach(ball, d); sfxAt('pick', d.pos, 0.6);
  }
  const back = (thrower && thrower !== hero && Math.random() < 0.5) ? thrower : hero;
  yield* goNear(d, back, 0.55, { run: true });
  // drop: ball rolls to the feet
  if (ball.holder === d) {
    release(ball); ball.pos.set(d.pos.x, 0.3 + groundH(d.pos.x, d.pos.z), d.pos.z); ball.reg = d.reg;
    const bp = posOf(back); ball.vel.set((bp.x - d.pos.x) * 0.8, 0.5, (bp.z - d.pos.z) * 0.8); ball.rolling = true;
  }
  d.st.pose = 'sit'; d.st.wag = 1; sfxAt('bark', d.pos, 0.7); face(d, back);
  d.fetching = false; d.onCancel = null; S.stats.fetch++;
  if (back !== hero && back.present) { later(1.2, () => { if (!ball.holder && !ball.rolling && d2(ball.pos, back.pos) < 1.2 && back.pri <= PRI.IDLE) npcReceive(back, ball, 'dog'); }); }
  yield 2.0;
  if (S.stats.fetch % 3 === 0) yield* dogDrink(d);
}
function* dogDrink(d) {
  if (d.reg === 'O') { const p = { x: d.pos.x, z: -2.3 }; if (zoneAt(d.pos.x, d.pos.z) === 'beach') { yield* go(d, p.x, p.z); d.st.pose = 'drink'; sfxAt('splash', d.pos, 0.5); yield 2; } return; }
  yield* go(d, L.waterBowl.x, L.waterBowl.z + 0.32); face(d, L.waterBowl);
  d.st.pose = 'drink'; for (let k = 0; k < 4; k++) { sfxAt('sip', d.pos, 0.6); yield 0.5; } d.st.pose = 'idle';
}
function* chaseTask(c, target, isGuest) {
  yield 0.3;
  if (c === sib && can('sibWait', 10)) say(c, 'sibling_ja_03', { pri: 3 });
  if (isGuest && can('guestJoin', 20)) later(1.4, () => say(c, 'guest_ja_03', { reply: true }));
  standUp(c);
  const te = time + 14;
  while (time < te && target.fetching) {
    c.goal = { x: target.pos.x - Math.sin(target.yaw) * 0.6, z: target.pos.z - Math.cos(target.yaw) * 0.6 }; c.speedMul = 1.45; c.goalTol = 0.3;
    c.st.smile = 1; yield 0.35;
  }
  c.goal = null; c.speedMul = 1;
  yield* doPose(c, 'cheer', 0.9);
}

// --- music (call & response, no judgement) ---
let musicFor = null;
function startMusic(instr) {
  if (!sib.present) return;
  if (!audio.music) { beginMusic(); setTask(sib, sibMusic(sib, instr), PRI.SOCIAL); }
  else audio.music.lastHero = audio.now();
}
function beginMusic() {
  if (audio.music) return;
  const style = S.evening && hero.reg === 'G' ? 'evening' : 'day';
  audio.startMusic(style); S.stats.music++;
  musicFor = { t0: time, center: sib.pos.clone(), joined: {} };
}
function* sibMusic(c, instr) {
  const drum = instr || (IT.drum.state === 'free' && d2(IT.drum.pos, c.pos) < 2.5 && IT.drum.reg === c.reg ? IT.drum : null);
  if (drum && drum.holder !== c) { yield* goNear(c, drum.pos, 0.3); attach(drum, c); }
  c.onCancel = () => { if (drum && drum.holder === c) placeItem(drum, c.pos.x + Math.sin(c.yaw) * 0.32, c.pos.z + Math.cos(c.yaw) * 0.32, { silent: true }); };
  face(c, hero); c.st.pose = 'drum';
  say(c, 'sibling_ja_02', { pri: 4 });
  musicFor.center = c.pos.clone();
  yield () => !audio.music;
  c.st.pose = 'cheer'; yield 0.8; c.st.pose = 'idle';
  if (drum && drum.holder === c) placeItem(drum, c.pos.x + Math.sin(c.yaw) * 0.32, c.pos.z + Math.cos(c.yaw) * 0.32);
  c.onCancel = null;
}
function* joinMusic(c, kind) {
  yield* goNear(c, musicFor.center, c.isDog ? 0.7 : rand(0.9, 1.3));
  face(c, musicFor.center);
  if (c.isDog) { c.st.pose = 'sit'; c.st.wag = 1; }
  else c.st.pose = kind;
  yield () => !audio.music;
  c.st.pose = c.isDog ? 'idle' : 'cheer'; yield 0.6; c.st.pose = 'idle';
}
function updateMusic() {
  const m = audio.music; if (!m) return;
  // join as the hero participates (no failure, any timing connects)
  if (m.level >= 1 && !musicFor.joined.papa && papa.present && sameParty(papa, sib)) { musicFor.joined.papa = true; setTask(papa, joinMusic(papa, 'clap'), PRI.SOCIAL); later(0.5, () => say(papa, 'papa_ja_03', { pri: 3 })); }
  if (m.level >= 1 && !musicFor.joined.dog && dog.present && !dog.fetching && sameParty(dog, sib)) { musicFor.joined.dog = true; setTask(dog, joinMusic(dog), PRI.SOCIAL); }
  if (m.level >= 2 && !musicFor.joined.mama && mama.present && sameParty(mama, sib)) { musicFor.joined.mama = true; setTask(mama, joinMusic(mama, 'hum'), PRI.SOCIAL); later(1.0, () => say(mama, 'mama_ja_03', { pri: 3 })); }
  if (m.level >= 2 && !musicFor.joined.guest) {
    const g = [guest, friend].find((x) => x.present && S.guestIn && sameParty(x, sib));
    if (g) { musicFor.joined.guest = true; m.guest = true; setTask(g, joinMusic(g, 'clap'), PRI.SOCIAL); later(1.8, () => say(g, 'guest_ja_03', { pri: 3 })); }
  }
  const sinceHero = audio.now() - m.lastHero, sinceStart = time - musicFor.t0;
  const far = d2(hero.pos, musicFor.center) > 6;
  if ((sinceHero > 14 && sinceStart > 12) || (far && sinceStart > 4) || (sinceStart > 22 && m.heroCount === 0)) { audio.stopMusic(); }
  for (const e of audio.drainEvents()) {
    if (e.who === 'sib') { sib.st.hitL = e.kind === 'hit' ? 1 : 0; sib.st.hitR = 0; setTimeout(() => { sib.st.hitL = 0; sib.st.hitR = 1; setTimeout(() => (sib.st.hitR = 0), 90); }, 90); }
    if (e.who === 'papa') papa.st.clapT = 0.12;
    if (e.who === 'mama') mama.st.pose = mama.st.pose === 'idle' ? 'hum' : mama.st.pose;
    if (e.who === 'guest') { for (const g of [guest, friend]) g.st.clapT = 0.1; }
    if (e.who === 'hero') { hero.st.clapT = 0.12; hero.hop = 0.25; }
  }
}

// --- lantern evening ---
function toggleLantern() {
  S.evening = !S.evening;
  sfxAt(S.evening ? 'lantern' : 'lanternOff', W.lantern.pos, 1);
  if (S.evening) {
    S.stats.evening++;
    const members = npcs.filter((c) => c.present && !c.withHero && c.reg !== 'O');
    members.forEach((c, i) => setTask(c, eveningGather(c, i), PRI.SOCIAL));
    later(3.5, () => { if (S.evening && mama.present && !mama.withHero) say(mama, 'mama_ja_06'); });
  } else {
    for (const c of npcs) if (c.evening) { c.evening = false; cancelTask(c); }
    if (S.guestIn && guest.present && !guest.withHero && can('guestBye', 40)) later(1, () => say(guest, 'guest_ja_05'));
  }
}
function* eveningGather(c, i) {
  c.evening = true;
  yield rand(0.2, 2.0);
  const GT = L.gTable, center = { x: GT.x, z: GT.z };
  if (c.isDog) { yield* go(c, L.lantern.x + 0.5, L.lantern.z + 0.5); c.st.pose = 'lie'; c.st.wag = 0.5; }
  else { const s = findSeat(center, 1.5, c, (s) => s.type !== 'swing') || groundSeat(center, c, 1.0); if (s) yield* sit(c, s); face(c, center); }
  while (S.evening) {
    yield rand(3, 6);
    if (!S.evening) break;
    c.look = pickR([hero, mama, papa, sib, guest].filter((x) => x.present && x !== c)); c.lookUntil = time + 3;
    if (!c.isDog && Math.random() < 0.35) { c.st.pose = c.seat ? 'sitClap' : 'clap'; c.st.clapT = 0.2; sfxAt('clap', c.pos, 0.3); yield 0.5; c.st.pose = sitPoseOf(c); }
    if (c === mama && Math.random() < 0.4) { for (let k = 0; k < 4; k++) audio.sfx('hum', { note: [67, 69, 72, 69][k], vol: 0.6, t: audio.now() + k * 0.45 }); c.talkUntil = performance.now() / 1000 + 1.8; }
    if (c === papa && Math.random() < 0.2 && can('papaEve', 30)) say(c, 'papa_ja_03', { vol: 0.6 });
  }
  c.evening = false;
}

// --- arrivals ---
function* guestArrival(g, isFriend) {
  // the guest waits outside the door; mama greets
  g.reg = 'G';
  if (isFriend) { g.pos.set(L.gateOut.x + 0.4, 0, 4.2); g.reg = 'O'; yield* go(g, L.doorOut.x, L.doorOut.z + 0.15); }
  face(g, { x: L.door.x, z: -1.5 });
  yield () => mama.pri <= PRI.CALL || time > 999999;
  setTask(mama, mamaGreet(g, isFriend), PRI.SOCIAL);
  yield until(14, () => g.letIn); openDoor(true);
  yield* go(g, 1.4, -2.0);
  S.guestIn = true; if (isFriend) S.friendArrived = true;
  if (!isFriend && d2(hero.pos, g.pos) < 3.5) { face(g, hero); say(g, 'guest_en_01', { reply: true }); yield* doPose(g, 'wave', 1.2); }
  if (isFriend) { face(g, hero); yield* doPose(g, 'wave', 1.2); }
}
function* mamaGreet(g, isFriend) {
  yield* go(mama, L.doorIn.x - 0.1, L.doorIn.z - 0.05); face(mama, g);
  openDoor(true);
  yield 0.5; yield* doPose(mama, 'wave', 0.6);
  say(mama, 'mama_ja_01', { pri: 3 });
  yield 1.0;
  if (isFriend) say(g, 'guest_en_01', { reply: true, pri: 3 }); else say(g, 'guest_ja_01', { reply: true, pri: 3 });
  yield 0.6; yield* go(mama, 1.2, -1.9); g.letIn = true; face(mama, g); yield 1.2;
}
function openDoor(open) { const d = W.door; if ((d.target > 0.5) === open) return; d.target = open ? 1 : 0; sfxAt(open ? 'doorOpen' : 'doorClose', { x: L.door.x, z: L.door.z }, 1); }

// --- calls: NPCs invite the hero sometimes; ignoring is fine ---
function scheduleCalls() {
  if (time < S.nextCall) return;
  S.nextCall = time + rand(20, 32);
  if (time - S.lastInput < 6 || audio.music || hero.gen) return;
  const cands = npcs.filter((c) => c.present && c.pri <= PRI.IDLE && !c.isDog && sameRegionOrParty(c) && d2(c.pos, hero.pos) < 7 && (c !== guest || S.guestIn) && c !== friend);
  if (!cands.length) return;
  const c = cands.includes(sib) && Math.random() < 0.6 ? sib : pickR(cands);
  setTask(c, callTask(c), PRI.CALL);
}
function sameRegionOrParty(c) { return S.outing ? c.withHero : (c.reg !== 'O' && hero.reg !== 'O'); }
function* callTask(c) {
  yield* goNear(c, hero, 1.7);
  face(c, hero); c.st.pose = 'beckon';
  if (c === sib) say(c, ['sibling_ja_01', 'sibling_en_01']); else if (c === guest) say(c, 'guest_en_01');
  const start = hero.pos.clone(); const t0 = time;
  yield () => time - t0 > 7 || d2(hero.pos, c.pos) < 0.95;
  c.st.pose = 'idle';
  if (d2(hero.pos, c.pos) < 0.95) {
    // a short off-beat answer
    yield* doPose(c, 'cheer', 0.8);
    if (c === sib) say(c, 'sibling_ja_02', { reply: true }); else if (c === papa) say(c, 'papa_ja_03', { reply: true }); else if (c === mama) say(c, 'mama_ja_03', { reply: true }); else if (c === guest) say(c, 'guest_ja_03', { reply: true });
    sfxAt('clap', c.pos, 0.6);
    if (c === sib && IT.drum.state === 'free' && d2(IT.drum.pos, c.pos) < 3) startMusic(null);
  }
}

// --- outing ---
function startPrep() {
  if (S.prep || S.outing) return;
  S.prep = true; S.prepT = time;
  if (time - S.heroSaidOut > 40) { S.heroSaidOut = time; say(hero, 'hero_ja_03', { pri: 3 }); }
  const members = family.filter((c) => c.present && c.reg !== 'O');
  if (S.guestIn && guest.present && (S.guestInvited || d2(guest.pos, hero.pos) < 2.6)) members.push(guest);
  if (S.friendArrived && friend.present && (S.guestInvited && Math.random() < 0.7)) members.push(friend);
  members.sort((a, b) => d2(a.pos, hero.pos) - d2(b.pos, hero.pos));
  members.forEach((c, i) => { c.prepping = true; setTask(c, prepTask(c, i), PRI.SOCIAL); });
}
function* prepTask(c, order) {
  face(c, hero); c.look = hero; c.lookUntil = time + 2;
  yield 0.2 + order * 0.5;
  if (c === mama) { if (c.reg === 'H') { yield* go(c, L.rack.x - 0.35, L.rack.z - 0.2); yield* doPose(c, 'reach', 0.4); } mamaHat.visible = true; sfxAt('hatOn', c.pos, 0.6); say(c, 'mama_ja_04', { reply: true, pri: 3 }); }
  if (c === papa) { if (c.reg === 'H') { yield* go(c, L.island.x + 0.2, L.island.z + 0.62); c.yawTarget = Math.PI; yield* doPose(c, 'reach', 0.5); } packBasket(); }
  if (c === dog) { face(c, hero); c.st.wag = 1; yield 0.5; sfxAt('bark', c.pos, 0.6); }
  if (c === guest || c === friend) { if (can('guestJoinOut', 30)) say(c, 'guest_ja_03', { reply: true }); }
  const slot = { x: L.gateIn.x + (order % 3 - 1) * 0.7, z: L.gateIn.z - 0.4 - Math.floor(order / 3) * 0.5 };
  yield* go(c, slot.x, slot.z, { run: c === dog || c === sib });
  face(c, { x: L.gate.x, z: 4 });
  yield until(16, () => S.outing || !S.prep);
  c.prepping = false;
}
function packBasket() {
  basketState.where = 'papa'; basket.visible = true;
  for (const it of items) if (it.packable && !it.moved && it.state === 'free') { it.state = 'basket'; it.mesh.visible = false; }
}
function cancelPrep() {
  S.prep = false;
  for (const c of npcs) if (c.prepping) { c.prepping = false; cancelTask(c); }
  mamaHat.visible = false; if (basketState.where === 'papa') unpackHome();
}
function unpackHome() { basketState.where = 'home'; basket.visible = false; for (const it of items) if (it.state === 'basket') { it.state = 'free'; it.mesh.visible = true; it.pos.set(it.home.x, it.home.y, it.home.z); it.reg = regionAt(it.home.x, it.home.z); } }
function startOuting() {
  S.outing = true; S.prep = false; S.unpacked = false; S.outSeen = {}; S.stats.outing++;
  const members = npcs.filter((c) => c.present && (c.prepping || (family.includes(c) && c.reg !== 'O')));
  if (S.guestIn && guest.present && !members.includes(guest) && (S.guestInvited || d2(guest.pos, hero.pos) < 3)) members.push(guest);
  for (const c of members) { c.prepping = false; c.withHero = true; cancelTask(c); }
  if (mama.withHero) mamaHat.visible = true;
  if (papa.withHero && basketState.where !== 'papa') packBasket();
  later(0.3, () => say(papa, ['papa_ja_04', 'papa_en_01'], { pri: 3 }));
  if (guest.withHero && can('guestJoinOut', 30)) later(1.8, () => say(guest, 'guest_ja_03', { reply: true }));
  if (dog.withHero) { dog.look = hero; dog.lookUntil = time + 0.8; }
}
function endOuting() {
  S.outing = false; S.homeSince = time;
  const wasGuest = guest.withHero;
  for (const c of npcs) if (c.withHero) { c.withHero = false; cancelTask(c); c.returning = true; setTask(c, returnHome(c), PRI.SOCIAL); }
  if (wasGuest && can('guestBye', 40)) later(4, () => say(guest, 'guest_ja_05'));
  if (!S.friendArrived && !S.friendDue) S.friendDue = time + 14;
}
function* returnHome(c) {
  if (c === dog) { yield* go(c, L.doorIn.x + 0.1, L.doorIn.z - 0.35, { run: true }); face(c, { x: L.door.x, z: 0 }); c.st.pose = 'sit'; c.st.wag = 1; yield until(10, () => hero.reg === 'H' && d2(hero.pos, c.pos) < 1.2); if (hero.reg === 'H') { sfxAt('bark', c.pos, 0.8); c.st.pose = 'hop'; yield 1; } }
  else if (c === papa) {
    yield* go(c, L.doorIn.x - 0.4, L.doorIn.z - 0.5);
    unpackHome();
    yield until(6, () => hero.reg === 'H');
    if (Math.random() < 0.6) { const s = findSeat({ x: L.sofa.x, z: L.sofa.z }, 1.2, c); if (s) { yield* sit(c, s); yield 8; } }
  } else if (c === mama) {
    yield* go(c, L.rack.x - 0.4, L.rack.z - 0.3); mamaHat.visible = false; yield* doPose(c, 'reach', 0.4);
    // set the table
    for (const dx of [-0.6, 0.5]) { yield* go(c, L.dining.x + dx, L.dining.z + 0.62); c.yawTarget = Math.PI; yield* doPose(c, 'reach', 0.8); sfxAt('clink', c.pos, 0.6); }
  } else {
    yield* go(c, rand(0.0, 1.5), rand(-2.2, -1.6));
    if (c === guest || c === friend) { const s = findSeat({ x: L.dining.x, z: L.dining.z }, 1.5, c); if (s) { yield* sit(c, s); yield 8; } }
  }
  c.returning = false;
}
function unpackAtBeach(c) {
  if (S.unpacked || basketState.where !== 'papa') return;
  S.unpacked = true;
  const p = { x: c.pos.x + 0.5, z: c.pos.z + 0.3 }; clampPoint(p);
  basketState.where = 'ground'; basketState.pos.set(p.x, groundH(p.x, p.z), p.z);
  let k = 0;
  for (const it of items) if (it.state === 'basket') { it.state = 'free'; it.mesh.visible = true; it.moved = true; placeItem(it, p.x + 0.45 + k * 0.35, p.z + 0.15, { folded: true }); k++; }
  sfxAt('koton', c.pos);
}

// ---------- idle lives ----------
function homePoint(reg) {
  if (reg === 'H') { const pts = [{ x: 0.3, z: -2.0 }, { x: -0.2, z: -3.8 }, { x: 1.2, z: -2.5 }, { x: 2.4, z: -3.8 }, { x: -2.6, z: -2.0 }, { x: 0.8, z: -4.4 }]; return pickR(pts); }
  const pts = [{ x: 0.3, z: 0.5 }, { x: 2.0, z: 1.5 }, { x: 4.2, z: 0.9 }, { x: -1.8, z: 0.0 }, { x: 5.2, z: 1.5 }, { x: 1.2, z: 2.0 }]; return pickR(pts);
}
function pickIdle(c) {
  if (!c.present) return;
  if (c.withHero && S.outing) { c.gen = outingIdle(c); c.pri = PRI.IDLE; return; }
  if (c.reg === 'O' && !c.withHero) { c.gen = (function* () { yield* go(c, L.gateIn.x, L.gateIn.z - 0.6); })(); c.pri = PRI.IDLE; return; }
  if ((c === guest || c === friend) && !S.guestIn && c === guest) { c.gen = (function* () { face(c, { x: L.door.x, z: -2 }); yield 2; })(); c.pri = PRI.IDLE; return; }
  if (c === friend && !S.friendArrived) { c.gen = (function* () { yield 2; })(); c.pri = PRI.IDLE; return; }
  if (S.evening && !c.evening) { c.gen = eveningGather(c, 0); c.pri = PRI.IDLE; return; }
  const g = { papa: papaIdle, mama: mamaIdle, sib: sibIdle, dog: dogIdle, guest: guestIdle, friend: guestIdle }[c.id];
  c.gen = g(c); c.pri = PRI.IDLE;
}
function idleLine(c, ids, chance = 0.4) { if (time - S.lastVoiceT > 7 && Math.random() < chance && S.firstInput) say(c, ids, { vol: 0.75, pri: 1 }); }
function* papaIdle(c) {
  const r = Math.random();
  if (r < 0.32) {
    yield* go(c, L.island.x + L.island.w / 2 + 0.3, L.island.z); c.yawTarget = -Math.PI / 2; yield 0.3;
    c.st.pose = 'pour'; c.st.poseT = 0; W.pitcherTilt = 1; sfxAt('pour', c.pos, 0.7, { dur: 1.8 }); yield 2.0; W.pitcherTilt = 0; c.st.pose = 'idle';
    if (can('papaJuice', 40)) { idleLine(c, 'papa_ja_01', 0.8); }
    face(c, hero); yield rand(2, 4);
  } else if (r < 0.48) {
    for (const p of [{ x: L.dining.x - 0.5, z: L.dining.z + 0.62 }, { x: L.dining.x + 0.6, z: L.dining.z + 0.62 }]) { yield* go(c, p.x, p.z); c.yawTarget = Math.PI; yield* doPose(c, 'reach', 1.0); sfxAt('clink', c.pos, 0.4); }
  } else if (r < 0.66) {
    const p = pickR([{ x: 4.3, z: 1.0 }, { x: 0.8, z: 2.1 }, { x: -2.0, z: 0.9 }]);
    yield* go(c, p.x, p.z); c.yawTarget = 0.2; yield rand(3, 5);
    if (Math.random() < 0.5) { const s = findSeat({ x: L.gTable.x, z: L.gTable.z }, 1.6, c); if (s) { yield* sit(c, s); c.look = hero; c.lookUntil = time + 8; yield rand(6, 10); } }
  } else if (r < 0.8) {
    const s = findSeat({ x: L.sofa.x, z: L.sofa.z }, 1.2, c); if (s) { yield* sit(c, s); yield rand(6, 10); }
  } else if (r < 0.9 && dog.present && dog.reg === c.reg) {
    yield* goNear(c, dog, 0.45); yield* doPose(c, 'pet', 2.2); dog.st.wag = 1;
  } else {
    if (hero.reg !== 'O') { yield* goNear(c, hero, 1.8); c.look = hero; c.lookUntil = time + 4; yield* doPose(c, 'wave', 1.2); yield 2; }
  }
  yield rand(0.5, 2);
}
function* mamaIdle(c) {
  const r = Math.random();
  if (r < 0.25) {
    for (const p of [{ x: L.dining.x - 0.2, z: L.dining.z + 0.62 }, { x: L.island.x - 0.2, z: L.island.z + 0.62 }]) { yield* go(c, p.x, p.z); c.yawTarget = Math.PI; yield* doPose(c, 'reach', 1.2); sfxAt('clink', c.pos, 0.5, { pitch: 0.9 }); }
  } else if (r < 0.45 && S.guestIn && guest.present && !guest.withHero && guest.reg === c.reg) {
    yield* goNear(c, guest, 0.85); face(c, guest); guest.look = c; guest.lookUntil = time + 5;
    for (let k = 0; k < 3; k++) { c.talkUntil = performance.now() / 1000 + 1.0; yield 1.4; guest.talkUntil = performance.now() / 1000 + 0.9; yield 1.2; }
    idleLine(c, ['mama_ja_03'], 0.3);
  } else if (r < 0.6 && dog.present && dog.reg === c.reg && !dog.fetching) {
    yield* goNear(c, dog, 0.45); yield* doPose(c, 'pet', 2.4); dog.st.wag = 1; dog.look = c; dog.lookUntil = time + 2;
  } else if (r < 0.75) {
    yield* go(c, 4.4, 0.5); face(c, { x: 4.8, z: 0.2 }); yield* doPose(c, 'reach', 2); idleLine(c, 'mama_ja_06', 0.35); yield 2;
  } else if (r < 0.88) {
    const fam = [papa, sib].filter((x) => x.present && x.reg === c.reg); if (fam.length) { const f = pickR(fam); yield* goNear(c, f, 1.0); yield* doPose(c, 'beckon', 1.4); f.look = c; f.lookUntil = time + 2; }
  } else {
    yield* go(c, rand(-2, 2), -4.9); c.yawTarget = Math.PI; yield rand(3, 5);
  }
  yield rand(0.5, 2);
}
function* sibIdle(c) {
  const r = Math.random();
  const drum = IT.drum;
  if (r < 0.32 && drum.state === 'free' && drum.reg === c.reg) {
    yield* goNear(c, drum.pos, 0.32); face(c, hero);
    const s = groundSeat(drum.pos, c, 0.32); if (s) { c.seat = s; s.occ = c; c.st.pose = 'sitGround'; }
    for (let k = 0; k < 6; k++) { c.st.pose = 'drum'; c.st.hitL = 1; if (d2(hero.pos, c.pos) < 4) sfxAt('drum', c.pos, 0.35); yield 0.25; c.st.hitL = 0; c.st.hitR = 1; if (d2(hero.pos, c.pos) < 4) sfxAt('drum', c.pos, 0.3); yield 0.25; c.st.hitR = 0; yield rand(0.6, 1.4); }
    c.st.pose = sitPoseOf(c); yield 1;
  } else if (r < 0.5 && dog.present && !dog.fetching && dog.reg === c.reg && dog.pri <= PRI.IDLE) {
    setTask(dog, (function* () { const te = time + 8; while (time < te) { const p = c.reg === 'H' ? homePoint('H') : homePoint('G'); yield* go(dog, p.x, p.z, { run: true, tol: 0.3 }); } })(), PRI.IDLE);
    standUp(c); const te = time + 8; while (time < te) { c.goal = { x: dog.pos.x - 0.5, z: dog.pos.z }; c.speedMul = 1.3; c.st.smile = 1; yield 0.4; } c.goal = null; c.speedMul = 1;
  } else if (r < 0.62 && hero.reg !== 'O') {
    yield* goNear(c, hero, 1.5); face(c, hero); yield* doPose(c, 'wave', 1.4);
  } else if (r < 0.74 && S.guestIn && guest.present && guest.reg === c.reg && guest.pri <= PRI.IDLE) {
    // play together with the guest
    setTask(guest, (function* () { yield* goNear(guest, c, 0.8); face(guest, c); yield* doPose(guest, 'cheer', 1.2); standUp(guest); const te = time + 6; while (time < te) { guest.goal = { x: c.pos.x + 0.6, z: c.pos.z + 0.3 }; guest.speedMul = 1.3; yield 0.4; } guest.goal = null; guest.speedMul = 1; })(), PRI.IDLE);
    face(c, guest); yield* doPose(c, 'cheer', 1.2);
    for (let k = 0; k < 3; k++) { const p = homePoint('G'); yield* go(c, p.x, p.z, { run: true }); }
  } else if (r < 0.86) {
    for (let k = 0; k < 2; k++) { const p = homePoint(Math.random() < 0.5 ? 'G' : 'H'); yield* go(c, p.x, p.z, { run: true }); yield rand(0.5, 1.5); }
  } else {
    const s = groundSeat({ x: L.rug.x, z: L.rug.z }, c, 0.3); if (s) { yield* sit(c, s); yield rand(4, 7); }
  }
}
function* dogIdle(c) {
  if (IT.ball.holder === c) { // waiting with the ball
    face(c, hero); c.st.pose = 'sit'; c.st.wag = 0.8; yield rand(2, 4);
    if (Math.random() < 0.4) { yield* goNear(c, hero, 1.0); c.st.pose = 'sit'; c.st.wag = 1; yield 3; }
    return;
  }
  const r = Math.random();
  if (r < 0.25) { yield* go(c, L.dogBed.x, L.dogBed.z); c.st.pose = 'lie'; yield 1; c.st.pose = 'sleep'; yield rand(6, 12); c.st.pose = 'stretch'; yield 1.2; c.st.pose = 'idle'; }
  else if (r < 0.4) { yield* dogDrink(c); }
  else if (r < 0.55) { const p = homePoint(Math.random() < 0.6 ? c.reg === 'O' ? 'G' : c.reg : 'G'); yield* go(c, p.x, p.z); c.st.pose = 'sniff'; sfxAt('sniff', c.pos, 0.5); yield 1.5; c.st.pose = 'idle'; }
  else if (r < 0.7) { const t = pickR([hero, sib, mama, papa].filter((x) => x.present && x.reg === c.reg)); if (t) { yield* goNear(c, t, 0.6); c.st.wag = 1; c.st.pose = 'sit'; face(c, t); yield rand(2, 4); } }
  else if (r < 0.8 && S.guestIn && guest.present && guest.reg === c.reg) { yield* goNear(c, guest, 0.5); c.st.pose = 'beg'; c.st.wag = 1; if (guest.pri <= PRI.IDLE) setTask(guest, (function* () { face(guest, dog); yield* doPose(guest, 'pet', 2); })(), PRI.IDLE); yield 2; }
  else if (r < 0.9) { c.st.pose = 'stretch'; yield 1.4; c.st.pose = 'idle'; yield 1; }
  else { c.st.pose = 'lie'; yield rand(4, 7); c.st.pose = 'idle'; }
  c.st.wag = 0.3;
}
function* guestIdle(c) {
  const r = Math.random();
  const food = items.filter((i) => i.kind === 'food' && i.state === 'free' && i.reg === c.reg);
  if (r < 0.3) {
    const tgt = food.length ? food.sort((a, b) => d2(a.pos, c.pos) - d2(b.pos, c.pos))[0].pos : { x: L.dining.x, z: L.dining.z };
    const s = findSeat(tgt, 1.6, c); if (s) { yield* sit(c, s); face(c, tgt); for (let k = 0; k < 3; k++) { yield rand(2, 3); c.look = pickR([hero, mama, sib]); c.lookUntil = time + 2; } }
  } else if (r < 0.45 && IT.juice.state === 'free' && IT.juice.reg === c.reg) {
    yield* goNear(c, IT.juice.pos, 0.45); face(c, IT.juice.pos); yield* doPose(c, 'reach', 0.6); yield* doPose(c, 'drink', 1.4); sfxAt('sip', c.pos, 0.6);
  } else if (r < 0.6 && sib.present && sib.reg === c.reg) {
    yield* goNear(c, sib, 0.8); face(c, sib); sib.look = c; sib.lookUntil = time + 4;
    for (let k = 0; k < 2; k++) { c.talkUntil = performance.now() / 1000 + 0.8; yield 1.2; sib.talkUntil = performance.now() / 1000 + 0.8; yield 1.1; }
  } else if (r < 0.72 && dog.present && dog.reg === c.reg) {
    yield* goNear(c, dog, 0.45); yield* doPose(c, 'pet', 2); dog.st.wag = 1;
  } else if (r < 0.86) {
    const p = homePoint('G'); yield* go(c, p.x, p.z); c.yawTarget = 0.1; yield rand(3, 5);
  } else {
    yield* go(c, rand(-1.5, 2), -4.9); c.yawTarget = Math.PI; yield rand(3, 5);
  }
}
const SLOT = { papa: [-1.5, -0.2], mama: [-0.9, 0.55], sib: [0.9, 0.35], dog: [0.7, -0.5], guest: [-0.4, -0.7], friend: [0.2, 0.8] };
function* follow(c) {
  const s = SLOT[c.id] || [0, 0.8];
  const p = { x: hero.pos.x + s[0], z: hero.pos.z + s[1] }; clampPoint(p);
  const d = d2(c.pos, p);
  if (d > 0.5) yield* go(c, p.x, p.z, { run: d > 3.5, tol: 0.4 });
}
function* outingIdle(c) {
  const z = zoneAt(hero.pos.x, hero.pos.z);
  const far = () => d2(c.pos, hero.pos) > 4.2;
  if (d2(c.pos, hero.pos) > 3.0 || c.reg !== 'O') { yield* follow(c); return; }
  if (z === 'prom') {
    if (c === mama && Math.random() < 0.5) { yield* go(c, hero.pos.x + rand(-0.8, 0.8), 4.82); c.yawTarget = 0; yield until(5, far); if (can('mamaWind', 30)) say(c, 'mama_ja_05'); yield until(3, far); return; }
    if (c === sib && !S.outSeen.prom) { S.outSeen.prom = true; say(c, 'sibling_ja_04', { pri: 3 }); yield* doPose(c, 'cheer', 1); }
    if (c === sib) { yield* go(c, hero.pos.x + 1.8, hero.pos.z + 0.2, { run: true }); face(c, hero); yield until(3, far); return; }
    if (c === dog && Math.random() < 0.5) { const lp = [-1.5, 4.5, 9.5, 14.5].sort((a, b) => Math.abs(a - hero.pos.x) - Math.abs(b - hero.pos.x))[0]; yield* go(c, lp + 0.25, 4.5); c.st.pose = 'sniff'; sfxAt('sniff', c.pos, 0.5); yield until(2, far); c.st.pose = 'idle'; yield* follow(c); return; }
    if (c === papa && time - S.lastInput > 4) { const s = findSeat(hero.pos, 3.5, c, (s) => s.type === 'bench'); if (s) { yield* sit(c, s); c.look = hero; c.lookUntil = time + 6; yield until(8, far); return; } }
    yield* follow(c); yield until(2.5, far); return;
  }
  if (z === 'park') {
    if (c === sib) { yield* slideOnce(c); return; }
    if (c === mama) { const s = findSeat({ x: L.parkBench.x, z: L.parkBench.z }, 1.2, c); if (s) { yield* sit(c, s); c.look = hero; c.lookUntil = time + 5; yield until(8, () => d2(c.pos, hero.pos) > 7 || zoneAt(hero.pos.x, hero.pos.z) !== 'park'); return; } }
    if ((c === guest || c === friend)) { const sw = W.swings.find((s) => !s.seat.occ); if (sw && Math.random() < 0.7) { yield* sit(c, sw.seat); if (can('guestSwing', 25)) say(c, 'guest_ja_03'); yield until(8, () => d2(c.pos, hero.pos) > 7); return; } }
    if (c === papa) {
      const ball = IT.ball;
      if (ball.state === 'free' && ball.reg === 'O' && d2(ball.pos, c.pos) < 8 && !dog.fetching && dog.withHero) {
        yield* goNear(c, ball.pos, 0.3); attach(ball, c); sfxAt('pick', c.pos, 0.5);
        face(c, dog); yield* doPose(c, 'throw', 0.5); throwBall(ball, c, throwTarget(c)); sfxAt('whoosh', c.pos, 0.6); startFetch(ball, 'thrown', c); yield 2; return;
      }
      if (dog.withHero) { yield* goNear(c, dog, 0.45); yield* doPose(c, 'pet', 2); dog.st.wag = 1; return; }
    }
    if (c === dog && !c.fetching) { for (let k = 0; k < 3; k++) { const a = time * 1.5 + k * 2; yield* go(c, hero.pos.x + Math.sin(a) * 1.2, hero.pos.z + Math.cos(a) * 1.2, { run: true, tol: 0.3 }); } c.st.pose = 'sit'; yield 1; return; }
    yield* follow(c); yield until(3, far); return;
  }
  if (z === 'beach') {
    if (!S.outSeen.beach) { S.outSeen.beach = true; if (c === sib) { say(c, 'sibling_ja_04', { pri: 3 }); yield* doPose(c, 'cheer', 1); } }
    if (c === papa && !S.unpacked && basketState.where === 'papa') { yield* go(c, hero.pos.x + 0.9, hero.pos.z + 0.4); yield* doPose(c, 'reach', 0.6); unpackAtBeach(c); return; }
    const bl = IT.blanket;
    if (bl.spread && bl.reg === 'O' && d2(bl.pos, hero.pos) < 5 && !c.isDog && Math.random() < 0.6) { const s = findSeat(bl.pos, 1.2, c, (s) => s.type === 'blanket'); if (s) { yield* sit(c, s); face(c, bl.pos); yield until(10, far); return; } }
    if (c === sib) { yield* sandPlay(c); return; }
    if (c === dog) { if (Math.random() < 0.5) { yield* go(c, c.pos.x + rand(-1, 1), -2.3, { run: true }); c.st.pose = 'drink'; sfxAt('splash', c.pos, 0.5); yield 1.2; c.st.pose = 'idle'; yield* follow(c); } else { c.st.pose = 'dig'; for (let k = 0; k < 6; k++) { sfxAt('dig', c.pos, 0.5); puff(c.pos.clone().setY(c.pos.y + 0.05), 0xe2d8c0, 3); yield 0.25; } c.st.pose = 'idle'; } return; }
    if (c === mama) { if (can('mamaWind', 30)) { say(c, 'mama_ja_05'); } yield* go(c, hero.pos.x + rand(-1.2, 1.2), -2.1); c.yawTarget = Math.PI; yield until(5, far); return; }
    if (c === guest || c === friend) { if (mama.withHero && Math.random() < 0.5) { yield* goNear(c, mama, 0.8); face(c, mama); for (let k = 0; k < 2; k++) { c.talkUntil = performance.now() / 1000 + 0.9; yield 1.3; mama.talkUntil = performance.now() / 1000 + 0.9; yield 1.2; } return; } yield* go(c, hero.pos.x + rand(-1, 1), -2.2); c.yawTarget = Math.PI; yield until(5, far); return; }
    if (c === papa) { const s = groundSeat(hero.pos, c, 1.0); if (s) { yield* sit(c, s); c.look = hero; c.lookUntil = time + 6; yield until(8, far); return; } }
  }
  yield* follow(c); yield until(2.5, far);
}
function* slideOnce(c) {
  yield* go(c, W.slideBase.x, W.slideBase.z, { run: true, tol: 0.2 }); c.yawTarget = 0;
  yield* climbAndSlide(c);
  yield* doPose(c, 'cheer', 0.8);
}
function* climbAndSlide(c) {
  // climb the ladder
  let t0 = time; const from = c.pos.clone();
  c.fixedY = 0; c.st.pose = 'idle';
  while (time - t0 < 0.9) { const k = (time - t0) / 0.9; c.pos.x = W.slideTop.x; c.pos.z = from.z + (W.slideTop.z - from.z) * k; c.fixedY = W.slideTop.y * k; c.yaw = 0; c.st.speed = 1; yield 0; }
  c.st.pose = 'slide'; sfxAt('slide', c.pos, 0.9);
  t0 = time; const z0 = W.slideTop.z + 0.1, z1 = W.slideEnd.z;
  while (time - t0 < 0.9) { const k = (time - t0) / 0.9; c.pos.z = z0 + (z1 - z0) * k; c.fixedY = W.slideTop.y * (1 - k) + 0.04 - c.rig.P.leg; yield 0; }
  c.fixedY = null; c.st.pose = 'idle'; c.reg = constrain('O', c.pos);
}
function* sandPlay(c) {
  const p = { x: hero.pos.x + rand(0.8, 1.4), z: hero.pos.z + rand(-0.6, 0.6) }; clampPoint(p);
  yield* go(c, p.x, p.z); face(c, hero);
  let castle = sandcastles.find((s) => d2(s.pos, c.pos) < 0.9);
  if (!castle) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, 10), W.M.sand); const q = new V3(c.pos.x + Math.sin(c.yaw) * 0.35, groundH(c.pos.x, c.pos.z), c.pos.z + Math.cos(c.yaw) * 0.35); m.position.copy(q); m.scale.setScalar(0.1); m.castShadow = true; scene.add(m); castle = { m, pos: q, size: 0.1 }; sandcastles.push(castle); }
  const gs = { type: 'ground', x: c.pos.x, z: c.pos.z, yaw: c.yaw, occ: c, temp: true }; c.seat = gs; c.st.pose = 'dig';
  c.onCancel = () => { if (c.seat === gs) standUp(c); };
  for (let k = 0; k < 8; k++) { sfxAt('dig', c.pos, 0.5); castle.size = Math.min(1.6, castle.size + 0.12); castle.m.scale.setScalar(castle.size); puff(castle.pos.clone().setY(castle.pos.y + 0.1), 0xe2d8c0, 2); yield 0.4; }
  standUp(c); c.onCancel = null; c.st.pose = 'cheer'; yield 0.8; c.st.pose = 'idle';
}

// ---------- hero actions ----------
function heroBusy() { return !!hero.gen; }
function nearestChar(p, maxD, filter) { let best = null, bd = maxD; for (const c of chars) { if (c === hero || !c.present || (filter && !filter(c))) continue; const d = d2(c.pos, p); if (d < bd) { bd = d; best = c; } } return best; }
function heroSettle() {
  const hp = hero.pos;
  if (hero.holding && d2(W.lantern.pos, hp) < 1.0 && !nearestChar(hp, 0.9)) { hero.gen = (function* () { face(hero, W.lantern.pos); yield* doPose(hero, 'reach', 0.4); toggleLantern(); })(); return; }
  if (hero.holding) {
    const it = hero.holding;
    const npc = nearestChar(hp, 1.15, (c) => c.present && (c !== guest || S.guestIn || d2(c.pos, hp) < 1.2) && (c !== friend || S.friendArrived));
    if (npc) { heroGive(npc, it); return; }
    const ns = nearestSurface(hp, 0.9);
    if (ns && it.kind !== 'blanket') { hero.gen = (function* () { face(hero, ns.p); yield* doPose(hero, 'give', 0.35); placeItem(it, ns.p.x, ns.p.z); onPlaced(it); })(); return; }
    return;
  }
  // candidates: items to pick, lantern, seats, slide, swing, npcs
  const cands = [];
  for (const it of items) { if (!(it.state === 'free' || (it.state === 'held' && it.holder && it.holder.isDog))) continue; if (it.onRack && it.kind === 'hat') { if (d2(it.pos, hp) < 0.9) cands.push({ d: d2(it.pos, hp), f: () => { wearHat(it); } }); continue; } const ip = it.state === 'held' ? it.holder.pos : it.pos; const d = d2(ip, hp); if (d < 0.8 && (regionAt(ip.x, ip.z) === hero.reg || d < 0.5)) cands.push({ d, f: () => heroPick(it) }); }
  if (d2(W.lantern.pos, hp) < 1.0) cands.push({ d: d2(W.lantern.pos, hp), f: () => { hero.gen = (function* () { face(hero, W.lantern.pos); yield* doPose(hero, 'reach', 0.4); toggleLantern(); })(); } });
  if (d2(W.slideBase, hp) < 0.75) cands.push({ d: d2(W.slideBase, hp) + 0.1, f: () => { hero.gen = climbAndSlide(hero); } });
  for (const s of allSeats()) { if (s.occ) continue; const q = seatPos(s); const d = Math.hypot(q.x - hp.x, q.z - hp.z); if (d < 0.6 && regionAt(q.x, q.z) === hero.reg) cands.push({ d: d + 0.12, f: () => { hero.gen = sit(hero, s); } }); }
  const npc = nearestChar(hp, 1.1, (c) => c.present && (c !== friend || S.friendArrived));
  if (npc) cands.push({ d: d2(npc.pos, hp) + 0.3, f: () => greetNpc(npc) });
  if (!cands.length) return;
  cands.sort((a, b) => a.d - b.d); cands[0].f();
}
function heroPick(it) {
  if (it.kind === 'hat') { wearHat(it); return; }
  if (it.holder && it.holder.isDog) { const d = it.holder; if (d.gen && d.pri >= PRI.SOCIAL) cancelTask(d); d.fetching = false; }
  hero.gen = (function* () { face(hero, it.state === 'held' ? it.holder.pos : it.pos); yield* doPose(hero, 'reach', 0.3); attach(it, hero); sfxAt('pick', hero.pos, 0.9); if (it.kind === 'ball' && dog.present && d2(dog.pos, hero.pos) < 3 && can('heroDog', 14)) say(hero, 'hero_ja_02', { pri: 3 }); })();
}
function heroGive(npc, it) {
  hero.gen = (function* () {
    face(hero, npc); yield* doPose(hero, 'give', 0.45);
    if (npc.isDog && it.kind === 'ball') { if (can('heroDog', 10)) say(hero, 'hero_ja_02', { pri: 3 }); }
    else if (can('heroDouzo', 3)) say(hero, 'hero_ja_01', { pri: 3 });
    release(it); npcReceive(npc, it, 'hero');
  })();
}
function greetNpc(c) {
  if (c.pri >= PRI.SOCIAL) { c.look = hero; c.lookUntil = time + 2; return; }
  if (c === guest || c === friend) S.guestInvited = true;
  if (c.isDog) {
    setTask(c, (function* () { face(c, hero); c.st.wag = 1; sfxAt('bark', c.pos, 0.6);
      if (IT.ball.holder === c) { release(IT.ball); IT.ball.pos.set(c.pos.x, 0.3, c.pos.z); IT.ball.reg = c.reg; IT.ball.vel.set((hero.pos.x - c.pos.x) * 0.9, 0.6, (hero.pos.z - c.pos.z) * 0.9); IT.ball.rolling = true; }
      c.st.pose = 'hop'; yield 1.0; c.st.pose = 'sit'; yield 1.5; })(), PRI.CALL);
    return;
  }
  setTask(c, (function* () {
    face(c, hero); c.look = hero; c.lookUntil = time + 3; c.st.smile = 1;
    if (c.seat) { c.st.pose = c.seat.type === 'chair' || c.seat.type === 'bench' || c.seat.type === 'sofa' ? 'sit' : 'sitGround'; }
    else yield* doPose(c, 'wave', 0.9);
    if (c === guest || c === friend) { if (can('greetG' + c.id, 25)) say(c, ['guest_en_01', 'guest_ja_05']); }
    else if (c === sib) { if (IT.drum.state === 'free' && d2(IT.drum.pos, c.pos) < 2.5) { startMusic(null); return; } if (can('greetSib', 12)) say(c, ['sibling_ja_01', 'sibling_en_01']); }
    else if (c === mama) { if (can('greetMama', 18)) say(c, zoneAt(c.pos.x, c.pos.z) === 'garden' ? 'mama_ja_06' : 'mama_ja_03'); }
    else if (c === papa) { if (can('greetPapa', 18)) { if (zoneAt(c.pos.x, c.pos.z) === 'house') { say(c, 'papa_ja_01'); later(1.5, () => say(hero, 'hero_en_01', { reply: true })); } else { c.st.clapT = 0.2; sfxAt('clap', c.pos, 0.6); } } }
    yield 2.0;
  })(), PRI.CALL);
}
function onPlaced(it) {
  // NPCs notice the placement and change how they sit / play
  const reg = regionAt(it.pos.x, it.pos.z);
  if (it.kind === 'food' || it.kind === 'drink') { if (it.kind === 'food' || zoneAt(it.pos.x, it.pos.z) !== 'house') later(0.5, () => startFeast(it, null)); return; }
  if (it.kind === 'blanket' && it.spread) { later(0.4, () => startFeast(it, null)); return; }
  if (it.kind === 'ball') { if (dog.present && !dog.fetching && dog.reg === reg && d2(dog.pos, it.pos) < 6) { dog.look = it; startFetch(it, 'thrown', hero, PRI.REACT); } return; }
  if (it.kind === 'instrument') { if (sib.present && sib.reg === reg && d2(sib.pos, it.pos) < 1.4) { later(0.3, () => startMusic(null)); } return; }
}

// ---------- input ----------
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new V3(0, 1, 0), 0); const tmpV = new V3();
let drag = null;
function groundPoint(cx, cy, y = null) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  let h = y == null ? 0 : y; const out = new V3();
  for (let k = 0; k < 3; k++) { plane.constant = -h; if (!ray.ray.intersectPlane(plane, out)) return null; if (y != null) break; h = groundH(out.x, out.z); }
  return out;
}
function toScreen(v) { tmpV.copy(v).project(camera); return { x: (tmpV.x + 1) / 2 * innerWidth, y: (1 - tmpV.y) / 2 * innerHeight }; }
function pickAt(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const objs = [];
  for (const it of items) if (it.mesh.visible && (it.state === 'free' || (it.state === 'held' && (it.holder === hero || it.holder.isDog)))) objs.push(it.mesh);
  for (const ch of chairs) objs.push(ch.mesh);
  objs.push(hero.rig.root, W.lantern.group, W.door.leaf);
  const hits = ray.intersectObjects(objs, true);
  let direct = null;
  for (const h of hits) {
    let o = h.object; while (o && !o.userData.pick && o !== hero.rig.root && o !== W.lantern.group && o !== W.door.leaf) o = o.parent;
    if (!o) continue;
    if (o === hero.rig.root) { direct = { type: 'hero' }; break; }
    if (o === W.lantern.group) { direct = { type: 'lantern' }; break; }
    if (o === W.door.leaf) { direct = { type: 'door' }; break; }
    const p = o.userData.pick; direct = p.isChair ? { type: 'chair', obj: p } : { type: 'item', obj: p }; break;
  }
  // a held item in the hero's hand wins over the hero body if touched near the hand
  if (hero.holding) { const sp = toScreen(hero.holding.mesh.getWorldPosition(new V3())), hp = toScreen(hero.pos.clone().setY(hero.pos.y + 0.45)); const di = Math.hypot(sp.x - x, sp.y - y); if (di < 24 && di < Math.hypot(hp.x - x, hp.y - y)) return { type: 'item', obj: hero.holding }; }
  if (direct) return direct;
  // generous screen-distance fallback
  let best = null, bd = 1e9;
  const consider = (type, obj, wp, rad, bias = 0) => { const sp = toScreen(wp); const d = Math.hypot(sp.x - x, sp.y - y) + bias; if (d < rad && d < bd) { bd = d; best = { type, obj }; } };
  consider('hero', null, hero.pos.clone().setY(hero.pos.y + 0.45), 62, -6);
  for (const it of items) { if (!it.mesh.visible || !(it.state === 'free' || (it.state === 'held' && it.holder.isDog))) continue; consider('item', it, it.mesh.getWorldPosition(new V3()).setY(it.mesh.getWorldPosition(new V3()).y + 0.05), 38); }
  for (const ch of chairs) consider('chair', ch, ch.pos.clone().setY(0.45), 30, 8);
  consider('lantern', null, W.lantern.pos, 40);
  return best || { type: 'ground' };
}
const cvs = renderer.domElement;
cvs.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audio.unlock(); S.firstInput = true; S.lastInput = time; hideHint(true);
  if (drag) return;
  try { cvs.setPointerCapture(e.pointerId); } catch (er) {}
  const t = pickAt(e.clientX, e.clientY);
  drag = { id: e.pointerId, ...t, sx: e.clientX, sy: e.clientY, t0: time, moved: false, x: e.clientX, y: e.clientY };
  // music: any tap near the band joins in on the next musical slot
  if (audio.music && musicFor && d2(hero.pos, musicFor.center) < 4.5) {
    const kind = hero.holding && hero.holding.id === 'tamb' ? 'tamb' : hero.holding && hero.holding.id === 'drum' ? 'drum' : (Math.random() < 0.25 ? 'clap' : 'bell');
    audio.heroHit(kind);
  } else if (S.evening && hero.reg === 'G' && d2(hero.pos, L.gTable) < 3 && sib.present && sib.evening) { startMusic(null); audio.heroHit('clap'); }
  if (t.type === 'hero' || t.type === 'ground') { interruptHero(); }
  if (t.type === 'item') {
    const it = t.obj;
    if (it.holder && it.holder.isDog) { const d = it.holder; cancelTask(d); d.fetching = false; }
    if (it.holder === hero) hero.holding = null;
    if (it.state === 'worn') return;
    if (it.spread) unspread(it);
    it.state = 'drag'; it.holder = null; it.rolling = false; it.onRack = false;
    sfxAt('pick', it.pos, 0.8);
  }
  if (t.type === 'chair') { const ch = t.obj; if (ch.seat.occ) { const c = ch.seat.occ; if (c === hero) interruptHero(); else cancelTask(c); standUp(c); } sfxAt('chair', ch.pos, 0.6); }
  if (t.type === 'ground') { const p = groundPoint(e.clientX, e.clientY); if (p) { setHeroGoal(p); showRing(p); } }
  if (t.type === 'hero') { hero.dragging = true; }
});
cvs.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.x = e.clientX; drag.y = e.clientY;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 10) drag.moved = true;
  if ((drag.type === 'lantern' || drag.type === 'door') && drag.moved) { drag.type = 'ground'; interruptHero(); }
});
function endDrag(e) {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  const dg = drag; drag = null; S.lastInput = time;
  const p = groundPoint(dg.x, dg.y);
  if (dg.type === 'hero' || dg.type === 'ground') { hero.dragging = false; if (p) setHeroGoal(p); hero.settlePending = true; }
  else if (dg.type === 'item') dropItem(dg.obj, dg.x, dg.y);
  else if (dg.type === 'chair') { const ch = dg.obj; sfxAt('koton', ch.pos, 0.7, { pitch: 0.6 }); }
  else if (dg.type === 'lantern') { if (d2(hero.pos, W.lantern.pos) < 3.5 || hero.reg === 'G') { setHeroGoal({ x: W.lantern.pos.x + 0.45, z: W.lantern.pos.z + 0.35 }); hero.settlePending = true; } else toggleLantern(); }
  else if (dg.type === 'door') { openDoor(W.door.target < 0.5); }
}
cvs.addEventListener('pointerup', endDrag); cvs.addEventListener('pointercancel', endDrag);
cvs.addEventListener('contextmenu', (e) => e.preventDefault());
function interruptHero() { if (hero.gen) { const f = hero.onCancel; hero.onCancel = null; if (f) f(); hero.gen = null; hero.wait = 0; hero.waitFn = null; } hero.fixedY = null; standUp(hero); hero.st.pose = 'idle'; hero.settlePending = false; }
function setHeroGoal(p) { const q = { x: p.x, z: p.z }; clampPoint(q); if (hero.goal && Math.hypot(hero.goal.x - q.x, hero.goal.z - q.z) < 0.06) return; hero.goal = q; hero.goalTol = 0.06; }
function showRing(p) { ring.position.set(p.x, groundH(p.x, p.z) + 0.02, p.z); ring.material.opacity = 0.7; ring.scale.setScalar(0.6); }
function dropItem(it, sx, sy) {
  const p = groundPoint(sx, sy); it.state = 'free'; it.moved = true; blob.visible = false;
  if (!p) { placeItem(it, it.home.x, it.home.z); return; }
  const q = { x: p.x, z: p.z }; clampPoint(q);
  // give to a person if dropped near them (generous)
  if (it.kind === 'hat' && d2(hero.pos, q) < 0.7) { wearHat(it); return; }
  const target = nearestChar(q, 0.75, (c) => c.present && (c !== guest || S.guestIn || d2(c.pos, q) < 0.6) && (c !== friend || S.friendArrived));
  const heroNear = d2(hero.pos, q) < 0.5 && (!target || d2(hero.pos, q) < d2(target.pos, q));
  if (heroNear && it.kind !== 'hat') { attach(it, hero); sfxAt('pick', hero.pos); return; }
  if (target) { if (it.kind === 'hat' && !target.isDog) { npcReceive(target, it, 'drag'); return; } npcReceive(target, it, 'drag'); return; }
  // otherwise it lands where the finger left it
  if (it.kind === 'ball') { it.pos.set(q.x, groundH(q.x, q.z) + 0.25, q.z); it.reg = regionAt(q.x, q.z); it.vel.set(rand(-0.4, 0.4), 0.4, rand(-0.4, 0.4)); it.rolling = true; release(it); it.state = 'free'; sfxAt('bounce', it.pos); onPlaced(it); return; }
  placeItem(it, q.x, q.z);
  onPlaced(it);
}

// ---------- hint (only once, only if idle at the very first visit) ----------
const hand = document.getElementById('hand');
let hint = null;
function hideHint(forever) { if (hint) { hint = null; } hand.style.opacity = '0'; if (forever) S.hintDone = true; }
function updateHint() {
  if (S.hintDone || saved) return;
  if (!hint && time > 6 && !S.firstInput) { hint = { t0: time }; }
  if (!hint) return;
  const k = (time - hint.t0) / 2.6;
  const from = hero.pos.clone().setY(0.5), cake = IT.cake.pos.clone();
  const to = from.clone().lerp(new V3(cake.x + 0.5, 0.5, cake.z + 0.7), 0.6);
  if (k < 1) {
    const s = toScreen(k < 0.25 ? from : from.clone().lerp(to, (k - 0.25) / 0.75));
    hand.style.transform = `translate(${s.x - 18}px, ${s.y - 6}px) scale(${k < 0.2 ? 1.1 - k * 0.5 : 1})`;
    hand.style.opacity = String(k < 0.15 ? k / 0.15 * 0.7 : k > 0.85 ? (1 - k) / 0.15 * 0.7 : 0.7);
    if (k > 0.25 && !hint.moved) { hint.moved = true; setHeroGoal(to); }
  } else { hideHint(true); }
}

// ---------- per-frame updates ----------
const camT = new V3(0.3, 0.4, -1.1); const camPos = new V3();
let viewW = 7.6;
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h;
  camera.fov = w < h ? 44 : 36; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
let camHoldX = null;
function updateCamera(dt, snap) {
  const z = zoneAt(hero.pos.x, hero.pos.z);
  const home = z === 'house' || z === 'garden';
  let tx, tz;
  if (home) { const nar = camera.aspect < 0.8; tx = nar ? clamp(0.35 + (hero.pos.x - 0.35) * 0.55, -1.0, 1.8) : 0.3 + (hero.pos.x - 0.3) * 0.25; tz = (nar ? -1.6 : -1.15) + (hero.pos.z + 1.6) * 0.12; }
  else { tx = clamp(hero.pos.x, 0.35, 25.5); tz = z === 'prom' ? 0.6 : z === 'park' ? -0.6 : -0.2; }
  const dragging = drag && (drag.type === 'hero' || drag.type === 'ground' || drag.type === 'item' || drag.type === 'chair');
  if (dragging) {
    // keep the world still under the finger; slide only when the finger rests near a screen edge
    if (camHoldX == null) camHoldX = camT.x;
    const ex = drag.x / innerWidth; const edge = ex < 0.13 ? -1 : ex > 0.87 ? 1 : 0;
    if (edge) camHoldX = clamp(camHoldX + edge * dt * 2.4, home ? -1.2 : -0.5, 26);
    tx = camHoldX; tz = camT.z;
  } else camHoldX = null;
  const k = snap ? 1 : 1 - Math.exp(-dt * (dragging ? 6 : 2.2));
  camT.x += (tx - camT.x) * k; camT.z += (tz - camT.z) * k; camT.y = home ? 0.35 : 0.2;
  const aspect = camera.aspect, vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
  const wantW = home ? (camera.aspect < 0.8 ? 6.0 : 6.9) : (camera.aspect < 0.8 ? 6.4 : 7.6);
  const dist = Math.max(wantW / 2 / Math.tan(hf / 2), 8.6 / 2 / Math.tan(vf / 2), 7.5);
  const pitch = 0.66;
  camPos.set(camT.x, camT.y + Math.sin(pitch) * dist, camT.z + Math.cos(pitch) * dist);
  camera.position.copy(camPos); camera.lookAt(camT);
  // shadow camera follows
  const so = W.sunOffset || new V3(-5, 12, 6);
  W.sun.position.set(camT.x + so.x, so.y, camT.z + so.z); W.sun.target.position.set(camT.x, 0, camT.z);
  const sc = W.sun.shadow.camera, ext = home ? 7.5 : 9; if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
}
function updateChar(c, dt) {
  const r = c.rig;
  if (!c.present) { r.root.visible = false; return; } r.root.visible = true;
  let sp = 0;
  if (c.seat) {
    const q = seatPos(c.seat); const k = Math.min(1, dt * 8);
    c.pos.x += (q.x - c.pos.x) * k; c.pos.z += (q.z - c.pos.z) * k; c.yaw = lerpAngle(c.yaw, q.yaw, k);
    if (!c.isDog) { c.fixedY = q.y - r.P.leg + (c.seat.type === 'ground' || c.seat.type === 'blanket' ? 0.0 : 0.02); }
  } else if (c.goal) {
    if (c.pathGoal !== c.goal) { const replan = c !== hero || !c.path || time - (c.pathT || 0) > 0.12 || losFree(c.pos, c.goal); if (replan) { c.path = findPath(c.pos, c.goal) || [c.goal]; c.pi = 0; c.pathGoal = c.goal; c.pathT = time; } }
    let wp = c.path[c.pi] || c.goal;
    const final = c.pi >= c.path.length - 1;
    const dx = wp.x - c.pos.x, dz = wp.z - c.pos.z, d = Math.hypot(dx, dz);
    if (!final && (d < 0.05 || (d < 0.22 && losFree(c.pos, c.path[c.pi + 1])))) { c.pi++; }
    else if (final && d < c.goalTol) { if (c.pathGoal === c.goal) { c.goal = null; c.vel = 0; c.path = null; } else c.pathT = -1; }
    else if (d > 1e-4) {
      const maxV = c.speed * c.speedMul * (c === hero && !hero.dragging ? 0.8 : 1);
      c.vel = Math.min(maxV, c.vel + dt * maxV * 5); if (final) c.vel = Math.min(c.vel, d * 5 + 0.25);
      let ux = dx / d, uz = dz / d;
      if (c !== hero) [ux, uz] = avoidChars(c, ux, uz);
      const step = Math.min(d, c.vel * dt);
      const np = { x: c.pos.x + ux * step, z: c.pos.z + uz * step };
      c.reg = constrain(c.reg, np);
      sp = Math.hypot(np.x - c.pos.x, np.z - c.pos.z) / Math.max(dt, 1e-3);
      c.pos.x = np.x; c.pos.z = np.z;
      if (sp > 0.05) c.yaw = lerpAngle(c.yaw, Math.atan2(ux, uz), Math.min(1, dt * 10));
    }
    // stuck check on real displacement (includes being pushed by others)
    if (!c._chk || time - c._chk.t > 0.8) { if (c._chk && c.goal && Math.hypot(c.pos.x - c._chk.x, c.pos.z - c._chk.z) < 0.08) c.stuckN = (c.stuckN || 0) + 1; else c.stuckN = 0; c._chk = { x: c.pos.x, z: c.pos.z, t: time }; if (c.stuckN === 1) c.pathGoal = null; if (c.stuckN >= 3 && !(c === hero && hero.dragging)) { c.goal = null; c.path = null; c.stuckN = 0; } }
  } else c.vel = 0;
  if (!c.seat && c.fixedY == null) pushOut(c);
  if (!c.goal && !c.seat && c.yawTarget != null) c.yaw = lerpAngle(c.yaw, c.yawTarget, Math.min(1, dt * 6));
  if (c.goal) c.yawTarget = null;
  c.moveSpeed += (sp - c.moveSpeed) * Math.min(1, dt * 12);
  const gy = groundH(c.pos.x, c.pos.z);
  let y = c.fixedY != null ? c.fixedY + (c.seat ? 0 : gy) : gy;
  if (c === hero && hero.hop > 0) { hero.hop -= dt; y += Math.sin((0.25 - Math.max(0, hero.hop)) / 0.25 * Math.PI) * 0.06; }
  r.root.position.set(c.pos.x, y, c.pos.z); c.pos.y = gy; r.root.rotation.y = c.yaw;
  // footsteps
  if (sp > 0.2 && c.fixedY == null) { c.stepAcc += sp * dt; const stride = c.isDog ? 0.2 : c.kid ? 0.3 : 0.42; if (c.stepAcc > stride) { c.stepAcc = 0; if (c.isDog) sfxAt('paw', c.pos, 0.8); else sfxAt('step', c.pos, c === hero ? 1 : 0.7, { surf: surfaceType(c.pos.x, c.pos.z) }); } }
  // look target
  let lt = null;
  if (c.look && time < c.lookUntil) lt = posOf(c.look);
  else if (!c.isDog || true) {
    const speaker = audio.current && audio.current.end > audio.now() ? audio.current.who : null;
    if (speaker && speaker !== c && d2(speaker.pos, c.pos) < 4.5) lt = speaker.pos;
    else if (c !== hero && d2(hero.pos, c.pos) < 2.2) lt = hero.pos;
    else if (c === hero) { const n = nearestChar(hero.pos, 2.0); if (n) lt = n.pos; }
  }
  if (lt) { let rel = Math.atan2(lt.x - c.pos.x, lt.z - c.pos.z) - c.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel)); c.st.lookYaw = clamp(rel, -1.1, 1.1); if (Math.abs(rel) > 1.3 && !c.goal && !c.seat && c.pri <= PRI.IDLE && c.st.pose === 'idle') c.yawTarget = c.yaw + rel * 0.7; }
  else c.st.lookYaw *= 0.95;
  // talking level from the analyser (lip sync)
  const nowS = performance.now() / 1000; let tl = 0;
  if (nowS < c.talkUntil) { if (c.analyser) { c.analyser.getByteTimeDomainData(ana); let s = 0; for (let i = 0; i < ana.length; i++) { const v = (ana[i] - 128) / 128; s += v * v; } tl = Math.min(1, Math.sqrt(s / ana.length) * 7); } else tl = 0.35 + 0.35 * Math.sin(nowS * 22); }
  c.st.talk += (tl - c.st.talk) * Math.min(1, dt * 18);
  // smile when the hero is close, when talking, when playing
  const near = c !== hero && d2(hero.pos, c.pos) < 1.8;
  c.st.smile += ((near || tl > 0.1 || c.st.pose === 'cheer' ? 1 : 0.3) - c.st.smile) * Math.min(1, dt * 3);
  // hero reaches toward nearby things while walking
  if (c === hero) { let reach = 0; if (!hero.holding) for (const it of items) if (it.state === 'free' && d2(it.pos, hero.pos) < 0.7) reach = 1; c.st.reach += (reach - c.st.reach) * Math.min(1, dt * 6); }
  // NPC hands out toward an item being dragged near them
  if (c !== hero && drag && drag.type === 'item') { const ip = drag.obj.pos; if (d2(ip, c.pos) < 1.1) { c.st.reach = 1; c.look = drag.obj; c.lookUntil = time + 0.3; } else c.st.reach *= 0.9; } else if (c !== hero) c.st.reach *= 0.9;
  c.st.hold = !!c.holding && !c.isDog; c.st.seated = !!c.seat && !c.isDog;
  c.st.speed = c.moveSpeed; c.st.poseT += dt;
  if (c.st.clapT > 0) c.st.clapT -= dt;
  if (c.st.clapT > 0 && c.st.pose !== 'clap' && c.st.pose !== 'sitClap' && !c.isDog && (c === papa || c === hero || c === guest || c === friend) && !c.goal) c.st.pose = c.seat ? 'sitClap' : 'clap';
  if (c.st.clapT <= 0 && (c.st.pose === 'clap' || c.st.pose === 'sitClap') && c.pri < PRI.SOCIAL && c !== papa) c.st.pose = sitPoseOf(c);
  if (c.isDog) animDog(r, c.st, dt, time); else animHuman(r, c.st, dt, time);
}
function avoidChars(c, ux, uz) {
  let nx = ux, nz = uz;
  for (const o of chars) {
    if (o === c || !o.present) continue;
    const ox = o.pos.x - c.pos.x, oz = o.pos.z - c.pos.z, d = Math.hypot(ox, oz), R = c.rad + o.rad + 0.12;
    if (d > R + 0.55) continue; const ahead = ox * ux + oz * uz; if (ahead <= 0) continue;
    const pr = ox * uz - oz * ux; if (Math.abs(pr) > R) continue;
    const w = (1 - Math.abs(pr) / R) * Math.min(1, (R + 0.55 - d) / 0.55); const sg = pr >= 0 ? -1 : 1;
    nx += sg * uz * w * 1.7; nz += sg * -ux * w * 1.7;
  }
  const l = Math.hypot(nx, nz) || 1; return [nx / l, nz / l];
}
function avoid(c, ux, uz, dist) {
  let nx = ux, nz = uz;
  const R0 = c.rad + 0.08;
  for (const o of colliders()) {
    const ox = o.x - c.pos.x, oz = o.z - c.pos.z, d = Math.hypot(ox, oz), R = o.r + R0;
    if (d > R + 0.7 || d > dist + o.r) continue;
    const ahead = ox * ux + oz * uz; if (ahead <= 0) continue;
    const pr = ox * uz - oz * ux; if (Math.abs(pr) > R) continue;
    const w = (1 - Math.abs(pr) / R) * Math.min(1, (R + 0.7 - d) / 0.7);
    const sg = pr >= 0 ? -1 : 1;
    nx += sg * uz * w * 1.8; nz += sg * -ux * w * 1.8;
  }
  const l = Math.hypot(nx, nz) || 1; return [nx / l, nz / l];
}
function pushOut(c) {
  for (const o of colliders()) {
    if (o.chair && o.chair.seat.occ === c) continue;
    const dx = c.pos.x - o.x, dz = c.pos.z - o.z, d = Math.hypot(dx, dz), R = o.r + c.rad;
    if (d < R && d > 1e-4) { const p = { x: o.x + dx / d * R, z: o.z + dz / d * R }; c.reg = constrain(c.reg, p); c.pos.x = p.x; c.pos.z = p.z; }
  }
}
function separate() {
  const live = chars.filter((c) => c.present && !c.seat && c.fixedY == null);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j]; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), R = a.rad + b.rad + 0.04;
    if (d < R && d > 1e-4) {
      const push = (R - d); const ux = dx / d, uz = dz / d;
      const wa = a === hero ? 0 : b === hero ? 1 : 0.5, wb = 1 - wa;
      const pa = { x: a.pos.x - ux * push * wa, z: a.pos.z - uz * push * wa }; a.reg = constrain(a.reg, pa); a.pos.x = pa.x; a.pos.z = pa.z;
      const pb = { x: b.pos.x + ux * push * wb, z: b.pos.z + uz * push * wb }; b.reg = constrain(b.reg, pb); b.pos.x = pb.x; b.pos.z = pb.z;
    }
  }
}
const _hw = new V3();
function updateItems(dt) {
  for (const it of items) {
    if (it.state === 'basket') { it.mesh.visible = false; continue; }
    if (it.state === 'worn') continue;
    it.mesh.visible = true;
    if (it.state === 'drag' && drag && drag.obj === it) {
      const p = groundPoint(drag.x, drag.y);
      if (p) {
        const q = { x: p.x, z: p.z }; const reg = regionAt(q.x, q.z);
        const s = surfaceAt(q.x, q.z); const base = s ? s.y : groundH(q.x, q.z);
        const tgt = new V3(q.x, base + 0.32, q.z); it.pos.lerp(tgt, Math.min(1, dt * 20)); it.reg = reg;
        blob.visible = true; blob.position.set(it.pos.x, base + 0.012, it.pos.z); blob.scale.setScalar(it.kind === 'blanket' ? 1.4 : 1);
      }
      it.mesh.position.copy(it.pos); it.mesh.rotation.set(Math.sin(time * 6) * 0.05, it.yaw, 0); continue;
    }
    if (it.state === 'held' && it.holder) {
      const h = it.holder;
      if (h.isDog) { h.rig.mouthA.getWorldPosition(_hw); it.mesh.position.set(_hw.x, _hw.y - 0.07, _hw.z); it.mesh.scale.setScalar(0.85); }
      else { h.rig.hands[0].getWorldPosition(_hw); const off = it.kind === 'blanket' ? 0.06 : it.h * 0.55; it.mesh.position.set(_hw.x, _hw.y - off, _hw.z); it.mesh.scale.setScalar(it.kind === 'food' ? 0.9 : 1); }
      it.mesh.rotation.set(0, h.yaw, 0); it.pos.copy(it.mesh.position); it.reg = h.reg; continue;
    }
    it.mesh.scale.setScalar(1);
    if (it.rolling) {
      it.vel.y -= 9.8 * dt; it.pos.addScaledVector(it.vel, dt);
      const p = { x: it.pos.x, z: it.pos.z }; const before = { ...p }; it.reg = constrain(it.reg, p);
      if (Math.abs(p.x - before.x) > 1e-4) it.vel.x *= -0.5; if (Math.abs(p.z - before.z) > 1e-4) it.vel.z *= -0.5;
      it.pos.x = p.x; it.pos.z = p.z;
      for (const o of W.colliders) { const dx = it.pos.x - o.x, dz = it.pos.z - o.z, d = Math.hypot(dx, dz); if (d < o.r + 0.07 && d > 1e-4) { it.pos.x = o.x + dx / d * (o.r + 0.07); it.pos.z = o.z + dz / d * (o.r + 0.07); const vn = (it.vel.x * dx + it.vel.z * dz) / d; if (vn < 0) { it.vel.x -= 1.5 * vn * dx / d; it.vel.z -= 1.5 * vn * dz / d; } } }
      const g = groundH(it.pos.x, it.pos.z);
      if (it.pos.y < g) { it.pos.y = g; if (it.vel.y < -1.0) { it.vel.y *= -0.45; sfxAt('bounce', it.pos, Math.min(1, -it.vel.y / 3)); } else it.vel.y = 0; }
      if (it.pos.y <= g + 0.001) { it.vel.x *= 1 - Math.min(1, dt * 1.6); it.vel.z *= 1 - Math.min(1, dt * 1.6); }
      const hs = Math.hypot(it.vel.x, it.vel.z); const ball = it.mesh.userData.ball; if (ball) { ball.rotation.x += it.vel.z * dt / 0.075; ball.rotation.z -= it.vel.x * dt / 0.075; }
      if (hs < 0.06 && it.pos.y <= g + 0.001) { it.rolling = false; it.vel.set(0, 0, 0); }
    }
    it.mesh.position.copy(it.pos);
    if (it.onRack) { it.mesh.position.set(W.rackTop.x + (it.id === 'hatW' ? 0.05 : -0.05), W.rackTop.y - 0.12, W.rackTop.z + (it.id === 'hatW' ? 0.04 : -0.03)); it.mesh.rotation.set(it.id === 'hatW' ? 0.5 : -0.4, 0, 0.3); }
    else it.mesh.rotation.set(0, it.yaw, 0);
    if (it.bite > 0) { it.bite -= dt * 2; it.mesh.scale.setScalar(1 - Math.max(0, it.bite) * 0.08); }
    if (it.spread) { const sm = it.mesh.userData.spreadMesh; sm.scale.x += (1 - sm.scale.x) * Math.min(1, dt * 8); sm.scale.z += (1 - sm.scale.z) * Math.min(1, dt * 8); }
  }
  // basket prop
  if (basketState.where === 'papa' && papa.present) { papa.rig.hands[1].getWorldPosition(_hw); basket.position.set(_hw.x, _hw.y - 0.16, _hw.z); basket.rotation.y = papa.yaw; basket.visible = true; papa.st.hold = true; }
  else if (basketState.where === 'ground') { basket.position.copy(basketState.pos); basket.visible = true; }
  else basket.visible = false;
  // teapot prop in mama's hand
  if (mama.prop === W.teapot) { mama.rig.hands[0].getWorldPosition(_hw); W.teapot.position.set(_hw.x, _hw.y - 0.12, _hw.z); W.teapot.rotation.set(0, mama.yaw, mama.st.pose === 'pour' ? -0.6 : 0); }
  // cups fill
  for (const cup of W.cups) { cup.fill += ((cup.target || 0) - cup.fill) * Math.min(1, dt * 1.5); cup.tea.visible = cup.fill > 0.02; cup.tea.scale.y = Math.max(0.01, cup.fill); cup.tea.position.y = 0.025 * cup.fill; }
  // pitcher pour
  W.pitcher.rotation.z += ((W.pitcherTilt ? 0.9 : 0) - W.pitcher.rotation.z) * Math.min(1, dt * 5);
  if (W.pitcherTilt && papa.present) { papa.rig.hands[0].getWorldPosition(_hw); W.pitcher.position.set(_hw.x, _hw.y - 0.12, _hw.z); } else W.pitcher.position.set(L.island.x + 0.5, L.island.y, L.island.z);
}
function updateDoor(dt) {
  const d = W.door;
  // the door opens for anyone walking through and then stays as it was left
  for (const c of chars) if (c.present && Math.hypot(c.pos.x - L.door.x, c.pos.z - L.door.z) < 0.75 && c.goal && d.target < 0.5) openDoor(true);
  d.open += (d.target - d.open) * Math.min(1, dt * 5);
  d.pivot.rotation.y = -d.open * 1.6;
}
function updateWorld(dt) {
  // evening transition
  S.eveningT += ((S.evening ? 1 : 0) - S.eveningT) * Math.min(1, dt * 0.7);
  applyTime(W, scene, S.eveningT, renderer);
  W.seaMat.normalMap.offset.x += dt * 0.006; W.seaMat.normalMap.offset.y += dt * 0.004;
  W.shallow.material.normalMap.offset.x -= dt * 0.01;
  W.foam.position.z = -2.75 + Math.sin(time * 0.8) * 0.18; W.foam.material.opacity = 0.55 + Math.sin(time * 0.8 + 1) * 0.25;
  W.causT.offset.x = Math.sin(time * 0.3) * 0.05; W.causT.offset.y += dt * 0.01;
  W.boat.position.y = -0.6 + Math.sin(time * 1.1) * 0.03; W.boat.rotation.z = Math.sin(time * 0.9) * 0.04; W.boat.position.x = 14 + Math.sin(time * 0.02) * 6;
  for (const g of W.gulls) { g.a += dt * g.s; g.g.position.set(g.cx + Math.cos(g.a) * g.r, g.h + Math.sin(g.a * 3) * 0.3, g.cz + Math.sin(g.a) * g.r * 0.5); g.g.rotation.y = -g.a; const f = Math.sin(time * 6 + g.a * 5) * 0.5; g.p1.rotation.z = f; g.p2.rotation.z = -f; g.g.visible = S.eveningT < 0.7; }
  for (const sw of W.swings) { if (sw.occupant) { sw.t += dt; sw.pivot.rotation.x = Math.sin(sw.t * 2.2) * 0.45; if (Math.abs(Math.sin(sw.t * 2.2)) > 0.995 && can('swingS' + sw.x, 0.6)) sfxAt('swing', { x: sw.x, z: sw.z }, 0.6); } else sw.pivot.rotation.x *= 0.97; }
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.v.y -= 4 * dt; p.m.position.addScaledVector(p.v, dt); p.m.material.opacity = Math.max(0, p.life / 0.7); if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); parts.splice(i, 1); } }
  ring.material.opacity *= 1 - Math.min(1, dt * 3); ring.scale.multiplyScalar(1 + dt * 0.8);
  // ambient zone mix
  const hz = zoneAt(hero.pos.x, hero.pos.z), w = { house: 0, garden: 0, prom: 0, beach: 0, park: 0 }; w[hz] = 1;
  audio.setZone(w, S.eveningT);
}
const later = (s, f) => timers.push({ t: time + s, f }); const timers = [];

// ---------- game state transitions ----------
let lastHeroReg = 'H';
function updateState() {
  // hero region transitions drive outings and homecomings
  if (hero.reg !== lastHeroReg) {
    const from = lastHeroReg, to = hero.reg; lastHeroReg = to;
    if (from === 'H' && to === 'G') { for (const c of family) if (c.present && c.reg !== 'O' && d2(c.pos, hero.pos) < 4) { c.look = hero; c.lookUntil = time + 1.5; } if (time - S.heroSaidOut > 50 && Math.random() < 0.5) { S.heroSaidOut = time; say(hero, 'hero_ja_03', { pri: 2 }); } }
    if (to === 'O' && from === 'G') { if (!S.prep) startPrep(); startOuting(); }
    if (to === 'G' && from === 'O' && S.outing) endOuting();
    if (to === 'H' && from === 'G') {
      if (S.prep) cancelPrep();
      if (S.homeSince && time - S.homeSince < 40) { S.homeSince = 0; say(hero, 'hero_ja_04', { pri: 3 }); later(1.0, () => say(papa, 'papa_ja_05', { reply: true, pri: 3 })); }
    }
  }
  if (!S.prep && !S.outing && hero.reg === 'G' && ((hero.goal && regionAt(hero.goal.x, hero.goal.z) === 'O') || d2(hero.pos, L.gateIn) < 1.3)) startPrep();
  if (S.prep && !S.outing && hero.reg === 'G' && time - S.prepT > 14 && d2(hero.pos, L.gateIn) > 1.6) { S.prep = false; for (const c of npcs) c.prepping = false; mamaHat.visible = false; if (basketState.where === 'papa') unpackHome(); }
  // initial guest arrival: after the first touch, or a little later anyway
  if (!S.guestIn && !S.guestArriving && (S.firstInput ? time > S.guestGreetT : time > 9)) { if (!S.guestGreetT) { S.guestGreetT = time + 1.2; } else { S.guestArriving = true; setTask(guest, guestArrival(guest, false), PRI.SOCIAL); } }
  // a new friend sometimes visits later (never replaces the first guest)
  if (!S.friendArrived && !S.friendArriving && S.guestIn && hero.reg !== 'O') {
    const busyness = S.stats.feast + S.stats.fetch + S.stats.music + S.stats.evening + S.stats.outing * 2;
    if ((S.friendDue && time > S.friendDue) || busyness >= 6) { S.friendArriving = true; friend.present = true; setTask(friend, guestArrival(friend, true), PRI.SOCIAL); }
  }
  for (let i = timers.length - 1; i >= 0; i--) if (time >= timers[i].t) { const f = timers[i].f; timers.splice(i, 1); f(); }
  scheduleCalls();
}

// ---------- save / restore ----------
function saveGame() {
  try {
    const o = { v: 1, hero: { x: hero.pos.x, z: hero.pos.z, reg: hero.reg, hat: heroHats.worn ? heroHats.worn.id : null, holding: hero.holding ? hero.holding.id : null }, items: {}, chairs: {}, door: W.door.target > 0.5, evening: S.evening, guestIn: S.guestIn, guestInvited: S.guestInvited, friend: S.friendArrived, stats: S.stats, outing: S.outing, castles: sandcastles.map((s) => [s.pos.x, s.pos.z, s.size]), basket: basketState.where === 'ground' ? [basketState.pos.x, basketState.pos.z] : null };
    for (const it of items) {
      let st = it.state, x = it.pos.x, y = it.pos.y, z = it.pos.z;
      if (st === 'held' && it.holder !== hero) { const h = it.holder; st = 'free'; x = h.pos.x; z = h.pos.z; const s = surfaceAt(x, z); y = s ? s.y : groundH(x, z); }
      if (st === 'held') st = 'hero'; if (st === 'drag') st = 'free';
      o.items[it.id] = { st, x, y, z, spread: it.spread, moved: it.moved, rack: !!it.onRack };
    }
    for (const ch of chairs) o.chairs[ch.id] = [ch.pos.x, ch.pos.z, ch.yaw];
    localStorage.setItem(SKEY, JSON.stringify(o));
  } catch (e) {}
}
function placeNpcHome(c, x, z, yaw = 0) { c.pos.set(x, 0, z); c.reg = regionAt(x, z); c.yaw = yaw; }
function restore() {
  // default living tableau (first visit): papa pours juice, mama goes to greet, sibling waves, dog holds the ball, guest at the door
  placeNpcHome(hero, 0.25, -2.15, 0.3);
  placeNpcHome(papa, L.island.x + L.island.w / 2 + 0.3, L.island.z, -Math.PI / 2);
  placeNpcHome(mama, 1.0, -2.25, 2.5);
  placeNpcHome(sib, L.rug.x - 0.1, L.rug.z + 0.15, -0.6);
  placeNpcHome(dog, 0.95, -1.75, -1.5);
  placeNpcHome(guest, L.doorOut.x, L.doorOut.z + 0.2, Math.PI); guest.reg = 'G';
  placeNpcHome(friend, 3.0, 4.2, 0); friend.present = false; friend.reg = 'O';
  wearHat(IT.hatY); IT.hatW.onRack = true; IT.hatW.reg = 'H';
  attach(IT.ball, dog); dog.st.pose = 'sit';
  papa.gen = (function* () { papa.yawTarget = -Math.PI / 2; papa.st.pose = 'pour'; W.pitcherTilt = 1; yield 2.4; W.pitcherTilt = 0; papa.st.pose = 'idle'; face(papa, hero); yield 2; })(); papa.pri = PRI.IDLE;
  sib.gen = (function* () { face(sib, hero); sib.st.pose = 'wave'; yield 2.5; sib.st.pose = 'idle'; yield 1; })(); sib.pri = PRI.IDLE;
  mama.gen = (function* () { yield* go(mama, L.doorIn.x - 0.3, L.doorIn.z - 0.2); face(mama, { x: L.door.x, z: 0 }); yield 3; })(); mama.pri = PRI.IDLE;
  if (!saved) return;
  try {
    const o = saved;
    for (const id in o.items) {
      const it = IT[id], s = o.items[id]; if (!it) continue;
      if (it.holder === dog) release(it);
      if (s.st === 'worn') { wearHat(it); continue; }
      if (s.st === 'basket') { it.state = 'free'; it.pos.set(it.home.x, it.home.y, it.home.z); it.moved = false; continue; }
      if (s.rack) { it.onRack = true; it.state = 'free'; if (heroHats.worn === it) { hero.rig.hatAnchor.remove(it.mesh); scene.add(it.mesh); heroHats.worn = null; } continue; }
      it.onRack = false;
      if (heroHats.worn === it && s.st !== 'worn') { hero.rig.hatAnchor.remove(it.mesh); scene.add(it.mesh); heroHats.worn = null; }
      it.state = 'free'; it.pos.set(s.x, s.y, s.z); it.reg = regionAt(s.x, s.z); it.moved = !!s.moved;
      if (s.spread) spreadBlanket(it);
    }
    for (const id in o.chairs) { const ch = chairs.find((c) => c.id === id); if (ch) { ch.pos.set(o.chairs[id][0], 0, o.chairs[id][1]); ch.yaw = o.chairs[id][2]; ch.reg = regionAt(ch.pos.x, ch.pos.z); } }
    hero.pos.set(o.hero.x, 0, o.hero.z); hero.reg = o.hero.reg || regionAt(o.hero.x, o.hero.z);
    if (o.hero.hat && IT[o.hero.hat] && heroHats.worn !== IT[o.hero.hat]) wearHat(IT[o.hero.hat]);
    if (o.hero.holding && IT[o.hero.holding]) attach(IT[o.hero.holding], hero);
    if (o.door) { W.door.target = 1; W.door.open = 1; }
    S.evening = !!o.evening; S.eveningT = S.evening ? 1 : 0;
    S.guestInvited = !!o.guestInvited; Object.assign(S.stats, o.stats || {});
    (o.castles || []).forEach(([x, z, s]) => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, 10), W.M.sand); const q = new V3(x, groundH(x, z), z); m.position.copy(q); m.scale.setScalar(s); m.castShadow = true; scene.add(m); sandcastles.push({ m, pos: q, size: s }); });
    if (o.basket) { basketState.where = 'ground'; basketState.pos.set(o.basket[0], groundH(o.basket[0], o.basket[1]), o.basket[1]); }
    // NPCs come back to a natural state (temporary positions are not restored)
    for (const c of npcs) { cancelTask(c); c.gen = null; }
    papa.st.pose = 'idle'; W.pitcherTilt = 0;
    if (o.guestIn) { S.guestIn = true; S.guestArriving = true; placeNpcHome(guest, L.dining.x - 0.38, L.dining.z - 1.1); }
    if (o.friend) { S.friendArrived = true; S.friendArriving = true; friend.present = true; placeNpcHome(friend, 1.5, -2.6); }
    if (hero.reg === 'O') {
      S.outing = true; lastHeroReg = 'O';
      const mem = [...family]; if (S.guestIn && S.guestInvited) mem.push(guest);
      mem.forEach((c, i) => { const s = SLOT[c.id] || [0, 0.8]; const p = { x: hero.pos.x + s[0], z: hero.pos.z + s[1] }; clampPoint(p); placeNpcHome(c, p.x, p.z); c.reg = 'O'; c.withHero = true; });
      mamaHat.visible = true; if (basketState.where !== 'ground') { basketState.where = 'papa'; } S.unpacked = basketState.where === 'ground';
    } else lastHeroReg = hero.reg;
  } catch (e) { console.warn('restore', e); }
}
restore();
setInterval(saveGame, 3000);
addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

// ---------- main loop ----------
let last = performance.now();
updateCamera(0, true);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  tick(dt);
  renderer.render(scene, camera);
}
function tick(dt) {
  time += dt;
  updateState();
  if (hero.gen) stepTask(hero, dt);
  if (hero.settlePending && !hero.goal && !hero.dragging && !hero.gen) { hero.settlePending = false; heroSettle(); }
  if (drag && (drag.type === 'hero' || drag.type === 'ground')) { const p = groundPoint(drag.x, drag.y); if (p) setHeroGoal(p); }
  for (const c of npcs) if (c.present) stepTask(c, dt);
  _cols = null;
  for (const c of chars) updateChar(c, dt);
  separate();
  for (const ch of chairs) { ch.mesh.position.set(ch.pos.x, 0, ch.pos.z); ch.mesh.rotation.y = ch.yaw; }
  if (drag && drag.type === 'chair') { const p = groundPoint(drag.x, drag.y); if (p) { const ch = drag.obj; const q = { x: p.x, z: p.z }; const r = regionAt(q.x, q.z); if (r === ch.reg) { clampPoint(q); ch.pos.x += (q.x - ch.pos.x) * Math.min(1, dt * 18); ch.pos.z += (q.z - ch.pos.z) * Math.min(1, dt * 18); } } }
  updateItems(dt);
  updateDoor(dt);
  updateMusic();
  updateWorld(dt);
  updateCamera(dt);
  updateHint();
  audio.update(dt);
}
requestAnimationFrame(frame);
document.getElementById('veil').classList.add('off');
Object.assign(window.__game, { hero, papa, mama, sib, guest, friend, dog, chars, IT, S, chairs, toScreen: (x, y, z) => toScreen(new V3(x, y, z)), now: () => time, findPath: (a, b) => findPath(a, b), navFree: (x, z) => navFree(...navCell(x, z)), advance: (sec) => { for (let k = 0; k < sec * 30; k++) tick(1 / 30); }, render: () => renderer.render(scene, camera), dump: () => chars.map((c) => [c.id, c.present, c.pos.x.toFixed(2), c.pos.z.toFixed(2), c.reg, c.pri, c.st.pose, c.goal ? c.goal.x.toFixed(1) + ',' + c.goal.z.toFixed(1) : '-', c.seat ? c.seat.type : '-', c.withHero ? 'W' : '', c.gen ? (c.wait > 0 ? 'wait' : c.waitFn ? 'fn' : 'run') : 'none'].join(' ')), audioState: () => ({ unlocked: audio.unlocked, ctx: audio.ctx && audio.ctx.state, bufs: Object.keys(audio.buf).length, cur: audio.current && audio.current.id, music: !!audio.music }) });
