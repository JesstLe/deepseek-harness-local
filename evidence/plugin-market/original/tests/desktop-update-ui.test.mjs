import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createUpdateStore,updateView,installDesktopUpdatesUI} from '../plugins/naumi-enterprise/assets/desktop-updates.js';
const tick=()=>new Promise(r=>setImmediate(r));

test('web has no dead update entry and desktop uses the native list slot only',()=>{
 assert.equal(typeof installDesktopUpdatesUI({},null,null,{}),'function');
 let registration,closed=0,unsub=0;
 const api={onUpdateState:()=>()=>unsub++,updateState:async()=>({enabled:true,status:'idle'}),checkUpdates:async()=>({ok:true})};
 const off=installDesktopUpdatesUI({slots:{inject:(name,fn)=>{assert.equal(name,'sidebar.footer.action');return fn();},register:(options,component)=>{registration={options,component};return()=>closed++;}}},{},null,api);
 assert.equal(registration.options.id,'naumi-updates');off();assert.equal(closed,1);assert.equal(unsub,1);
});

test('native stream wins over a stale initial read and all subscriptions are disposed',async()=>{
 let resolve,listener,off=0;
 const store=createUpdateStore({onUpdateState:fn=>{listener=fn;return()=>off++;},updateState:()=>new Promise(r=>resolve=r)});
 await tick();listener({enabled:true,status:'downloading',version:'0.3.4'});resolve({enabled:true,status:'idle'});await tick();assert.equal(store.getSnapshot().status,'downloading');
 const before=store.getSnapshot();store.dispose();listener({status:'ready'});assert.equal(store.getSnapshot(),before);assert.equal(off,1);
});

test('UI commands serialize and IPC failures are visible and retryable',async()=>{
 let listener,resolve,calls=0,fail=true;
 const store=createUpdateStore({onUpdateState:fn=>{listener=fn;return()=>{};},updateState:async()=>({enabled:true,status:'idle'}),checkUpdates:()=>{calls++;return new Promise(r=>resolve=r);},installUpdate:async()=>{if(fail)throw Error('disconnected');return {ok:true};}});
 await tick();const first=store.check(),second=store.check();assert.equal(first,second);await tick();assert.equal(calls,1);
 listener({status:'checking'});resolve({ok:false,error:'UPDATE_FEED_UNREACHABLE'});await first;assert.equal(store.getSnapshot().error,'UPDATE_FEED_UNREACHABLE');
 await store.install();assert.equal(store.getSnapshot().error,'UPDATE_CONNECTION_FAILED');fail=false;assert.equal((await store.install()).ok,true);store.dispose();
});

test('view distinguishes unchecked, confirmed latest, progress, disabled, busy and ready',()=>{
 assert.equal(updateView({enabled:true,status:'idle'}).title,'检查更新');
 assert.equal(updateView({enabled:true,status:'idle',lastChecked:1}).title,'已是最新版本');
 assert.equal(updateView({enabled:false,status:'disabled'}).title,'安装版支持更新');
 assert.equal(updateView({enabled:true,status:'downloading',progress:{percent:150}}).percent,100);
 assert.equal(updateView({enabled:true,status:'ready',error:'UPDATE_INSTALL_BUSY'}).title,'任务运行中，稍后更新');
 assert.equal(updateView({enabled:true,status:'ready'}).ready,true);
});

test('native footer layout is additive, settings-left/update-right, with asset wiring',()=>{
 const css=fs.readFileSync('plugins/naumi-enterprise/assets/desktop-updates.css','utf8'),ui=fs.readFileSync('plugins/naumi-enterprise/assets/desktop-updates.js','utf8');
 const upstream=fs.readFileSync('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js','utf8');
 for(const name of ['_footArea','_settingsArea','_footerActions'])assert.ok(upstream.includes(name),name);
 assert.match(css,/_settingsArea.*grid-column:1;grid-row:1/);assert.match(css,/\.nup-trigger\{grid-column:2;grid-row:1/);
 assert.ok(!ui.includes('MutationObserver'));assert.ok(!ui.includes('innerHTML'));assert.ok(!ui.includes('fetch('));
 const host=fs.readFileSync('plugins/naumi-enterprise/host.js','utf8'),client=fs.readFileSync('plugins/naumi-enterprise/client.js','utf8');
 for(const asset of ['desktop-updates.js','desktop-updates.css'])assert.ok(host.includes(asset));assert.ok(client.includes('installDesktopUpdatesUI'));
});

test('actual native gate atomically quiesces owned backend and fails closed on busy/unknown',async()=>{
 const main=fs.readFileSync('desktop/app/main.cjs','utf8');
 const gate=main.slice(main.indexOf('async function canInstallUpdate()'),main.indexOf('async function showUpdateNotice'));
 const maintenance=main.slice(main.indexOf('async function performMaintenance('),main.indexOf('function isAlive('));
 const calls=[],ctx={closing:false,booting:false,connecting:false,bridge:{runtime:{queues:new Map()}},enterprise:{running:0},settings:{isolated:true},backend:{owned:true},maintenanceTicket:null,maintenanceUntil:0,maintenanceBlocked:()=>false,randomUUID:()=> 'fixture',maintenanceRequest:async(...args)=>{calls.push(args);}};
 vm.createContext(ctx);vm.runInContext(gate+maintenance,ctx);
 ctx.enterprise.running=1;assert.equal((await ctx.canInstallUpdate()).ok,false);assert.equal(calls.length,0);ctx.enterprise.running=0;
 ctx.backend.owned=false;assert.equal((await ctx.canInstallUpdate()).ok,false);assert.equal(calls.length,0);ctx.backend.owned=true;
 const accepted=await ctx.canInstallUpdate();assert.equal(accepted.ok,true);assert.equal(calls[0][1],'quiesce');await accepted.release();assert.equal(calls[1][1],'resume');assert.equal(ctx.maintenanceTicket,null);
 ctx.maintenanceRequest=async()=>{throw Error('INSTALL_RUNNING_TASKS');};assert.equal((await ctx.canInstallUpdate()).ok,false);assert.equal(ctx.maintenanceTicket,null);
});

test('update IPC remains main-window/main-frame scoped and preload exposes no generic IPC',()=>{
 const main=fs.readFileSync('desktop/app/main.cjs','utf8');for(const channel of ['naumi:update-state','naumi:update-check','naumi:update-install']){
  const line=main.split('\n').find(x=>x.includes("ipcMain.handle('"+channel+"'"));assert.ok(line.includes('e.sender!==window.webContents||e.senderFrame!==window.webContents.mainFrame'));
 }
 const preload=fs.readFileSync('desktop/app/preload.cjs','utf8');assert.ok(preload.includes("installUpdate:()=>ipcRenderer.invoke('naumi:update-install')"));assert.ok(!preload.includes("exposeInMainWorld('ipc"));
});
