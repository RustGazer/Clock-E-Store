# Tock&Co. — watch store (premium cel-shaded 3D edition)

Nine watches shown in real-time toon-shaded 3D, with scroll storytelling, a skippable pocket-watch assembly intro, a cart and a working order-request flow (opens a pre-filled `mailto:`).

## Run
No build step. Serve the folder over HTTP (modules + GLB loading do not work from `file://`):

    python3 serve.py          # or: python3 -m http.server 8765

Open http://localhost:8765. Internet is needed for the CDN libraries (three.js r160, GSAP 3.12.5 + ScrollTrigger).

## Edit your products
`src/catalog.js` — name, tag, price, GLB `file`, `accent` colour, pose `rot`, `size`, optional `span` / `lineSize` (zoom on the head of long-strap watches), `alt`. **Prices of the five newest watches (T-Race MotoGP, Open Calibre, Aurum/Argent/Noir Classic) are placeholders.** `ORDER_EMAIL` is the order recipient (currently a placeholder: **change it**). Chapters, pager, lineup and cart are generated from this list.

## Structure
- `index.html`, `style.css` — markup and comic styling (fonts self-hosted in `assets/fonts`, OFL).
- `src/main.js` — scene, intro, scroll choreography, input, fallbacks.
- `src/toon.js` — per-material toon/PBR-hybrid shading, outlines, halftone, rim, glass glint.
- `src/studio.js` — procedural studio lighting environment and lights.
- `src/intro.js` — the pocket-watch intro: 9 rigid parts (case, neck, crown, bow, glass, dial, hour hand, minute hand, hub) fly back together one by one, the watch comes close, the hands tick slow then faster and faster. Parts are matched by node name in `assets/intro_pocket_watch.glb`.
- `src/quality.js` — adaptive quality ladder (5 levels) + "Low power" toggle.
- `src/cart.js` — cart drawer (focus trap, Esc, inert background) and mailto order.
- `assets/*.glb` — optimized (meshopt, simplified) models; `assets/_original/` — untouched originals (left out of the slim zip; keep your own copies).
- The vintage trio file was split into three single-watch files; its baked-in glass triangles were removed (they were masked by texture alpha anyway).
- `assets/posters/*.webp` — comic posters used when WebGL or a model fails.

## URL options (testing)
`?q=high|balanced|low` force quality · `?aa=1|0` force MSAA · `?debug` log material report and expose `window.__tock` · `?shot=N` static poster mode for chapter N.

## Behaviour notes
- Intro plays once per session, skippable (button, Esc or Space), disabled for `prefers-reduced-motion`.
- Models load on demand as you approach them; in the final line-up tiny parts and secondary outlines are not drawn.
- Alive-ness: a 1 Hz mechanical heartbeat nudges the focused watch, the background dial ticks in steps, gears of the Open Calibre spin faster while you scroll, panels arrive with a snappy recoil.
- Rendering drops to 30 fps ambient when idle; DPR adapts to measured frame time.
- No WebGL / model failure → comic poster fallback, shop remains usable.
- MSAA only requested on devices with >=8 cores and a fine pointer.
