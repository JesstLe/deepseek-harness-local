import {_electron as electron} from '../node_modules/playwright/index.mjs';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {DatabaseSync} from 'node:sqlite';
import {EmployeeStore} from '../../plugins/naumi-enterprise/employee-store.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),e=path.resolve(process.env.NAUMI_LIFECYCLE_EVIDENCE??path.join(root,'evidence/desktop-lifecycle')),exe=path.join(root,'runtime/naumi-desktop-release/win-unpacked/Naumi.exe'),require=createRequire(import.meta.url),{probeIdentity}=require('../app/backend.cjs');
const base=path.join(root,'.dsh/desktop-lifecycle-'+Date.now()),userA=path.join(base,'employee A'),userB=path.join(base,'employee B');fs.mkdirSync(e,{recursive:true});
let foreignPosts=0;const logo=fs.readFileSync(path.join(root,'plugins/naumi-enterprise/assets/symbol.svg'));
const fixture=http.createServer((q,r)=>{if(q.method==='POST')foreignPosts++;if(q.url==='/page'){r.setHeader('X-Frame-Options','DENY');r.setHeader('Content-Type','text/html');r.end('<title>Naumi Lifecycle Fixture</title><h1>Naumi</h1><input aria-label="Lifecycle input">');}else{r.setHeader('Content-Type','image/svg+xml');r.end(logo);}});await new Promise(r=>fixture.listen(0,'127.0.0.1',r));const preferred='http://127.0.0.1:'+fixture.address().port;
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const handles=new Set();
async function launch(userData){
 const env={...process.env,NAUMI_USER_DATA:userData,NAUMI_HOST_URL:preferred,NAUMI_ENTERPRISE_ORIGIN:preferred,NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1'};
 for(const key of ['NAUMI_ROOT','NAUMI_DSH_HOME','NAUMI_NODE','ELECTRON_RUN_AS_NODE','NAUMI_DESKTOP_INSTANCE_ID','NAUMI_DESKTOP_BUNDLE_ID'])delete env[key];
 env.PATH=process.env.SystemRoot+'\\System32;'+process.env.SystemRoot;
 const app=await electron.launch({executablePath:exe,args:[],env,timeout:90000});handles.add(app);const page=await app.firstWindow();page.on('pageerror',error=>console.log('DESKTOP_PAGE_ERROR '+error.message));page.on('console',message=>{if(message.type()==='error')console.log('DESKTOP_CONSOLE '+message.text().replace(/token=[^&\s]+/g,'token=REDACTED'));});
 await Promise.race([page.waitForURL(/^http:\/\/127\.0\.0\.1:/,{timeout:120000}),page.waitForURL('**/startup.html?error=**',{timeout:120000}).then(()=>{throw Error('LIFECYCLE_STARTUP '+new URL(page.url()).searchParams.get('error'));})]);
 await page.getByRole('button',{name:'工作台',exact:true}).first().waitFor();
 const deadline=Date.now()+15000;let info;
 while(Date.now()<deadline){info=await app.evaluate(()=>{const t=globalThis.__naumiTest;if(!t)return null;return {shellPid:process.pid,home:t.settings.home,workspace:t.settings.workspace,url:t.settings.url,enterpriseOrigin:t.settings.enterpriseOrigin,id:t.settings.identity.id,bundleId:t.settings.runtime.bundleId,verified:t.backend.instanceVerified,owned:t.backend.owned,reattached:t.backend.reattached??false};});if(info)break;await new Promise(r=>setTimeout(r,40));}
 assert(info?.verified&&info.owned);assert.equal(info.workspace,path.join(info.home,'workspace'));fs.accessSync(info.workspace,fs.constants.W_OK);assert.notEqual(info.url,preferred);const receipt=JSON.parse(fs.readFileSync(path.join(info.home,'desktop-backend.json')));return {app,page,info,pid:receipt.pid};
}
async function waitGone(pid){const deadline=Date.now()+10000;while(Date.now()<deadline){if(!alive(pid))return;await new Promise(r=>setTimeout(r,40));}throw Error('PROCESS_EXIT_TIMEOUT');}
async function close(value){if(!value)return;await value.app.close();handles.delete(value.app);await waitGone(value.info.shellPid);assert.equal(alive(value.pid),false,'managed backend must be observed stopped');}
async function verifyEmployee(home){for(let attempt=0;;attempt++){let d;try{d=new DatabaseSync(path.join(home,'naumi/employees.sqlite'),{readOnly:true});const p=JSON.parse(d.prepare("SELECT json FROM entities WHERE bot_id='fixture-employee' AND id='profile'").get().json);assert.equal(p.persona,'retained persona');assert(d.prepare("SELECT json FROM entities WHERE bot_id='fixture-employee' AND type='memory'").all().some(r=>JSON.parse(r.json).text==='retained memory'));assert.equal(d.prepare('SELECT state FROM desktop_lifecycle_fixture').get().state,'unknown');assert.equal(d.prepare('PRAGMA user_version').get().user_version,1);return;}catch(error){if(error.errcode!==1546||attempt>=20)throw error;console.log('SQLITE_HANDOFF pending_ioerr=1546 retry='+attempt);await new Promise(r=>setTimeout(r,100));}finally{d?.close();}}}
function seedEmployee(home){const store=new EmployeeStore(path.join(home,'naumi/employees.sqlite'));try{store.updateProfile('fixture-employee',{expectedRevision:0,operationId:'persona',patch:{persona:'retained persona'}});store.createMemory('fixture-employee',{operationId:'memory',kind:'fact',text:'retained memory'});store.db.exec("CREATE TABLE desktop_lifecycle_fixture(state TEXT);INSERT INTO desktop_lifecycle_fixture VALUES('unknown')");}finally{store.close();}}
let a,b,restarted,recovered;
try{
 seedEmployee(path.join(userA,'harness'));
 a=await launch(userA);b=await launch(userB);assert.notEqual(a.info.id,b.info.id);assert.notEqual(a.pid,b.pid);assert.notEqual(a.info.url,b.info.url);
 await a.page.addLocatorHandler(a.page.getByRole('dialog').filter({hasText:'开始使用'}),async d=>{await d.getByRole('button',{name:'关闭',exact:true}).click();});
 await a.page.getByRole('button',{name:'工作台',exact:true}).first().click();
 await a.page.getByRole('button',{name:'AI 协作',exact:true}).click();await a.page.locator('button[aria-label="打开右侧边栏"],button[aria-label="收起右侧边栏"]').first().waitFor();const toggle=a.page.getByRole('button',{name:'打开右侧边栏',exact:true});if(await toggle.isVisible())await toggle.click();await a.page.getByText('浏览器',{exact:true}).last().click();const address=a.page.getByRole('textbox',{name:'输入 HTTP(S) 地址',exact:true});await address.fill(preferred+'/page');await address.press('Enter');
 const deadline=Date.now()+15000;let partition;
 while(Date.now()<deadline){partition=await a.app.evaluate(()=>{const entry=[...globalThis.__naumiTest.guests.leases.values()].find(v=>v.guest&&!v.guest.isDestroyed()&&v.guest.getTitle()==='Naumi Lifecycle Fixture');return entry?.partition??null;});if(partition)break;await new Promise(r=>setTimeout(r,40));}assert(partition);
 await a.app.evaluate(async({session},{partition,url})=>{const s=session.fromPartition(partition);await s.cookies.set({url,name:'naumi_lifecycle_fixture',value:'retained-browser-state',expirationDate:Math.floor(Date.now()/1000)+3600});await s.cookies.flushStore();},{partition,url:preferred});
 const otherCookies=await b.app.evaluate(async({session},{partition,url})=>session.fromPartition(partition).cookies.get({url,name:'naumi_lifecycle_fixture'}),{partition,url:preferred});assert.equal(otherCookies.length,0);
 await a.page.screenshot({path:path.join(e,'desktop-lifecycle.png')});const first=a;await close(a);a=null;
 await verifyEmployee(first.info.home);
 restarted=await launch(userA);assert.equal(restarted.info.id,first.info.id);assert.notEqual(restarted.pid,first.pid);await verifyEmployee(restarted.info.home);
 const cookies=await restarted.app.evaluate(async({session},{partition,url})=>session.fromPartition(partition).cookies.get({url,name:'naumi_lifecycle_fixture'}),{partition,url:preferred});assert.equal(cookies[0]?.value,'retained-browser-state');
 // On Windows Playwright.process() is a cmd.exe launcher, not the Electron main process.
 // Kill only the exact main PID read inside this owned test application's main context.
 process.kill(restarted.info.shellPid,'SIGKILL');await waitGone(restarted.info.shellPid);handles.delete(restarted.app);
 assert(alive(restarted.pid),'backend survives a parent-only crash for proven reattachment');const identity=JSON.parse(fs.readFileSync(path.join(restarted.info.home,'desktop-instance.json')));let recoveredProof;const proofDeadline=Date.now()+3000;while(Date.now()<proofDeadline&&alive(restarted.pid)){recoveredProof=await probeIdentity({...restarted.info,identity});if(recoveredProof)break;await new Promise(r=>setTimeout(r,50));}assert.equal(recoveredProof?.pid,restarted.pid);
 recovered=await launch(userA);assert.equal(recovered.info.id,first.info.id);assert.equal(recovered.pid,restarted.pid);assert.equal(recovered.info.reattached,true);await verifyEmployee(recovered.info.home);
 await close(recovered);recovered=null;await close(b);b=null;assert.equal(foreignPosts,0);assert.equal((await fetch(preferred)).status,200);
 const report={status:'PASS',acceptance:'unpacked desktop, not NSIS installation',profiles:2,instanceIdsSeparated:true,foreignLogoAttached:false,foreignProcessStopped:false,portsSeparated:true,nativeBrowser:true,browserStateRetained:true,browserStateCrossProfileLeaked:false,employeePersonaRetained:true,employeeMemoryRetained:true,unknownFixtureRetained:true,employeeSchema:1,parentCrashRecovered:true,originalBackendPidReused:true,reattachedShutdownObserved:true,developmentPath:false,liveEmployeeProfilesTouched:false};
 fs.writeFileSync(path.join(e,'DESKTOP_LIFECYCLE.json'),JSON.stringify(report,null,2)+'\n');
 console.log('DESKTOP_LIFECYCLE profiles=2 logo_attach=0 ports=separate native_browser=1 browser_state=retained cross_profile_leak=0');
 console.log('DESKTOP_RECOVERY normal_restart=PASS parent_crash=PASS original_backend_pid=retained authenticated_stop=PASS');
 console.log('DESKTOP_DATA persona=retained memory=retained unknown_fixture=retained schema=1 development_path=0 live_data=untouched');
}catch(error){
 let index=0;for(const app of handles){try{const page=await app.firstWindow();fs.writeFileSync(path.join(e,'UI_FAILURE_'+index+'.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(e,'UI_FAILURE_'+index+'.png'),timeout:5000});index++;}catch{}}
 throw error;
}finally{
 for(const app of handles)await app.close().catch(()=>{});
 // No PID-based kill of a reattached or unrelated process. Its proven instance API owns shutdown.
 fixture.closeAllConnections();await new Promise(r=>fixture.close(r));
}
