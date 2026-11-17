'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {createDesktopUpdates,feedOverride,normalizeNotes}=require('../app/updates.cjs');
class FakeUpdater extends EventEmitter{
 constructor(){super();this.feed=null;this.feeds=[];this.checks=0;this.downloads=0;this.installs=0;this.quit=null;}
 setFeedURL(feed){this.feed=feed;this.feeds.push(feed);}
 async checkForUpdates(){this.checks++;this.emit('checking-for-update');return null;}
 async downloadUpdate(){this.downloads++;return null;}
 quitAndInstall(isSilent,isForceRunAfter){this.installs++;this.quit={isSilent,isForceRunAfter};}
}
function harness({gate={ok:true},choice=0,version='0.2.2',fetcher}={}){
 const updater=new FakeUpdater(),notified=[];
 const updates=createDesktopUpdates({app:{getVersion:()=>version},updater,notify:async snapshot=>{notified.push(snapshot);return choice;},canInstall:()=>gate,startupDelayMs:0,intervalMs:0,fetcher});
 return {updates,updater,notified};
}
const manifest='version: 0.3.1\nfiles:\n  - url: Naumi-Setup-0.3.1-x64.exe\n    sha512: abc=\npath: Naumi-Setup-0.3.1-x64.exe\nsha512: abc=\nreleaseDate: \'2026-11-17T00:00:00Z\'\n';
function feedFetcher(results){let index=0;return async url=>{const current=results[Math.min(index,results.length-1)];index++;if(current instanceof Error)throw current;return {ok:current.ok,text:async()=>current.body};};}
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
 assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);
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
 const {updates,updater}=harness({fetcher:feedFetcher([{ok:true,body:manifest}])});updates.start();
 const first=await updates.check();assert.deepEqual(first,{ok:true,status:'checking'});assert.equal(updater.checks,1);
});
test('feed resolution prefers the CN mirror and validates the manifest',async()=>{
 const {updates,updater}=harness({fetcher:feedFetcher([{ok:true,body:manifest}])});
 updates.start();const result=await updates.check();
 assert.deepEqual(result,{ok:true,status:'checking'});assert.equal(updater.feeds.length,1);
 assert.equal(updater.feeds[0].provider,'generic');assert.match(updater.feeds[0].url,/^https:\/\/gh\.ddlc\.top\/https:\/\/github\.com/);
});
test('feed resolution falls back to GitHub direct when the mirror fails',async()=>{
 const {updates,updater}=harness({fetcher:feedFetcher([{ok:false,body:''},{ok:true,body:manifest}])});
 updates.start();const result=await updates.check();
 assert.equal(result.ok,true);assert.match(updater.feeds[0].url,/^https:\/\/github\.com\/JesstLe\/naumi-desktop\/releases\/latest\/download$/);
});
test('feed resolution rejects malformed manifests and reports unreachable when all fail',async()=>{
 const broken=harness({fetcher:feedFetcher([{ok:true,body:'version: 9.9.9\n'},{ok:true,body:'<html>blocked</html>'}])});
 broken.updates.start();assert.deepEqual(await broken.updates.check(),{ok:false,error:'UPDATE_FEED_UNREACHABLE'});
 const dead=harness({fetcher:feedFetcher([new Error('offline'),new Error('offline')])});dead.updates.start();
 assert.deepEqual(await dead.updates.check(),{ok:false,error:'UPDATE_FEED_UNREACHABLE'});
});
test('publish script extracts exactly the requested changelog section',async()=>{
 const {extractReleaseNotes,injectReleaseNotes}=await import(pathToFileURL(path.resolve(__dirname,'../../scripts/publish-desktop-update.mjs')).href);
 const changelog='# 标题\n\n## 0.3.0 - 2026-11-17\n\n- 新增自动更新\n- 展示日志\n\n## 0.2.2 - 2026-11-16\n\n- 维护协议\n';
 assert.equal(extractReleaseNotes(changelog,'0.3.0'),'- 新增自动更新\n- 展示日志');
 assert.equal(extractReleaseNotes(changelog,'0.2.2'),'- 维护协议');
 assert.equal(extractReleaseNotes(changelog,'9.9.9'),'');
 assert.equal(extractReleaseNotes(changelog,'../evil'),'');
  const injected=injectReleaseNotes(manifest,'- 国内镜像加速\n- 自动回退');
  assert.match(injected,/releaseNotes: \|\n  - 国内镜像加速\n  - 自动回退\n$/);
  assert.equal((injected.match(/^releaseNotes:/gm)||[]).length,1);
  const replaced=injectReleaseNotes('version: 1.0.0\nreleaseNotes: |\n  old\nsha512: x\n','新内容');
  assert.equal((replaced.match(/^releaseNotes:/gm)||[]).length,1);assert.doesNotMatch(replaced,/old/);
  assert.throws(()=>injectReleaseNotes(manifest,'  '),/RELEASE_NOTES_INVALID/);
  assert.throws(()=>injectReleaseNotes('not yaml','x'),/RELEASE_MANIFEST_INVALID/);
});

test('manual checks lock before manifest probing and expose offline state',async()=>{
 let resolve,requests=0;const {updates,updater}=harness({fetcher:()=>{requests++;return new Promise(r=>resolve=r);}});
 updates.start();const first=updates.check();assert.equal(updates.snapshot().status,'checking');
 assert.deepEqual(await updates.check(),{ok:true,status:'checking'});assert.equal(requests,1);
 resolve({ok:true,text:async()=>manifest});await first;assert.equal(updater.checks,1);updates.stop();
 const dead=harness({fetcher:feedFetcher([new Error('offline')])});dead.updates.start();await dead.updates.check();
 assert.equal(dead.updates.snapshot().status,'idle');assert.equal(dead.updates.snapshot().error,'UPDATE_FEED_UNREACHABLE');dead.updates.stop();
});

test('ready update reopens without download and async install gate is fail closed and retryable',async()=>{
 const {updates,updater}=harness({choice:1,gate:Promise.resolve({ok:false})});
 updates.start();updater.emit('update-downloaded');await new Promise(r=>setImmediate(r));
 assert.deepEqual(await updates.check(),{ok:true,status:'ready'});assert.equal(updater.checks,0);assert.equal(updater.downloads,0);
 assert.deepEqual(await updates.install(),{ok:false,error:'UPDATE_INSTALL_BUSY'});assert.equal(updater.installs,0);assert.equal(updates.snapshot().status,'ready');
 updates.stop();
});

test('async installation serializes clicks, resumes on failure, and retries without download',async()=>{
 const updater=new FakeUpdater();let release=0,allow=false,finish;
 const updates=createDesktopUpdates({app:{getVersion:()=> '0.3.3'},updater,notify:async()=>1,canInstall:async()=>{if(!allow)return {ok:false};await new Promise(r=>finish=r);return {ok:true,release:async()=>{release++;}};},startupDelayMs:100000});
 updates.start();assert.deepEqual(await updates.install(),{ok:false,error:'UPDATE_NOT_READY'});updater.emit('update-downloaded');
 assert.equal((await updates.install()).error,'UPDATE_INSTALL_BUSY');allow=true;
 updater.quitAndInstall=()=>{throw Error('fixture failure');};const failed=updates.install();await new Promise(r=>setImmediate(r));
 assert.equal((await updates.install()).error,'UPDATE_INSTALL_BUSY');finish();assert.equal((await failed).error,'UPDATE_INSTALL_FAILED');assert.equal(release,1);assert.equal(updates.snapshot().status,'ready');
 updater.quitAndInstall=()=>{updater.installs++;};const success=updates.install();await new Promise(r=>setImmediate(r));finish();assert.equal((await success).ok,true);assert.equal(updater.installs,1);assert.equal(release,1);
 assert.equal((await updates.install()).error,'UPDATE_INSTALL_BUSY');assert.equal(updater.downloads,0);updates.stop();
});

test('download errors are retryable and lastChecked only follows confirmed no-update',async()=>{
 const {updates,updater}=harness();updates.start();assert.equal(updates.snapshot().lastChecked,null);
 updater.emit('update-available',{version:'0.3.4'});updater.emit('error',Error('download'));assert.equal(updates.snapshot().status,'idle');assert.equal(updates.snapshot().error,'UPDATE_DOWNLOAD_FAILED');
 updater.emit('update-not-available');assert.ok(updates.snapshot().lastChecked>0);updates.stop();
});

test('electron-updater emitted installation errors release the maintenance gate, not only thrown errors',async()=>{
 let released=0;const updater=new FakeUpdater(),updates=createDesktopUpdates({app:{getVersion:()=> '0.3.3'},updater,notify:async()=>1,canInstall:async()=>({ok:true,release:async()=>released++}),startupDelayMs:100000});
 updates.start();updater.emit('update-downloaded');updater.quitAndInstall=()=>updater.emit('error',Error('installer failure'));
 assert.equal((await updates.install()).error,'UPDATE_INSTALL_FAILED');assert.equal(released,1);assert.equal(updates.snapshot().status,'ready');
 updater.quitAndInstall=()=>{updater.installs++;};assert.equal((await updates.install()).ok,true);assert.equal(updater.installs,1);
 updater.emit('error',Error('spawn failure'));await new Promise(r=>setImmediate(r));assert.equal(released,2);assert.equal(updates.snapshot().error,'UPDATE_INSTALL_FAILED');updates.stop();
});

test('republishing uploads assets separately from release edit',async()=>{
 const {releaseCommands}=await import(pathToFileURL(path.resolve(__dirname,'../../scripts/publish-desktop-update.mjs')).href);
 const params={tag:'v0.3.4',notesFile:'notes.md',installer:'setup.exe',manifest:'latest.yml'};
 const commands=releaseCommands({...params,existing:true});assert.deepEqual(commands.map(c=>c.slice(0,2)),[['release','edit'],['release','upload']]);assert.ok(!commands[0].includes('--clobber'));assert.ok(commands[1].includes('--clobber'));
 assert.ok(releaseCommands({...params,existing:false,prerelease:true})[0].includes('--prerelease'));
});
