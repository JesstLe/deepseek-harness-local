import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {botLiveApi} from './bot-live-api.mjs';

const root=process.cwd(),runtime='E:/Workspace/naumi-desktop',mode=process.argv[2]??'prepare',installed=path.join(runtime,'.dsh/profiles/web/node_modules/@naumi/dsh-enterprise'),checkpoint=path.join(runtime,'runtime/im-gateway-deploy.json');
const baseline='d041201',git=(...args)=>execFileSync('git',args,{cwd:root}),hash=b=>createHash('sha256').update(b).digest('hex');
function inventory(){return Object.fromEntries(fs.readdirSync(installed,{recursive:true}).filter(p=>fs.statSync(path.join(installed,p)).isFile()).map(p=>[p.replaceAll('\\','/'),hash(fs.readFileSync(path.join(installed,p)))]));}
function groupRows(){const db=new DatabaseSync(path.join(runtime,'.dsh/naumi/bot-groups.sqlite'),{readOnly:true});try{return Object.fromEntries(['rooms','members','posts','replies','post_context','room_name_operations'].map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));}finally{db.close();}}
async function gate(){const api=await botLiveApi(runtime),sessions=await api.rpc('session/list',{_request:{}}),tasks=await api.json('/naumi/bot-tasks');assert(!sessions.items.some(s=>s.running),'RUNNING_SESSIONS');assert(!tasks.tasks.some(t=>['queued','starting','running','waiting'].includes(t.status)),'ACTIVE_TASKS');const groups=groupRows();assert(!groups.replies.some(r=>['queued','starting','sent'].includes(r.state)),'ACTIVE_GROUP_REPLY');return {api,sessions,tasks,groups};}
if(mode==='prepare'){
 assert.equal(git('branch','--show-current').toString().trim(),'main','MAIN_REQUIRED');const commit=git('rev-parse','HEAD').toString().trim(),before=await gate();
 const dir=path.join(runtime,'runtime/im-gateway-'+randomUUID()),candidate=path.join(dir,'candidate'),plugin=path.join(candidate,'plugins/naumi-enterprise');fs.mkdirSync(plugin,{recursive:true});
 const files=git('diff','--name-only',baseline,'HEAD','--','plugins/naumi-enterprise').toString().trim().split(/\r?\n/).map(p=>p.slice('plugins/naumi-enterprise/'.length));
 for(const file of files){const from=path.join(installed,file);if(fs.existsSync(from)){const dest=path.join(plugin,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(from,dest);}}
 execFileSync('git',['init','--quiet'],{cwd:candidate});
 const patch=path.join(dir,'task-delta.patch');fs.writeFileSync(patch,git('diff','--binary',baseline,'HEAD','--','plugins/naumi-enterprise'));
 execFileSync('git',['apply','--check','--ignore-space-change',patch],{cwd:candidate});execFileSync('git',['apply','--ignore-space-change',patch],{cwd:candidate});
 const rows=files.map(file=>{const old=path.join(installed,file),modified=path.join(plugin,file),bytes=fs.readFileSync(modified),prior=fs.existsSync(old)?fs.readFileSync(old):null;
  for(const [kind,data]of [['before',prior],['after',bytes]])if(data){const target=path.join(dir,kind,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
  if(file.endsWith('.js'))execFileSync(process.execPath,['--check',modified]);return {file,before:prior?hash(prior):null,after:hash(bytes)};
 });
 const protectedPaths=['.dsh/.credentials.yaml','.dsh/cordis.patch.yml','.dsh/profiles/web/package.json','.dsh/profiles/web/cordis.yml','.dsh/profiles/web/cordis.patch.yml','.dsh/naumi/bots.json','.dsh/naumi/bot-tasks.json','config/local.json','node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'];
 const protectedHashes=Object.fromEntries(protectedPaths.filter(p=>fs.existsSync(path.join(runtime,p))).map(p=>[p,hash(fs.readFileSync(path.join(runtime,p)))]));
 const state={commit,baseline,dir,rows,inventory:inventory(),protectedHashes,sessions:before.sessions.items.length,tasks:hash(JSON.stringify(before.tasks)),bots:hash(JSON.stringify(await before.api.json('/naumi/bots'))),models:hash(JSON.stringify(await before.api.json('/naumi/model-connections'))),groups:hash(JSON.stringify(before.groups)),phase:'prepared'};
 fs.writeFileSync(checkpoint,JSON.stringify(state,null,2));console.log(`IM_DEPLOY_PREPARED files=${rows.length} running=0 activeTasks=0 delta=CHECKED`);
}else{
 const state=JSON.parse(fs.readFileSync(checkpoint));git('merge-base','--is-ancestor',state.commit,'HEAD');
 if(mode==='apply'||mode==='restore'){
  assert(!fs.existsSync(path.join(runtime,'runtime/server.pid')),'SERVICE_MUST_BE_STOPPED');
  for(const row of state.rows){const target=path.join(installed,row.file),actual=fs.existsSync(target)?hash(fs.readFileSync(target)):null;assert.equal(actual,mode==='apply'?row.before:row.after,'RUNTIME_CHANGED '+row.file);}
  // All hashes are checked before changing a file. No credentials/ledger/native dependency is copied.
  for(const row of state.rows){const target=path.join(installed,row.file),expected=mode==='apply'?row.after:row.before;if(expected===null){fs.unlinkSync(target);continue;}const from=path.join(state.dir,mode==='apply'?'after':'before',row.file);assert.equal(hash(fs.readFileSync(from)),expected);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(from,target);}
  state.phase=mode==='apply'?'applied':'restored';fs.writeFileSync(checkpoint,JSON.stringify(state,null,2));console.log('IM_DEPLOY_'+state.phase.toUpperCase()+' files='+state.rows.length);
 }else if(mode==='verify'){
  const current=await gate(),now=inventory();for(const row of state.rows)assert.equal(now[row.file],row.after,'TASK_FILE '+row.file);
  let untouched=0;for(const[p,h]of Object.entries(state.inventory))if(!state.rows.some(r=>r.file===p)){assert.equal(now[p],h,'UNRELATED_PLUGIN '+p);untouched++;}
  for(const[p,h]of Object.entries(state.protectedHashes))assert.equal(hash(fs.readFileSync(path.join(runtime,p))),h,'PROTECTED '+p);
  assert.equal(current.sessions.items.length,state.sessions);assert.equal(hash(JSON.stringify(current.tasks)),state.tasks);assert.equal(hash(JSON.stringify(current.groups)),state.groups);assert.equal(hash(JSON.stringify(await current.api.json('/naumi/bots'))),state.bots);assert.equal(hash(JSON.stringify(await current.api.json('/naumi/model-connections'))),state.models);
  const view=await current.api.json('/naumi/im');assert.equal(view.connections.length,0);assert.equal(view.bindings.length,0);assert.equal(view.outbox.length,0);
  for(const file of ['im-settings.js','im-settings.css'])assert.equal((await current.api.request('/naumi/assets/'+file)).status,200);
  const result={status:'PASS',tier:'actual local runtime, no external accounts/model calls',commit:state.commit,files:state.rows.length,untouched,protectedFiles:Object.keys(state.protectedHashes).length,sessions:state.sessions,running:0,activeTasks:0,connections:0,bindings:0,gateways:200,assets:200,backup:state.dir};
  fs.mkdirSync(path.join(root,'evidence/im-gateway'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/im-gateway/DEPLOYMENT.json'),JSON.stringify(result,null,2)+'\n');state.phase='verified';fs.writeFileSync(checkpoint,JSON.stringify(state,null,2));console.log(`IM_LIVE_PASS http=200 assets=200 connections=0 running=0 untouched=${untouched} protected=${result.protectedFiles}`);
 }else throw Error('UNKNOWN_MODE');
}
