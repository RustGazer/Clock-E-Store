/* ---------- Edit names, text, prices, order e-mail and per-model options here ----------
   rot        : [x,y,z] extra rotation (radians) if a model ever faces the wrong way
   accent     : colour of that watch's chapter (rim light, panel shadow, glow)
   hideBelowY : (optional) hide parts of the GLB lower than this Y, in the model's own units.
                Used to hide the display platter that ships inside the Huracán file.
   size       : relative on-screen size (1 = default)
   span       : (optional) fraction of the model's longest side that counts as "1 unit" - <1 zooms in on the head of a long-strap watch
   lineSize   : (optional) size used in the final line-up (defaults to size)
   NOTE: prices of the five newest watches are PLACEHOLDERS - set your real prices.        */
export const ORDER_EMAIL = 'orders@example.com';

export const CATALOG = [
  { id:'huracan', name:'Huracán Black', tag:'Skeleton racing watch. Watch the mechanism move.', price:9800,
    file:'assets/roger_dubuis_lamborghini_huracan_black_by_sdc.glb', rot:[0,0,0], accent:'#ff7a1a', hideBelowY:-4, size:1.0,
    alt:'Huracán Black skeleton racing watch with black strap and orange stitching' },
  { id:'verde', name:'Verde Chrono', tag:'Green-dialled chronograph with three sub-dials.', price:2400,
    file:'assets/watch__luxury_wristwatch_3d_model.glb', rot:[0,0,0], accent:'#1fd18a', size:1.0,
    alt:'Verde Chrono green-dialled chronograph on a steel and green bracelet' },
  { id:'chief', name:'Mega Chief', tag:'Oversized, bold, impossible to miss.', price:320,
    file:'assets/reloj_disel_mega_chief.glb', rot:[0,0,0], accent:'#4d8dff', size:1.0,
    alt:'Mega Chief oversized chronograph with blue dial and steel bracelet' },
  { id:'ermes', name:'Ermes', tag:'Clean lines for every day.', price:1450,
    file:'assets/reloj_ermes.glb', rot:[0,0,0], accent:'#d4b04c', size:1.0,
    alt:'Ermes rectangular steel watch on a tan leather strap' },
  { id:'tissot', name:'T-Race MotoGP', tag:'Limited-edition racing chronograph with red stitching.', price:690,
    file:'assets/tissot_t_race_motogp.glb', rot:[1.5708,0,-.62], accent:'#ff3b4e', size:1.0, span:.5, lineSize:.8,
    alt:'T-Race MotoGP limited edition chronograph with black and red strap' },
  { id:'calibre', name:'Open Calibre', tag:'A mechanical movement on show. Every gear keeps turning.', price:3200,
    file:'assets/open_calibre_movement.glb', rot:[0,0,0], accent:'#2fd6e6', size:1.0,
    alt:'Open Calibre skeleton watch showing gears, escapement and balance wheel' },
  { id:'aurum', name:'Aurum Classic', tag:'Gold case, roman dial, brown leather.', price:1280,
    file:'assets/vintage_gold.glb', rot:[0,0,0], accent:'#f0a93a', size:1.0,
    alt:'Aurum Classic gold-cased watch with roman numeral dial and brown leather strap' },
  { id:'argent', name:'Argent Classic', tag:'Gunmetal case, tan strap, quiet confidence.', price:980,
    file:'assets/vintage_silver.glb', rot:[0,0,0], accent:'#8fb6d9', size:1.0,
    alt:'Argent Classic gunmetal watch with roman numeral dial and tan leather strap' },
  { id:'noir', name:'Noir Classic', tag:'All black. Nothing to explain.', price:1080,
    file:'assets/vintage_noir.glb', rot:[0,0,0], accent:'#b57cff', size:1.0,
    alt:'Noir Classic black watch with roman numeral dial and black leather strap' },
];

/* Intro: the pocket watch that assembles itself (parts are separate meshes named in the GLB) */
export const INTRO_MODEL = 'assets/intro_pocket_watch.glb';
