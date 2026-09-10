// Usage: node test/public-smoke.mjs https://your-actual-domain
// Uses only public HTTP/WebSocket interfaces. Creates and removes its own rooms.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label,timeout=12000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const result=check();if(result)return result;await pause(30);}
  throw Error(`Timed out: ${label}`);
}
let origin;
try{
  const supplied=new URL(process.argv[2]);
  assert.ok(['http:','https:'].includes(supplied.protocol)&&!supplied.username&&!supplied.password);
  origin=supplied.origin;
}catch{
  console.error('Usage: node test/public-smoke.mjs https://your-actual-domain');
  process.exit(1);
}
const socketURL=new URL('/ws',origin);socketURL.protocol=socketURL.protocol==='https:'?'wss:':'ws:';
const clients=[];

class Client{
  constructor(name){
    this.name=name;this.messages=[];this.states=new Map();this.joined=false;this.pendingJoin=false;
    this.ws=new WebSocket(socketURL,{origin,handshakeTimeout:12000});
    this.ws.on('error',error=>{this.error=error;});
    this.ws.on('message',raw=>{
      let message;try{message=JSON.parse(raw.toString());}catch{this.error=Error(`${name}: non-JSON WebSocket message`);return;}
      this.messages.push(message);if(this.messages.length>500)this.messages.shift();
      if(message.type==='joined'){this.joined=true;this.pendingJoin=false;this.token=message.token;}
      if(message.type==='left'){this.joined=false;this.pendingJoin=false;this.token=null;}
      if(message.type==='error')this.pendingJoin=false;
      if(message.state){
        this.latest=message.state;this.states.set(`${message.state.round}:${message.state.now}`,message.state);
        if(this.states.size>300)this.states.delete(this.states.keys().next().value);
      }
    });
  }
  async open(){await until(()=>{if(this.error)throw this.error;return this.ws.readyState===WebSocket.OPEN;},`${this.name}: WebSocket upgrade`);return this;}
  send(message){assert.equal(this.ws.readyState,WebSocket.OPEN,`${this.name}: connected`);if(message.type==='join')this.pendingJoin=true;this.ws.send(JSON.stringify(message));}
  async take(type){
    return until(()=>{
      if(this.error)throw this.error;
      const index=this.messages.findIndex(message=>message.type===type);
      if(index>=0)return this.messages.splice(index,1)[0];
      const error=this.messages.find(message=>message.type==='error');
      if(error&&type!=='error')throw Error(`${this.name}: ${error.message}`);
      return false;
    },`${this.name}: ${type}`);
  }
  async leave(){if(this.joined||this.pendingJoin){this.send({type:'leave'});await this.take('left');}}
  async cleanup(){
    // A dropped public connection can leave a reserved session. Resume that
    // session solely to send an explicit leave, without creating another room.
    let resumed;
    try{
      if(this.ws.readyState===WebSocket.OPEN)await this.leave();
      else if(this.token){
        resumed=await new Client(`${this.name} cleanup`).open();
        resumed.send({type:'resume',token:this.token});
        await resumed.take('joined');await resumed.leave();
      }
    }finally{this.ws.terminate();resumed?.ws.terminate();}
  }
}
async function request(path,contentType){
  const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200,`${path}: HTTP 200`);
  if(contentType)assert.match(response.headers.get('content-type')??'',contentType,`${path}: content type`);
  const body=await response.text();assert.ok(body.length>0,`${path}: nonempty body`);return body;
}
let failure;
try{
  const health=JSON.parse(await request('/health',/application\/json/));assert.equal(health.ok,true);
  const assets=['/app.js','/render.js','/models.js','/vendor/three.module.js','/vendor/three.core.js'];
  await Promise.all(assets.map(path=>request(path,/(?:javascript|ecmascript)/)));
  assert.match(await request('/',/text\/html/),/STORMSKUD/);

  // Both players and the isolation probe stay connected simultaneously.
  const a=new Client('Smoke A'),b=new Client('Smoke B'),other=new Client('Smoke isolated');
  clients.push(a,b,other);await Promise.all(clients.map(client=>client.open()));
  a.send({type:'join',create:true,name:'Smoke A',color:'#ffbc69'});
  const ja=await a.take('joined');assert.match(ja.state.code,/^[A-Z2-9]{5}$/);
  b.send({type:'join',code:ja.state.code,name:'Smoke B',color:'#68d8cd'});
  const jb=await b.take('joined');assert.notEqual(ja.id,jb.id);assert.equal(jb.state.players.length,2);
  const invite=new URL('/',origin);invite.searchParams.set('room',ja.state.code);
  assert.match(await request(invite.href,/text\/html/),/Deltag i rum/);
  other.send({type:'join',create:true,name:'Smoke isolated'});
  const jo=await other.take('joined');assert.notEqual(jo.state.code,ja.state.code);

  a.send({type:'start'});
  const shared=await until(()=>{
    for(const [key,state] of a.states){
      if(state.phase==='playing'&&b.states.has(key))return[state,b.states.get(key)];
    }
  },'two clients receive the same running round');
  assert.deepEqual(shared[0],shared[1],'identical authoritative state at the same server tick');
  assert.equal(shared[0].round,1);assert.ok(shared[0].endsAt>shared[0].now);
  assert.deepEqual(shared[0].players.map(player=>player.id).sort(),[ja.id,jb.id].sort());
  const isolated=await until(()=>other.latest?.now>jo.state.now&&other.latest,'separate room state');
  assert.equal(isolated.code,jo.state.code);assert.equal(isolated.phase,'lobby');assert.equal(isolated.round,0);
  assert.deepEqual(isolated.players.map(player=>player.id),[jo.id]);assert.equal(isolated.bullets.length,0);

  await a.leave();
  const remaining=await until(()=>b.latest?.phase==='playing'&&b.latest.players.length===1&&b.latest,'creator leaves while round continues');
  assert.equal(remaining.players[0].id,jb.id);
  await until(()=>b.latest.now>remaining.now+.3,'remaining client keeps receiving advancing simulation');
  assert.equal(b.latest.phase,'playing');assert.equal(other.latest.phase,'lobby');
  await b.leave();await other.leave();
  // Probe removed codes through the same public join protocol, never internals.
  for(const code of [ja.state.code,jo.state.code]){
    a.send({type:'join',code,name:'Smoke cleanup'});
    const rejected=await a.take('error');assert.match(rejected.message,/findes ikke/,'empty test room removed');
  }
  console.log(`PASS ${origin}: HTTP health/home/invite and five JS assets; browser-Origin WebSocket upgrades; two simultaneous players; create/join; shared running-round state; separate room isolation; creator leaves and remaining simulation advances; empty test rooms removed.`);
  console.log('This hosting smoke uses public network interfaces only. It does not test browser rendering, combat, a full round, or separate physical computers.');
}catch(error){failure=error;}
finally{
  const cleanup=await Promise.allSettled(clients.map(client=>client.cleanup()));
  for(const result of cleanup)if(result.status==='rejected'){
    console.error(`Cleanup failed: ${result.reason.message}. A disconnected reserved session expires on the server after 15 seconds.`);
    failure??=result.reason;
  }
}
if(failure){console.error(`FAIL ${origin}: ${failure.message}`);process.exitCode=1;}
