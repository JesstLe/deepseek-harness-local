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
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const env={...process.env,NAUMI_USER_DATA:userData,NAUMI_IDENTITY_ORIGIN:origin,NAUMI_UPDATE_URL:origin,NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1'};
for(const name of ['NAUMI_ROOT','NAUMI_DSH_HOME','NAUMI_NODE','NAUMI_HOST_URL','NAUMI_ENTERPRISE_ORIGIN','ELECTRON_RUN_AS_NODE','NAUMI_UPDATE_DEV'])delete env[name];
env.PATH=process.env.SystemRoot+'\\System32;'+process.env.SystemRoot;
try{
 application=await _electron.launch({executablePath:exe,args:[],env,timeout:90000});const page=await application.firstWindow();
 await page.waitForURL('**/identity.html',{timeout:60000});await page.locator('#account').waitFor();assert(!(await page.locator('body').innerText()).includes('DESIGN'));assert.equal(await page.locator('.mg-brand-lockup').getAttribute('aria-label'),'Naumi');
 await page.locator('#account').fill('release@example.test');await page.locator('#password').fill('fixture-only-password');await page.locator('#submit').click();
 await Promise.race([page.waitForURL(/^http:\/\/127\.0\.0\.1:/,{timeout:120000}),page.waitForURL('**/startup.html?error=**',{timeout:120000}).then(()=>{throw Error('PACKAGE_BOOT '+new URL(page.url()).searchParams.get('error'));})]);
 await page.locator('.nup-trigger').waitFor({timeout:60000});
 const info=await application.evaluate(({app})=>{const t=globalThis.__naumiTest;return{version:app.getVersion(),packaged:app.isPackaged,home:t.settings.home,backend:t.settings.root,owned:t.backend.owned,enterprise:!!t.enterprise};});
 assert.equal(info.version,version);assert.equal(info.packaged,true);assert.equal(info.owned,true);assert.equal(info.enterprise,false);assert(info.backend.includes('resources'));assert(info.home.startsWith(userData+path.sep));home=info.home;
 assert(!fs.existsSync(path.join(home,'desktop-enterprise.json')));workerPid=JSON.parse(fs.readFileSync(path.join(home,'desktop-backend.json'))).pid;
 const placement=await page.evaluate(()=>{const u=document.querySelector('.nup-trigger'),f=u.closest('[class*="_footArea"]'),s=f.querySelector('[class*="_settingsArea"]');const a=u.getBoundingClientRect(),b=s.getBoundingClientRect();return{right:a.left>=b.right-1,row:Math.abs(a.top-b.top)<10};});assert(placement.right&&placement.row,JSON.stringify(placement));
 await page.locator('.nup-trigger').click();await page.locator('.nup-status').filter({hasText:'已是最新版本'}).waitFor({timeout:30000});assert((await page.locator('.nup-version').innerText()).includes(version));assert(requests.some(r=>r.path==='/latest.yml'));assert(!requests.some(r=>r.path.endsWith('.exe')));
 const updates=await page.evaluate(()=>window.naumiDesktop.updateState());assert.equal(updates.enabled,true);assert.equal(updates.status,'idle');assert.equal(updates.currentVersion,version);assert(updates.lastChecked);
 // Hidden packaged windows can stall CDP screenshots despite responsive DOM/IPC.
 // Native capture is supporting evidence only, never a substitute for assertions.
 let screenshot='not-captured',captureTimer;
 try{const bytes=await Promise.race([application.evaluate(async({BrowserWindow})=>Array.from((await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG())),new Promise((_r,reject)=>{captureTimer=setTimeout(()=>reject(Error('NATIVE_CAPTURE_TIMEOUT')),5000);})]);if(bytes.length>200){fs.writeFileSync(path.join(out,'packaged-update.png'),Buffer.from(bytes));screenshot='native-capture';}}catch{}finally{clearTimeout(captureTimer);}
 const cli=spawnSync(path.join(info.backend,'node.exe'),[path.join(info.backend,'runtime/dingtalk-cli.cjs'),'auth','status','--readonly','--format','json'],{cwd:home,env:{SystemRoot:process.env.SystemRoot,PATH:env.PATH,DSH_HOME:home},encoding:'utf8',timeout:15000});assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).authenticated,false);
 const manifest=JSON.parse(fs.readFileSync(path.join(info.backend,'runtime-manifest.json')));assert.equal(manifest.version,version);assert.equal(manifest.dingtalk.version,'1.0.68');assert.equal(manifest.personalCredentials,false);assert.equal(manifest.browserProfiles,false);
 await application.close();application=null;await new Promise(r=>setTimeout(r,150));let alive=false;try{process.kill(workerPid,0);alive=true;}catch{}assert.equal(alive,false,'OWNED_WORKER_NOT_STOPPED');
 const report={status:'PASS',userData,home,version:info.version,realPackagedMain:true,realBundledBackend:true,accountAPI:'controlled fixture',updateAPI:'controlled same-version manifest',settingsRight:true,checkUpdates:true,logo:true,dingtalk:'1.0.68 / unauthenticated',noEnterpriseConnectionBoot:true,workerStopped:true,modelCalls:0,realEmployeeTouched:false,service3080Touched:false,installerExecuted:false,screenshot,exit:0};
 fs.writeFileSync(path.join(out,'PACKAGE.json'),JSON.stringify(report,null,2)+'\n');console.log('PACKAGE version='+version+' login=PASS bundled_backend=PASS settings_right=PASS check_update=PASS dingtalk=PASS worker_stop=PASS model_calls=0 exit=0');
}catch(error){if(application){const page=await application.firstWindow();console.error('PACKAGE_DIAGNOSTIC '+(await page.locator('body').innerText()).slice(0,2000));await page.screenshot({path:path.join(out,'package-failure.png')}).catch(()=>{});if(home){for(const name of ['server.err.log','server.out.log']){const file=path.join(home,'logs',name);if(fs.existsSync(file))console.error(fs.readFileSync(file,'utf8').slice(-5000));}}}throw error;}
finally{if(application)await application.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
