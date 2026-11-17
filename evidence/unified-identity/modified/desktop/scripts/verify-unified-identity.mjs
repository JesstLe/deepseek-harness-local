// Real Electron + production main/preload/account UI. Only backend/installer I/O
// are fixture adapters; no employee server, 3080, model or credentials are used.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),require=createRequire(import.meta.url),{_electron}=require('playwright');
const evidence=path.join(root,'evidence/unified-identity');fs.mkdirSync(evidence,{recursive:true});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-account-e2e-')),appDir=path.join(dir,'application'),userData=path.join(dir,'employee'),stateFile=path.join(dir,'backend-events.json');
fs.mkdirSync(appDir,{recursive:true});fs.cpSync(path.join(root,'desktop/app'),path.join(appDir,'app'),{recursive:true});fs.writeFileSync(path.join(appDir,'package.json'),JSON.stringify({name:'naumi-identity-fixture',main:'app/main.cjs'}));
let running=false,outage=false,revoked=false;const requests=[];
const server=http.createServer(async(req,res)=>{
 const send=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
 if(req.url.startsWith('/api/auth/')){
  requests.push({path:req.url,method:req.method});if(outage)return send({error:'unavailable'},503);
  if(req.url==='/api/auth/login'){
   let text='';for await(const part of req)text+=part;const input=JSON.parse(text);
   if(input.email==='disabled')return send({error:'disabled'},403);
   if(input.password!=='fixture-only-password')return send({error:'wrong'},401);
   const email=input.email==='bob'?'bob@example.test':'alice@example.test';res.setHeader('set-cookie','nv_user='+email+'; HttpOnly; Path=/; SameSite=Lax');return send({ok:true,user:{email}});
  }
  if(req.url==='/api/auth/logout'){res.setHeader('set-cookie','nv_user=; Max-Age=0; Path=/');return send({ok:true});}
  const email=req.headers.cookie?.match(/nv_user=([^;]+)/)?.[1];return send({user:email&&!revoked?{email,name:email.startsWith('alice')?'Alice':'Bob',role:'admin',credits:123,token:'never-expose'}:null});
 }
 if(req.url==='/api/session/list')return send({result:{ok:true,value:{items:[{running}]}}});
 res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Naumi Fixture Workbench</title><h1>Workbench</h1>');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const backend=`'use strict';const fs=require('fs'),path=require('path'),file=${JSON.stringify(stateFile)};const event=value=>{const list=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];list.push(value);fs.writeFileSync(file,JSON.stringify(list));};module.exports={localSettings:app=>({isolated:true,workspaceId:'default',home:path.join(app.getPath('userData'),'harness'),root:${JSON.stringify(appDir)},url:${JSON.stringify(origin)},identity:{id:'fixture'}}),ensureBackend:async settings=>{event({type:'start',home:settings.home});return {owned:true,launchURL:settings.url};},stopBackend:async value=>{if(value)event({type:'stop'});},maintenanceRequest:async(_s,action)=>{event({type:action});return {};},createQuitGate:({shutdown,onReady,onError})=>{let done=false,flight;return{beforeQuit(e){if(done)return;e.preventDefault();flight??=Promise.resolve().then(shutdown).then(()=>{done=true;onReady();},onError);}};}};`;
fs.writeFileSync(path.join(appDir,'app/backend.cjs'),backend);
fs.writeFileSync(path.join(appDir,'app/installer-state.cjs'),"module.exports={registerProfile(){},assertStartupAllowed(){}};");
const events=()=>fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):[];
const env={...process.env,NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1',NAUMI_USER_DATA:userData,NAUMI_IDENTITY_ORIGIN:origin};delete env.ELECTRON_RUN_AS_NODE;delete env.NAUMI_ROOT;delete env.NAUMI_ENTERPRISE_ORIGIN;delete env.NAUMI_UPDATE_DEV;
let application,page;
async function launch(){application=await _electron.launch({executablePath:require('electron'),args:[appDir],env,timeout:30000});page=await application.firstWindow();await page.waitForURL('**/identity.html');await page.locator('#account').waitFor();}
async function login(account,password='fixture-only-password'){await page.locator('#account').fill(account);await page.locator('#password').fill(password);await page.locator('#submit').click();}
const result={layer:'real Electron; production identity/main/UI; controlled Canvas API contract; fixture backend and installer adapters',realAccountLogin:false,service3080Touched:false,modelCalls:0,referenceStyle:'3112/login',designLabelRemoved:true,smokeShaderReady:true,passwordToggle:true};
try{
 await launch();assert.equal(events().length,0,'BACKEND_STARTED_BEFORE_LOGIN');
 await page.setViewportSize({width:1280,height:800});await page.waitForFunction(()=>document.querySelector('.auth-smoke-canvas').dataset.smoke==='ready');
 assert(!(await page.locator('body').innerText()).includes('DESIGN'));assert.equal(await page.locator('.mg-brand-lockup').getAttribute('aria-label'),'Naumi');
 await page.locator('#password').fill('fixture-preview');await page.locator('#show-password').click();assert.equal(await page.locator('#password').getAttribute('type'),'text');await page.locator('#show-password').click();assert.equal(await page.locator('#password').getAttribute('type'),'password');await page.locator('#password').fill('');
 await page.screenshot({path:path.join(evidence,'login-native.png'),animations:'disabled'});
 await login('alice','wrong');await page.locator('#error').filter({hasText:'账号或密码不正确'}).waitFor();assert.equal(await page.locator('#password').inputValue(),'');assert.equal(events().length,0);
 await login('disabled');await page.locator('#error').filter({hasText:'账号暂不可用'}).waitFor();assert.equal(events().length,0);
 await login('alice');await page.waitForURL(origin+'/**');await page.locator('h1').filter({hasText:'Workbench'}).waitFor();
 assert.equal(events().filter(e=>e.type==='start').length,1);const homeA=events().find(e=>e.type==='start').home;assert(homeA.startsWith(path.join(userData,'identity-profiles')+path.sep));fs.writeFileSync(path.join(path.dirname(homeA),'memory'),'Alice retained');
 await page.evaluate(()=>localStorage.setItem('account-only','alice'));await page.evaluate(()=>{void window.naumiDesktop.openIdentity();});await page.waitForURL('**/identity.html');await page.locator('#name').filter({hasText:'Alice'}).waitFor();
 const identity=await page.evaluate(()=>window.naumiDesktop.identityState());assert.equal(identity.user.email,'alice@example.test');assert(!('role'in identity.user));assert(!JSON.stringify(identity).includes('never-expose'));
 running=true;await page.locator('#logout').click();await page.locator('#error').filter({hasText:'请先结束当前运行任务'}).waitFor();assert.equal(events().filter(e=>e.type==='stop').length,0);
 running=false;await page.locator('#logout').click();await page.locator('#login').waitFor({state:'visible'});assert.equal(events().filter(e=>e.type==='quiesce').length,1);assert.equal(events().filter(e=>e.type==='stop').length,1);
 assert.equal(fs.readFileSync(path.join(path.dirname(homeA),'memory'),'utf8'),'Alice retained');
 await login('bob');await page.waitForURL(origin+'/**');assert.equal(await page.evaluate(()=>localStorage.getItem('account-only')),null);
 const homeB=events().filter(e=>e.type==='start').at(-1).home;assert.notEqual(homeA,homeB);assert(!fs.existsSync(path.join(path.dirname(homeB),'memory')));
 const guestAccount=await application.evaluate(()=>globalThis.__naumiTest.guests.account);assert(guestAccount.includes(path.basename(path.dirname(homeB))));
 await application.close();application=null;
 outage=true;await launch();await page.locator('#error').filter({hasText:'账号服务暂未连接'}).waitFor();assert.equal(events().filter(e=>e.type==='start').length,2,'OFFLINE_COLD_START_GRANTED');
 await application.close();application=null;outage=false;revoked=true;await launch();await page.locator('#error').filter({hasText:'登录状态已失效'}).waitFor();assert.equal(events().filter(e=>e.type==='start').length,2);
 await page.setViewportSize({width:640,height:800});await page.screenshot({path:path.join(evidence,'login-narrow.png')});
 Object.assign(result,{status:'PASS',wrongPassword:true,disabledAccount:true,passwordCleared:true,serverCookieConfirmed:true,accountAIsolation:true,accountBIsolation:true,primaryStorageCleared:true,runningLogoutRejected:true,idleLogoutQuiesced:true,localMemoryRetained:true,offlineColdStartRejected:true,revokedColdSessionRejected:true,backendStarts:2,requestCount:requests.length,exit:0});
 fs.writeFileSync(path.join(evidence,'ELECTRON_IDENTITY.json'),JSON.stringify(result,null,2)+'\n');
 console.log('ELECTRON_IDENTITY login=PASS cookie=PASS account_isolation=PASS running_logout=REJECTED idle_logout=QUIESCED offline_cold=REJECTED revoked=REJECTED model_calls=0 exit=0');
}finally{if(application)await application.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
