import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Room, COLORS, sanitizeInput } from './game.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml' };
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code() { return [...randomBytes(5)].map(n=>alphabet[n%alphabet.length]).join(''); }
const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<256000) ws.send(JSON.stringify(data));};

export function createGameServer(options={}) {
  const rooms=new Map(), sessions=new Map();
  const server=http.createServer(async(req,res)=>{
    let pathname;
    try { pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch {res.writeHead(400).end();return;}
    if(pathname==='/health') {res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true}));return;}
    const file=path.resolve(publicDir,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(publicDir)) {res.writeHead(403).end();return;}
    try {
      const body=await readFile(file);
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}).end(body);
    } catch {res.writeHead(404).end('Ikke fundet');}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/ws'||wss.clients.size>=800) {socket.destroy();return;}
    // Only the served origin may connect from a browser. CLI clients have no Origin.
    if(req.headers.origin) {
      try {if(new URL(req.headers.origin).host!==req.headers.host) {socket.destroy();return;}} catch {socket.destroy();return;}
    }
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  function drop(session) {
    session.room.removePlayer(session.player.id);
    sessions.delete(session.token);
    if(![...session.room.players.values()].some(p=>!p.bot)) rooms.delete(session.room.code);
  }
  wss.on('connection',ws=>{
    ws.alive=true;ws.lastPong=Date.now();ws.rateAt=Date.now();ws.messages=0;
    ws.on('pong',()=>{ws.alive=true;});
    ws.on('message',raw=>{
      if(Date.now()-ws.rateAt>1000) {ws.rateAt=Date.now();ws.messages=0;}
      if(++ws.messages>90) {ws.close(1008,'For mange beskeder');return;}
      let m;try {m=JSON.parse(raw.toString());}catch{return;}
      if(!m||typeof m!=='object') return;
      if(m.type==='ping') {send(ws,{type:'pong',at:m.at});return;}
      if(m.type==='resume'&&!ws.session) {
        const session=typeof m.token==='string'?sessions.get(m.token):null;
        if(!session || (session.expires && session.expires<Date.now())) {send(ws,{type:'error',message:'Forbindelsen kunne ikke gendannes. Deltag i rummet igen.',reset:true});return;}
        if(session.ws&&session.ws!==ws) {session.ws.session=null;session.ws.close();}
        session.ws=ws;session.expires=0;session.player.connected=true;ws.session=session;
        send(ws,{type:'joined',id:session.player.id,token:session.token,state:session.room.snapshot()});return;
      }
      if(m.type==='join'&&!ws.session) {
        const name=typeof m.name==='string'?m.name.replace(/[\u0000-\u001f\u007f-\u009f<>]/g,'').trim().slice(0,18):'';
        if(!name) {send(ws,{type:'error',message:'Skriv dit kaldenavn først.'});return;}
        let room;
        if(m.create===true) {
          if(rooms.size>=100) {send(ws,{type:'error',message:'Havet er fyldt. Prøv igen om lidt.'});return;}
          let roomCode;do {roomCode=code();}while(rooms.has(roomCode));
          room=new Room(roomCode,options.roomOptions);rooms.set(roomCode,room);
        } else {
          const roomCode=typeof m.code==='string'?m.code.trim().toUpperCase():'';
          room=rooms.get(roomCode);
          if(!room) {send(ws,{type:'error',message:'Rummet findes ikke længere. Tjek koden eller opret et nyt.'});return;}
        }
        if(room.players.size>=8) {send(ws,{type:'error',message:'Rummet er fuldt (8 spillere).'});return;}
        const player=room.addPlayer(name,COLORS.includes(m.color)?m.color:COLORS[0],false,{boat:m.boat,livery:m.livery});
        const token=randomBytes(24).toString('hex');
        const session={token,room,player,ws,expires:0};sessions.set(token,session);ws.session=session;
        if(m.create===true&&m.solo===true) {
          ['Kaptajn Krabbe','Bøllebøjen','Søsyg Søren'].forEach((n,i)=>room.addPlayer(n,COLORS[i+1],true));
          room.start();
        }
        send(ws,{type:'joined',id:player.id,token,state:room.snapshot()});return;
      }
      const s=ws.session;if(!s) return;
      if(m.type==='input') {const input=sanitizeInput(m.input);if(input) s.room.setInput(s.player,input);}
      if(m.type==='start') s.room.start();
      if(m.type==='leave') {drop(s);ws.session=null;send(ws,{type:'left'});}
    });
    ws.on('error',()=>{});
    ws.on('close',()=>{
      const s=ws.session;if(!s||s.ws!==ws)return;
      s.ws=null;s.expires=Date.now()+15000;s.player.connected=false;
      s.player.input={forward:false,brake:false,turn:0,aim:s.player.aim,fire:false,boost:false};
    });
  });
  let previous=performance.now(), accumulator=0, frame=0;
  const interval=setInterval(()=>{
    const now=performance.now();accumulator+=Math.min(.2,(now-previous)/1000);previous=now;
    while(accumulator>=1/30) {for(const room of rooms.values())room.tick(1/30);accumulator-=1/30;}
    if(++frame%2===0) for(const room of rooms.values()) {
      const packet={type:'state',state:room.snapshot(),events:room.events.splice(0)};
      for(const s of sessions.values()) if(s.room===room&&s.ws) send(s.ws,packet);
    }
    for(const s of sessions.values()) if(s.expires&&s.expires<Date.now()) drop(s);
  },1000/30);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients) {if(!ws.alive) {ws.terminate();continue;}ws.alive=false;ws.ping();}},5000);
  return { server,wss,rooms,sessions,
    listen(port=Number(process.env.PORT)||3000,host='0.0.0.0') {return new Promise(resolve=>server.listen(port,host,()=>resolve(server.address())));},
    async close() {clearInterval(interval);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=createGameServer();
  const addr=await app.listen();
  console.log(`STORMSKUD sejler på http://localhost:${addr.port}`);
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await app.close();process.exit(0);});
}
