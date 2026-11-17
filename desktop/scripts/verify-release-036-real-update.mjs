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
const env={...process.env,NAUMI_USER_DATA:userData,NAUMI_IDENTITY_ORIGIN:origin,NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1'};
for(const name of ['NAUMI_ROOT','NAUMI_DSH_HOME','NAUMI_NODE','NAUMI_HOST_URL','NAUMI_ENTERPRISE_ORIGIN','ELECTRON_RUN_AS_NODE','NAUMI_UPDATE_DEV','NAUMI_UPDATE_URL','GH_TOKEN','GITHUB_TOKEN'])delete env[name];
env.LOCALAPPDATA=path.join(userData,'updater-local');fs.mkdirSync(env.LOCALAPPDATA,{recursive:true});
env.PATH=process.env.SystemRoot+'\\System32;'+process.env.SystemRoot;
try{
 application=await _electron.launch({executablePath:exe,args:[],env,timeout:90000});const page=await application.firstWindow();
 await page.waitForURL(url=>url.href.endsWith('/identity.html')||/^http:\/\/127\.0\.0\.1:/.test(url.href),{timeout:120000});
 if(page.url().endsWith('/identity.html')){await page.locator('#account').waitFor();assert(!(await page.locator('body').innerText()).includes('DESIGN'));assert.equal(await page.locator('.mg-brand-lockup').getAttribute('aria-label'),'Naumi');await page.locator('#account').fill('release@example.test');await page.locator('#password').fill('fixture-only-password');await page.locator('#submit').click();}

 await Promise.race([page.waitForURL(/^http:\/\/127\.0\.0\.1:/,{timeout:120000}),page.waitForURL('**/startup.html?error=**',{timeout:120000}).then(()=>{throw Error('PACKAGE_BOOT '+new URL(page.url()).searchParams.get('error'));})]);
 await page.locator('.nup-trigger').waitFor({timeout:60000});
 const info=await application.evaluate(({app})=>{const t=globalThis.__naumiTest;return{version:app.getVersion(),packaged:app.isPackaged,home:t.settings.home,backend:t.settings.root,owned:t.backend.owned,enterprise:!!t.enterprise};});
 assert.equal(info.version,version);assert.equal(info.packaged,true);assert.equal(info.owned,true);assert.equal(info.enterprise,false);assert(info.backend.includes('resources'));assert(info.home.startsWith(userData+path.sep));home=info.home;
 assert(!fs.existsSync(path.join(home,'desktop-enterprise.json')));workerPid=JSON.parse(fs.readFileSync(path.join(home,'desktop-backend.json'))).pid;
 const placement=await page.evaluate(()=>{const u=document.querySelector('.nup-trigger'),f=u.closest('[class*="_footArea"]'),s=f.querySelector('[class*="_settingsArea"]');const a=u.getBoundingClientRect(),b=s.getBoundingClientRect();return{right:a.left>=b.right-1,row:Math.abs(a.top-b.top)<10};});assert(placement.right&&placement.row,JSON.stringify(placement));
 await application.evaluate(({dialog})=>{globalThis.__qaUpdatePrompts=[];dialog.showMessageBox=async(...args)=>{const options=args.at(-1),index=options?.buttons?.findIndex(v=>/稍后|later/i.test(v));if(index===undefined||index<0)throw Error('UNEXPECTED_QA_DIALOG');globalThis.__qaUpdatePrompts.push({title:options.title,buttons:options.buttons});return{response:index,checkboxChecked:false};};});
 await page.locator('.nup-trigger').click();let updates;const updateStates=[];
 for(;;){updates=await page.evaluate(()=>window.naumiDesktop.updateState());if(updateStates.at(-1)?.status!==updates.status)updateStates.push({at:Date.now(),status:updates.status,version:updates.version,error:updates.error});fs.writeFileSync(path.join(out,'UPDATE_PROGRESS.json'),JSON.stringify({version,current:updates,states:updateStates},null,2));if(updates.error)throw Error('REAL_UPDATE_ERROR '+updates.error);if(updates.status==='ready'){assert.equal(updates.version,'0.3.7');break;}if(updates.status==='idle'&&updates.lastChecked)throw Error('REAL_UPDATE_NOT_OFFERED');await new Promise(r=>setTimeout(r,1000));}
 assert.equal(updates.currentVersion,'0.3.6');assert.equal(updates.enabled,true);assert(!requests.some(r=>r.path==='/latest.yml'),'CONTROLLED_UPDATE_FEED_MUST_NOT_BE_USED');const cacheFiles=fs.readdirSync(env.LOCALAPPDATA,{recursive:true}).filter(p=>p.endsWith('.exe')).map(p=>path.join(env.LOCALAPPDATA,p));assert.equal(cacheFiles.length,1);const downloaded=fs.readFileSync(cacheFiles[0]),{createHash}=await import('node:crypto'),downloadSHA=createHash('sha256').update(downloaded).digest('hex');assert.equal(downloadSHA,'1a0c96e99b35f31f722bf3c6450bfe4fa7ba8cbdff8acfe3505323d8a8b83e43');
 // Hidden packaged windows can stall CDP screenshots despite responsive DOM/IPC.
 // Native capture is supporting evidence only, never a substitute for assertions.
 let screenshot='not-captured',captureTimer;
 try{const bytes=await Promise.race([application.evaluate(async({BrowserWindow})=>Array.from((await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG())),new Promise((_r,reject)=>{captureTimer=setTimeout(()=>reject(Error('NATIVE_CAPTURE_TIMEOUT')),5000);})]);if(bytes.length>200){fs.writeFileSync(path.join(out,'packaged-update.png'),Buffer.from(bytes));screenshot='native-capture';}}catch{}finally{clearTimeout(captureTimer);}
 const cli=spawnSync(path.join(info.backend,'node.exe'),[path.join(info.backend,'runtime/dingtalk-cli.cjs'),'auth','status','--readonly','--format','json'],{cwd:home,env:{SystemRoot:process.env.SystemRoot,PATH:env.PATH,DSH_HOME:home},encoding:'utf8',timeout:15000});assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).authenticated,false);
 const manifest=JSON.parse(fs.readFileSync(path.join(info.backend,'runtime-manifest.json')));assert.equal(manifest.version,version);assert.equal(manifest.dingtalk.version,'1.0.68');assert.equal(manifest.personalCredentials,false);assert.equal(manifest.browserProfiles,false);
 await application.close();application=null;await new Promise(r=>setTimeout(r,150));let alive=false;try{process.kill(workerPid,0);alive=true;}catch{}assert.equal(alive,false,'OWNED_WORKER_NOT_STOPPED');
 const report={status:'PASS',oldPublicVersion:'0.3.6',offeredVersion:'0.3.7',realDefaultUpdateFeed:true,downloadedAndVerified:true,downloadSHA256:downloadSHA,downloadBytes:downloaded.length,isolatedUpdaterCache:env.LOCALAPPDATA,states:updateStates,autoInstallExecuted:false,notificationChoice:'later in this QA process only',userData,home,identityOrigin:origin,version:info.version,realPackagedMain:true,realBundledBackend:true,accountAPI:'controlled fixture',updateAPI:'real unchanged default mirror/GitHub feed',settingsRight:true,checkUpdates:true,logo:true,dingtalk:'1.0.68 / unauthenticated',noEnterpriseConnectionBoot:true,workerStopped:true,modelCalls:0,realEmployeeTouched:false,service3080Touched:false,installerExecuted:false,screenshot,exit:0};
 fs.writeFileSync(path.join(out,'REAL_UPDATE.json'),JSON.stringify(report,null,2)+'\n');console.log('REAL_UPDATE old='+version+' new=0.3.7 status=READY bytes='+downloaded.length+' sha256='+downloadSHA+' default_feed=1 '+' login=PASS bundled_backend=PASS settings_right=PASS check_update=PASS dingtalk=PASS worker_stop=PASS model_calls=0 exit=0');
}catch(error){if(application){const page=await application.firstWindow();console.error('PACKAGE_DIAGNOSTIC '+(await page.locator('body').innerText()).slice(0,2000));await page.screenshot({path:path.join(out,'package-failure.png')}).catch(()=>{});if(home){for(const name of ['server.err.log','server.out.log']){const file=path.join(home,'logs',name);if(fs.existsSync(file))console.error(fs.readFileSync(file,'utf8').slice(-5000));}}}throw error;}
finally{if(application)await application.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
