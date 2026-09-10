import { BOATS, LIVERIES } from './catalog.js';
const KEY='stormskud-captain-v1';
const fresh=()=>({xp:0,coins:0,rounds:0,kills:0,wins:0,boat:'cutter',livery:'plain',owned:['plain'],rewards:[]});
export function loadProfile(storage){
  try{
    const p=JSON.parse(storage.getItem(KEY));if(!p||typeof p!=='object')return fresh();
    const result=fresh();for(const key of ['xp','coins','rounds','kills','wins'])result[key]=Number.isSafeInteger(p[key])&&p[key]>=0?p[key]:0;
    result.boat=BOATS.some(b=>b.id===p.boat)?p.boat:'cutter';
    result.owned=['plain',...LIVERIES.filter(l=>l.id!=='plain'&&Array.isArray(p.owned)&&p.owned.includes(l.id)).map(l=>l.id)];
    result.livery=result.owned.includes(p.livery)?p.livery:'plain';result.rewards=Array.isArray(p.rewards)?p.rewards.filter(v=>typeof v==='string').slice(-100):[];
    return result;
  }catch{return fresh();}
}
export function saveProfile(storage,p){try{storage.setItem(KEY,JSON.stringify(p));return true;}catch{return false;}}
export function levelInfo(xp){let level=1,base=0,needed=100;while(xp>=base+needed){base+=needed;level++;needed=100+(level-1)*40;}return{level,current:xp-base,needed};}
export function rewardRound(profile,roomCode,round,id,results){
  const key=`${roomCode}:${round}:${id}`;if(profile.rewards.includes(key))return null;
  const me=results.find(p=>p.id===id);if(!me)return null;
  const winner=me.score===Math.max(...results.map(p=>p.score));
  const reward={xp:30+me.kills*20+(winner?40:0),coins:15+me.kills*8+(winner?20:0)};
  profile.xp+=reward.xp;profile.coins+=reward.coins;profile.rounds++;profile.kills+=me.kills;profile.wins+=Number(winner);
  profile.rewards.push(key);profile.rewards=profile.rewards.slice(-100);return reward;
}
export function purchase(profile,id){const item=LIVERIES.find(l=>l.id===id);if(!item)return false;if(profile.owned.includes(id)){profile.livery=id;return true;}if(profile.coins<item.price)return false;profile.coins-=item.price;profile.owned.push(id);profile.livery=id;return true;}

let previewModule;
const preview=(boat,color,livery)=>`<div class="boat-preview" data-preview-boat="${boat.id}" data-preview-color="${color}" data-preview-livery="${livery}"><span class="preview-status">Gør skibet klar…</span></div>`;
async function fillPreviews(container){
  const cards=[...container.querySelectorAll('[data-preview-boat]')];
  if(!cards.length)return;
  try{
    const {renderBoatPreview}=await (previewModule??=import('./model-preview.js'));
    for(const card of cards){
      if(!card.isConnected)continue;
      const {previewBoat,previewColor,previewLivery}=card.dataset;
      const data=renderBoatPreview(previewBoat,previewColor,previewLivery);
      if(!data)throw Error('3D-preview unavailable');
      const image=document.createElement('img');
      image.alt=`3D-model af ${BOATS.find(b=>b.id===previewBoat)?.name??'skibet'}`;
      image.width=660;image.height=420;image.draggable=false;image.src=data;
      card.replaceChildren(image);
      // Give input and the main ocean animation a chance between new models.
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
  }catch{
    for(const card of cards){
      const status=card.querySelector('.preview-status');
      if(status){status.textContent='3D-visning er ikke tilgængelig i denne browser.';status.classList.add('failed');}
    }
    fillPreviews(this.content);
  }
}
export class Harbour {
  constructor({onChange,onNotice}){
    let storage;try{storage=window.localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error();}};}
    this.storage=storage;this.profile=loadProfile(storage);this.onChange=onChange;this.onNotice=onNotice;this.tab='fleet';this.color='#ffbc69';
    this.dialog=document.getElementById('harbour');this.content=document.getElementById('harbour-content');
    this.dialog.querySelector('.close-harbour').onclick=()=>this.dialog.close();
    this.dialog.addEventListener('click',e=>{if(e.target===this.dialog)this.dialog.close();});
    document.querySelectorAll('[data-harbour]').forEach(b=>b.onclick=()=>this.open(b.dataset.harbour));
    this.dialog.querySelectorAll('[data-menu-tab]').forEach(b=>b.onclick=()=>{this.tab=b.dataset.menuTab;this.render();});
    this.render();
  }
  open(tab='fleet'){this.tab=tab;this.render();this.dialog.showModal();window.dispatchEvent(new Event('harbour-open'));}
  save(){if(!saveProfile(this.storage,this.profile))this.onNotice('Browseren kan ikke gemme fremskridt. De bevares kun, mens siden er åben.');this.onChange?.(this.profile);this.render();}
  reward(code,round,id,results){const earned=rewardRound(this.profile,code,round,id,results);if(earned){this.save();return earned;}return null;}
  render(){
    const p=this.profile,l=levelInfo(p.xp),boat=BOATS.find(b=>b.id===p.boat);
    document.getElementById('captain-level').textContent=`LVL ${l.level}`;
    document.getElementById('chosen-boat').textContent=boat.name;
    document.getElementById('harbour-coins').textContent=`${p.coins} skaller`;
    document.getElementById('harbour-level').innerHTML=`<span>NIVEAU ${l.level}</span><span>${l.current} / ${l.needed} XP</span><i style="width:${l.current/l.needed*100}%"></i>`;
    this.dialog.querySelectorAll('[data-menu-tab]').forEach(b=>{b.classList.toggle('selected',b.dataset.menuTab===this.tab);b.setAttribute('aria-selected',String(b.dataset.menuTab===this.tab));});
    if(this.tab==='fleet'){
      this.content.innerHTML=`<div class="harbour-intro"><div><div class="eyebrow">VÆLG DIT NÆSTE VRAG</div><h2>Dit skib. Din sejlstil.</h2></div><p>Alle skibe har 4 liv og samme kanon.<br>Forskellen mærkes ved roret.</p></div><div class="fleet-grid">${BOATS.map(b=>`<article class="boat-card ${p.boat===b.id?'equipped':''}"><div class="boat-art">${preview(b,this.color,p.livery)}<span>${b.tag}</span></div><div class="boat-details"><h3>${b.name}</h3><p>${b.description}</p><div class="boat-bars">${[['Fart',b.speed],['Manøvrering',b.agility],['Stabilitet',b.stability]].map(([name,v])=>`<div><span>${name}</span><b>${[1,2,3,4,5].map(i=>`<i class="${i<=v?'lit':''}"></i>`).join('')}</b></div>`).join('')}</div><div class="boat-spec">${b.mass} KG · ${Math.round(4.8*b.scale*10)/10} M SKROG</div><button class="button ${p.boat===b.id?'equipped-button':'secondary'}" data-boat="${b.id}">${p.boat===b.id?'✓ Dit valgte skib':'Vælg skib ↗'}</button></div></article>`).join('')}</div>`;
      this.content.querySelectorAll('[data-boat]').forEach(b=>b.onclick=()=>{p.boat=b.dataset.boat;this.save();});
    }else if(this.tab==='shop'){
      this.content.innerHTML=`<div class="harbour-intro"><div><div class="eyebrow">STIL KAN IKKE REDDE DIG. MEN ALLIGEVEL.</div><h2>Skibsværftets butik</h2></div><p>Tjen skaller ved at spille runder.<br>Kun udseende. Samme slagkraft.</p></div><div class="shop-grid">${LIVERIES.map(item=>{const owned=p.owned.includes(item.id),equipped=p.livery===item.id,canBuy=p.coins>=item.price;return `<article class="shop-card ${equipped?'equipped':''}"><div class="boat-art">${preview(boat,this.color,item.id)}</div><h3>${item.name}</h3><p>${item.description}</p><div class="shop-price">${owned?'I din samling':`◈ ${item.price} skaller`}</div><button class="button ${equipped?'equipped-button':'secondary'}" data-buy="${item.id}" ${!owned&&!canBuy?'disabled':''}>${equipped?'✓ Udstyret':owned?'Udstyr':canBuy?'Køb & udstyr':`Mangler ${item.price-p.coins} skaller`}</button></article>`;}).join('')}</div><p class="shop-note">En runde giver 15 skaller + 8 pr. sænkning. Vinderen får 20 ekstra. Delt førsteplads tæller også.</p>`;
      this.content.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{if(purchase(p,b.dataset.buy)){this.save();this.onNotice('Skrogdesignet er udstyret til dit næste søslag.');}});
    }else{
      this.content.innerHTML=`<div class="captain-summary"><div class="captain-badge">⚓︎<b>${l.level}</b></div><div><div class="eyebrow">DIN KAPTAJNSBOG</div><h2>${l.level<3?'Landkrabbe':l.level<6?'Søulk':l.level<10?'Kaptajn':'Admiral'}</h2><p>${p.xp} XP i alt · ${l.needed-l.current} XP til næste niveau</p></div></div><div class="captain-stats"><div><b>${p.rounds}</b><span>RUNDER SPILLET</span></div><div><b>${p.kills}</b><span>SKIBE SÆNKET</span></div><div><b>${p.wins}</b><span>FØRSTEPLADSER</span></div><div><b>${p.owned.length}</b><span>SKROGDESIGNS</span></div></div><div class="xp-explainer"><h3>Hver runde tæller.</h3><p>30 XP for at gennemføre · 20 XP pr. sænkning · 40 XP for førstepladsen.</p><p>Niveauer er for æren. Alle tre både er tilgængelige fra start, og butikskøb ændrer kun dit udseende.</p></div>`;
    }
    fillPreviews(this.content);
  }
}
