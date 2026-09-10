import * as THREE from './vendor/three.module.js';

// All models are original procedural geometry. The hulls are built in metres,
// with their bows pointing along +X and the waterline at Y=0.
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const woodColors = ['#ad8461', '#bd936b', '#c9a077', '#b68d65'];
const mat = (color, roughness = .55, metalness = .05, options = {}) => new THREE.MeshStandardMaterial({color, roughness, metalness, ...options});

// Bake static fittings into material batches. The boats deliberately retain
// their original detail, but rendering a handrail no longer costs a draw call.
// Turret and barrel are batched separately so they remain independently animated.
function batchMeshes(root, exclude = new Set()) {
  root.updateWorldMatrix(true,true);
  const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert();
  const sources=[],buckets=new Map(),sourceGeometries=new Set();
  const collect=node=>{if(exclude.has(node))return;if(node.isMesh)sources.push(node);for(const child of node.children)collect(child);};
  collect(root);
  const point=new THREE.Vector3(),normal=new THREE.Vector3();
  for(const source of sources) {
    const geometry=source.geometry;sourceGeometries.add(geometry);
    if(!geometry.attributes.normal)geometry.computeVertexNormals();
    const transform=new THREE.Matrix4().multiplyMatrices(inverse,source.matrixWorld);
    const normalTransform=new THREE.Matrix3().getNormalMatrix(transform);
    const attrs=geometry.attributes,index=geometry.index;
    const groups=Array.isArray(source.material)?geometry.groups:[{start:0,count:index?index.count:attrs.position.count,materialIndex:0}];
    for(const group of groups) {
      const material=Array.isArray(source.material)?source.material[group.materialIndex]:source.material;
      const key=JSON.stringify([material.type,material.color.getHex(),material.roughness,material.metalness,material.vertexColors,
        material.emissive.getHex(),material.emissiveIntensity,material.side,material.transparent,material.opacity,material.flatShading,
        material.depthWrite,material.alphaTest,source.castShadow,source.receiveShadow]);
      let bucket=buckets.get(key);
      if(!bucket){bucket={material,position:[],normal:[],uv:[],color:[],cast:source.castShadow,receive:source.receiveShadow};buckets.set(key,bucket);}
      const end=Math.min(group.start+group.count,index?index.count:attrs.position.count);
      for(let i=group.start;i<end;i++) {
        const v=index?index.getX(i):i;
        point.fromBufferAttribute(attrs.position,v).applyMatrix4(transform);bucket.position.push(point.x,point.y,point.z);
        normal.fromBufferAttribute(attrs.normal,v).applyMatrix3(normalTransform).normalize();bucket.normal.push(normal.x,normal.y,normal.z);
        bucket.uv.push(attrs.uv?attrs.uv.getX(v):0,attrs.uv?attrs.uv.getY(v):0);
        bucket.color.push(attrs.color?attrs.color.getX(v):1,attrs.color?attrs.color.getY(v):1,attrs.color?attrs.color.getZ(v):1);
      }
    }
  }
  for(const source of sources)source.removeFromParent();
  for(const bucket of buckets.values()) {
    const g=new THREE.BufferGeometry();
    for(const [name,size] of [['position',3],['normal',3],['uv',2],['color',3]])g.setAttribute(name,new THREE.Float32BufferAttribute(bucket[name],size));
    g.computeBoundingBox();g.computeBoundingSphere();
    const m=new THREE.Mesh(g,bucket.material);m.name='batched-fittings';m.castShadow=bucket.cast;m.receiveShadow=bucket.receive;root.add(m);
  }
  sourceGeometries.forEach(g=>g.dispose());
}

function mesh(parent, geometry, material, x=0, y=0, z=0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; parent.add(m); return m;
}
function box(p, m, x,y,z, sx,sy,sz) { return mesh(p,new THREE.BoxGeometry(sx,sy,sz),m,x,y,z); }
function cyl(p,m,x,y,z,r,h,top=r,segments=20) { return mesh(p,new THREE.CylinderGeometry(top,r,h,segments),m,x,y,z); }
function rod(p,m,a,b,r=.025,segments=8) {
  const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),d=vb.clone().sub(va);
  const o=mesh(p,new THREE.CylinderGeometry(r,r,d.length(),segments),m);
  o.position.copy(va).add(vb).multiplyScalar(.5); o.quaternion.setFromUnitVectors(UP,d.normalize()); return o;
}
function tube(p,m,points,r=.025,closed=false) {
  const curve=new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v)),closed,'catmullrom',.25);
  return mesh(p,new THREE.TubeGeometry(curve,Math.max(12,points.length*3),r,6,closed),m);
}
function roundedBlock(p,m,x,y,z,w,h,d,r=.07) {
  r=Math.min(r,w/4,d/4,h/4);
  w-=r*2;d-=r*2;
  const s=new THREE.Shape();
  s.moveTo(-w/2+r,-d/2);s.lineTo(w/2-r,-d/2);s.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);
  s.lineTo(w/2,d/2-r);s.quadraticCurveTo(w/2,d/2,w/2-r,d/2);s.lineTo(-w/2+r,d/2);
  s.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);s.lineTo(-w/2,-d/2+r);s.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);
  const g=new THREE.ExtrudeGeometry(s,{depth:h-2*r,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:r,bevelThickness:r,curveSegments:4});
  g.rotateX(-Math.PI/2);g.translate(0,-h/2+r,0);return mesh(p,g,m,x,y,z);
}
function lifeRing(p,x,y,z,orange,cream,scale=1) {
  const ring=new THREE.Group();ring.position.set(x,y,z);ring.scale.setScalar(scale);p.add(ring);
  mesh(ring,new THREE.TorusGeometry(.175,.043,7,24),cream);
  for(let i=0;i<4;i++) {const t=mesh(ring,new THREE.TorusGeometry(.176,.046,7,5,Math.PI*.20),orange);t.rotation.z=i*Math.PI/2-.16;}
  return ring;
}
function tire(p,x,y,z,black,scale=1) {
  const t=mesh(p,new THREE.TorusGeometry(.19*scale,.07*scale,7,16),black,x,y,z);t.rotation.x=.08;
  return t;
}
function porthole(p,x,y,z,r,brass,glass) {
  const rim=mesh(p,new THREE.TorusGeometry(r,.024,6,18),brass,x,y,z);
  const pane=mesh(p,new THREE.CircleGeometry(r*.88,20),glass,x,y,z+(z<0?-.004:.004));
  if(z<0){rim.rotation.y=Math.PI;pane.rotation.y=Math.PI;}
}

const hullStations = [
  [-2.32,.72],[-2.18,.91],[-1.70,1.02],[-1.0,1.07],[-.1,1.08],[.8,.98],[1.48,.76],[2.03,.43],[2.45,.015],
];
const hullCurve = new THREE.CatmullRomCurve3(hullStations.map(([x,w])=>new THREE.Vector3(x,w,0)),false,'centripetal');
const hullProfile = hullCurve.getPoints(40).map(v=>[v.x,v.y]);
const hullSection = [[-1,.55],[-1.013,.43],[-.989,.20],[-.91,-.10],[-.70,-.43],[-.35,-.64],[0,-.70],[.35,-.64],[.70,-.43],[.91,-.10],[.989,.20],[1.013,.43],[1,.55]];
function hullGeometry(profile,width=1) {
  const points=[],colors=[],indices=[];
  for(let i=0;i<profile.length;i++) for(let j=0;j<hullSection.length;j++) {
    const [x,w]=profile[i],[z,y]=hullSection[j];
    points.push(x,y,z*w*width);
    const light= .75+Math.max(0,y)*.40; colors.push(light,light,light);
  }
  const g=new THREE.BufferGeometry();
  for(let i=0;i<profile.length-1;i++)for(let j=0;j<hullSection.length-1;j++) {
    const a=i*hullSection.length+j,b=a+hullSection.length;
    const start=indices.length;indices.push(a,b,a+1,b,b+1,a+1);
    g.addGroup(start,6,j>2&&j<9?1:0);
  }
  // Transom, closed separately to preserve its hard edge.
  g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function hullOutline(profile,width=1) {
  return [...profile.map(([x,w])=>[x,w*width]),...profile.slice().reverse().map(([x,w])=>[x,-w*width])];
}
function deckShape(profile,width=1) {
  const s=new THREE.Shape(),outline=hullOutline(profile,width);
  outline.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();return s;
}
function widthAt(x,profile) {
  for(let i=1;i<profile.length;i++)if(x<=profile[i][0]) {const a=profile[i-1],b=profile[i],t=(x-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t;}
  return .01;
}
function buildHull(p,palette,type,livery) {
  const width=type==='tug'?1.12:type==='skiff'?.83:1;
  mesh(p,hullGeometry(hullProfile,width),[palette.hullPaint,palette.bottom]);
  // Squared stern, with an inset ribbed engine plate.
  const stern=new THREE.Shape();hullSection.forEach(([z,y],i)=>i?stern.lineTo(z*hullProfile[0][1]*width,y):stern.moveTo(z*hullProfile[0][1]*width,y));stern.closePath();
  const sg=new THREE.ShapeGeometry(stern);sg.rotateY(-Math.PI/2);mesh(p,sg,palette.paint,-2.325,0,0);
  const dg=new THREE.ExtrudeGeometry(deckShape(hullProfile,width*.96),{depth:.09,bevelEnabled:false,curveSegments:12});dg.rotateX(-Math.PI/2);mesh(p,dg,palette.deckBase,0,.47,0);
  // Individual, fitted deck planks and their seams remain visible in the harbour view.
  for(let x=-2.18;x<2.24;x+=.17) {
    const w=Math.max(.03,Math.min(widthAt(x-.075,hullProfile),widthAt(x+.075,hullProfile))*width*.925);
    box(p,palette.woods[Math.floor((x+2.2)/.17)%4],x,.572,0,.155,.017,w*2);
    if(w>.40)for(const side of[-1,1])cyl(p,palette.iron,x,.584,side*w*.78,.007,.006,.007,5);
  }
  const sheer=hullOutline(hullProfile,width).map(([x,z])=>[x,.575,z]);tube(p,palette.trim,sheer,.044,true);
  tube(p,palette.iron,hullOutline(hullProfile,width*1.012).map(([x,z])=>[x,.35,z]),.034,true);
  for(const side of[-1,1]) {
    // A white waterline stripe is modeled onto the hull rather than painted on a plane.
    tube(p,livery==='royal'?palette.gold:palette.cream,hullProfile.map(([x,w])=>[x,.205,side*w*width*.99]),.035);
    const railStations=hullStations.slice(0,8);
    const railPts=railStations.map(([x,w])=>[x,.97,side*w*width*.91]);
    if(type!=='skiff') {
      tube(p,palette.rail,railPts,.019);
      for(let i=0;i<railPts.length;i+=2)rod(p,palette.rail,[railPts[i][0],.60,railPts[i][2]],railPts[i],.015);
      tube(p,palette.rail,railPts.map(v=>[v[0],.78,v[2]]),.011);
    } else {
      tube(p,palette.rail,hullStations.slice(3,8).map(([x,w])=>[x,.79,side*w*width*.88]),.022);
      for(const x of[.8,1.7])rod(p,palette.rail,[x,.57,side*widthAt(x,hullProfile)*width*.89],[x,.78,side*widthAt(x,hullProfile)*width*.89],.016);
    }
    for(const x of type==='tug'?[-1.9,-1.2,-.4,.4,1.1]:[-1.85,-.50]) {
      const z=side*(widthAt(x,hullProfile)*width+ .05);tire(p,x,.30,z,palette.rubber,type==='tug'?1.12:.78);
      rod(p,palette.rope,[x,.69,z-side*.05],[x,.44,z],.023);
    }
    // Golden brightwork and optional regatta markings are actual deck fixtures.
    if(livery==='racing')for(const z of[side*.58,side*.80])box(p,palette.cream,-.5,.588,z*width,2.95,.006,.090);
    if(livery==='dazzle')for(let i=0;i<5;i++) {
      const x=-1.8+i*.6, zz=side*(widthAt(x,hullProfile)*width+.003);
      const badge=box(p,palette.dazzle,x,.40,zz,.31,.26,.012);badge.rotation.z=-.45;
    }
    for(const x of[-2.03,1.57]) {
      const z=side*widthAt(x,hullProfile)*width*.60;
      cyl(p,palette.iron,x,.635,z,.038,.11,.038,8);rod(p,palette.trim,[x-.12,.68,z],[x+.12,.68,z],.026);
    }
  }
  // Rudder and propeller peek through the water at the transom.
  box(p,palette.iron,-2.42,-.36,0,.04,.50,.35);rod(p,palette.brass,[-2.13,-.44,0],[-2.54,-.44,0],.06);
  for(let i=0;i<3;i++) {
    const prop=new THREE.Group();prop.position.set(-2.55,-.44,0);prop.rotation.x=i*TAU/3;
    const blade=box(prop,palette.brass,0,.16,0,.036,.25,.12);blade.rotation.y=.4;p.add(prop);
  }
}
function gun(p, palette, type) {
  const turret=new THREE.Group();turret.position.set(type==='skiff'?.89:.76,.59,0);p.add(turret);
  cyl(turret,palette.iron,0,.075,0,.41,.15);cyl(turret,palette.brass,0,.16,0,.345,.03);
  roundedBlock(turret,palette.gun,-.03,.31,0,.64,.30,.58,.04);
  const barrel=new THREE.Group();barrel.position.set(.20,.37,0);turret.add(barrel);
  const main=cyl(barrel,palette.gun,.47,0,0,.089,1.05,.074,18);main.rotation.z=-Math.PI/2;
  for(const x of[.02,.23,.90]) {const band=cyl(barrel,palette.brass,x,0,0,.102,.06,.102,16);band.rotation.z=-Math.PI/2;}
  const muzzle=cyl(barrel,palette.iron,1.02,0,0,.102,.18,.11,18);muzzle.rotation.z=-Math.PI/2;
  const hole=mesh(barrel,new THREE.CircleGeometry(.071,18),palette.black,1.113,0,0);hole.rotation.y=Math.PI/2;
  for(const s of[-1,1]) {const pivot=cyl(turret,palette.brass,.05,.33,s*.315,.095,.035);pivot.rotation.x=Math.PI/2;}
  rod(turret,palette.rail,[-.35,.4,-.22],[-.35,.4,.22],.025);
  p.userData.turret=turret;p.userData.barrel=barrel;p.userData.muzzle=new THREE.Vector3(1.32,.37,0);
}
function cabin(p,palette,type) {
  const tug=type==='tug';
  const cx=tug?-.93:-1.03, cz=0, base=.65, width=tug?1.42:1.28, height=tug?1.22:1.0;
  roundedBlock(p,palette.cream,cx,base+height*.5,cz,1.13,height,width,.06);
  roundedBlock(p,palette.paint,cx,base+.18,cz,1.18,.35,width+.04,.04);
  // Deep teal glass with cool reflections and individual mullions.
  const front=cx+.575;
  for(const side of[-1,1]) {
    const z=side*(width/2+.008);
    for(let i=0;i<2;i++)box(p,palette.glass,cx-.30+i*.43,base+height*.70,z,.355,height*.32,.018);
    box(p,palette.rail,cx-.085,base+height*.7,z+side*.01,.026,height*.37,.029);
    box(p,palette.glassReflection,cx-.25,base+height*.80,z+side*.016,.11,.025,.005);
    box(p,palette.iron,cx-.365,base+.26,z,.014,.105,.025);
    porthole(p,cx+.2,base+.25,z,.11,palette.brass,palette.glass);
    lifeRing(p,cx-.21,base+.33,side*(width/2+.045),palette.orange,palette.cream,.82);
  }
  for(const z of[-width*.255,width*.255]) {
    box(p,palette.glass,front,base+height*.7,z,.022,height*.32,width*.40);
    rod(p,palette.iron,[front+.016,base+height*.55,z-.09],[front+.02,base+height*.83,z+.1],.010,5);
  }
  roundedBlock(p,palette.roof,cx-.02,base+height+.045,0,1.35,.14,width+.24,.06);
  tube(p,palette.trim,[[cx-.62,base+height+.13,-width*.52],[cx+.50,base+height+.13,-width*.52],[cx+.50,base+height+.13,width*.52],[cx-.62,base+height+.13,width*.52]],.018,true);
  box(p,palette.iron,cx-.595,base+.35,0,.02,.57,.39);
  box(p,palette.glass,cx-.61,base+.46,0,.01,.24,.27);
  const stackX=cx-.32;
  cyl(p,palette.iron,stackX,base+height+.38,0,.13,.63,.13,16);
  cyl(p,palette.paint,stackX,base+height+.43,0,.134,.25);
  cyl(p,palette.rubber,stackX,base+height+.71,0,.17,.08);
  const mastX=cx+.33, roof=base+height+.15;
  rod(p,palette.rail,[mastX,roof,0],[mastX,roof+1.13,0],.028,8);
  rod(p,palette.rail,[mastX,roof+.82,-.48],[mastX,roof+.82,.48],.019,8);
  rod(p,palette.iron,[mastX,roof+1.13,0],[mastX-.09,roof+1.37,0],.012,5);
  cyl(p,palette.radar,mastX,roof+.93,0,.10,.10,.10,12);
  box(p,palette.cream,mastX,roof+1.04,0,.085,.10,.56);
  for(const side of[-1,1]) {
    const lantern=side===1?palette.greenLight:palette.redLight;
    cyl(p,palette.iron,mastX,roof+.81,side*.44,.048,.05);cyl(p,lantern,mastX,roof+.88,side*.44,.047,.10,.047,10);
    rod(p,palette.rope,[mastX,roof+1.0,0],[cx-.5,roof,side*.5],.007,4);
  }
  const flagShape=new THREE.Shape();flagShape.moveTo(0,0);flagShape.lineTo(-.45,-.055);flagShape.lineTo(-.41,-.23);flagShape.lineTo(0,-.18);flagShape.closePath();
  const flag=mesh(p,new THREE.ShapeGeometry(flagShape),palette.flag,mastX,roof+.64,0);flag.rotation.y=.15;
  if(tug) {
    // Work deck: towing winch, coiled rope and a stern gantry.
    const winch=cyl(p,palette.iron,-1.88,.91,0,.21,.66,.21,16);winch.rotation.x=Math.PI/2;
    for(const z of[-.34,.34]) {const wheel=cyl(p,palette.paint,-1.88,.91,z,.27,.06,.27,16);wheel.rotation.x=Math.PI/2;}
    for(const side of[-1,1])rod(p,palette.paint,[-2.10,.60,side*.73],[-2.10,1.45,side*.73],.05);
    rod(p,palette.paint,[-2.10,1.45,-.73],[-2.10,1.45,.73],.052);
  } else {
    roundedBlock(p,palette.roof,-1.97,.75,0,.45,.30,.68,.03);
    for(let i=0;i<3;i++)box(p,palette.trim,-1.98,.79,(i-1)*.18,.46,.018,.018);
  }
}
function skiffCabin(p,palette) {
  roundedBlock(p,palette.cream,-.83,.75,0,1.77,.35,1.41,.055);
  roundedBlock(p,palette.iron,-1.02,.94,0,1.18,.12,1.1,.035);
  // Wraparound swept windshield, separate panes and polished frame.
  for(const side of[-1,1]) {
    const pane=box(p,palette.glass,-.43,1.15,side*.58,.85,.41,.024);pane.rotation.y=side*.24;pane.rotation.z=.15;
    rod(p,palette.rail,[-.85,1.37,side*.49],[-.03,1.31,side*.68],.019);
    rod(p,palette.rail,[-.03,.96,side*.68],[-.03,1.31,side*.68],.017);
  }
  const windshield=box(p,palette.glass,-.02,1.15,0,.023,.34,1.31);windshield.rotation.z=.25;
  rod(p,palette.rail,[-.07,1.32,-.66],[-.07,1.32,.66],.02);
  rod(p,palette.rail,[-.07,1.33,0],[.02,.99,0],.014);
  for(const z of[-.35,.35]) {
    roundedBlock(p,palette.seat,-1.14,1.10,z,.46,.17,.38,.035);
    const back=roundedBlock(p,palette.seat,-1.35,1.30,z,.13,.50,.38,.035);back.rotation.z=-.12;
  }
  // Twin outboards and a low sport arch give this boat a different silhouette.
  for(const z of[-.44,.44]) {
    roundedBlock(p,palette.gun,-2.46,.33,z,.47,.65,.35,.045);
    box(p,palette.paint,-2.49,.51,z,.43,.13,.36);
  }
  tube(p,palette.rail,[[-1.50,.90,-.63],[-1.50,1.86,-.57],[-1.45,1.97,0],[-1.50,1.86,.57],[-1.50,.90,.63]],.035);
  rod(p,palette.rail,[-1.50,1.97,0],[-1.5,2.60,0],.015);
  box(p,palette.cream,-1.50,2.05,0,.095,.085,.54);
  lifeRing(p,-1.78,.91,.79,palette.orange,palette.cream,.73);
}

function liveryMarkings(p,palette,type,livery) {
  if(livery==='plain')return;
  const skiff=type==='skiff',tug=type==='tug',cx=tug?-.95:-1.05;
  const roofY=tug?1.989:1.769,roofWidth=tug?1.52:1.38;
  const patch=(material,points,y)=>{
    const shape=new THREE.Shape();points.forEach(([x,z],i)=>{z*=skiff?.82:1;i?shape.lineTo(x,-z):shape.moveTo(x,-z);});shape.closePath();
    const geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);mesh(p,geometry,material,0,y,0);
  };
  if(livery==='racing') {
    if(!skiff)for(const z of[-.24,.24])box(p,palette.cream,cx,roofY,z,1.06,.008,.19);
    // Broad paired bow stripes remain recognizable when shown in small shop cards.
    for(const side of[-1,1])patch(palette.cream,[[1.12,side*.32],[2.21,side*.045],[1.93,side*.29],[1.04,side*.52]],.589);
  } else if(livery==='dazzle') {
    if(!skiff) {
      patch(palette.dazzle,[[cx-.53,-roofWidth*.43],[cx+.50,-roofWidth*.43],[cx-.53,roofWidth*.17]],roofY+.005);
      patch(palette.dazzle,[[cx+.53,roofWidth*.43],[cx-.20,roofWidth*.43],[cx+.53,-roofWidth*.03]],roofY+.005);
    }
    patch(palette.dazzle,[[.08,-.91],[.62,-.88],[1.78,.41],[1.39,.60]],.589);
    patch(palette.dazzle,[[.31,.97],[.98,.85],[.63,.47]],.590);
  } else if(livery==='royal') {
    if(!skiff) {
      for(const z of[-roofWidth*.39,roofWidth*.39])box(p,palette.gold,cx,roofY,z,1.06,.009,.055);
      for(const x of[cx-.53,cx+.53])box(p,palette.gold,x,roofY,0,.055,.009,roofWidth*.81);
      // A compass rose on the wheelhouse roof makes the premium finish legible.
      for(let i=0;i<4;i++) {
        const a=i*Math.PI/2,point=(x,z)=>[cx+x*Math.cos(a)-z*Math.sin(a),x*Math.sin(a)+z*Math.cos(a)];
        patch(palette.gold,[point(0,0),point(.095,.075),point(.36,0),point(.095,-.075)],roofY+.010);
      }
    }
    tube(p,palette.gold,[[1.03,.59,-.65],[2.15,.59,0],[1.03,.59,.65]],.035);
  }
}

export function createBoat({boat='cutter', color='#ffbc69', livery='plain'}={}) {
  const g=new THREE.Group();g.name=`boat-${boat}`;
  const palette={
    paint:mat(color,.34,.22),hullPaint:mat(color,.34,.22,{vertexColors:true}),bottom:mat('#162b32',.49,.17,{vertexColors:true}),
    trim:mat(livery==='royal'?'#d7b66d':'#e1dcd0',.29,.46),rail:mat('#a0b6b4',.28,.74),iron:mat('#253941',.53,.55),
    rubber:mat('#18252a',.91),rope:mat('#cbb787',.99),brass:mat('#b29356',.36,.67),gold:mat('#e1bd66',.30,.64),
    cream:mat('#d8dbcc',.39,.12),roof:mat(livery==='royal'?'#22333d':livery==='racing'?'#245067':livery==='dazzle'?'#3b5d67':color,.35,.25),deckBase:mat('#6b513c',.93),woods:woodColors.map(c=>mat(c,.85)),
    glass:mat('#183e49',.16,.47),glassReflection:mat('#72adbc',.2,.2,{emissive:'#305361',emissiveIntensity:.22}),
    gun:mat('#3b4b4e',.31,.73),black:mat('#070e11',.9),orange:mat('#e87435',.55),radar:mat('#c8d3d0',.42),
    greenLight:mat('#75e0b1',.25,.15,{emissive:'#36db8a',emissiveIntensity:.65}),
    redLight:mat('#f78967',.25,.15,{emissive:'#f84e36',emissiveIntensity:.65}),
    flag:mat(color,.85,0,{side:THREE.DoubleSide}),seat:mat('#8b493a',.87),dazzle:mat('#ecdfc4',.35,.20),
  };
  buildHull(g,palette,boat,livery);if(boat==='skiff')skiffCabin(g,palette);else cabin(g,palette,boat);
  liveryMarkings(g,palette,boat,livery);
  gun(g,palette,boat);
  // Rope coils, a bow bollard, and tiny deck fittings add believable scale.
  for(let i=0;i<3;i++) {const coil=mesh(g,new THREE.TorusGeometry(.11+i*.034,.016,5,18),palette.rope,1.74,.604,0);coil.rotation.x=-Math.PI/2;}
  cyl(g,palette.iron,2.0,.65,0,.05,.13,.05,8);
  box(g,palette.cream,.23,.64,-.69,.23,.13,.18);
  batchMeshes(g,new Set([g.userData.turret]));
  batchMeshes(g.userData.turret,new Set([g.userData.barrel]));
  batchMeshes(g.userData.barrel);
  g.scale.setScalar(boat==='tug'?1.16:boat==='skiff'?.9:1);
  g.userData.boat=boat;g.userData.palette=palette;return g;
}

function randomGenerator(seed) { return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}; }
function rockGeometry(radius,height,random,grass=false) {
  const n=32,vertices=[],colors=[],indices=[];
  const rings=[[1,-.60],[1.00,.04],[.91,.42],[.72,.93],[.42,1.16],[.04,1.26]];
  const variations=Array.from({length:n},()=>.88+random()*.12);
  const stone=new THREE.Color('#566970'),light=new THREE.Color('#88938a'),wet=new THREE.Color('#273e45'),green=new THREE.Color('#506753');
  for(let k=0;k<rings.length;k++) for(let i=0;i<n;i++) {
    const a=i/n*TAU, [rr,yy]=rings[k],r=radius*rr*variations[i]*(k===0?1:.96+random()*.04),y=yy*height+(k>1?(random()-.5)*height*.20:0);
    vertices.push(Math.cos(a)*r,y,Math.sin(a)*r);
    const c=(k<2?wet:k>3&&grass?green:stone).clone().lerp(light,random()*.23);
    colors.push(c.r,c.g,c.b);
  }
  for(let k=0;k<rings.length-1;k++)for(let i=0;i<n;i++){const a=k*n+i,b=k*n+(i+1)%n,c=a+n,d=b+n;indices.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function pine(p,x,y,z,size,palette,random) {
  cyl(p,palette.trunk,x,y+size*.40,z,.06*size,size*.8,.038*size,7);
  for(let i=0;i<4;i++) {
    const t=mesh(p,new THREE.ConeGeometry(size*(.29-i*.05),size*.46,9,1),palette.greens[i%3],x,y+size*(.46+i*.16),z);
    t.rotation.y=random()*TAU;t.rotation.z=.035;
  }
}
function lighthouse(p,radius,palette) {
  const tower=new THREE.Group();p.add(tower);tower.position.set(-radius*.09,1.30,0);
  const cream=mat('#ddd9bf',.80,.05), red=mat('#a5493d',.62,.13),dark=mat('#25383e',.44,.43),glass=mat('#d4d4a7',.22,.25,{emissive:'#ffb768',emissiveIntensity:.60});
  cyl(tower,palette.plainRock,0,.07,0,.60,.14,.6,12);
  cyl(tower,cream,0,.87,0,.37,1.55,.28,18);
  cyl(tower,red,0,.88,0,.342,.36,.322,18);
  cyl(tower,cream,0,1.68,0,.33,.10,.33,18);
  cyl(tower,dark,0,1.81,0,.48,.10,.48,18);
  cyl(tower,glass,0,2.10,0,.25,.49,.25,10);
  for(let i=0;i<8;i++) {const a=i/8*TAU;rod(tower,dark,[Math.cos(a)*.27,1.86,Math.sin(a)*.27],[Math.cos(a)*.27,2.35,Math.sin(a)*.27],.018);}
  cyl(tower,dark,0,2.38,0,.43,.12,.37,16);cyl(tower,red,0,2.55,0,.42,.28,0,16);
  rod(tower,dark,[0,2.67,0],[0,2.96,0],.022);
  tube(tower,dark,Array.from({length:12},(_,i)=>{const a=i/12*TAU;return[Math.cos(a)*.44,2.02,Math.sin(a)*.44];}),.014,true);
  for(let i=0;i<8;i++){const a=i/8*TAU;rod(tower,dark,[Math.cos(a)*.44,1.85,Math.sin(a)*.44],[Math.cos(a)*.44,2.03,Math.sin(a)*.44],.011);}
  box(tower,dark,.367,.36,0,.018,.43,.22);box(tower,glass,.312,1.32,0,.018,.22,.13);
  tower.rotation.y=-.55;
  p.userData.lighthouse=tower;
}
export function createIsland({r=48,island=false}={},index=0) {
  const p=new THREE.Group();p.name=island?'island':'reef';const radius=r/12,random=randomGenerator(8137+index*8731);
  const palette={rock:mat('#ffffff',.93,.06,{vertexColors:true}),plainRock:mat('#506367',.95),trunk:mat('#675044',1),greens:['#2d5247','#3d6251','#56745a'].map(c=>mat(c,.95))};
  mesh(p,rockGeometry(radius,island?1.11:1.19,random,island),palette.rock);
  // Strata and a ring of smaller stones keep the cliff edge from reading as a disk.
  for(let i=0;i<11;i++) {
    const a=(i+random()*.35)/11*TAU,rr=radius*(.69+random()*.11),size=.25+random()*.48;
    const stone=mesh(p,new THREE.IcosahedronGeometry(size,1),palette.plainRock,Math.cos(a)*rr,.12+random()*.24,Math.sin(a)*rr);
    stone.scale.set(1,.7+random(),.7+random()*.4);stone.rotation.set(random(),random(),random());
  }
  if(island) {
    if(index===0)lighthouse(p,radius,palette);
    for(let i=0;i<(index===0?4:7);i++) {
      const a=random()*TAU,rr=radius*(.18+random()*.37),x=Math.cos(a)*rr,z=Math.sin(a)*rr;
      if(index===0&&Math.hypot(x+radius*.09,z)<.86)continue;
      pine(p,x,1.10,z,.72+random()*.86,palette,random);
      const bush=mesh(p,new THREE.IcosahedronGeometry(.25+random()*.20,1),palette.greens[1],x+.30,1.08,z+.20);bush.scale.y=.55;
    }
  } else {
    const peak=mesh(p,new THREE.IcosahedronGeometry(radius*.44,1),palette.plainRock,radius*.10,1.19,0);peak.scale.set(1,.94,.79);peak.rotation.set(.3,.2,.2);
  }
  batchMeshes(p);
  p.userData.radius=radius;return p;
}

export function disposeObject(object) {
  const geometries=new Set(),materials=new Set();
  object.traverse(child=>{if(child.geometry)geometries.add(child.geometry);if(child.material)(Array.isArray(child.material)?child.material:[child.material]).forEach(m=>materials.add(m));});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());object.removeFromParent();
}
