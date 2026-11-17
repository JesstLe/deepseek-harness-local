import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {botLiveApi} from './bot-live-api.mjs';

const root=process.cwd(),runtime='E:/Workspace/naumi-desktop',installed=path.join(runtime,'.dsh/profiles/web/node_modules/@naumi/dsh-enterprise'),out=path.join(root,'evidence/im-settings-polish'),baseline='2ae583ae00c8d112adc85be84fd38c75f6896ed7';
const files=['assets/im-settings.js','assets/im-settings.css'],sha=b=>createHash('sha256').update(b).digest('hex'),normal=b=>b.toString().replaceAll('\r\n','\n');
const git=(...args)=>execFileSync('git',args,{cwd:root});
const inventory=()=>Object.fromEntries(fs.readdirSync(installed,{recursive:true}).filter(p=>fs.statSync(path.join(installed,p)).isFile()).map(p=>[p.replaceAll('\\','/'),sha(fs.readFileSync(path.join(installed,p)))]));
const checkpoint=path.join(runtime,'runtime/im-settings-polish-deploy.json');
if(process.argv[2]==='restore'){
 const state=JSON.parse(fs.readFileSync(checkpoint));for(const row of state.rows)assert.equal(sha(fs.readFileSync(path.join(installed,row.file))),row.after,'RUNTIME_DRIFT');
 for(const row of state.rows){const bytes=fs.readFileSync(path.join(state.backup,row.file));assert.equal(sha(bytes),row.before);fs.copyFileSync(path.join(state.backup,row.file),path.join(installed,row.file));}
 console.log('IM_POLISH_RUNTIME_ROLLBACK=PASS assets=2 data=UNTOUCHED');
}else{
 assert.equal(git('branch','--show-current').toString().trim(),'main','MAIN_REQUIRED');const commit=git('rev-parse','HEAD').toString().trim();
 const api=await botLiveApi(runtime),beforeView=await api.json('/naumi/im'),beforeInventory=inventory();
 const protectedPaths=['.dsh/.credentials.yaml','.dsh/naumi/bots.json','.dsh/naumi/bot-tasks.json','config/local.json'],protectedHashes=Object.fromEntries(protectedPaths.filter(p=>fs.existsSync(path.join(runtime,p))).map(p=>[p,sha(fs.readFileSync(path.join(runtime,p)))]));
 const backup=path.join(runtime,'runtime/im-settings-polish-'+randomUUID());fs.mkdirSync(backup,{recursive:true});
 const rows=files.map(file=>{const before=fs.readFileSync(path.join(installed,file)),after=fs.readFileSync(path.join(root,'plugins/naumi-enterprise',file)),base=git('show',baseline+':plugins/naumi-enterprise/'+file);
  assert.equal(normal(before),normal(base),'RUNTIME_ASSET_DRIFT '+file);assert.equal(normal(after),normal(git('show',commit+':plugins/naumi-enterprise/'+file)),'UNCOMMITTED_SOURCE '+file);
  const target=path.join(backup,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,before);return {file,before:sha(before),after:sha(after)};
 });
 fs.writeFileSync(checkpoint,JSON.stringify({commit,backup,rows},null,2));
 for(const row of rows){const target=path.join(installed,row.file),temporary=target+'.'+randomUUID()+'.tmp';assert.equal(sha(fs.readFileSync(target)),row.before);fs.writeFileSync(temporary,fs.readFileSync(path.join(root,'plugins/naumi-enterprise',row.file)));fs.renameSync(temporary,target);}
 const current=inventory();let untouched=0;for(const[p,h]of Object.entries(beforeInventory))if(!files.includes(p)){assert.equal(current[p],h,'UNRELATED_RUNTIME '+p);untouched++;}
 for(const[p,h]of Object.entries(protectedHashes))assert.equal(sha(fs.readFileSync(path.join(runtime,p))),h,'DATA_CHANGED '+p);
 for(const row of rows){const response=await api.request('/naumi/'+row.file);assert.equal(response.status,200);assert.equal(normal(Buffer.from(await response.arrayBuffer())),normal(fs.readFileSync(path.join(installed,row.file))));}
 const afterView=await api.json('/naumi/im');assert.equal(beforeView.revision,afterView.revision);assert.deepEqual(beforeView.bindings,afterView.bindings);assert.deepEqual(beforeView.connections,afterView.connections);
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'DEPLOYMENT.json'),JSON.stringify({commit,backup,assets:rows,untouched,protectedFiles:Object.keys(protectedHashes).length,imRevision:afterView.revision,connections:afterView.connections.length,bindings:afterView.bindings.length,restart:false,backendChanges:false},null,2)+'\n');
 console.log(`IM_POLISH_LOADED=PASS assets=2 http=200 untouched=${untouched} protected=${Object.keys(protectedHashes).length} restart=0 im_revision=${afterView.revision}`);
}
