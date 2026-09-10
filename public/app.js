import { SeaRenderer } from './render.js';
import { GameAudio } from './audio.js';
import { Harbour } from './profile.js';
const $=id=>document.getElementById(id);
const COLORS=['#ffbc69','#68d8cd','#fc758c','#ad9bff','#7ebdff','#d9e87a','#f9a5df','#ffffff'];
const COLOR_NAMES=['Abrikos','Turkis','Koral','Lavendel','Blå','Lime','Rosa','Hvid'];
export const renderer=new SeaRenderer($('game'));
const audio=new GameAudio();
let ws=null,state=null,myId=null,token=null,mode='create',color=COLORS[0],pending=null,leaving=false,retries=0,retryTimer;
let samples=[],keys=new Set(),mouse={x:0,y:0,fire:false},overlayKey='',lastScore='',lastHud='',lastRound=0,joinedAt=0,roundReward=null;
const storage={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$('nickname').value=storage.get('stormskud-name')??'';
color=COLORS.includes(storage.get('stormskud-color'))?storage.get('stormskud-color'):color;
COLORS.forEach((hex,i)=>{const b=document.createElement('button');b.type='button';b.className='color'+(hex===color?' active':'');b.style.background=hex;b.setAttribute('aria-label',COLOR_NAMES[i]);b.setAttribute('aria-pressed',String(hex===color));b.onclick=()=>{color=hex;storage.set('stormskud-color',hex);[...$('colors').children].forEach(e=>{e.classList.toggle('active',e===b);e.setAttribute('aria-pressed',String(e===b));});};$('colors').append(b);});
function setMode(next){mode=next;$('create-tab').classList.toggle('selected',mode==='create');$('join-tab').classList.toggle('selected',mode==='join');$('code-field').hidden=mode!=='join';$('roomcode').required=mode==='join';$('enter').firstElementChild.textContent=mode==='create'?'Opret rum':'Deltag i rum';$('error').hidden=true;}
$('create-tab').onclick=()=>setMode('create');$('join-tab').onclick=()=>setMode('join');
const invite=new URL(location.href).searchParams.get('room');if(invite){setMode('join');$('roomcode').value=invite.toUpperCase().slice(0,5);$('enter').firstElementChild.textContent='Deltag i '+$('roomcode').value;}
function send(data){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
function error(message){$('error').textContent=message;$('error').hidden=false;$('enter').disabled=$('solo').disabled=false;}
let toastTimeout;function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').hidden=true,3400);}
const harbour=new Harbour({onNotice:toast});
window.addEventListener('harbour-open',()=>{keys.clear();mouse.fire=false;harbour.color=color;harbour.render();});
function connect(){
  clearTimeout(retryTimer);if(ws) {ws.onclose=null;ws.close();}
  ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);
  ws.onopen=()=>{retries=0;if(token)send({type:'resume',token});else if(pending)send(pending);};
  ws.onmessage=event=>{
    let m;try{m=JSON.parse(event.data);}catch{return;}
    if(m.type==='joined'){
      myId=m.id;token=m.token;pending=null;joinedAt=performance.now();samples=[];
      try{sessionStorage.setItem('stormskud-session',JSON.stringify({token,code:m.state.code}));}catch{}
      $('home').hidden=true;$('session').hidden=false;document.body.classList.add('in-game');$('reconnect').hidden=true;
      $('enter').disabled=$('solo').disabled=false;
      const url=new URL(location.href);url.searchParams.set('room',m.state.code);history.replaceState(null,'',url);
      $('connection').innerHTML='<i></i> FORBUNDET · LIVE';renderer.resize();receive(m.state);overlayKey='';
    }
    if(m.type==='state'){receive(m.state);for(const e of m.events??[])handleEvent(e);}
    if(m.type==='error'){
      if(m.reset){token=null;resetHome();setMode('join');error(m.message);}else if(state)toast(m.message);else error(m.message);
      pending=null;
    }
    if(m.type==='pong'&&state){const ping=Math.max(0,Math.round(performance.now()-m.at));$('connection').innerHTML=`<i></i> FORBUNDET · ${ping} MS`;}
  };
  ws.onerror=()=>{};
  ws.onclose=()=>{
    if(leaving)return;
    if(token){$('reconnect').hidden=false;keys.clear();mouse.fire=false;retryTimer=setTimeout(connect,Math.min(2500,500*++retries));}
    else {error('Kunne ikke forbinde til spilserveren. Prøv igen.');pending=null;}
  };
}
function enter(solo=false){
  if(!$('nickname').reportValidity())return;
  const name=$('nickname').value.trim();if(!name){error('Skriv dit kaldenavn først.');return;}
  if(!solo&&mode==='join'&&!/^[A-Z2-9]{5}$/i.test($('roomcode').value.trim())){error('Rumkoden skal være på 5 tegn.');return;}
  storage.set('stormskud-name',name);$('error').hidden=true;$('enter').disabled=$('solo').disabled=true;
  pending={type:'join',create:solo||mode==='create',solo,name,color,boat:harbour.profile.boat,livery:harbour.profile.livery,code:$('roomcode').value.trim().toUpperCase()};leaving=false;connect();
}
$('entry').onsubmit=e=>{e.preventDefault();enter();};$('solo').onclick=()=>enter(true);
function resetHome(){state=null;myId=null;token=null;samples=[];keys.clear();mouse.fire=false;overlayKey='';lastScore='';lastHud='';lastRound=0;try{sessionStorage.removeItem('stormskud-session');}catch{}$('home').hidden=false;$('session').hidden=true;$('reconnect').hidden=true;document.body.classList.remove('in-game');$('connection').innerHTML='<i></i> KLAR TIL AT STÆVNE UD';$('enter').disabled=$('solo').disabled=false;$('controls').hidden=false;renderer.particles=[];renderer.wakes=[];}
$('leave').onclick=()=>{leaving=true;send({type:'leave'});clearTimeout(retryTimer);if(ws){ws.onclose=null;ws.close();}resetHome();history.replaceState(null,'',location.pathname);};
$('copy').onclick=async()=>{
  const link=new URL(location.href);link.search='';link.searchParams.set('room',state.code);
  try {await navigator.clipboard.writeText(link.href);}catch{
    const input=document.createElement('textarea');input.value=link.href;input.style.cssText='position:fixed;left:-9999px';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok){toast('Invitationslinket står i adresselinjen — kopiér det derfra.');return;}
  }
  $('copy').textContent='✓ Link kopieret';setTimeout(()=>$('copy').textContent='⧉  Kopiér link',1800);
};
$('sound').onclick=async()=>{try{const on=await audio.toggle();$('sound').innerHTML=`♫ <span>LYD ${on?'TIL':'FRA'}</span>`;$('sound').setAttribute('aria-label',on?'Slå lyd fra':'Slå lyd til');$('sound').title=on?'Slå lyd fra':'Slå lyd til';}catch{toast('Lyd kunne ikke startes i denne browser.');}};
function receive(next){if(!myId)return;state=next;samples.push({state:next,at:performance.now()});if(samples.length>12)samples.shift();if(next.phase==='results'){const reward=harbour.reward(next.code,next.round,myId,next.results);if(reward)roundReward=reward;}else roundReward=null;}
function handleEvent(e){
  renderer.event(e);const p=state?.players.find(p=>p.id===myId);const distance=e.x!=null&&p?Math.hypot(e.x-p.x,e.y-p.y):0;audio.effect(e.type,Math.max(.12,1-distance/1100));
  if(e.type==='sink')feed(e.killer?`${e.killer} sænkede ${e.victim} +3`:`${e.victim} kyssede en klippe.`);
  if(e.type==='join')feed(`${e.name} er kommet ombord.`);
  if(e.type==='leave')feed(`${e.name} har forladt farvandet.`);
  if(e.type==='pickup'&&e.player===myId)toast(e.kind==='repair'?'+2 liv · Lappet og klar!':e.kind==='rapid'?'Hurtig ild i 7 sekunder!':'Boost er klar igen!');
}
function feed(message){const div=document.createElement('div');div.className='feed-item';div.textContent=message;$('feed').prepend(div);while($('feed').children.length>4)$('feed').lastChild.remove();setTimeout(()=>div.remove(),5000);}
function serverTime(){return state?state.now+Math.min(.2,(performance.now()-(samples.at(-1)?.at??performance.now()))/1000):0;}
function interpolated(){
  if(!state)return null;
  const target=serverTime()-.1;
  let a=samples[0]?.state??state,b=state;
  for(let i=1;i<samples.length;i++){if(samples[i].state.now>=target){a=samples[i-1].state;b=samples[i].state;break;}}
  const f=Math.max(0,Math.min(1,(target-a.now)/(b.now-a.now||1)));
  const lerp=(x,y)=>x+(y-x)*f,angle=(x,y)=>x+Math.atan2(Math.sin(y-x),Math.cos(y-x))*f;
  return {...state,now:serverTime(),players:state.players.map(p=>{
    const old=a.players.find(o=>o.id===p.id),next=b.players.find(o=>o.id===p.id);
    if(!old||!next||old.hp<=0||next.hp<=0||Math.hypot(old.x-next.x,old.y-next.y)>160)return p;
    const result={...p,x:lerp(old.x,next.x),y:lerp(old.y,next.y),angle:angle(old.angle,next.angle),aim:angle(old.aim,next.aim)};
    if(p.id===myId){const elapsed=Math.min(.07,(performance.now()-samples.at(-1).at)/1000);result.x=p.x+p.vx*elapsed;result.y=p.y+p.vy*elapsed;result.angle=p.angle;const point=renderer.worldPoint(mouse.x,mouse.y);if(mouse.x||mouse.y)result.aim=Math.atan2(point.y-result.y,point.x-result.x);}
    return result;
  }),bullets:state.bullets.map(p=>{const old=a.bullets.find(o=>o.id===p.id),next=b.bullets.find(o=>o.id===p.id);return old&&next?{...p,x:lerp(old.x,next.x),y:lerp(old.y,next.y)}:p;})};
}
function updateUI(){
  if(!state)return;
  const now=serverTime(),me=state.players.find(p=>p.id===myId);
  $('room-label').textContent=state.code;$('player-count').textContent=`${state.players.length} / 8`;
  $('round-label').textContent=`RUNDE ${String(state.round||1).padStart(2,'0')}`;
  const remaining=state.phase==='playing'?Math.max(0,Math.ceil(state.endsAt-now)):state.phase==='results'?0:120;
  $('timer').innerHTML=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}<small>TID TILBAGE</small>`;$('timer').classList.toggle('urgent',remaining<=15);
  const sorted=[...state.players].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
  const score=sorted.map((p,i)=>`<div class="score-row ${p.id===myId?'self':''}"><span class="rank">${i+1}</span><span class="ship-dot" style="--ship:${p.color}"></span><span class="score-name">${escape(p.name)}<small>${p.id===myId?'DIG':p.bot?'BOT':!p.connected?'AFBRUDT':''}</small></span><span class="score-points">${p.score}</span></div>`).join('');
  if(score!==lastScore){$('scoreboard').innerHTML=score;lastScore=score;}
  if(me){
    const health=`${[0,1,2,3].map(i=>`<i class="${i<me.hp?'':'empty'}"></i>`).join('')}<small>${me.hp}/4</small>`;if(health!==lastHud){$('health').innerHTML=health;$('health').setAttribute('aria-label',`${me.hp} af 4 liv`);lastHud=health;}
    const boost=Math.min(1,(now-me.boostAt)/6);$('boost-meter').style.width=`${boost*100}%`;$('boost-text').textContent=boost>=1?'BOOST KLAR':`${Math.max(0,Math.ceil(6-now+me.boostAt))} SEK.`;
  }
  const warning=state.wave&&now<state.wave.startsAt;
  $('wave-warning').hidden=!warning;
  if(warning){const a=state.wave.angle;const direction=Math.abs(a)<.1?'→ MOD ØST':a>3?'← MOD VEST':a>0?'↓ MOD SYD':'↑ MOD NORD';$('wave-warning').textContent=`≋ STORBØLGE ${direction} · ${Math.max(1,Math.ceil(state.wave.startsAt-now))} SEK.`;}
  if(state.round!==lastRound){lastRound=state.round;if(state.round>1)$('controls').hidden=true;}
  let key=state.phase;
  if(state.phase==='lobby')key+=state.players.length>=2?'-ready':'-waiting';
  if(state.phase==='countdown')key+=Math.ceil(state.startsAt-now);
  if(state.phase==='playing')key=me?.hp===0?'dead'+Math.ceil(me.respawnAt-now):'none';
  if(key!==overlayKey){overlayKey=key;const el=$('center-overlay');el.hidden=key==='none';
    if(state.phase==='lobby')el.innerHTML=`<div class="modal"><div class="eyebrow">ALLE MAND OMBORD</div><h2>Et lille hav. Dine venner.</h2><p>Del linket fra sidepanelet i Discord.<br>${state.players.length<2?'Vi venter bare på én mere.':'Besætningen er klar. Lad søslaget begynde.'}</p><button class="button primary" id="start-round" ${state.players.length<2?'disabled':''}>Start søslaget ↗</button><small>2 minutter · 3 point pr. sænkning<br>Venner kan også hoppe ind undervejs.</small></div>`;
    else if(state.phase==='countdown')el.innerHTML=`<div class="big-count">${Math.max(1,Math.ceil(state.startsAt-now))}</div><div class="count-label">FIND DIT SKIB. GØR KANONEN KLAR.</div>`;
    else if(state.phase==='playing'&&me?.hp===0)el.innerHTML=`<div class="modal"><div class="eyebrow">DET VAR HELT SIKKERT BØLGEN</div><h2>Du er gået ned.</h2><p>Nyt skib om ${Math.max(1,Math.ceil(me.respawnAt-now))} sekunder.<br>Du beholder dine point.</p></div>`;
    else if(state.phase==='results'){
      const best=state.results[0]?.score??0,winners=state.results.filter(p=>p.score===best);
      el.innerHTML=`<div class="modal"><div class="winner-symbol">⚑</div><div class="eyebrow">${winners.length>1?'DELT FØRSTEPLADS':'HAVETS UKRONEDE KAPTAJN'}</div><h2>${winners.length===1?escape(winners[0].name):'Sejren deles!'}</h2><p>${winners.length>1?winners.map(p=>escape(p.name)).join(', '):'Stormen lægger sig. Egoet gør ikke.'}</p><div class="result-list">${state.results.map(p=>`<div class="result-row"><span>${escape(p.name)}${p.id===myId?' · DIG':''}</span><span>${p.kills} sænkninger · <b>${p.score} point</b></span></div>`).join('')}</div>${roundReward?`<div class="round-reward">+${roundReward.xp} XP <span>◈ +${roundReward.coins} skaller</span></div>`:''}<button class="button primary" id="start-round">Én runde mere ↗</button><small>Alle i rummet kan starte næste runde.</small></div>`;
    }
    const start=$('start-round');if(start)start.onclick=()=>send({type:'start'});
  }
}
document.addEventListener('keydown',e=>{if(!state||harbour.dialog.open||/INPUT|TEXTAREA/.test(document.activeElement.tagName))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)){e.preventDefault();keys.add(e.code);}});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();mouse.fire=false;});document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();mouse.fire=false;}});
$('game').addEventListener('pointermove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;});
$('game').addEventListener('pointerdown',e=>{if(e.button===0&&state?.phase==='playing'){mouse.x=e.clientX;mouse.y=e.clientY;mouse.fire=true;e.preventDefault();}});
window.addEventListener('pointerup',()=>mouse.fire=false);$('game').addEventListener('contextmenu',e=>e.preventDefault());
setInterval(()=>{if(!state||!myId)return;const p=state.players.find(p=>p.id===myId);if(!p)return;const point=renderer.worldPoint(mouse.x,mouse.y);send({type:'input',input:{forward:keys.has('KeyW')||keys.has('ArrowUp'),brake:keys.has('KeyS')||keys.has('ArrowDown'),turn:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),aim:mouse.x||mouse.y?Math.atan2(point.y-p.y,point.x-p.x):p.aim,distance:Math.hypot(point.y-p.y,point.x-p.x),fire:mouse.fire,boost:keys.has('Space')}});},1000/30);
setInterval(()=>{if(state)send({type:'ping',at:performance.now()});},2500);
let last=performance.now(),uiAt=0;function frame(time){const dt=Math.min(.05,(time-last)/1000);last=time;renderer.draw(interpolated(),myId,dt,time,!!state);if(time-uiAt>80){updateUI();uiAt=time;}requestAnimationFrame(frame);}requestAnimationFrame(frame);
try{const saved=JSON.parse(sessionStorage.getItem('stormskud-session'));if(saved?.token&&saved.code===invite?.toUpperCase()){token=saved.token;connect();}}catch{}
