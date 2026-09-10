import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, COLORS, ROCKS, sanitizeInput } from '../server/game.js';

function fixture(){const r=new Room('TEST1');const a=r.addPlayer('A',COLORS[0]),b=r.addPlayer('B',COLORS[1]);r.start();r.tick(3.01);a.protectedUntil=b.protectedUntil=0;return{r,a,b};}
test('four hits, kill credit, three-second respawn and two-second protection',()=>{
  const {r,a,b}=fixture();for(let i=0;i<3;i++)r.damage(b,a.id);assert.equal(b.hp,1);r.damage(b,a.id);
  assert.equal(b.hp,0);assert.equal(a.score,3);assert.equal(a.kills,1);assert.equal(b.deaths,1);
  r.tick(2.99);assert.equal(b.hp,0);r.tick(.02);assert.equal(b.hp,4);assert.ok(b.protectedUntil-r.now>=1.99);
  r.damage(b,a.id);assert.equal(b.hp,4);assert.ok(ROCKS.every(rock=>Math.hypot(rock.x-b.x,rock.y-b.y)>rock.r+20));
});
test('rock kill credits last attacker within five seconds, but never after expiry',()=>{
  const {r,a,b}=fixture();r.damage(b,a.id,3);r.now+=4.99;r.damage(b,null);assert.equal(a.score,3);
  r.spawn(b);b.protectedUntil=0;r.damage(b,a.id,3);r.now+=5.01;r.damage(b,null);assert.equal(a.score,3);
});
test('real rock collision can sink a previously damaged ship',()=>{
  const {r,a,b}=fixture();r.damage(b,a.id,3);Object.assign(b,{x:715-57-21,y:435,vx:250,vy:0});r.tick(1/30);
  assert.equal(b.hp,0);assert.equal(a.kills,1);
});
test('round ends at 120 seconds, supports ties, and replay resets scores',()=>{
  const {r,a,b}=fixture();a.score=b.score=3;a.kills=b.kills=1;
  r.now=r.endsAt-.02;r.tick(.03);assert.equal(r.phase,'results');assert.equal(r.results.filter(p=>p.score===3).length,2);
  assert.equal(r.start(),true);assert.equal(r.round,2);assert.equal(a.score,0);assert.equal(a.hp,4);assert.ok(Math.abs(r.endsAt-r.startsAt-120)<1e-9);
});
test('input validation, maximum players, late join and stale input',()=>{
  assert.equal(sanitizeInput({aim:'0'}),null);assert.equal(sanitizeInput({aim:Infinity}),null);
  assert.deepEqual(sanitizeInput({aim:0,turn:5,forward:'true',fire:1}),{forward:false,brake:false,turn:0,aim:0,fire:false,boost:false,distance:400});
  const {r,a}=fixture();const late=r.addPlayer('Late',COLORS[2]);assert.equal(late.hp,4);assert.equal(late.protectedUntil,r.now+2);
  for(let i=r.players.size;i<8;i++)assert.ok(r.addPlayer('P',COLORS[0]));assert.equal(r.addPlayer('Too many',COLORS[0]),null);
  r.setInput(a,{aim:0,fire:true,forward:false,turn:0,boost:false,brake:false});r.tick(.4);assert.equal(r.bullets.length,0);
});
test('storm has three-second warning and only pushes each ship once',()=>{
  const {r,a}=fixture();r.nextWave=r.now;r.tick(.01);assert.equal(r.wave.startsAt-r.now,3);
  r.wave.angle=0;Object.assign(a,{x:500,y:100,vx:0,vy:0});r.wave.startsAt=r.now;r.wave.duration=3.8;
  for(let i=0;i<120;i++)r.tick(1/30);
  assert.equal(r.events.filter(e=>e.type==='wavehit'&&e.player===a.id).length,1);
});
test('pickups repair only to four, rapid expires, boost recharges',()=>{
  const {r,a}=fixture();a.hp=3;r.pickups=[{id:1,x:a.x,y:a.y,kind:'repair'}];r.tick(.01);assert.equal(a.hp,4);
  r.pickups=[{id:2,x:a.x,y:a.y,kind:'rapid'}];r.tick(.01);assert.equal(a.rapidUntil,r.now+7);
  a.boostAt=r.now;r.pickups=[{id:3,x:a.x,y:a.y,kind:'boost'}];r.tick(.01);assert.equal(r.now-a.boostAt,6);
});
test('eight ships stay numerically stable through a full stormy battle',()=>{
  const r=new Room('EIGHT');for(let i=0;i<8;i++)r.addPlayer('Bot '+i,COLORS[i],true,{boat:['cutter','skiff','tug'][i%3]});
  r.start();for(let i=0;i<3700;i++)r.tick(1/30);
  assert.equal(r.phase,'results');
  for(const p of r.players.values()){
    for(const n of [p.x,p.y,p.vx,p.vy,p.angle,p.omega])assert.ok(Number.isFinite(n));
    assert.ok(p.hp>=0&&p.hp<=4);assert.equal(p.score%3,0);assert.ok(p.x>=22&&p.x<=1418);assert.ok(p.y>=22&&p.y<=878);
  }
});
