/* Toon / comic material system
   ---------------------------------------------------------------------------
   Instead of swapping every GLB material for one generic toon material, each
   source material is classified by role and mapped to the cheapest style that
   keeps its identity:

     metal   → MeshStandardMaterial (keeps colour / metal / roughness maps) + studio env
               reflections, then the final light is posterised into hard cel bands
     matte   → MeshToonMaterial (gradient ramp) for painted / fabric / leather-like parts
     glass   → transparent standard material with fresnel edge + comic glint sweep
     emissive parts keep their emission in every role

   Everything is applied to *runtime copies*; the source GLB is never modified.
   All styled materials share ONE uniform block (U) so global changes (flash,
   halftone on/off, rim colour) are a single uniform write.                        */
import * as THREE from 'three';

export const U = {
  uFlash: { value: 0 },                                   // white impact flash (intro hit)
  uHalf:  { value: 1 },                                   // halftone shadows on/off (quality tier)
  uCell:  { value: 6 },                                   // halftone cell size in device px
  uRim:   { value: new THREE.Color('#ff7a1a') },          // rim colour = current chapter accent
  uRimAmt:{ value: 0.55 },
  uInk:   { value: new THREE.Color(0x0b0a14) },           // outline / dot ink
  uShadowTint: { value: new THREE.Color(0.58, 0.54, 1.0) } // deep indigo shadows instead of grey/black
};

const HEAD = `uniform float uFlash,uHalf,uCell,uRimAmt; uniform vec3 uRim,uInk,uShadowTint;
const vec3 LW=vec3(.2126,.7152,.0722);\n`;

/* Hard cel bands on the final light (diffuse + spec + env). AA'd with fwidth so
   band edges stay crisp but not jagged. */
const POSTERIZE = `
  { float lum=dot(outgoingLight,LW); float g=sqrt(max(lum,0.)); float x=g*4.;
    float w=fwidth(x)*.8+.03; float q=(floor(x)+smoothstep(.5-w,.5+w,fract(x)))/4.;
    float lq=q*q*1.1+.028; outgoingLight*=lq/max(lum,1e-3);
    float sh=1.-smoothstep(.1,.45,q); outgoingLight=mix(outgoingLight,outgoingLight*uShadowTint,sh); }`;

/* Comic halftone dots that grow with shadow depth (45° screen, device-pixel cells). */
const HALFTONE = `
  { float aL=max(dot(diffuseColor.rgb,LW),.03); float lit=clamp(dot(outgoingLight,LW)/aL,0.,1.6);
    float sh=1.-smoothstep(.34,.64,lit);
    vec2 hp=mat2(.7071,.7071,-.7071,.7071)*gl_FragCoord.xy/uCell; float hd=length(fract(hp)-.5);
    float rad=.1+.34*sh; float aa=.7/uCell+.02; float dots=1.-smoothstep(rad-aa,rad+aa,hd);
    float gate=smoothstep(.05,.22,sh)*uHalf;
    outgoingLight=mix(outgoingLight,outgoingLight*.3+uInk*.22,dots*gate); }`;

/* Hard-edged rim light in the chapter accent colour — separates silhouette from background. */
const RIM = `
  { float rf=pow(1.-saturate(dot(normalize(normal),normalize(vViewPosition))),2.6);
    outgoingLight=mix(outgoingLight,uRim,smoothstep(.55,.6,rf)*uRimAmt); }`;

const FLASH = `outgoingLight=mix(outgoingLight,vec3(1.),uFlash*.9);`;

function inject(mat, key, chunks) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFlash = U.uFlash; sh.uniforms.uHalf = U.uHalf; sh.uniforms.uCell = U.uCell;
    sh.uniforms.uRim = U.uRim; sh.uniforms.uRimAmt = U.uRimAmt; sh.uniforms.uInk = U.uInk; sh.uniforms.uShadowTint = U.uShadowTint;
    sh.fragmentShader = HEAD + sh.fragmentShader.replace('#include <opaque_fragment>', chunks + '\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/* ---------- ramps ---------- */
export const ramp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([70, 150, 215, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();

/* ---------- outlines (inverted hull, constant screen-space width) ---------- */
export function makeOutlineMaterial(px = 2) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uPx: { value: px }, uRes: { value: new THREE.Vector2(1, 1) }, uInkC: U.uInk },
    vertexShader: `attribute vec3 smoothNormal; uniform float uPx; uniform vec2 uRes;
      void main(){ vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
        vec3 n=normalize(normalMatrix*smoothNormal); vec2 d=(projectionMatrix*vec4(n,0.)).xy; float l=length(d); if(l>1e-5) d/=l;
        p.xy+=d*(uPx*2./uRes)*p.w; gl_Position=p; }`,
    fragmentShader: `uniform vec3 uInkC; void main(){ gl_FragColor=vec4(uInkC,1.);\n#include <colorspace_fragment>\n}`
  });
}

/* Hard-edged meshes have split normals; extruding along them opens gaps in the hull.
   Average the normals of coincident vertices into a dedicated attribute instead. */
function addSmoothNormals(geo) {
  if (geo.attributes.smoothNormal) return;
  const pos = geo.attributes.position, nor = geo.attributes.normal; if (!pos || !nor) return;
  geo.computeBoundingSphere();
  const q = 1 / Math.max(geo.boundingSphere.radius * 2e-4, 1e-9), n = pos.count;
  const acc = new Map(), idx = new Int32Array(n), sum = [];
  const K = (v) => Math.round(v * q) + 8192;
  for (let i = 0; i < n; i++) {
    const k = (K(pos.getX(i)) * 16384 + K(pos.getY(i))) * 16384 + K(pos.getZ(i));
    let s = acc.get(k); if (s === undefined) { s = sum.length / 3; acc.set(k, s); sum.push(0, 0, 0); }
    idx[i] = s; sum[s * 3] += nor.getX(i); sum[s * 3 + 1] += nor.getY(i); sum[s * 3 + 2] += nor.getZ(i);
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = idx[i] * 3, x = sum[s], y = sum[s + 1], z = sum[s + 2], l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  geo.setAttribute('smoothNormal', new THREE.BufferAttribute(out, 3));
}

/* ---------- classification + material factories ---------- */
const lum = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
function lift(c, min) {
  const o = (c ? c.clone() : new THREE.Color(1, 1, 1)), l = lum(o);
  if (l < min) { if (l < 1e-4) o.setRGB(min, min, min * 1.15); else o.multiplyScalar(Math.min(6, min / l)); }
  return o;
}
export function classify(m) {
  const a = m.opacity ?? 1;
  if ((m.transparent && a < 0.7) || (m.transmission || 0) > 0) return 'glass';
  if ((m.metalness ?? 0) >= 0.35 || m.metalnessMap) return 'metal';
  // some exporters leave metal parts at metalness 0 — trust the material name as a hint
  if (/metal|steel|stel|chrome|silver|alu|brass|gold|ferr/i.test(m.name || '')) return 'metal';
  return 'matte';
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function metalMat(old, env, big) {
  const hasMR = !!old.metalnessMap;
  const m = new THREE.MeshStandardMaterial({
    color: old.map ? old.color.clone() : lift(old.color, 0.085), map: old.map || null,
    metalnessMap: old.metalnessMap || null, roughnessMap: old.roughnessMap || null,
    metalness: hasMR ? old.metalness : Math.max(old.metalness, 0.6),
    roughness: hasMR ? old.roughness : clamp(old.roughness, 0.24, 0.55),
    emissive: old.emissive?.clone(), emissiveMap: old.emissiveMap || null, emissiveIntensity: old.emissiveIntensity ?? 1,
    envMap: env, envMapIntensity: 1.35, side: old.side, alphaTest: old.alphaTest || 0
  });
  return inject(m, 'tock-metal' + (big ? '-b' : ''), POSTERIZE + (big ? HALFTONE + RIM : '') + FLASH);
}
function matteMat(old, big) {
  const m = new THREE.MeshToonMaterial({
    color: old.color.clone(), map: old.map || null, gradientMap: ramp,
    emissive: old.emissive?.clone(), emissiveMap: old.emissiveMap || null, emissiveIntensity: old.emissiveIntensity ?? 1,
    side: old.side, alphaTest: old.alphaTest || 0
  });
  return inject(m, 'tock-matte' + (big ? '-b' : ''), (big ? HALFTONE + RIM : '') + FLASH);
}
function glassMat(old, env, glint) {
  const m = new THREE.MeshStandardMaterial({
    color: lift(old.color, 0.05), metalness: 0, roughness: 0.06, envMap: env, envMapIntensity: 1.7,
    transparent: true, opacity: 0.12 + clamp(old.opacity ?? 1, 0, 1) * 0.25, depthWrite: false, side: THREE.FrontSide
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlash = U.uFlash; sh.uniforms.uGC = glint.uGC; sh.uniforms.uGR = glint.uGR; sh.uniforms.uGP = glint.uGP;
    sh.fragmentShader = `uniform float uFlash,uGR,uGP; uniform vec2 uGC;\n` + sh.fragmentShader.replace('#include <opaque_fragment>', `
      { float fr=pow(1.-saturate(dot(normalize(normal),normalize(vViewPosition))),3.);
        diffuseColor.a=mix(diffuseColor.a,.9,fr*.85);
        vec2 pc=(gl_FragCoord.xy-uGC)/uGR; float t=dot(pc,vec2(.8,.6))-uGP;
        float gl=max(smoothstep(.075,.055,abs(t))*.55,smoothstep(.022,.012,abs(t-.17))*.85);
        outgoingLight=mix(outgoingLight,vec3(1.),gl); diffuseColor.a=max(diffuseColor.a,gl*.92);
        outgoingLight=mix(outgoingLight,vec3(1.),uFlash*.9); }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'tock-glass';
  m.userData.role = 'glass';
  return m;
}

/* ---------- apply to a loaded model ---------- */
export function styleModel(root, { env, outlineMat, glint }) {
  root.updateMatrixWorld(true);
  const meshes = []; root.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
  const box = new THREE.Box3(); meshes.forEach(m => box.expandByObject(m));
  const sz = box.getSize(new THREE.Vector3()), mmax = Math.max(sz.x, sz.y, sz.z) || 1;
  const cache = new Map(), hulls = [], report = [], tmp = new THREE.Box3(), v = new THREE.Vector3();

  const convert = (old, big) => {
    const key = old.uuid + (big ? 'B' : 's'); let m = cache.get(key);
    if (!m) {
      const role = classify(old);
      m = role === 'glass' ? glassMat(old, env, glint) : role === 'metal' ? metalMat(old, env, big) : matteMat(old, big);
      m.name = (old.name || 'mat') + ':' + role; m.userData.role = role; m.userData.source = old;
      cache.set(key, m); report.push([old.name || '(unnamed)', role, big ? 'big' : 'detail']);
    }
    return m;
  };

  for (const o of meshes) {
    tmp.setFromObject(o); tmp.getSize(v); const rel = Math.max(v.x, v.y, v.z) / mmax, big = rel > 0.12;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map(m => convert(m, big));
    o.material = Array.isArray(o.material) ? out : out[0];
    o.userData.rel = rel;
    const solid = out.some(m => m.userData.role !== 'glass');
    if (solid && rel > 0.06 && !o.isSkinnedMesh) {
      addSmoothNormals(o.geometry);
      const h = new THREE.Mesh(o.geometry, outlineMat); h.userData.primary = rel > 0.25; h.matrixAutoUpdate = false; h.frustumCulled = o.frustumCulled;
      o.add(h); hulls.push(h);
    }
  }
  return { hulls, report };
}
