import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceBoat, resolveBoatContact, fireCannon, PHYSICS } from '../server/physics.js';
const world={width:1440,height:900};
const boat=extra=>({x:500,y:400,vx:0,vy:0,angle:0,aim:0,omega:0,throttle:0,rudder:0,boostingUntil:0,...extra});
const input={forward:false,brake:false,turn:0,aim:0,distance:400};
function run(p,controls,seconds,step=1/120){for(let t=0;t<seconds;t+=step)advanceBoat(p,controls,step,t,null,world);return p;}
test('water resists sideways motion more than forward motion',()=>{
  const fore=run(boat({vx:60}),input,1),side=run(boat({vy:60}),input,1);
  assert.ok(fore.vx>side.vy*1.5);
});
test('thrust accelerates gradually and hull drag limits cruising speed without a speed clamp',()=>{
  const p=boat();run(p,{...input,forward:true},.1);assert.ok(p.vx<10);
  run(p,{...input,forward:true},30);assert.ok(p.vx>90&&p.vx<150,`cruise=${p.vx}`);
  const fast=boat({vx:120});run(fast,{...input,brake:true},2);assert.ok(fast.vx<60&&fast.vx>-5);
});
test('rudder needs flow, and angular momentum persists after releasing steering',()=>{
  const still=run(boat(),{...input,turn:1},1),moving=run(boat({vx:110}),{...input,turn:1},1);
  assert.ok(Math.abs(moving.angle)>Math.abs(still.angle)*5);
  const omega=moving.omega;advanceBoat(moving,input,1/30,1,null,world);assert.ok(moving.omega>0&&moving.omega<omega);
});
test('hull collisions conserve linear momentum and dissipate energy',()=>{
  const a=boat({x:500,vx:60}),b=boat({x:548,vx:-60});
  const before=a.vx+b.vx,energyBefore=a.vx*a.vx+b.vx*b.vx;
  assert.ok(resolveBoatContact(a,b)>0);
  assert.ok(Math.abs(a.vx+b.vx-before)<1e-8);
  assert.ok(a.vx*a.vx+b.vx*b.vx<energyBefore);
  assert.ok(b.x-a.x>48);
});
test('cannon inherits vessel velocity and follows gravity to aimed range',()=>{
  const p=boat({vx:24,vy:12}),b=fireCannon(p,input),stationary=fireCannon(boat(),input);
  assert.equal(b.vx-stationary.vx,24);assert.equal(b.vy-stationary.vy,12);
  const flight=400/stationary.vx,height=stationary.z+stationary.vz*flight-.5*PHYSICS.gravity*flight**2;
  assert.ok(Math.abs(height-.6)<1e-8);
});
test('force integration stays close at 30 and 120 Hz',()=>{
  const controls={...input,forward:true,turn:1};
  const a=run(boat(),controls,3,1/30),b=run(boat(),controls,3,1/120);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<8);
  assert.ok(Math.abs(a.angle-b.angle)<.1);
});
