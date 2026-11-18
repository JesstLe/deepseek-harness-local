// A real packaged app and bundled backend, with only the external account/update APIs controlled.
// Never installs over an employee profile, downloads an update, sends model requests or touches 3080.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';import{spawnSync}from'node:child_process';
const version=process.argv[4]??'0.3.5';
const root=path.resolve(process.argv[2]??fileURLToPath(new URL('../..',import.meta.url))),require=createRequire(import.meta.url),{_electron}=require('playwright'),out=path.resolve(process.argv[5]??path.join(root,'evidence/installer-path-fix')),exe=path.resolve(process.argv[3]??path.join(root,'runtime/naumi-desktop-release-0.3.5/win-unpacked/Naumi.exe'));
fs.mkdirSync(out,{recursive:true});const userData=process.argv[6]?path.resolve(process.argv[6]):fs.mkdtempSync(path.join(os.tmpdir(),'naumi-035-package-')),requests=[];let application,workerPid,home;
const server=http.createServer(async(req,res)=>{
 const pathname=req.url.split('?')[0];
 const send=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
 requests.push({method:req.method,path:req.url});
 if(pathname==='/latest.yml'){res.writeHead(200,{'content-type':'text/yaml'});res.end('version: '+version+'\nfiles:\n  - url: Naumi-Setup-'+version+'-x64.exe\n    sha512: '+Buffer.alloc(64).toString('base64')+'\npath: Naumi-Setup-'+version+'-x64.exe\nsha512: '+Buffer.alloc(64).toString('base64')+'\nreleaseDate: 2026-11-17T00:00:00Z\n');return;}
 if(req.url==='/api/auth/login'){
  let text='';for await(const part of req)text+=part;const input=JSON.parse(text);if(input.email!=='release@example.test'||input.password!=='fixture-only-password')return send({error:'wrong'},401);
  res.setHeader('set-cookie','nv_user=release; HttpOnly; Path=/; SameSite=Lax');return send({ok:true,user:{email:'release@example.test'}});
 }
 if(req.url==='/api/auth/session')return send({user:req.headers.cookie?.includes('nv_user=release')?{email:'release@example.test',name:'Release QA'}:null});
 if(req.url==='/api/auth/logout'){res.setHeader('set-cookie','nv_user=; Max-Age=0; Path=/');return send({ok:true});}
 res.writeHead(404).end();
});await new Promise(r=>server.listen(Number(process.env.NAUMI_QA_FIXED_PORT??0),'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const env={...process.env,NAUMI_USER_DATA:userData,NAUMI_IDENTITY_ORIGIN:origin,NAUMI_UPDATE_URL:origin,NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1'};
for(const name of ['NAUMI_ROOT','NAUMI_DSH_HOME','NAUMI_NODE','NAUMI_HOST_URL','NAUMI_ENTERPRISE_ORIGIN','ELECTRON_RUN_AS_NODE','NAUMI_UPDATE_DEV'])delete env[name];
env.PATH=process.env.SystemRoot+'\\System32;'+process.env.SystemRoot;
try{
 application=await _electron.launch({executablePath:exe,args:[],env,timeout:90000});const page=await application.firstWindow();
 await page.waitForURL(url=>url.href.endsWith('/identity.html')||/^http:\/\/127\.0\.0\.1:/.test(url.href),{timeout:120000});
 if(page.url().endsWith('/identity.html')){await page.locator('#account').waitFor();assert(!(await page.locator('body').innerText()).includes('DESIGN'));assert.equal(await page.locator('.mg-brand-lockup').getAttribute('aria-label'),'Naumi');await page.locator('#account').fill('release@example.test');await page.locator('#password').fill('fixture-only-password');await page.locator('#submit').click();}

 await Promise.race([page.waitForURL(/^http:\/\/127\.0\.0\.1:/,{timeout:120000}),page.waitForURL('**/startup.html?error=**',{timeout:120000}).then(()=>{throw Error('PACKAGE_BOOT '+new URL(page.url()).searchParams.get('error'));})]);
 await page.locator('.nup-trigger').waitFor({timeout:60000});
 const info=await application.evaluate(({app})=>{const t=globalThis.__naumiTest;return{version:app.getVersion(),packaged:app.isPackaged,home:t.settings.home,backend:t.settings.root,owned:t.backend.owned,enterprise:!!t.enterprise};});
 assert.equal((await page.evaluate(()=>window.naumiDesktop.runtimeInfo())).clientVersion,version);assert.equal(await page.evaluate(()=>window.naumiDesktop.appVersion),version);assert.equal(info.version,version);assert.equal(info.packaged,true);assert.equal(info.owned,true);assert.equal(info.enterprise,false);assert(info.backend.includes('resources'));assert(info.home.startsWith(userData+path.sep));home=info.home;
 assert(!fs.existsSync(path.join(home,'desktop-enterprise.json')));workerPid=JSON.parse(fs.readFileSync(path.join(home,'desktop-backend.json'))).pid;
 const placement=await page.evaluate(()=>{const u=document.querySelector('.nup-trigger'),f=u.closest('[class*="_footArea"]'),s=f.querySelector('[class*="_settingsArea"]');const a=u.getBoundingClientRect(),b=s.getBoundingClientRect();return{right:a.left>=b.right-1,row:Math.abs(a.top-b.top)<10};});assert(placement.right&&placement.row,JSON.stringify(placement));
 await page.locator('.nup-trigger').click();await page.locator('.nup-status').filter({hasText:'已是最新版本'}).waitFor({timeout:30000});assert((await page.locator('.nup-version').innerText()).includes(version));assert(requests.some(r=>r.path==='/latest.yml'));assert(!requests.some(r=>r.path.endsWith('.exe')));
 const proofPath=path.join(userData,'qa-native-session.json');
 const rpc=async(method,args)=>page.evaluate(async({method,args})=>{const response=await fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args}})});const v=await response.json();if(!response.ok||!v.result?.ok)throw Error('QA_RPC '+method+' '+JSON.stringify(v));return v.result.value;},{method,args});
 let sessionProof;
 if(process.env.NAUMI_QA_CREATE_SESSION==='1'){const v=await rpc('session/create',{request:{cwd:path.join(home,'workspace')}});sessionProof={sessionId:v.sessionId,home,issuer:origin};fs.writeFileSync(proofPath,JSON.stringify(sessionProof));}
 else if(fs.existsSync(proofPath)){sessionProof=JSON.parse(fs.readFileSync(proofPath));assert.equal(home,sessionProof.home,'UPGRADE_ACCOUNT_HOME_CHANGED');assert.equal(origin,sessionProof.issuer,'UPGRADE_TEST_ISSUER_CHANGED');const state=await rpc('session/state',{request:{sessionId:sessionProof.sessionId}});assert(state,'OLD_NATIVE_SESSION_MISSING');}
 let botChat=null,workspaceProvision=null;if(version==='0.4.0'){const provision=require(path.join(info.backend,'plugins/naumi-enterprise/managed-workspace.cjs'));workspaceProvision=await provision.createManagedWorkspace(path.join(home,'fresh-owner-fixture'),{parent:home});assert.equal(workspaceProvision.created,true);assert.equal(workspaceProvision.acl.status,'OWNER_LABEL_READY');assert(['user','token-default'].includes(workspaceProvision.acl.ownerMode));assert(fs.existsSync(path.join(home,'workspace')));assert(!fs.readdirSync(home).some(n=>n.startsWith('.naumi-workspace-')));}
 if(version==='0.4.0'){
  const command=body=>page.evaluate(async body=>{const r=await fetch('/naumi/bots',{method:'POST',headers:{'Content-Type':'application/json','x-naumi-bots':'1'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error('QA_BOT '+JSON.stringify(v));return v;},body);
  const primary=await command({action:'create-primary',requestId:crypto.randomUUID(),expectedRevision:0,name:'发布验收助手'});
  await page.locator('.nup-trigger').click();await page.locator('.naumi-navigation-switch button').nth(1).click();const row=page.locator('[data-bot-id="'+primary.id+'"]');await row.locator('.naumi-bot-open').click();await page.locator('[data-conversation-session="'+primary.homeSessionId+'"]').waitFor();
  const beforeCount=(await rpc('session/list',{_request:{}})).items.length;await row.locator('.naumi-bot-open').click();assert.equal((await rpc('session/list',{_request:{}})).items.length,beforeCount);
  await row.getByRole('button',{name:'发布验收助手的任务记录',exact:true}).click();const overview=page.locator('[data-bot-overview="'+primary.id+'"]');await overview.waitFor();await overview.getByRole('button',{name:'主聊天',exact:true}).first().click();await page.locator('[data-conversation-session="'+primary.homeSessionId+'"]').waitFor();
  const taskApi=await page.evaluate(async()=>{const r=await fetch('/naumi/bot-tasks');return{header:r.headers.get('x-naumi-bot-main-chat'),data:await r.json()};});assert.equal(taskApi.header,'1');assert.equal(taskApi.data.tasks.length,0);botChat={stableHome:true,repeatedClickNewSessions:0,tasksSecondary:true,returnHome:true,selfTaskAPI:true,modelPrompts:0};
 }
 const updates=await page.evaluate(()=>window.naumiDesktop.updateState());assert.equal(updates.enabled,true);assert.equal(updates.status,'idle');assert.equal(updates.currentVersion,version);assert(updates.lastChecked);
 // Hidden packaged windows can stall CDP screenshots despite responsive DOM/IPC.
 // Native capture is supporting evidence only, never a substitute for assertions.
 let screenshot='not-captured',captureTimer;
 try{const bytes=await Promise.race([application.evaluate(async({BrowserWindow})=>Array.from((await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG())),new Promise((_r,reject)=>{captureTimer=setTimeout(()=>reject(Error('NATIVE_CAPTURE_TIMEOUT')),5000);})]);if(bytes.length>200){fs.writeFileSync(path.join(out,'packaged-update.png'),Buffer.from(bytes));screenshot='native-capture';}}catch{}finally{clearTimeout(captureTimer);}
 const cli=spawnSync(path.join(info.backend,'node.exe'),[path.join(info.backend,'runtime/dingtalk-cli.cjs'),'auth','status','--readonly','--format','json'],{cwd:home,env:{SystemRoot:process.env.SystemRoot,PATH:env.PATH,DSH_HOME:home},encoding:'utf8',timeout:15000});assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).authenticated,false);
 const manifest=JSON.parse(fs.readFileSync(path.join(info.backend,'runtime-manifest.json')));assert.equal(manifest.version,version);assert.equal(manifest.dingtalk.version,'1.0.68');assert.equal(manifest.personalCredentials,false);assert.equal(manifest.browserProfiles,false);
 await application.close();application=null;await new Promise(r=>setTimeout(r,150));let alive=false;try{process.kill(workerPid,0);alive=true;}catch{}assert.equal(alive,false,'OWNED_WORKER_NOT_STOPPED');
 const report={status:'PASS',botChat,workspaceProvision,userData,home,identityOrigin:origin,nativeSessionProof:sessionProof??null,version:info.version,realPackagedMain:true,realBundledBackend:true,accountAPI:'controlled fixture',updateAPI:'controlled same-version manifest',settingsRight:true,checkUpdates:true,logo:true,dingtalk:'1.0.68 / unauthenticated',noEnterpriseConnectionBoot:true,workerStopped:true,modelCalls:0,realEmployeeTouched:false,service3080Touched:false,installerExecuted:false,screenshot,exit:0};
 fs.writeFileSync(path.join(out,'PACKAGE.json'),JSON.stringify(report,null,2)+'\n');console.log('PACKAGE version='+version+' login=PASS bundled_backend=PASS settings_right=PASS check_update=PASS dingtalk=PASS worker_stop=PASS model_calls=0 exit=0');
}catch(error){if(application){const page=await application.firstWindow();console.error('PACKAGE_DIAGNOSTIC '+(await page.locator('body').innerText()).slice(0,2000));await page.screenshot({path:path.join(out,'package-failure.png')}).catch(()=>{});if(home){for(const name of ['server.err.log','server.out.log']){const file=path.join(home,'logs',name);if(fs.existsSync(file))console.error(fs.readFileSync(file,'utf8').slice(-5000));}}}throw error;}
finally{if(application)await application.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
