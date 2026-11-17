import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';import {randomUUID,createHash} from 'node:crypto';
import {botLiveApi} from './bot-live-api.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),norm=b=>b.toString().replaceAll('\r\n','\n');
const baseline='ea0235b637cfd7ddf290b3daa7d16bc5fad5eb09',upstream='b4b0bd4730ea5204553510b8d56654cbacc29f61';
export const syncFiles=['assets/bot-groups.css','assets/bot-groups.js','bot-deliverables.js','bot-group-service.js','bot-group-store.js','bot-groups.js','bot-task-handoff.js','bot-task-runtime.js','bot-task-service.js','bot-task-store.js','bot-tasks.js','bots.js','client.js','host.js','package.json'];
export function runtimeDelta(file,actual,desired){
  if(!actual)return desired;
  if(file==='package.json'){
    const p=JSON.parse(actual),q=JSON.parse(desired),old=JSON.parse(execFileSync('git',['show',baseline+':plugins/naumi-enterprise/package.json']));
    for(const f of q.files.filter(f=>!old.files.includes(f)))if(!p.files.includes(f))p.files.push(f);
    return Buffer.from(JSON.stringify(p,null,2)+'\n');
  }
  if(['host.js','client.js'].includes(file)){
    const old=execFileSync('git',['show',baseline+':plugins/naumi-enterprise/'+file]);
    // Only apply the group registration delta; retain deployed identity/model/
    // employee/native-shell differences rather than replacing shared entrypoints.
    let text=norm(actual);
    const replace=(from,to)=>{assert.equal(text.split(from).length,2,'DELTA_ANCHOR_CHANGED '+file);text=text.replace(from,to);};
    if(file==='host.js'){
      const anchor="  assets.set('employee-experience-model.js'";
      replace(anchor,"  assets.set('bot-groups.js','text/javascript; charset=utf-8');\n  assets.set('bot-groups.css','text/css; charset=utf-8');\n"+anchor);
      const anchor2="    table.push({kind:'html',placement:'head',html:'<link rel=\"stylesheet\" href=\"/naumi/assets/style.css\">";
      replace(anchor2,"    table.push({kind:'html',placement:'head',html:'<link rel=\"stylesheet\" href=\"/naumi/assets/bot-groups.css\">'});\n"+anchor2);
    }else{
      replace("['naumi-connections','系统连接','link']","['naumi-bot-groups','Bot 群聊','chat'],['naumi-connections','系统连接','link']");
      const desiredText=norm(desired),start=desiredText.indexOf('    const BotGroups='),end=desiredText.indexOf('    installNaumiContextUI',start);assert(start>=0&&end>start);
      replace("    installNaumiContextUI(ctx,React,require('react-dom').createPortal,Icon);",desiredText.slice(start,end)+"    installNaumiContextUI(ctx,React,require('react-dom').createPortal,Icon);");
      const oldLine="      for(const [id]of PANELS)yield ctx.slots.register({name:'main',key:id},()=>h(Page,{page:id}));";
      const a=desiredText.indexOf("      for(const [id]of PANELS)yield"),b=desiredText.indexOf("\n      yield ctx.slots.inject",a);assert(a>=0&&b>a);replace(oldLine,desiredText.slice(a,b));
    }
    assert(!norm(old).includes("assets.set('bot-groups.js'"));return Buffer.from(text);
  }
  const old=execFileSync('git',['show',baseline+':plugins/naumi-enterprise/'+file]);assert.equal(norm(actual),norm(old),'UNEXPECTED_RUNTIME_DRIFT '+file);return desired;
}

async function main(){
 const mode=process.argv[2]??'prepare',runtime=path.resolve(process.argv[3]??process.cwd()),e=path.resolve('evidence/remote-sync');
 const installed=path.join(runtime,'.dsh/profiles/web/node_modules/@naumi/dsh-enterprise');assert(fs.realpathSync(installed).startsWith(fs.realpathSync(runtime)+path.sep));
 const backup=path.join(runtime,'runtime/remote-sync-'+randomUUID());fs.mkdirSync(path.join(backup,'before'),{recursive:true});fs.mkdirSync(path.join(backup,'after'),{recursive:true});
 const inventory=()=>Object.fromEntries(fs.readdirSync(installed,{recursive:true}).filter(f=>fs.statSync(path.join(installed,f)).isFile()).map(f=>[f.replaceAll('\\','/'),sha(fs.readFileSync(path.join(installed,f)))]));
 const original=inventory(),rows=[];
 for(const f of syncFiles){const src=path.resolve('plugins/naumi-enterprise',f),dest=path.join(installed,f),before=fs.existsSync(dest)?fs.readFileSync(dest):null,next=runtimeDelta(f,before,fs.readFileSync(src));
   for(const[k,b]of [['before',before],['after',next]])if(b){const p=path.join(backup,k,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);}
   rows.push({file:f,beforeSHA256:before?sha(before):null,afterSHA256:sha(next)});
 }
 fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({baseline,upstream,rows,original},null,2)+'\n');
 if(mode==='prepare'){console.log('PREPARE files=15 shared_entrypoints=DELTA_ONLY backup='+backup);return;}
 assert.equal(mode,'apply');assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'main');assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}),'','DIRTY_MAIN');
 const api=await botLiveApi(runtime),models=await api.json('/naumi/model-connections'),bots=await api.json('/naumi/bots'),tasks=await api.json('/naumi/bot-tasks');assert(!tasks.tasks.some(t=>['queued','starting','running','waiting'].includes(t.status)),'TASKS_NOT_QUIESCENT');
 const employees=async api=>{const out={};for(const b of bots.bots){const {exportedAt,...data}=await api.json('/naumi/employees?view=export&botId='+encodeURIComponent(b.id));out[b.id]=sha(JSON.stringify(data));}return out;},employeeBefore=await employees(api);
 const protectedFiles=['.dsh/.credentials.yaml','.dsh/cordis.patch.yml','.dsh/profiles/web/cordis.yml','.dsh/profiles/web/cordis.patch.yml','.dsh/naumi/bots.json','.dsh/naumi/bot-tasks.json','config/local.json'];
 for(const f of fs.readdirSync(path.join(runtime,'.dsh/sessions'),{recursive:true}))if(f.endsWith('.jsonl.zstd'))protectedFiles.push('.dsh/sessions/'+f);
 const protectedBefore=Object.fromEntries(protectedFiles.filter(f=>fs.existsSync(path.join(runtime,f))).map(f=>[f,sha(fs.readFileSync(path.join(runtime,f)))]));
 const shell=f=>{const r=spawnSync('D:/DEV/PowerShell/pwsh.exe',['-NoProfile','-File',path.join(runtime,f)],{stdio:'ignore',windowsHide:true,timeout:150000});assert.equal(r.status,0,'SERVICE_COMMAND_FAILED '+f);};
 execFileSync(process.execPath,['scripts/check-bot-runtime.mjs',runtime,'2'],{stdio:'inherit'});let complete=false;
 try{
  shell('Stop-Naumi.ps1');
  for(const[f,h]of Object.entries(protectedBefore))assert.equal(sha(fs.readFileSync(path.join(runtime,f))),h,'DATA_CHANGED_BEFORE_LOAD '+f);
  for(const r of rows){const dest=path.join(installed,r.file);if(r.beforeSHA256)assert.equal(sha(fs.readFileSync(dest)),r.beforeSHA256);else assert(!fs.existsSync(dest));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(backup,'after',r.file),dest);}
  shell('Start-Naumi.ps1');const loaded=await botLiveApi(runtime),groupResponse=await loaded.request('/naumi/bot-groups');assert.equal(groupResponse.status,200,'GROUPS_ROUTE_NOT_READY');const groups=await groupResponse.json();assert(Array.isArray(groups.rooms));
  for(const f of ['bot-groups.js','bot-groups.css'])assert.equal((await loaded.request('/naumi/assets/'+f)).status,200);
  const after=inventory();for(const r of rows)assert.equal(after[r.file],r.afterSHA256);for(const[f,h]of Object.entries(original))if(!syncFiles.includes(f))assert.equal(after[f],h,'UNRELATED_RUNTIME_CHANGED '+f);
  for(const[f,h]of Object.entries(protectedBefore))assert.equal(sha(fs.readFileSync(path.join(runtime,f))),h,'PROTECTED_DATA_CHANGED '+f);
  assert.deepEqual(await loaded.json('/naumi/model-connections'),models);assert.deepEqual(await loaded.json('/naumi/bots'),bots);assert.deepEqual(await loaded.json('/naumi/bot-tasks'),tasks);assert.deepEqual(await employees(loaded),employeeBefore);
  const receipt={status:'PASS',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),upstream,files:rows,backup,unrelatedFilesUnchanged:Object.keys(original).filter(f=>!syncFiles.includes(f)).length,protectedFilesUnchanged:Object.keys(protectedBefore).length,modelGroupsUnchanged:models.groups.length,employeeExportsUnchanged:bots.bots.length,tasksUnchanged:true,groups:groups.rooms.length,modelCalls:0,http:200};
  fs.writeFileSync(path.join(e,'DEPLOYMENT.json'),JSON.stringify(receipt,null,2)+'\n');complete=true;
  console.log('SYNC_LOAD files=15 groups_http=200 group_assets=200 handoff=INSTALLED models=UNCHANGED employees=UNCHANGED tasks=UNCHANGED model_calls=0');
 }finally{if(!complete){try{shell('Stop-Naumi.ps1');}catch{}for(const r of rows){const p=path.join(installed,r.file);if(r.beforeSHA256)fs.copyFileSync(path.join(backup,'before',r.file),p);else if(fs.existsSync(p))fs.unlinkSync(p);}shell('Start-Naumi.ps1');console.error('SYNC_LOAD_FAILED runtime=RESTORED data=RETAINED backup='+backup);}}
}
if(import.meta.url===(await import('node:url')).pathToFileURL(path.resolve(process.argv[1])).href)await main();
