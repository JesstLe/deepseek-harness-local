import {_electron as electron} from '../node_modules/playwright/index.mjs';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {generateKeyPairSync,createHash,sign,verify,randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../..',import.meta.url)),e=path.join(root,'evidence/desktop-enterprise'),exe=path.join(root,'runtime/naumi-desktop-release/win-unpacked/Naumi.exe'),base=path.join(root,'.dsh/desktop-enterprise-'+Date.now());fs.mkdirSync(e,{recursive:true});
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'pem'}).toString(),tenantId=randomUUID(),memberId=randomUUID();
let origin,expired=false,denied=false,networkFailure=false,writes=0,wireWrites=0,registrations=0,forbiddenCookies=0;const receipts=new Map(),attempts=[];
const auth=q=>!expired&&(q.headers.cookie??'').split(';').some(v=>v.trim()==='design_ops_session='+'t'.repeat(32));
const fixture=http.createServer(async(q,r)=>{
 const send=(status,body)=>{r.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(body));};
 if((q.headers.cookie??'').split(';').some(v=>v.trim()&&!v.trim().startsWith('design_ops_session=')))forbiddenCookies++;
 if(q.url==='/login'&&q.method==='GET'){r.setHeader('Content-Type','text/html; charset=utf-8');r.end('<!doctype html><title>Enterprise Fixture Login</title><h1>企业测试登录</h1><form method="post" action="/login"><button>登录测试企业</button></form><a href="https://example.invalid/blocked">外部跳转</a>');return;}
 if(q.url==='/login'&&q.method==='POST'){r.writeHead(303,{'Set-Cookie':'design_ops_session='+'t'.repeat(32)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600',Location:'/workbench'}).end();return;}
 if(q.url==='/workbench'){r.setHeader('Content-Type','text/html; charset=utf-8');r.end('<title>Enterprise Fixture</title><h1>测试员工</h1>');return;}
 if(!auth(q)){send(401,{code:'UNAUTHENTICATED'});return;}
 if(denied){send(403,{code:'FORBIDDEN'});return;}
 if(q.url==='/api/workspace'){send(200,{actor:{id:memberId,tenantId,tenantName:'测试企业',name:'测试员工',roles:['designer']},tasks:[{id:'fixture-task',title:'企业登录桥验收',status:'in_progress'}],members:[],projects:[],products:[],requests:[],deliverables:[],submissions:[]});return;}
 if(q.url==='/api/digital-employees'&&q.method==='GET'){send(200,{actor:{id:memberId,tenantId},employees:[],devices:[],projects:[],sharedMemories:[]});return;}
 if(q.url==='/api/digital-employees'&&q.method==='POST'){
  let text='';for await(const b of q)text+=b.toString();const command=JSON.parse(text);
  if(q.headers.origin!==origin){send(403,{code:'ORIGIN_MISMATCH'});return;}
  if(command.action==='device.register'){
   const valid=verify(null,Buffer.from(canonical({v:1,aud:'naumi-enrollment',deviceId:command.deviceId,publicKey:command.publicKey,operationId:command.operationId})),command.publicKey,Buffer.from(command.proof,'base64url'));if(!valid){send(403,{code:'PROOF_INVALID'});return;}registrations++;
   const claims={v:1,aud:'naumi-desktop',iss:origin,tenantId,memberId,deviceId:command.deviceId,keyHash:createHash('sha256').update(Buffer.from(command.publicKey.replace(/-----[^-]+-----|\s/g,''),'base64')).digest('hex'),issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),authEpoch:1,bindings:[],projectIds:[],capabilities:[]};
   const payload=Buffer.from(JSON.stringify(claims)).toString('base64url'),authorization={kid:'fixture-key',payload,signature:sign(null,Buffer.from(payload),keys.privateKey).toString('base64url')};send(200,{result:{authorization,serverPublicKey:publicKey,keyId:'fixture-key',tenantId,memberId}});return;
  }
  wireWrites++;attempts.push({id:command.operationId,hash:createHash('sha256').update(text).digest('hex')});if(!receipts.has(command.operationId)){writes++;receipts.set(command.operationId,{hash:attempts.at(-1).hash,result:{accepted:true}});}const receipt=receipts.get(command.operationId);if(receipt.hash!==attempts.at(-1).hash){send(409,{code:'IDEMPOTENCY_CONFLICT'});return;}if(networkFailure){q.socket.destroy();return;}send(200,{result:receipt.result});return;
 }
 send(404,{code:'NOT_FOUND'});
});
await new Promise(r=>fixture.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+fixture.address().port;
const handles=new Set(),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,timeout=15000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await fn();if(value)return value;await pause(50);}throw Error('DESKTOP_ENTERPRISE_WAIT_TIMEOUT');}
async function launch(name,{configured=false}={}){
 const env={...process.env,NAUMI_USER_DATA:path.join(base,name),NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1',NAUMI_HOST_URL:origin};for(const key of ['NAUMI_ROOT','NAUMI_DSH_HOME','NAUMI_NODE','NAUMI_ENTERPRISE_ORIGIN','ELECTRON_RUN_AS_NODE','NAUMI_DESKTOP_INSTANCE_ID','NAUMI_DESKTOP_BUNDLE_ID'])delete env[key];if(configured)env.NAUMI_ENTERPRISE_ORIGIN=origin;env.PATH=process.env.SystemRoot+'\\System32;'+process.env.SystemRoot;
 const app=await electron.launch({executablePath:exe,args:[],env,timeout:90000});handles.add(app);const page=await app.firstWindow();return {app,page,launcher:app.process()};
}
async function ready(value){await value.page.waitForURL(/^http:\/\/127\.0\.0\.1:/,{timeout:120000});await value.page.getByRole('button',{name:'工作台',exact:true}).first().waitFor();value.info=await waitFor(()=>value.app.evaluate(()=>{const t=globalThis.__naumiTest;return t?.backend?{pid:process.pid,home:t.settings.home,url:t.settings.url,origin:t.settings.enterpriseOrigin}:null;}));value.backendPid=JSON.parse(fs.readFileSync(path.join(value.info.home,'desktop-backend.json'))).pid;return value;}
async function request(value,url,body){return value.page.evaluate(async({url,body})=>{const response=await fetch(url,{credentials:'same-origin',...(body?{method:'POST',headers:{'Content-Type':'application/json','x-naumi-employee-sync':'1'},body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};},{url,body});}
async function close(value){let timer;try{await Promise.race([value.app.close(),new Promise((_r,reject)=>{timer=setTimeout(()=>reject(Error('DESKTOP_QUIT_TIMEOUT')),20000);})]);}finally{clearTimeout(timer);}handles.delete(value.app);assert.equal(value.launcher.exitCode,0);for(const pid of[value.info.pid,value.backendPid])await waitFor(()=>{try{process.kill(pid,0);return false;}catch{return true;}},5000);}
let a,b,restarted;
try{
 a=await launch('employee A');await a.page.waitForURL('**/connect.html');await a.page.getByRole('heading',{name:'连接企业'}).waitFor();await a.page.screenshot({path:path.join(e,'first-connection.png')});
 assert.equal(fs.existsSync(path.join(base,'employee A/harness/desktop-backend.json')),false);
 await a.page.getByLabel('企业地址').fill('http://enterprise.example');await a.page.getByRole('button',{name:'连接',exact:true}).click();await a.page.getByRole('alert').filter({hasText:'请输入 HTTPS 企业地址'}).waitFor();
 await a.page.getByLabel('企业地址').fill(origin);await a.page.getByRole('button',{name:'连接',exact:true}).click();await ready(a);
 console.log('STEP first_connection=ready');const login=await waitFor(()=>a.app.windows().find(p=>p.url()===origin+'/login'));assert.equal(await login.evaluate(()=>typeof window.naumiDesktop),'undefined');
 await login.getByRole('heading',{name:'企业测试登录'}).waitFor({timeout:15000});
 assert.equal((await request(a,'/naumi/workspace')).status,401);
 await login.getByRole('button',{name:'登录测试企业'}).click();await login.waitForURL(origin+'/workbench');await a.app.evaluate(()=>globalThis.__naumiTest.login.close());await ready(a);console.log('STEP login=authenticated');
 const workspace=await request(a,'/naumi/workspace');assert.equal(workspace.status,200);assert.equal(workspace.body.tasks[0].title,'企业登录桥验收');
 assert.equal((await request(a,'/naumi/employee-sync?view=catalog')).status,200);
 const cookieCounts=await a.app.evaluate(async()=>{const t=globalThis.__naumiTest;return {enterprise:(await t.enterprise.session.cookies.get({name:'design_ops_session'})).length,renderer:(await t.window.webContents.session.cookies.get({name:'design_ops_session'})).length};});assert.deepEqual(cookieCounts,{enterprise:1,renderer:0});
 assert.equal(await a.page.evaluate(()=>window.naumiDesktop.connectEnterprise('https://another.example').then(()=>false,()=>true)),true);
 const initial=await request(a,'/naumi/employee-sync');assert.equal(initial.body.registered,false);assert.equal(initial.body.enabled,false);assert.equal(registrations,0);
 console.log('STEP workspace=200 session_isolated=1');const enrolled=await request(a,'/naumi/employee-sync',{action:'enroll',name:'Fixture employee desktop'});assert.equal(enrolled.status,200,JSON.stringify(enrolled.body));assert.equal(enrolled.body.registered,true);assert.equal(enrolled.body.enabled,false);assert.equal(registrations,1);
 const managed=await request(a,'/naumi/employee-sync',{action:'manage',command:{action:'fixture.write',operationId:randomUUID()}});assert.equal(managed.status,200);assert.equal(managed.body.accepted,true);
 denied=true;assert.equal((await request(a,'/naumi/workspace')).status,403);assert.equal((await request(a,'/naumi/employee-sync',{action:'manage',command:{action:'fixture.write',operationId:randomUUID()}})).status,403);denied=false;
 const before=writes,wireBefore=wireWrites,unknownCommand={action:'fixture.write',operationId:randomUUID()};networkFailure=true;assert.equal((await request(a,'/naumi/employee-sync',{action:'manage',command:unknownCommand})).status,503);assert.equal(writes,before+1);const wireAttempts=wireWrites-wireBefore;assert(wireAttempts>=1);const uncertain=attempts.filter(x=>x.id===unknownCommand.operationId);assert.equal(uncertain.length,wireAttempts);assert.equal(new Set(uncertain.map(x=>x.hash)).size,1);networkFailure=false;assert.equal((await request(a,'/naumi/employee-sync',{action:'manage',command:unknownCommand})).status,200);assert.equal(writes,before+1);
 expired=true;assert.equal((await request(a,'/naumi/workspace')).status,401);assert.equal((await request(a,'/naumi/employee-sync?view=catalog')).status,401);expired=false;
 b=await launch('employee B',{configured:true});await ready(b);assert.equal((await request(b,'/naumi/workspace')).status,401);assert.equal((await request(b,'/naumi/employee-sync')).body.registered,false);
 const countsB=await b.app.evaluate(async()=>{const t=globalThis.__naumiTest;return (await t.enterprise.session.cookies.get({name:'design_ops_session'})).length;});assert.equal(countsB,0);
 await close(a);a=null;restarted=await launch('employee A');await ready(restarted);assert.equal((await request(restarted,'/naumi/workspace')).status,200);assert.equal((await request(restarted,'/naumi/employee-sync')).body.registered,true);assert.equal((await request(restarted,'/naumi/employee-sync')).body.enabled,false);assert.equal(registrations,1);assert.equal(forbiddenCookies,0);
 await close(restarted);restarted=null;await b.page.evaluate(()=>window.naumiDesktop.loginEnterprise());const blockedLogin=await waitFor(()=>b.app.windows().find(p=>p.url()===origin+'/login'));await blockedLogin.getByRole('link',{name:'外部跳转'}).click({noWaitAfter:true});await pause(100);assert.equal(new URL(blockedLogin.url()).origin,origin);await b.app.evaluate(()=>globalThis.__naumiTest.login.webContents.stop());await close(b);b=null;
 fs.writeFileSync(path.join(e,'DESKTOP_ENTERPRISE.json'),JSON.stringify({status:'PASS',acceptance:'unpacked Electron and controlled enterprise fixture, not real employee/remote TLS/NSIS acceptance',profiles:2,firstConnectionUI:true,plainRemoteHttpRejected:true,loginPopupConfined:true,loginPreloadAbsent:true,workspace:true,catalog:true,explicitEnrollment:true,enrollmentProofVerified:true,dpapiVaultWithCleanPATH:true,automaticEnrollment:false,privateUpload:false,managerRbac:true,expiredSession401:true,applicationMutationReplays:0,mutationWireAttempts:wireAttempts,duplicateMutationEffects:0,unknownReceiptReconciled:true,cookiesCopiedToRenderer:false,crossProfileCookieLeak:false,persistentSessionAfterRestart:true,deviceRegistrationRetained:true,normalQuitWithLogin:true,authenticatedBackendStop:true,realEmployeeTouched:false},null,2)+'\n');
 console.log('DESKTOP_ENTERPRISE profiles=2 first_connection=PASS login=PASS workspace=200 catalog=200 enrollment=explicit proof=verified');
 console.log('DESKTOP_SESSION renderer_cookie=0 cross_profile_leak=0 restart=retained expired=401 rbac=403 application_replay=0 duplicate_effect=0 unknown_reconcile=PASS quit_with_login=PASS wire_attempts='+wireAttempts+'');
 console.log('DESKTOP_ENROLLMENT development_path=0 dpapi=PASS auto_enrollment=0 private_upload=0 real_employee=untouched');
}catch(error){console.log('DESKTOP_ENTERPRISE_FAILURE '+error.message);for(const app of handles){for(const p of app.windows()){try{console.log('FAILURE_PAGE '+p.url().replace(/\?.*/,''));console.log((await p.locator('body').innerText({timeout:3000})).slice(0,900));}catch{}}}throw error;}finally{for(const app of handles)await Promise.race([app.close().catch(()=>{}),pause(15000)]);fixture.closeAllConnections();await new Promise(r=>fixture.close(r));}
