'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {IdentitySession,identityOrigin,publicUser,namespace,accountRoot,bindAccount,readIdentityConfig,sessionPartition,MAX_JSON}=require('../app/identity.cjs');
const {IdentityRuntime}=require('../app/identity-runtime.cjs');
const source=path.resolve(__dirname,'../..'),origin='https://accounts.naumi.example';
const a={email:'alice@example.test',name:'Alice'},b={email:'bob@example.test',name:'Bob'};
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-identity-'));return {root,close(){assert(root.startsWith(os.tmpdir()+path.sep));fs.rmSync(root,{recursive:true,force:true});}};}
function server({user=null,status=200,unavailable=false}={}){const calls=[],state={user,status,unavailable,clears:0};return {state,calls,cookies:{flushStore:async()=>{}},clearStorageData:async()=>{state.clears++;state.user=null;},fetch:async(url,options)=>{calls.push({url,options});if(state.unavailable)throw Error('remote cookie and private details');if(url.endsWith('/api/auth/login')){if(state.status===200)state.user=a;return Response.json({ok:state.status===200,user:a,token:'never-export'},{status:state.status,headers:{'set-cookie':'private'}});}if(url.endsWith('/api/auth/logout')){state.user=null;return Response.json({ok:true});}return Response.json({user:state.user});}};}
test('identity origin enforces exact HTTPS authority or loopback, with no executable URLs or URL credentials',()=>{
 assert.equal(identityOrigin('https://ACCOUNTS.NAUMI.EXAMPLE/'),origin);for(const value of ['http://account.example','https://u:p@a','https://a/login','https://a?token=secret','file:///a',null])assert.throws(()=>identityOrigin(value),/IDENTITY_ORIGIN_INVALID/);
});
test('only canonical account identity crosses the adapter, never role, credits, tokens or server secrets',()=>{
 const result=publicUser({...a,email:'ALICE@example.test',role:'admin',credits:999999,password_hash:'private',token:'private'});
 assert.deepEqual(result,{subject:{type:'naumi-email-v1',value:a.email},...a});
 for(const user of [{},{email:'../account'},{email:'a @example.test'},null])assert.throws(()=>publicUser(user),/RESPONSE_INVALID/);
});
test('account and authority namespaces are stable, separate and path-safe without reusing legacy home',()=>{
 const f=fixture();try{assert.equal(namespace(origin,a),namespace(origin,{...a,email:'ALICE@example.test'}));assert.notEqual(namespace(origin,a),namespace(origin,b));assert.notEqual(namespace(origin,a),namespace('https://other.example',a));const p=bindAccount(f.root,origin,a);assert(p.root.startsWith(f.root+path.sep+'identity-profiles'+path.sep));assert(!fs.existsSync(path.join(f.root,'harness')));assert.deepEqual(readIdentityConfig(f.root),{version:1,origin});fs.writeFileSync(path.join(p.root,'memory'),'retained');assert.equal(bindAccount(f.root,origin,a).root,p.root);bindAccount(f.root,origin,b);assert.equal(fs.readFileSync(path.join(p.root,'memory'),'utf8'),'retained');}finally{f.close();}
});
test('linked/malformed profile owners and future config versions fail without claiming or replacing user data',()=>{
 const f=fixture();try{fs.writeFileSync(path.join(f.root,'naumi-identity.json'),'{"version":99,"origin":"https://a"}');assert.throws(()=>readIdentityConfig(f.root),/CONFIG_INVALID/);const p=accountRoot(f.root,origin,a);fs.mkdirSync(p.root,{recursive:true});fs.writeFileSync(path.join(p.root,'identity-owner.json'),'{"version":1,"issuer":"https://other"}');assert.throws(()=>bindAccount(f.root,origin,a),/OWNER_MISMATCH/);}finally{f.close();}
});
test('a symlink namespace is rejected and never dereferenced for writes',()=>{
 const f=fixture(),other=fixture();try{fs.symlinkSync(other.root,path.join(f.root,'identity-profiles'),'junction');assert.throws(()=>bindAccount(f.root,origin,a),/DIRECTORY_UNMANAGED/);assert.deepEqual(fs.readdirSync(other.root),[]);fs.unlinkSync(path.join(f.root,'identity-profiles'));}finally{f.close();other.close();}
});
test('login reuses Canvas native API and confirms the actual Chromium session before exposing a user',async()=>{
 const session=server(),client=new IdentitySession({origin,session}),user=await client.login({account:' Alice ',password:'fixture-password'});
 assert.deepEqual(user,publicUser(a));assert.equal(session.calls.length,2);const [login,probe]=session.calls;
 assert.equal(login.url,origin+'/api/auth/login');assert.deepEqual(JSON.parse(login.options.body),{email:'Alice',password:'fixture-password'});assert.equal(probe.url,origin+'/api/auth/session');
 for(const {options}of session.calls){assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');assert(!('cookie'in options.headers));}assert(!JSON.stringify(user).includes('private'));assert(!JSON.stringify(user).includes('token'));
});
test('wrong password, disabled/expired account and rate limiting preserve server decisions with one attempt only',async()=>{
 for(const [status,code]of [[401,'CREDENTIALS_INVALID'],[403,'ACCOUNT_UNAVAILABLE'],[429,'RATE_LIMITED'],[503,'UNAVAILABLE']]){const session=server({status});await assert.rejects(new IdentitySession({origin,session}).login({account:'test',password:'test'}),new RegExp(code));assert.equal(session.calls.length,1);}
});
test('login success response without a confirmed server session does not authenticate',async()=>{
 const client=new IdentitySession({origin,session:{fetch:async url=>Response.json(url.endsWith('/login')?{ok:true,user:a}:{user:null})}});await assert.rejects(client.login({account:'test',password:'test'}),/LOGIN_REQUIRED/);
});
test('invalid input never reaches the account server',async()=>{
 const session=server(),client=new IdentitySession({origin,session});for(const input of [{account:'',password:'x'},{account:'a',password:''},{account:'a',password:'x',headers:{}},null])await assert.rejects(client.login(input),/INPUT_INVALID/);assert.equal(session.calls.length,0);
});
test('network failure or redirect never leaks remote details, changes a namespace or replays password submission',async()=>{
 const f=fixture(),session=server({unavailable:true});try{const runtime=new IdentityRuntime({userData:f.root,sessionFor:()=>session});await assert.rejects(runtime.login({origin,account:'a',password:'test'}),/^Error: IDENTITY_UNAVAILABLE$/);assert.equal(session.calls.length,1);assert.equal(runtime.active,null);assert.deepEqual(fs.readdirSync(f.root),[]);}finally{f.close();}
});
test('identity JSON responses are bounded and reject login HTML or malformed sessions',async()=>{
 for(const response of [new Response('<html>login</html>'),Response.json({user:{...a,name:'x'.repeat(MAX_JSON)}}),Response.json({ok:true})])await assert.rejects(new IdentitySession({origin,session:{fetch:async()=>response}}).inspect(),/RESPONSE_INVALID|RESPONSE_TOO_LARGE/);
});
test('concurrent password submissions are rejected rather than queued',async()=>{
 let release;const gate=new Promise(r=>release=r),session=server(),original=session.fetch;session.fetch=async(...args)=>{await gate;return original(...args);};const client=new IdentitySession({origin,session}),first=client.login({account:'a',password:'test'});await assert.rejects(client.login({account:'a',password:'test'}),/BUSY/);release();await first;assert.equal(session.calls.length,2);
});
test('managed authority cannot be replaced by renderer input; cookie partitions are origin-bound',async()=>{
 const f=fixture();try{const session=server(),runtime=new IdentityRuntime({userData:f.root,managedOrigin:origin,sessionFor:()=>session});await assert.rejects(runtime.login({origin:'https://evil.example',account:'a',password:'x'}),/MANAGED_ORIGIN/);assert.equal(session.calls.length,0);assert.notEqual(sessionPartition(origin),sessionPartition('https://other.example'));}finally{f.close();}
});
test('logout clears only the owned account session and retains every local account home even offline',async()=>{
 const f=fixture(),session=server();try{const runtime=new IdentityRuntime({userData:f.root,sessionFor:()=>session}),first=await runtime.login({origin,account:'a',password:'fixture'});fs.writeFileSync(path.join(first.root,'memory'),'retained');session.state.unavailable=true;assert.deepEqual(await runtime.logout(),{remoteConfirmed:false});assert.equal(session.state.clears,1);assert.equal(runtime.active,null);assert.equal(fs.readFileSync(path.join(first.root,'memory'),'utf8'),'retained');assert.equal(readIdentityConfig(f.root).origin,origin);}finally{f.close();}
});
test('cold start validates the server; an already open local identity survives an outage in this process only',async()=>{
 const f=fixture(),session=server();try{const runtime=new IdentityRuntime({userData:f.root,sessionFor:()=>session}),active=await runtime.login({origin,account:'a',password:'fixture'});session.state.unavailable=true;assert.equal(await runtime.restore(),active);const cold=new IdentityRuntime({userData:f.root,sessionFor:()=>session});assert.equal(await cold.restore(),null);assert.equal(cold.status().error,'IDENTITY_UNAVAILABLE');assert.equal(cold.status().user,null);}finally{f.close();}
});
test('revoked/reset/disabled Canvas sessions cannot restore a logged-in account on cold start',async()=>{
 const f=fixture(),session=server();try{const runtime=new IdentityRuntime({userData:f.root,sessionFor:()=>session});await runtime.login({origin,account:'a',password:'fixture'});session.state.user=null;const cold=new IdentityRuntime({userData:f.root,sessionFor:()=>session});assert.equal(await cold.restore(),null);assert.equal(cold.status().error,'IDENTITY_LOGIN_REQUIRED');}finally{f.close();}
});
test('changing account requires logout, and no remote password or token is persisted on disk',async()=>{
 const f=fixture(),session=server();try{const runtime=new IdentityRuntime({userData:f.root,sessionFor:()=>session});await runtime.login({origin,account:'a',password:'fixture-password'});await assert.rejects(runtime.login({origin,account:'b',password:'fixture'}),/ALREADY_SIGNED_IN/);const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);for(const file of walk(f.root)){const text=fs.readFileSync(file,'utf8');assert(!text.includes('fixture-password'));assert(!text.includes('never-export'));assert(!text.includes('password'));}}finally{f.close();}
});
test('native wiring keeps legacy dev hosts intact, accounts scope enterprise/browser homes and logout quiesces before stopping',()=>{
 const main=fs.readFileSync(path.join(source,'desktop/app/main.cjs'),'utf8');assert(main.includes('if(candidate.isolated)'));assert(main.includes("localSettings(accountApp())"));assert(main.includes('identityRuntime.active.profileId'));assert(main.includes("identityUserData??app.getPath('userData')"));
 const logout=main.slice(main.indexOf("ipcMain.handle('naumi:identity-logout'"),main.indexOf("ipcMain.handle('naumi:enterprise-login'"));assert(logout.indexOf('assertAccountIdle')<logout.indexOf("performMaintenance('quiesce'"));assert(logout.indexOf("performMaintenance('quiesce'")<logout.indexOf('stopBackend'));assert(logout.indexOf('clearStorageData')<logout.indexOf('identityRuntime.logout'));assert(!logout.includes('rmSync'));assert(!main.includes('cookies.get('));
});
test('package audit excludes identity state and all per-account profiles from distributable runtime',async()=>{
 const {scanRuntimeInventory}=await import('../scripts/prepare-runtime.mjs');for(const name of ['naumi-identity.json','identity-profiles/abc/harness/config.json','home/identity-owner.json'])assert.throws(()=>scanRuntimeInventory([{path:name}]),/RUNTIME_PRIVATE_FILE/);
});
test('account entry renders nothing on web/linked shells and appears only for a real native identity capability',async()=>{
 const vm=require('node:vm'),client=fs.readFileSync(path.join(source,'plugins/naumi-enterprise/client.js'),'utf8');
 const helper=client.slice(client.indexOf('    function IdentityAccount(){'),client.indexOf('    function DesignGrid()'));
 for(const available of [null,false,true]){
  let value=null;const effects=[];
  const sandbox={useState:()=>[value,next=>{value=next;}],useEffect:effect=>effects.push(effect),h:(type,props,...children)=>({type,props,children}),Icon(){},...(available===null?{}:{naumiDesktop:{identityState:async()=>({available,user:a}),openIdentity(){}}})};
  const component=vm.runInNewContext('('+helper.trim()+')',sandbox);assert.equal(component(),null);effects.shift()();await new Promise(r=>setImmediate(r));
  const rendered=component();if(available===true){assert.equal(rendered.type,'div');assert(JSON.stringify(rendered).includes(a.email));}else assert.equal(rendered,null);
 }
});
test('login reuses the requested Smoke/Liquid presentation locally and removes only the Design brand sublabel',()=>{
 const {createHash}=require('node:crypto'),sha=b=>createHash('sha256').update(b).digest('hex'),dir=path.join(source,'desktop/app/identity-style'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'SOURCE.json')));
 assert.equal(manifest.reference,'http://127.0.0.1:3112/login');
 for(const item of manifest.files)assert.equal(sha(fs.readFileSync(path.join(source,item.target))),item.modifiedSHA256);
 assert.equal(sha(fs.readFileSync(path.join(source,manifest.bundle.path))),manifest.bundle.sha256);
 const html=fs.readFileSync(path.join(source,'desktop/app/identity.html'),'utf8'),visual=fs.readFileSync(path.join(source,'desktop/app/identity-visual.js'),'utf8');
 assert(html.includes('auth-page auth-smoke'));assert(html.includes('auth-liquid-options'));assert(html.includes('auth-liquid-submit'));assert(!html.includes('DESIGN'));assert(!html.includes('iframe'));
 for(const value of ['fetch(','XMLHttpRequest','password','localStorage','sessionStorage'])assert(!visual.includes(value),value);
 for(const value of ['pagehide','cancelAnimationFrame','ResizeObserver','visibilitychange','webglcontextlost'])assert(visual.includes(value));
 const license=fs.readFileSync(path.join(dir,'THIRD_PARTY_NOTICES.txt'),'utf8');assert(license.includes('Aakash Mehra'));assert(license.includes('Guglielmo Giannattasio'));assert(license.includes('Permission is hereby granted'));
});
