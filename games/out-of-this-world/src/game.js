const $ = (s) => document.querySelector(s);
const screens = [...document.querySelectorAll('.screen')];
const show = id => { screens.forEach(s => s.classList.toggle('active', s.id === id)); };
document.querySelectorAll('[data-screen]').forEach(b => b.addEventListener('click', () => show(b.dataset.screen)));

// Render the preserved 6912-byte ZX Spectrum loading screen without modifying it.
async function renderSpectrumScreen() {
  const canvas = $('#loadingCanvas'), ctx = canvas.getContext('2d');
  const palette = [[0,0,0],[0,0,205],[205,0,0],[205,0,205],[0,205,0],[0,205,205],[205,205,0],[205,205,205]];
  try {
    const bytes = new Uint8Array(await (await fetch('assets/original/spectrum-loading.scr')).arrayBuffer());
    const image = ctx.createImageData(256,192);
    for (let y=0;y<192;y++) for (let xb=0;xb<32;xb++) {
      const bitmapIndex=((y&0xc0)<<5)|((y&7)<<8)|((y&0x38)<<2)|xb;
      const bits=bytes[bitmapIndex], attr=bytes[6144+(y>>3)*32+xb];
      const bright=(attr&64)?50:0, ink=attr&7, paper=(attr>>3)&7;
      for(let bit=0;bit<8;bit++){
        const c=palette[(bits&(128>>bit))?ink:paper];
        const i=(y*256+xb*8+bit)*4;
        image.data[i]=Math.min(255,c[0]+bright); image.data[i+1]=Math.min(255,c[1]+bright); image.data[i+2]=Math.min(255,c[2]+bright); image.data[i+3]=255;
      }
    }
    ctx.putImageData(image,0,0);
  } catch { ctx.fillStyle='#05060a';ctx.fillRect(0,0,256,192);ctx.fillStyle='#ffe531';ctx.font='bold 20px monospace';ctx.textAlign='center';ctx.fillText('OUT OF THIS',128,82);ctx.fillText('WORLD',128,108); }
}
renderSpectrumScreen();

const canvas=$('#game'), ctx=canvas.getContext('2d');
const hud={lives:$('#hudLives'),score:$('#hudScore'),level:$('#hudLevel'),weapon:$('#hudWeapon'),energy:$('#energyBar')};
const keys=new Set();
addEventListener('keydown',e=>{ if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault(); keys.add(e.code); if(e.code==='Enter')game.paused=!game.paused; });
addEventListener('keyup',e=>keys.delete(e.code));
document.querySelectorAll('#touchControls button').forEach(b=>{const down=e=>{e.preventDefault();keys.add(b.dataset.key)};const up=e=>{e.preventDefault();keys.delete(b.dataset.key)};b.addEventListener('pointerdown',down);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up)});

const TAU=Math.PI*2, W=960,H=540,WORLD=8400;
const wrap=x=>(x%WORLD+WORLD)%WORLD;
const delta=(a,b)=>{let d=a-b;if(d>WORLD/2)d-=WORLD;if(d<-WORLD/2)d+=WORLD;return d};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const seeded=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};

// The original CPC sheets store each coloured sprite beside a separate mask.
// Recombine the pair into a transparent canvas sprite at runtime.
const art={player:new Image(),enemies:new Image(),ready:false,cache:new Map()};
art.player.src='assets/original/cpc-player-sprites.png';
art.enemies.src='assets/original/cpc-enemies-bosses.png';
Promise.all([art.player.decode(),art.enemies.decode()]).then(()=>art.ready=true).catch(()=>{});
function maskedSprite(sheet,maskX,imageX,y=4,w=20,h=16){
  const key=`${sheet===art.player?'p':'e'}:${maskX}:${imageX}:${y}`;
  if(art.cache.has(key))return art.cache.get(key);
  if(!art.ready)return null;
  const mask=document.createElement('canvas'),colour=document.createElement('canvas');
  mask.width=colour.width=w;mask.height=colour.height=h;
  const mc=mask.getContext('2d',{willReadFrequently:true}),cc=colour.getContext('2d',{willReadFrequently:true});
  mc.drawImage(sheet,maskX,y,w,h,0,0,w,h);cc.drawImage(sheet,imageX,y,w,h,0,0,w,h);
  const m=mc.getImageData(0,0,w,h),c=cc.getImageData(0,0,w,h);
  for(let i=0;i<c.data.length;i+=4)c.data[i+3]=(m.data[i]+m.data[i+1]+m.data[i+2]<170)?255:0;
  cc.putImageData(c,0,0);art.cache.set(key,colour);return colour;
}
const playerSprite=()=>maskedSprite(art.player,4,28);
const enemySprite=(index,row=0)=>maskedSprite(art.enemies,4+index*48,28+index*48,4+row*20);
function paintSprite(sprite,x,y,scale=3,flip=false){
  if(!sprite)return false;
  ctx.save();ctx.translate(x,y);ctx.scale(flip?-1:1,1);ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sprite,-sprite.width*scale/2,-sprite.height*scale/2,sprite.width*scale,sprite.height*scale);ctx.restore();return true;
}
const levels=[
  ['#050816','#2a245e','#e33f80','#69d7da'],['#10051a','#542159','#f07244','#e9c84b'],['#06151d','#174c5b','#48b874','#d2ec72'],['#120b22','#3e3374','#9066d4','#ffca5d'],
  ['#16080b','#76252d','#e26145','#ffe083'],['#04151a','#15505f','#26aec0','#ccf2ef'],['#0a0718','#35235e','#7e58bb','#f05299'],['#050505','#363636','#cf3030','#f6efdb']
];
const weaponDefs=[
  {name:'QUARK CANNON',color:'#fff',count:1,spread:0,drain:0},
  {name:'2 WAY SHOT',color:'#ffe531',count:2,spread:.18,drain:7},
  {name:'3 WAY SHOT',color:'#ff9d35',count:3,spread:.22,drain:8},
  {name:'4 WAY SHOT',color:'#ff426f',count:4,spread:.27,drain:9},
  {name:'7 WAY SHOT',color:'#b962ff',count:7,spread:.31,drain:12},
  {name:'WIDE BEAM',color:'#5ae8ef',count:3,spread:.07,drain:10,wide:true},
  {name:'LASER',color:'#9dea49',count:1,spread:0,drain:15,laser:true}
];

class Sound {
  constructor(){this.ctx=null;this.enabled=true}
  init(){if(!this.ctx)this.ctx=new (AudioContext||webkitAudioContext)()}
  tone(freq,dur=.08,type='square',vol=.035,slide=0){if(!this.enabled)return;this.init();const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.linearRampToValueAtTime(Math.max(30,freq+slide),t+dur);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(this.ctx.destination);o.start(t);o.stop(t+dur)}
}
const sound=new Sound();

// The browser plays a 6581 render of Jason C. Brooke's preserved C64 SID.
// Keep music separate from synthesized effects so M and S behave independently.
const music=new Audio('assets/original/out-of-this-world-6581.ogg');
music.loop=true;
music.preload='auto';
music.volume=.32;
let musicEnabled=true;
function startMusic(){if(!musicEnabled)return;music.play().catch(()=>{})}
function stopMusic(){music.pause()}
function toggleMusic(){musicEnabled=!musicEnabled;if(musicEnabled&&game.running)startMusic();else stopMusic();game.message=musicEnabled?'MUSIC ON':'MUSIC OFF';game.messageTime=1}
function toggleEffects(){sound.enabled=!sound.enabled;game.message=sound.enabled?'EFFECTS ON':'EFFECTS OFF';game.messageTime=1}

const game={running:false,paused:false,last:0,time:0,level:0,score:0,lives:6,kills:0,required:28,spawn:0,shot:0,message:'',messageTime:0,bonus:false,bonusTime:0,boss:null,bossClear:0,exit:null,bullets:[],hostile:[],enemies:[],pods:[],particles:[],charges:Array(9).fill(0),weapon:0,energy:100,
 reset(){Object.assign(this,{running:true,paused:false,last:performance.now(),time:0,level:0,score:0,lives:6,kills:0,required:28,spawn:0,shot:0,message:'WORLD 1',messageTime:2.3,bonus:false,bonusTime:0,boss:null,bossClear:0,exit:null,bullets:[],hostile:[],enemies:[],pods:[],particles:[],charges:Array(9).fill(0),weapon:0,energy:100});player.reset();updateHud();show('gameScreen');sound.init();music.currentTime=0;startMusic();requestAnimationFrame(loop)},
 nextLevel(){this.bonus=false;this.boss=null;this.bossClear=0;this.level++;if(this.level>=8){this.running=false;this.message='THE OTHER WORLD SURRENDERS';this.messageTime=999;return}this.kills=0;this.required=28+this.level*6;this.exit=null;this.enemies=[];this.bullets=[];this.hostile=[];this.pods=[];player.x=wrap(player.x+900);player.y=230;this.message=`WORLD ${this.level+1}`;this.messageTime=2.5},
 enterBonus(){this.bonus=true;this.bonusTime=0;this.bossClear=0;this.exit=null;this.enemies=[];this.bullets=[];this.hostile=[];this.boss={x:wrap(player.x+430),y:165,base:165,t:0,hp:24+this.level*6,maxHp:24+this.level*6,shot:.8,phase:0,sprite:(this.level+3)%7,row:0};this.message=`GUARDIAN ${this.level+1}`;this.messageTime=2},
 loseLife(){if(player.inv>0)return;this.lives--;player.inv=2.2;player.x=wrap(player.x-260);player.y=210;this.enemies=this.enemies.filter(e=>Math.abs(delta(e.x,player.x))>180);burst(player.x,player.y,'#ff426f',28);sound.tone(90,.5,'sawtooth',.08,-55);canvas.classList.add('shake');setTimeout(()=>canvas.classList.remove('shake'),180);if(this.lives<=0){this.running=false;this.message='FLIGHT LOST · PRESS SOLO FLIGHT TO TRY AGAIN';this.messageTime=999}updateHud()}
};
const player={x:1000,y:220,vx:0,vy:0,facing:1,inv:0,speed:250,reset(){Object.assign(this,{x:1000,y:220,vx:0,vy:0,facing:1,inv:0,speed:250})}};

function terrainY(x){const l=game.level;return 420+Math.sin((x+l*317)/260)*35+Math.sin((x+l*79)/87)*14+Math.sin((x+l*997)/710)*27}
function spawnWave(){const side=Math.random()<.5?-1:1,kind=Math.floor(Math.random()*4),count=3+Math.floor(Math.random()*4),start=wrap(player.x+side*(W*.88+Math.random()*300));for(let i=0;i<count;i++)game.enemies.push({x:wrap(start+side*i*78),base:90+Math.random()*250,y:180,phase:i*.72+Math.random(),amp:22+Math.random()*48,speed:(58+game.level*7+Math.random()*32)*-side,hp:kind===3?2:1,kind,t:0,arm:1.3})}
function fire(){if(game.shot>0)return;game.shot=.14;const w=weaponDefs[game.weapon],n=w.count;for(let i=0;i<n;i++){const a=(i-(n-1)/2)*w.spread;game.bullets.push({x:wrap(player.x+player.facing*28),y:player.y,vx:Math.cos(a)*620*player.facing,vy:Math.sin(a)*620,life:w.laser?.5:1.25,color:w.color,wide:w.wide,laser:w.laser})}if(game.weapon>0){game.energy=Math.max(0,game.energy-w.drain*.42);if(game.energy<=0){game.weapon=0;game.energy=100}}sound.tone(w.laser?650:330,.06,w.laser?'sawtooth':'square',.025,w.laser?340:60)}
function dropPod(x,y){if(Math.random()>.52)return;let type=Math.floor(Math.random()*9);game.pods.push({x,y,type,t:0,life:10})}
function collectPod(p){if(p.type===7){game.lives++;game.message='EXTRA LIFE';game.messageTime=1.2;sound.tone(520,.3,'triangle',.05,500)}else if(p.type===8){player.speed=Math.min(390,player.speed+18);game.message='SPEED INCREASE';game.messageTime=1.2;sound.tone(360,.22,'triangle',.05,330)}else{const threshold=2+game.level+Math.floor(p.type/3);game.charges[p.type]++;if(game.charges[p.type]>=threshold){game.charges[p.type]=0;game.weapon=p.type;game.energy=100;game.message=weaponDefs[p.type].name;game.messageTime=1.3;sound.tone(440+p.type*55,.35,'square',.05,300)}}updateHud()}
function burst(x,y,color,n=10){for(let i=0;i<n;i++)game.particles.push({x,y,vx:(Math.random()-.5)*230,vy:(Math.random()-.5)*230,life:.35+Math.random()*.55,color})}
function update(dt){game.time+=dt;game.messageTime-=dt;player.inv=Math.max(0,player.inv-dt);game.shot=Math.max(0,game.shot-dt);const ax=(keys.has('ArrowRight')||keys.has('KeyP')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyO')?1:0),ay=(keys.has('ArrowDown')||keys.has('KeyA')?1:0)-(keys.has('ArrowUp')||keys.has('KeyQ')?1:0);if(ax)player.facing=Math.sign(ax);player.vx+=(ax*player.speed-player.vx)*Math.min(1,dt*5);player.vy+=(ay*player.speed-player.vy)*Math.min(1,dt*5);if(!ax)player.vx*=Math.pow(.15,dt);if(!ay)player.vy*=Math.pow(.1,dt);player.x=wrap(player.x+player.vx*dt);player.y=clamp(player.y+player.vy*dt,52,terrainY(player.x)-26);if(keys.has('Space'))fire();
  if(game.bonus){
    game.bonusTime+=dt;
    if(game.bossClear>0){game.bossClear-=dt;if(game.bossClear<=0)game.nextLevel()}
    const boss=game.boss;
    if(boss&&!boss.dead){
      boss.t+=dt;boss.shot-=dt;boss.x=wrap(player.x+390+Math.sin(boss.t*.65)*105);boss.y=boss.base+Math.sin(boss.t*1.9)*105;
      if(boss.shot<=0){
        boss.shot=Math.max(.28,.78-game.level*.055);boss.phase++;
        const count=3+Math.min(4,Math.floor(game.level/2));
        for(let i=0;i<count;i++){
          const angle=Math.atan2(player.y-boss.y,delta(player.x,boss.x))+(i-(count-1)/2)*.16;
          const speed=180+game.level*15;
          game.hostile.push({x:boss.x,y:boss.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:5,sprite:(boss.phase+i)%6});
        }
        sound.tone(105,.18,'sawtooth',.045,45);
      }
    }
  }else if(game.running){game.spawn-=dt;if(game.spawn<=0){game.spawn=Math.max(1.05,2.15-game.level*.08);spawnWave()}}
  game.bullets.forEach(b=>{b.x=wrap(b.x+b.vx*dt);b.y+=b.vy*dt;b.life-=dt});game.bullets=game.bullets.filter(b=>b.life>0&&b.y>0&&b.y<H);
  game.hostile.forEach(b=>{b.x=wrap(b.x+b.vx*dt);b.y+=b.vy*dt;b.life-=dt;const dx=delta(b.x,player.x),dy=b.y-player.y;if(dx*dx+dy*dy<420&&player.inv<=0){b.life=0;game.loseLife()}});game.hostile=game.hostile.filter(b=>b.life>0&&b.y>-30&&b.y<H+30);
  for(const e of game.enemies){e.t+=dt;e.arm-=dt;e.x=wrap(e.x+e.speed*dt);e.y=e.base+Math.sin(e.t*2.6+e.phase)*e.amp;if(e.y>terrainY(e.x)-18)e.y=terrainY(e.x)-18;const dx=delta(e.x,player.x),dy=e.y-player.y;if(e.arm<=0&&dx*dx+dy*dy<420&&player.inv<=0)game.loseLife()}
  for(const b of game.bullets)for(const e of game.enemies){if(e.dead)continue;const dx=delta(b.x,e.x),dy=b.y-e.y;if(Math.abs(dx)<(b.laser?42:18)&&Math.abs(dy)<(b.wide?22:14)){b.life=0;e.hp--;if(e.hp<=0){e.dead=true;game.score+=100*(game.level+1);game.kills++;burst(e.x,e.y,levels[game.level][3],12);dropPod(e.x,e.y);sound.tone(145,.1,'square',.035,-80);if(!game.bonus&&!game.exit&&game.kills>=game.required){game.exit={x:wrap(player.x+520*player.facing),y:160,t:0};game.message='EXIT HAS APPEARED';game.messageTime=2}}}}
  if(game.boss&&!game.boss.dead)for(const b of game.bullets){const dx=delta(b.x,game.boss.x),dy=b.y-game.boss.y;if(b.life>0&&Math.abs(dx)<76&&Math.abs(dy)<61){b.life=0;game.boss.hp--;burst(game.boss.x,game.boss.y,game.boss.hp%2?'#ffe531':'#ff426f',4);sound.tone(115,.07,'square',.03,-40);if(game.boss.hp<=0){game.boss.dead=true;game.score+=2500*(game.level+1);game.message='GUARDIAN DESTROYED';game.messageTime=2;game.bossClear=2.2;game.hostile=[];burst(game.boss.x,game.boss.y,'#ffe531',42);sound.tone(75,.65,'sawtooth',.09,-35)}}}
  game.enemies=game.enemies.filter(e=>!e.dead&&Math.abs(delta(e.x,player.x))<W*1.25);
  if(game.exit){game.exit.t+=dt;for(const b of game.bullets){if(Math.abs(delta(b.x,game.exit.x))<38&&Math.abs(b.y-game.exit.y)<30){b.life=0;game.enterBonus();break}}}
  for(const p of game.pods){p.t+=dt;p.life-=dt;p.y+=Math.sin(p.t*4)*7*dt;if(delta(p.x,player.x)**2+(p.y-player.y)**2<850){p.dead=true;collectPod(p)}}game.pods=game.pods.filter(p=>!p.dead&&p.life>0);
  game.particles.forEach(p=>{p.x=wrap(p.x+p.vx*dt);p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt});game.particles=game.particles.filter(p=>p.life>0);updateHud();
}
function sx(x){return W*.36+delta(x,player.x)}
function drawBackground(){const c=levels[game.level];if(game.bonus){ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.fillStyle='#ff8d20';for(let row=0;row<4;row++)for(let i=0;i<14;i++){const x=((i*92-game.time*(70+row*18))%(W+120)+W+120)%(W+120)-60;ctx.fillRect(x,165+row*67,(i+row)%3===0?24:10,5)}ctx.fillStyle='#fff8';for(let i=0;i<45;i++)ctx.fillRect(seeded(i+91)*W,seeded(i+317)*H,1,1);return}const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,c[0]);g.addColorStop(.72,c[1]);g.addColorStop(1,'#050509');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.fillStyle='#ffffff99';for(let i=0;i<80;i++){const x=wrap(i*887+game.level*171);const px=sx(x*.97);if(px>-5&&px<W+5){const y=25+seeded(i+game.level)*290;ctx.fillRect(px,y,i%9===0?2:1,i%9===0?2:1)}}
  for(let layer=0;layer<3;layer++){ctx.beginPath();ctx.moveTo(0,H);for(let x=-30;x<W+40;x+=22){const wx=wrap(player.x-W*.36+x-(2-layer)*player.x*.04);const y=350-layer*38+Math.sin(wx/(180+layer*80)+layer)*25+Math.sin(wx/61)*7;ctx.lineTo(x,y)}ctx.lineTo(W,H);ctx.fillStyle=[c[1]+'bb',c[2]+'aa',c[3]+'66'][layer];ctx.fill()}
  ctx.beginPath();ctx.moveTo(0,H);for(let x=-10;x<W+20;x+=12)ctx.lineTo(x,terrainY(wrap(player.x-W*.36+x)));ctx.lineTo(W,H);ctx.fillStyle='#15111c';ctx.fill();ctx.strokeStyle=c[3];ctx.lineWidth=3;ctx.stroke();
}
function drawShip(){if(player.inv>0&&Math.floor(player.inv*10)%2)return;if(paintSprite(playerSprite(),W*.36,player.y,3,player.facing<0))return;ctx.fillStyle='#5ae8ef';ctx.fillRect(W*.36-20,player.y-7,40,14)}
function drawEnemy(e){const x=sx(e.x);if(x<-50||x>W+50)return;const index=(game.level*2+e.kind)%7,row=(game.level+e.kind)%2;if(paintSprite(enemySprite(index,row),x,e.y,2.5,e.speed>0))return;ctx.fillStyle=levels[game.level][2];ctx.fillRect(x-18,e.y-8,36,16)}
function drawPod(p){const x=sx(p.x);ctx.save();ctx.translate(x,p.y);ctx.rotate(p.t*2);ctx.fillStyle=p.type<7?weaponDefs[p.type].color:p.type===7?'#fff':'#5ae8ef';ctx.strokeStyle='#05060a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,10,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#08080c';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.type===7?'L':p.type===8?'S':String(p.type+1),0,1);ctx.restore()}
function drawExit(){if(!game.exit)return;const x=sx(game.exit.x);ctx.save();ctx.translate(x,game.exit.y);ctx.scale(1+Math.sin(game.exit.t*5)*.08,1+Math.sin(game.exit.t*5)*.08);ctx.fillStyle='#ffe531';ctx.strokeStyle='#ff426f';ctx.lineWidth=5;ctx.fillRect(-37,-20,74,40);ctx.strokeRect(-37,-20,74,40);ctx.fillStyle='#08080c';ctx.font='bold 15px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('EXIT',0,1);ctx.restore()}
function drawBoss(){const boss=game.boss;if(!boss||boss.dead)return;const x=sx(boss.x);paintSprite(enemySprite(boss.sprite,boss.row),x,boss.y,7.5,false);ctx.fillStyle='#1b1424';ctx.fillRect(W/2-151,57,302,15);ctx.fillStyle='#ff426f';ctx.fillRect(W/2-149,59,298*(boss.hp/boss.maxHp),11);ctx.strokeStyle='#ffe531';ctx.strokeRect(W/2-151,57,302,15);ctx.fillStyle='#fff';ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillText(`GUARDIAN ${game.level+1}`,W/2,49)}
function drawHostile(b){const x=sx(b.x);if(!paintSprite(enemySprite(b.sprite,3),x,b.y,1.5,b.vx>0)){ctx.fillStyle='#ff9d35';ctx.fillRect(x-5,b.y-3,10,6)}}
function draw(){drawBackground();game.pods.forEach(drawPod);game.enemies.forEach(drawEnemy);game.hostile.forEach(drawHostile);drawExit();drawBoss();for(const b of game.bullets){const x=sx(b.x);ctx.strokeStyle=b.color;ctx.lineWidth=b.wide?8:b.laser?4:3;ctx.beginPath();ctx.moveTo(x,b.y);ctx.lineTo(x-b.vx*.025,b.y-b.vy*.025);ctx.stroke()}for(const p of game.particles){ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.fillRect(sx(p.x),p.y,3,3)}ctx.globalAlpha=1;drawShip();if(game.bonus){ctx.fillStyle='#fff';ctx.font='bold 14px monospace';ctx.textAlign='center';ctx.fillText('DESTROY THE GUARDIAN',W/2,92)}if(game.paused){ctx.fillStyle='#05060acc';ctx.fillRect(0,0,W,H);ctx.fillStyle='#ffe531';ctx.font='bold 38px monospace';ctx.textAlign='center';ctx.fillText('PAUSED',W/2,H/2)}$('#message').textContent=game.messageTime>0?game.message:''}
function updateHud(){hud.lives.textContent=String(game.lives).padStart(2,'0');hud.score.textContent=String(game.score).padStart(8,'0');hud.level.textContent=String(game.level+1).padStart(2,'0');hud.weapon.textContent=weaponDefs[game.weapon].name;hud.weapon.style.color=weaponDefs[game.weapon].color;hud.energy.style.width=`${game.weapon?game.energy:100}%`;hud.energy.style.background=weaponDefs[game.weapon].color}
function loop(now){if(!$('#gameScreen').classList.contains('active'))return;const dt=Math.min(.033,(now-game.last)/1000||0);game.last=now;if(!game.paused&&game.running)update(dt);draw();requestAnimationFrame(loop)}

$('#startGame').addEventListener('click',()=>game.reset());
$('#leaveGame').addEventListener('click',()=>{game.running=false;stopMusic();show('titleScreen')});
addEventListener('keydown',e=>{if(e.code==='KeyM')toggleMusic();if(e.code==='KeyS')toggleEffects();if(e.code==='Escape'&&$('#gameScreen').classList.contains('active')){game.running=false;stopMusic();show('titleScreen')}});
const autoMode=new URLSearchParams(location.search).get('autostart');
if(autoMode){game.reset();if(autoMode==='boss')game.enterBonus()}
