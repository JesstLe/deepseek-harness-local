import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {parse} from 'yaml';

const root=process.cwd(),out=path.resolve(process.env.NAUMI_RELEASE_OUT??'D:/NaumiReleases/0.4.6');
const release=path.resolve(process.env.NAUMI_RELEASE_BUILD??path.join(root,'runtime/naumi-desktop-release'));
const require=createRequire(path.join(root,'desktop/package.json')),hash=b=>createHash('sha256').update(b).digest('hex');
const mode=process.argv[2]??'static',checks=[];
const check=(name,condition)=>{assert(condition,name);checks.push(name);console.log('RELEASE046_PASS '+name);};
fs.mkdirSync(out,{recursive:true});
const exe=path.join(release,'win-unpacked/Naumi.exe'),resources=path.join(release,'win-unpacked/resources'),backend=path.join(resources,'backend');
const manifest=JSON.parse(fs.readFileSync(path.join(backend,'runtime-manifest.json')));

if(mode==='static'){
 const asar=require('@electron/asar'),archive=path.join(resources,'app.asar'),pkg=JSON.parse(asar.extractFile(archive,'package.json'));
 check('client_and_service_046',pkg.version==='0.4.6'&&manifest.version==='0.4.6');
 check('three_choice_policy_enabled',manifest.modelPolicy==='three-options-vision-20261120');
 check('no_embedded_personal_credentials',manifest.personalCredentials===false&&manifest.browserProfiles===false&&!manifest.edition&&!fs.existsSync(path.join(backend,'defaults/internal-trial-access.json')));
 check('closure_and_private_path_scan',manifest.closure.status==='PASS'&&manifest.scan.forbiddenPaths===0);
 const rows=JSON.parse(fs.readFileSync(path.join(backend,'runtime-files.json')));
 for(const row of rows)assert.equal(hash(fs.readFileSync(path.join(backend,row.path))),row.sha256,row.path);
 check('full_packaged_backend_inventory',true);
 for(const file of['model-policy.js','cua-admission.js','im-adapters/platforms/weixin.js','browser.js']){
  const actual=path.join(backend,'plugins/naumi-enterprise',file);
  assert.equal(hash(fs.readFileSync(actual)),hash(fs.readFileSync(path.join(root,'plugins/naumi-enterprise',file))),file);
 }
 check('model_cua_weixin_sources_included',true);
 const fixed=fs.readFileSync(path.join(out,'FIXED_MAIN.txt'),'utf8').trim();
 for(const file of['main.cjs','backend.cjs','profile.cjs','updates.cjs','preload.cjs','browser-connect.cjs','browser-vault.cjs']){
  const expected=execFileSync('git',['show',fixed+':desktop/app/'+file],{maxBuffer:20e6}).toString().replaceAll('\r\n','\n');
  assert.equal(asar.extractFile(archive,'app/'+file).toString().replaceAll('\r\n','\n'),expected,file);
 }
 check('actual_asar_matches_fixed_main',true);
 const setup=path.join(release,'Naumi-Setup-0.4.6-x64.exe'),bytes=fs.readFileSync(setup),feed=parse(fs.readFileSync(path.join(release,'latest.yml'),'utf8'));
 check('real_complete_installer_PE',bytes.length>100e6&&bytes.subarray(0,2).toString()==='MZ');
 check('installer_and_update_metadata_hashes',feed.version==='0.4.6'&&feed.sha512===createHash('sha512').update(bytes).digest('base64')&&feed.path===path.basename(setup));
 fs.writeFileSync(path.join(out,'PACKAGE.json'),JSON.stringify({status:'PASS',checks,version:'0.4.6',fixedMain:fixed,installer:setup,bytes:bytes.length,sha256:hash(bytes),sha512:feed.sha512,runtimeFiles:rows.length,modelPolicy:manifest.modelPolicy,personalCredentials:false,modelCalls:0,publicRelease:false},null,2));
}else if(mode==='native'){
 const {_electron}=require('playwright'),{accountRoot}=require('../desktop/app/identity.cjs');
 const temp=path.join(root,'runtime/release046-smoke-'+randomUUID()),user=path.join(temp,'user'),local=path.join(temp,'local');fs.mkdirSync(local,{recursive:true});
 const owner={email:'release046@example.test',name:'Package fixture'};let modelCalls=0;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/auth/session')res.end(JSON.stringify({user:owner}));
  else if(req.url==='/latest.yml'){res.setHeader('Content-Type','text/yaml');res.end('version: 0.4.6\nfiles: []\nsha512: '+Buffer.alloc(64).toString('base64')+'\n');}
  else if(req.url.includes('/messages')||req.url.includes('/completions')||req.url.includes('/responses')){modelCalls++;res.writeHead(503).end('{"error":"unexpected fixture inference"}');}
  else res.writeHead(401).end('{"code":"UNAUTHENTICATED"}');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const socket=http.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+socket.address().port;await new Promise(r=>socket.close(r));
 const home=path.join(accountRoot(user,origin,owner).root,'harness'),profile=path.join(home,'profiles/web');fs.mkdirSync(profile,{recursive:true});
 const providers={flash:{api:'anthropic-messages',baseURL:origin,apiKeyEnv:'FIXTURE_FLASH',models:[{id:'deepseek-flash'}]},luna:{api:'anthropic-messages',baseURL:origin,apiKeyEnv:'FIXTURE_LUNA',models:[{id:'gpt-6-luna'}]},obsolete:{api:'anthropic-messages',baseURL:origin,apiKeyEnv:'FIXTURE_OLD',models:[{id:'obsolete-model'}]}};
 fs.writeFileSync(path.join(profile,'cordis.patch.yml'),JSON.stringify([{id:'llm-pi-ai',config:{providers}},{id:'agent-default-model',config:{provider:'obsolete',model:'obsolete-model'}}]));
 fs.writeFileSync(path.join(home,'.credentials.yaml'),JSON.stringify({version:1,refs:{FIXTURE_FLASH:'fixture-only',FIXTURE_LUNA:'fixture-only',FIXTURE_OLD:'fixture-only'},records:{}}));
 let credentialHash=hash(fs.readFileSync(path.join(home,'.credentials.yaml')));
 const official=['C:/Program Files/Naumi/Naumi.exe','C:/Program Files/Naumi/resources/app.asar','C:/Program Files/Naumi/resources/backend/runtime-manifest.json'];
 const officialBefore=official.map(f=>hash(fs.readFileSync(f)));let app,workerPid,sid;const errors=[];
 const envFor=data=>{const env={...process.env,NAUMI_USER_DATA:data,LOCALAPPDATA:local,NAUMI_IDENTITY_ORIGIN:origin,NAUMI_ENTERPRISE_ORIGIN:origin,NAUMI_UPDATE_URL:origin,NAUMI_HOST_URL:url,NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1'};for(const key of['ELECTRON_RUN_AS_NODE','NAUMI_ROOT','NAUMI_DSH_HOME','NAUMI_BUILD_MODEL_POLICY','NAUMI_MODEL_POLICY'])delete env[key];return env;};
 async function launch(binary,data=user){app=await _electron.launch({executablePath:binary,args:[],env:envFor(data),timeout:90000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForURL(u=>u.origin===url,{timeout:90000});await page.waitForFunction(()=>document.body.getAttribute('data-naumi')==='enterprise');const state=await app.evaluate(({app})=>({home:__naumiTest.settings.home,pid:__naumiTest.backend.child?.pid,owned:__naumiTest.backend.owned,version:app.getVersion()}));workerPid=state.pid;assert(state.owned);return{page,state};}
 async function close(){if(app){await app.close();app=null;}if(workerPid){for(let i=0;i<100;i++){try{process.kill(workerPid,0);await new Promise(r=>setTimeout(r,100));}catch{workerPid=null;break;}}assert.equal(workerPid,null,'fixture worker must stop');}}
 const read=(page,p)=>page.evaluate(async p=>(await fetch(p)).json(),p);
 const rpc=(page,method,args)=>page.evaluate(async({method,args})=>{const r=await fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'release046',method,payload:{args}})}),v=await r.json();if(!v.result?.ok)throw Error(v.result?.error?.code??'RPC_FAILED');return v.result.value;},{method,args});
 try{
  let launched=await launch(official[0]);check('old_045_executable_opens_isolated_fixture',launched.state.version==='0.4.5'&&launched.state.home===home);
  check('old_fixture_has_three_original_routes',(await read(launched.page,'/naumi/model-connections')).groups.length===3);
  sid=(await rpc(launched.page,'session/create',{request:{cwd:path.join(home,'workspace')}})).sessionId;await close();credentialHash=hash(fs.readFileSync(path.join(home,'.credentials.yaml')));
  launched=await launch(exe);check('new_packaged_executable_is_046',launched.state.version==='0.4.6'&&launched.state.home===home);check('actual_running_service_is_046',await launched.page.evaluate(()=>globalThis.__NAUMI__?.productVersion)==='0.4.6');
  const models=await read(launched.page,'/naumi/model-connections'),flat=models.groups.flatMap(g=>g.models);
  check('upgrade_automatically_applies_three_options',models.managedPolicy?.ready===true&&models.writable===false&&flat.length===3&&['claude fable5.2','gpt6.1sol','gpt6.1terra'].every(name=>flat.some(m=>m.name===name)));
  check('all_options_declare_vision',flat.every(m=>m.input.includes('image')));
  const sol=models.groups.find(g=>g.models.some(m=>m.name==='gpt6.1sol')),terra=models.groups.find(g=>g.models.some(m=>m.name==='gpt6.1terra'));
  check('native_sol_terra_both_luna',sol.models[0].id==='gpt-6-luna'&&terra.models[0].id==='gpt-6-luna'&&sol.baseURL===terra.baseURL);
  check('fixture_credentials_unchanged',hash(fs.readFileSync(path.join(home,'.credentials.yaml')))===credentialHash);
  const sessions=await rpc(launched.page,'session/list',{_request:{}});check('old_session_retained',sessions.items.some(s=>(s.sessionId??s.id)===sid));
  const readonly=await launched.page.evaluate(async()=>{const r=await fetch('/naumi/model-connections',{method:'POST',headers:{'Content-Type':'application/json','x-naumi-model-connections':'1'},body:'{}'});return{status:r.status,value:await r.json()};});check('managed_model_edits_denied',readonly.status===403&&readonly.value.error==='MODEL_POLICY_MANAGED');
  const backupFiles=fs.readdirSync(path.join(home,'model-policy-backups'));check('original_model_configuration_backed_up',backupFiles.length===1);await close();
  launched=await launch(exe);const again=await read(launched.page,'/naumi/model-connections');check('restart_is_idempotent',again.groups.flatMap(g=>g.models).length===3&&fs.readdirSync(path.join(home,'model-policy-backups')).length===1);await close();
  const fresh=await launch(exe,path.join(temp,'fresh-user')),empty=await read(fresh.page,'/naumi/model-connections');check('missing_sources_report_unready_not_fake_ready',empty.managedPolicy?.ready===false&&empty.managedPolicy.error==='MODEL_POLICY_SOURCE_REQUIRED');await close();
  check('installed_official_app_unchanged',official.every((f,i)=>hash(fs.readFileSync(f))===officialBefore[i]));check('no_real_model_calls_or_page_errors',modelCalls===0&&errors.length===0);
  fs.writeFileSync(path.join(out,'NATIVE_PACKAGE.json'),JSON.stringify({status:'PASS',checks,version:'0.4.6',realPackagedExecutables:true,serviceVersion:'0.4.6',oldBoots:1,newBoots:3,isolatedFixture:true,sessionPreserved:true,modelCalls,personalDataSent:false,installedAppChanged:false,pageErrors:errors,fixtureRoot:temp,scope:'isolated actual executable upgrade/restart; not installed production upgrade'},null,2));
 }finally{await close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}else throw Error('use static or native');
