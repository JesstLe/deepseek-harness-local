import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserScheduler,browserViewport,browserPoint} from '../plugins/naumi-enterprise/assets/browser-scheduler.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('continuous resize sends only final viewport, no poll backlog',async()=>{
  const calls=[],s=new BrowserScheduler({request:async a=>{calls.push(a);return a;},onState:()=>{},resizeDelay:25,pollDelay:10});
  s.resize(600,700);s.setActive(true);for(let i=0;i<25;i++){s.resize(600+i,700);await delay(2);}assert.equal(calls.length,0);await delay(35);s.dispose();assert.equal(calls.filter(c=>c.action==='resize').length,1);assert.equal(calls[0].width,624);assert(s.stats.requests<=3);
});
test('stale frame never replaces latest-size picture',async()=>{
  let finish;const states=[],calls=[];const s=new BrowserScheduler({request:a=>{calls.push(a);if(calls.length===1)return new Promise(r=>{finish=r;});return Promise.resolve(a);},onState:d=>states.push(d),resizeDelay:5,pollDelay:10000});
  s.resize(500,700);s.setActive(true);await delay(10);s.resize(800,700);finish({width:500});await delay(15);s.dispose();assert(!states.some(x=>x.width===500));assert(states.some(x=>x.width===800));assert.equal(s.stats.discardedFrames,1);
});
test('typing bursts compose without dropping characters or replaying actions',async()=>{
  const calls=[],s=new BrowserScheduler({request:async a=>{calls.push(a);await delay(8);return a;},onState:()=>{},pollDelay:10000});s.setActive(true);
  await Promise.all([...('Naumi中文')].map(text=>s.perform({action:'text',text})));s.dispose();assert.equal(calls.filter(x=>x.action==='text').map(x=>x.text).join(''),'Naumi中文');assert.equal(calls.filter(x=>x.action==='text').length,1);
});
test('mutations retain order across coalesced input groups',async()=>{
  const calls=[],s=new BrowserScheduler({request:async a=>{calls.push(a);await delay(3);return a;},onState:()=>{},pollDelay:10000});s.setActive(true);
  await Promise.all([s.perform({action:'text',text:'a'}),s.perform({action:'click',x:1,y:1}),s.perform({action:'text',text:'b'})]);s.dispose();assert.deepEqual(calls.filter(x=>x.action!=='state').map(x=>x.action),['text','click','text']);
});
test('hidden panel stops passive requests and disposal clears pending work',async()=>{
  const calls=[],s=new BrowserScheduler({request:async a=>{calls.push(a);return a;},onState:()=>{},pollDelay:5});s.setActive(true);await delay(9);s.setActive(false);const n=calls.length;await delay(15);assert.equal(calls.length,n);const pending=s.perform({action:'click',x:1,y:1});s.dispose();await assert.rejects(pending,/CLOSED/);
});
test('contain-fit coordinate mapping rejects letterbox padding and preserves ratios',()=>{
  const rect={left:10,top:10,width:400,height:600},viewport={width:800,height:600};assert.deepEqual(browserPoint(rect,viewport,210,160),{x:400,y:300});assert.equal(browserPoint(rect,viewport,210,510),null);assert.deepEqual(browserViewport(390,700),{width:390,height:700});assert.deepEqual(browserViewport(10,20),{width:200,height:120});
});
