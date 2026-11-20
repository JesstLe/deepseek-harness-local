import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {botLiveApi} from './bot-live-api.mjs';
import {ModelPolicy,modelPolicyBackup,modelPolicyPlan} from '../plugins/naumi-enterprise/model-policy.js';

const root=path.resolve(process.env.NAUMI_SOURCE_ROOT??'E:/Workspace/naumi-desktop');
const out=path.resolve(process.env.NAUMI_POLICY_EVIDENCE??'E:/NaumiEvidence/model-config-override-20261120');
const home=path.join(root,'.dsh'),mode=process.argv[2]??'plan';
assert(['plan','apply'].includes(mode));fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const api=await botLiveApi(root);let described=await api.rpc('settings/describe',{});
const ns=()=>described.namespaces.find(n=>n.ns==='llm-pi-ai');
const before=structuredClone(ns());assert(before&&described.writable,'settings must be writable');
const plan=modelPolicyPlan(before.value.providers);
const summary=p=>Object.entries(p).flatMap(([provider,p])=>p.models.map(m=>({provider,id:m.id,name:m.name??m.id,input:m.input??null})));
if(mode==='plan'){
 const result={mode:'plan',groupsBefore:Object.keys(before.value.providers).length,modelsBefore:summary(before.value.providers).length,modelsAfter:summary(plan.providers),operations:plan.ops.map(o=>({op:o.op,path:o.path})),credentialWrites:0,modelCalls:0};
 fs.writeFileSync(path.join(out,'LIVE_PLAN.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}else{
 const lock=fs.openSync(path.join(out,'LIVE_APPLY_STARTED'),'wx');fs.writeFileSync(lock,new Date().toISOString());fs.closeSync(lock);
 const credentialsFile=path.join(home,'.credentials.yaml'),credentialsHash=hash(fs.readFileSync(credentialsFile));
 const protectedFiles=['naumi/bots.json','naumi/bot-tasks.json','naumi/bot-groups.sqlite','naumi/im-gateway.sqlite'];
 const snapshots=Object.fromEntries(protectedFiles.filter(f=>fs.existsSync(path.join(home,f))).map(f=>[f,hash(fs.readFileSync(path.join(home,f)))]));
 const defaultNs=()=>described.namespaces.find(n=>n.ns==='agent-default-model');
 const ctx={settings:{writable:described.writable,describe:()=>described.namespaces,mutate:async(ns,ops,expectedRevision)=>{await api.rpc('settings/mutate',{ns,ops,expectedRevision});described=await api.rpc('settings/describe',{});}},credentials:{describe:async ref=>(await api.rpc('credentials/describe',{refs:[ref]}))[ref]},agentDefaultModel:{currentSelection:()=>defaultNs()?.value??{},saveSelection:async value=>{const d=defaultNs();assert(d,'default namespace missing');await api.rpc('settings/mutate',{ns:d.ns,ops:[{op:'set',path:['provider'],value:value.provider},{op:'set',path:['model'],value:value.model},{op:'unset',path:['reasoningEffort']}],expectedRevision:d.revision});described=await api.rpc('settings/describe',{});}}};
 const service=new ModelPolicy(ctx,{backup:modelPolicyBackup(home)}),result=await service.apply();
 assert(result.ready);assert.equal(modelPolicyPlan(ns().value.providers).ops.length,0);
 const afterCredentials=hash(fs.readFileSync(credentialsFile));assert.equal(afterCredentials,credentialsHash);
 const changedProtected=Object.entries(snapshots).filter(([f,h])=>hash(fs.readFileSync(path.join(home,f)))!==h).map(([f])=>f);
 const catalog=await api.rpc('session/modelCatalog',{});
 const receipt={status:'PASS',checkedAt:new Date().toISOString(),scope:'current connected local service only; not a fleet receipt',groupsBefore:Object.keys(before.value.providers).length,modelsBefore:summary(before.value.providers).length,modelsAfter:summary(ns().value.providers),policy:result,defaultSelection:defaultNs()?.value,credentialFileUnchanged:true,credentialWrites:0,modelCalls:0,restarts:0,changedProtectedFiles:changedProtected,protectedFileNote:'concurrent user activity can change SQLite data; not overwritten or rolled back by this operation',nativeCatalogGroups:catalog.groups?.length??null,productionFleetClientsUpdated:null,backupDirectory:path.join(home,'model-policy-backups')};
 fs.writeFileSync(path.join(out,'LIVE_APPLY.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}
