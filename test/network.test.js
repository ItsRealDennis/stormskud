import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';

const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await pause(25);}throw new Error('Timed out waiting for condition');}
async function client(url){const ws=new WebSocket(url);const messages=[];ws.on('message',d=>messages.push(JSON.parse(d)));await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return {ws,messages,send:m=>ws.send(JSON.stringify(m)),async take(type){let result;await until(()=>{const i=messages.findIndex(m=>m.type===type);if(i<0)return false;[result]=messages.splice(i,1);return true;});return result;}};}
test('real WebSocket clients: private rooms, shooting, respawn, reconnect, rounds and leaving', {timeout:25000}, async()=>{
  const app=createGameServer({roomOptions:{duration:10,countdown:.1}}),addr=await app.listen(0,'127.0.0.1');
  const url=`ws://127.0.0.1:${addr.port}/ws`;const clients=[];let firing;
  try{
    const a=await client(url),b=await client(url),other=await client(url);clients.push(a,b,other);
    a.send({type:'join',create:true,name:'Kaptajn A',color:'#ffbc69'});const ja=await a.take('joined');assert.match(ja.state.code,/^[A-Z2-9]{5}$/);
    b.send({type:'join',name:'Kaptajn B',code:ja.state.code});const jb=await b.take('joined');assert.equal(jb.state.players.length,2);
    other.send({type:'join',create:true,name:'Andet hav'});const jo=await other.take('joined');assert.notEqual(jo.state.code,ja.state.code);
    const response=await fetch(`http://127.0.0.1:${addr.port}/?room=${ja.state.code}`);assert.equal(response.status,200);assert.match(await response.text(),/Deltag i rum/);
    a.send({type:'start'});const room=app.rooms.get(ja.state.code);await until(()=>room.phase==='playing');
    const pa=room.players.get(ja.id),pb=room.players.get(jb.id);Object.assign(pa,{x:450,y:110,vx:0,vy:0,angle:0,protectedUntil:0});Object.assign(pb,{x:700,y:110,vx:0,vy:0,protectedUntil:0});
    firing=setInterval(()=>a.send({type:'input',input:{aim:Math.atan2(pb.y-pa.y,pb.x-pa.x),fire:pb.hp>0,brake:true}}),40);
    await until(()=>pb.hp===0);clearInterval(firing);a.send({type:'input',input:{aim:0,fire:false,brake:true}});
    assert.equal(pa.score,3);assert.equal(pa.kills,1);assert.equal(pb.deaths,1);
    await until(()=>a.messages.some(m=>m.type==='state'&&m.state.players.some(p=>p.id===jb.id&&p.hp===0)));
    await until(()=>b.messages.some(m=>m.type==='state'&&m.state.players.some(p=>p.id===ja.id&&p.score===3)));
    await until(()=>pb.hp===4,4000);assert.ok(pb.protectedUntil>room.now);
    const isolated=app.rooms.get(jo.state.code);assert.equal(isolated.phase,'lobby');assert.equal(isolated.players.size,1);assert.equal(isolated.bullets.length,0);assert.equal([...isolated.players.values()][0].score,0);
    b.ws.terminate();await until(()=>!pb.connected);const resumed=await client(url);clients.push(resumed);resumed.send({type:'resume',token:jb.token});const jr=await resumed.take('joined');assert.equal(jr.id,jb.id);assert.equal(pb.connected,true);assert.equal(pb.deaths,1);
    const late=await client(url);clients.push(late);late.send({type:'join',name:'Sen gæst',code:room.code});const jl=await late.take('joined');assert.equal(jl.state.phase,'playing');assert.equal(room.players.size,3);
    a.send({type:'leave'});await a.take('left');assert.equal(room.players.size,2);assert.equal(room.phase,'playing');
    await until(()=>room.phase==='results',7000);assert.equal(room.results.length,2);
    resumed.send({type:'start'});await until(()=>room.round===2);assert.equal(pb.score,0);assert.equal(pb.hp,4);
    resumed.send({type:'leave'});await resumed.take('left');late.send({type:'leave'});await late.take('left');assert.equal(app.rooms.has(room.code),false);assert.equal(app.rooms.has(isolated.code),true);
    other.ws.terminate();await until(()=>[...app.sessions.values()].some(s=>s.player.id===jo.id&&s.expires));const expired=[...app.sessions.values()].find(s=>s.player.id===jo.id);expired.expires=Date.now()-1;await until(()=>!app.rooms.has(isolated.code));
  }finally{clearInterval(firing);for(const c of clients)c.ws.terminate();await app.close();}
});
test('invalid rooms, malformed JSON, capacity and untrusted scoring input',async()=>{
  const app=createGameServer(),addr=await app.listen(0,'127.0.0.1');const clients=[];
  try{
    const a=await client(`ws://127.0.0.1:${addr.port}/ws`);clients.push(a);
    a.ws.send('not json');a.send({type:'join',name:'A',code:'XXXXX'});assert.match((await a.take('error')).message,/findes ikke/);
    a.send({type:'join',create:true,name:'<A>',color:'red;injection'});const joined=await a.take('joined');assert.equal(joined.state.players[0].name,'A');assert.equal(joined.state.players[0].color,'#ffbc69');
    const room=app.rooms.get(joined.state.code);for(let i=0;i<7;i++)room.addPlayer('Bot', '#68d8cd',true);
    const b=await client(`ws://127.0.0.1:${addr.port}/ws`);clients.push(b);b.send({type:'join',name:'Overflow',code:room.code});assert.match((await b.take('error')).message,/fuldt/);
    a.send({type:'input',input:{aim:'Infinity',score:999,hp:999}});a.send({type:'score',score:999});await pause(100);assert.equal(room.players.get(joined.id).score,0);assert.equal(room.players.get(joined.id).hp,4);
  }finally{for(const c of clients)c.ws.terminate();await app.close();}
});
