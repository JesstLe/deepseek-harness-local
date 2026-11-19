// Real isolated Chromium + the shipped MV3 worker. Never opens a user's profile.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('../desktop/node_modules/playwright');
const {BrowserConnections}=require('../desktop/app/browser-connect.cjs');
const root=path.resolve(process.argv[2]||'.'),out=path.resolve('output/browser-connect');fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-browser-live-')),extension=path.join(temp,'extension'),profile=path.join(temp,'chromium');
fs.cpSync(path.join(root,'desktop/app/browser-extension'),extension,{recursive:true});
// Test-only entry invokes the exact shipped popup handler without showing an actual action popup in headless Chromium.
fs.appendFileSync(path.join(extension,'worker.js'),'\nglobalThis.__naumiTestConnect=connectCurrent;\n');
let requests=0;
const site=http.createServer((req,res)=>{
 if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const signed=String(req.headers.cookie).includes('fixture-session=already-signed-in');
 if(req.url==='/establish'){res.setHeader('Set-Cookie','fixture-session=already-signed-in; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600');res.writeHead(303,{Location:'/app'});res.end();return;}
 if(req.url==='/submit'){requests++;res.end('submitted');return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><head><title>${signed?'Already signed in':'Sign in'}</title></head><body><h1>${signed?'Existing authenticated workspace':'Login'}</h1><button id="change" onclick="document.querySelector('h1').textContent='Changed in original tab'">Change</button><form action="/submit"><label>User<input id="username" name="username" autocomplete="username"></label><label>Password<input id="password" type="password" autocomplete="current-password" name="password"></label><button>Submit</button></form></body></html>`);
});
await new Promise(r=>site.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${site.address().port}`;
const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(x=>x^0x43),decryptString:b=>Buffer.from(b).map(x=>x^0x43).toString()};
let checks=0,context,router,worker;
async function launch(){
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:20000});
}
async function connect(page,session){
 await page.bringToFront();const pair=router.external.pair(session);
 const result=await worker.evaluate(pair=>globalThis.__naumiTestConnect({pair}),pair);
 assert.equal(result.connected,true);checks++;
}
try{
 router=await new BrowserConnections({root:path.join(temp,'naumi'),hostURL:'http://127.0.0.1:3080',safeStorage,protectPath:()=>{}}).start({perform:async(_s,input)=>input.action==='tabs'?{tabs:[]}:(()=>{throw Error('NATIVE_FALLBACK_NOT_ALLOWED');})()});
 await launch();const page=context.pages()[0]||await context.newPage();await page.goto(origin+'/establish');
 await page.evaluate(()=>localStorage.setItem('fixture-workspace','kept-in-original-browser'));const initialPages=context.pages().length;
 await connect(page,'session-a');assert.equal(context.pages().length,initialPages);checks++;
 const state=await router.perform('session-a',{action:'state'});assert.equal(state.title,'Already signed in');checks++;
 assert.equal(await page.evaluate(()=>localStorage.getItem('fixture-workspace')),'kept-in-original-browser');checks++;
 assert.equal((await router.perform('session-a',{action:'tabs'})).tabs.length,1);assert.equal((await router.perform('session-b',{action:'tabs'})).tabs.length,0);checks++;
 const snap=await router.perform('session-a',{action:'snapshot'});assert(snap.snapshot.elements.some(x=>x.selector==='#change'));checks++;
 await router.perform('session-a',{action:'click',selector:'#change'});assert.equal(await page.locator('h1').textContent(),'Changed in original tab');checks++;
 await router.perform('session-a',{action:'fill',selector:'#username',text:'ordinary text'});assert.equal(await page.locator('#username').inputValue(),'ordinary text');checks++;
 const account=router.vault.save({origin,username:'fixture-user',password:'fixture-secret-not-logged',allowAgent:true});
 const accounts=await router.perform('session-a',{action:'accounts'});assert.equal(accounts.accounts[0].id,account.id);assert(!JSON.stringify(accounts).includes('fixture-secret'));checks++;
 const login=await router.perform('session-a',{action:'login',accountId:account.id,usernameSelector:'#username',passwordSelector:'#password'});
 assert.equal(login.filled,true);assert.equal(login.submitted,false);assert(!JSON.stringify(login).includes('fixture-secret'));assert.equal(await page.locator('#username').inputValue(),'fixture-user');assert.equal(await page.locator('#password').inputValue(),'fixture-secret-not-logged');assert.equal(requests,0);checks++;
 assert.equal(await page.evaluate(()=>document.cookie.includes('fixture-session')),false);checks++; // HttpOnly stays HttpOnly.
 router.disconnect('session-a');await assert.rejects(router.external.perform('session-a',{action:'click',selector:'#change'}),/DISCONNECTED/);assert.equal(await page.title(),'Already signed in');checks++;
 await context.close();context=null;await launch();const restored=await context.newPage();await restored.goto(origin+'/app');assert.equal(await restored.title(),'Already signed in');assert.equal(await restored.evaluate(()=>localStorage.getItem('fixture-workspace')),'kept-in-original-browser');checks++;
 await connect(restored,'session-after-restart');assert.equal((await router.perform('session-after-restart',{action:'state'})).title,'Already signed in');checks++;
 await restored.goto('about:blank');await assert.rejects(router.perform('session-after-restart',{action:'snapshot'}),/FAILED_NO_REPLAY/);checks++;
 const extensionId=worker.url().split('/')[2];const ui=await context.newPage();await ui.goto(`chrome-extension://${extensionId}/popup.html`);assert.equal(await ui.locator('h1').textContent(),'连接到 Naumi');checks++;
 await router.close();router=null;assert.equal(requests,0);checks++;
 const result={checks,engine:'real Chromium MV3 debugger extension',originalTabReused:true,httpOnlyCookieRetained:true,localStorageRetained:true,browserRestartRetained:true,credentialsFilledLocally:true,passwordReturnedToModel:false,automaticSubmit:0,userProfilesTouched:0,modelCalls:0};
 fs.writeFileSync(path.join(out,'BROWSER_LIVE.json'),JSON.stringify(result,null,2));console.log('BROWSER_CONNECT_LIVE '+JSON.stringify(result));
}finally{await context?.close();await router?.close();await new Promise(r=>site.close(r));assert(temp.startsWith(os.tmpdir()+path.sep));fs.rmSync(temp,{recursive:true,force:true});}
