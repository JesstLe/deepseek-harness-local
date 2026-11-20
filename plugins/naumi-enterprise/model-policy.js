import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {LlmError} from '@deepseek-ai/dsh-llm';
import {resolveDshHome} from '@deepseek-ai/dsh-home-paths';
import {ModelConnections} from './model-connections.js';

export const MODEL_POLICY_REVISION='three-options-vision-20261120';
export const LUNA_TERRA_PROVIDER='naumi-luna-terra';
export const MODEL_POLICY_MODELS=Object.freeze([
 Object.freeze({id:'claude-sonnet-5-5',name:'claude opus5.5',preferredProvider:'tdh-claude55',optional:true,input:['text']}),
 Object.freeze({id:'deepseek-flash',name:'claude fable5.2',preferredProvider:'ccs-deepseek-992333'}),
 Object.freeze({id:'gpt-6-luna',name:'gpt6.1sol',preferredProvider:'ccs-provider-8c7ab447-51aed7'}),
 Object.freeze({id:'gpt-6-luna',name:'gpt6.1terra',preferredProvider:'ccs-provider-8c7ab447-51aed7',aliasProvider:LUNA_TERRA_PROVIDER}),
]);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};

/** Select exact wire IDs without copying credentials or mixing endpoints. */
export function modelPolicyPlan(providers,{partial=false,eligible=()=>true}={}){
 const selected={},missing=[];
 for(const rule of MODEL_POLICY_MODELS){
  const candidates=Object.entries(providers??{}).filter(([id,p])=>id!==LUNA_TERRA_PROVIDER&&eligible(id,p)&&p?.models?.some(m=>m.id===rule.id));
  const row=candidates.find(([id])=>id===rule.preferredProvider)??candidates[0];
  if(!row){if(!rule.optional&&!missing.includes(rule.id))missing.push(rule.id);continue;}
  const [sourceId,p]=row,id=rule.aliasProvider??sourceId;
  if(!['openai-completions','openai-responses','anthropic-messages'].includes(p.api)||!p.apiKeyEnv)fail('MODEL_POLICY_SOURCE_INVALID');
  const url=new URL(p.baseURL);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)fail('MODEL_POLICY_SOURCE_INVALID');
  const model={...structuredClone(p.models.find(m=>m.id===rule.id)),name:rule.name,input:rule.input??['text','image']};
  if(rule.aliasProvider&&providers[id]){
   const prior=providers[id];
   if(prior.api!==p.api||prior.baseURL!==p.baseURL||prior.apiKeyEnv!==p.apiKeyEnv||!isDeepStrictEqual(prior.headers??{},p.headers??{})||prior.models?.length!==1||prior.models[0].id!==rule.id)fail('MODEL_POLICY_ALIAS_ROUTE_COLLISION');
  }
  if(!selected[id])selected[id]={...structuredClone(p),...(rule.aliasProvider?{displayName:'GPT 6.1 Terra'}:{}),models:[]};
  selected[id].models.push(model);
 }
 if(missing.length&&(!partial||!Object.keys(selected).length))throw Object.assign(Error('MODEL_POLICY_SOURCE_REQUIRED'),{code:'MODEL_POLICY_SOURCE_REQUIRED',missing});
 // Native custom providers require at least one model. Recovery references belong
 // in the protected migration journal, never as empty/invalid runtime providers.
 const first=Object.entries(selected).find(([,p])=>p.models.some(m=>m.id==='deepseek-flash'))??Object.entries(selected).find(([,p])=>p.models.length);
 const ops=Object.keys(providers).filter(id=>!Object.hasOwn(selected,id)).map(id=>({op:'unset',path:['providers',id]}));
 for(const[id,p]of Object.entries(selected))if(!isDeepStrictEqual(providers[id],p))ops.push({op:'set',path:['providers',id],value:p});
 return {providers:selected,ops,missing,defaultSelection:{provider:first[0],model:first[1].models[0].id}};
}

function validRoute(p){try{const u=new URL(p.baseURL);return ['openai-completions','openai-responses','anthropic-messages'].includes(p.api)&&!!p.apiKeyEnv&&['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{return false;}}

/** Read-only, bounded, authenticated discovery on the device's existing routes.
 * Exact catalog IDs alone may fill missing declarations; secrets never move. */
async function recoverDeclarations(providers,configured,discover){
 const required=[...new Set(MODEL_POLICY_MODELS.filter(m=>!m.optional).map(m=>m.id))];
 const missing=required.filter(id=>!Object.entries(providers).some(([key,p])=>key!==LUNA_TERRA_PROVIDER&&configured.has(key)&&p.models?.some(m=>m.id===id)));
 if(!missing.length)return providers;
 const augmented=structuredClone(providers),signal=AbortSignal.timeout(12000);
 const candidates=Object.entries(providers).filter(([id,p])=>id!==LUNA_TERRA_PROVIDER&&configured.has(id)&&validRoute(p)).sort(([a,p],[b,q])=>Number(q.models?.some(m=>/^gpt-/.test(m.id))) - Number(p.models?.some(m=>/^gpt-/.test(m.id)))).slice(0,8);
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(3,candidates.length)},async()=>{
  while(cursor<candidates.length&&!signal.aborted){
   const[id,p]=candidates[cursor++];
   try{
    const result=await discover({action:'discover',id,baseURL:p.baseURL,api:p.api},{signal});
    const additions=result.models.filter(m=>missing.includes(m.id)&&!p.models?.some(old=>old.id===m.id));
    augmented[id].models=[...(p.models??[]),...additions];
   }catch{/* A failed catalog must not disable another allowed, configured source. */}
  }
 }));
 return augmented;
}

export class ModelPolicy{
 constructor(ctx,{backup,discover,recovery}={}){this.ctx=ctx;this.backup=backup;this.discover=discover;let pending={};this.recovery=recovery??{read:()=>({providers:pending,revision:null}),write:p=>{pending=structuredClone(p);}};this.queue=Promise.resolve();this.state={revision:MODEL_POLICY_REVISION,ready:false,error:null};}
 namespace(){const ns=this.ctx.settings.describe().find(n=>n.ns==='llm-pi-ai');if(!ns)fail('MODEL_POLICY_SETTINGS_REQUIRED');return ns;}
 apply(){const run=this.queue.then(()=>this.applyOnce());this.queue=run.catch(()=>{});return run;}
 async applyOnce(){
  this.state.ready=false;
  try{
   const ns=this.namespace(),original=ns.value.providers??{},saved=this.recovery.read(),sources={...saved.providers,...original},configured=new Set();
   for(const[id,p]of Object.entries(sources))if(validRoute(p))try{if((await this.ctx.credentials.describe(p.apiKeyEnv)).configured)configured.add(id);}catch{/* Unavailable credentials affect only their own route. */}
   if(Object.keys(original).length&&!configured.size)fail('MODEL_POLICY_CREDENTIAL_REQUIRED');
   const connections=new ModelConnections({settings:{describe:()=>[{ns:'llm-pi-ai',value:{providers:sources}}]},credentials:this.ctx.credentials},{timeoutMs:8000});
   const recovered=await recoverDeclarations(sources,configured,this.discover??connections.discover.bind(connections));
   const plan=modelPolicyPlan(recovered,{partial:true,eligible:id=>configured.has(id)});
   // Discovery is only an in-memory proposal. Back up the original, then persist
   // the final allowlist once against the revision captured before network IO.
   plan.ops=Object.keys(original).filter(id=>!Object.hasOwn(plan.providers,id)).map(id=>({op:'unset',path:['providers',id]}));
   for(const[id,p]of Object.entries(plan.providers))if(!isDeepStrictEqual(original[id],p))plan.ops.push({op:'set',path:['providers',id],value:p});
   if(plan.ops.length){if(!this.ctx.settings.writable)fail('MODEL_POLICY_SETTINGS_READ_ONLY');await this.backup?.({policy:MODEL_POLICY_REVISION,providers:ns.user?.providers??ns.value.providers,defaultSelection:this.ctx.agentDefaultModel.currentSelection(),revision:ns.revision});
    if(plan.missing.length){const pending=Object.fromEntries(Object.entries(sources).filter(([id])=>id!==LUNA_TERRA_PROVIDER&&!Object.hasOwn(plan.providers,id)));this.recovery.write(pending,saved.revision);}
    await this.ctx.settings.mutate('llm-pi-ai',plan.ops,ns.revision);}
   const after=this.namespace(),actual=after.value.providers??{};
   try{const check=modelPolicyPlan(actual,{partial:true,eligible:id=>configured.has(id)||id===LUNA_TERRA_PROVIDER});if(check.ops.length)fail('MODEL_POLICY_NOT_APPLIED');}
   catch(error){
    if(plan.ops.length){
     // Do not restore over a later writer. The durable backup remains for explicit recovery.
     if(after.revision!==ns.revision+1)fail('MODEL_POLICY_RESTORE_PENDING');
     const old=ns.user?.providers??ns.value.providers;
     try{await this.ctx.settings.mutate('llm-pi-ai',[{op:'set',path:['providers'],value:old}],after.revision);}catch{fail('MODEL_POLICY_RESTORE_PENDING');}
    }
    throw error;
   }
   this.routes=structuredClone(actual);this.defaultSelection=plan.defaultSelection;
   let defaultPending=false;const current=this.ctx.agentDefaultModel.currentSelection();
   if(!this.allowed(current))try{await this.ctx.agentDefaultModel.saveSelection(this.remap(current));}catch{defaultPending=true;}
   this.state={revision:MODEL_POLICY_REVISION,ready:true,error:null,missing:plan.missing,models:Object.entries(actual).flatMap(([provider,p])=>p.models.map(({id,name,input})=>({provider,id,name,input:input??['text']}))),defaultPending};
   if(!plan.missing.length&&Object.keys(saved.providers).length)try{this.recovery.write({},saved.revision);}catch{this.state.recoveryPending=true;}
   for(const agent of this.ctx.agents?.list()??[])try{this.select(agent);}catch{this.state.defaultPending=true;}
   return this.state;
  }catch(error){this.state={revision:MODEL_POLICY_REVISION,ready:false,error:error.code??'MODEL_POLICY_APPLY_FAILED',...(error.missing?{missing:error.missing}:{})};throw error;}
 }
 allowed(selection){return !!selection&&!!this.routes?.[selection.provider]?.models.some(m=>m.id===selection.model);}
 remap(selection){for(const[id,p]of Object.entries(this.routes??{}))if(p.models.some(m=>m.id===selection?.model))return {provider:id,model:selection.model};return this.defaultSelection;}
 select(agent){if(!this.state.ready)fail(this.state.error??'MODEL_POLICY_NOT_READY');const current=agent.model.current();if(!this.allowed(current))agent.model.select(this.remap(current));}
 assert(selection){if(!this.state.ready)fail(this.state.error??'MODEL_POLICY_NOT_READY');if(!this.allowed(selection))fail('MODEL_POLICY_MODEL_DENIED');if(!isDeepStrictEqual(this.namespace().value.providers,this.routes))fail('MODEL_POLICY_CONFIGURATION_CHANGED');}
}

/** Backups stay in the protected product home, never in an Agent workspace or package. */
export function modelPolicyBackup(home){
 return async value=>{
  const dir=path.join(home,'model-policy-backups');
  if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())fail('MODEL_POLICY_BACKUP_LINK');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n'),file=path.join(dir,MODEL_POLICY_REVISION+'-'+hash(value).slice(0,16)+'.json');
  if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink()||!fs.readFileSync(file).equals(bytes))fail('MODEL_POLICY_BACKUP_DRIFT');return;}
  const temp=file+'.'+randomUUID()+'.tmp';
  try{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 };
}

/** References only, in the same protected account home as the migration backup.
 * Save before a partial CAS so a crash never loses the missing route; later
 * settings always win on duplicate IDs. No secrets or placeholder models. */
export function modelPolicyRecovery(home){
 const file=path.join(home,'model-policy-recovery.json');
 const read=()=>{
  if(!fs.existsSync(file))return {providers:{},revision:null};
  if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>4194304)fail('MODEL_POLICY_RECOVERY_INVALID');
  const bytes=fs.readFileSync(file),data=JSON.parse(bytes);if(data.version!==1||!data.providers||typeof data.providers!=='object'||Array.isArray(data.providers))fail('MODEL_POLICY_RECOVERY_INVALID');
  return {providers:data.providers,revision:createHash('sha256').update(bytes).digest('hex')};
 };
 return {read,write(providers,expected){
  if(read().revision!==expected)fail('MODEL_POLICY_RECOVERY_CONFLICT');
  const temp=file+'.'+randomUUID()+'.tmp',bytes=JSON.stringify({version:1,providers},null,2)+'\n';
  fs.mkdirSync(home,{recursive:true});try{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(read().revision!==expected)fail('MODEL_POLICY_RECOVERY_CONFLICT');fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 }};
}

export function installModelPolicy(ctx,{enabled=process.env.NAUMI_MODEL_POLICY===MODEL_POLICY_REVISION,home=resolveDshHome()}={}){
 if(!enabled)return;
 return ctx.inject(['settings','credentials','agentDefaultModel','llm','agents'],scope=>{
  const service=new ModelPolicy(scope,{backup:modelPolicyBackup(home),recovery:modelPolicyRecovery(home)});scope.provide('naumiModelPolicy',service);
  // A failed migration is visible and denies inference; it does not silently reopen old models.
  const ready=service.apply().catch(()=>null);
  scope.on('agent/created',async({agent})=>{await ready;if(service.state.ready)service.select(agent);});
  scope.on('ready',async()=>{await ready;if(service.state.ready)for(const agent of scope.agents.list())service.select(agent);});
  scope.on('llm/stream',async function*(options,next){await ready;try{service.assert(options);}catch(e){throw new LlmError(e.code??'MODEL_POLICY_NOT_READY','MODEL_POLICY_DENIED');}yield* next();});
 });
}
