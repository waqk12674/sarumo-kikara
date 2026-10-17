<script>
const MONKEY_DATA=__MONKEYS__;
(function(){
const boot=document.getElementById('boot');
if(!window.Matter){boot.textContent='物理エンジンを読み込めませんでした。再読み込みしてください。';return;}
const {Engine,Bodies,Body,Composite,Constraint,Events,Vertices,Vector}=Matter;

/* ---------- 定数 ---------- */
const W=420,TRUNK_X=210,GROUND_Y=1900,TOP_Y=196,LT=GROUND_Y-TOP_Y;
const CANOPY={x0:-40,x1:460,y0:120,y1:680};   // 最初に映す範囲（木の上のほう）
const SUMI='#3D3833',KINARI='#F6F0E2',SHU='#B5655A',USUZUMI='#7A7068';
const CAT_G=1,CAT_T=2,CAT_M=4;
const FONT='"Shippori Mincho B1","Hiragino Mincho ProN","Yu Mincho",serif';
const ink=a=>`rgba(61,54,48,${a})`;
const DT=1/60;
const GRAB_GAP=26;   // 木の上で、ほかのサルの手と手のあいだに空ける距離（サルの大きさ倍率をかける）
const BASE_CLEAR=22;   // 枝の付け根から、この長さまではつかめない（幹の中心まわり）
const FAT_BASE=0.003,FAT_LOAD=0.009;   // 疲れのたまり方（1秒あたり）。握力は 1/(1+疲れ) 倍になる

/* サルの種類：元絵から切り出した白黒の絵。points は手・足・しっぽ（grab=つかむ、hang=つかまれる） */
const TYPES=MONKEY_DATA.map(d=>{
  const img=new Image();img.src=d.src;
  return{name:d.name,img,d,tint:null};
});
/* サルの大きさ（木に対する倍率）。絵・当たり判定・手足の位置をまとめて拡大する */
let SZ=1;
function applyScale(k){
  SZ=k;
  for(const t of TYPES){
    const d=t.d,hull=d.hull.map(([x,y])=>({x:x*k,y:y*k})),c=Vertices.centre(hull);
    t.w=d.w*k;t.h=d.h*k;t.c=c;
    t.verts=hull.map(p=>({x:p.x-c.x,y:p.y-c.y}));
    t.points=d.points.map(p=>({x:p.x*k-c.x,y:p.y*k-c.y,kind:p.kind,grab:p.grab,hang:p.hang}));
    t.head={x:d.head[0]*k-c.x,y:d.head[1]*k-c.y};
  }
}
const REF=TYPES.find(t=>t.name==='ニホンザル')||TYPES[0];

/* 枝：幹の高さ y から先端 tip へ。t は太さ */
const BR_DEF=[
  /* 長さに強弱：長い枝はよくしなり、極端に短い枝は1匹がやっと */
  {y:600,tip:[-5,565],t:17},    // 左・長い（約218）
  {y:560,tip:[270,546],t:13},   // 右・短い（約62）
  {y:480,tip:[140,463],t:13},   // 左・短い（約72）
  {y:445,tip:[425,400],t:15},   // 右・長い（約220）
  {y:360,tip:[72,322],t:12},    // 左・ふつう（約143）
  {y:315,tip:[258,302],t:11},   // 右・極端に短い（約50）
  {y:252,tip:[18,212],t:10},    // 左・長くて細い（約196）
  {y:230,tip:[322,192],t:10}    // 右・ふつう（約118）
].map(b=>{const s=(GROUND_Y-b.y)/LT,dx=b.tip[0]-TRUNK_X,dy=b.tip[1]-b.y;return{...b,s,len:Math.hypot(dx,dy),phi:Math.atan2(dy,dx),sg:Math.sign(dx)}});
const TRUNK_SEGS=16;

/* ---------- 設定 ---------- */
const settings={input:'drag',grab:'auto',funbari:1,range:16,grip:5,wind:1,fatigue:1,size:1.5};
try{const s=JSON.parse(localStorage.getItem('saru-wa6-settings')||'null');if(s)Object.assign(settings,s);}catch(e){}
function saveSettings(){try{localStorage.setItem('saru-wa6-settings',JSON.stringify(settings));}catch(e){}}

/* ---------- 便利関数 ---------- */
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function closest(p,a,b){const dx=b.x-a.x,dy=b.y-a.y;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return{x:a.x+dx*t,y:a.y+dy*t}}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const now=()=>performance.now();
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}

/* ---------- 状態 ---------- */
let engine,world,ground,pieces=[],M0=1;
let tr={U:0,Uv:0,d:[],dv:[]};             // 幹のしなり（てっぺんの横ずれ）と、枝ごとのしなり角
let monkeys=[],held=null,active=null,state='play',canSpawnAt=0,nextType=null,lastType=null;
let pops=[],shake=0,snaps=[],lastSnap=0,overAt=0,craneX=210,dragging=false,trail=[],lift=0,placedSinceHint=0;
let score=0,rings=[];
let wind={w:0,dir:1,start:0,dur:0,str:0,next:Infinity,warned:false,phase:0},firstGrabAt=0,simT=0,finalCount=0;

const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
let dpr=1,view={s:1,ox:0,oy:0},frame0={top:0,avail:H0()},cam={s:0,cx:W/2,cy:(CANOPY.y0+CANOPY.y1)/2};
function H0(){return 600}

/* ---------- 木（根っこは固定。幹も枝もしなる） ---------- */
const trunkPt=s=>({x:TRUNK_X+tr.U*s*s,y:GROUND_Y-LT*s});
const trunkTilt=s=>Math.atan2(2*tr.U*s,LT);           // 鉛直からの傾き（右に倒れると正）
const trunkW=s=>36-26*s;
function branchEnds(j){
  const b=BR_DEF[j],a=trunkPt(b.s),ang=b.phi+trunkTilt(b.s)+tr.d[j]*b.sg;
  return{a,b:{x:a.x+Math.cos(ang)*b.len,y:a.y+Math.sin(ang)*b.len},ang};
}
function buildTree(){
  pieces=[];
  for(let k=0;k<TRUNK_SEGS;k++){
    const s0=k/TRUNK_SEGS,s1=(k+1)/TRUNK_SEGS,t=trunkW((s0+s1)/2);
    pieces.push({kind:'trunk',s0,s1,t,body:Bodies.rectangle(0,0,LT/TRUNK_SEGS,t,{isStatic:true,friction:0.9,label:'tree',collisionFilter:{category:CAT_T,mask:CAT_M}})});
  }
  BR_DEF.forEach((b,j)=>pieces.push({kind:'branch',j,t:b.t,body:Bodies.rectangle(0,0,b.len,b.t,{isStatic:true,friction:0.9,label:'tree',collisionFilter:{category:CAT_T,mask:CAT_M}})}));
  Composite.add(world,pieces.map(p=>p.body));
  placeTree();
}
function placeTree(){
  for(const p of pieces){
    let a,b;
    if(p.kind==='trunk'){a=trunkPt(p.s0);b=trunkPt(p.s1);}
    else{const e=branchEnds(p.j);a=e.a;b=e.b;}
    p.a=a;p.b=b;
    Body.setPosition(p.body,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    Body.setAngle(p.body,Math.atan2(b.y-a.y,b.x-a.x));
  }
}

/* ---------- 世界をつくる ---------- */
function init(){
  applyScale(settings.size);
  engine=Engine.create();
  engine.positionIterations=10;engine.velocityIterations=8;engine.constraintIterations=8;
  world=engine.world;
  ground=Bodies.rectangle(TRUNK_X,GROUND_Y+40,8000,80,{isStatic:true,label:'ground',friction:1,collisionFilter:{category:CAT_G,mask:CAT_M}});
  Composite.add(world,ground);
  tr={U:0,Uv:0,d:BR_DEF.map(()=>0),dv:BR_DEF.map(()=>0)};
  buildTree();
  M0=Bodies.fromVertices(0,0,[REF.verts]).mass;

  Events.on(engine,'collisionStart',e=>{
    if(state!=='play')return;
    for(const p of e.pairs){
      const A=p.bodyA.parent,B=p.bodyB.parent;
      const m=A===ground?B.monkey:B===ground?A.monkey:null;
      if(m&&!m.held){gameOver(m);break;}
    }
  });

  monkeys=[];held=null;active=null;state='play';canSpawnAt=now()+200;simT=0;
  pops=[];rings=[];score=0;snaps=[];lastSnap=0;fallPlan=null;fallShot=null;shake=0;dragging=false;placedSinceHint=0;firstGrabAt=0;
  wind={w:0,dir:1,start:0,dur:0,str:0,next:Infinity,warned:false,phase:0};setWindBanner('');
  lastType=null;nextType=randType();updateNext();updateHud();showHint();
  document.getElementById('result').hidden=true;
  cam.s=0;fitCam(true);
}

function randType(){let t;do{t=TYPES[Math.floor(Math.random()*TYPES.length)]}while(t===lastType&&TYPES.length>1);lastType=t;return t}

function makeMonkey(type,x,y){
  const b=Bodies.fromVertices(x,y,[type.verts],{friction:0.6,frictionAir:0.03,restitution:0,label:'monkey',
    collisionFilter:{category:CAT_M,mask:CAT_G}});   /* サル同士・木とはぶつからない（ぶら下がりの引っぱり合いで震えるのを防ぐ） */
  const shift=Vertices.centre(type.verts);
  Body.setPosition(b,{x,y});
  const n=type.points.length;
  const m={type,body:b,shift,grabs:Array(n).fill(null),hangBy:Array(n).fill(null),held:false,still:0,releasedAt:0,
    vis:{sweat:0,flush:0,shake:0},strain:0,fatigue:0,ratio:1,stam:Array(n).fill(1),numb:Array(n).fill(0)};
  b.monkey=m;return m;
}
const localPt=(m,lp)=>Vector.rotate(Vector.sub(lp,m.shift),m.body.angle);
const pointW=(m,i)=>Vector.add(m.body.position,localPt(m,m.type.points[i]));

/* ---------- 引っかけ ---------- */
function descendants(m,set=new Set()){
  for(const c of m.hangBy)if(c&&!set.has(c.mon)){set.add(c.mon);descendants(c.mon,set);}
  return set;
}
function findTarget(m,i,range){
  const hp=pointW(m,i);let best=null,bd=range;
  /* 2本目の手（やしっぽ）は、1本目と同じもの（木なら木、サルならそのサル）しかつかまない */
  const first=m.grabs.find(Boolean);
  const onlyMon=first&&first.kind==='mon'?first.mon:null,onlyTree=first&&first.kind==='tree';
  /* 2本目は、1本目のつかみ位置から「手と手の間かく」に近い場所だけ（体がねじれないように） */
  let fit=()=>true;
  if(first){
    const fi=m.grabs.indexOf(first),span=dist(m.type.points[fi],m.type.points[i]),fp=grabWorld(m,fi);
    fit=q=>Math.abs(dist(q,fp)-span)<=6;
  }
  if(onlyTree){
    const fi=m.grabs.indexOf(first),q=Vector.add(grabWorld(m,fi),Vector.sub(hp,pointW(m,fi)));
    const pc=first.piece,c0=closest(q,pc.a,pc.b);
    if(dist(q,c0)-pc.t/2<=8&&dist(hp,q)<range&&dist(c0,pc.a)>=BASE_CLEAR)return{kind:'tree',piece:pc,point:q,second:true};
    return null;
  }
  if(!onlyMon){
    /* 木の上で、ほかのサルの手がすでにある場所はつかめない。少しずらして空いているところを探す */
    const taken=[];
    for(const o of monkeys){if(o===m)continue;o.grabs.forEach(g=>{if(g&&g.kind==='tree')taken.push(Vector.add(g.piece.body.position,Vector.rotate(g.local,g.piece.body.angle)))})}
    const free=q=>taken.every(t=>dist(t,q)>=GRAB_GAP*SZ);
    for(const p of pieces){
      if(p.kind!=='branch')continue;   /* 幹はつかめない。枝だけ */
      const q0=closest(hp,p.a,p.b),len=dist(p.a,p.b),ux=(p.b.x-p.a.x)/len,uy=(p.b.y-p.a.y)/len;
      for(let k=0;k<=12;k++){
        const off=(k%2?1:-1)*Math.ceil(k/2)*4;
        const t=(q0.x-p.a.x)*ux+(q0.y-p.a.y)*uy+off;if(t<BASE_CLEAR||t>len)continue;   /* 幹のそばの付け根はつかめない */
        const q={x:p.a.x+ux*t,y:p.a.y+uy*t},d=dist(hp,q)-p.t/2;
        if(d>=bd)continue;
        if(!free(q)||!fit(q))continue;
        bd=d;best={kind:'tree',piece:p,point:q};break;
      }
    }
  }
  const below=descendants(m);
  for(const o of monkeys){
    if(o===m||o.held||below.has(o)||onlyTree||(onlyMon&&o!==onlyMon))continue;
    o.type.points.forEach((pt,j)=>{
      if(!pt.hang||o.hangBy[j]||o.grabs[j])return;
      const fp=pointW(o,j);const d=dist(hp,fp);
      if(d<bd&&fit(fp)){bd=d;best={kind:'mon',mon:o,pi:j,point:fp}}
    });
  }
  return best;
}
/* つかんでいる先の、いまの位置 */
function grabWorld(m,i){
  const g=m.grabs[i];
  if(g.kind==='tree')return Vector.add(g.piece.body.position,Vector.rotate(g.local,g.piece.body.angle));
  return pointW(g.mon,g.pi);
}
/* 鎖の何番目か：枝につかまっていれば1、そのサルの下なら2…（木につながっていなければ0） */
function chainDepth(m,seen=new Set()){
  if(seen.has(m))return 0;seen.add(m);
  let best=0;
  for(const g of m.grabs){
    if(!g)continue;
    if(g.kind==='tree')return 1;
    const d=chainDepth(g.mon,seen);if(d&&(!best||d+1<best))best=d+1;
  }
  return best;
}
/* 新しく連れてきたサルが、はじめて木につながったときだけ点を入れる（置きなおしでは入らない） */
function scoreNew(m){
  if(m.scored||state!=='play')return;
  const k=chainDepth(m);if(!k)return;
  m.scored=true;score+=k;
  const p=m.body.position,top=p.y-m.type.h*0.55;
  if(k>=2){
    rings.push({x:p.x,y:top+m.type.h*0.2,t:now(),k});
    pop(p.x,top-6*SZ,`鎖 ×${k}`,30+Math.min(k,8)*2,true,SHU);
    pop(p.x+26*SZ,top-38*SZ,`+${k}`,26,false,SHU);
    shake=Math.min(14,4+k*1.5);
  }else pop(p.x,top-10*SZ,'+1',22,false,SUMI);
  bumpScore(k>=2);
}
const scoreEl=document.getElementById('cnt');
function bumpScore(big){scoreEl.textContent=score;const box=scoreEl.closest('.cnt');box.classList.remove('bump','bumpBig');void box.offsetWidth;box.classList.add(big?'bumpBig':'bump');}
function grab(m,i,t){
  const pA=localPt(m,m.type.points[i]);
  let c,g;
  if(t.kind==='tree'){
    const bd=t.piece.body,local=Vector.rotate(Vector.sub(t.point,bd.position),-bd.angle);
    c=Constraint.create({bodyA:m.body,pointA:pA,bodyB:bd,pointB:Vector.rotate(local,bd.angle),length:0,stiffness:0.6,damping:0.25});
    g={c,kind:'tree',piece:t.piece,local};
  }else{
    const o=t.mon;
    c=Constraint.create({bodyA:m.body,pointA:pA,bodyB:o.body,pointB:localPt(o,o.type.points[t.pi]),length:0,stiffness:0.6,damping:0.25});
    g={c,kind:'mon',mon:o,pi:t.pi};
    o.hangBy[t.pi]={mon:m,i};
  }
  g.stamina=m.stam[i];g.strain=0;g.at=simT;
  if(window.__dbg)(window.__ev=window.__ev||[]).push(['grab',+simT.toFixed(2),monkeys.indexOf(m),i,t.kind,t.kind==='mon'?monkeys.indexOf(t.mon):(t.piece.kind+(t.piece.j??'')),Math.round(t.point.x),Math.round(t.point.y)]);
  c.length=Math.max(0.5,dist(pointW(m,i),t.point));   /* いきなり引き寄せず、たぐり寄せる（長さ0は物理が暴れるので0.5で止める） */
  if(m.grabs.some(Boolean)){c.stiffness=0.05;c.damping=0.05;}   /* 2本目は添えるだけ（両手の引っぱり合いを防ぐ） */
  Composite.add(world,c);m.grabs[i]=g;
  scoreNew(m);
  Body.setVelocity(m.body,Vector.mult(m.body.velocity,0.25));Body.setAngularVelocity(m.body,m.body.angularVelocity*0.25);
  if(!firstGrabAt){firstGrabAt=simT;wind.next=simT+11+Math.random()*4;}
}
function release(m,i,quiet){
  const g=m.grabs[i];if(!g)return;
  const wasOnTree=!quiet&&attached(m);   /* 木につながっていたサルが手をはなしたときだけ、落ちはじめを撮る */
  if(window.__dbg)(window.__ev=window.__ev||[]).push(['rel',+simT.toFixed(2),monkeys.indexOf(m),i,+(g.strain||0).toFixed(2),+(g.stamina||0).toFixed(2)]);
  Composite.remove(world,g.c);
  if(g.kind==='mon'&&g.mon.hangBy[g.pi]&&g.mon.hangBy[g.pi].mon===m)g.mon.hangBy[g.pi]=null;
  m.stam[i]=Math.max(0,g.stamina);
  if(g.stamina<=0.05)m.numb[i]=simT+3;   /* 力尽きた手は3秒しびれてつかめない */
  m.grabs[i]=null;
  if(!quiet){const p=pointW(m,i);pop(p.x,p.y-10,m.grabs.some(Boolean)?'ずるっ':'あっ',24);}
  if(wasOnTree&&!m.grabs.some(Boolean))planFallShot(m,g.kind==='mon'?g.mon:null,pointW(m,i));
}
function tryGrabAll(m){
  let got=0;
  m.type.points.forEach((pt,i)=>{
    if(!pt.grab||m.grabs[i]||m.hangBy[i]||simT<m.numb[i])return;
    const t=findTarget(m,i,settings.range);
    if(t){grab(m,i,t);got++;}
  });
  return got;
}
function autoGrab(){
  for(const m of monkeys){
    if(m.held)continue;
    if(m.grabs.some(Boolean)&&simT-(m.lastLetGo||-9)<0.6)continue;
    const got=tryGrabAll(m);
    if(got&&now()-m.releasedAt<4000&&!m.popped){m.popped=true;pop(m.body.position.x,m.body.position.y-60,'ひょい',22);noteGrab();}
  }
}
function tapGrab(m,silent){
  if(tryGrabAll(m)){
    pop(m.body.position.x,m.body.position.y-62,'ガシッ',36,true);shake=8;noteGrab();
    if(m===active){active=null;canSpawnAt=now()+300;}
    return true;
  }
  if(!silent)pop(m.body.position.x+24,m.body.position.y-36,'スカッ',18);
  return false;
}
function noteGrab(){placedSinceHint++;if(placedSinceHint>=3)document.getElementById('hint').classList.add('fade');}

/* ---------- 出す・はなす ---------- */
function spawnHeld(x,y){
  const m=makeMonkey(nextType,x,y);
  Body.setStatic(m.body,true);m.body.isSensor=true;m.held=true;
  held=m;monkeys.push(m);Composite.add(world,m.body);
  nextType=randType();updateNext();
}
function releaseHeld(){
  const m=held;if(!m)return;held=null;m.held=false;
  const dragLike=settings.input==='drag'||m.picked;m.picked=false;
  Body.setStatic(m.body,false);m.body.isSensor=false;Body.setAngle(m.body,0);Body.setAngularVelocity(m.body,0);
  let v={x:0,y:0};
  if(dragLike&&trail.length>1){
    const f=trail[0],l=trail[trail.length-1];const dt=(l.t-f.t)/16.67;
    if(dt>0.3){v={x:(l.x-f.x)/dt,y:(l.y-f.y)/dt};const sp=Math.hypot(v.x,v.y);if(sp>10)v={x:v.x/sp*10,y:v.y/sp*10};}
  }
  Body.setVelocity(m.body,v);
  m.releasedAt=now();m.still=0;
  if(settings.grab==='tap'){
    if(dragLike&&tapGrab(m,true)){canSpawnAt=now()+250;}
    else active=m;
  }else canSpawnAt=now()+(settings.input==='drop'?550:300);
}
function dropHeldSilently(){
  if(!held)return;
  Composite.remove(world,held.body);monkeys=monkeys.filter(m=>m!==held);
  nextType=held.type;held=null;updateNext();
}

/* ---------- 重さ・握力・しなり ---------- */
/* サルごとに「自分の重さ＋ぶら下がっている仲間の重さ」を、つかんでいる点の数で割って各点にかける */
function computeLoads(){
  const memo=new Map(),stack=new Set();
  const own=m=>{const k=m.body.mass/M0;return{x:wind.w*k*0.9,y:k}};
  function carried(m){
    if(memo.has(m))return memo.get(m);
    if(stack.has(m))return{x:0,y:0};
    stack.add(m);
    const v=own(m);
    for(const h of m.hangBy){
      if(!h)continue;
      const c=h.mon,n=c.grabs.filter(Boolean).length||1,cv=carried(c);
      v.x+=cv.x/n;v.y+=cv.y/n;
    }
    stack.delete(m);memo.set(m,v);return v;
  }
  const treeLoads=[];
  for(const m of monkeys){
    if(m.held)continue;
    const n=m.grabs.filter(Boolean).length;if(!n)continue;
    const v=carried(m),dyn=1+0.1*Math.min(m.body.speed,6);
    m.ratio=v.y/(m.body.mass/M0);   /* 自分の体重の何倍を支えているか */
    m.grabs.forEach((g,i)=>{
      if(!g)return;
      const lx=v.x/n,ly=v.y/n;
      g.load=Math.hypot(lx,ly)*dyn;
      if(g.kind==='tree')treeLoads.push({g,p:pointW(m,i),lx,ly});
    });
  }
  return treeLoads;
}
function stepTree(treeLoads){
  let M=wind.w*900;                         // 木そのものが受ける風
  const tau=BR_DEF.map(()=>0);
  for(const L of treeLoads){
    M+=L.ly*(L.p.x-TRUNK_X)+L.lx*(GROUND_Y-L.p.y)*0.35;
    if(L.g.piece.kind==='branch'){
      const j=L.g.piece.j,b=L.g.piece.a;
      tau[j]+=((L.p.x-b.x)*L.ly-(L.p.y-b.y)*L.lx)*BR_DEF[j].sg;
    }
  }
  const f=1/settings.funbari;
  const Ueq=clamp(M*0.065*f,-280,280);
  const wT=2.0,zT=0.45;
  tr.Uv+=(wT*wT*(Ueq-tr.U)-2*zT*wT*tr.Uv)*DT;tr.U+=tr.Uv*DT;
  BR_DEF.forEach((b,j)=>{
    const eq=clamp(tau[j]*0.0006*Math.pow(14/b.t,2)*f,-0.35,1.15);
    const w=5,z=0.5;
    tr.dv[j]+=(w*w*(eq-tr.d[j])-2*z*w*tr.dv[j])*DT;tr.d[j]+=tr.dv[j]*DT;
  });
  placeTree();
  for(const m of monkeys)for(const g of m.grabs)if(g&&g.kind==='tree'){g.c.pointB=Vector.rotate(g.local,g.piece.body.angle);g.c.angleB=g.piece.body.angle;}
}
/* 握力：負担が限界をこえると体力がへり、尽きたら手をはなす */
function stepGrip(){
  for(const m of monkeys){
    if(m.held){m.strain=0;continue;}
    let worst=0,minSt=1,count=0;
    m.grabs.forEach((g,i)=>{
      if(!g){m.stam[i]=Math.min(1,m.stam[i]+0.08*DT);return;}
      count++;
      const pt=m.type.points[i];
      const S=settings.grip*(m.body.mass/M0)*(pt.kind==='tail'?0.8:1)/(1+m.fatigue);
      let steep=1;
      if(g.kind==='tree'){
        if(g.piece.kind==='branch')steep=1+1.6*Math.max(0,Math.abs(Math.sin(g.piece.body.angle))-0.4);
        else steep=1.25;
      }
      g.strain=(g.load||0)*steep/S;
      if(g.strain>1)g.stamina-=(0.22+(g.strain-1)*1.1)*DT;
      else if(g.strain<0.85)g.stamina=Math.min(1,g.stamina+0.12*DT);
      worst=Math.max(worst,g.strain);minSt=Math.min(minSt,g.stamina);
    });
    m.strain=worst;
    /* 疲れ：ぶら下がっているだけで少しずつ、重いものを支えるほど速くたまる。置きなおしても戻らない */
    if(count&&state==='play')m.fatigue+=(FAT_BASE+FAT_LOAD*Math.max(0,(m.ratio||1)-1))*settings.fatigue*DT;
    if(state==='play'&&count){
      m.grabs.forEach((g,i)=>{
        if(!g)return;
        const torn=simT-g.at>0.3&&dist(pointW(m,i),grabWorld(m,i))>45*SZ;
        if(g.stamina<=0||g.strain>1.9||torn){release(m,i);m.lastLetGo=simT;}
      });
    }
    const v=m.vis;
    const tSweat=count?clamp((worst-0.6)/0.4,0,1):v.sweat*0.98;
    const tFlush=count?clamp(Math.max((worst-0.85)/0.35,(1-minSt)*1.2),0,1):v.flush*0.97;
    v.sweat+=(tSweat-v.sweat)*0.08;v.flush+=(tFlush-v.flush)*0.06;v.shake=count&&worst>1?Math.min(1,(worst-1)*2+0.3):0;
  }
}
/* 風：ときどき横から吹く。来る前に知らせる */
function stepWind(){
  wind.phase+=wind.w*DT;
  if(settings.wind<=0||state!=='play'){wind.w*=0.95;if(state!=='play')setWindBanner('');return;}
  if(!wind.dur&&simT>=wind.next-1.4&&!wind.warned){
    wind.warned=true;wind.dir=Math.random()<0.5?-1:1;
    setWindBanner(wind.dir>0?'風 →':'← 風');
  }
  if(!wind.dur&&simT>=wind.next){wind.start=simT;wind.dur=2.6+Math.random()*1.8;wind.str=(0.16+Math.random()*0.12)*settings.wind;}
  if(wind.dur){
    const t=(simT-wind.start)/wind.dur;
    if(t>=1){wind.w=0;wind.dur=0;wind.warned=false;wind.next=simT+8+Math.random()*8;setWindBanner('');}
    else wind.w=wind.dir*wind.str*Math.pow(Math.sin(Math.PI*t),2)*(1+0.25*Math.sin(simT*9));
  }
  if(wind.w){
    const g=engine.gravity;
    for(const m of monkeys){if(m.held)continue;Body.applyForce(m.body,m.body.position,{x:wind.w*m.body.mass*g.scale*g.y,y:0});}
  }
}
const windEl=document.getElementById('wind');
function setWindBanner(t){if(t){windEl.textContent=t;windEl.classList.remove('off');}else windEl.classList.add('off');}

/* ---------- 進行 ---------- */
/* 重なったサルは、ゆっくり左右に押し合ってずれる（つながっている相手とは押し合わない）。
   ぶつかり判定は使わず、弱い力だけにする（強いと前の暴れが戻る） */
const SEP_K=0.35;
function separate(){
  const ms=monkeys.filter(m=>!m.held);if(ms.length<2)return;
  const g=engine.gravity,linked=new Set();
  for(const m of ms)for(const gr of m.grabs)if(gr&&gr.kind==='mon'){linked.add(m.body.id+'-'+gr.mon.body.id);linked.add(gr.mon.body.id+'-'+m.body.id);}
  for(let i=0;i<ms.length;i++)for(let j=i+1;j<ms.length;j++){
    const a=ms[i],b=ms[j];
    if(linked.has(a.body.id+'-'+b.body.id))continue;
    const dx=b.body.position.x-a.body.position.x,dy=b.body.position.y-a.body.position.y;
    const want=(a.type.w+b.type.w)*0.42;
    if(Math.abs(dy)>(a.type.h+b.type.h)*0.35)continue;
    const d=Math.abs(dx);if(d>=want)continue;
    const dir=dx>0.5?1:dx<-0.5?-1:(a.body.id<b.body.id?1:-1);
    const k=SEP_K*(1-d/want)*g.scale*g.y;
    Body.applyForce(a.body,a.body.position,{x:-dir*k*a.body.mass,y:0});
    Body.applyForce(b.body,b.body.position,{x:dir*k*b.body.mass,y:0});
  }
}
function step(){
  simT+=DT;
  const loads=computeLoads();
  stepTree(loads);
  stepWind();
  stepGrip();
  separate();
  if(fallPlan&&simT>=fallPlan.at)takeFallShot();
  for(const m of monkeys)for(const g of m.grabs)if(g&&g.c.length>0)g.c.length=Math.max(0.5,g.c.length-1.2);
  Engine.update(engine,1000/60);
  for(const m of monkeys){
    if(m.held)continue;const b=m.body;
    if(Math.abs(b.angularVelocity)>0.12)Body.setAngularVelocity(b,Math.sign(b.angularVelocity)*0.12);
    if(b.speed>14)Body.setVelocity(b,Vector.mult(b.velocity,14/b.speed));
  }
  if(state==='play'){
    if(settings.grab==='auto')autoGrab();
    else if(active){
      active.still=active.body.speed<0.3?active.still+1:0;
      if(active.still>45||now()-active.releasedAt>5000){active=null;canSpawnAt=now()+200;}
    }
  }
}
function gameOver(m){
  finalCount=groups().onTree;
  state='over';overAt=now();engine.timing.timeScale=0.35;
  if(held)dropHeldSilently();
  dragging=false;
  pop(m.body.position.x,m.body.position.y-50,'ぽとっ',40,true);
}

/* ---------- 集団の計算 ---------- */
function groups(){
  const ms=monkeys.filter(m=>!m.held);const idx=new Map(ms.map((m,i)=>[m,i]));
  const par=ms.map((_,i)=>i);const f=i=>par[i]===i?i:(par[i]=f(par[i]));
  const adj=ms.map(()=>[]);const roots=new Set();
  ms.forEach((m,i)=>m.grabs.forEach(g=>{
    if(!g)return;
    if(g.kind==='tree'){roots.add(i);return;}
    const j=idx.get(g.mon);if(j===undefined)return;
    par[f(i)]=f(j);adj[i].push(j);adj[j].push(i);
  }));
  const cnt=new Map();ms.forEach((_,i)=>{const r=f(i);cnt.set(r,(cnt.get(r)||0)+1)});
  let bestR=-1,bestN=0;cnt.forEach((n,r)=>{if(n>bestN){bestN=n;bestR=r}});
  const members=bestN?ms.filter((_,i)=>f(i)===bestR):[];
  const seen=new Set(roots),q=[...roots];
  while(q.length){const i=q.pop();for(const j of adj[i])if(!seen.has(j)){seen.add(j);q.push(j)}}
  const ac=new Map();seen.forEach(i=>{const r=f(i);ac.set(r,(ac.get(r)||0)+1)});
  let bestOn=0;ac.forEach(n=>{if(n>bestOn)bestOn=n});
  return{best:bestN,bestOn,members,onTree:seen.size,onTreeSet:new Set([...seen].map(i=>ms[i]))};
}
function updateHud(){const g=groups();scoreEl.textContent=score;document.getElementById('cntSub').textContent=g.bestOn;return g;}

/* 0.3秒ごとに、木の全体と全部のサルが入る少し引いた絵を撮っておく。落ちたら崩れる前のいちばん大きい群れの瞬間を使う */
function contentBox(includeHeld,margin){
  let x0=CANOPY.x0+tr.U,x1=CANOPY.x1+tr.U,y0=CANOPY.y0,y1=CANOPY.y1;
  for(const m of monkeys){
    if(m.held&&!includeHeld)continue;
    const p=m.body.position;if(p.y>GROUND_Y+200)continue;
    x0=Math.min(x0,p.x-62*SZ);x1=Math.max(x1,p.x+62*SZ);y0=Math.min(y0,p.y-90*SZ);y1=Math.max(y1,p.y+72*SZ);
  }
  if(y1>GROUND_Y-420)y1=GROUND_Y+70;
  const mx=(x1-x0)*margin,my=(y1-y0)*margin;
  return{x0:x0-mx,x1:x1+mx,y0:y0-my,y1:y1+my};
}
const SNAP_W=738,SNAP_H=1312;
/* つながっている仲間（手・足・しっぽでつながったサル）をたどる */
function componentOf(start,exclude){
  const seen=new Set([start]),q=[start];
  while(q.length){
    const m=q.pop();
    const nb=[...m.grabs.filter(g=>g&&g.kind==='mon').map(g=>g.mon),...m.hangBy.filter(Boolean).map(h=>h.mon)];
    for(const o of nb)if(!o.held&&!seen.has(o)&&!(exclude&&exclude.has(o))){seen.add(o);q.push(o);}
  }
  return [...seen];
}
function largestAttached(){
  let best=[];const done=new Set();
  for(const m of monkeys){
    if(m.held||done.has(m)||!m.grabs.some(g=>g&&g.kind==='tree'))continue;
    const c=componentOf(m);c.forEach(x=>done.add(x));
    if(c.length>best.length)best=c;
  }
  return best;
}
/* 群れに寄って撮る。fallers があれば、落ちはじめの頭と手がふちにぎりぎり入るようにする */
function frameShot(members,fallers,extra){
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  for(const m of members){
    const p=m.body.position,t=m.type;
    x0=Math.min(x0,p.x-t.w*0.6-8);x1=Math.max(x1,p.x+t.w*0.6+8);
    y0=Math.min(y0,p.y-t.h*0.72);y1=Math.max(y1,p.y+t.h*0.55);
  }
  if(!members.length){
    if(fallers&&fallers.length){const p=fallers[0].body.position;x0=p.x-80;x1=p.x+80;y0=p.y-200;y1=p.y;}
    else{x0=CANOPY.x0;x1=CANOPY.x1;y0=CANOPY.y0;y1=CANOPY.y1;}   /* まだ誰もいない：木の上のほう */
  }
  if(extra)for(const q of extra){x0=Math.min(x0,q.x-30);x1=Math.max(x1,q.x+30);y0=Math.min(y0,q.y-40);}
  if(fallers&&fallers.length){
    const f=fallers.reduce((a,b)=>a.body.position.y<b.body.position.y?a:b);   /* いちばん上で落ちているサル */
    const p=f.body.position,t=f.type,top=p.y-t.h*0.6;
    x0=Math.min(x0,p.x-t.w*0.5);x1=Math.max(x1,p.x+t.w*0.5);
    y1=Math.max(y1,top+t.h*0.38);   /* 頭と手のあたりまで */
  }
  const mx=(x1-x0)*0.08;x0-=mx;x1+=mx;y0-=(y1-y0)*0.05;
  let w=x1-x0,h=y1-y0;const ar=SNAP_W/SNAP_H;
  h=Math.max(h,280);
  if(w/h<ar)w=h*ar;else h=w/ar;
  const cx=(x0+x1)/2;
  /* 下端をそろえる（落ちはじめを下のふちぎりぎりに置く） */
  return{cx,cy:y1-h/2,s:SNAP_W/w};
}
function renderShot(fr,canvas){
  canvas.width=SNAP_W;canvas.height=SNAP_H;
  drawScene(canvas.getContext('2d'),SNAP_W,SNAP_H,fr.s,SNAP_W/2-fr.cx*fr.s,SNAP_H/2-fr.cy*fr.s,{fx:false,leaves:false,popScale:1.7/fr.s});
}
function takeSnap(){
  const g=groups();
  const rec=snaps.length>=10?snaps.shift():{canvas:document.createElement('canvas')};
  renderShot(frameShot(monkeys.filter(x=>!x.held&&attached(x)),null),rec.canvas);   /* 木にいるサル全員 */
  rec.size=g.bestOn;rec.onTree=g.onTree;rec.t=now();snaps.push(rec);
}
/* 手がはなれて落ちはじめた瞬間（0.3秒後）を撮っておく */
let fallPlan=null,fallShot=null;
function planFallShot(m,from,hand){
  if(state!=='play')return;
  fallPlan={at:simT+0.3,m,from,hand};
}
function attached(x){return componentOf(x).some(y=>y.grabs.some(g=>g&&g.kind==='tree'));}
function takeFallShot(){
  const {m,from,hand}=fallPlan;fallPlan=null;
  const fallers=componentOf(m).filter(x=>!attached(x));
  const fs=new Set(fallers);
  /* 木に残っているサルは全員入れる */
  const others=monkeys.filter(x=>!x.held&&!fs.has(x)&&attached(x));
  const rest=from&&!from.held&&attached(from);
  const canvas=document.createElement('canvas');
  if(rest){
    /* 群れの一部が落ちた：木に残ったサル全員に寄り、落ちはじめを下のふちにぎりぎり入れる */
    renderShot(frameShot(others,fallers.length?fallers:[m]),canvas);
  }else{
    /* 群れごと落ちた：落ちはじめた群れ全体、ほかのサル、さっきまでつかんでいた場所を入れる */
    renderShot(frameShot([...(fallers.length?fallers:[m]),...others],null,hand?[hand]:null),canvas);
  }
  fallShot={canvas,t:simT};
}

/* ---------- 描画：淡い水彩と墨 ---------- */
function makePaper(){
  const t=document.createElement('canvas');t.width=t.height=256;const g=t.getContext('2d');const r=rng(7);
  for(let i=0;i<1400;i++){g.fillStyle=`rgba(${r()<.5?'120,104,84':'255,252,244'},${0.05+r()*0.07})`;g.fillRect(r()*256,r()*256,1+r()*1.5,1+r()*1.5);}
  g.lineCap='round';
  for(let i=0;i<70;i++){
    const x=r()*256,y=r()*256,l=8+r()*26,a=r()*Math.PI*2;
    g.strokeStyle=`rgba(130,112,92,${0.05+r()*0.06})`;g.lineWidth=0.6+r()*0.6;
    g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+Math.cos(a+0.6)*l*.5,y+Math.sin(a+0.6)*l*.5,x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();
  }
  return t;
}
const PAPER_TILE=makePaper();
function blob(c,x,y,r,rgb,a){
  const g=c.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,`rgba(${rgb},${a})`);g.addColorStop(0.62,`rgba(${rgb},${a*0.62})`);g.addColorStop(1,`rgba(${rgb},0)`);
  c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
}
const CLOUDS=(()=>{const r=rng(5);return Array.from({length:16},()=>({x:-500+r()*1420,y:-300+r()*2000,r:90+r()*160,a:0.18+r()*0.14}))})();
function drawBackdrop(c){
  for(const k of CLOUDS){blob(c,k.x,k.y,k.r,'252,250,244',k.a);blob(c,k.x+k.r*.5,k.y+k.r*.15,k.r*.7,'226,226,218',k.a*0.6);}
  const r=rng(11),G=GROUND_Y;
  c.fillStyle='rgba(206,212,196,.75)';c.beginPath();c.moveTo(-2400,G);
  for(let x=-2400;x<=2820;x+=30)c.lineTo(x,G-300-110*Math.sin(x/260)-50*Math.sin(x/91+1)-36*Math.cos(x/430));
  c.lineTo(2820,G);c.fill();
  c.fillStyle='rgba(190,199,176,.6)';c.beginPath();c.moveTo(-2400,G);
  for(let x=-2400;x<=2820;x+=30)c.lineTo(x,G-140-60*Math.sin(x/180+2)-26*Math.sin(x/63));
  c.lineTo(2820,G);c.fill();
  const hz=c.createLinearGradient(0,G-200,0,G-20);hz.addColorStop(0,'rgba(244,240,229,0)');hz.addColorStop(1,'rgba(244,240,229,.85)');
  c.fillStyle=hz;c.fillRect(-2400,G-200,5220,190);
  const gg=c.createLinearGradient(0,G-14,0,G+160);gg.addColorStop(0,'rgba(214,206,174,0)');gg.addColorStop(0.12,'rgba(214,206,174,1)');gg.addColorStop(1,'rgba(200,190,156,1)');
  c.fillStyle=gg;c.fillRect(-2400,G-14,5220,2400);
  for(let i=0;i<22;i++)blob(c,-700+r()*1820,G+14+r()*50,40+r()*50,'176,166,128',0.22);
  c.lineCap='round';
  for(let i=0;i<60;i++){
    const x=-700+r()*1820,y=G+4+r()*30,h=7+r()*9;
    c.strokeStyle=ink(0.22+r()*0.2);c.lineWidth=1.2;
    c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x-1,y-h*.6,x-3,y-h);c.moveTo(x+2,y);c.quadraticCurveTo(x+3,y-h*.5,x+6,y-h*.8);c.stroke();
  }
  c.strokeStyle=ink(0.35);c.lineWidth=1.6;c.beginPath();
  for(let x=-2400;x<2820;x+=60){c.moveTo(x,G-1+r()*2);c.lineTo(x+38+r()*16,G-1+r()*2);}
  c.stroke();
}
function drawTree(c){
  const r=rng(23);
  const sway=Math.sin(simT*1.7)*0.6+wind.w*14;
  const ends=BR_DEF.map((b,j)=>branchEnds(j));
  // 葉むら（にじみ）
  const leaves=[];
  ends.forEach((e,j)=>leaves.push([e.b.x+sway*.4,e.b.y,BR_DEF[j].t*2.6]));
  const tp=trunkPt(1);leaves.push([tp.x+sway*.5,tp.y,50],[tp.x-40+sway*.5,tp.y+26,34],[tp.x+40+sway*.5,tp.y+20,34]);
  for(const [x,y,R] of leaves){
    blob(c,x,y,R*1.6,'170,186,150',0.55);
    for(let k=0;k<6;k++)blob(c,x+(r()-.5)*R*1.4,y+(r()-.5)*R,R*(.5+r()*.4),'132,152,114',0.45);
  }
  // 枝：しなると、根元から先へ曲がる
  ends.forEach((e,j)=>{
    const b=BR_DEF[j],a=e.a,t=e.b,L=b.len;
    const bend=tr.d[j]*b.sg*0.45,a0=e.ang-bend;
    const cp={x:a.x+Math.cos(a0)*L*.55,y:a.y+Math.sin(a0)*L*.55};
    const w0=b.t*1.05,w1=b.t*0.48;
    const n0={x:-Math.sin(a0),y:Math.cos(a0)},n1={x:-Math.sin(e.ang),y:Math.cos(e.ang)};
    c.beginPath();
    c.moveTo(a.x+n0.x*w0/2,a.y+n0.y*w0/2);
    c.quadraticCurveTo(cp.x+n0.x*(w0+w1)/4,cp.y+n0.y*(w0+w1)/4,t.x+n1.x*w1/2,t.y+n1.y*w1/2);
    c.lineTo(t.x-n1.x*w1/2,t.y-n1.y*w1/2);
    c.quadraticCurveTo(cp.x-n0.x*(w0+w1)/4,cp.y-n0.y*(w0+w1)/4,a.x-n0.x*w0/2,a.y-n0.y*w0/2);
    c.closePath();
    c.fillStyle='rgba(176,156,128,.95)';c.fill();c.strokeStyle=ink(0.8);c.lineWidth=1.8;c.stroke();
    c.strokeStyle=ink(0.25);c.lineWidth=1;c.beginPath();
    for(let k=0;k<3;k++){const u=0.2+k*0.22,v=u+0.1;
      c.moveTo(a.x+(t.x-a.x)*u+n0.x*b.t*.15,a.y+(t.y-a.y)*u+n0.y*b.t*.15);c.lineTo(a.x+(t.x-a.x)*v,a.y+(t.y-a.y)*v);}
    c.stroke();
  });
  // 幹（しなりに沿って先細り）
  const N=40,L=[],R=[];
  for(let k=0;k<=N;k++){
    const s=k/N,p=trunkPt(s),ang=trunkTilt(s),w=trunkW(s)/2*(k===0?1.25:1);
    L.push({x:p.x-Math.cos(ang)*w,y:p.y-Math.sin(ang)*w});R.push({x:p.x+Math.cos(ang)*w,y:p.y+Math.sin(ang)*w});
  }
  c.beginPath();c.moveTo(L[0].x-8,L[0].y+3);L.forEach(p=>c.lineTo(p.x,p.y));for(let k=N;k>=0;k--)c.lineTo(R[k].x,R[k].y);c.lineTo(R[0].x+8,R[0].y+3);c.closePath();
  const tg=c.createLinearGradient(TRUNK_X-18,0,TRUNK_X+18,0);tg.addColorStop(0,'rgba(150,130,104,.96)');tg.addColorStop(.55,'rgba(186,168,140,.96)');tg.addColorStop(1,'rgba(140,120,96,.96)');
  c.fillStyle=tg;c.fill();c.strokeStyle=ink(0.85);c.lineWidth=2.4;c.stroke();
  c.lineCap='round';
  for(let k=2;k<N-1;k++){
    if(r()<0.35)continue;
    const s=k/N+r()*0.02,p=trunkPt(s),w=trunkW(s),x=p.x+(r()-.5)*w*.6;
    c.strokeStyle=ink(0.2+r()*0.25);c.lineWidth=0.9+r()*1.2;
    c.beginPath();c.moveTo(x-w*.18,p.y);c.quadraticCurveTo(x,p.y-6,x+w*.15,p.y-11);c.stroke();
  }
  const b0=trunkPt(0);
  c.strokeStyle=ink(0.5);c.lineWidth=1.8;c.beginPath();c.moveTo(b0.x-26,b0.y+3);c.quadraticCurveTo(b0.x-42,b0.y+7,b0.x-58,b0.y+5);c.moveTo(b0.x+26,b0.y+3);c.quadraticCurveTo(b0.x+40,b0.y+8,b0.x+56,b0.y+6);c.stroke();
  for(const [x,y,R] of leaves){
    c.fillStyle=ink(0.28);
    for(let k=0;k<5;k++){c.beginPath();c.ellipse(x+(r()-.5)*R*1.3,y+(r()-.5)*R*.9,1.6+r()*1.4,0.9,r()*3,0,Math.PI*2);c.fill();}
  }
}
/* 紅潮用：絵の明るいところ（顔や肌）ほど赤くなる版をつくっておく */
function tinted(t){
  if(t.tint)return t.tint;
  const k=2,cvs=document.createElement('canvas');cvs.width=Math.ceil(t.w*k*2.5);cvs.height=Math.ceil(t.h*k*2.5);
  const g=cvs.getContext('2d');g.drawImage(t.img,0,0,cvs.width,cvs.height);
  g.globalCompositeOperation='multiply';g.fillStyle='#E8907E';g.fillRect(0,0,cvs.width,cvs.height);
  g.globalCompositeOperation='destination-in';g.drawImage(t.img,0,0,cvs.width,cvs.height);
  t.tint=cvs;return cvs;
}
function silhouette(t){
  if(t.sil)return t.sil;
  const k=2,cvs=document.createElement('canvas');cvs.width=Math.ceil(t.w*k*2.5);cvs.height=Math.ceil(t.h*k*2.5);
  const g=cvs.getContext('2d');g.drawImage(t.img,0,0,cvs.width,cvs.height);
  g.globalCompositeOperation='source-in';g.fillStyle=SHU;g.fillRect(0,0,cvs.width,cvs.height);
  t.sil=cvs;return cvs;
}
function drawMonkey(c,m){
  const t=m.type;if(!t.img.complete)return;
  const v=m.vis,tn=simT;
  const jx=v.shake?Math.sin(tn*70)*0.9*v.shake:0;
  c.save();c.translate(m.body.position.x+jx,m.body.position.y);c.rotate(m.body.angle);
  const ox=-t.c.x-m.shift.x,oy=-t.c.y-m.shift.y;
  if(m.glow){
    const r=2.6/Math.max(0.35,view.s),sil=silhouette(t);
    c.globalAlpha=0.75+0.25*Math.sin(now()/120);
    for(let k=0;k<8;k++){const a=k*Math.PI/4;c.drawImage(sil,ox+Math.cos(a)*r,oy+Math.sin(a)*r,t.w,t.h);}
    c.globalAlpha=1;
  }
  c.drawImage(t.img,ox,oy,t.w,t.h);
  if(v.flush>0.03){c.globalAlpha=Math.min(0.9,v.flush);c.drawImage(tinted(t),ox,oy,t.w,t.h);c.globalAlpha=1;}
  if(v.sweat>0.05){
    const hx=t.head.x-m.shift.x,hy=t.head.y-m.shift.y;
    const n=v.sweat>0.6?4:v.sweat>0.3?3:2;
    for(let k=0;k<n;k++){
      const side=k%2?1:-1,ph=(tn*1.4+k*0.37)%1;
      const a=-Math.PI/2+side*(0.7+0.25*(k>>1));
      const rr=(16+ph*18)*SZ;
      const x=hx+Math.cos(a)*rr,y=hy+Math.sin(a)*rr+ph*8;
      c.globalAlpha=Math.min(1,v.sweat*1.5)*(1-ph*0.6);
      drawDrop(c,x,y,(4.8+v.sweat*1.2)*SZ,side*0.6);
    }
    c.globalAlpha=1;
  }
  c.restore();
}
function drawDrop(c,x,y,s,rot){
  c.save();c.translate(x,y);c.rotate(rot);
  c.beginPath();c.moveTo(0,-s*1.8);c.quadraticCurveTo(s*1.1,-s*0.2,s,s*0.4);c.arc(0,s*0.4,s,0,Math.PI);c.quadraticCurveTo(-s*1.1,-s*0.2,0,-s*1.8);c.closePath();
  c.fillStyle='rgba(214,230,234,.95)';c.fill();c.strokeStyle=ink(0.85);c.lineWidth=1.1;c.stroke();
  c.restore();
}
/* 舞う葉と風の筋（画面座標） */
const LEAVES=Array.from({length:10},(_,i)=>{const r=rng(100+i);return{x:r(),y:r(),s:5+r()*5,v:0.02+r()*0.03,ph:r()*6,c:['216,156,134','226,180,140','204,145,122','200,184,140'][i%4]}});
const STREAKS=Array.from({length:14},(_,i)=>{const r=rng(300+i);return{seed:300+i,l:0.07+r()*0.13,v:0.55+r()*0.5,o:r()}});
function drawAir(c,cw,ch,k){
  const tn=simT;
  for(const l of LEAVES){
    const y=((l.y+tn*l.v)%1.1-0.05)*ch;
    let x=(l.x+0.04*Math.sin(tn*0.7+l.ph)+tn*0.008+wind.phase*0.9)%1;if(x<0)x+=1;x*=cw;
    c.save();c.translate(x,y);c.rotate(Math.sin(tn*1.3+l.ph)*1.2+wind.w*4);c.scale(1,0.55+0.45*Math.sin(tn*2+l.ph));
    c.fillStyle=`rgba(${l.c},.55)`;c.beginPath();c.ellipse(0,0,l.s*k,l.s*0.55*k,0,0,Math.PI*2);c.fill();c.restore();
  }
  const a=Math.min(1,Math.abs(wind.w)/0.2);
  if(a>0.02){
    c.lineCap='round';
    for(const s of STREAKS){
      const cyc=s.o+tn*s.v,lap=Math.floor(cyc),r=rng(s.seed*97+lap);
      let p=(cyc-lap)*1.4-0.2;if(wind.dir<0)p=1-p;
      const x=p*cw,y=(0.08+r()*0.84)*ch,len=s.l*cw*(0.7+r()*0.6),d=wind.dir;
      const g=c.createLinearGradient(x-len/2*d,0,x+len/2*d,0);
      g.addColorStop(0,ink(0));g.addColorStop(0.6,ink(0.38*a));g.addColorStop(1,ink(0));
      c.strokeStyle=g;c.lineWidth=(1+r()*1.2)*k;
      c.beginPath();c.moveTo(x-len/2*d,y+3*k);c.quadraticCurveTo(x,y-5*k,x+len/2*d,y);c.stroke();
    }
  }
}
function drawScene(c,cw,ch,s,ox,oy,opt){
  c.setTransform(1,0,0,1,0,0);
  const sky=c.createLinearGradient(0,0,0,ch);sky.addColorStop(0,'#E7E5DA');sky.addColorStop(0.55,'#F2EDE1');sky.addColorStop(1,'#EFE8D8');
  c.fillStyle=sky;c.fillRect(0,0,cw,ch);
  blob(c,cw*0.18,ch*0.12,cw*0.5,'226,206,190',0.35);
  blob(c,cw*0.85,ch*0.3,cw*0.45,'206,218,214',0.35);
  c.setTransform(s,0,0,s,ox,oy);
  c.lineCap='round';c.lineJoin='round';
  drawBackdrop(c);
  if(opt.crane){
    const y=craneY()-62;
    c.strokeStyle=ink(0.45);c.lineWidth=1.6/view.s;c.setLineDash([1/view.s,7/view.s]);
    const vb=visibleBox();c.beginPath();c.moveTo(vb.x0+16/view.s,y);c.lineTo(vb.x1-16/view.s,y);c.stroke();c.setLineDash([]);
  }
  drawTree(c);
  const sm=opt.fx?selected():null;
  for(const m of monkeys){if(m.held&&!opt.held)continue;if(m===sm)continue;m.glow=false;drawMonkey(c,m)}
  if(sm){sm.glow=true;drawMonkey(c,sm);sm.glow=false;
    if(sel.cands.length>1){
      const u=1/Math.max(0.35,view.s),p=sm.body.position;
      c.save();c.translate(p.x,p.y-sm.type.h*0.62-10*u);c.scale(u,u);
      const label=`${sel.idx+1}/${sel.cands.length}・押しなおしで次`;
      c.font=`700 13px ${FONT}`;c.textAlign='center';c.textBaseline='middle';
      const w=c.measureText(label).width+18;
      c.fillStyle='rgba(246,240,226,.95)';c.strokeStyle='rgba(181,101,90,.9)';c.lineWidth=1.5;
      c.beginPath();c.roundRect?c.roundRect(-w/2,-12,w,24,12):c.rect(-w/2,-12,w,24);c.fill();c.stroke();
      c.fillStyle=SUMI;c.fillText(label,0,1);c.restore();
    }
  }
  if(opt.fx)drawFx(c);
  else if(opt.popScale)drawPops(c,opt.popScale);
  c.setTransform(1,0,0,1,0,0);
  if(opt.leaves!==false)drawAir(c,cw,ch,Math.max(1,cw/700));
  const pat=c.createPattern(PAPER_TILE,'repeat');c.fillStyle=pat;c.fillRect(0,0,cw,ch);
}
function drawFx(c){
  const tn=now(),u=1/Math.max(0.35,view.s);
  const m=held||(settings.grab==='tap'?active:null);
  if(m&&state==='play'){
    m.type.points.forEach((pt,i)=>{
      if(!pt.grab||m.grabs[i]||m.hangBy[i])return;
      const hp=pointW(m,i),t=findTarget(m,i,settings.range);
      c.beginPath();c.arc(hp.x,hp.y,settings.range,0,Math.PI*2);
      if(t){c.fillStyle='rgba(181,101,90,.22)';c.fill();c.strokeStyle='rgba(181,101,90,.9)';c.lineWidth=1.6*u;c.stroke();
        c.beginPath();c.moveTo(hp.x,hp.y);c.lineTo(t.point.x,t.point.y);c.lineWidth=2.4*u;c.stroke();
        c.beginPath();c.arc(t.point.x,t.point.y,3.2*u,0,Math.PI*2);c.fillStyle=SHU;c.fill();}
      else{c.setLineDash([2*u,4*u]);c.strokeStyle=ink(0.45);c.lineWidth=1.2*u;c.stroke();c.setLineDash([])}
    });
    if(settings.input==='drop'&&held){c.setLineDash([1*u,8*u]);c.beginPath();c.moveTo(held.body.position.x,held.body.position.y+40);c.lineTo(held.body.position.x,GROUND_Y);c.strokeStyle=ink(0.3);c.lineWidth=1.6*u;c.stroke();c.setLineDash([])}
  }
  drawRings(c,u);
  drawPops(c,u);
}
function drawRings(c,u){
  const tn=now();
  rings=rings.filter(r=>tn-r.t<750);
  for(const r of rings){
    const a=(tn-r.t)/750,e=1-Math.pow(1-a,3),R=(18+60*e+r.k*4)*u;
    c.save();c.globalAlpha=1-a;
    c.strokeStyle=SHU;c.lineWidth=(6-4*a)*u;
    c.beginPath();c.arc(r.x,r.y,R,0,Math.PI*2);c.stroke();
    c.lineCap='round';c.lineWidth=(4-2.5*a)*u;
    const n=8+Math.min(r.k,6)*2;
    for(let k=0;k<n;k++){const an=k/n*Math.PI*2+r.k;c.beginPath();c.moveTo(r.x+Math.cos(an)*R*1.1,r.y+Math.sin(an)*R*1.1);c.lineTo(r.x+Math.cos(an)*R*1.45,r.y+Math.sin(an)*R*1.45);c.stroke();}
    c.restore();
  }
}
function drawPops(c,u){
  const tn=now();
  pops=pops.filter(p=>tn-p.t<p.life);
  for(const p of pops){
    const a=(tn-p.t)/p.life;
    c.save();c.globalAlpha=a>0.65?1-(a-0.65)/0.35:1;
    const sc=(p.big?1+0.45*Math.max(0,1-a*5):1)*u;
    c.translate(p.x,p.y-24*a*u);c.scale(sc,sc);c.rotate(p.big?-0.06:0);
    c.font=`800 ${p.size}px ${FONT}`;c.textAlign='center';c.textBaseline='middle';
    c.lineJoin='round';c.lineWidth=p.size*0.26;c.strokeStyle=KINARI;c.strokeText(p.text,0,0);c.fillStyle=p.color||SUMI;c.fillText(p.text,0,0);
    c.restore();
  }
}
function pop(x,y,text,size,big,color){pops.push({x,y,text,size,big,color:color||SUMI,t:now(),life:big?1100:850})}

/* ---------- 画面サイズとカメラ ---------- */
const hud=document.getElementById('hud');
function resize(){
  dpr=Math.min(2,window.devicePixelRatio||1);
  const w=innerWidth,h=innerHeight;
  cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);
  const top=hud.getBoundingClientRect().bottom+2,bottom=52;
  document.documentElement.style.setProperty('--hud-h',(top-2)+'px');
  frame0={top,avail:Math.max(200,h-top-bottom)};
  fitCam(true);
}
addEventListener('resize',resize);
/* 最初は木の上のほうだけ。鎖がのびたら、全体が入るまで引いていく */
function fitCam(snap){
  const b=contentBox(false,0.02);
  const ts=Math.min(innerWidth/(b.x1-b.x0),frame0.avail/(b.y1-b.y0));
  const tcx=(b.x0+b.x1)/2,tcy=(b.y0+b.y1)/2;
  if(snap||!cam.s){cam.s=ts;cam.cx=tcx;cam.cy=tcy;}
  else{const k=dragging?0.015:0.05;cam.s+=(ts-cam.s)*k;cam.cx+=(tcx-cam.cx)*k;cam.cy+=(tcy-cam.cy)*k;}
  view={s:cam.s,ox:innerWidth/2-cam.cx*cam.s,oy:frame0.top+frame0.avail/2-cam.cy*cam.s};
}
function visibleBox(){return{x0:-view.ox/view.s,x1:(innerWidth-view.ox)/view.s,y0:(frame0.top-view.oy)/view.s,y1:(frame0.top+frame0.avail-view.oy)/view.s}}
const craneY=()=>visibleBox().y0+80;
function toWorld(e){return{x:(e.clientX-view.ox)/view.s,y:(e.clientY-view.oy)/view.s}}
function clampHeld(p){const b=visibleBox();return{x:clamp(p.x,b.x0+30,b.x1-30),y:clamp(p.y,b.y0+60,Math.min(b.y1-40,GROUND_Y-80))}}

/* ---------- 入力 ---------- */
/* 押した場所にいるサルを、手前（あとから置いた・最後に動かした）から順に並べる */
function hitAll(p){
  const tol=14/Math.max(0.35,view.s),near=22/Math.max(0.35,view.s),out=[];
  for(let k=monkeys.length-1;k>=0;k--){
    const m=monkeys[k];if(m.held)continue;
    if(Vertices.contains(m.body.vertices,p)||m.type.points.some((pt,i)=>pt.grab&&dist(pointW(m,i),p)<tol)||dist(m.body.position,p)<near)out.push(m);
  }
  return out;
}
/* 選んでいるサル：押すと朱の縁で光る。動かさずに同じ場所を押しなおすと、下のサルに切り替わる */
let sel=null;            // {cands, idx, t, sx, sy}
let pending=null;        // 押したが、まだ動かしていない {m, p, sx, sy}
const SEL_KEEP=1800,MOVE_PX=7,SAME_PX=30;
const selected=()=>sel&&(pending||now()-sel.t<SEL_KEEP)?sel.cands[sel.idx]:null;
/* 置いたサルを持ち上げる。ぶら下がっている仲間はついてくる */
function pickUp(m,p){
  if(held&&!held.picked)dropHeldSilently();
  m.grabs.forEach((g,i)=>{if(g)release(m,i,true)});
  if(active===m)active=null;
  Body.setStatic(m.body,true);m.body.isSensor=true;m.held=true;m.picked=true;m.popped=true;
  held=m;dragging=true;lift=0;
  monkeys.splice(monkeys.indexOf(m),1);monkeys.push(m);   /* 手前に出す */
  m.pickOff=Vector.sub(m.body.position,p);
  trail=[{x:m.body.position.x,y:m.body.position.y,t:now()}];
  pop(m.body.position.x,m.body.position.y-60,'よいしょ',20);
}
cv.addEventListener('pointerdown',e=>{
  if(state!=='play')return;
  closeTune();
  try{cv.setPointerCapture(e.pointerId)}catch(_){}
  const p=toWorld(e);
  if(settings.grab==='tap'&&active){tapGrab(active,false);return;}
  if(held)return;
  const cands=hitAll(p);
  if(!cands.length){sel=null;return;}   /* 何もないところを押しても、サルは出ない（右上の札から連れてくる） */
  const same=sel&&now()-sel.t<SEL_KEEP&&Math.hypot(e.clientX-sel.sx,e.clientY-sel.sy)<SAME_PX&&sel.cands.length===cands.length&&cands.every(m=>sel.cands.includes(m));
  if(same)sel.idx=(sel.idx+1)%cands.length;
  else sel={cands,idx:0};
  sel.t=now();sel.sx=e.clientX;sel.sy=e.clientY;
  pending={m:sel.cands[sel.idx],p,sx:e.clientX,sy:e.clientY};
});
/* 右上の「つぎ」の札からドラッグして、サルを連れてくる */
const nextBox=document.getElementById('nextBox');
let fromBox=false;
nextBox.addEventListener('pointerdown',e=>{
  if(state!=='play'||held||now()<canSpawnAt)return;
  e.preventDefault();closeTune();
  try{nextBox.setPointerCapture(e.pointerId)}catch(_){}
  const p=toWorld(e);
  lift=e.pointerType==='touch'?56/view.s*0.9:0;
  if(settings.input==='drag'){
    const q=clampHeld({x:p.x,y:p.y-lift});spawnHeld(q.x,q.y);trail=[{x:q.x,y:q.y,t:now()}];
  }else{
    craneX=clampHeld(p).x;spawnHeld(craneX,craneY());
  }
  dragging=true;fromBox=true;nextBox.classList.add('pulling');
});
addEventListener('pointermove',e=>{
  if(pending&&state==='play'&&Math.hypot(e.clientX-pending.sx,e.clientY-pending.sy)>MOVE_PX){
    const pm=pending.m,pp=pending.p;pending=null;sel=null;
    if(monkeys.includes(pm)&&!pm.held)pickUp(pm,pp);
  }
  if(state!=='play'||!held)return;
  const p=toWorld(e);
  if(held.picked){
    if(!dragging)return;
    const q=clampHeld(Vector.add(p,held.pickOff));Body.setPosition(held.body,q);
    const tn=now();trail.push({x:q.x,y:q.y,t:tn});while(trail.length>2&&tn-trail[0].t>90)trail.shift();
  }else if(settings.input==='drag'){
    if(!dragging)return;
    const q=clampHeld({x:p.x,y:p.y-lift});Body.setPosition(held.body,q);
    const tn=now();trail.push({x:q.x,y:q.y,t:tn});while(trail.length>2&&tn-trail[0].t>90)trail.shift();
  }else if(dragging||e.pointerType==='mouse'){
    craneX=clampHeld(p).x;Body.setPosition(held.body,{x:craneX,y:craneY()});
  }
});
function overBox(e){const r=nextBox.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom}
function endPointer(e){
  nextBox.classList.remove('pulling');
  if(pending){pending=null;if(sel)sel.t=now();return;}   /* 動かさずに離した：選んだまま（もう一度押すと下のサルへ） */
  if(!dragging)return;dragging=false;
  const wasFromBox=fromBox;fromBox=false;
  if(!held||state!=='play')return;
  /* 札の上で離したら、連れてくるのをやめる */
  if(wasFromBox&&e&&e.type==='pointerup'&&overBox(e)){dropHeldSilently();return;}
  releaseHeld();
}
addEventListener('pointerup',endPointer);
addEventListener('pointercancel',endPointer);

/* ---------- UI ---------- */
const HINTS={
  'drag-auto':'右上の札からサルをひっぱってきて、はなす。<br>手やしっぽが枝・足・しっぽにふれると、ひっかかる。',
  'drag-tap':'右上の札からひっぱってきて、はなした瞬間にガシッ。<br>届かなければ、落ちている間にタップ。',
  'drop-auto':'右上の札からひっぱって、左右を決めてはなすと落ちる。<br>手やしっぽがふれると、ひっかかる。',
  'drop-tap':'右上の札からひっぱって、はなして落とす。<br>ここだと思ったらタップでガシッ。'
};
function showHint(){const h=document.getElementById('hint');h.innerHTML='サルの下にサルをつなげるほど高得点（鎖ボーナス）。<br>'+HINTS[settings.input+'-'+settings.grab]+'<br>ぶら下がると疲れる。置いたサルは持って置きなおせる。';h.classList.remove('fade');placedSinceHint=0;}
function syncButtons(){
  document.querySelectorAll('[data-input]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.input===settings.input)));
  document.querySelectorAll('[data-grab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.grab===settings.grab)));
}
document.querySelectorAll('[data-input]').forEach(b=>b.addEventListener('click',()=>{
  if(settings.input===b.dataset.input)return;
  dropHeldSilently();dragging=false;settings.input=b.dataset.input;saveSettings();syncButtons();showHint();
}));
document.querySelectorAll('[data-grab]').forEach(b=>b.addEventListener('click',()=>{
  if(settings.grab===b.dataset.grab)return;
  settings.grab=b.dataset.grab;active=null;saveSettings();syncButtons();showHint();
}));
document.getElementById('resetBtn').addEventListener('click',()=>{closeTune();init();});
const tune=document.getElementById('tune'),tuneBtn=document.getElementById('tuneBtn');
function closeTune(){tune.hidden=true;tuneBtn.setAttribute('aria-expanded','false');}
tuneBtn.addEventListener('click',()=>{tune.hidden=!tune.hidden;tuneBtn.setAttribute('aria-expanded',String(!tune.hidden));});
[['sFun','oFun','funbari',v=>v.toFixed(1)],['sRange','oRange','range',v=>String(v)],['sGrip','oGrip','grip',v=>v.toFixed(1)+'倍'],['sFat','oFat','fatigue',v=>v.toFixed(1)],['sSize','oSize','size',v=>v.toFixed(1)+'倍'],['sWind','oWind','wind',v=>v.toFixed(1)]].forEach(([id,oid,key,fmt])=>{
  const el=document.getElementById(id),out=document.getElementById(oid);
  el.value=settings[key];out.textContent=fmt(+settings[key]);
  el.addEventListener('input',()=>{settings[key]=+el.value;out.textContent=fmt(+el.value);saveSettings();});
});

const nextCv=document.getElementById('nextCv'),nctx=nextCv.getContext('2d');
function updateNext(){
  document.getElementById('nextName').textContent=nextType.name;
  const t=nextType;
  const draw=()=>{
    nctx.setTransform(1,0,0,1,0,0);nctx.clearRect(0,0,80,104);
    const k=Math.min(72/t.w,98/t.h);
    if(t.img.complete)nctx.drawImage(t.img,40-t.w*k/2,52-t.h*k/2,t.w*k,t.h*k);
  };
  if(t.img.complete)draw();else t.img.onload=draw;
}

/* ---------- 結果 ---------- */
let cardCanvas=null,resultText='';
async function finish(){
  state='result';engine.timing.timeScale=1;setWindBanner('');
  const placed=monkeys.filter(m=>!m.held).length;
  if(fallPlan)takeFallShot();
  if(!snaps.length)takeSnap();
  let best=snaps[0];for(const s of snaps)if(s.size>=best.size)best=s;
  if(fallShot&&simT-fallShot.t<8)best={canvas:fallShot.canvas,size:best.size};
  try{await Promise.all([document.fonts.load(`800 64px ${FONT}`,'サルも木から落ちぬん0123456789匹点スコア'),document.fonts.load(`700 40px ${FONT}`,'のこったサル落ちる直前のいちばん大きな群れ匹中#')]);}catch(_){}
  cardCanvas=buildCard(finalCount,placed,best);
  resultText=`サルも木から落ちぬん｜スコア ${score}点（いちばん大きな群れ ${best.size}匹／のこったサル ${finalCount}匹）`;
  document.getElementById('cardImg').src=cardCanvas.toDataURL('image/png');
  document.getElementById('shareNote').hidden=true;document.getElementById('copyField').hidden=true;
  document.getElementById('result').hidden=false;
}
function outlined(g,text,x,y,lw){g.lineJoin='round';g.lineWidth=lw;g.strokeStyle=KINARI;g.strokeText(text,x,y);g.fillStyle=SUMI;g.fillText(text,x,y);}
function vtext(g,text,x,y,size,step,lw){
  g.font=`800 ${size}px ${FONT}`;g.textAlign='center';
  [...text].forEach((ch,i)=>{
    const yy=y+i*step;
    if('ーー'.includes(ch)){g.save();g.translate(x,yy-size*0.35);g.rotate(Math.PI/2);outlined(g,ch,0,size*0.35,lw);g.restore();}
    else if('ゃゅょっャュョッ'.includes(ch))outlined(g,ch,x+size*0.12,yy-size*0.1,lw);
    else outlined(g,ch,x,yy,lw);
  });
}
function buildCard(n,total,best){
  const c=document.createElement('canvas');c.width=1080;c.height=1350;const g=c.getContext('2d');
  const bg=g.createLinearGradient(0,0,0,1350);bg.addColorStop(0,'#E8E4D8');bg.addColorStop(1,'#F1EBDD');g.fillStyle=bg;g.fillRect(0,0,1080,1350);
  blob(g,180,140,560,'226,206,190',0.35);blob(g,960,1200,520,'206,218,214',0.35);
  g.textBaseline='alphabetic';
  // 題字
  g.fillStyle=SHU;g.fillRect(84,62,190,8);
  g.font=`800 74px ${FONT}`;g.textAlign='left';outlined(g,'サルも木から落ちぬん',80,160,14);
  // 絵（縦長。木の全体）
  const fx=410,fy=220,fw=590,fh=1050;
  g.drawImage(best.canvas,fx,fy,fw,fh);g.lineWidth=3;g.strokeStyle='rgba(90,78,64,.7)';g.strokeRect(fx,fy,fw,fh);
  g.save();g.translate(fx+fw-92,fy+fh-92);g.rotate(-0.04);
  g.fillStyle='rgba(181,101,90,.88)';g.fillRect(0,0,66,66);
  g.fillStyle='rgba(246,240,226,.95)';g.font=`800 46px ${FONT}`;g.textAlign='center';g.fillText('猿',33,49);g.restore();
  // 左の欄：縦書き
  /* 主役：スコア */
  vtext(g,'スコア',335,300,52,58,10);
  const sz=String(score).length>=3?140:String(score).length===2?180:200;
  g.textAlign='center';g.font=`800 ${sz}px ${FONT}`;outlined(g,String(score),170,540,16);
  g.font=`800 64px ${FONT}`;outlined(g,'点',170,640,10);
  g.fillStyle='rgba(90,78,64,.45)';g.fillRect(96,720,250,2);
  /* 参考：群れと、のこったサル */
  g.textAlign='center';g.fillStyle=USUZUMI;g.font=`700 28px ${FONT}`;g.fillText('落ちる直前の',220,790);g.fillText('いちばん大きな群れ',220,826);
  g.font=`800 84px ${FONT}`;outlined(g,String(best.size),190,930,12);g.font=`800 40px ${FONT}`;outlined(g,'匹',265,928,8);
  g.fillStyle='rgba(90,78,64,.3)';g.fillRect(120,980,200,2);
  g.fillStyle=USUZUMI;g.font=`700 28px ${FONT}`;g.fillText('のこったサル',220,1040);
  g.font=`800 84px ${FONT}`;outlined(g,String(n),190,1140,12);g.font=`800 40px ${FONT}`;outlined(g,'匹',265,1138,8);
  g.fillStyle=USUZUMI;g.font=`700 24px ${FONT}`;g.fillText(`（${total}匹中）`,220,1184);
  g.fillStyle=USUZUMI;g.textAlign='center';g.font=`700 28px ${FONT}`;g.fillText('#サルも木から落ちぬん',540,1322);
  const pat=g.createPattern(PAPER_TILE,'repeat');g.fillStyle=pat;g.fillRect(0,0,1080,1350);
  return c;
}
document.getElementById('againBtn').addEventListener('click',init);
document.getElementById('shareBtn').addEventListener('click',async()=>{
  try{
    const blob=await new Promise(r=>cardCanvas.toBlob(r,'image/png'));
    const file=new File([blob],'saru-ochinun.png',{type:'image/png'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],text:resultText});return;}
    throw new Error('no share');
  }catch(err){if(err&&err.name==='AbortError')return;document.getElementById('shareNote').hidden=false;}
});
document.getElementById('copyBtn').addEventListener('click',()=>{
  const f=document.getElementById('copyField');f.value=resultText;
  const fallback=()=>{f.hidden=false;f.focus();f.select();};
  try{navigator.clipboard.writeText(resultText).then(()=>{document.getElementById('copyBtn').textContent='コピーしました';setTimeout(()=>document.getElementById('copyBtn').textContent='結果の文をコピー',1500)},fallback)}catch(_){fallback()}
});

/* ---------- ループ ---------- */
let last=now(),acc=0,hudTimer=0;
function frame(tn){
  const dt=Math.min(50,tn-last);last=tn;
  if(state!=='result'){
    acc+=dt;while(acc>=1000/60){step();acc-=1000/60;}
    if(state==='play'){
      if(tn-lastSnap>400){lastSnap=tn;takeSnap();}
      if(tn-hudTimer>200){hudTimer=tn;updateHud();}
    }else if(state==='over'&&tn-overAt>1800)finish();
  }
  fitCam(false);
  shake*=0.86;
  const sx=(Math.random()-.5)*shake,sy=(Math.random()-.5)*shake;
  drawScene(ctx,cv.width,cv.height,view.s*dpr,(view.ox+sx)*dpr,(view.oy+sy)*dpr,{fx:true,held:true,crane:settings.input==='drop'});
  requestAnimationFrame(frame);
}

Promise.all(TYPES.map(t=>t.img.decode?t.img.decode().catch(()=>{}):Promise.resolve())).then(()=>{
  boot.remove();
  syncButtons();
  frame0={top:hud.getBoundingClientRect().bottom+2,avail:Math.max(200,innerHeight-hud.getBoundingClientRect().bottom-54)};
  init();resize();
  if(window.__dbg)window.__saru={get monkeys(){return monkeys},get held(){return held},get state(){return state},get tr(){return tr},get next(){return nextType},
    pointW:(i,j)=>pointW(monkeys[i],j),setNext:n=>{nextType=TYPES.find(q=>q.name===n);updateNext();},gw:(i,j)=>monkeys[i].grabs[j]?[pointW(monkeys[i],j),grabWorld(monkeys[i],j),monkeys[i].grabs[j].c.pointA,localPt(monkeys[i],monkeys[i].type.points[j])]:null,view:()=>view,
    hangAt:(tx,ty,typeName)=>{const t=typeName?TYPES.find(q=>q.name===typeName):nextType;const gi=t.points.findIndex(p=>p.grab);
      const m=makeMonkey(t,tx-t.points[gi].x,ty-t.points[gi].y);monkeys.push(m);Composite.add(world,m.body);const got=tryGrabAll(m);nextType=randType();updateNext();return got;},
    freeHang:i=>{const m=monkeys[i];const j=m.type.points.findIndex((p,j)=>p.hang&&!m.hangBy[j]&&!m.grabs[j]);if(j<0)return null;return pointW(m,j);},
    camBox:()=>({s:view.s}),step:n=>{for(let k=0;k<n;k++)step()},wind,settings};
  requestAnimationFrame(frame);
});
})();
</script>
