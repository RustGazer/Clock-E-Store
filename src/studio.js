/* Studio lighting + environment.
   The environment is a tiny hand-built scene of emissive softboxes (white key, cyan and
   magenta strips, warm floor bounce) baked once into a PMREM texture. Metal parts reflect
   these shapes, so the reflections carry the site's comic palette instead of a generic HDRI. */
import * as THREE from 'three';

export function makeStudioEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer), s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(20, 24, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.026, 0.06), side: THREE.BackSide })));
  const panel = (w, h, pos, color, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(9, 6, [-9, 9, 8], 0xffffff, 9);        // key softbox, upper-left front
  panel(2.0, 14, [12, 1, 3], 0x19d3ee, 2.6);     // cyan strip, right
  panel(2.0, 12, [-12, -2, -2], 0xff2e88, 2.2);  // magenta strip, left-back
  panel(12, 2, [0, -9, 6], 0xffe8b0, 2.4);     // warm floor bounce
  panel(14, 3, [0, 12, -8], 0xffffff, 4);      // top-back strip for roof glints
  const rt = pm.fromScene(s, 0.02); pm.dispose();
  s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt.texture;
}

export function addLights(scene) {
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x2a1450, 0.55);
  const key = new THREE.DirectionalLight(0xfff2de, 2.5); key.position.set(-3, 4, 5);
  const rim = new THREE.DirectionalLight(0xff7a1a, 2.4); rim.position.set(4, 2, -4);
  const fill = new THREE.DirectionalLight(0x19d3ee, 0.55); fill.position.set(5, -1, 3);
  scene.add(hemi, key, rim, fill);
  return { hemi, key, rim, fill };
}

/* Halftone-dot ellipse used as a comic contact shadow under each watch (1 cheap quad each). */
export function makeShadowTexture() {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'); g.fillStyle = '#0b0a14';
  const cell = 8;
  for (let y = cell / 2; y < N; y += cell) for (let x = cell / 2; x < N; x += cell) {
    const d = Math.hypot(x - N / 2, y - N / 2) / (N / 2); if (d >= 1) continue;
    const r = (1 - d) * (1 - d) * cell * 0.62; if (r < 0.4) continue;
    g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
