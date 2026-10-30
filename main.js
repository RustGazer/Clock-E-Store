import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm';
import { ScrollTrigger } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/ScrollTrigger/+esm';
gsap.registerPlugin(ScrollTrigger);

/* ---------- Edit names, text, prices, order e-mail and per-model rotation `rot` here ---------- */
const ORDER_EMAIL = 'orders@example.com';
const CATALOG = [
  { id:'huracan', name:'Huracán Black', tag:'Skeleton racing watch. Watch the mechanism move.', price:9800, file:'assets/roger_dubuis_lamborghini_huracan_black_by_sdc.glb', rot:[0,0,0] },
  { id:'verde',   name:'Verde Chrono',  tag:'Green-dialled chronograph with three sub-dials.',  price:2400, file:'assets/watch__luxury_wristwatch_3d_model.glb', rot:[0,0,0] },
  { id:'chief',   name:'Mega Chief',    tag:'Oversized, bold, impossible to miss.',             price:320,  file:'assets/reloj_disel_mega_chief.glb', rot:[0,0,0] },
  { id:'ermes',   name:'Ermes',         tag:'Clean lines for every day.',                       price:1450, file:'assets/reloj_ermes.glb', rot:[0,0,0] },
];
const $ = s => document.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const money = n => '$' + n.toLocaleString('en-US');

/* ---------- Chapters (one per watch) ---------- */
CATALOG.forEach((c,i)=>{ const s=document.createElement('section'); s.id='c'+i; s.className='panelSec chap'+(i%2===0?'':' right');
  s.innerHTML=`<div class="copy panel"><h2>${c.name}</h2><p class="lead">${c.tag}</p><p class="price">${money(c.price)}</p><button class="btn add" data-i="${i}">Add to cart</button><p class="note" hidden>3D preview unavailable for this watch.</p></div>`;
  $('#chapters').append(s); });

/* ---------- Cart (builds a mailto order request) ---------- */
const cart=[];
function renderCart(){ $('#cartCount').textContent=cart.length; const ul=$('#cartList'); ul.innerHTML='';
  cart.forEach((id,i)=>{ const c=CATALOG.find(x=>x.id===id), li=document.createElement('li'); li.innerHTML=`<span>${c.name} — ${money(c.price)}</span>`;
    const b=document.createElement('button'); b.textContent='Remove'; b.setAttribute('aria-label','Remove '+c.name); b.onclick=()=>{cart.splice(i,1);renderCart()}; li.append(b); ul.append(li); });
  const total=cart.reduce((s,id)=>s+CATALOG.find(x=>x.id===id).price,0); $('#cartTotal').textContent=money(total);
  const a=$('#sendOrder'); a.setAttribute('aria-disabled',cart.length?'false':'true');
  const body='I would like to order:\n'+cart.map(id=>'- '+CATALOG.find(x=>x.id===id).name).join('\n')+'\n\nTotal: '+money(total)+'\n\nName:\nShipping address:';
  a.href='mailto:'+ORDER_EMAIL+'?subject='+encodeURIComponent('Order request')+'&body='+encodeURIComponent(body); }
const drawer=$('#drawer'); let lastFocus;
const openCart=()=>{lastFocus=document.activeElement;drawer.hidden=false;$('#closeCart').focus()}, closeCart=()=>{drawer.hidden=true;lastFocus&&lastFocus.focus()};
$('#cartBtn').onclick=openCart; $('#openCart2').onclick=openCart; $('#closeCart').onclick=closeCart;
addEventListener('keydown',e=>{if(e.key==='Escape'&&!drawer.hidden)closeCart()});
document.querySelectorAll('.add').forEach(b=>b.onclick=()=>{ cart.push(CATALOG[+b.dataset.i].id); renderCart(); gsap.fromTo('#cartCount',{scale:1.8},{scale:1,duration:.4,ease:'back.out(3)'}); });
renderCart();

/* ---------- Renderer ---------- */
let renderer; try{ renderer=new THREE.WebGLRenderer({canvas:$('#gl'),antialias:false,alpha:true,powerPreference:'high-performance'}); }catch(e){}
if(!renderer){ document.body.classList.add('nogl','x'); fallback(); throw new Error('WebGL unavailable'); }
let dpr=Math.min(devicePixelRatio,1); renderer.setPixelRatio(dpr); renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(32,1,.1,60); camera.position.set(0,0,7);
scene.add(new THREE.HemisphereLight(0xbfe9ff,0x3a1850,1.2));
const key=new THREE.DirectionalLight(0xffffff,2.6); key.position.set(3,4,5); scene.add(key);
const rim=new THREE.DirectionalLight(0xff2e88,2.4); rim.position.set(-4,2,-3); scene.add(rim);

/* ---------- Toon + outline ---------- */
const ramp=new THREE.DataTexture(new Uint8Array([60,140,210,255]),4,1,THREE.RedFormat); ramp.minFilter=ramp.magFilter=THREE.NearestFilter; ramp.needsUpdate=true;
const outlineMat=new THREE.ShaderMaterial({side:THREE.BackSide,uniforms:{uT:{value:.014}},
  vertexShader:`uniform float uT;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vec3 n=normalize(normalMatrix*normal);mv.xyz+=n*uT;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`void main(){gl_FragColor=vec4(.04,.035,.08,1.);}`});
const hulls=[], matCache=new Map(), shrunk=new Set();
function shrink(t,max=1024){ if(!t||shrunk.has(t)) return t; shrunk.add(t); const im=t.image; if(!im||!im.width||im.width<=max&&im.height<=max) return t;
  const r=max/Math.max(im.width,im.height), cv=document.createElement('canvas'); cv.width=Math.max(1,Math.round(im.width*r)); cv.height=Math.max(1,Math.round(im.height*r));
  cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height); t.image=cv; t.anisotropy=1; t.needsUpdate=true; return t; }
function toonify(root){ const meshes=[]; root.traverse(o=>{if(o.isMesh)meshes.push(o)});
  meshes.forEach(o=>{ const old=Array.isArray(o.material)?o.material[0]:o.material, glass=old.transparent||old.opacity<1||(old.transmission||0)>0;
    let mat=matCache.get(old); if(!mat){ mat=new THREE.MeshToonMaterial({color:old.color||0xffffff,map:shrink(old.map)||null,emissive:old.emissive||0,emissiveMap:shrink(old.emissiveMap)||null,gradientMap:ramp,transparent:glass,opacity:glass?.35:1,side:old.side,alphaTest:old.alphaTest||0,depthWrite:!glass}); matCache.set(old,mat); }
    o.material=mat;
    if(!glass&&!o.isSkinnedMesh){ const h=new THREE.Mesh(o.geometry,outlineMat); h.renderOrder=-1; h.visible=outlines; hulls.push(h); o.add(h); } }); }

/* ---------- Load all four GLBs ---------- */
const loader=new GLTFLoader(), models=CATALOG.map(()=>null), mixers=[];
const anim={ts:.12};
function load(i){ const c=CATALOG[i]; return new Promise((res,rej)=>loader.load(c.file,g=>{
  toonify(g.scene); const box=new THREE.Box3().setFromObject(g.scene), size=box.getSize(new THREE.Vector3()), s=2.6/Math.max(size.x,size.y,size.z);
  g.scene.scale.setScalar(s); const b2=new THREE.Box3().setFromObject(g.scene); g.scene.position.sub(b2.getCenter(new THREE.Vector3()));
  const inner=new THREE.Group(); inner.add(g.scene); inner.rotation.set(...c.rot); const pivot=new THREE.Group(); pivot.add(inner);
  pivot.scale.setScalar(.0001); pivot.visible=false; scene.add(pivot); models[i]=pivot;
  if(g.animations.length){ const m=new THREE.AnimationMixer(g.scene); g.animations.forEach(a=>m.clipAction(a).play()); mixers.push({m,i}); }
  res(pivot); },undefined,rej)); }
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function loadRest(){ await wait(1500); for(let i=1;i<CATALOG.length;i++){ await new Promise(r=>(window.requestIdleCallback||setTimeout)(r)); try{await load(i); await wait(600)}catch(e){ document.querySelectorAll('.note')[i].hidden=false; } } }

/* ---------- Layout, input, scroll ---------- */
let outlines=true;
const S={t:0,px:0,py:0}, L={x:1.9,y:0,s:1,wide:true}; let introRunning=true, centers=[], secs=[], yawDrag=0, focus=0;
function layout(){ const w=innerWidth,h=innerHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
  L.wide=w/h>1.1; L.x=L.wide?1.9:0; L.y=L.wide?0:1.2; L.s=L.wide?1:.78;
  secs=['#c0','#c1','#c2','#c3','#order'].map(s=>$(s)); centers=secs.map(e=>e.offsetTop+e.offsetHeight/2); ScrollTrigger.refresh(); }
addEventListener('resize',layout); document.fonts?.ready.then(()=>models[0]&&layout());
addEventListener('pointermove',e=>{S.px=e.clientX/innerWidth-.5;S.py=e.clientY/innerHeight-.5});
let drag=null; addEventListener('pointerdown',e=>{if(!e.target.closest('button,a,aside'))drag=e.clientX}); addEventListener('pointerup',()=>drag=null);
addEventListener('pointermove',e=>{if(drag!==null){yawDrag+=(e.clientX-drag)*.01;drag=e.clientX}});
ScrollTrigger.create({start:0,end:'max',onUpdate:()=>S.t=scrollY/innerHeight});
const sm=(a,b,x)=>{x=Math.min(1,Math.max(0,(x-a)/(b-a)));return x*x*(3-2*x)}, lerp=(a,b,t)=>a+(b-a)*t;

/* ---------- Intro: Huracán mechanism creeps, then races, then slides aside ---------- */
let tlRef;
function finish(){ introRunning=false; document.body.classList.remove('intro'); $('#skip')?.remove(); anim.ts=1;
  gsap.set(['.nav','.hero .copy > *'],{opacity:1,clearProps:'transform'}); layout(); }
function intro(){ const m=models[0]; m.visible=true; m.position.set(0,0,0); m.scale.setScalar(1.45); m.rotation.set(.1,0,0); camera.position.z=6.4;
  const tl=gsap.timeline({onComplete:finish}); tlRef=tl; gsap.set('.hero .copy > *',{y:20});
  tl.to(anim,{ts:.6,duration:1.6,ease:'power1.in'})
    .to(anim,{ts:14,duration:2.2,ease:'power3.in'})
    .to(m.rotation,{y:-.35,duration:2.2,ease:'power2.in'},'<')
    .to(camera.position,{z:5.4,duration:2.2,ease:'power2.in'},'<')
    .addLabel('hit')
    .set('.burst',{opacity:1})
    .fromTo('.burst',{scale:0,rotate:-20},{scale:1,rotate:-8,duration:.35,ease:'back.out(3)'},'hit')
    .to('.burst',{opacity:0,scale:1.25,duration:.4,delay:.3},'hit')
    .to(anim,{ts:1,duration:.7,ease:'power4.out'},'hit')
    .to(m.position,{x:L.x,y:L.y,duration:1.1,ease:'power3.inOut'},'hit+=.1')
    .to(m.scale,{x:L.s,y:L.s,z:L.s,duration:1.1,ease:'power3.inOut'},'hit+=.1')
    .to(m.rotation,{y:-.5,x:.05,duration:1.1,ease:'power3.inOut'},'hit+=.1')
    .to(camera.position,{z:7,duration:1.1,ease:'power3.inOut'},'hit+=.1')
    .to('.nav',{opacity:1,duration:.4},'hit+=.5')
    .to('.hero .copy > *',{opacity:1,y:0,duration:.5,stagger:.12,ease:'power2.out'},'hit+=.5')
    .from('.hero h1 span',{x:-80,skewX:-20,duration:.5,stagger:.12,ease:'power3.out'},'hit+=.5'); }
$('#skip').onclick=()=>{ tlRef&&tlRef.kill(); gsap.set('.burst',{opacity:0}); camera.position.z=7; finish(); };

/* ---------- Loop: 30fps when idle, no render when nothing moves, gradual quality drop ---------- */
const clk=new THREE.Clock(); let acc=0,n=0,time=0,lastAct=performance.now(),lastRender=0,capFps=false,animating=true,lastBest=-1;
const act=()=>{lastAct=performance.now()}; addEventListener('scroll',act,{passive:true}); addEventListener('pointermove',act); addEventListener('pointerdown',act);
const glows=[...document.querySelectorAll('.glow')], ACCENT=['#ff7a1a','#1fd18a','#4d8dff','#d4b04c'], root=document.documentElement;
function tick(now){ const idle=now-lastAct>1500&&!introRunning;
  if(idle&&!animating) return; if((idle||capFps)&&now-lastRender<31) return; lastRender=now;
  const dt=Math.min(clk.getDelta(),.1); time+=dt; const vh=innerHeight, sc=scrollY+vh/2;
  mixers.forEach(({m,i})=>{ if(models[i].visible) m.update(dt*(i===0?anim.ts:.6)); });
  const pO=(centers[4]-sc)/vh, fin=1-sm(.25,.8,Math.abs(pO)); let best=0,bestV=-1;
  models.forEach((m,i)=>{ if(!m||(i===0&&introRunning)) return;
    const p=(centers[i]-sc)/vh; let v=1-sm(.3,.85,Math.abs(p)); if(i===0&&p>0) v=1; v=Math.max(v,fin); if(v>bestV&&fin<.5){bestV=v;best=i;}
    glows[i]&&(glows[i].style.opacity=(v*.6).toFixed(2));
    const side=(i%2===0?1:-1)*L.x; let x=side, y=L.y-(1-v)*1.4, s=L.s*v, ry=(i===0?-.5+S.t*1:-.5+p*1.5)+S.px*.35+(i===best?yawDrag:0), rx=.08+S.py*.25;
    const lx=L.wide?(i-1.5)*1.45:((i%2)-.5)*1.5, ly=L.wide?.55:1.9-Math.floor(i/2)*1.4, ls=L.wide?.55:.42;
    x=lerp(x,lx,fin); y=lerp(y,ly,fin); s=lerp(s,ls,fin); ry=lerp(ry,time*.6+i,fin);
    m.visible=v>.01; m.position.set(x,y,0); m.scale.setScalar(Math.max(.0001,s)); m.rotation.set(rx,ry,0); });
  if(best!==lastBest&&fin<.5){ lastBest=best; root.style.setProperty('--accent',ACCENT[best]); }
  animating=!!(models[0]&&models[0].visible)||fin>.05;
  renderer.render(scene,camera);
  if(!idle&&!capFps&&++n>=60){ if(acc/n>.028){ if(dpr>.7){dpr=Math.max(.6,dpr-.15);renderer.setPixelRatio(dpr);renderer.setSize(innerWidth,innerHeight,false);} else if(outlines){outlines=false;hulls.forEach(h=>h.visible=false);} else capFps=true; } acc=n=0; }
  else if(!idle&&!capFps) acc+=dt; }
document.addEventListener('visibilitychange',()=>renderer.setAnimationLoop(document.hidden?null:tick));

function fallback(){ document.body.classList.remove('intro'); $('#load')?.remove(); $('#skip')?.remove(); gsap.set(['.nav','.hero .copy > *'],{opacity:1}); }

/* ---------- Start: wait for the hero model only ---------- */
layout();
try{ await load(0); }catch(e){ $('#load').textContent='3D model failed to load — the shop still works.'; fallback(); throw e; }
$('#load').classList.add('off'); renderer.setAnimationLoop(tick); layout();
if(reduce){ const m=models[0]; m.visible=true; finish(); } else intro();
loadRest();
