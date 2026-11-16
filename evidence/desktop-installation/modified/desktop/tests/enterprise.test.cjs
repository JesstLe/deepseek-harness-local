const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {pathToFileURL}=require('node:url'),{randomUUID}=require('node:crypto');
const {enterpriseOrigin,readConnection,connect,EnterpriseSession,validateRequest,MAX_REQUEST,MAX_RESPONSE}=require('../app/enterprise.cjs');
const {startBridge}=require('../app/tools.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'naumi-enterprise-'));
const remove=p=>{assert(p.startsWith(os.tmpdir()+path.sep));fs.rmSync(p,{recursive:true,force:true});};
const origin='https://enterprise.example';
const input=(method='GET',body)=>({origin,endpoint:'/api/digital-employees',method,...(body===undefined?{}:{body:JSON.stringify(method==='POST'&&body&&!Array.isArray(body)?{operationId:randomUUID(),...body}:body)})});
async function transport(home,options={}){const {DesktopEnterpriseTransport}=await import(pathToFileURL(path.resolve('plugins/naumi-enterprise/desktop-enterprise.js')));return new DesktopEnterpriseTransport({origin,home,standalone:true,...options});}

test('enterprise origins require TLS except loopback and reject credentials, paths, queries and fragments',()=>{
 assert.equal(enterpriseOrigin('https://EXAMPLE.COM/'),'https://example.com');assert.equal(enterpriseOrigin('http://127.0.0.1:3112'),'http://127.0.0.1:3112');
 for(const value of ['http://enterprise.example','https://a/b','https://u:p@a','https://a/?x=1','https://a/#x','file:///a',' https://a',null])assert.throws(()=>enterpriseOrigin(value),/ORIGIN_INVALID/);
});
test('enterprise config persists nonsecret origin and refuses issuer switching without changing bytes',()=>{
 const dir=temp();try{assert.equal(readConnection(dir),null);connect(dir,origin);const before=fs.readFileSync(dir+'/desktop-enterprise.json');assert.deepEqual(connect(dir,origin),{version:1,origin});assert.throws(()=>connect(dir,'https://another.example'),/PROFILE_SWITCH_REQUIRED/);assert.deepEqual(fs.readFileSync(dir+'/desktop-enterprise.json'),before);assert.equal(readConnection(dir).origin,origin);fs.writeFileSync(dir+'/desktop-enterprise.json','{"version":99}');assert.throws(()=>readConnection(dir),/CONFIG_INVALID/);}finally{remove(dir);}
});
test('enterprise session exposes only the two fixed APIs and rejects supplied headers or arbitrary URLs',()=>{
 assert.deepEqual(validateRequest(input(),origin),{endpoint:'/api/digital-employees',method:'GET',body:undefined});
 for(const value of [{...input(),origin:'https://other.example'},{...input(),endpoint:'/api/digital-employees/device'},{...input(),endpoint:'/api/workspace?x=1'},{...input(),endpoint:'https://evil.example/api/workspace'},{...input(),endpoint:'/api/%77orkspace'},{...input(),endpoint:'/api/digital-employees/../workspace'},{...input(),method:'DELETE'},{...input(),headers:{cookie:'not-forwarded'}},{...input(),body:'{}'},{...input('POST',{}),body:'{}'},input('POST',[])])assert.throws(()=>validateRequest(value,origin),/FORBIDDEN|BODY_INVALID|OPERATION_ID_REQUIRED/);
 assert.throws(()=>validateRequest({...input('POST',{}),body:'a'.repeat(MAX_REQUEST+1)},origin),/BODY_INVALID/);
});
test('enterprise session uses Chromium credentials without exporting headers or accepting caller cookies',async()=>{
 let seen;const enterprise=new EnterpriseSession({origin,session:{fetch:async(url,options)=>{seen={url,options};return Response.json({employees:[]},{headers:{'set-cookie':'private; HttpOnly'}});}}});
 const result=await enterprise.perform(input('POST',{action:'employee.create'}));assert.deepEqual(result,{status:200,body:'{"employees":[]}'});assert.equal(seen.url,origin+'/api/digital-employees');assert.equal(seen.options.credentials,'include');assert.equal(seen.options.redirect,'error');assert.equal(seen.options.headers.Origin,origin);assert(!('cookie'in seen.options.headers));assert(!JSON.stringify(result).includes('private'));
});
test('enterprise session preserves expired-login and RBAC status with no automatic replay',async()=>{
 for(const status of [401,403]){let calls=0;const enterprise=new EnterpriseSession({origin,session:{fetch:async()=>{calls++;return Response.json({code:status===401?'UNAUTHENTICATED':'FORBIDDEN'},{status});}}});assert.equal((await enterprise.perform(input())).status,status);assert.equal(calls,1);}
});
test('redirect/network errors never disclose remote details or automatically repeat a mutation',async()=>{
 let calls=0;const enterprise=new EnterpriseSession({origin,session:{fetch:async()=>{calls++;throw Error('private session data');}}});await assert.rejects(enterprise.perform(input('POST',{action:'once'})),/^Error: ENTERPRISE_UNAVAILABLE_NO_REPLAY$/);assert.equal(calls,1);
});
test('enterprise response has bounded bytes and valid JSON content type before publication',async()=>{
 for(const response of [new Response('not json',{headers:{'content-type':'application/json'}}),new Response('<html>login</html>'),Response.json({x:'a'.repeat(MAX_RESPONSE)})]){const enterprise=new EnterpriseSession({origin,session:{fetch:async()=>response}});await assert.rejects(enterprise.perform(input()),/RESPONSE_INVALID|RESPONSE_TOO_LARGE/);}
});
test('enterprise in-flight admission rejects rather than queues or replays a fifth mutation',async()=>{
 let release,calls=0;const pending=new Promise(r=>release=r),enterprise=new EnterpriseSession({origin,session:{fetch:async()=>{calls++;await pending;return Response.json({});}}});const flights=Array.from({length:4},()=>enterprise.perform(input()));await assert.rejects(enterprise.perform(input('POST',{})),/BUSY_NO_REPLAY/);assert.equal(calls,4);release();await Promise.all(flights);assert.equal(enterprise.running,0);
});
test('enterprise session propagates an already aborted caller and still clears admission',async()=>{
 const controller=new AbortController();controller.abort();const enterprise=new EnterpriseSession({origin,session:{fetch:async(_url,options)=>{options.signal.throwIfAborted();}}});await assert.rejects(enterprise.perform(input(),{signal:controller.signal}),/UNAVAILABLE_NO_REPLAY/);assert.equal(enterprise.running,0);
});
test('loopback enterprise bridge requires its private bearer, rejects browser Origin, and keeps native health unchanged',async()=>{
 const dir=temp();let bridge;try{const enterprise=new EnterpriseSession({origin,session:{fetch:async()=>Response.json({employees:[]})}});bridge=await startBridge({home:dir,guests:{},window:{},enterprise});const d=JSON.parse(fs.readFileSync(dir+'/naumi-desktop-bridge.json')),url='http://127.0.0.1:'+d.port;
 for(const headers of [{},{Authorization:'Bearer '+d.token,Origin:origin}])assert.equal((await fetch(url+'/enterprise/request',{method:'POST',headers,body:JSON.stringify(input())})).status,403);
 assert.deepEqual(await(await fetch(url+'/health',{headers:{Authorization:'Bearer '+d.token}})).json(),{ok:true,protocolVersion:1,pid:process.pid,engine:'chromium'});
 const t=await transport(dir);const response=await t.fetch('/api/digital-employees',{headers:{cookie:'never-forward-this'}});assert.equal(response.status,200);assert.deepEqual(await response.json(),{employees:[]});assert.throws(()=>(new (t.constructor)({origin:'https://other.example',home:dir,standalone:true})).descriptor(),/BRIDGE_INVALID/);
 }finally{await bridge?.close();assert(!fs.existsSync(dir+'/naumi-desktop-bridge.json'));remove(dir);}
});
test('desktop transport excludes device APIs and has no cookie fallback when GUI is disconnected',async()=>{
 const dir=temp();let bridge,calls=0;try{bridge=await startBridge({home:dir,guests:{},window:{},enterprise:new EnterpriseSession({origin,session:{fetch:async()=>{calls++;return Response.json({});}}})});const t=await transport(dir);await assert.rejects(t.fetch('/api/digital-employees/device'),/REQUEST_FORBIDDEN/);assert.equal(calls,0);await bridge.close();bridge=null;await assert.rejects(t.fetch('/api/workspace',{headers:{cookie:'not-reused'}}),/LOGIN_REQUIRED/);assert.equal(calls,0);}finally{await bridge?.close();remove(dir);}
});
test('EmployeeSync bridges catalog/manager but signed device requests stay on the original transport',async()=>{
 const dir=temp();let sync;try{const {EmployeeSync}=await import(pathToFileURL(path.resolve('plugins/naumi-enterprise/employee-sync.js')));const seen=[];sync=new EmployeeSync({file:dir+'/sync.sqlite',origin,store:{},directory:{},fetch:async(url)=>{seen.push(['device',url]);return Response.json({});},sessionRequest:async(url)=>{seen.push(['session',url]);return Response.json({result:{ok:true}});}});await sync.catalog('');assert.deepEqual(await sync.manager({action:'test'},''),{ok:true});await sync.http('/api/digital-employees/device');assert.deepEqual(seen.map(x=>x[0]),['session','session','device']);assert.equal(sync.status().registered,false);assert.equal(sync.status().enabled,false);}finally{await sync?.close();remove(dir);}
});
test('EmployeeSync reports expired enterprise session as login required, not a failed device authorization',async()=>{
 const dir=temp();let sync;try{const {EmployeeSync}=await import(pathToFileURL(path.resolve('plugins/naumi-enterprise/employee-sync.js')));sync=new EmployeeSync({file:dir+'/sync.sqlite',origin,store:{},directory:{},sessionRequest:async()=>Response.json({code:'UNAUTHENTICATED'},{status:401})});await assert.rejects(sync.catalog(''),e=>e.message==='COLLABORATION_LOGIN_REQUIRED'&&e.status===401);assert.equal(sync.get('revoked'),null);}finally{await sync?.close();remove(dir);}
});
test('capability observation refreshes once when GUI bridge appears or changes PID without waiting a minute',async()=>{
 const {EmployeeCapabilities}=await import(pathToFileURL(path.resolve('plugins/naumi-enterprise/employee-capabilities.js')));let descriptor=null,probes=0;const c=new EmployeeCapabilities({ctx:{tools:{definitions:()=>[]}},desktop:()=>null,dingtalk:async()=>({}),browser:{descriptor:()=>descriptor,health:async()=>{probes++;return {connected:!!descriptor};},dispose:async()=>{}}});try{await c.refresh();c.read('bot');await c.flight;const before=probes;descriptor={pid:1,port:1234};c.read('bot');await c.flight;assert.equal(probes,before+1);c.read('bot');assert.equal(probes,before+1);descriptor={pid:2,port:1234};c.read('bot');await c.flight;assert.equal(probes,before+2);}finally{await c.close();}
});

test('DPAPI enrollment vault works with a clean employee PATH and reopens the encrypted device key',async()=>{
 const dir=temp();try{const {spawnSync}=require('node:child_process'),moduleURL=pathToFileURL(path.resolve('plugins/naumi-enterprise/employee-device-vault.js')).href;const program=`import assert from 'node:assert/strict';import {EmployeeDeviceVault} from ${JSON.stringify(moduleURL)};const file=${JSON.stringify(dir+'/device.vault')},v=new EmployeeDeviceVault(file),first=v.open(),again=new EmployeeDeviceVault(file).open();assert.equal(first.publicKey,again.publicKey);assert.equal(first.privateKey,again.privateKey);assert.equal(v.unseal(v.seal({retained:true})).retained,true);console.log('DEVICE_VAULT encrypted=1 reopened=1 development_path=0');`;const child=spawnSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,PATH:process.env.SystemRoot+'\\System32'}});assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),'DEVICE_VAULT encrypted=1 reopened=1 development_path=0');assert(!fs.readFileSync(dir+'/device.vault','utf8').includes('PRIVATE KEY'));}finally{remove(dir);}
});
test('runtime inventory excludes saved enterprise configuration as employee-private install state',async()=>{
 const {scanRuntimeInventory}=await import(pathToFileURL(path.resolve('desktop/scripts/prepare-runtime.mjs')));assert.throws(()=>scanRuntimeInventory([{path:'home/desktop-enterprise.json'}]),/RUNTIME_PRIVATE_FILE/);
});
