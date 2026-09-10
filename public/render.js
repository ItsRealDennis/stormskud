import * as THREE from './vendor/three.module.js';
import { createBoat, createIsland } from './models.js';

const S=12,W=120,H=75;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const random=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const ROCKS=[{x:360,y:265,r:48,island:true},{x:1080,y:635,r:48,island:true},{x:715,y:435,r:57,island:true},{x:1100,y:220,r:33},{x:320,y:670,r:33}];
const waveGLSL=`
uniform float uTime;uniform vec4 uWave;uniform float uWaveOn;
float waveHeight(vec2 p){
  float h=sin(dot(p,vec2(.24,.15))-uTime*1.3)*.19;
  h+=sin(dot(p,vec2(-.32,.40))+uTime*1.75)*.11;
  h+=sin(dot(p,vec2(.72,.53))-uTime*2.15)*.045;
  h+=sin(dot(p,vec2(-1.8,.91))+uTime*2.7)*.022;
  vec2 dir=vec2(cos(uWave.x),sin(uWave.x));
  float d=dot(p-vec2(60.,37.5),dir)-uWave.y;
  h+=uWaveOn*.72*cos(d*.1488)*exp(-pow(d/9.8,2.));return h;
}`;
function oceanMaterial(){return new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0},uWave:{value:new THREE.Vector4()},uWaveOn:{value:0},uRocks:{value:ROCKS.map(r=>new THREE.Vector3(r.x/S,r.y/S,r.r/S))}},
  vertexShader:`${waveGLSL}
    varying vec3 vWorld;varying vec3 vNormal;varying float vHeight;
    void main(){vec3 p=position;float e=.08;float h=waveHeight(p.xz);p.y=h;
    vNormal=normalize(vec3(waveHeight(p.xz-vec2(e,0.))-waveHeight(p.xz+vec2(e,0.)),2.*e,waveHeight(p.xz-vec2(0.,e))-waveHeight(p.xz+vec2(0.,e))));
    vHeight=h;vWorld=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
  fragmentShader:`${waveGLSL}
    uniform vec3 uRocks[5];varying vec3 vWorld;varying vec3 vNormal;varying float vHeight;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    void main(){vec2 uv=vWorld.xz;float fine=noise(uv*3.2+vec2(uTime*.17,-uTime*.12));
    vec3 n=normalize(vNormal+vec3((noise(uv*4.1+uTime*.16)-.5)*.035,0.,(fine-.5)*.035));
    vec3 eye=normalize(cameraPosition-vWorld),light=normalize(vec3(-.45,.75,-.28));
    float fres=pow(1.-max(dot(eye,n),0.),4.);float depth=noise(uv*.035)+.25*noise(uv*.09);
    vec3 deep=mix(vec3(.008,.072,.115),vec3(.018,.19,.235),depth*.75);vec3 refl=reflect(-eye,n);
    vec3 sky=mix(vec3(.24,.39,.48),vec3(.075,.16,.27),clamp(refl.y,0.,1.));sky+=noise(refl.xz*5.+uTime*.015)*.06;
    vec3 col=mix(deep,sky,.17+fres*.55);float spec=pow(max(dot(reflect(-light,n),eye),0.),160.);float broad=pow(max(dot(reflect(-light,n),eye),0.),14.);
    col+=vec3(1.,.83,.57)*(spec*1.8+broad*.08);float shore=0.;
    for(int i=0;i<5;i++){float d=length(uv-uRocks[i].xy)-uRocks[i].z;float edge=1.-smoothstep(-.5,2.6,d);col=mix(col,vec3(.025,.32,.31),edge*.38);float line=pow(max(0.,sin(d*5.-uTime*1.7+noise(uv*2.)*2.)),7.);shore=max(shore,line*edge*smoothstep(-.9,.1,d));}
    float crest=smoothstep(.20,.37,vHeight)*smoothstep(.42,.8,noise(uv*1.6+uTime*.15));
    vec2 dir=vec2(cos(uWave.x),sin(uWave.x));float d=dot(uv-vec2(60.,37.5),dir)-uWave.y;
    float stormFoam=uWaveOn*exp(-pow(d/1.05,2.))*smoothstep(.15,.7,fine);
    col=mix(col,vec3(.68,.9,.87),clamp(shore*.78+crest*.18+stormFoam*.8,0.,.88));
    col=mix(col,vec3(.085,.17,.22),smoothstep(95.,260.,length(cameraPosition-vWorld))*.65);
    col*=.64+.13*noise(uv*.065+vec2(uTime*.019,-uTime*.012));
    gl_FragColor=vec4(col,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`
});}
function makeEnvironment(renderer){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#8cb1c5');
  const sphere=new THREE.Mesh(new THREE.SphereGeometry(80,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,
    vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 vP;void main(){float y=normalize(vP).y;vec3 col=mix(vec3(.25,.42,.51),vec3(.055,.12,.21),smoothstep(0.,1.,y));float sun=pow(max(dot(normalize(vP),normalize(vec3(-.7,.5,-.4))),0.),40.);col+=vec3(2.,1.6,.9)*sun;gl_FragColor=vec4(col,1.);}'
  }));scene.add(sphere);const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromScene(scene,.05,.1,160);pmrem.dispose();sphere.geometry.dispose();sphere.material.dispose();return target;
}
function disposeTree(obj){obj.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}});}

export class SeaRenderer{
  constructor(canvas){
    this.canvas=canvas;this.particles=[];this.wakes=[];this.ships=new Map();this.bulletMeshes=new Map();this.pickupMeshes=new Map();this.time=0;this.active=false;this.cameraReady=false;this.zoom=1;this.lastWake=0;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#17313f');this.scene.fog=new THREE.FogExp2('#17313f',.004);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.quality=Math.min(devicePixelRatio||1,1.5);this.renderer.setPixelRatio(this.quality);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.environment=makeEnvironment(this.renderer);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.7;
    this.camera=new THREE.PerspectiveCamera(44,1,.1,600);this.target=new THREE.Vector3(60,0,37.5);this.raycaster=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
    this.scene.add(new THREE.HemisphereLight('#b5d9eb','#1b4048',2));
    this.sun=new THREE.DirectionalLight('#ffddab',3.1);this.sun.position.set(-15,65,-25);this.sun.target.position.set(60,0,37.5);this.scene.add(this.sun,this.sun.target);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-90,right:90,top:90,bottom:-90,near:1,far:210});this.sun.shadow.camera.updateProjectionMatrix();this.sun.shadow.bias=-.0003;this.sun.shadow.normalBias=.04;
    const rim=new THREE.DirectionalLight('#71c9e8',1.5);rim.position.set(80,20,90);this.scene.add(rim);
    const oceanGeo=new THREE.PlaneGeometry(380,300,240,190);oceanGeo.rotateX(-Math.PI/2);oceanGeo.translate(60,0,37.5);this.water=new THREE.Mesh(oceanGeo,oceanMaterial());this.water.frustumCulled=false;this.scene.add(this.water);
    this.shadowWater=new THREE.Mesh(new THREE.PlaneGeometry(180,130),new THREE.ShadowMaterial({opacity:.22}));this.shadowWater.rotation.x=-Math.PI/2;this.shadowWater.position.set(60,.015,37.5);this.shadowWater.receiveShadow=true;this.scene.add(this.shadowWater);
    this.islands=new THREE.Group();this.scene.add(this.islands);ROCKS.forEach((r,i)=>{const island=createIsland(r,i);island.position.set(r.x/S,0,r.y/S);this.islands.add(island);});
    this.homeScene=new THREE.Group();this.scene.add(this.homeScene);this.hero=createBoat({boat:'cutter',color:'#ffbf70',livery:'royal'});this.hero.scale.setScalar(2.8);this.hero.position.set(60,0,40);this.hero.rotation.y=-.15;this.homeScene.add(this.hero);
    const distant=createIsland({r:65,island:true},0);distant.position.set(39,0,13);distant.scale.setScalar(1.35);this.homeScene.add(distant);const rocks=createIsland({r:43,island:true},2);rocks.position.set(87,0,20);this.homeScene.add(rocks);
    this.boundary=new THREE.Group();this.scene.add(this.boundary);this.buildBoundary();
    this.labels=document.createElement('div');this.labels.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden';canvas.parentElement.append(this.labels);
    this.mapCanvas=document.createElement('canvas');this.mapCanvas.className='sea-radar';this.mapCanvas.width=230;this.mapCanvas.height=140;this.mapCanvas.setAttribute('aria-label','Søkort med alle skibes position');const bottom=document.querySelector('.sidebar-bottom');bottom?.parentElement.insertBefore(this.mapCanvas,bottom);
    this.particleGeo=new THREE.BufferGeometry();this.particlePositions=new Float32Array(1800*3);this.particleColors=new Float32Array(1800*3);this.particleGeo.setAttribute('position',new THREE.BufferAttribute(this.particlePositions,3));this.particleGeo.setAttribute('color',new THREE.BufferAttribute(this.particleColors,3));this.particleGeo.setDrawRange(0,0);this.particlePoints=new THREE.Points(this.particleGeo,new THREE.PointsMaterial({size:.16,vertexColors:true,transparent:true,opacity:.85,depthWrite:false}));this.particlePoints.frustumCulled=false;this.scene.add(this.particlePoints);
    this.rain=this.makeRain();this.scene.add(this.rain);
    this.cursorRing=new THREE.Mesh(new THREE.RingGeometry(.55,.61,40),new THREE.MeshBasicMaterial({color:'#d5f8e9',transparent:true,opacity:.6,depthWrite:false,side:THREE.DoubleSide}));this.cursorRing.rotation.x=-Math.PI/2;this.scene.add(this.cursorRing);this.pointer=null;
    canvas.addEventListener('pointermove',e=>{this.pointer={x:e.clientX,y:e.clientY};});canvas.addEventListener('pointerleave',()=>this.pointer=null);canvas.addEventListener('wheel',e=>{if(this.active){e.preventDefault();this.zoom=clamp(this.zoom+e.deltaY*.0007,.8,1.5);}},{passive:false});
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;const notice=document.createElement('div');notice.className='reconnect';notice.textContent='3D-grafikken blev afbrudt. Genindlæs siden for at fortsætte.';canvas.parentElement.append(notice);});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  }
  resize(){const r=this.canvas.getBoundingClientRect();this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);this.renderer.setSize(this.width,this.height,false);this.layout();}
  layout(){const side=this.width<=800?175:this.width<=1100?240:270;this.viewport={x:0,y:0,width:this.width-(this.active?side:0),height:this.height};this.camera.aspect=this.viewport.width/this.viewport.height;this.camera.updateProjectionMatrix();}
  worldPoint(clientX,clientY){const r=this.canvas.getBoundingClientRect(),v=this.viewport;const pointer=new THREE.Vector2((clientX-r.left-v.x)/v.width*2-1,1-(clientY-r.top-v.y)/v.height*2);this.raycaster.setFromCamera(pointer,this.camera);const out=new THREE.Vector3();return this.raycaster.ray.intersectPlane(this.plane,out)?{x:out.x*S,y:out.z*S}:{x:720,y:450};}
  screenPoint(x,y,height=0){const p=new THREE.Vector3(x/S,height,y/S).project(this.camera),r=this.canvas.getBoundingClientRect(),v=this.viewport;return{x:r.left+v.x+(p.x+1)*v.width/2,y:r.top+v.y+(1-p.y)*v.height/2,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1};}
  buildBoundary(){
    const pts=[[1.7,1.7],[118.3,1.7],[118.3,73.3],[1.7,73.3],[1.7,1.7]].map(([x,z])=>new THREE.Vector3(x,.13,z));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineDashedMaterial({color:'#b7d9c2',dashSize:1.2,gapSize:.7,transparent:true,opacity:.4}));line.computeLineDistances();this.boundary.add(line);
    const floats=new THREE.MeshStandardMaterial({color:'#d99656',roughness:.5,metalness:.25}),dark=new THREE.MeshStandardMaterial({color:'#26454d',roughness:.4});
    for(let i=0;i<30;i++){let x,z;if(i<10){x=2+i*12.9;z=1.7;}else if(i<20){x=2+(i-10)*12.9;z=73.3;}else{x=i<25?1.7:118.3;z=13+(i%5)*12;}const g=new THREE.Group(),base=new THREE.Mesh(new THREE.CylinderGeometry(.3,.46,.6,12),floats),pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.04,1.2,8),dark);base.position.y=.13;pole.position.y=.8;g.add(base,pole);g.position.set(x,0,z);this.boundary.add(g);}
  }
  makeRain(){const g=new THREE.BufferGeometry(),p=new Float32Array(260*6);for(let i=0;i<260;i++){const x=random(i)*160-20,y=random(i+300)*35,z=random(i+600)*110-15;p.set([x,y,z,x-.1,y+.7,z+.15],i*6);}g.setAttribute('position',new THREE.BufferAttribute(p,3));return new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:'#a9c5d8',transparent:true,opacity:.14,depthWrite:false}));}
  burst(x,y,count,color,speed=50,life=.8,kind='spark'){const rgb=new THREE.Color(color);for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,v=Math.random()*speed/S;this.particles.push({x:x/S,y:kind==='smoke'?.6:.12,z:y/S,vx:Math.cos(a)*v,vy:kind==='smoke'?.6+Math.random():1+Math.random()*2.5,vz:Math.sin(a)*v,life:life*(.5+Math.random()*.5),max:life,color:rgb.clone(),kind});}if(this.particles.length>1600)this.particles.splice(0,this.particles.length-1600);}
  event(e){const item=this.ships.get(e.player);
    if(e.type==='shot'){if(item){item.shotAt=this.time;item.flash.visible=true;}this.burst(e.x,e.y,14,'#ffd391',70,.28);this.burst(e.x,e.y,12,'#b2bac0',15,.8,'smoke');}
    if(e.type==='hit'){this.burst(e.x,e.y,28,'#ffc47c',85,.55);if(item)item.hitAt=this.time;}
    if(e.type==='splash')this.burst(e.x,e.y,18,'#b8e9e7',65,.7,'water');
    if(e.type==='sink'){this.burst(e.x,e.y,52,'#ffab53',110,.75);this.burst(e.x,e.y,70,'#bededd',90,1.2,'water');this.burst(e.x,e.y,40,'#6e7a80',22,1.8,'smoke');if(item)item.sinkAt=this.time;}
    if(e.type==='respawn'){if(item)item.sinkAt=null;this.burst(e.x,e.y,28,'#a9e7de',55,.7,'water');}
    if(e.type==='wavehit')this.burst(e.x,e.y,20,'#d3eee9',45,.6,'water');if(e.type==='pickup')this.burst(e.x,e.y,28,'#b8efac',50,.85);
  }
  makeShip(p){const boat=createBoat({boat:p.boat,color:p.color,livery:p.livery});this.scene.add(boat);
    const ring=new THREE.Mesh(new THREE.RingGeometry(2.95,3.015,64),new THREE.MeshBasicMaterial({color:'#8cebd6',transparent:true,opacity:.6,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;this.scene.add(ring);
    const shield=new THREE.Mesh(new THREE.SphereGeometry(3.15,24,12),new THREE.MeshPhysicalMaterial({color:'#83dfde',transparent:true,opacity:.1,roughness:.15,metalness:.15,depthWrite:false,side:THREE.DoubleSide}));shield.scale.y=.6;this.scene.add(shield);
    const flash=new THREE.Mesh(new THREE.SphereGeometry(.44,8,6),new THREE.MeshBasicMaterial({color:'#ffdb90',transparent:true,opacity:.9}));flash.visible=false;this.scene.add(flash);
    const label=document.createElement('div');label.className='ship-label';const name=document.createElement('span');name.textContent=p.name;const hp=document.createElement('div');hp.className='ship-hp';for(let i=0;i<4;i++)hp.append(document.createElement('i'));label.append(name,hp);this.labels.append(label);
    return{boat,ring,shield,flash,label,name,hp,shotAt:-10,sinkAt:null,key:`${p.boat}:${p.color}:${p.livery}`};
  }
  removeShip(id){const item=this.ships.get(id);if(!item)return;for(const obj of[item.boat,item.ring,item.shield,item.flash]){this.scene.remove(obj);disposeTree(obj);}item.label.remove();this.ships.delete(id);}
  updateShips(state,me,dt){const ids=new Set(state.players.map(p=>p.id));for(const id of this.ships.keys())if(!ids.has(id))this.removeShip(id);const now=state.now,t=this.time;
    for(const p of state.players){let item=this.ships.get(p.id);const key=`${p.boat}:${p.color}:${p.livery}`;if(item&&item.key!==key){this.removeShip(p.id);item=null;}if(!item){item=this.makeShip(p);this.ships.set(p.id,item);}
      const alive=p.hp>0,sink=item.sinkAt===null?99:t-item.sinkAt;item.boat.visible=alive||sink<1.5;const height=this.heightAt(p.x/S,p.y/S,t)+(p.heave||0)*.55;
      item.boat.position.set(p.x/S,alive?height:-sink*2,p.y/S);item.boat.rotation.set(this.reduced?0:Math.sin(t*1.4+p.x)*.025,-p.angle,alive?(this.reduced?0:Math.sin(t*1.8+p.y)*.028):Math.min(sink*.65,1.3));
      const turret=item.boat.userData.turret;if(turret)turret.rotation.y=-(p.aim-p.angle);const barrel=item.boat.userData.barrel;if(barrel){if(!barrel.userData.base)barrel.userData.base=barrel.position.clone();barrel.position.x=barrel.userData.base.x-Math.max(0,1-(t-item.shotAt)/.16)*.16;}
      item.ring.visible=alive&&p.id===me;item.ring.position.set(p.x/S,.25+height,p.y/S);item.shield.visible=alive&&p.protectedUntil>now;item.shield.position.set(p.x/S,.6+height,p.y/S);item.flash.visible=t-item.shotAt<.065;item.flash.position.set(p.x/S+Math.cos(p.aim)*2.7,height+1.2,p.y/S+Math.sin(p.aim)*2.7);
      const q=this.screenPoint(p.x,p.y,3.8),rect=this.canvas.getBoundingClientRect();item.label.hidden=!alive||!q.visible;item.label.style.left=`${q.x-rect.left}px`;item.label.style.top=`${q.y-rect.top}px`;item.label.classList.toggle('self',p.id===me);item.label.style.setProperty('--ship',p.color);item.name.textContent=p.name+(p.id===me?' · DIG':p.bot?' · BOT':'')+(!p.connected?' · AFBRUDT':'');[...item.hp.children].forEach((e,k)=>e.classList.toggle('empty',k>=p.hp));
      if(alive&&Math.hypot(p.vx,p.vy)>9&&t-this.lastWake>.055){this.wakes.push({x:(p.x-Math.cos(p.angle)*28)/S,z:(p.y-Math.sin(p.angle)*28)/S,angle:p.angle,life:1.9,max:1.9});}
    }if(t-this.lastWake>.055)this.lastWake=t;
  }
  heightAt(x,z,t){return Math.sin(x*.24+z*.15-t*1.3)*.19+Math.sin(-x*.32+z*.4+t*1.75)*.11;}
  updateBullets(state){const ids=new Set(state.bullets.map(p=>p.id));for(const[id,o]of this.bulletMeshes)if(!ids.has(id)){this.scene.remove(o);disposeTree(o);this.bulletMeshes.delete(id);}for(const b of state.bullets){let mesh=this.bulletMeshes.get(b.id);if(!mesh){mesh=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),new THREE.MeshStandardMaterial({color:'#ffc985',emissive:'#ff9a3d',emissiveIntensity:1.2,roughness:.3}));this.bulletMeshes.set(b.id,mesh);this.scene.add(mesh);}mesh.visible=true;mesh.position.set(b.x/S,b.z||.15,b.y/S);}}
  updatePickups(state){const ids=new Set(state.pickups.map(p=>p.id));for(const[id,o]of this.pickupMeshes)if(!ids.has(id)){this.scene.remove(o);disposeTree(o);this.pickupMeshes.delete(id);}for(const p of state.pickups){let group=this.pickupMeshes.get(p.id);if(!group){group=new THREE.Group();const color=p.kind==='repair'?'#92dfad':p.kind==='rapid'?'#ffbc6f':'#b4a1ff';const box=new THREE.Mesh(new THREE.BoxGeometry(1.1,.75,1.1),new THREE.MeshStandardMaterial({color:'#e1cfa9',roughness:.6,metalness:.1}));box.castShadow=true;group.add(box);const glow=new THREE.Mesh(new THREE.TorusGeometry(.95,.035,6,32),new THREE.MeshBasicMaterial({color}));glow.rotation.x=Math.PI/2;glow.position.y=-.32;group.add(glow);
      const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.beginPath();ctx.arc(64,64,56,0,Math.PI*2);ctx.fill();ctx.font='bold 90px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#133643';ctx.fillText(p.kind==='repair'?'+':p.kind==='rapid'?'»':'ϟ',64,69);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthWrite:false}));sprite.position.y=1.5;sprite.scale.set(1.2,1.2,1);group.add(sprite);this.pickupMeshes.set(p.id,group);this.scene.add(group);}group.visible=true;group.position.set(p.x/S,.55+Math.sin(this.time*2+p.id)*.14,p.y/S);group.rotation.y=this.time*.2;}}
  updateParticles(dt){this.particles=this.particles.filter(p=>(p.life-=dt)>0);let count=0;for(const p of this.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vx*=Math.exp(-dt*1.3);p.vz*=Math.exp(-dt*1.3);p.vy-=p.kind==='smoke'?0:dt*5;this.particlePositions.set([p.x,Math.max(p.kind==='water'?.04:-1,p.y),p.z],count*3);const f=Math.min(1,p.life/p.max*2);this.particleColors.set([p.color.r*f,p.color.g*f,p.color.b*f],count*3);count++;}
    this.wakes=this.wakes.filter(p=>(p.life-=dt)>0);for(const p of this.wakes){if(count>1760)break;const age=p.max-p.life,dx=Math.cos(p.angle),dz=Math.sin(p.angle);for(const side of[-1,1]){const width=1+age*.7;this.particlePositions.set([p.x-dx*age*.4-dz*side*width,.11+this.heightAt(p.x,p.z,this.time),p.z-dz*age*.4+dx*side*width],count*3);const f=p.life/p.max*.75;this.particleColors.set([.35*f,.72*f,.71*f],count*3);count++;}}
    this.particleGeo.setDrawRange(0,count);this.particleGeo.attributes.position.needsUpdate=true;this.particleGeo.attributes.color.needsUpdate=true;
  }
  drawRadar(state,me){const c=this.mapCanvas.getContext('2d');c.clearRect(0,0,230,140);c.fillStyle='#071f2bcc';c.fillRect(0,0,230,140);c.strokeStyle='#7aadab40';c.strokeRect(5,5,220,130);c.fillStyle='#82aab4';c.font='8px Arial';c.fillText('SØKORT / N ↑',13,17);for(const r of state.rocks){c.fillStyle='#628078';c.beginPath();c.arc(8+r.x/1440*214,10+r.y/900*120,r.r/1440*214,0,Math.PI*2);c.fill();}for(const p of state.players){if(p.hp<=0)continue;c.save();c.translate(8+p.x/1440*214,10+p.y/900*120);c.rotate(p.angle);c.fillStyle=p.id===me?'#f6efd2':p.color;c.beginPath();c.moveTo(4,0);c.lineTo(-3,-2.5);c.lineTo(-3,2.5);c.closePath();c.fill();if(p.id===me){c.strokeStyle='#e8fff2';c.beginPath();c.arc(0,0,6,0,Math.PI*2);c.stroke();}c.restore();}}
  draw(state,me,dt,time,active){
    if(this.contextLost)return;
    // The blurred harbour background can retain its last frame while cards render.
    if(document.getElementById('harbour')?.open){this.lastFrame=time;return;}
    const gap=time-(this.lastFrame??time);this.lastFrame=time;
    this.frameAverage=(this.frameAverage??20)*.96+Math.min(gap,250)*.04;
    if((this.qualityAt??0)+5000<time&&this.frameAverage>48&&this.quality>.7){this.quality=Math.max(.7,this.quality*.8);this.renderer.setPixelRatio(this.quality);this.renderer.setSize(this.width,this.height,false);this.qualityAt=time;}
    this.time=time/1000;const t=this.reduced?this.time*.25:this.time;
    if(this.active!==active){this.active=active;this.layout();this.cameraReady=false;for(const id of this.ships.keys())this.removeShip(id);for(const collection of[this.bulletMeshes,this.pickupMeshes]){for(const object of collection.values()){this.scene.remove(object);disposeTree(object);}collection.clear();}this.wakes=[];this.particles=[];}
    this.islands.visible=this.boundary.visible=active;this.homeScene.visible=!active;this.shadowWater.visible=active;this.labels.hidden=!active;this.mapCanvas.hidden=!active;this.water.material.uniforms.uTime.value=t;
    if(this.rockMode!==active){this.rockMode=active;this.water.material.uniforms.uRocks.value=active?ROCKS.map(r=>new THREE.Vector3(r.x/S,r.y/S,r.r/S)):[new THREE.Vector3(39,13,65/S*1.35),new THREE.Vector3(87,20,43/S),...Array.from({length:3},()=>new THREE.Vector3(-500,-500,0))];}
    const wave=state?.wave;this.water.material.uniforms.uWaveOn.value=wave&&state.now>=wave.startsAt?1:0;if(wave){const extent=Math.abs(Math.cos(wave.angle))*W+Math.abs(Math.sin(wave.angle))*H;const front=-extent/2-80/S+(state.now-wave.startsAt)/wave.duration*(extent+160/S);this.water.material.uniforms.uWave.value.set(wave.angle,front,0,0);}
    if(active&&state){const p=state.players.find(p=>p.id===me),focus=p?new THREE.Vector3(clamp(p.x/S*.64+60*.36,22,98),0,clamp(p.y/S*.64+37.5*.36,16,59)):new THREE.Vector3(60,0,37.5);this.target.lerp(focus,this.cameraReady?1-Math.exp(-dt*3):1);const cam=this.target.clone().add(new THREE.Vector3(0,57*this.zoom,43*this.zoom));this.camera.position.lerp(cam,this.cameraReady?1-Math.exp(-dt*4):1);this.camera.lookAt(this.target);this.camera.updateMatrixWorld();this.cameraReady=true;this.updateShips(state,me,dt);this.updateBullets(state);this.updatePickups(state);this.drawRadar(state,me);if(this.pointer){const point=this.worldPoint(this.pointer.x,this.pointer.y);this.cursorRing.position.set(point.x/S,.23,point.y/S);this.cursorRing.visible=state.phase==='playing';}else this.cursorRing.visible=false;
    }else{this.camera.position.set(77+Math.sin(t*.07)*1.2,17,62);this.target.set(59,1.2,39);this.camera.lookAt(this.target);this.camera.updateMatrixWorld();this.hero.position.y=this.heightAt(60,40,t);this.hero.rotation.z=Math.sin(t*.8)*.035;this.hero.rotation.x=Math.sin(t*.7)*.035;const turret=this.hero.userData.turret;if(turret)turret.rotation.y=-.1+Math.sin(t*.16)*.15;this.cursorRing.visible=false;for(const obj of this.bulletMeshes.values())obj.visible=false;for(const obj of this.pickupMeshes.values())obj.visible=false;if(t-this.lastWake>.09){this.lastWake=t;this.wakes.push({x:54,z:40,angle:0,life:2,max:2});}}
    this.rain.visible=!this.reduced;this.rain.position.y=-(this.time*9)%25;this.updateParticles(dt);this.renderer.setViewport(0,0,this.viewport.width,this.viewport.height);this.renderer.setScissor(0,0,this.viewport.width,this.viewport.height);this.renderer.setScissorTest(true);this.renderer.render(this.scene,this.camera);this.renderer.setScissorTest(false);
  }
}
