import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {botLiveApi} from './bot-live-api.mjs';
import {sha} from './repair-bot-task-integrity.mjs';

// Main-only, exact two-file delta. No package, model or UI replacement.
const root=process.cwd(),runtime=path.resolve(process.argv[2]??root),plan=path.resolve(process.argv[3]??'');
assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'main');
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}),'','DIRTY_MAIN');
assert(process.argv[3]&&fs.existsSync(plan),'EXPLICIT_REPAIR_PLAN_REQUIRED');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const base=path.join(runtime,'.dsh/profiles/web/node_modules/@naumi/dsh-enterprise');
assert(fs.realpathSync(base).startsWith(fs.realpathSync(runtime)+path.sep));
const files=['bot-task-service.js','bot-tasks.js'],backup=path.join(runtime,'runtime/bot-task-integrity-'+randomUUID());
fs.mkdirSync(backup,{recursive:true});
const inventory=()=>Object.fromEntries(fs.readdirSync(base,{recursive:true}).filter(f=>fs.statSync(path.join(base,f)).isFile()).map(f=>[f.replaceAll('\\','/'),sha(fs.readFileSync(path.join(base,f)))]));
const original=inventory(),rows=[];
for(const file of files){
  const dest=path.join(base,file),source=path.join(root,'plugins/naumi-enterprise',file),before=fs.readFileSync(dest);
  const known=JSON.parse(fs.readFileSync(path.join(root,'evidence/bot-task-integrity/manifest.json'),'utf8')).files.find(r=>r.path==='plugins/naumi-enterprise/'+file);
  const normalized=b=>b.toString().replaceAll('\r\n','\n');
  assert.equal(normalized(before),normalized(fs.readFileSync(path.join(root,'evidence/bot-task-integrity/original',known.path))),'RUNTIME_SOURCE_DRIFT '+file);
  fs.writeFileSync(path.join(backup,file),before);rows.push({file,beforeSHA256:sha(before),afterSHA256:sha(fs.readFileSync(source))});
}
const protectedPaths=['.dsh/.credentials.yaml','.dsh/cordis.patch.yml','.dsh/profiles/web/cordis.yml','.dsh/profiles/web/cordis.patch.yml','.dsh/naumi/bots.json','config/local.json'];
for(const f of fs.readdirSync(path.join(runtime,'.dsh/storages'),{recursive:true}))if(fs.statSync(path.join(runtime,'.dsh/storages',f)).isFile())protectedPaths.push('.dsh/storages/'+f);
const protectedBefore=Object.fromEntries(protectedPaths.filter(f=>fs.existsSync(path.join(runtime,f))).map(f=>[f,sha(fs.readFileSync(path.join(runtime,f)))]));
const api=await botLiveApi(runtime),ledger=await api.json('/naumi/bot-tasks');
const employees=async api=>{const catalog=await api.json('/naumi/bots'),out={};for(const b of catalog.bots){const {exportedAt,...data}=await api.json('/naumi/employees?view=export&botId='+encodeURIComponent(b.id));out[b.id]=sha(JSON.stringify(data));}return out;};
const employeeBefore=await employees(api),modelsBefore=await api.json('/naumi/model-connections');
const businessFile='C:/Users/13357/Documents/deepseek-harness/default-workspace/operations/2026-11-17-new-product-launch-kit.md',businessFileSHA256=sha(fs.readFileSync(businessFile));
assert(!ledger.tasks.some(t=>['queued','starting','running','waiting'].includes(t.status)),'TASKS_NOT_QUIESCENT');
const beforeLedger=fs.readFileSync(path.join(runtime,'.dsh/naumi/bot-tasks.json'));
assert.equal(sha(beforeLedger),JSON.parse(fs.readFileSync(plan,'utf8')).ledgerSHA256,'REPAIR_PLAN_STALE');
const shell=file=>{const r=spawnSync('D:/DEV/PowerShell/pwsh.exe',['-NoProfile','-File',path.join(runtime,file)],{encoding:'utf8',windowsHide:true,timeout:150000});fs.appendFileSync(path.join(backup,'service.private.log'),(r.stdout??'')+(r.stderr??''));assert.equal(r.status,0,'SERVICE_COMMAND_FAILED '+file);};
execFileSync(process.execPath,[path.join(root,'scripts/check-bot-runtime.mjs'),runtime,'2'],{stdio:'inherit'});
let stopped=false,complete=false;
try{
  shell('Stop-Naumi.ps1');stopped=true;
  const repaired=spawnSync(process.execPath,[path.join(root,'scripts/repair-bot-task-integrity.mjs'),runtime,plan,path.join(backup,'repair')],{encoding:'utf8',windowsHide:true});
  process.stdout.write(repaired.stdout??'');assert.equal(repaired.status,0,repaired.stderr);
  for(const file of files)fs.copyFileSync(path.join(root,'plugins/naumi-enterprise',file),path.join(base,file));
  shell('Start-Naumi.ps1');stopped=false;
  const loaded=await botLiveApi(runtime),response=await loaded.request('/naumi/bot-tasks?view=activity');assert.equal(response.status,200);assert.equal(response.headers.get('X-Naumi-Bot-Integrity'),'1');
  const after=inventory();for(const r of rows)assert.equal(after[r.file],r.afterSHA256);for(const[f,h]of Object.entries(original))if(!files.includes(f))assert.equal(after[f],h,'UNRELATED_RUNTIME_CHANGED '+f);
  for(const[f,h]of Object.entries(protectedBefore))assert.equal(sha(fs.readFileSync(path.join(runtime,f))),h,'PROTECTED_DATA_CHANGED '+f);
  assert.deepEqual(await employees(loaded),employeeBefore,'EMPLOYEE_EXPORT_CHANGED');assert.deepEqual(await loaded.json('/naumi/model-connections'),modelsBefore,'MODEL_GROUPS_CHANGED');assert.equal(sha(fs.readFileSync(businessFile)),businessFileSHA256,'BUSINESS_FILE_CHANGED');
  const receipt={status:'PASS',mainCommit:commit,files:rows,unrelatedFilesUnchanged:Object.keys(original).filter(f=>!files.includes(f)).length,protectedFilesUnchanged:Object.keys(protectedBefore).length,employeeExportsUnchanged:Object.keys(employeeBefore).length,modelGroupsUnchanged:modelsBefore.groups.length,businessFileSHA256,http:200,integrity:1,backup,modelCalls:0};
  fs.writeFileSync(path.join(root,'evidence/bot-task-integrity/DEPLOYMENT.json'),JSON.stringify(receipt,null,2)+'\n');complete=true;
  console.log(`DEPLOY integrity=1 files=2 unrelated_changed=0 protected_changed=0 http=200 model_calls=0`);
}finally{
  if(!complete){
    // A validated repaired ledger is deliberately NOT restored to contaminated data.
    if(!stopped){try{shell('Stop-Naumi.ps1');}catch{}}
    for(const f of files)fs.copyFileSync(path.join(backup,f),path.join(base,f));shell('Start-Naumi.ps1');
    console.error('DEPLOY_FAILED source_restored=1 validated_repair_retained=1 backup='+backup);
  }
}
