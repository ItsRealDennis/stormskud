// Optional visual smoke test and software-rendering diagnostics.
// Run separately from npm test to avoid CPU contention with real-time tests.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';

const app=createGameServer(),address=await app.listen(0,'127.0.0.1');
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[];
await mkdir('artifacts',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.locator('#nickname').fill('Kaptajn');
  await page.waitForTimeout(1000);
  await page.screenshot({path:'artifacts/3d-home.png'});
  await page.locator('[data-harbour="fleet"]').click();
  await page.waitForFunction(()=>{
    const images=[...document.querySelectorAll('.boat-preview img')];
    return images.length===3&&images.every(image=>image.complete&&image.naturalWidth>100);
  });
  await page.locator('.boat-preview img').evaluateAll(images=>Promise.all(images.flatMap(image=>image.getAnimations().map(animation=>animation.finished))));
  await page.screenshot({path:'artifacts/3d-fleet.png'});
  await page.locator('.close-harbour').click();
  await page.locator('#solo').click();await page.locator('#session').waitFor();
  await page.locator('#center-overlay').waitFor({state:'hidden'});
  await page.waitForTimeout(12000);
  const diagnostics=await page.evaluate(async()=>{
    const {renderer}=await import('/app.js'),gl=renderer.renderer.getContext();
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    return{
      frameAverageMs:Math.round(renderer.frameAverage*10)/10,
      quality:renderer.quality,
      drawCalls:renderer.renderer.info.render.calls,
      triangles:renderer.renderer.info.render.triangles,
      contextLost:gl.isContextLost(),
      gpu:gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER),
    };
  });
  assert.equal(diagnostics.contextLost,false);assert.ok(diagnostics.drawCalls>0);
  console.log('Single-browser 1440x960 solo diagnostics:',JSON.stringify(diagnostics));
  // Exercise wheel zoom and projection together; aiming uses the same camera.
  await page.mouse.move(540,400);await page.mouse.wheel(0,-200);
  await page.waitForTimeout(1000);
  const camera=await page.evaluate(async()=>{
    const {renderer}=await import('/app.js'),screen=renderer.screenPoint(720,450);
    const world=renderer.worldPoint(screen.x,screen.y);
    return{zoom:renderer.zoom,error:Math.hypot(world.x-720,world.y-450)};
  });
  assert.ok(camera.zoom<1&&camera.error<.05);
  await page.screenshot({path:'artifacts/3d-battle.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: fresh 3D home/fleet/battle screenshots; solo scene; wheel zoom; projected aim; no browser errors. This is software WebGL, not a hardware FPS benchmark.');
}finally{await browser.close();await app.close();}
