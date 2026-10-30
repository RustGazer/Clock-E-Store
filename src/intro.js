/* Pocket-watch intro: the watch starts dismantled, every part flies back in one by one,
   the finished watch comes close to the screen and its hands tick - slow at first, then faster and faster.

   Mechanical-motion rules applied here (they are the runtime equivalent of the rigging rules):
   - every part is a RIGID piece: only position / rotation are animated, scale never changes (no squash & stretch)
   - each part moves along a straight vector with a hard acceleration into the snap (power3.in), spins are linear
   - hands rotate exactly about the dial axis (the hub is the pivot) and are limited to that single axis
   - secondary action: every snap and every tick kicks a short decaying vibration (recoil / structural latency)
   - hand ticks are discrete steps with a tiny overshoot, never a smooth organic sweep
   Part names come from the GLB: case, neck, crown, bow, glass, dial, hand_hour, hand_minute, hub.        */
import * as THREE from 'three';
import { styleModel, makeOutlineMaterial } from './toon.js';

// assembly order = physical build order. off = where the part floats while dismantled (local units, face radius = 1),
// rot = its tumbling orientation. +Y is the dial normal (toward the viewer once the watch comes close).
const SEQ = [
  { n: 'case',        off: [-1.7, -.5, 1.15],  rot: [.5, 1.1, .35] },
  { n: 'dial',        off: [1.5, 1.7, 1.0],    rot: [-.9, -1.4, .6] },
  { n: 'hand_hour',   off: [2.0, 1.1, -1.5],   rot: [.4, 2.6, -.5] },
  { n: 'hand_minute', off: [-2.1, 1.3, -1.2],  rot: [-.3, -2.2, .4] },
  { n: 'hub',         off: [.3, 2.1, 1.7],     rot: [1.3, .7, -.4] },
  { n: 'glass',       off: [-.2, 2.6, -.4],    rot: [.7, -.4, .9] },
  { n: 'neck',        off: [2.7, -.4, 1.5],    rot: [-.8, 1.9, .5] },
  { n: 'crown',       off: [3.0, .9, .3],      rot: [.9, -1.7, -.6] },
  { n: 'bow',         off: [2.5, 1.7, -1.7],   rot: [-1.1, 1.2, 1.4] }
];
export const PART_STAGGER = .3, PART_DUR = .52;

export function loadPocket({ loader, scene, env, url, onProgress }) {
  return new Promise((res, rej) => loader.load(url, g => { try { res(build(g, scene, env)); } catch (e) { rej(e); } }, onProgress, rej));
}

function build(g, scene, env) {
  const glint = { uGC: { value: new THREE.Vector2() }, uGR: { value: 1 }, uGP: { value: -2 } };
  const outlineMat = makeOutlineMaterial(2.2);
  const root = g.scene;
  const { hulls } = styleModel(root, { env, outlineMat, glint });
  const mesh = {};                                         // gltfpack keeps the part names on the parent node of each mesh
  root.traverse(o => { if (SEQ.some(s => s.n === o.name)) { const m = o.isMesh ? o : o.children.find(c => c.isMesh && !hulls.includes(c)); if (m) mesh[o.name] = m; } });
  for (const s of SEQ) if (!mesh[s.n]) throw new Error('pocket part missing: ' + s.n);

  const top = new THREE.Group(), spin = new THREE.Group(), rig = new THREE.Group();   // top: placement/tilt, spin: crown-up turn, rig: shake
  top.add(spin); spin.add(rig); scene.add(top); top.visible = false;
  const parts = SEQ.map((s, i) => {
    const holder = new THREE.Group(); holder.name = 'holder_' + s.n; rig.add(holder);
    const m = mesh[s.n]; m.parent && m.parent.remove(m);
    const piv = new THREE.Group(); piv.add(m); holder.add(piv);               // gltfpack quantises positions into the mesh node, so rotate a clean pivot at the dial axis, not the mesh
    const p = { ...s, i, holder, m, piv, float: 1, seed: i * 1.7 + .3, off: new THREE.Vector3(...s.off), rot: new THREE.Euler(...s.rot) };
    holder.position.copy(p.off); holder.rotation.copy(p.rot);
    return p;
  });
  const by = Object.fromEntries(parts.map(p => [p.n, p]));
  const P = {
    top, spin, rig, parts, by, glint, outlineMat, hulls,
    T: 0, rate: 0, kick: 0, shakeV: 0, shakeS: 1, lastTick: 0, fast: 0,
    // Called every frame (also while the GSAP timeline is paused, so a slow hero download never freezes the whirl)
    update(dt, time) {
      for (const p of parts) if (p.float > 0) p.holder.position.y = p.off.y + Math.sin(time * 1.1 + p.seed) * .07;   // dismantled parts hang in the air
      // hands: discrete ticks. 1 tick = 6 degrees of minute hand; hour hand moves 1/12 of that
      this.T += this.rate * dt;
      const n = Math.floor(this.T), f = this.T - n;
      if (n !== this.lastTick) { this.lastTick = n; this.shakeV = this.shakeS * (this.rate < 14 ? .014 : .005); this.shakeS = -this.shakeS; }
      const step = (n + stepCurve(f)) * (Math.PI / 30);
      by.hand_minute.piv.rotation.y = -step;
      by.hand_hour.piv.rotation.y = -step / 12;
      this.shakeV *= Math.exp(-dt * 38);                                 // recoil: fast decay
      const fastJit = this.rate > 14 ? Math.sin(time * 95) * .0035 * Math.min(1, (this.rate - 14) / 30) : 0;
      rig.position.x += ((this.shakeV + fastJit + this.snapX) - rig.position.x) * Math.min(1, dt * 60);
      rig.position.z += ((this.snapZ) - rig.position.z) * Math.min(1, dt * 60);
      this.snapX *= Math.exp(-dt * 22); this.snapZ *= Math.exp(-dt * 22);
    },
    snapX: 0, snapZ: 0,
    // a part just locked into place: kick the whole body along the part's travel direction, then let it settle
    snap(p) { const d = p.off.clone().normalize(); this.snapX = -d.x * .035; this.snapZ = -d.z * .035; },
    // adds the tweens that rebuild the watch into a gsap timeline `tl` starting at time `at`
    assemble(gsap, tl, at, { onSnap } = {}) {
      parts.forEach((p, i) => {
        const t0 = at + i * PART_STAGGER;
        tl.set(p, { float: 0 }, t0);
        tl.to(p.holder.position, { x: 0, y: 0, z: 0, duration: PART_DUR, ease: 'power3.in' }, t0);        // straight vector, hard acceleration into the snap
        tl.to(p.holder.rotation, { x: 0, y: 0, z: 0, duration: PART_DUR, ease: 'none' }, t0);             // perfectly linear axial spin
        tl.call(() => { this.snap(p); onSnap && onSnap(p); }, null, t0 + PART_DUR);
      });
      return at + (parts.length - 1) * PART_STAGGER + PART_DUR;
    },
    setHull(vis) { hulls.forEach(h => { h.visible = vis || h.userData.primary; }); },
    assembled() { parts.forEach(p => { p.float = 0; p.holder.position.set(0, 0, 0); p.holder.rotation.set(0, 0, 0); }); }
  };
  P.snapX = 0; P.snapZ = 0;
  return P;
}
// one tick: snaps to the next step with a small overshoot that settles (mechanical latency, never a smooth glide)
function stepCurve(f) {
  const w = .22;
  if (f >= w) return 1;
  const x = f / w, c = 2.2;                                // easeOutBack
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}
