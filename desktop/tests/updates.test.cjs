'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {createDesktopUpdates,feedOverride,normalizeNotes}=require('../app/updates.cjs');
class FakeUpdater extends EventEmitter{
 constructor(){super();this.feed=null;this.checks=0;this.downloads=0;this.installs=0;this.quit=null;}
 setFeedURL(feed){this.feed=feed;}
 async checkForUpdates(){this.checks++;this.emit('checking-for-update');return null;}
 async downloadUpdate(){this.downloads++;return null;}
 quitAndInstall(isSilent,isForceRunAfter){this.installs++;this.quit={isSilent,isForceRunAfter};}
}
function harness({gate={ok:true},choice=0,version='0.2.2'}={}){
 const updater=new FakeUpdater(),notified=[];
 const updates=createDesktopUpdates({app:{getVersion:()=>version},updater,notify:async snapshot=>{notified.push(snapshot);return choice;},canInstall:()=>gate,startupDelayMs:0,intervalMs:0});
 return {updates,updater,notified};
}
test('release notes render as bounded plain text',()=>{
 assert.equal(normalizeNotes('<p>修复 <b>登录</b></p><br/>细节<script>alert(1)</script>'),'修复 登录\n\n细节alert(1)');
 assert.equal(normalizeNotes({note:'对象形式'}),'对象形式');
 assert.equal(normalizeNotes(42),'');
 assert.equal(normalizeNotes('x'.repeat(5000)).length,4000);
});
test('feed override accepts https and loopback only, never credentials',()=>{
 const cases=[['',null],['https://updates.example.com/feed',{url:'https://updates.example.com/feed'}],['http://127.0.0.1:8080/feed',{url:'http://127.0.0.1:8080/feed'}],['http://192.168.1.10/feed',{error:'UPDATE_FEED_INSECURE'}],['https://user:pass@example.com/feed',{error:'UPDATE_FEED_CREDENTIALS_FORBIDDEN'}],['not a url',{error:'UPDATE_FEED_INVALID'}]];
 const previous=process.env.NAUMI_UPDATE_URL,previousInsecure=process.env.NAUMI_UPDATE_ALLOW_INSECURE_HTTP;
 try{for(const[value,expected]of cases){process.env.NAUMI_UPDATE_URL=value;assert.deepEqual(feedOverride(),expected,value||'(empty)');}
  process.env.NAUMI_UPDATE_URL='http://192.168.1.10/feed';process.env.NAUMI_UPDATE_ALLOW_INSECURE_HTTP='1';assert.deepEqual(feedOverride(),{url:'http://192.168.1.10/feed'});
 }finally{if(previous===undefined)delete process.env.NAUMI_UPDATE_URL;else process.env.NAUMI_UPDATE_URL=previous;if(previousInsecure===undefined)delete process.env.NAUMI_UPDATE_ALLOW_INSECURE_HTTP;else process.env.NAUMI_UPDATE_ALLOW_INSECURE_HTTP=previousInsecure;}
});
test('update lifecycle reaches ready, notifies once and installs silently',async()=>{
 const {updates,updater,notified}=harness();
 assert.deepEqual(updates.start(),{ok:true});
 assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,true);
 updater.emit('update-available',{version:'0.3.0',releaseNotes:'<b>自动更新</b>'});
 let state=updates.snapshot();
 assert.equal(state.status,'downloading');assert.equal(state.version,'0.3.0');assert.equal(state.notes,'自动更新');assert.equal(updater.downloads,1);
 updater.emit('download-progress',{percent:150,transferred:10,total:20,bytesPerSecond:5});
 assert.deepEqual(updates.snapshot().progress,{percent:100,transferred:10,total:20,bytesPerSecond:5});
 await new Promise(r=>setImmediate(r));
 updater.emit('update-downloaded');
 await new Promise(r=>setImmediate(r));
 state=updates.snapshot();assert.equal(state.status,'ready');assert.equal(notified.length,1);assert.equal(notified[0].version,'0.3.0');
 await new Promise(r=>setImmediate(r));
 assert.equal(updater.installs,1);assert.deepEqual(updater.quit,{isSilent:true,isForceRunAfter:true});
});
test('busy desktop defers install but stays ready',async()=>{
 const {updates,updater,notified}=harness({gate:{ok:false,reason:'WORKSPACE_OPERATIONS_IN_FLIGHT'}});
 updates.start();updater.emit('update-available',{version:'0.3.0',releaseNotes:'x'});
 await new Promise(r=>setImmediate(r));updater.emit('update-downloaded');
 await new Promise(r=>setImmediate(r));
 assert.equal(notified.length,1);assert.equal(updater.installs,0);assert.equal(updates.snapshot().status,'ready');
});
test('later choice and missing update reset state without installing',async()=>{
 const {updates,updater,notified}=harness({choice:1});
 updates.start();updater.emit('update-available',{version:'0.3.0'});
 await new Promise(r=>setImmediate(r));updater.emit('update-downloaded');
 await new Promise(r=>setImmediate(r));
 assert.equal(updater.installs,0);
 updater.emit('update-not-available');
 const state=updates.snapshot();assert.equal(state.status,'idle');assert.equal(state.version,null);assert.equal(state.notes,'');assert.equal(state.progress,null);
 updates.stop();assert.equal(updates.snapshot().status,'disabled');
});
test('manual check is deduplicated while one is in flight',async()=>{
 const {updates,updater}=harness();updates.start();
 const first=await updates.check();assert.deepEqual(first,{ok:true,status:'checking'});assert.equal(updater.checks,1);
});
test('publish script extracts exactly the requested changelog section',async()=>{
 const {extractReleaseNotes}=await import(pathToFileURL(path.resolve(__dirname,'../../scripts/publish-desktop-update.mjs')).href);
 const changelog='# 标题\n\n## 0.3.0 - 2026-11-17\n\n- 新增自动更新\n- 展示日志\n\n## 0.2.2 - 2026-11-16\n\n- 维护协议\n';
 assert.equal(extractReleaseNotes(changelog,'0.3.0'),'- 新增自动更新\n- 展示日志');
 assert.equal(extractReleaseNotes(changelog,'0.2.2'),'- 维护协议');
 assert.equal(extractReleaseNotes(changelog,'9.9.9'),'');
 assert.equal(extractReleaseNotes(changelog,'../evil'),'');
});
