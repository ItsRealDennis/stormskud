import { boatStats } from '../public/catalog.js';
// SI units inside the force model; network/render coordinates use pixels.
// A small 4.8 m motor launch, not a full naval/CFD simulation.
export const PHYSICS = Object.freeze({
  pixelsPerMeter: 12, mass: 900, yawInertia: 1900,
  thrust: 3600, boostThrust: 6200, gravity: 9.81,
  cannonSpeed: 55, muzzleHeight: .9, hullHeight: 1.5,
  wavePeriod: 5.2, waveAmplitude: .72,
});
const P=PHYSICS, S=P.pixelsPerMeter;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function waveFlow(wave, now, x, y, world) {
  if(!wave || now<wave.startsAt)return {x:0,y:0,height:0,crest:false};
  const dx=Math.cos(wave.angle),dy=Math.sin(wave.angle);
  const extent=Math.abs(dx)*world.width+Math.abs(dy)*world.height;
  const front=-extent/2-80+(now-wave.startsAt)/wave.duration*(extent+160);
  const distance=((x-world.width/2)*dx+(y-world.height/2)*dy-front)/S;
  const wavelength=P.gravity*P.wavePeriod**2/(2*Math.PI);
  const envelope=Math.exp(-((distance/(wavelength*.23))**2));
  const phase=distance*2*Math.PI/wavelength;
  // Linear deep-water wave orbital flow at the surface. A finite envelope
  // makes this a single passing wave packet rather than an infinite train.
  const speed=P.waveAmplitude*2*Math.PI/P.wavePeriod*Math.cos(phase)*envelope;
  return {x:dx*speed,y:dy*speed,height:P.waveAmplitude*Math.cos(phase)*envelope,
    crest:Math.abs(distance)<2, slope:-P.waveAmplitude*2*Math.PI/wavelength*Math.sin(phase)*envelope};
}

export function advanceBoat(p,input,dt,now,wave,world){
  const hull=boatStats(p.boat),mass=hull.mass,inertia=hull.inertia;
  const headingX=Math.cos(p.angle),headingY=Math.sin(p.angle);
  const swell=waveFlow(wave,now,p.x,p.y,world);
  const currentX=.3+.12*Math.sin(now*.09),currentY=.22*Math.cos(now*.075);
  const waterX=currentX+swell.x,waterY=currentY+swell.y;
  const relativeX=p.vx/S-waterX,relativeY=p.vy/S-waterY;
  const forward=relativeX*headingX+relativeY*headingY;
  const lateral=-relativeX*headingY+relativeY*headingX;
  // Propeller and rudder cannot change instantaneously. Steering depends on
  // water speed across the rudder, including a modest propeller wash.
  const boosted=now<p.boostingUntil;
  const targetThrottle=input.brake?-Math.min(.48,Math.max(0,forward)*.35):(input.forward||boosted)?1:0;
  p.throttle+=(targetThrottle-p.throttle)*(1-Math.exp(-dt/ .28));
  p.rudder+=(input.turn*.55-p.rudder)*(1-Math.exp(-dt/ .16));
  const thrust=p.throttle*hull.thrust*(boosted?P.boostThrust/P.thrust:1);
  const longitudinalDrag=70*forward+hull.drag*Math.abs(forward)*forward;
  const lateralDrag=(460*lateral+180*Math.abs(lateral)*lateral)*hull.scale;
  const propWash=2.3*Math.max(0,p.throttle);
  const rudderFlow=forward+propWash;
  const rudderForce=clamp(33*p.rudder*rudderFlow*Math.abs(rudderFlow),-2600,2600);
  // Rudder is 1.65 m aft of the center of mass; side-force opposes its yaw.
  const sideForce=-lateralDrag-rudderForce;
  const forceX=(thrust-longitudinalDrag)*headingX-sideForce*headingY;
  const forceY=(thrust-longitudinalDrag)*headingY+sideForce*headingX;
  const torque=rudderForce*1.65-2100*p.omega-950*Math.abs(p.omega)*p.omega;
  p.omega+=torque/inertia*dt;
  p.angle+=p.omega*dt;
  // Wind acts on exposed hull, while wave slopes add gradual acceleration.
  const windX=4+1.5*Math.sin(now*.1),windY=2*Math.cos(now*.08);
  const airX=windX-p.vx/S,airY=windY-p.vy/S;
  const slopeForce=wave?-P.mass*P.gravity*(swell.slope||0)*.6*hull.scale:0;
  p.vx+=(forceX/mass+.004*airX*Math.abs(airX)+slopeForce/mass*Math.cos(wave?.angle||0))*S*dt;
  p.vy+=(forceY/mass+.004*airY*Math.abs(airY)+slopeForce/mass*Math.sin(wave?.angle||0))*S*dt;
  p.x+=p.vx*dt;p.y+=p.vy*dt;
  p.heave=swell.height;
}

export function fireCannon(p,input){
  const distance=clamp(input.distance??400,45,900)/S;
  const v=P.cannonSpeed,g=P.gravity,dy=.6-P.muzzleHeight;
  const discriminant=v**4-g*(g*distance**2+2*dy*v*v);
  const elevation=Math.atan((v*v-Math.sqrt(Math.max(0,discriminant)))/(g*distance));
  const horizontal=v*Math.cos(elevation)*S;
  return {vx:Math.cos(p.aim)*horizontal+p.vx,vy:Math.sin(p.aim)*horizontal+p.vy,
    z:P.muzzleHeight,vz:v*Math.sin(elevation)};
}

export function hullCircles(p){
  const dx=Math.cos(p.angle),dy=Math.sin(p.angle),scale=boatStats(p.boat).scale;
  return [-13,11].map(offset=>({x:p.x+dx*offset*scale,y:p.y+dy*offset*scale,r:14*scale}));
}

export function resolveBoatContact(a,b){
  let contact=null;
  for(const ac of hullCircles(a))for(const bc of hullCircles(b)){
    const dx=bc.x-ac.x,dy=bc.y-ac.y,d=Math.hypot(dx,dy),penetration=ac.r+bc.r-d;
    if(penetration>0&&(!contact||penetration>contact.penetration))contact={nx:d?dx/d:1,ny:d?dy/d:0,penetration,x:(ac.x+bc.x)/2,y:(ac.y+bc.y)/2};
  }
  if(!contact)return 0;
  const ha=boatStats(a.boat),hb=boatStats(b.boat),invA=1/ha.mass,invB=1/hb.mass;
  const {nx,ny,penetration,x,y}=contact;
  a.x-=nx*penetration*invA/(invA+invB);a.y-=ny*penetration*invA/(invA+invB);b.x+=nx*penetration*invB/(invA+invB);b.y+=ny*penetration*invB/(invA+invB);
  const ax=(x-a.x)/S,ay=(y-a.y)/S,bx=(x-b.x)/S,by=(y-b.y)/S;
  const rvx=(b.vx-a.vx)/S-b.omega*by+a.omega*ay;
  const rvy=(b.vy-a.vy)/S+b.omega*bx-a.omega*ax;
  const approach=-(rvx*nx+rvy*ny);
  if(approach<=0)return 0;
  const ca=ax*ny-ay*nx,cb=bx*ny-by*nx;
  const impulse=1.12*approach/(invA+invB+ca*ca/ha.inertia+cb*cb/hb.inertia);
  a.vx-=impulse*nx*invA*S;a.vy-=impulse*ny*invA*S;b.vx+=impulse*nx*invB*S;b.vy+=impulse*ny*invB*S;
  a.omega-=ca*impulse/ha.inertia;b.omega+=cb*impulse/hb.inertia;
  return approach;
}
