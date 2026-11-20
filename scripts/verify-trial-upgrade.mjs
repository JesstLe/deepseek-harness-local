// Actual distributed EXEs and persistent account homes; never the installed user app.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parse} from 'yaml';
const root=process.cwd(),require=createRequire(path.join(root,'desktop/package.json')),{_electron}=require('playwright');
const out=process.env.NAUMI_RELEASE_OUT??'D:/NaumiReleases/0.4.7',mode=process.argv[2]??'baseline',checks=[],sha=b=>createHash('sha256').update(b).digest('hex');
const check=(name,ok)=>{assert(ok,name);checks.push(name);console.log('TRIAL_UPGRADE_PASS '+name);};
const temp=path.join(root,'runtime/trial-upgrade-'+mode+'-'+randomUUID());fs.mkdirSync(temp,{recursive:true});
const installed=['C:/Program Files/Naumi/Naumi.exe','C:/Program Files/Naumi/resources/app.asar','C:/Program Files/Naumi/resources/backend/runtime-manifest.json'],installedHashes=installed.map(p=>sha(fs.readFileSync(p)));
const requests=[],errors=[],owner={email:'trial-upgrade@example.test',name:'Upgrade fixture'};let catalogOnline=true;
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://fixture').pathname;
 if(pathname==='/api/auth/session'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({user:owner}));}
 if(pathname==='/latest.yml'){res.setHeader('content-type','text/yaml');return res.end('version: 0.4.7\nfiles: []\nsha512: '+Buffer.alloc(64).toString('base64')+'\n');}
 if(pathname.endsWith('/models')){requests.push({type:'catalog',path:pathname});res.setHeader('content-type','application/json');if(!catalogOnline){res.writeHead(503);return res.end('{}');}return res.end(JSON.stringify({data:pathname.includes('/gpt/')?[{id:'gpt-6-luna',input_modalities:['text','image']}]:[{id:'deepseek-flash'}],has_more:false}));}
 if(pathname.endsWith('/messages')){
  const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));requests.push({type:'inference',path:pathname,model:body.model,fixtureKey:req.headers['x-api-key']?.startsWith('owned-fixture-')===true});
  res.writeHead(200,{'content-type':'text/event-stream'});const emit=(type,v)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...v})+'\n\n');
  emit('message_start',{message:{id:'fixture-'+randomUUID(),type:'message',role:'assistant',model:body.model,content:[],usage:{input_tokens:10,output_tokens:0}}});emit('content_block_start',{index:0,content_block:{type:'text',text:''}});emit('content_block_delta',{index:0,delta:{type:'text_delta',text:'UPGRADE_MODEL_OK'}});emit('content_block_stop',{index:0});emit('message_delta',{delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:3}});emit('message_stop',{});return res.end();
 }
 res.writeHead(401,{'content-type':'application/json'}).end('{"code":"UNAUTHENTICATED"}');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const socket=http.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const hostURL='http://127.0.0.1:'+socket.address().port;await new Promise(r=>socket.close(r));
let app,workerPid,home;
async function close(){if(app){await app.close();app=null;}if(workerPid){let dead=false;for(let i=0;i<100;i++){try{process.kill(workerPid,0);await new Promise(r=>setTimeout(r,100));}catch{dead=true;break;}}assert(dead,'OWNED_FIXTURE_WORKER_MUST_EXIT');workerPid=null;}}
async function launch(executablePath,userData){
 const env={...process.env,NAUMI_USER_DATA:userData,LOCALAPPDATA:path.join(temp,'local'),NAUMI_IDENTITY_ORIGIN:origin,NAUMI_ENTERPRISE_ORIGIN:origin,NAUMI_HOST_URL:hostURL,NAUMI_UPDATE_URL:origin,NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1'};
 for(const k of['ELECTRON_RUN_AS_NODE','NAUMI_ROOT','NAUMI_DSH_HOME','NAUMI_MODEL_POLICY','NAUMI_BUILD_MODEL_POLICY'])delete env[k];
 app=await _electron.launch({executablePath,args:[],env,timeout:90000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForURL(u=>u.origin===hostURL,{timeout:90000});await page.waitForFunction(()=>document.body.getAttribute('data-naumi')==='enterprise');
 const state=await app.evaluate(({app})=>({home:__naumiTest.settings.home,pid:__naumiTest.backend.child?.pid,owned:__naumiTest.backend.owned,version:app.getVersion()}));home=state.home;workerPid=state.pid;assert(state.owned);return{page,state};
}
const rpc=(page,method,args)=>page.evaluate(async({method,args})=>{const r=await fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'upgrade-'+crypto.randomUUID(),method,payload:{args}})});const v=await r.json();if(!v.result?.ok)throw Error(v.result?.error?.code??'RPC_FAILED');return v.result.value;},{method,args});
const models=page=>page.evaluate(async()=>(await fetch('/naumi/model-connections')).json());
const standard046='D:/NaumiReleases/0.4.6/win-unpacked/Naumi.exe',fixed=process.env.NAUMI_FIXED_EXE??path.join(root,'runtime/naumi-desktop-release/win-unpacked/Naumi.exe');
try{
 for(const [label,folder,oldCount]of[['first','internal-test-0.4.3',17],['r2','internal-test-0.4.3-r2',6]]){
  const userData=path.join(temp,label,'user'),oldExe='D:/NaumiReleases/'+folder+'/win-unpacked/Naumi.exe';
  let boot=await launch(oldExe,userData);check(label+'_actual_distributed_043_booted',boot.state.version==='0.4.3');const initial=await models(boot.page);check(label+'_actual_trial_shape',initial.groups.flatMap(g=>g.models).length===oldCount);
  const sid=(await rpc(boot.page,'session/create',{request:{cwd:path.join(home,'workspace')}})).sessionId;await close();
  // Only after the real old application exits, replace fixture-owned secrets and
  // endpoints. Preserve the exact distributed IDs, references and model metadata.
  const configFile=path.join(home,'profiles/web/cordis.patch.yml'),keyFile=path.join(home,'.credentials.yaml'),rows=parse(fs.readFileSync(configFile,'utf8')),providers=rows.find(r=>r.id==='llm-pi-ai').config.providers,credentials=parse(fs.readFileSync(keyFile,'utf8'));
  for(const[id,p]of Object.entries(providers)){p.baseURL=origin+'/'+label+'/'+(p.models.some(m=>m.id.startsWith('gpt-'))?'gpt':'flash')+'/'+id;credentials.refs[p.apiKeyEnv]='owned-fixture-'+sha(p.apiKeyEnv).slice(0,12);}
  fs.writeFileSync(configFile,JSON.stringify(rows));fs.writeFileSync(keyFile,JSON.stringify(credentials));const originalConfig=fs.readFileSync(configFile),keyHash=sha(fs.readFileSync(keyFile)),accountHome=home;
  if(mode==='baseline'){
   boot=await launch(standard046,userData);const result=await models(boot.page);check(label+'_same_account_home',home===accountHome);check(label+'_046_observed_expected_state',label==='r2'?result.managedPolicy?.ready===false&&result.managedPolicy.error==='MODEL_POLICY_SOURCE_REQUIRED':result.managedPolicy?.ready===true);check(label+'_046_credentials_unchanged',sha(fs.readFileSync(keyFile))===keyHash);if(label==='r2')check('r2_046_original_config_not_destroyed',fs.readFileSync(configFile).equals(originalConfig));await close();
  }else{
   // Exercise already-affected r2 installations, not only a direct fresh upgrade.
   if(label==='r2'){boot=await launch(standard046,userData);check('r2_reproduced_already_installed_046_failure',(await models(boot.page)).managedPolicy?.ready===false);await close();}
   boot=await launch(fixed,userData);let result=await models(boot.page);check(label+'_047_client_service_same_version',boot.state.version==='0.4.7'&&await boot.page.evaluate(()=>globalThis.__NAUMI__?.productVersion)==='0.4.7');check(label+'_same_account_home',home===accountHome);
   check(label+'_all_three_choices_restored',result.managedPolicy?.ready&&result.managedPolicy.missing.length===0&&result.groups.flatMap(g=>g.models).length===3);check(label+'_all_choices_have_vision',result.groups.flatMap(g=>g.models).every(m=>m.input.includes('image')));
   check(label+'_old_session_retained',(await rpc(boot.page,'session/list',{_request:{}})).items.some(s=>(s.sessionId??s.id)===sid));
   for(const [name,wire]of[['claude fable5.2','deepseek-flash'],['gpt6.1sol','gpt-6-luna'],['gpt6.1terra','gpt-6-luna']]){
    const group=result.groups.find(g=>g.models.some(m=>m.name===name));await rpc(boot.page,'session/selectModel',{request:{sessionId:sid,provider:group.id,model:wire}});
    const before=requests.filter(r=>r.type==='inference').length;await rpc(boot.page,'session/prompt',{request:{sessionId:sid,requestId:randomUUID(),mode:'queue',content:[{type:'text',text:'Reply UPGRADE_MODEL_OK'}]}});
    const response=await rpc(boot.page,'session/wait',{request:{sessionId:sid,timeoutMs:30000,maxMessages:1}});check(label+'_native_reply_'+name,JSON.stringify(response).includes('UPGRADE_MODEL_OK')&&requests.filter(r=>r.type==='inference').length===before+1&&requests.filter(r=>r.type==='inference').at(-1).model===wire);
   }
   await close();check(label+'_credentials_unchanged',sha(fs.readFileSync(keyFile))===keyHash);const migratedHash=sha(fs.readFileSync(configFile)),backups=fs.readdirSync(path.join(home,'model-policy-backups'));check(label+'_original_config_backup',backups.length===1&&JSON.stringify(JSON.parse(fs.readFileSync(path.join(home,'model-policy-backups',backups[0]))).providers)===JSON.stringify(providers));
   boot=await launch(fixed,userData);result=await models(boot.page);check(label+'_restart_idempotent',result.managedPolicy.ready&&sha(fs.readFileSync(configFile))===migratedHash&&fs.readdirSync(path.join(home,'model-policy-backups')).length===1);await close();
   // Test offline first migration and in-session reconnect on the actual package.
   if(label==='r2'){
    fs.writeFileSync(configFile,originalConfig);catalogOnline=false;boot=await launch(fixed,userData);result=await models(boot.page);check('r2_catalog_down_still_has_flash',result.managedPolicy.ready&&result.managedPolicy.missing.includes('gpt-6-luna')&&result.groups.flatMap(g=>g.models).length===1);
    await boot.page.getByRole('button',{name:'设置',exact:true}).click();await boot.page.getByRole('button',{name:'模型连接',exact:true}).click();check('r2_reconnect_button_visible',await boot.page.getByRole('button',{name:'重新连接',exact:true}).isVisible());catalogOnline=true;await boot.page.getByRole('button',{name:'重新连接',exact:true}).click();await boot.page.waitForFunction(async()=>{const v=await(await fetch('/naumi/model-connections')).json();return v.managedPolicy.ready&&v.managedPolicy.missing.length===0;});check('r2_in_session_reconnect_restores_three',(await models(boot.page)).groups.flatMap(g=>g.models).length===3);await close();
   }
  }
 }
 check('installed_user_application_unchanged',installed.every((p,i)=>sha(fs.readFileSync(p))===installedHashes[i]));check('no_page_errors',errors.length===0);check('only_loopback_fixture_keys_used',requests.filter(r=>r.type==='inference').every(r=>r.fixtureKey));
 if(mode==='baseline')check('baseline_zero_inference',requests.every(r=>r.type!=='inference'));
 const report={status:'PASS',mode,checks,fixtureRoot:temp,actualDistributedExecutables:true,localCatalogRequests:requests.filter(r=>r.type==='catalog').length,localInferenceRequests:requests.filter(r=>r.type==='inference').length,realSupplierInference:0,installedAppChanged:false,pageErrors:errors};fs.writeFileSync(path.join(out,mode==='baseline'?'BASELINE_NATIVE.json':'UPGRADE_NATIVE.json'),JSON.stringify(report,null,2));console.log('TRIAL_UPGRADE_COMPLETE mode='+mode+' checks='+checks.length+' local_inference='+report.localInferenceRequests+' real_supplier_inference=0');
}finally{await close();server.closeAllConnections();await new Promise(r=>server.close(r));}
