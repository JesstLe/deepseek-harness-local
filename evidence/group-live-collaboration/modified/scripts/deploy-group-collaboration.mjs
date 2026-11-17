import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';import {botLiveApi} from './bot-live-api.mjs';
import {extendNativeComposer,PATCHED_COMPOSER_SHA} from './native-composer-extension.mjs';
const root=process.cwd(),runtime=path.resolve(process.argv[3]??root),mode=process.argv[2]??'prepare',base='7f823fe361d082635684c135ce5fdfe3b2e3db18';
const sha=b=>createHash('sha256').update(b).digest('hex'),norm=b=>b.toString().replaceAll('\r\n','\n');
const files=['bot-group-store.js','bot-group-service.js','bot-groups.js','bot-task-runtime.js','bot-tasks.js','assets/bot-chat-model.js','assets/bot-groups.js','assets/bot-groups.css','client.js'];
const installed=path.join(runtime,'.dsh/profiles/web/node_modules/@naumi/dsh-enterprise'),backup=path.join(runtime,'runtime/group-collaboration-'+randomUUID());
fs.mkdirSync(backup,{recursive:true});const rows=[];
const inventory=()=>Object.fromEntries(fs.readdirSync(installed,{recursive:true}).filter(f=>fs.statSync(path.join(installed,f)).isFile()).map(f=>[f.replaceAll('\\','/'),sha(fs.readFileSync(path.join(installed,f)))]));
const original=inventory();
for(const file of files){
 const target=path.join(installed,file),before=fs.readFileSync(target),source=fs.readFileSync(path.join(root,'plugins/naumi-enterprise',file));let after=source;
 if(file==='client.js'){
  const anchor="yield ctx.slots.register({name:'main',key:'naumi-conversation'},()=>h(React.Suspense,{fallback:null},h(BotGroups)));";
  const desired="yield ctx.slots.register({name:'main',key:'naumi-conversation',children:{'naumi.group.controls':{kind:'single',scope:'session'}}},props=>h(React.Suspense,{fallback:null},h(BotGroups,{native:props})));";
  assert.equal(norm(before).split(anchor).length,2,'RUNTIME_MAIN_ENTRY_DRIFT');assert(norm(source).includes(desired));after=Buffer.from(norm(before).replace(anchor,()=>desired));
 }else assert.equal(norm(before),norm(execFileSync('git',['show',base+':plugins/naumi-enterprise/'+file])),'RUNTIME_DRIFT '+file);
 rows.push({relative:'.dsh/profiles/web/node_modules/@naumi/dsh-enterprise/'+file,before:sha(before),after:sha(after)});
 for(const [kind,bytes]of[['before',before],['after',after]]){const p=path.join(backup,kind,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);}
}
const nativeRelative='node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',nativeFile=path.join(runtime,nativeRelative),nativeBefore=fs.readFileSync(nativeFile),nativeAfter=Buffer.from(extendNativeComposer(nativeBefore.toString()));
rows.push({relative:nativeRelative,before:sha(nativeBefore),after:sha(nativeAfter)});fs.writeFileSync(path.join(backup,'before-native.js'),nativeBefore);fs.writeFileSync(path.join(backup,'after-native.js'),nativeAfter);
fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({base,rows},null,2));
if(mode==='prepare'){console.log('GROUP_LOAD_PREPARED files=10 backup='+backup);process.exit();}
assert.equal(mode,'apply');assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'main');assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}),'','MAIN_NOT_CLEAN');
const api=await botLiveApi(runtime),sessions=await api.rpc('session/list',{_request:{}}),tasks=await api.json('/naumi/bot-tasks'),bots=await api.json('/naumi/bots'),modelHash=sha(JSON.stringify(await api.json('/naumi/model-connections')));
assert(!sessions.items.some(s=>s.running),'RUNNING_SESSIONS');assert(!tasks.tasks.some(t=>['queued','starting','running','waiting'].includes(t.status)),'ACTIVE_TASKS');
const groupRows=()=>{const db=new DatabaseSync(path.join(runtime,'.dsh/naumi/bot-groups.sqlite'),{readOnly:true});try{const v=Object.fromEntries(['rooms','members','posts','replies'].map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));assert(!v.replies.some(r=>['queued','starting','sent'].includes(r.state)),'ACTIVE_GROUP_REPLY');return sha(JSON.stringify(v));}finally{db.close();}};
const groupsBefore=groupRows(),protectedFiles=['.dsh/.credentials.yaml','.dsh/cordis.patch.yml','.dsh/profiles/web/package.json','.dsh/profiles/web/cordis.yml','.dsh/profiles/web/cordis.patch.yml','.dsh/naumi/bots.json','.dsh/naumi/bot-tasks.json','config/local.json'];
for(const f of fs.readdirSync(path.join(runtime,'.dsh/sessions'),{recursive:true}))if(f.endsWith('.jsonl.zstd'))protectedFiles.push('.dsh/sessions/'+f);
const protectedBefore=Object.fromEntries(protectedFiles.filter(f=>fs.existsSync(path.join(runtime,f))).map(f=>[f,sha(fs.readFileSync(path.join(runtime,f)))]));
const employeeHashes=async(api)=>Object.fromEntries(await Promise.all(bots.bots.map(async b=>{const {exportedAt,...v}=await api.json('/naumi/employees?view=export&botId='+encodeURIComponent(b.id));return [b.id,sha(JSON.stringify(v))];})));
const employeesBefore=await employeeHashes(api),shell=name=>{const r=spawnSync('D:/DEV/PowerShell/pwsh.exe',['-NoProfile','-File',path.join(runtime,name)],{windowsHide:true,stdio:'ignore',timeout:150000});assert.equal(r.status,0,'SERVICE_COMMAND '+name);};
const atomic=(file,bytes)=>{const temp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,bytes);fs.renameSync(temp,file);};let done=false;
try{
 shell('Stop-Naumi.ps1');for(const [f,h]of Object.entries(protectedBefore))assert.equal(sha(fs.readFileSync(path.join(runtime,f))),h,'DATA_MOVED '+f);
 for(const r of rows)assert.equal(sha(fs.readFileSync(path.join(runtime,r.relative))),r.before,'PRELOAD_DRIFT '+r.relative);
 for(const file of files)atomic(path.join(installed,file),fs.readFileSync(path.join(backup,'after',file)));
 if(!fs.existsSync(nativeFile+'.naumi-original'))fs.writeFileSync(nativeFile+'.naumi-original',nativeBefore);atomic(nativeFile,nativeAfter);
 shell('Start-Naumi.ps1');const loaded=await botLiveApi(runtime),response=await loaded.request('/naumi/bot-groups');assert.equal(response.status,200);assert.equal(response.headers.get('x-naumi-group-collaboration'),'1');
 const html=await(await loaded.request('/')).text(),marker=html.indexOf('__DSH_BOOT__'),boot=JSON.parse(html.slice(html.indexOf('=',marker)+1,html.indexOf('</script>',marker)).trim().replace(/;$/,''));
 const batch=boot.batches.find(b=>b.entries.includes('@deepseek-ai/dsh-client-ui-conversation'));assert(batch);const served=await(await loaded.request('/'+batch.url)).text();assert(served.includes('Naumi scoped composer transport v1'));assert(served.includes("name:'naumi.native.composer.bar'"));
 assert.equal(sha(fs.readFileSync(nativeFile)),PATCHED_COMPOSER_SHA);for(const r of rows)assert.equal(sha(fs.readFileSync(path.join(runtime,r.relative))),r.after);
 const after=inventory();for(const [f,h]of Object.entries(original))if(!files.includes(f))assert.equal(after[f],h,'UNRELATED_RUNTIME '+f);
 for(const [f,h]of Object.entries(protectedBefore))assert.equal(sha(fs.readFileSync(path.join(runtime,f))),h,'PROTECTED_DATA '+f);
 assert.equal(groupRows(),groupsBefore);assert.equal(sha(JSON.stringify(await loaded.json('/naumi/model-connections'))),modelHash);assert.deepEqual(await loaded.json('/naumi/bots'),bots);assert.deepEqual(await loaded.json('/naumi/bot-tasks'),tasks);assert.deepEqual(await employeeHashes(loaded),employeesBefore);
 const afterSessions=await loaded.rpc('session/list',{_request:{}});assert.equal(afterSessions.items.length,sessions.items.length);assert(!afterSessions.items.some(s=>s.running));
 const record={status:'PASS',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),rows,backup,http:200,contract:1,nativeBundleServed:true,unrelatedRuntimeUnchanged:Object.keys(original).filter(f=>!files.includes(f)).length,protectedFilesUnchanged:Object.keys(protectedBefore).length,modelsUnchanged:true,employeesUnchanged:true,taskAndGroupRowsUnchanged:true,sessions:afterSessions.items.length,running:0,bots:bots.bots.length,modelCalls:0,packageUnchanged:true};
 fs.mkdirSync(path.join(root,'evidence/group-live-collaboration'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/group-live-collaboration/DEPLOYMENT.json'),JSON.stringify(record,null,2)+'\n');done=true;
 console.log('GROUP_LOADED files=10 http=200 contract=1 native_bundle=PASS data=UNCHANGED running=0 model_calls=0');
}finally{if(!done){try{shell('Stop-Naumi.ps1');}catch{}for(const file of files)atomic(path.join(installed,file),fs.readFileSync(path.join(backup,'before',file)));atomic(nativeFile,nativeBefore);shell('Start-Naumi.ps1');console.error('GROUP_LOAD_FAILED runtime=RESTORED backup='+backup);}}
