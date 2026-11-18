// Installed native preload/main + the actual linked backend. Own auth/profile only;
// read the workbench, never submit messages, edit tasks, import history or install updates.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{_electron}=require('playwright');
const [root,exe,out,mode='modified']=process.argv.slice(2);assert(root&&exe&&out);fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-linked-update-')),alias=path.join(temp,'root'),home=path.join(temp,'harness'),userData=path.join(temp,'profile');
for(const d of ['config','logs','plugins/naumi-enterprise/assets'])fs.mkdirSync(path.join(alias,d),{recursive:true});
const config=JSON.parse(fs.readFileSync(path.join(root,'config/local.json')));assert.equal(config.port,3080);
fs.writeFileSync(path.join(alias,'config/local.json'),JSON.stringify({...config,home}));
fs.copyFileSync(path.join(root,'plugins/naumi-enterprise/assets/symbol.svg'),path.join(alias,'plugins/naumi-enterprise/assets/symbol.svg'));
for(const f of ['server.out.log','server.err.log'])fs.copyFileSync(path.join(root,'logs',f),path.join(alias,'logs',f));
const server=http.createServer(async(req,res)=>{const send=v=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(v));};
 if(req.url==='/api/auth/session')return send({user:req.headers.cookie?.includes('nv_user=repair')?{email:'repair@example.test',name:'Update QA'}:null});
 if(req.url==='/api/auth/login'){for await(const _ of req){}res.setHeader('set-cookie','nv_user=repair; HttpOnly; Path=/; SameSite=Lax');return send({ok:true,user:{email:'repair@example.test'}});}
 if(req.url.split('?')[0]==='/latest.yml'){res.writeHead(200,{'content-type':'text/yaml'});return res.end('version: 0.3.7\nfiles:\n  - url: Naumi-Setup-0.3.7-x64.exe\n    sha512: '+Buffer.alloc(64).toString('base64')+'\npath: Naumi-Setup-0.3.7-x64.exe\nsha512: '+Buffer.alloc(64).toString('base64')+'\n');}
 res.writeHead(404).end();
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const env={...process.env,NAUMI_ROOT:alias,NAUMI_USER_DATA:userData,NAUMI_IDENTITY_ORIGIN:origin,NAUMI_UPDATE_URL:origin,NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1'};
for(const key of ['ELECTRON_RUN_AS_NODE','NAUMI_DSH_HOME','NAUMI_HOST_URL','NAUMI_ENTERPRISE_ORIGIN'])delete env[key];
let app;
try{
 app=await _electron.launch({executablePath:exe,env,timeout:90000});const page=await app.firstWindow();page.setDefaultTimeout(20000);console.log('QA launched');
 await page.waitForURL('**/identity.html');await page.locator('#account').fill('repair@example.test');await page.locator('#password').fill('fixture-only');if(await page.locator('#legacy-claim').isVisible())await page.locator('#legacy-claim').check();await page.locator('#submit').click();console.log('QA fixture_login_submitted');
 await page.waitForURL('http://127.0.0.1:3080/**',{timeout:90000});await page.getByRole('button',{name:'设置',exact:true}).waitFor({timeout:45000});
 const info=await app.evaluate(({app})=>({version:app.getVersion(),owned:globalThis.__naumiTest.backend.owned,isolated:globalThis.__naumiTest.settings.isolated}));assert.equal(info.version,'0.3.7');assert.equal(info.owned,false);assert.equal(info.isolated,false);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'通用设置',exact:true}).click();
 const versionLabel=page.getByText(/^Naumi 0\.3\.\d+$/).first();await versionLabel.waitFor();const footerVersion=await versionLabel.innerText(),updates=await page.locator('.nup-trigger').count();await page.keyboard.press('Escape');
 if(mode==='baseline'){assert.equal(footerVersion,'Naumi 0.3.2');assert.equal(updates,0);}
 else{
  await page.locator('.nup-trigger').waitFor();assert.equal(footerVersion,'Naumi 0.3.7');
  const geometry=await page.evaluate(()=>{const se=document.querySelector('[aria-label="设置"]'),ue=document.querySelector('.nup-trigger'),s=se.getBoundingClientRect(),u=ue.getBoundingClientRect(),f=ue.closest('[class*="_footArea"]');return {sameRow:Math.abs((s.top+s.height/2)-(u.top+u.height/2))<2,right:u.left>=s.right-1,visible:u.width>0&&u.height>0,settings:{x:s.x,y:s.y,width:s.width,height:s.height},updates:{x:u.x,y:u.y,width:u.width,height:u.height},wide:ue.dataset.wide,footerDisplay:f&&getComputedStyle(f).display,cssLoaded:[...document.styleSheets].some(s=>s.href?.includes('desktop-updates.css'))};});fs.writeFileSync(path.join(out,'GEOMETRY.json'),JSON.stringify(geometry,null,2));assert(geometry.sameRow&&geometry.right&&geometry.visible,JSON.stringify(geometry));
  await page.locator('.nup-trigger').click();await page.locator('.nup-panel').waitFor();await page.waitForFunction(()=>document.querySelector('.nup-status')?.textContent==='已是最新版本',{},{timeout:30000});
  assert((await page.locator('.nup-version').innerText()).includes('0.3.7'));await page.keyboard.press('Escape');assert.equal(await page.locator('.nup-panel').count(),0);
 }
 const report={status:'PASS',mode,installedVersion:info.version,footerVersion,updateEntry:mode==='modified',nativeIPC:true,linkedExistingBackend:true,existingBackendOwned:false,sameRowSettingsRight:mode==='modified',checkUpdates:mode==='modified'?'PASS':'MISSING_REPRODUCED',realAccountPasswordRead:false,userProfileTouched:false,modelCalls:0};
 fs.writeFileSync(path.join(out,mode.toUpperCase()+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(mode.toUpperCase()+' installed=0.3.7 footer='+footerVersion.replace('Naumi ','')+' update_entry='+Number(mode==='modified')+' native_ipc=1 linked_backend=1 model_calls=0 exit=0');
}finally{if(app)await app.close();await new Promise(r=>server.close(r));}
