import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm';
import { ScrollTrigger } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/ScrollTrigger/+esm';
import { CATALOG, ORDER_EMAIL, INTRO_MODEL } from './catalog.js';
import { loadPocket } from './intro.js';
import { U, styleModel, makeOutlineMaterial } from './toon.js';
import { makeStudioEnv, addLights, makeShadowTexture } from './studio.js';
import { createQuality } from './quality.js';
import { createCart } from './cart.js';
gsap.registerPlugin(ScrollTrigger);

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const money = n => '$' + n.toLocaleString('en-US');
const sm = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const store = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };
const SHOT = params.has('shot') ? +params.get('shot') : null;           // poster-capture mode (dev only)
if (SHOT !== null) document.body.classList.add('shot');

/* ================= DOM: chapters, pager, lineup links (all generated from CATALOG) ================= */
CATALOG.forEach((c, i) => {
  const s = document.createElement('section');
  s.id = 'c' + i; s.className = 'panelSec chap' + (i % 2 === 0 ? '' : ' right'); s.style.setProperty('--accent', c.accent);
  s.setAttribute('aria-labelledby', 'h-' + c.id);
  s.innerHTML = `<div class="copy panel"><p class="issue">No. ${String(i + 1).padStart(2, '0')} <span>/ ${String(CATALOG.length).padStart(2, '0')}</span></p>
    <h2 id="h-${c.id}">${c.name}</h2><p class="lead">${c.tag}</p>
    <div class="buy"><span class="price-wrap"><span class="price"><span class="sr">Price </span>${money(c.price)}</span></span>
    <button class="btn add" type="button" data-i="${i}" aria-label="Add ${c.name} to cart">Add to cart</button></div>
    <p class="note" hidden>3D preview unavailable for this watch.</p></div>
    <img class="poster" src="assets/posters/${c.id}.webp" alt="${c.alt}" width="800" height="1000" loading="lazy" decoding="async">`;
  $('#chapters').append(s);
});
$('#pager').innerHTML = CATALOG.map((c, i) => `<a href="#c${i}" aria-label="${c.name}" data-i="${i}"><i></i></a>`).join('');
$('#lineupLinks').innerHTML = CATALOG.map((c, i) => `<li><a href="#c${i}">${c.name} · ${money(c.price)}</a></li>`).join('');
{ const W = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'], w = W[CATALOG.length] || CATALOG.length;
  $('.hero .kicker').textContent = 'Issue No. 01 · The ' + w; $('.hero .lead').textContent = w + ' hand-picked watches. Spin them, pick one, and send us your order request.'; }
const live = Object.assign(document.createElement('p'), { className: 'sr' }); live.setAttribute('role', 'status'); document.body.append(live);

createCart({
  catalog: CATALOG, orderEmail: ORDER_EMAIL, $, money, reduce,
  onAdd(i, b) {
    live.textContent = CATALOG[i].name + ' added to cart';
    gsap.fromTo('#cartCount', { scale: 1.8 }, { scale: 1, duration: .4, ease: 'back.out(3)' });
    const t = b.textContent; b.textContent = 'Added!'; b.classList.add('pressed'); clearTimeout(b._t);
    b._t = setTimeout(() => { b.textContent = t; b.classList.remove('pressed'); }, 1100);
    pulseRays();
  }
});

/* ================= Renderer (graceful failure → static posters, the shop still works) ================= */
function fallback(note) {
  document.body.classList.remove('intro'); $('#load')?.remove(); $('#skip')?.remove();
  gsap.set(['.nav', '.hero .copy > *', '.pager'], { opacity: 1 });
  if (note) console.warn(note);
}
let renderer;
// MSAA is a real fill-rate cost on integrated GPUs, so it is only requested on capable devices (override: ?aa=1 / ?aa=0)
const wantAA = params.has('aa') ? params.get('aa') === '1' : ((navigator.hardwareConcurrency || 4) >= 8 && !matchMedia('(pointer:coarse)').matches);
try { renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: wantAA, alpha: true, powerPreference: 'high-performance' }); } catch (e) { }
if (!renderer || !renderer.getContext()) {
  document.body.classList.add('nogl'); fallback('WebGL unavailable'); throw new Error('WebGL unavailable');
}
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 0);

const FOV = 32, CAM_Z = 7;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 1, .1, 60);
camera.position.set(0, .25, CAM_Z);
const env = makeStudioEnv(renderer);
const lights = addLights(scene), LBASE = { key: lights.key.intensity, hemi: lights.hemi.intensity, fill: lights.fill.intensity, rim: lights.rim.intensity };
const shadowTex = makeShadowTexture();
const bufSize = new THREE.Vector2();

/* ================= Quality ================= */
let dpr = 1, dirty = true;
const quality = createQuality(applyQuality);
const models = CATALOG.map(() => null); let PK = null, heroOn = true;
function syncRes() {
  renderer.getDrawingBufferSize(bufSize);
  models.forEach(M => M && M.outlineMat.uniforms.uRes.value.copy(bufSize)); PK && PK.outlineMat.uniforms.uRes.value.copy(bufSize);
}
// ink outlines: all on high/balanced; primary only on low; in the small line-up, primary only (none on the lowest tiers)
function hullVis(M, q = quality.current()) {
  M.hulls.forEach(h => { h.visible = M.lodOn ? (h.userData.primary && !M.lod.includes(h.parent) && q.index < 3) : (q.secondary || h.userData.primary); });
}
function applyQuality(q) {
  dpr = q.dpr; renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
  U.uHalf.value = q.halftone; U.uCell.value = 6 * dpr;
  models.forEach(M => M && hullVis(M, q)); PK && PK.setHull(q.secondary);
  document.body.classList.toggle('fx-low', q.index >= 3);
  $('#fxBtn').setAttribute('aria-pressed', q.lowPower ? 'true' : 'false');
  syncRes(); dirty = true;
}
$('#fxBtn').onclick = () => quality.setLowPower(!quality.lowPower);
applyQuality(quality.current());

/* ================= Models ================= */
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const mixers = [];
function prepare(g, cfg, i) {
  const root = g.scene; root.updateMatrixWorld(true);
  if (cfg.hideBelowY !== undefined) {                  // e.g. the Huracán file ships with a display platter
    const b = new THREE.Box3(), c = new THREE.Vector3();
    root.traverse(o => { if (o.isMesh) { b.setFromObject(o); b.getCenter(c); if (c.y < cfg.hideBelowY) o.visible = false; } });
  }
  const glint = { uGC: { value: new THREE.Vector2() }, uGR: { value: 1 }, uGP: { value: -2 } };
  const outlineMat = makeOutlineMaterial(2.2);
  const { hulls, report } = styleModel(root, { env, outlineMat, glint });
  // normalise: largest visible dimension = 1, centred on the origin
  const box = new THREE.Box3(); root.traverse(o => { if (o.isMesh && o.visible && !hulls.includes(o)) box.expandByObject(o); });
  const size = box.getSize(new THREE.Vector3()), k = 1 / (Math.max(size.x, size.y, size.z) * (cfg.span || 1));
  root.scale.setScalar(k); root.updateMatrixWorld(true);
  const c2 = new THREE.Box3(); root.traverse(o => { if (o.isMesh && o.visible) c2.expandByObject(o); }); root.position.sub(c2.getCenter(new THREE.Vector3()));
  const inner = new THREE.Group(); inner.add(root); inner.rotation.order = 'ZYX'; inner.rotation.set(...cfg.rot);   // ZYX: tilt in the screen plane after the model is turned face-on
  const pivot = new THREE.Group(); pivot.add(inner); pivot.scale.setScalar(.0001); pivot.visible = false; scene.add(pivot);
  const hit = new THREE.Mesh(new THREE.SphereGeometry(.62, 10, 8), new THREE.MeshBasicMaterial({ visible: false })); pivot.add(hit);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: .55, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.visible = false; shadow.renderOrder = -2; scene.add(shadow);
  const M = { i, cfg, pivot, hit, shadow, hulls, outlineMat, glint, mixer: null, p: 1, v: 0, hover: 0, x: 0, y: 0, s: 0, ry: 0, report };
  if (g.animations.length) { M.mixer = new THREE.AnimationMixer(root); g.animations.forEach(a => M.mixer.clipAction(a).play()); }
  // line-up level of detail: when the watches are small on screen, tiny parts and secondary outlines are not drawn
  M.lod = []; root.traverse(o => { if (o.isMesh && !hulls.includes(o) && (o.userData.rel ?? 1) < .1) M.lod.push(o); }); M.lodOn = false;
  models[i] = M; hullVis(M); syncRes();
  if (params.has('debug')) console.log('[materials]', cfg.id, JSON.stringify(report));
  return M;
}
function load(i, onProgress) {
  const cfg = CATALOG[i];
  return new Promise((res, rej) => loader.load(cfg.file, g => { try { res(prepare(g, cfg, i)); } catch (e) { rej(e); } }, onProgress, rej));
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const idle = () => new Promise(r => (window.requestIdleCallback || setTimeout)(r));
const loading = new Map();
function ensure(i) {                                   // load a model on demand (once); failures degrade to its comic poster
  if (i >= CATALOG.length || models[i] || loading.has(i)) return loading.get(i);
  const p = load(i).then(() => { dirty = true; }).catch(e => { console.warn('model failed', CATALOG[i].id, e); $('#c' + i).classList.add('nomodel'); $('#c' + i + ' .note').hidden = false; });
  loading.set(i, p); return p;
}
async function loadRest() {                            // idle preload of the next two watches; the rest load when you get near them
  await wait(800);
  for (const i of [1, 2]) { await idle(); await ensure(i); await wait(300); }
}
function loadNear(best, nearOrder) {
  for (let d = 0; d <= 2; d++) { ensure(best + d); }
  if (nearOrder) CATALOG.forEach((_, i) => ensure(i));
}

/* ================= Layout (responsive composition: wide / portrait are different compositions) ================= */
const L = { wide: true, x: 1.6, y: 0, size: 2.3, VW: 6, VH: 4, lx: [], ly: [], ls: 1, anchorY: .5 };
let centers = [], orderC = 0;
function computeCenters() {
  centers = CATALOG.map((_, i) => { const e = $('#c' + i); return e.offsetTop + e.offsetHeight / 2; });
  const o = $('#order'); orderC = o.offsetTop + o.offsetHeight / 2;
}
function layout() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  renderer.setSize(w, h, false); camera.aspect = aspect; camera.updateProjectionMatrix(); syncRes();
  L.VH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z; L.VW = L.VH * aspect;
  L.wide = aspect > 1.1;
  if (L.wide) {
    L.size = Math.min(2.05, L.VW * .38); L.x = L.VW * .27; L.y = 0; L.ls = Math.min(1.3, L.VW * .17);
    const n = CATALOG.length, cols = n > 4 ? 3 : 2, rows = Math.ceil(n / cols), x0 = .575, x1 = .865;
    L.ls = Math.min(L.ls, L.VW * (x1 - x0) / (cols - 1) * .92, L.VH * .8 / rows * .9);
    L.lx = CATALOG.map((_, i) => (lerp(x0, x1, cols < 2 ? .5 : (i % cols) / (cols - 1)) - .5) * L.VW);
    L.ly = CATALOG.map((_, i) => (.5 - (Math.floor(i / cols) + .5) / rows) * L.VH * .8 + (i % cols === 1 ? -.02 : .02) * L.VH); L.anchorY = .5;
  } else {
    L.size = Math.min(1.8, L.VW * .74, L.VH * .42); L.x = 0; L.y = L.VH * .2; L.ls = Math.min(.8, L.VW * .36);
    const n = CATALOG.length, cols = 3, rows = Math.ceil(n / cols); L.ls = Math.min(L.ls, L.VW * .24, L.VH * .15);
    L.lx = CATALOG.map((_, i) => ((i % cols) / (cols - 1) - .5) * L.VW * .66); L.ly = CATALOG.map((_, i) => L.VH * .37 - Math.floor(i / cols) * L.VH * .18); L.anchorY = .3;
  }
  computeCenters(); dirty = true;
}
addEventListener('resize', () => { layout(); ScrollTrigger.refresh(); });
addEventListener('orientationchange', () => setTimeout(() => { layout(); ScrollTrigger.refresh(); }, 250));
ScrollTrigger.addEventListener('refresh', computeCenters);
document.fonts?.ready.then(() => { computeCenters(); ScrollTrigger.refresh(); });

/* ================= Input: parallax, drag-to-spin with inertia, hover/click on the 3D watches ================= */
const S = { px: 0, py: 0 }; let yawDrag = 0, yawVel = 0, drag = null, lastAct = performance.now();
const act = () => { lastAct = performance.now(); };
addEventListener('scroll', act, { passive: true });
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let hovered = -1, pending = false, mx = 0, my = 0;
const tip = $('#tip');
addEventListener('pointermove', e => {
  act(); mx = e.clientX; my = e.clientY;
  if (!reduce && e.pointerType === 'mouse') { S.px = e.clientX / innerWidth - .5; S.py = e.clientY / innerHeight - .5; }
  if (drag && drag.id === e.pointerId) {
    const dx = e.clientX - drag.x; drag.x = e.clientX; drag.moved += Math.abs(dx);
    if (drag.moved > 5) document.body.classList.add('dragging');
    yawDrag += dx * .012; yawVel = dx * .012;
  }
  if (!pending) { pending = true; requestAnimationFrame(hoverTest); }
});
addEventListener('pointerdown', e => { act(); if (!e.target.closest('button,a,aside,input,.nav')) drag = { x: e.clientX, id: e.pointerId, moved: 0 }; });
addEventListener('pointerup', e => {
  const d = drag; drag = null; document.body.classList.remove('dragging'); act();
  if (d && d.moved < 6 && hovered >= 0) onPick(hovered);
});
addEventListener('pointercancel', () => { drag = null; document.body.classList.remove('dragging'); });
function hoverTest() {
  pending = false; if (introRunning || coarseOnly()) return;
  ndc.set(mx / innerWidth * 2 - 1, -(my / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const cand = models.filter(M => M && M.v > .3 && M.pivot.visible).map(M => M.hit);
  const hit = ray.intersectObjects(cand, false)[0]; const M = hit && models.find(m => m && m.hit === hit.object);
  hovered = M ? M.i : -1;
  const lineup = fin > .5, b = document.body.classList;
  b.toggle('over-pick', hovered >= 0 && lineup); b.toggle('over-watch', hovered >= 0 && !lineup);
  if (hovered >= 0 && lineup) { tip.hidden = false; tip.textContent = CATALOG[hovered].name + ' · ' + money(CATALOG[hovered].price); tip.style.left = mx + 'px'; tip.style.top = my + 'px'; }
  else tip.hidden = true;
}
const coarseOnly = () => matchMedia('(hover:none)').matches;
function onPick(i) {
  if (fin > .5) { $('#c' + i).scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); }
  else if (!reduce) { yawVel += .22; pulseRays(); }          // click the focused watch = spin impulse
}

/* ================= Background FX that follow the focused watch ================= */
const fxw = document.createElement('div'); fxw.className = 'fxw';
const bgEl = $('.bg'); fxw.append($('.rays'), $('.dial')); bgEl.insertBefore(fxw, $('.vignette'));
const glows = [...document.querySelectorAll('.glow')], glowV = glows.map(() => 0);
function pulseRays() { if (reduce) return; gsap.fromTo('.rays', { scale: .9, opacity: .4 }, { scale: 1, opacity: .9, duration: .7, ease: 'power3.out', overwrite: 'auto' }); }
const root = document.documentElement, accentCol = new THREE.Color(CATALOG[0].accent); let lastBest = -1;
function setAccent(i) {
  lastBest = i; const c = CATALOG[i]; root.style.setProperty('--accent', c.accent);
  const t = new THREE.Color(c.accent); act();
  gsap.to(accentCol, { r: t.r, g: t.g, b: t.b, duration: reduce ? 0 : .6, overwrite: true, onUpdate() { lights.rim.color.copy(accentCol); U.uRim.value.copy(accentCol); dirty = true; } });
  document.querySelectorAll('#pager a').forEach(a => { if (+a.dataset.i !== i) a.removeAttribute('aria-current'); else a.setAttribute('aria-current', 'true'); });
  pulseRays();
}

/* ================= Intro: the pocket watch assembles itself, comes close, ticks faster and faster, then the shop appears ================= */
let introRunning = true, tlRef = null, fin = 0;
const anim = { ts: 1 }, I = { x: 0, y: 0, s: 1, ry: .1, rx: .1, camz: 6.4, ink: 0, light: .12 };
const IP = { rx: .9, ry: .35, rz: 0, s: 1, y: 0, camz: 9, ink: 0 };      // pocket-watch pose (separate from the hero watch)
function finish() {
  introRunning = false; heroOn = true; document.body.classList.remove('intro'); $('#skip')?.remove(); anim.ts = 1; U.uFlash.value = 0;
  if (PK) { PK.top.visible = false; scene.remove(PK.top); PK.top.traverse(o => { if (o.geometry) o.geometry.dispose(); }); PK = null; }
  gsap.set('.burst', { opacity: 0 }); gsap.set(['.nav', '.hero .copy > *', '.pager'], { opacity: 1, clearProps: 'transform' });
  setLights(1); layout(); initScroll(); ScrollTrigger.refresh(); store.set('tock-intro', '1'); act(); dirty = true;
}
function setLights(g) { lights.key.intensity = LBASE.key * g; lights.hemi.intensity = LBASE.hemi * g; lights.fill.intensity = LBASE.fill * g; lights.rim.intensity = LBASE.rim * (1 + (1 - g) * .6); dirty = true; }
function posePocket() {
  PK.top.position.set(0, IP.y, 0); PK.top.scale.setScalar(IP.s); PK.top.rotation.set(IP.rx, 0, IP.rz); PK.spin.rotation.y = IP.ry;
  PK.outlineMat.uniforms.uPx.value = 2.2 * dpr * IP.ink * Math.min(1.1, Math.max(.6, IP.s));
  v3.set(0, IP.y, 0).project(camera); PK.glint.uGC.value.set((v3.x * .5 + .5) * bufSize.x, (v3.y * .5 + .5) * bufSize.y);
  PK.glint.uGR.value = Math.max(1, Math.min(bufSize.y * .3, IP.s * (bufSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * IP.camz))));
  PK.glint.uGP.value = ((time * .35) % 3.4 + 3.4) % 3.4 - 1.7;
}
let heroReady = Promise.resolve();
function intro() {
  document.body.classList.add('intro'); heroOn = false; PK.top.visible = true; PK.setHull(quality.current().secondary);
  const asp = innerWidth / innerHeight, TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const s0 = Math.min(1.22, 1.05 * Math.min(1, asp * 1.15));                       // face radius on screen
  const camAsm = THREE.MathUtils.clamp(2.6 * s0 / (.44 * TAN * 2 * Math.min(asp, 1.8)), 7, 12);   // wide enough for the scattered parts
  const camAppr = Math.max(3.6, s0 / (.84 * TAN * Math.min(1, asp)));              // face fills the screen
  IP.s = s0; IP.rx = .95; IP.ry = .3; IP.rz = 0; IP.y = 0; IP.camz = camAsm + 1.2; IP.ink = 0; PK.rate = 0; PK.T = .55;
  I.light = .12; setLights(I.light); setAccent(0);
  const tl = gsap.timeline({ onComplete: finish }); tlRef = tl; gsap.set('.hero .copy > *', { y: 20 });
  const flash = v => gsap.fromTo(U.uFlash, { value: v }, { value: 0, duration: .16, ease: 'power2.out', overwrite: true });
  tl.to(I, { light: 1, duration: 1.2, ease: 'power2.out', onUpdate: () => setLights(I.light) }, 0)             // reveal from darkness
    .to(IP, { ink: 1.5, camz: camAsm, duration: 1.4, ease: 'power2.out' }, 0)
    .to(IP, { ry: .5, rx: 1.05, duration: 3.6, ease: 'none' }, 0);                                              // slow tumble while parts are scattered
  const asmEnd = PK.assemble(gsap, tl, 1.0, { onSnap: () => { flash(.22); pulseRays(); } });                    // 1 part every .3 s
  // the finished watch turns crown-up, faces us and comes close
  tl.addLabel('close', asmEnd - .1)
    .to(IP, { rx: Math.PI / 2, ry: Math.PI / 2, camz: camAppr, ink: 1.9, duration: 1.2, ease: 'power3.inOut' }, 'close')
    .addLabel('tick', 'close+=1.0')
    .set(PK, { rate: 1.3 }, 'tick')
    .to(PK, { rate: 58, duration: 3.1, ease: 'power3.in' }, 'tick')                                              // slow ticks, then faster and faster
    .to(IP, { camz: camAppr * .9, duration: 3.1, ease: 'none' }, 'tick')
    .addLabel('dive', 'tick+=2.75')
    .call(() => { if (!models[0] && tlRef === tl) { tl.pause(); heroReady.then(() => { if (tlRef === tl) tl.resume(); }); } }, null, 'dive-=.05')
    .to(IP, { camz: Math.max(1.5, camAppr * .3), duration: .8, ease: 'power4.in' }, 'dive')                      // dive into the dial
    .addLabel('hit', 'dive+=.8')
    .call(() => { heroOn = true; PK.top.visible = false; I.x = 0; I.y = 0; I.ry = -.35; I.rx = .1; I.camz = 5.4; I.ink = 2.2; }, null, 'hit')
    .set('.burst', { opacity: 1 }, 'hit')
    .fromTo('.burst', { scale: 0, rotate: -20 }, { scale: 1, rotate: -8, duration: .35, ease: 'back.out(3)' }, 'hit')
    .to('.burst', { opacity: 0, scale: 1.25, duration: .4, delay: .3 }, 'hit')
    .to(U.uFlash, { value: 1, duration: .05 }, 'hit').to(U.uFlash, { value: 0, duration: .45, ease: 'power2.out' }, 'hit+=.05')
    .fromTo('.rays', { scale: .5, opacity: 0 }, { scale: 1, opacity: .9, duration: .9, ease: 'power3.out' }, 'hit')
    .fromTo(I, { s: L.size * .55 }, { s: L.size * 1.22, duration: .22, ease: 'power4.out' }, 'hit')
    .to(I, { x: L.x, y: L.y, s: L.size * 1.09, ry: -.5, rx: .05, camz: CAM_Z, ink: 1, duration: 1.1, ease: 'power3.inOut' }, 'hit+=.3')
    .to('.nav', { opacity: 1, duration: .4 }, 'hit+=.6')
    .to('.hero .copy > *', { opacity: 1, y: 0, duration: .5, stagger: .12, ease: 'power2.out' }, 'hit+=.6')
    .from('.hero h1 span', { x: -80, skewX: -20, duration: .5, stagger: .12, ease: 'power3.out' }, 'hit+=.6');
}
function endIntro() { if (tlRef) { tlRef.kill(); tlRef = null; } finish(); }
$('#skip').onclick = endIntro;
addEventListener('keydown', e => { if (introRunning && (e.key === 'Escape' || e.key === ' ' && e.target === document.body)) { e.preventDefault(); endIntro(); } });

/* ================= Scroll choreography (ScrollTrigger drives panels, pager, accent; poses are pure functions of scroll) ================= */
let scrollInit = false;
function initScroll() {
  if (scrollInit) return; scrollInit = true;
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: act });
  if (!reduce) document.querySelectorAll('.chap').forEach((sec, i) => {
    const dx = innerWidth < 800 ? 24 : 70;
    gsap.from(sec.querySelector('.panel'), { x: i % 2 ? dx : -dx, opacity: 0, skewX: i % 2 ? 6 : -6, duration: .45, ease: 'power4.out',
      onComplete() { gsap.fromTo(this.targets()[0], { x: i % 2 ? -5 : 5 }, { x: 0, duration: .5, ease: 'elastic.out(1,.22)', overwrite: 'auto' }); },
      scrollTrigger: { trigger: sec, start: 'top 62%', toggleActions: 'play none none reverse' } });
  });
}

/* ================= Frame loop: one rAF (GSAP ticker) drives everything ================= */
const clk = new THREE.Clock(); let time = 0, sy = scrollY, lastRender = 0, lastActive = 0, camx = 0, camy = .25, fxX = 0, fxY = 0;
let lastSY = scrollY, scrollVel = 0;
const v3 = new THREE.Vector3(), tmpC = new THREE.Vector2();
let beat = 0, beatDir = 1;
function poseAll(dt) {
  { const ph = time % 1; beat = Math.exp(-ph * 18); beatDir = (Math.floor(time) % 2) ? -1 : 1; }
  const vh = innerHeight; sy = reduce ? scrollY : sy + (scrollY - sy) * (1 - Math.exp(-dt * 11));
  const sc = sy + vh / 2, pO = (orderC - sc) / vh; fin = 1 - sm(.25, .8, Math.abs(pO));
  if (SHOT !== null) fin = 0;
  let best = 0, bestV = -1, closeBest = 0; glowV.fill(0);
  yawVel *= Math.exp(-dt * 3.2); if (!drag) yawDrag += yawVel; yawDrag *= Math.exp(-dt * .35);
  if (SHOT === null) CATALOG.forEach((_, i) => {
    const p = (centers[i] - sc) / vh; let v = 1 - sm(.3, .85, Math.abs(p)); if (i === 0 && p > 0) v = 1; v = Math.max(v, fin);
    if (v > bestV && fin < .5) { bestV = v; best = i; }
  });
  models.forEach((M, i) => {
    if (!M) return;
    const shot = SHOT !== null;
    if (shot && i !== SHOT) { M.pivot.visible = false; M.shadow.visible = false; return; }
    const p = (centers[i] - sc) / vh, intro0 = i === 0 && introRunning;
    let v = 1 - sm(.3, .85, Math.abs(p)); if (i === 0 && p > 0) v = 1; v = Math.max(v, fin); if (shot) v = 1;
    M.p = p; M.v = v;
    const side = i % 2 === 0 ? 1 : -1, S0 = L.size * M.cfg.size, close = (i === 0 && p > 0) ? 1 : 1 - sm(0, .5, Math.abs(p));
    let x = side * L.x, y = L.y - (1 - v) * 1.4, s = S0 * Math.pow(Math.max(v, .0001), .85) * (1 + .09 * close);
    let ry = (i === 0 ? -.5 + Math.min(1, scrollY / vh) : -.45 + p * 1.5) + (i === best ? yawDrag : 0), rx = .08;
    if (!reduce) { ry += S.px * .35; rx += S.py * .22; y += Math.sin(time * 1.2 + i * 1.7) * .035 * S0; if (i === best && fin < .5) { ry += beat * .016 * beatDir; rx += beat * .008; } }
    if (shot) { x = 0; y = 0; s = S0 * 1.25; ry = params.has('yaw') ? +params.get('yaw') : -.5; rx = .06; }
    const lx = L.lx[i], ly = L.ly[i], ls = L.ls * (M.cfg.lineSize ?? M.cfg.size);
    M.hover += ((hovered === i && fin > .5 ? 1 : 0) - M.hover) * (1 - Math.exp(-dt * 12));
    x = lerp(x, lx, fin); y = lerp(y, ly, fin) + M.hover * .08; s = lerp(s, ls, fin) * (1 + .1 * M.hover); ry = lerp(ry, time * .6 + i, fin) + M.hover * .3;
    if (intro0) { x = I.x; y = I.y; s = I.s; ry = I.ry; rx = I.rx; v = 1; M.v = 1; best = 0; bestV = 1; }
    M.x = x; M.y = y; M.s = s; M.ry = ry;
    { const want = fin > .5; if (want !== M.lodOn) { M.lodOn = want; M.lod.forEach(o => { o.visible = !want; }); hullVis(M); } }
    M.pivot.visible = v > .01 && s > .001 && !(intro0 && !heroOn); M.pivot.position.set(x, y, 0); M.pivot.scale.setScalar(Math.max(.0001, s)); M.pivot.rotation.set(rx, ry, 0);
    M.shadow.visible = M.pivot.visible && v > .05; M.shadow.position.set(x, y - s * .62, 0); M.shadow.scale.set(s * 1.0, s * 1.0, 1); M.shadow.material.opacity = .55 * Math.min(1, v);
    if (M.i === best) closeBest = close;
    if (!shot) glowV[i % glows.length] = Math.max(glowV[i % glows.length], v);
    M.outlineMat.uniforms.uPx.value = 2.2 * dpr * (intro0 ? I.ink : 1) * Math.min(1.1, Math.max(.55, s / L.size));
  });
  glows.forEach((g, k) => { g.style.opacity = (glowV[k] * .6).toFixed(2); });
  if (best !== lastBest && fin < .5 && !introRunning) { setAccent(best); loadNear(best, false); }
  if (fin > .05) loadNear(best, true);
  // camera language: slow dolly toward the focused watch, bounded pointer parallax, never rolls
  const camZ = introRunning ? (heroOn ? I.camz : IP.camz) : CAM_Z - .3 * closeBest * (1 - fin);
  camx += ((reduce ? 0 : S.px * .25) - camx) * (1 - Math.exp(-dt * 4)); camy += ((.25 - (reduce ? 0 : S.py * .15)) - camy) * (1 - Math.exp(-dt * 4));
  camera.position.set(camx, camy, camZ); camera.lookAt(0, 0, 0);
  // background rays + dial centre on the focused watch (screen space)
  const bm = models[best]; let ax = innerWidth / 2, ay = innerHeight * L.anchorY;
  if (bm && fin < 1) { v3.set(bm.x, bm.y, 0).project(camera); ax = lerp((v3.x * .5 + .5) * innerWidth, ax, fin); ay = lerp((-v3.y * .5 + .5) * innerHeight, ay, fin); }
  fxX += (ax - innerWidth / 2 - fxX) * (1 - Math.exp(-dt * 6)); fxY += (ay - innerHeight / 2 - fxY) * (1 - Math.exp(-dt * 6));
  fxw.style.transform = `translate3d(${fxX.toFixed(1)}px,${fxY.toFixed(1)}px,0)`;
  return best;
}
function updateGlints() {
  const pxu = bufSize.y / L.VH;
  models.forEach(M => {
    if (!M || !M.pivot.visible) return;
    v3.set(M.x, M.y, 0).project(camera);
    M.glint.uGC.value.set((v3.x * .5 + .5) * bufSize.x, (v3.y * .5 + .5) * bufSize.y);
    M.glint.uGR.value = Math.max(1, M.s * pxu * .62);
    M.glint.uGP.value = ((M.ry * .55 + time * .08) % 3.4 + 3.4) % 3.4 - 1.7;
  });
}
function tick() {
  const now = performance.now(), ambient = !reduce && models.some(M => M && M.v > .05 && M.pivot.visible) && SHOT === null;
  const active = introRunning || now - lastAct < 1500 || dirty;
  if (!active) { if (!ambient || now - lastRender < 33) return; }
  const dt = Math.min(clk.getDelta(), .1); time += dt;
  if (active && lastActive) quality.report(now - lastActive); lastActive = active ? now : 0; lastRender = now; dirty = false;
  const sv = Math.abs(scrollY - lastSY) / Math.max(dt, .001); lastSY = scrollY; scrollVel += (Math.min(sv, 3000) - scrollVel) * (1 - Math.exp(-dt * 6));
  poseAll(dt);
  if (PK && PK.top.visible) { PK.update(dt, time); posePocket(); }
  models.forEach(M => { if (M && M.mixer && M.pivot.visible) M.mixer.update(dt * (M.i === 0 ? anim.ts : .6) * (1 + scrollVel * .0035)); });   // gears spin faster while you scroll
  updateGlints();
  renderer.render(scene, camera);
}
gsap.ticker.add(tick);

/* ================= Start: the intro only needs the small pocket-watch file; the hero model loads in parallel ================= */
layout();
const loadEl = $('#load');
function onProg(e) { if (e.lengthComputable) { loadEl.classList.remove('indet'); loadEl.querySelector('b').style.width = Math.round(e.loaded / e.total * 100) + '%'; } else loadEl.classList.add('indet'); }
loadEl.classList.add('indet');
function heroFailed(e) {
  console.warn('hero model failed', e); $('#loadTxt') && ($('#loadTxt').textContent = '3D model failed to load — the shop still works.');
  $('.hero').classList.add('nomodel'); $('#c0').classList.add('nomodel'); $('#c0 .note').hidden = false;
  if (tlRef) { tlRef.kill(); tlRef = null; } fallback(); finish(); loadRest();
}
const heroP = load(0, onProg).then(M => { dirty = true; return M; });
heroReady = heroP.catch(() => {});
let wantIntro = !(reduce || store.get('tock-intro') === '1' || SHOT !== null);
if (wantIntro) {
  try { PK = await loadPocket({ loader, scene, env, url: INTRO_MODEL, onProgress: onProg }); syncRes(); }
  catch (e) { console.warn('intro model failed, skipping intro', e); PK = null; wantIntro = false; }
}
if (wantIntro) {
  loadEl.classList.add('off'); setTimeout(() => loadEl.remove(), 400);
  intro(); heroP.then(loadRest, heroFailed);
} else {
  try { await heroP; } catch (e) { heroFailed(e); throw e; }
  loadEl.classList.add('off'); setTimeout(() => loadEl.remove(), 400);
  if (SHOT !== null) { if (SHOT !== 0) await load(SHOT); introRunning = false; heroOn = true; document.body.classList.remove('intro'); layout(); }
  else { finish(); loadRest(); }
}
if (params.has('debug')) window.__tock = { renderer, scene, camera, models, quality, U, L, lights, ensure, get tl() { return tlRef; }, get PK() { return PK; }, get fin() { return fin; } };
