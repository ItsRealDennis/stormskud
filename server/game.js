import { randomUUID } from 'node:crypto';
import { PHYSICS, advanceBoat, fireCannon, hullCircles, resolveBoatContact, waveFlow } from './physics.js';
import { BOATS, LIVERIES, boatStats } from '../public/catalog.js';

export const WORLD = { width: 1440, height: 900 };
export const COLORS = ['#ffbc69', '#68d8cd', '#fc758c', '#ad9bff', '#7ebdff', '#d9e87a', '#f9a5df', '#ffffff'];
export const ROCKS = [
  { x: 360, y: 265, r: 48, island: true },
  { x: 1080, y: 635, r: 48, island: true },
  { x: 715, y: 435, r: 57, island: true },
  { x: 1100, y: 220, r: 33 },
  { x: 320, y: 670, r: 33 },
];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const blankInput = () => ({ forward: false, brake: false, turn: 0, aim: 0, fire: false, boost: false });

export function sanitizeInput(data) {
  if (!data || typeof data !== 'object' || !Number.isFinite(data.aim)) return null;
  return { forward: data.forward === true, brake: data.brake === true,
    turn: [-1, 0, 1].includes(data.turn) ? data.turn : 0,
    aim: Math.atan2(Math.sin(data.aim), Math.cos(data.aim)),
    fire: data.fire === true, boost: data.boost === true,
    distance: Number.isFinite(data.distance) ? clamp(data.distance,45,900) : 400 };
}

export class Room {
  constructor(code, options = {}) {
    this.code = code;
    this.players = new Map();
    this.bullets = [];
    this.pickups = [];
    this.events = [];
    this.phase = 'lobby';
    this.now = 0;
    this.round = 0;
    this.endsAt = 0;
    this.duration = options.duration ?? 120;
    this.countdown = options.countdown ?? 3;
    this.nextWave = 12;
    this.nextPickup = 8;
    this.wave = null;
    this.results = [];
    this.serial = 0;
  }
  emit(type, data = {}) { this.events.push({ id: ++this.serial, type, ...data }); }
  addPlayer(name, color, bot = false, loadout = {}) {
    if (this.players.size >= 8) return null;
    const p = { id: randomUUID(), name, color, bot, connected: true,
      boat:BOATS.some(b=>b.id===loadout.boat)?loadout.boat:'cutter',livery:LIVERIES.some(l=>l.id===loadout.livery)?loadout.livery:'plain',
      x: 0, y: 0, vx: 0, vy: 0, angle: 0, aim: 0, omega:0, throttle:0, rudder:0, heave:0, hp: 4, score: 0, kills: 0, deaths: 0,
      input: blankInput(), inputAt: this.now, shotAt: -10, boostAt: -10, boostingUntil: 0,
      protectedUntil: 0, respawnAt: 0, rapidUntil: 0, rockAt: -10, contactAt:-10, lastHit: null };
    this.players.set(p.id, p);
    this.spawn(p);
    this.emit('join', { name });
    return p;
  }
  removePlayer(id) {
    const p = this.players.get(id);
    if (p) this.emit('leave', { name: p.name });
    this.players.delete(id);
    this.bullets = this.bullets.filter(b => b.owner !== id);
  }
  spawn(p) {
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 48; i++) {
      const point = { x: 100 + Math.random() * (WORLD.width - 200), y: 100 + Math.random() * (WORLD.height - 200) };
      if (ROCKS.some(r => dist(r, point) < r.r + 100)) continue;
      const enemies = [...this.players.values()].filter(other => other.id !== p.id && other.hp > 0);
      const score = Math.min(900, ...enemies.map(other => dist(other, point)), ...this.bullets.map(b => dist(b, point)));
      if (score > bestScore) { best = point; bestScore = score; }
    }
    Object.assign(p, best ?? { x: 120, y: 120 }, { hp: 4, vx: 0, vy: 0,omega:0,throttle:0,rudder:0,heave:0,
      angle: Math.random() * Math.PI * 2, respawnAt: 0, protectedUntil: this.now + 2, lastHit: null,
      rapidUntil: 0, boostingUntil: 0, boostAt: this.now - 6, input: blankInput() });
  }
  start() {
    if (!['lobby', 'results'].includes(this.phase) || this.players.size < 2) return false;
    this.phase = 'countdown';
    this.round++;
    this.startsAt = this.now + this.countdown;
    this.endsAt = this.startsAt + this.duration;
    this.nextWave = this.startsAt + 12;
    this.nextPickup = this.startsAt + 8;
    this.wave = null;
    this.results = [];
    this.bullets = []; this.pickups = [];
    for (const p of this.players.values()) {
      p.score = p.kills = p.deaths = 0;
      this.spawn(p);
      p.protectedUntil = this.startsAt + 2;
    }
    this.emit('round', { round: this.round });
    return true;
  }
  setInput(p, input) { p.input = input; p.inputAt = this.now; }
  damage(p, owner, amount = 1) {
    if (p.hp <= 0 || this.now < p.protectedUntil) return;
    if (owner && owner !== p.id) p.lastHit = { id: owner, time: this.now };
    p.hp = Math.max(0, p.hp - amount);
    this.emit('hit', { x: p.x, y: p.y, player: p.id });
    if (p.hp > 0) return;
    const killer = p.lastHit && this.now - p.lastHit.time <= 5 ? this.players.get(p.lastHit.id) : null;
    if (killer) { killer.score += 3; killer.kills++; }
    p.deaths++;
    p.respawnAt = this.now + 3;
    p.vx = p.vy = 0;
    this.emit('sink', { x: p.x, y: p.y, color: p.color, player: p.id, victim: p.name, killer: killer?.name ?? null });
  }
  botInput(p) {
    const target = [...this.players.values()].filter(o => o.id !== p.id && o.hp > 0).sort((a,b) => dist(p,a)-dist(p,b))[0];
    if (!target) return blankInput();
    const distance = dist(p, target);
    const aim = Math.atan2(target.y + target.vy * distance / 640 - p.y, target.x + target.vx * distance / 640 - p.x);
    let heading = Math.atan2(target.y-p.y, target.x-p.x) + (distance < 250 ? 1.1 : 0);
    const ahead = { x: p.x + Math.cos(p.angle) * 115, y: p.y + Math.sin(p.angle) * 115 };
    const obstacle = ROCKS.find(r => dist(r, ahead) < r.r + 60);
    if (obstacle) heading = Math.atan2(p.y-obstacle.y, p.x-obstacle.x) + 0.5;
    if (p.x < 90 || p.x > WORLD.width-90 || p.y < 90 || p.y > WORLD.height-90) heading = Math.atan2(WORLD.height/2-p.y, WORLD.width/2-p.x);
    const d = angleDiff(heading, p.angle);
    return { forward: true, brake: distance < 130, turn: Math.abs(d) < .1 ? 0 : Math.sign(d), aim,distance,
      fire: distance < 780, boost: distance > 500 && Math.abs(d) < .3 };
  }
  tick(dt) {
    this.now += dt;
    if (this.phase === 'countdown' && this.now >= this.startsAt) this.phase = 'playing';
    if (this.phase !== 'playing') return;
    if (this.now >= this.endsAt) {
      this.phase = 'results';
      this.results = [...this.players.values()].map(({id,name,color,score,kills,deaths}) => ({id,name,color,score,kills,deaths})).sort((a,b) => b.score-a.score);
      this.bullets = [];
      this.emit('end');
      return;
    }
    if (this.now >= this.nextWave && !this.wave) {
      const directions = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      const angle=directions[Math.floor(Math.random()*4)];
      const extent=Math.abs(Math.cos(angle))*WORLD.width+Math.abs(Math.sin(angle))*WORLD.height;
      const speed=PHYSICS.gravity*PHYSICS.wavePeriod/(2*Math.PI)*PHYSICS.pixelsPerMeter;
      this.wave = { angle, startsAt: this.now + 3, duration:(extent+160)/speed, pushed: new Set() };
      this.nextWave = this.now + this.wave.duration+10;
      this.emit('warning');
    }
    if (this.wave && this.now > this.wave.startsAt + this.wave.duration) this.wave = null;
    if (this.now >= this.nextPickup) {
      this.nextPickup = this.now + 9;
      if (this.pickups.length < 3) {
        let spot;
        for (let i=0;i<20;i++) {
          const candidate = { x: 120 + Math.random() * 1200, y: 120 + Math.random() * 660 };
          if (!ROCKS.some(r => dist(r,candidate) < r.r+50)) { spot=candidate; break; }
        }
        if (spot) this.pickups.push({id: ++this.serial, ...spot, kind:['repair','rapid','boost'][Math.floor(Math.random()*3)]});
      }
    }
    for (const p of this.players.values()) {
      if (p.hp <= 0) {
        if (this.now >= p.respawnAt) { this.spawn(p); this.emit('respawn', {player:p.id, x:p.x,y:p.y}); }
        continue;
      }
      const input = p.bot ? this.botInput(p) : this.now-p.inputAt < .35 ? p.input : blankInput();
      p.aim = input.aim;
      if (input.boost && this.now-p.boostAt >= 6) {
        p.boostAt=this.now; p.boostingUntil=this.now+1.2;
        this.emit('boost',{player:p.id,x:p.x,y:p.y});
      }
      advanceBoat(p,input,dt,this.now,this.wave,WORLD);
      if (this.wave && this.now >= this.wave.startsAt && !this.wave.pushed.has(p.id)) {
        const w=this.wave;
        if (waveFlow(w,this.now,p.x,p.y,WORLD).crest) {
          w.pushed.add(p.id);
          this.emit('wavehit',{player:p.id,x:p.x,y:p.y});
        }
      }
      const margin=42;
      if(p.x<margin) p.vx+=(margin-p.x)*12*dt;
      if(p.x>WORLD.width-margin) p.vx-=(p.x-WORLD.width+margin)*12*dt;
      if(p.y<margin) p.vy+=(margin-p.y)*12*dt;
      if(p.y>WORLD.height-margin) p.vy-=(p.y-WORLD.height+margin)*12*dt;
      p.x=clamp(p.x,22,WORLD.width-22); p.y=clamp(p.y,22,WORLD.height-22);
      for (const r of ROCKS) for (const hull of hullCircles(p)) {
        const d=dist(hull,r), min=r.r+hull.r;
        if(d>=min) continue;
        const nx=(hull.x-r.x)/(d||1),ny=(hull.y-r.y)/(d||1);
        const impact=-(p.vx*nx+p.vy*ny);
        p.x+=nx*(min-d); p.y+=ny*(min-d);
        if(impact>0) {
          const armX=(hull.x-p.x)/PHYSICS.pixelsPerMeter,armY=(hull.y-p.y)/PHYSICS.pixelsPerMeter;
          const cross=armX*ny-armY*nx;
          const spec=boatStats(p.boat);
          const impulse=1.08*(impact/PHYSICS.pixelsPerMeter)/(1/spec.mass+cross*cross/spec.inertia);
          p.vx+=nx*impulse/spec.mass*PHYSICS.pixelsPerMeter;p.vy+=ny*impulse/spec.mass*PHYSICS.pixelsPerMeter;
          p.omega+=cross*impulse/spec.inertia;
        }
        if(impact>72 && this.now-p.rockAt>.9) { p.rockAt=this.now; this.damage(p,null); }
      }
      if (p.hp <= 0) continue;
      if (input.fire && this.now-p.shotAt >= (this.now<p.rapidUntil ? .28 : .58)) {
        p.shotAt=this.now;
        const dx=Math.cos(p.aim),dy=Math.sin(p.aim);
        this.bullets.push({id:++this.serial,owner:p.id,x:p.x+dx*31,y:p.y+dy*31,...fireCannon(p,input),life:2});
        // 3 kg cannonball: equal/opposite linear momentum on the 900 kg boat.
        const recoil=3*PHYSICS.cannonSpeed/boatStats(p.boat).mass*PHYSICS.pixelsPerMeter;
        p.vx-=dx*recoil;p.vy-=dy*recoil;
        this.emit('shot',{x:p.x+dx*31,y:p.y+dy*31,angle:p.aim,player:p.id});
      }
      this.pickups=this.pickups.filter(item=>{
        if(dist(p,item)>38) return true;
        if(item.kind==='repair') p.hp=Math.min(4,p.hp+2);
        if(item.kind==='rapid') p.rapidUntil=this.now+7;
        if(item.kind==='boost') p.boostAt=this.now-6;
        this.emit('pickup',{x:p.x,y:p.y,player:p.id,kind:item.kind});
        return false;
      });
    }
    const alive=[...this.players.values()].filter(p=>p.hp>0);
    for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++){
      const a=alive[i],b=alive[j],impact=resolveBoatContact(a,b);
      if(impact>5){
        if(this.now-a.contactAt>.9){a.contactAt=this.now;this.damage(a,b.id);}
        if(this.now-b.contactAt>.9){b.contactAt=this.now;this.damage(b,a.id);}
      }
    }
    this.bullets=this.bullets.filter(b=>{
      // Two substeps keep collision detection reliable even through a narrow bow.
      for(let step=0;step<2;step++) {
        b.x+=b.vx*dt/2;b.y+=b.vy*dt/2;b.z+=b.vz*dt/2-.5*PHYSICS.gravity*(dt/2)**2;b.vz-=PHYSICS.gravity*dt/2;b.life-=dt/2;
        if(b.z<=0||b.life<=0||b.x<18||b.x>WORLD.width-18||b.y<18||b.y>WORLD.height-18||ROCKS.some(r=>dist(b,r)<r.r+4&&b.z<(r.island?4:2.5))) {
          this.emit('splash',{x:b.x,y:b.y}); return false;
        }
        const victim=[...this.players.values()].find(p=>p.id!==b.owner&&p.hp>0&&b.z<PHYSICS.hullHeight+(p.heave||0)&&hullCircles(p).some(h=>dist(h,b)<h.r+4));
        if(victim) {
          this.damage(victim,b.owner);
          this.emit('splash',{x:b.x,y:b.y});return false;
        }
      }
      return true;
    });
  }
  snapshot() {
    return { code:this.code, now:this.now, phase:this.phase, round:this.round,
      startsAt:this.startsAt??0, endsAt:this.endsAt, world:WORLD,
      players:[...this.players.values()].map(p=>({ id:p.id,name:p.name,color:p.color,bot:p.bot,boat:p.boat,livery:p.livery,
        connected:p.connected,x:p.x,y:p.y,vx:p.vx,vy:p.vy,angle:p.angle,aim:p.aim,hp:p.hp,heave:p.heave,omega:p.omega,
        score:p.score,kills:p.kills,deaths:p.deaths,respawnAt:p.respawnAt,
        protectedUntil:p.protectedUntil,boostAt:p.boostAt,boostingUntil:p.boostingUntil,rapidUntil:p.rapidUntil })),
      bullets:this.bullets.map(({id,x,y,z,vx,vy})=>({id,x,y,z,vx,vy})),
      pickups:this.pickups, rocks:ROCKS,
      wave:this.wave ? {angle:this.wave.angle,startsAt:this.wave.startsAt,duration:this.wave.duration}:null,
      results:this.results };
  }
}
