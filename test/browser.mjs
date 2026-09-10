import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';

const app=createGameServer();
const address=await app.listen(0,'127.0.0.1'),base=`http://127.0.0.1:${address.port}`;
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
await mkdir('artifacts',{recursive:true});
const errors=[],openPages=[];
const wait=async(fn,timeout=7000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Browser condition timed out');};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function verifyScene(page,label){
  const frame=await page.evaluate(async()=>{
    // Read during the same animation frame as rendering. WebGL is allowed to
    // discard its drawing buffer after compositing, so a later read is invalid.
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const source=document.getElementById('game'),gl=source.getContext('webgl2');
    if(!gl||gl.isContextLost())return{healthy:false};
    const sample=document.createElement('canvas');sample.width=96;sample.height=64;
    const ctx=sample.getContext('2d');ctx.drawImage(source,0,0,96,64);
    const data=ctx.getImageData(0,0,96,64).data,colors=new Set();let visible=0;
    for(let i=0;i<data.length;i+=4){
      if(data[i+3]>0&&Math.max(data[i],data[i+1],data[i+2])>8)visible++;
      colors.add(`${data[i]>>3},${data[i+1]>>3},${data[i+2]>>3}`);
    }
    return{healthy:true,version:gl.getParameter(gl.VERSION),colors:colors.size,visible:visible/(96*64)};
  });
  assert.equal(frame.healthy,true,`${label}: live WebGL2 context`);
  assert.match(frame.version,/WebGL 2/);
  assert.ok(frame.colors>12,`${label}: scene has varied rendered pixels (${frame.colors} colors)`);
  assert.ok(frame.visible>.5,`${label}: visible scene, not an empty canvas (${frame.visible})`);
}
async function aimAt(page,player){
  const point=await page.evaluate(async([x,y])=>{
    const {renderer}=await import('/app.js');return renderer.screenPoint(x,y);
  },[player.x,player.y]);
  assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y),'finite projected aim');
  await page.mouse.move(point.x,point.y);
}
async function verifyModelPreviews(page,count){
  await page.waitForFunction(expected=>{
    const images=[...document.querySelectorAll('.boat-art .boat-preview img')];
    return images.length===expected&&images.every(img=>img.complete&&img.naturalWidth>100&&img.src.startsWith('data:image/png'));
  },count);
  assert.equal(await page.locator('.preview-status.failed').count(),0,'3D model previews rendered');
  await page.locator('.boat-art .boat-preview img').evaluateAll(images=>Promise.all(images.flatMap(img=>img.getAnimations().map(animation=>animation.finished))));
}
try{
  const c1=await browser.newContext({viewport:{width:1440,height:960},permissions:['clipboard-read','clipboard-write']});
  const c2=await browser.newContext({viewport:{width:1440,height:960}});
  const a=await c1.newPage(),b=await c2.newPage();
  openPages.push(a,b);
  for(const page of [a,b]){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});}
  await a.goto(base);await a.locator('#nickname').fill('Kaptajn Astrid');await new Promise(r=>setTimeout(r,250));
  await verifyScene(a,'Home');
  await a.screenshot({path:'artifacts/01-home.png'});
  await a.locator('[data-harbour="fleet"]').click();await a.locator('[data-boat="tug"]').click();
  assert.equal(await a.locator('#chosen-boat').textContent(),'Slæberen');
  await verifyModelPreviews(a,3);
  await a.screenshot({path:'artifacts/07-fleet.png'});
  await a.locator('[data-menu-tab="shop"]').click();assert.equal(await a.locator('[data-buy="racing"]').isDisabled(),true);
  await verifyModelPreviews(a,4);
  await a.screenshot({path:'artifacts/08-shop.png'});
  await a.locator('[data-menu-tab="fleet"]').click();await a.locator('[data-boat="cutter"]').click();await a.locator('.close-harbour').click();
  await a.locator('#enter').click();
  await a.locator('#room-label').filter({hasText:/[A-Z2-9]{5}/}).waitFor();
  const roomCode=await a.locator('#room-label').textContent();
  await a.getByRole('button',{name:/Kopiér link/}).click();
  const invite=await a.evaluate(()=>navigator.clipboard.readText());assert.equal(new URL(invite).searchParams.get('room'),roomCode);
  await a.screenshot({path:'artifacts/02-lobby.png'});
  await b.goto(invite);assert.equal(await b.locator('#roomcode').inputValue(),roomCode);
  await b.locator('#nickname').fill('Bølge-Bent');await b.getByRole('button',{name:'Turkis',exact:true}).click();await b.locator('#enter').click();
  await b.locator('#session').waitFor();await a.locator('#start-round:not([disabled])').waitFor();
  await a.locator('#start-round').click();
  const room=app.rooms.get(roomCode);await wait(()=>room.phase==='playing');
  const pa=[...room.players.values()].find(p=>p.name==='Kaptajn Astrid'),pb=[...room.players.values()].find(p=>p.name==='Bølge-Bent');
  // Deterministic test fixture: only positions/protection are set on the server.
  // Every shot and movement command below comes through real browser controls.
  Object.assign(pa,{x:440,y:300,vx:0,vy:0,angle:0,protectedUntil:0});Object.assign(pb,{x:840,y:300,vx:0,vy:0,angle:Math.PI,protectedUntil:0});
  await new Promise(r=>setTimeout(r,160));
  await b.keyboard.down('s');await a.keyboard.down('s');
  await a.locator('#center-overlay').waitFor({state:'hidden'});
  const projectionError=await a.evaluate(async()=>{
    const {renderer}=await import('/app.js');
    return Math.max(...[[250,200],[720,450],[1150,680]].map(([x,y])=>{
      const screen=renderer.screenPoint(x,y),world=renderer.worldPoint(screen.x,screen.y);
      return Math.hypot(world.x-x,world.y-y);
    }));
  });
  assert.ok(projectionError<.05,`3D camera aim round-trip error: ${projectionError}`);
  await verifyScene(a,'Battle');
  // Observe the brief death overlay before firing, so other browser actions
  // cannot cause this check to start only after the three-second respawn.
  const sunkCapture=b.locator('#center-overlay h2').filter({hasText:'Du er gået ned.'}).waitFor({timeout:30000})
    .then(()=>b.screenshot({path:'artifacts/04-sunk.png'})).then(()=>null,error=>error);
  await aimAt(a,pb);await a.mouse.down();
  const fireDeadline=Date.now()+16000;let battleCaptured=false;
  while(pa.kills===0&&Date.now()<fireDeadline){
    await aimAt(a,pb);await delay(100);
    if(pb.hp<=2&&!battleCaptured){
      // Pause the trigger while the screenshot is taken so slow software WebGL
      // cannot skip straight through sinking and the three-second respawn.
      await a.mouse.up();await a.screenshot({path:'artifacts/03-battle.png'});
      battleCaptured=true;await aimAt(a,pb);await a.mouse.down();
    }
  }
  await a.mouse.up();assert.equal(pa.score,3,'actual browser mouse shots earn a sink');assert.equal(pa.kills,1);
  const captureError=await sunkCapture;if(captureError)throw captureError;
  await wait(()=>pb.hp===4,4500);assert.ok(pb.protectedUntil>room.now);await a.keyboard.up('s');await b.keyboard.up('s');
  // Verify W/A/space reach the authoritative server and move the boat.
  const x=pa.x,y=pa.y,angle=pa.angle;await a.keyboard.down('w');await a.keyboard.down('a');await a.keyboard.down('Space');
  await new Promise(r=>setTimeout(r,2200));await a.keyboard.up('w');await a.keyboard.up('a');await a.keyboard.up('Space');
  assert.ok(Math.hypot(pa.x-x,pa.y-y)>20);assert.ok(Math.abs(pa.angle-angle)>.2,`rudder angle change: ${pa.angle-angle}`);assert.ok(room.now-pa.boostAt<2.6);
  // Full 120-second duration is covered by engine tests; skip idle time here.
  room.endsAt=room.now+.2;await a.getByRole('button',{name:/Én runde mere/}).waitFor();
  await a.screenshot({path:'artifacts/05-results.png'});assert.match(await a.locator('.result-list').textContent(),/1 sænkninger · 3 point/);
  await a.locator('.round-reward').waitFor();assert.match(await a.locator('.round-reward').textContent(),/90 XP/);
  const saved=await a.evaluate(()=>JSON.parse(localStorage.getItem('stormskud-captain-v1')));assert.equal(saved.xp,90);assert.equal(saved.coins,43);
  await b.getByRole('button',{name:/Én runde mere/}).click();await wait(()=>room.round===2);assert.equal(pa.score,0);
  await a.getByRole('button',{name:/Forlad rummet/}).click();await wait(()=>room.players.size===1);assert.ok(app.rooms.has(roomCode));
  await b.locator('#player-count').filter({hasText:'1 / 8'}).waitFor();
  await b.getByRole('button',{name:/Forlad rummet/}).click();await wait(()=>!app.rooms.has(roomCode));
  // Seed earned currency only in this test fixture to exercise the real shop UI.
  await a.evaluate(()=>{const p=JSON.parse(localStorage.getItem('stormskud-captain-v1'));p.coins=100;localStorage.setItem('stormskud-captain-v1',JSON.stringify(p));});
  await a.reload();await a.locator('[data-harbour="fleet"]').click();await a.locator('[data-boat="skiff"]').click();await a.locator('[data-menu-tab="shop"]').click();await a.locator('[data-buy="racing"]').click();
  assert.match(await a.locator('#harbour-coins').textContent(),/20 skaller/);assert.match(await a.locator('[data-buy="racing"]').textContent(),/Udstyret/);
  await a.locator('[data-menu-tab="captain"]').click();await a.screenshot({path:'artifacts/09-captain.png'});await a.locator('.close-harbour').click();
  await a.reload();assert.equal(await a.locator('#chosen-boat').textContent(),'Havpilen');
  // Solo is a separate, explicit bot room, with functional controls and audio.
  await a.locator('#solo').click();await a.locator('#session').waitFor();const soloCode=await a.locator('#room-label').textContent();
  const solo=app.rooms.get(soloCode);assert.equal([...solo.players.values()].filter(p=>p.bot).length,3);
  const human=[...solo.players.values()].find(p=>!p.bot);assert.equal(human.boat,'skiff');assert.equal(human.livery,'racing');
  await a.getByRole('button',{name:'Slå lyd til'}).click();await a.getByRole('button',{name:'Slå lyd fra'}).waitFor();await a.getByRole('button',{name:'Slå lyd fra'}).click();
  await wait(()=>solo.phase==='playing');await new Promise(r=>setTimeout(r,2000));
  await a.screenshot({path:'artifacts/06-solo.png'});
  await verifyScene(a,'Solo');
  const renderMetrics=await a.evaluate(async()=>{const {renderer}=await import('/app.js');return{frameAverageMs:Math.round(renderer.frameAverage),quality:renderer.quality,drawCalls:renderer.renderer.info.render.calls,triangles:renderer.renderer.info.render.triangles};});
  console.log('Software WebGL diagnostics (not hardware performance):',renderMetrics);
  assert.deepEqual(errors,[]);
  console.log('PASS: WebGL2 scene pixels on home/battle/solo; 3D camera mouse projection; two isolated browser contexts; create; clipboard invitation; join; start; aim; shoot; four-hit sink; score; respawn; W/A/boost; results; replay from second player; creator leaves; empty cleanup; explicit bots; audio toggle; fleet; XP; shop; no browser errors.');
  console.log('Screenshots saved in artifacts/. Tests run on one machine; no physical cross-computer or public hosting test performed.');
} catch(error){
  if(errors.length)console.error('Browser errors:',errors);
  await Promise.allSettled(openPages.map((page,index)=>page.screenshot({path:`artifacts/failure-client-${index+1}.png`,timeout:5000})));
  throw error;
} finally {await browser.close();await app.close();}
