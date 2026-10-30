/* Adaptive quality controller
   ---------------------------------------------------------------------------
   One ladder of levels. Each level changes ONLY things that cost GPU time:
   internal resolution (pixel ratio), halftone shadows, and secondary outlines.
   The primary model, silhouette, outlines on the big parts, toon bands, reflections,
   palette and camera moves survive on every level, so "low" still looks art-directed.

   - Start level comes from cautious hints (cores, memory, pointer type, screen size).
   - Frame time is sampled only on *active* frames (scrolling / interacting / intro).
   - Step down after a sustained slow window; step up only after several sustained fast
     windows plus a long cooldown (hysteresis, so it never oscillates around a threshold).
   - Never recovers above the hint-based starting level.
   - ?q=high|balanced|low forces a level (for testing); the nav toggle forces low power.   */
const LADDER = [
  { name: 'high',     dpr: 1.5,  halftone: 1, secondary: true  },
  { name: 'high',     dpr: 1.0,  halftone: 1, secondary: true  },
  { name: 'balanced', dpr: 0.85, halftone: 1, secondary: true  },
  { name: 'low',      dpr: 0.75, halftone: 0, secondary: false },
  { name: 'low',      dpr: 0.6,  halftone: 0, secondary: false }
];
const store = {
  get() { try { return localStorage.getItem('tock-fx'); } catch (e) { return null; } },
  set(v) { try { v ? localStorage.setItem('tock-fx', v) : localStorage.removeItem('tock-fx'); } catch (e) {} }
};

export function createQuality(onApply) {
  const url = new URLSearchParams(location.search).get('q');
  const forced = { high: 0, balanced: 2, low: 3 }[url];
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  const coarse = matchMedia('(pointer:coarse)').matches;
  const px = innerWidth * innerHeight * (devicePixelRatio || 1) ** 2;
  let score = (cores >= 8) + (mem >= 8) + (!coarse) + (px < 3.2e6);
  const hint = score >= 4 ? 0 : score === 3 ? 1 : 2;
  let lowPower = store.get() === 'low';
  let base = forced ?? hint, level = lowPower ? 3 : base, lastChange = performance.now();
  const win = new Float32Array(45); let n = 0, fastWindows = 0;

  const cur = () => ({ ...LADDER[level], dpr: Math.min(LADDER[level].dpr, devicePixelRatio || 1), index: level, lowPower });
  const set = (l) => { l = Math.max(0, Math.min(LADDER.length - 1, l)); if (l === level) return; level = l; lastChange = performance.now(); n = 0; fastWindows = 0; onApply(cur()); };

  return {
    current: cur,
    report(dt) {                               // dt in ms, active frames only
      if (forced !== undefined || lowPower || dt > 200) return;
      win[n++] = dt; if (n < win.length) return;
      let s = 0; for (let i = 0; i < n; i++) s += win[i]; const avg = s / n; n = 0;
      const now = performance.now();
      if (avg > 26 && now - lastChange > 2500) { fastWindows = 0; set(level + 1); }
      else if (avg < 12.5) { if (++fastWindows >= 4 && now - lastChange > 9000 && level > base) { fastWindows = 0; set(level - 1); } }
      else fastWindows = 0;
    },
    setLowPower(on) { lowPower = on; store.set(on ? 'low' : null); if (on) set(Math.max(level, 3)); else { level = -1; set(forced ?? base); } onApply(cur()); },  // always notify so the toggle state stays in sync
    get lowPower() { return lowPower; }
  };
}
