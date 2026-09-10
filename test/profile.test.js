import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile, saveProfile, rewardRound, purchase, levelInfo } from '../public/profile.js';
import { Room } from '../server/game.js';
const storage=()=>{const values=new Map();return{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};};
test('earned XP, level, coins and round rewards are saved exactly once',()=>{
  const store=storage(),profile=loadProfile(store),results=[{id:'a',score:6,kills:2},{id:'b',score:0,kills:0}];
  assert.deepEqual(rewardRound(profile,'ABCDE',1,'a',results),{xp:110,coins:51});
  assert.equal(rewardRound(profile,'ABCDE',1,'a',results),null);
  assert.equal(levelInfo(profile.xp).level,2);assert.equal(profile.rounds,1);assert.equal(profile.wins,1);
  saveProfile(store,profile);assert.deepEqual(loadProfile(store),profile);
});
test('shop rejects insufficient currency, spends once, equips and persists purchases',()=>{
  const store=storage(),p=loadProfile(store);assert.equal(purchase(p,'racing'),false);assert.equal(p.coins,0);
  p.coins=100;assert.equal(purchase(p,'racing'),true);assert.equal(p.coins,20);assert.equal(p.livery,'racing');
  assert.equal(purchase(p,'racing'),true);assert.equal(p.coins,20);assert.equal(purchase(p,'plain'),true);assert.equal(p.livery,'plain');
  saveProfile(store,p);assert.deepEqual(loadProfile(store).owned,['plain','racing']);assert.equal(purchase(p,'unknown'),false);
});
test('corrupted saves fall back safely and equipped boats are validated by the server',()=>{
  const store={getItem:()=>'{broken'};assert.equal(loadProfile(store).boat,'cutter');
  const room=new Room('TEST2'),p=room.addPlayer('A','#ffffff',false,{boat:'tug',livery:'royal'});
  assert.equal(p.boat,'tug');assert.equal(room.snapshot().players[0].livery,'royal');
  const q=room.addPlayer('B','#ffffff',false,{boat:'hack',livery:'bad'});assert.equal(q.boat,'cutter');assert.equal(q.livery,'plain');
});
