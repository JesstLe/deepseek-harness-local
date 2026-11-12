import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parse, stringify } from 'yaml';
const root=process.cwd(), priv=path.join(root,'.dsh/import-ccswitch');
let routes=JSON.parse(fs.readFileSync(path.join(priv,'accepted.json'),'utf8'));
const extras=process.argv.includes('--extras');
if(extras) {
  const candidates=JSON.parse(fs.readFileSync(path.join(priv,'candidates.json'),'utf8'));
  routes=candidates.filter(r=>r.models.some(m=>m.id.endsWith('[1M]'))||r.api==='openai-responses'&&r.baseURL.startsWith('http://192.168.'));
  routes=routes.map(r=>({...r,models:r.models.filter(m=>m.id.endsWith('[1M]')||r.baseURL.startsWith('http://192.168.')).map(m=>({...m,...m.id.endsWith('[1M]')?{name:m.id,contextWindow:1000000}:{},id:m.id.replace(/\[1M\]$/,'' )}))}));
}
const providers=parse(fs.readFileSync('.dsh/profiles/web/cordis.patch.yml','utf8')).find(x=>x.id==='llm-pi-ai').config.providers;
const retry=process.argv.includes('--retry-failed');
const previous=retry?JSON.parse(fs.readFileSync('evidence/ccswitch/runtime-probes.json','utf8')):[];
if(retry)fs.copyFileSync('evidence/ccswitch/runtime-probes.json','evidence/ccswitch/runtime-probes.initial.json');
const jobs=routes.flatMap(route=>route.models.map(model=>({route,model}))).filter(({route,model})=>!retry||previous.some(r=>r.group===route.id&&r.model===model.id&&!r.valid));
const results=previous.filter(r=>r.valid);
const retried=jobs.length;
async function worker() {
  for(let job;(job=jobs.shift());) {
    const {route,model}=job;
    const overlay=path.join(priv,`probe-${route.id}-${model.id.replaceAll(/[^a-zA-Z0-9-]/g,'_')}.yml`);
    const config=structuredClone(providers[route.id]??{displayName:route.name,api:route.api,baseURL:route.baseURL,apiKeyEnv:'CCS_'+route.id.toUpperCase().replaceAll('-','_')+'_API_KEY'});
    config.models=[{...model,maxTokens:retry||extras?4096:512}];
    fs.writeFileSync(overlay,stringify([
      {id:'llm-pi-ai',config:{providers:{[route.id]:config}}},
      {id:'agent-default-model',config:{provider:route.id,model:model.id}},
    ]));
    const env={...process.env,DSH_HOME:path.join(root,'.dsh'),DSH_TELEMETRY_MODE:'DISABLED',[config.apiKeyEnv]:route.key};
    const result=await new Promise(resolve=>{
      const child=spawn(process.execPath,['node_modules/@deepseek-ai/dsh/lib/bin.js','--profile','headless','--patch',overlay,'Reply exactly OK. Do not use tools or perform any other action.'],{cwd:root,env,windowsHide:true});
      let stdout='',stderr='';
      child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);
      const timeout=setTimeout(()=>child.kill(),75000);
      child.on('close',(code,signal)=>{clearTimeout(timeout);resolve({group:route.id,model:model.id,exit:code,signal,valid:code===0&&/\bOK\b/.test(stdout),output:stdout.trim().slice(-300),error:code===0?undefined:stderr.trim().slice(-900)});});
    });
    for(const route of routes) for(const key of ['output','error']) if(result[key]) result[key]=result[key].replaceAll(route.key,'[REDACTED]');
    results.push(result);fs.writeFileSync('evidence/ccswitch/'+(extras?'runtime-extras.json':'runtime-probes.json'),JSON.stringify(results,null,2)+'\n');
    console.log(JSON.stringify(result));
  }
}
await Promise.all([worker(),worker()]);
console.log(`HARNESS_RUNTIME tested=${results.length} valid=${results.filter(r=>r.valid).length} failed=${results.filter(r=>!r.valid).length}`);
if(retry)console.log(`TARGETED_RECHECK models=${retried} output_budget=4096`);
if(extras) {
  const accepted=JSON.parse(fs.readFileSync(path.join(priv,'accepted.json'),'utf8'));
  for(const route of routes) {
    const valid=new Set(results.filter(r=>r.group===route.id&&r.valid).map(r=>r.model));
    if(!valid.size)continue;
    let target=accepted.find(r=>r.id===route.id);
    if(!target){target={...route,models:[]};accepted.push(target);}
    for(const m of route.models)if(valid.has(m.id)&&!target.models.some(v=>v.id===m.id))target.models.push(m);
  }
  fs.writeFileSync(path.join(priv,'accepted.json'),JSON.stringify(accepted,null,2)+'\n');
}
if(results.some(r=>!r.valid))process.exitCode=1;
