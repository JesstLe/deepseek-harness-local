// Narrow main-only runtime delta. No account enrollment, provider calls, or task writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';import {execFileSync,spawnSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';import {botLiveApi} from './bot-live-api.mjs';
const root=process.cwd(),mode=process.argv[2]??'prepare',runtime=path.resolve(process.argv[3]??root),baseline='9f99b1d86d52c651f414007e75f3156b384a0346';
const installed=path.join(runtime,'.dsh/profiles/web/node_modules/@naumi/dsh-enterprise'),backup=path.join(runtime,'runtime/primary-bot-load-'+randomUUID()),out=path.join(root,'evidence/primary-bot');
const files=['host.js','client.js','bots.js','bot-groups.js','bot-group-store.js','bot-group-service.js','assets/bot-sidebar.js','assets/bot-sidebar-model.js','assets/bot-groups.js','assets/primary-bot.js','assets/primary-bot.css'];
const read=p=>fs.readFileSync(p),sha=v=>createHash('sha256').update(v).digest('hex'),norm=v=>v.toString().replaceAll('\r\n','\n');
const inventory=()=>Object.fromEntries(fs.readdirSync(installed,{recursive:true}).filter(f=>fs.statSync(path.join(installed,f)).isFile()).map(f=>[f.replaceAll('\\','/'),sha(read(path.join(installed,f)))]));
const once=(text,anchor,insert)=>{assert.equal(text.split(anchor).length,2,'DELTA_ANCHOR '+anchor);return text.replace(anchor,()=>insert);};
fs.mkdirSync(backup,{recursive:true});fs.mkdirSync(out,{recursive:true});const original=inventory(),rows=[];
for(const file of files){const target=path.join(installed,file),before=fs.existsSync(target)?read(target):null,source=read(path.join(root,'plugins/naumi-enterprise',file));let after=source;
 if(file==='host.js'){
  let text=norm(before);assert(!text.includes("assets.set('primary-bot.js'"));
  text=once(text,"  assets.set('bot-groups.css','text/css; charset=utf-8');","  assets.set('bot-groups.css','text/css; charset=utf-8');\n  assets.set('primary-bot.js','text/javascript; charset=utf-8');\n  assets.set('primary-bot.css','text/css; charset=utf-8');");
  text=once(text,'<link rel="stylesheet" href="/naumi/assets/bot-groups.css">','<link rel="stylesheet" href="/naumi/assets/bot-groups.css"><link rel="stylesheet" href="/naumi/assets/primary-bot.css">');after=Buffer.from(text);
 }else if(file==='client.js'){
  const sourceText=norm(source),start=sourceText.indexOf('  ctx.effect(()=>{'),end=sourceText.indexOf('  ctx.effect(()=>{',start+1),addition=sourceText.slice(start,end);assert(addition.includes("'/naumi/assets/primary-bot.js'"));assert(!norm(before).includes("'/naumi/assets/primary-bot.js'"));
  after=Buffer.from(once(norm(before),'function installNaumiContextUI(ctx,React,createPortal,Icon){','function installNaumiContextUI(ctx,React,createPortal,Icon){\n'+addition).replace(addition+'\n',addition));
 }else if(before)assert.equal(norm(before),norm(execFileSync('git',['show',baseline+':plugins/naumi-enterprise/'+file])),'RUNTIME_DRIFT '+file);else assert(file.startsWith('assets/primary-bot.'));
 for(const[kind,bytes]of[['before',before],['after',after]])if(bytes){const p=path.join(backup,kind,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);}
 rows.push({file,beforeSHA256:before?sha(before):null,afterSHA256:sha(after)});
}
fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({baseline,rows},null,2));
if(mode==='prepare'){console.log('PRIMARY_LOAD_PREPARED files=11 host_client=DELTA backup='+backup);process.exit(0);}assert.equal(mode,'apply');
assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'main');assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}),'','TRACKED_TREE_DIRTY');
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),untrackedHashes=Object.fromEntries(untracked.map(f=>[f,sha(read(path.join(root,f)))]));
const api=await botLiveApi(runtime),sessions=await api.rpc('session/list',{_request:{}}),bots=await api.json('/naumi/bots'),tasks=await api.json('/naumi/bot-tasks'),models=sha(JSON.stringify(await api.json('/naumi/model-connections')));
assert(!sessions.items.some(s=>s.running),'RUNNING_SESSIONS');assert(!tasks.tasks.some(t=>['queued','starting','running','waiting'].includes(t.status)),'ACTIVE_TASKS');
const groupRows=()=>{const db=new DatabaseSync(path.join(runtime,'.dsh/naumi/bot-groups.sqlite'),{readOnly:true});try{const rows=Object.fromEntries(['rooms','members','posts','replies','post_context'].map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));assert(!rows.replies.some(r=>['queued','starting','sent'].includes(r.state)),'GROUP_BUSY');return sha(JSON.stringify(rows));}finally{db.close();}};
const groupsBefore=groupRows(),employees=async api=>Object.fromEntries(await Promise.all(bots.bots.map(async b=>{const {exportedAt,...v}=await api.json('/naumi/employees?view=export&botId='+encodeURIComponent(b.id));return[b.id,sha(JSON.stringify(v))];}))),employeesBefore=await employees(api);
const protectedPaths=['.dsh/.credentials.yaml','.dsh/cordis.patch.yml','.dsh/profiles/web/package.json','.dsh/profiles/web/cordis.yml','.dsh/profiles/web/cordis.patch.yml','.dsh/naumi/bots.json','.dsh/naumi/bot-tasks.json','config/local.json','node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'];
for(const f of fs.readdirSync(path.join(runtime,'.dsh/sessions'),{recursive:true}))if(f.endsWith('.jsonl.zstd'))protectedPaths.push('.dsh/sessions/'+f);
const protectedBefore=Object.fromEntries(protectedPaths.filter(f=>fs.existsSync(path.join(runtime,f))).map(f=>[f,sha(read(path.join(runtime,f)))]));
const shell=name=>{const r=spawnSync('D:/DEV/PowerShell/pwsh.exe',['-NoProfile','-File',path.join(runtime,name)],{windowsHide:true,stdio:'ignore',timeout:150000});assert.equal(r.status,0,'SERVICE_COMMAND '+name);};
const atomic=(p,bytes)=>{fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,p);};let complete=false;
try{
 shell('Stop-Naumi.ps1');for(const[f,h]of Object.entries(protectedBefore))assert.equal(sha(read(path.join(runtime,f))),h,'PRELOAD_DATA_DRIFT '+f);
 for(const r of rows){const p=path.join(installed,r.file);if(r.beforeSHA256)assert.equal(sha(read(p)),r.beforeSHA256,'PRELOAD_RUNTIME_DRIFT');else assert(!fs.existsSync(p));}
 for(const r of rows)atomic(path.join(installed,r.file),read(path.join(backup,'after',r.file)));shell('Start-Naumi.ps1');
 const loaded=await botLiveApi(runtime),afterSessions=await loaded.rpc('session/list',{_request:{}});assert(!afterSessions.items.some(s=>s.running));assert.equal(afterSessions.items.length,sessions.items.length);
 for(const f of ['primary-bot.js','primary-bot.css'])assert.equal((await loaded.request('/naumi/assets/'+f)).status,200);
 assert.deepEqual(await loaded.json('/naumi/bots'),bots);assert.deepEqual(await loaded.json('/naumi/bot-tasks'),tasks);assert.equal(sha(JSON.stringify(await loaded.json('/naumi/model-connections'))),models);assert.deepEqual(await employees(loaded),employeesBefore);assert.equal(groupRows(),groupsBefore);
 const after=inventory();for(const r of rows)assert.equal(after[r.file],r.afterSHA256);for(const[f,h]of Object.entries(original))if(!files.includes(f))assert.equal(after[f],h,'UNRELATED_RUNTIME '+f);
 for(const[f,h]of Object.entries(protectedBefore))assert.equal(sha(read(path.join(runtime,f))),h,'PROTECTED_DATA '+f);for(const[f,h]of Object.entries(untrackedHashes))assert.equal(sha(read(path.join(root,f))),h,'OTHER_EVIDENCE '+f);
 fs.writeFileSync(path.join(out,'DEPLOYMENT.json'),JSON.stringify({status:'PASS',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files:rows,backup,http:200,sessions:afterSessions.items.length,running:0,bots:bots.bots.length,revision:bots.revision,automaticPrimarySelection:false,modelCalls:0,modelGroupsUnchanged:true,employeeExportsUnchanged:true,taskAndGroupRowsUnchanged:true,protectedFilesUnchanged:Object.keys(protectedBefore).length,unrelatedRuntimeUnchanged:Object.keys(original).filter(f=>!files.includes(f)).length,otherUntrackedFilesPreserved:untracked.length,nativeComposerUnchanged:true,packageUnchanged:true},null,2)+'\n');
 complete=true;console.log('PRIMARY_LOADED files=11 http=200 running=0 models=UNCHANGED employees=UNCHANGED tasks=UNCHANGED groups=UNCHANGED primary=AWAIT_USER model_calls=0');
}finally{if(!complete){
 const dataFile=path.join(runtime,'.dsh/naumi/bots.json'),expected=protectedBefore['.dsh/naumi/bots.json'];
 if(expected&&sha(read(dataFile))!==expected)console.error('PRIMARY_LOAD_INCOMPLETE new_directory_metadata=RETAINED compatible_reader=RETAINED backup='+backup);
 else{try{shell('Stop-Naumi.ps1');}catch{}for(const r of rows){const p=path.join(installed,r.file);if(r.beforeSHA256)atomic(p,read(path.join(backup,'before',r.file)));else if(fs.existsSync(p))fs.unlinkSync(p);}shell('Start-Naumi.ps1');console.error('PRIMARY_LOAD_FAILED runtime=RESTORED backup='+backup);}
}}
