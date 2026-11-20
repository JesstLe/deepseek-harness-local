import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Context} from '@deepseek-ai/cordis';
import * as pi from '@deepseek-ai/dsh-llm-pi-ai';
import {modelPolicyPlan,ModelPolicy,modelPolicyBackup,installModelPolicy,MODEL_POLICY_REVISION,LUNA_TERRA_PROVIDER} from '../plugins/naumi-enterprise/model-policy.js';
import {ModelConnections} from '../plugins/naumi-enterprise/model-connections.js';

const source=()=>({
 'ccs-deepseek-992333':{api:'anthropic-messages',baseURL:'https://flash.example',apiKeyEnv:'FLASH',models:[{id:'deepseek-flash',contextWindow:1000000,maxTokens:16384},{id:'old-flash'}]},
 'ccs-provider-8c7ab447-51aed7':{api:'anthropic-messages',baseURL:'https://luna.example',apiKeyEnv:'LUNA',headers:{'x-fixture':'keep'},models:[{id:'gpt-6-luna',contextWindow:938384,maxTokens:16384,compat:{supportsTemperature:false}},{id:'gpt-other'}]},
 duplicate:{api:'anthropic-messages',baseURL:'https://other.example',apiKeyEnv:'OTHER',models:[{id:'gpt-6-luna'}]},
 removed:{api:'openai-completions',baseURL:'https://removed.example',apiKeyEnv:'UNCHANGED',models:[{id:'old-model'}]},
});
function fixture(){
 let providers=source(),revision=0,selection={provider:'removed',model:'old-model'},saves=0,writes=0;const backups=[];
 const f={failWrite:false,failBackup:false,failDefault:false,keyMissing:false,readonly:false};
 const ctx={settings:{get writable(){return !f.readonly;},describe:()=>[{ns:'llm-pi-ai',revision,value:{providers:structuredClone(providers)},user:{providers:structuredClone(providers)}}],async mutate(ns,ops,expected){assert.equal(ns,'llm-pi-ai');assert.equal(expected,revision);if(f.failWrite)throw Error('failed disk write');for(const op of ops){if(op.path.length===1)providers=structuredClone(op.value);else if(op.op==='unset')delete providers[op.path[1]];else providers[op.path[1]]=structuredClone(op.value);}revision++;writes++;if(f.corruptWrite&&writes===1)providers['ccs-deepseek-992333'].models[0].name='immutable overlay';}},credentials:{describe:async()=>({configured:!f.keyMissing})},agentDefaultModel:{currentSelection:()=>selection,saveSelection:async next=>{if(f.failDefault)throw Error('default failure');selection=next;saves++;}}};
 const service=new ModelPolicy(ctx,{backup:async value=>{if(f.failBackup)throw Error('backup failed');backups.push(structuredClone(value));}});
 return Object.assign(f,{ctx,service,backups,getProviders:()=>providers,changeProviders:v=>{providers=v;},getSelection:()=>selection,counters:()=>({writes,saves,revision})});
}
test('exact IDs, three display choices and explicit vision preserve endpoints, keys, budgets and compat',()=>{
 const p=source(),before=structuredClone(p),plan=modelPolicyPlan(p);assert.deepEqual(p,before);
 assert.deepEqual(Object.keys(plan.providers),['ccs-deepseek-992333','ccs-provider-8c7ab447-51aed7',LUNA_TERRA_PROVIDER]);
 assert.deepEqual(Object.values(plan.providers).flatMap(p=>p.models.map(m=>[m.id,m.name,m.input])),[['deepseek-flash','claude fable5.2',['text','image']],['gpt-6-luna','gpt6.1sol',['text','image']],['gpt-6-luna','gpt6.1terra',['text','image']]]);
 for(const[id,p]of Object.entries(plan.providers)){const original=before[id===LUNA_TERRA_PROVIDER?'ccs-provider-8c7ab447-51aed7':id];assert.equal(p.baseURL,original.baseURL);assert.equal(p.apiKeyEnv,original.apiKeyEnv);assert.equal(p.models[0].maxTokens,original.models[0].maxTokens);}
 assert.deepEqual(plan.providers['ccs-provider-8c7ab447-51aed7'].headers,{'x-fixture':'keep'});
});
test('similar Flash names do not qualify and missing sources never produce placeholders',()=>{
 const p=source();p['ccs-deepseek-992333'].models=[{id:'deepseek-v4.1-flash-1017'}];assert.throws(()=>modelPolicyPlan(p),e=>e.code==='MODEL_POLICY_SOURCE_REQUIRED'&&e.missing.includes('deepseek-flash'));
 assert.throws(()=>modelPolicyPlan({}),/MODEL_POLICY_SOURCE_REQUIRED/);
});
test('both exact models on one endpoint stay on one credential reference',()=>{
 const p=source();p['ccs-deepseek-992333'].models.push(p['ccs-provider-8c7ab447-51aed7'].models[0]);delete p['ccs-provider-8c7ab447-51aed7'];delete p.duplicate;const v=modelPolicyPlan(p);assert.equal(Object.keys(v.providers).length,2);assert.equal(Object.values(v.providers)[0].models.length,2);assert.equal(v.providers[LUNA_TERRA_PROVIDER].apiKeyEnv,'FLASH');
});
test('invalid endpoints/protocols/ref reject before migration',()=>{
 for(const change of[{api:'invented'},{apiKeyEnv:null},{baseURL:'https://user:secret@example.com'},{baseURL:'file:///tmp/key'}]){const p=source();Object.assign(p['ccs-deepseek-992333'],change);assert.throws(()=>modelPolicyPlan(p),/MODEL_POLICY_SOURCE_INVALID/);}
});
test('one settings CAS persists only selected providers; backup precedes write, defaults and Session selections remap',async()=>{
 const f=fixture();await f.service.apply();assert.equal(f.backups.length,1);assert.equal(f.backups[0].providers.removed.apiKeyEnv,'UNCHANGED');assert.equal(f.counters().writes,1);
 assert.deepEqual(f.getSelection(),{provider:'ccs-deepseek-992333',model:'deepseek-flash'});
 let next;f.service.select({model:{current:()=>({provider:'duplicate',model:'gpt-6-luna'}),select:s=>{next=s;}}});assert.deepEqual(next,{provider:'ccs-provider-8c7ab447-51aed7',model:'gpt-6-luna'});
 assert.throws(()=>f.service.assert({provider:'removed',model:'old-model'}),/MODEL_POLICY_MODEL_DENIED/);
 f.service.assert(next);
});
test('repeated startup is idempotent and does not rewrite backup, credentials or default',async()=>{
 const f=fixture();await f.service.apply();await f.service.apply();assert.deepEqual(f.counters(),{writes:1,saves:1,revision:1});assert.equal(f.backups.length,1);
});
test('Terra is an independent native selection sharing Sol credentials and preserves a saved Terra choice',async()=>{
 const f=fixture();await f.service.apply();const p=f.getProviders();assert.equal(p[LUNA_TERRA_PROVIDER].apiKeyEnv,p['ccs-provider-8c7ab447-51aed7'].apiKeyEnv);assert.equal(p[LUNA_TERRA_PROVIDER].baseURL,p['ccs-provider-8c7ab447-51aed7'].baseURL);
 const selection={provider:LUNA_TERRA_PROVIDER,model:'gpt-6-luna'};f.service.assert(selection);let writes=0;f.service.select({model:{current:()=>selection,select:()=>writes++}});assert.equal(writes,0);
});
test('reserved Terra route collisions refuse rather than overwrite another endpoint or key',()=>{
 for(const extra of[{...source()['ccs-provider-8c7ab447-51aed7'],baseURL:'https://foreign.example'},{...source()['ccs-provider-8c7ab447-51aed7'],apiKeyEnv:'FOREIGN'},{...source()['ccs-provider-8c7ab447-51aed7'],models:[{id:'other-model'}]}]){const p=source();p[LUNA_TERRA_PROVIDER]=extra;assert.throws(()=>modelPolicyPlan(p),/MODEL_POLICY_ALIAS_ROUTE_COLLISION/);}
});
test('missing keys, read-only settings, backup failures and failed CAS never remove old providers',async()=>{
 for(const field of['keyMissing','readonly','failBackup','failWrite']){const f=fixture(),before=structuredClone(f.getProviders());f[field]=true;await assert.rejects(f.service.apply());assert.deepEqual(f.getProviders(),before);assert.equal(f.service.state.ready,false);assert.throws(()=>f.service.assert({provider:'removed',model:'old-model'}));}
});
test('default-selection failure is reported after durable policy; repeat repairs it',async()=>{
 const f=fixture();f.failDefault=true;const v=await f.service.apply();assert.equal(v.defaultPending,true);assert.equal(f.counters().writes,1);f.failDefault=false;await f.service.apply();assert.equal(f.service.state.defaultPending,false);assert.equal(f.counters().writes,1);
});
test('post-write validation failure restores the original config through a second guarded CAS',async()=>{const f=fixture(),before=structuredClone(f.getProviders());f.corruptWrite=true;await assert.rejects(f.service.apply(),/MODEL_POLICY_NOT_APPLIED/);assert.deepEqual(f.getProviders(),before);assert.equal(f.counters().writes,2);assert.equal(f.service.state.ready,false);});
test('post-migration owner settings drift denies dispatch rather than admitting a changed endpoint',async()=>{
 const f=fixture();await f.service.apply();f.getProviders()['ccs-deepseek-992333'].baseURL='https://changed.example';assert.throws(()=>f.service.assert(f.getSelection()),/MODEL_POLICY_CONFIGURATION_CHANGED/);
});
test('existing model configuration API becomes read-only only when policy service is mounted',async()=>{
 const f=fixture();await f.service.apply();f.ctx.get=key=>key==='naumiModelPolicy'?f.service:undefined;
 const service=new ModelConnections(f.ctx),value=await service.read();assert.equal(value.writable,false);assert.equal(value.managedPolicy.ready,true);
 await assert.rejects(service.execute({}),e=>e.code==='MODEL_POLICY_MANAGED'&&e.status===403);
});
test('backup is durable/idempotent and modified backup refuses before overwrite',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-policy-'));try{const save=modelPolicyBackup(dir),value={providers:source(),policy:MODEL_POLICY_REVISION};await save(value);await save(value);const folder=path.join(dir,'model-policy-backups'),files=fs.readdirSync(folder);assert.equal(files.length,1);const file=path.join(folder,files[0]);assert.deepEqual(JSON.parse(fs.readFileSync(file)),value);fs.writeFileSync(file,'later edit');await assert.rejects(save(value),/MODEL_POLICY_BACKUP_DRIFT/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('ordinary development hosts are unaffected when distributed mode is disabled',()=>{assert.equal(installModelPolicy({inject(){throw Error('not expected');}},{enabled:false,home:'unused'}),undefined);});
test('distributed host hooks gate real dispatch, remap restored agents, and never dispatch an old model',async()=>{
 const f=fixture(),events=new Map(),services=new Map(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-policy-host-'));let selected;
 const agent={model:{current:()=>({provider:'removed',model:'old-model'}),select:v=>{selected=v;}}};
 const scope={...f.ctx,agents:{list:()=>[agent]},provide:(k,v)=>services.set(k,v),on:(k,v)=>events.set(k,v)};
 try{installModelPolicy({inject:(_deps,fn)=>fn(scope)},{enabled:true,home:dir});await events.get('ready')();assert.equal(services.get('naumiModelPolicy').state.ready,true);assert.equal(selected.model,'deepseek-flash');let dispatch=0;const next=async function*(){dispatch++;yield{type:'fixture'};};const run=async opts=>{const out=[];for await(const c of events.get('llm/stream')(opts,next))out.push(c);return out;};await assert.rejects(run({provider:'removed',model:'old-model'}));assert.equal(dispatch,0);await run(selected);assert.equal(dispatch,1);await events.get('agent/created')({agent});assert.equal(selected.model,'deepseek-flash');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native pi-ai sees three visual options backed by two real model IDs with aliases, retaining actual wire IDs; network calls=0',async()=>{
 const ctx=new Context();let adapter;const h=ctx.plugin({apply(s){s.provide('llm',{registerConfigurableProviders:()=>({replace(){}}),registerModelDiscovery:()=>()=>{},registerAdapter:(_r,a)=>{adapter=a;return{replace(){}};}});s.provide('credentials',{resolve:async()=>({value:'fixture-only'})});}});await h;let p;
 try{p=ctx.plugin(pi,{providers:modelPolicyPlan(source()).providers});await p;for(const [provider,id,name]of[['ccs-deepseek-992333','deepseek-flash','claude fable5.2'],['ccs-provider-8c7ab447-51aed7','gpt-6-luna','gpt6.1sol'],[LUNA_TERRA_PROVIDER,'gpt-6-luna','gpt6.1terra']]){const m=await adapter.resolveModel(provider,id);assert.equal(m.id,id);assert.equal(m.name,name);assert.deepEqual(m.inputModalities,['text','image']);}}finally{await p?.dispose();await h.dispose();}
});

test('real native Anthropic serialization sends gpt-6-luna for both Sol and Terra, never either display alias',async()=>{
 const requests=[];const server=http.createServer(async(req,res)=>{
  const parts=[];for await(const c of req)parts.push(c);const body=JSON.parse(Buffer.concat(parts));requests.push({path:req.url,model:body.model,key:req.headers['x-api-key']});
  res.writeHead(200,{'content-type':'text/event-stream'});
  const event=(type,value)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n');
  event('message_start',{message:{id:'fixture',type:'message',role:'assistant',content:[],model:'gpt-6-luna',usage:{input_tokens:5,output_tokens:0}}});
  event('content_block_start',{index:0,content_block:{type:'text',text:''}});event('content_block_delta',{index:0,delta:{type:'text_delta',text:'ok'}});event('content_block_stop',{index:0});event('message_delta',{delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:1}});event('message_stop',{});res.end();
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const ctx=new Context();let adapter;const host=ctx.plugin({apply(s){s.provide('llm',{registerConfigurableProviders:()=>({replace(){}}),registerModelDiscovery:()=>()=>{},registerAdapter:(_r,a)=>{adapter=a;return{replace(){}};}});s.provide('credentials',{resolve:async()=>({value:'fixture-shared-luna-key'})});}});await host;let plugin;
 try{const p=source();p['ccs-provider-8c7ab447-51aed7'].baseURL='http://127.0.0.1:'+server.address().port;plugin=ctx.plugin(pi,{providers:modelPolicyPlan(p).providers});await plugin;
  for(const provider of['ccs-provider-8c7ab447-51aed7',LUNA_TERRA_PROVIDER]){const chunks=[];for await(const c of adapter.stream({provider,model:'gpt-6-luna',messages:[{role:'user',content:[{type:'text',text:'fixture'}]}],maxTokens:8,signal:AbortSignal.timeout(8000)}))chunks.push(c);assert(chunks.some(c=>c.type==='finish'&&c.reason.kind==='stop'));}
  assert.equal(requests.length,2);assert(requests.every(r=>r.model==='gpt-6-luna'&&r.key==='fixture-shared-luna-key'));assert(requests.every(r=>!JSON.stringify(r).includes('gpt6.1sol')&&!JSON.stringify(r).includes('gpt6.1terra')));
 }finally{await plugin?.dispose();await host.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('optional Claude route preserves real Sonnet ID, custom display name and existing three choices',()=>{const p=source();p['tdh-claude55']={api:'anthropic-messages',baseURL:'https://fixture.invalid/cpa',apiKeyEnv:'CLAUDE_FIXTURE',models:[{id:'claude-sonnet-5-5',input:['text'],maxTokens:16384}]};const plan=modelPolicyPlan(p);assert.equal(Object.values(plan.providers).flatMap(v=>v.models).length,4);const m=plan.providers['tdh-claude55'].models[0];assert.equal(m.id,'claude-sonnet-5-5');assert.equal(m.name,'claude opus5.5');assert.deepEqual(m.input,['text']);assert.equal(plan.providers['tdh-claude55'].apiKeyEnv,'CLAUDE_FIXTURE');assert.equal(modelPolicyPlan(source()).missing.length,0);});
