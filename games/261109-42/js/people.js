// Doll rigs (shared humanoid rig with per-character clothes/hair/build) and a lop-eared dog.
import * as THREE from 'three';
import { T } from './tex.js';

const M = {};
function mat(key, p) { return M[key] || (M[key] = new THREE.MeshStandardMaterial(p)); }
function phys(key, p) { return M[key] || (M[key] = new THREE.MeshPhysicalMaterial(p)); }
const skinM = () => mat('skin', { color: 0xe6c3a5, roughness: 0.55 });
const eyeM = () => mat('eye', { color: 0x141b2b, roughness: 0.2 });
const whiteM = () => mat('eyeW', { color: 0xffffff, roughness: 0.2 });
const mouthM = () => mat('mouth', { color: 0x6b2a2a, roughness: 0.6 });
const lineM = () => mat('lineDark', { color: 0x3b2a22, roughness: 0.8 });

function mesh(geo, m, cast = true) { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = true; return o; }

export function makeHuman(o) {
  const kid = o.kid; const s = o.scale || 1;
  const P = kid ? { leg: 0.34, legR: 0.045, hip: 0.06, torso: 0.3, tr: 0.115, arm: 0.29, armR: 0.035, head: 0.155, neck: 0.025 }
    : { leg: 0.56, legR: 0.055, hip: 0.08, torso: 0.43, tr: 0.15, arm: 0.45, armR: 0.045, head: 0.15, neck: 0.05 };
  for (const k in P) P[k] *= s;
  const root = new THREE.Group(); root.name = o.name;
  const body = new THREE.Group(); root.add(body);
  const shirt = o.shirtMap ? new THREE.MeshStandardMaterial({ map: o.shirtMap, roughness: 0.8 }) : mat('c' + o.shirt, { color: o.shirt, roughness: 0.75 });
  const pants = o.pantsMap ? new THREE.MeshStandardMaterial({ map: o.pantsMap, roughness: 0.85 }) : mat('c' + o.pants, { color: o.pants, roughness: 0.8 });
  const shoeM = mat('c' + (o.shoes || 0x1d2740), { color: o.shoes || 0x1d2740, roughness: 0.45 });
  const hairM = mat('h' + o.hair, { color: o.hair, roughness: 0.6 });

  // legs
  const legs = [];
  for (const side of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(side * P.hip, P.leg, 0);
    const lm = mesh(new THREE.CapsuleGeometry(P.legR, P.leg - P.legR * 2.4, 4, 10), o.bareLegs ? skinM() : pants);
    lm.position.y = -P.leg / 2 + P.legR * 0.3; g.add(lm);
    const shoe = mesh(new THREE.SphereGeometry(P.legR * 1.25, 12, 8), shoeM); shoe.scale.set(1, 0.7, 1.6); shoe.position.set(0, -P.leg + P.legR * 0.8, P.legR * 0.6); g.add(shoe);
    body.add(g); legs.push(g);
  }
  if (o.shorts) { const sh = mesh(new THREE.CylinderGeometry(P.tr * 0.95, P.tr * 1.1, P.leg * 0.32, 14), pants); sh.position.y = P.leg - P.leg * 0.08; body.add(sh); }
  // torso
  const torso = new THREE.Group(); torso.position.y = P.leg; body.add(torso);
  const tm = mesh(new THREE.CapsuleGeometry(P.tr, P.torso - P.tr * 1.6, 6, 14), shirt); tm.scale.z = 0.78; tm.position.y = P.torso / 2; torso.add(tm);
  if (o.dress) { const dm = o.dressMap ? new THREE.MeshStandardMaterial({ map: o.dressMap, roughness: 0.85 }) : mat('c' + o.dress, { color: o.dress, roughness: 0.8 }); const d = mesh(new THREE.CylinderGeometry(P.tr * 0.92, P.tr * 1.75, P.torso * 0.85, 18, 1, true), dm); d.material.side = THREE.DoubleSide; d.position.y = P.torso * 0.12; torso.add(d); }
  if (o.apron) { const a = mesh(new THREE.BoxGeometry(P.tr * 1.5, P.torso * 1.15, 0.012), mat('apron', { color: o.apron, roughness: 0.8 })); a.position.set(0, P.torso * 0.3, P.tr * 0.8); torso.add(a); }
  if (o.stripes) { for (let k = 0; k < 3; k++) { const r = mesh(new THREE.TorusGeometry(P.tr * 0.99, 0.008, 4, 20), mat('stripe' + o.stripes, { color: o.stripes, roughness: 0.8 }), false); r.rotation.x = Math.PI / 2; r.scale.y = 0.78; r.position.y = P.torso * (0.25 + k * 0.18); torso.add(r); } }
  // arms
  const arms = [], hands = [];
  const shoulderY = P.torso - P.tr * 0.55;
  for (const side of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(side * (P.tr + P.armR * 0.7), shoulderY, 0);
    const am = mesh(new THREE.CapsuleGeometry(P.armR, P.arm - P.armR * 2.2, 4, 10), o.shortSleeve ? skinM() : shirt); am.position.y = -P.arm / 2; g.add(am);
    if (o.shortSleeve) { const sl = mesh(new THREE.CapsuleGeometry(P.armR * 1.25, P.arm * 0.2, 4, 10), shirt); sl.position.y = -P.arm * 0.15; g.add(sl); }
    const h = mesh(new THREE.SphereGeometry(P.armR * 1.25, 10, 8), skinM()); h.position.y = -P.arm; g.add(h);
    const anchor = new THREE.Object3D(); anchor.position.set(0, -P.arm - P.armR, P.armR * 0.6); g.add(anchor);
    torso.add(g); arms.push(g); hands.push(anchor);
  }
  // head
  const head = new THREE.Group(); head.position.y = P.torso + P.neck + P.head * 0.92; torso.add(head);
  const neck = mesh(new THREE.CylinderGeometry(P.head * 0.28, P.head * 0.3, P.neck + P.head * 0.3, 8), skinM()); neck.position.y = -P.head * 0.9; head.add(neck);
  const hm = mesh(new THREE.SphereGeometry(P.head, 24, 18), skinM()); hm.scale.set(1, 1.04, 0.98); head.add(hm);
  const R = P.head;
  // hair
  const hairTop = mesh(new THREE.SphereGeometry(R * 1.07, 24, 14, 0, Math.PI * 2, 0, Math.PI * (o.hairStyle === 'short' ? 0.42 : 0.47)), hairM); hairTop.position.set(0, R * 0.04, -R * 0.03); hairTop.rotation.x = -0.25; head.add(hairTop);
  const backLen = o.hairStyle === 'short' ? 0.32 : o.hairStyle === 'bob' ? 0.55 : 0.5;
  const hairBack = mesh(new THREE.SphereGeometry(R * 1.08, 20, 12, Math.PI, Math.PI, Math.PI * 0.2, Math.PI * backLen), hairM); hairBack.position.z = -R * 0.02; head.add(hairBack);
  if (o.hairStyle === 'bob') { for (const sd of [-1, 1]) { const b = mesh(new THREE.SphereGeometry(R * 0.5, 12, 10), hairM); b.scale.set(0.55, 1.15, 0.9); b.position.set(sd * R * 0.88, -R * 0.2, -R * 0.08); head.add(b); } }
  if (o.hairStyle === 'bun') { const b = mesh(new THREE.SphereGeometry(R * 0.42, 14, 10), hairM); b.position.set(0, R * 0.75, -R * 0.62); head.add(b); }
  if (o.hairStyle === 'tails') { for (const sd of [-1, 1]) { const b = mesh(new THREE.CapsuleGeometry(R * 0.2, R * 0.55, 4, 8), hairM); b.position.set(sd * R * 1.02, -R * 0.15, -R * 0.35); b.rotation.z = sd * 0.35; head.add(b); const tie = mesh(new THREE.SphereGeometry(R * 0.13, 8, 6), mat('tie', { color: 0xf2d20c, roughness: 0.4 })); tie.position.set(sd * R * 0.95, R * 0.25, -R * 0.35); head.add(tie); } }
  // face
  const eyes = [];
  for (const sd of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(R * 0.115, 10, 8), eyeM(), false); e.scale.set(0.85, 1.1, 0.6); e.position.set(sd * R * 0.36, R * 0.05, R * 0.92); head.add(e); eyes.push(e);
    const hl = mesh(new THREE.SphereGeometry(R * 0.035, 6, 4), whiteM(), false); hl.position.set(R * 0.03, R * 0.04, R * 0.08); e.add(hl);
    const br = mesh(new THREE.BoxGeometry(R * 0.26, R * 0.04, R * 0.04), lineM(), false); br.position.set(sd * R * 0.36, R * 0.3, R * 0.92); br.rotation.z = -sd * 0.12; head.add(br);
  }
  const nose = mesh(new THREE.SphereGeometry(R * 0.07, 8, 6), skinM(), false); nose.position.set(0, -R * 0.12, R * 0.99); head.add(nose);
  const smile = mesh(new THREE.TorusGeometry(R * 0.2, R * 0.03, 5, 12, Math.PI), mouthM(), false); smile.rotation.z = Math.PI; smile.position.set(0, -R * 0.3, R * 0.94); smile.scale.set(1, 0.8, 1); head.add(smile);
  const mouth = mesh(new THREE.SphereGeometry(R * 0.16, 12, 8), mouthM(), false); mouth.scale.set(1, 0.2, 0.4); mouth.position.set(0, -R * 0.38, R * 0.9); mouth.visible = false; head.add(mouth);
  const hatAnchor = new THREE.Object3D(); hatAnchor.position.set(0, R * 0.72, -R * 0.04); head.add(hatAnchor);
  if (o.glasses) {
    const gm = mat('chrome', { color: 0xd8dde3, metalness: 1, roughness: 0.15 });
    for (const sd of [-1, 1]) { const r = mesh(new THREE.TorusGeometry(R * 0.2, R * 0.025, 5, 14), gm, false); r.position.set(sd * R * 0.36, R * 0.05, R * 1.0); head.add(r); }
  }
  const height = P.leg + P.torso + P.neck + P.head * 2;
  return { kind: 'human', root, body, legs, arms, hands, torso, head, eyes, smile, mouth, hatAnchor, P, height, phase: Math.random() * 6, blinkT: 2 + Math.random() * 3 };
}

// pose blending helper
const lerp = (a, b, t) => a + (b - a) * t;
export function animHuman(r, st, dt, time) {
  // st: {speed, pose, poseT, talk, lookYaw, lookPitch, wave, hold, sitY, smile}
  const P = r.P, k = Math.min(1, dt * 10);
  const walk = Math.min(1, st.speed / 1.4);
  r.phase += dt * (4 + st.speed * 5.5);
  const sw = Math.sin(r.phase);
  let lL = sw * 0.7 * walk, lR = -sw * 0.7 * walk;
  let aLx = -sw * 0.5 * walk, aRx = sw * 0.5 * walk, aLz = 0.06, aRz = -0.06;
  let bodyY = Math.abs(Math.cos(r.phase)) * 0.025 * walk, lean = st.speed * 0.04, rootDrop = 0;
  const pose = st.pose, pt = st.poseT;
  if (pose === 'sit' || pose === 'sitGround' || pose === 'sitClap' || pose === 'sitEat') {
    lL = lR = -1.45; rootDrop = st.sitDrop || 0; bodyY = 0; lean = -0.05;
    aLx = aRx = -0.25;
  }
  if (pose === 'wave') { aLz = 2.6 + Math.sin(time * 9) * 0.35; aLx = -0.2; }
  if (pose === 'reach') { aRx = -1.2; aLx = -0.3; lean = 0.18; }
  if (pose === 'give') { aRx = aLx = -1.25; lean = 0.12; }
  if (pose === 'hold' || st.hold) { aRx = Math.min(aRx, -0.9); aLx = Math.min(aLx, -0.75); aLz = -0.25; aRz = 0.25; }
  if (pose === 'clap' || pose === 'sitClap') { const c = st.clapT > 0 ? 1 : 0.5; aLx = aRx = -1.15; aLz = -(0.22 + 0.22 * c); aRz = -aLz; }
  if (pose === 'eat' || pose === 'sitEat') { const b = (Math.sin(pt * 5) * 0.5 + 0.5); aRx = -1.7 - b * 0.6; aRz = 0.35; }
  if (pose === 'drink') { aRx = -2.1; aRz = 0.35; }
  if (pose === 'pour') { aRx = -1.25; aRz = -0.1 + Math.sin(pt * 2) * 0.05; aLx = -0.9; }
  if (pose === 'drum') { const hitL = Math.max(0, st.hitL || 0), hitR = Math.max(0, st.hitR || 0); aLx = -0.9 + hitL * 0.6; aRx = -0.9 + hitR * 0.6; aLz = -0.2; aRz = 0.2; lean = 0.2; }
  if (pose === 'pet') { aRx = -0.9; lean = 0.55; rootDrop = -0.04; }
  if (pose === 'dig') { const b = Math.sin(pt * 8); lL = lR = -1.45; rootDrop = st.sitDrop || 0; aRx = -1.0 + b * 0.4; aLx = -1.0 - b * 0.4; lean = 0.45; }
  if (pose === 'cheer') { aLz = 2.6; aRz = -2.6; bodyY += Math.abs(Math.sin(pt * 8)) * 0.08; }
  if (pose === 'hum') { aLx = aRx = -0.2; }
  if (pose === 'carry') { aRx = aLx = -1.0; aLz = -0.35; aRz = 0.35; }
  if (pose === 'beckon') { aRx = -1.4 + Math.sin(time * 8) * 0.35; aRz = -0.2; }
  if (pose === 'throw') { aRx = pt < 0.25 ? -2.8 : -1.0; }
  if (pose === 'lie') { lL = lR = 0; }
  if (pose === 'swing') { lL = lR = -1.3 + Math.sin(time * 2.2) * 0.3; rootDrop = st.sitDrop || 0; aLz = 0.1; aRz = -0.1; aLx = aRx = -2.8; }
  if (pose === 'slide') { lL = lR = -1.45; rootDrop = st.sitDrop || 0; aLz = 1.3; aRz = -1.3; }
  if (st.seated && pose !== 'swing' && pose !== 'slide') { lL = lR = -1.45; bodyY = 0; rootDrop = 0; if (lean > 0.3) lean = 0.3; }
  if (st.reach > 0 && pose === 'idle') { aRx = lerp(aRx, -1.0, st.reach); }
  r.legs[0].rotation.x = lerp(r.legs[0].rotation.x, lL, k); r.legs[1].rotation.x = lerp(r.legs[1].rotation.x, lR, k);
  r.arms[0].rotation.x = lerp(r.arms[0].rotation.x, aRx, k); r.arms[1].rotation.x = lerp(r.arms[1].rotation.x, aLx, k);
  r.arms[0].rotation.z = lerp(r.arms[0].rotation.z, aRz, k); r.arms[1].rotation.z = lerp(r.arms[1].rotation.z, aLz, k);
  r.body.position.y = lerp(r.body.position.y, bodyY + rootDrop, k);
  r.torso.rotation.x = lerp(r.torso.rotation.x, lean, k);
  // head look
  r.head.rotation.y = lerp(r.head.rotation.y, st.lookYaw || 0, Math.min(1, dt * 6));
  r.head.rotation.x = lerp(r.head.rotation.x, (st.lookPitch || 0) - (pose === 'hum' ? 0 : 0), Math.min(1, dt * 6));
  if (pose === 'hum') r.head.rotation.z = Math.sin(time * 3) * 0.12; else r.head.rotation.z *= 0.9;
  // blink
  r.blinkT -= dt; let eyeS = 1;
  if (r.blinkT < 0) { eyeS = 0.1; if (r.blinkT < -0.12) r.blinkT = 2 + Math.random() * 4; }
  if (st.closed) eyeS = 0.1;
  for (const e of r.eyes) e.scale.y = 1.1 * eyeS;
  // mouth: talk level 0..1
  const tl = st.talk || 0;
  r.mouth.visible = tl > 0.05; r.mouth.scale.y = 0.2 + tl * 0.9;
  r.smile.visible = tl <= 0.05; r.smile.scale.y = 0.8 + (st.smile || 0) * 0.6;
}

// ---------- dog ----------
export function makeDog() {
  const root = new THREE.Group(); root.name = 'dog';
  const body = new THREE.Group(); root.add(body);
  const fur = mat('fur', { color: 0xf3f1ec, roughness: 0.9 });
  const ear = mat('ear', { color: 0x4a3a32, roughness: 0.9 });
  const nose = mat('nose', { color: 0x111318, roughness: 0.3 });
  const torso = mesh(new THREE.CapsuleGeometry(0.12, 0.22, 6, 12), fur); torso.rotation.x = Math.PI / 2; torso.position.y = 0.24; body.add(torso);
  const patch = mesh(new THREE.SphereGeometry(0.1, 10, 8), ear); patch.scale.set(1, 0.6, 1.2); patch.position.set(0.04, 0.33, -0.05); body.add(patch);
  const collar = mesh(new THREE.TorusGeometry(0.075, 0.016, 6, 16), mat('collar', { color: 0x1f4fae, roughness: 0.4 })); collar.position.set(0, 0.34, 0.15); collar.rotation.x = 0.4; body.add(collar);
  const tag = mesh(new THREE.SphereGeometry(0.018, 8, 6), mat('tag', { color: 0xf2d20c, metalness: 0.6, roughness: 0.3 })); tag.position.set(0, 0.28, 0.2); body.add(tag);
  const headG = new THREE.Group(); headG.position.set(0, 0.38, 0.2); body.add(headG);
  const head = mesh(new THREE.SphereGeometry(0.1, 16, 12), fur); head.scale.set(1, 0.95, 1); headG.add(head);
  const snout = mesh(new THREE.SphereGeometry(0.06, 12, 8), fur); snout.scale.set(0.9, 0.75, 1.1); snout.position.set(0, -0.03, 0.085); headG.add(snout);
  const n = mesh(new THREE.SphereGeometry(0.02, 8, 6), nose, false); n.position.set(0, -0.01, 0.15); headG.add(n);
  const eyes = [];
  for (const sd of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.016, 8, 6), eyeM(), false); e.position.set(sd * 0.045, 0.025, 0.085); headG.add(e); eyes.push(e);
  }
  const ears = [];
  for (const sd of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(sd * 0.075, 0.05, 0); headG.add(pv);
    const em = mesh(new THREE.SphereGeometry(0.055, 10, 8), ear); em.scale.set(0.45, 1.25, 0.8); em.position.set(sd * 0.012, -0.065, 0); pv.add(em);
    ears.push(pv);
  }
  const mouthA = new THREE.Object3D(); mouthA.position.set(0, -0.07, 0.13); headG.add(mouthA);
  const tail = new THREE.Group(); tail.position.set(0, 0.3, -0.2); body.add(tail);
  const tm = mesh(new THREE.CapsuleGeometry(0.02, 0.12, 4, 6), fur); tm.position.y = 0.07; tail.add(tm); tail.rotation.x = -0.6;
  const legs = [];
  for (const [x, z] of [[-0.07, 0.13], [0.07, 0.13], [-0.07, -0.13], [0.07, -0.13]]) {
    const g = new THREE.Group(); g.position.set(x, 0.18, z); body.add(g);
    const l = mesh(new THREE.CapsuleGeometry(0.03, 0.12, 4, 6), fur); l.position.y = -0.09; g.add(l);
    legs.push(g);
  }
  return { kind: 'dog', root, body, headG, ears, tail, legs, eyes, mouthA, phase: 0, blinkT: 3, height: 0.48 };
}
export function animDog(r, st, dt, time) {
  const k = Math.min(1, dt * 10), run = Math.min(1, st.speed / 2.2);
  r.phase += dt * (5 + st.speed * 7);
  const s = Math.sin(r.phase);
  let lf = s * 0.8 * run, lb = -s * 0.8 * run, bodyY = Math.abs(Math.cos(r.phase)) * 0.03 * run, pitch = 0, headX = 0, headY = st.lookYaw || 0, drop = 0;
  let wag = st.wag || 0.3;
  const pose = st.pose;
  if (pose === 'sit') { pitch = -0.45; drop = -0.04; lb = 0; }
  if (pose === 'lie' || pose === 'sleep') { drop = -0.13; lf = -1.2; lb = 1.2; headX = pose === 'sleep' ? 0.35 : 0.1; wag *= pose === 'sleep' ? 0 : 0.5; }
  if (pose === 'stretch') { pitch = 0.35; drop = -0.03; lf = -0.9; }
  if (pose === 'dig') { pitch = 0.3; headX = 0.4; lf = Math.sin(time * 18) * 0.9; lb = 0; }
  if (pose === 'drink' || pose === 'sniff') { pitch = 0.2; headX = 0.7 + (pose === 'sniff' ? Math.sin(time * 14) * 0.08 : Math.sin(time * 10) * 0.04); }
  if (pose === 'beg') { pitch = -0.8; drop = 0.0; lf = -1.0; }
  if (pose === 'hop') { bodyY += Math.abs(Math.sin(time * 9)) * 0.08; }
  r.legs[0].rotation.x = lerp(r.legs[0].rotation.x, lf, k); r.legs[1].rotation.x = lerp(r.legs[1].rotation.x, -lf * (pose === 'dig' ? -1 : 1), k);
  r.legs[2].rotation.x = lerp(r.legs[2].rotation.x, lb, k); r.legs[3].rotation.x = lerp(r.legs[3].rotation.x, -lb, k);
  r.body.position.y = lerp(r.body.position.y, bodyY + drop, k);
  r.body.rotation.x = lerp(r.body.rotation.x, pitch, k);
  r.headG.rotation.x = lerp(r.headG.rotation.x, headX - pitch, k);
  r.headG.rotation.y = lerp(r.headG.rotation.y, headY, Math.min(1, dt * 5));
  r.tail.rotation.z = Math.sin(time * (8 + wag * 14)) * (0.15 + wag * 0.7);
  for (let i = 0; i < 2; i++) r.ears[i].rotation.z = (i ? -1 : 1) * (0.08 + Math.sin(r.phase * 2) * 0.12 * run) ;
  r.blinkT -= dt; let es = 1; if (r.blinkT < 0) { es = 0.1; if (r.blinkT < -0.12) r.blinkT = 2 + Math.random() * 4; }
  if (pose === 'sleep') es = 0.1;
  for (const e of r.eyes) e.scale.y = es;
}

// hats & props
export function makeHat(kind) {
  const g = new THREE.Group();
  if (kind === 'yellow') {
    const m = phys('rainhat', { color: 0xf6d10a, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 });
    const dome = mesh(new THREE.SphereGeometry(0.13, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), m); dome.scale.set(1, 0.85, 1.05); g.add(dome);
    const brim = mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.05, 24, 1, true), m); brim.material.side = THREE.DoubleSide; brim.position.y = -0.01; g.add(brim);
  } else {
    const m = mat('strawhat', { color: 0xf3f2ea, roughness: 0.8 });
    const dome = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.09, 20), m); dome.position.y = 0.035; g.add(dome);
    const brim = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.012, 28), m); brim.position.y = -0.005; g.add(brim);
    const band = mesh(new THREE.CylinderGeometry(0.121, 0.121, 0.025, 20, 1, true), mat('band', { color: 0x1f4fae, roughness: 0.6 })); band.position.y = 0.0; g.add(band);
  }
  return g;
}
