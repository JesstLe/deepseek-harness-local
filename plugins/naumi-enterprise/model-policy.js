import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {LlmError} from '@deepseek-ai/dsh-llm';
import {resolveDshHome} from '@deepseek-ai/dsh-home-paths';

export const MODEL_POLICY_REVISION='two-vision-20261120';
export const MODEL_POLICY_MODELS=Object.freeze([
 Object.freeze({id:'deepseek-flash',name:'claude fable5.2',preferredProvider:'ccs-deepseek-992333'}),
 Object.freeze({id:'gpt-6-luna',name:'gpt 6.1 sol',preferredProvider:'ccs-provider-8c7ab447-51aed7'}),
]);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};

/** Select exact wire IDs without copying credentials or mixing endpoints. */
export function modelPolicyPlan(providers){
 const selected={},missing=[];
 for(const rule of MODEL_POLICY_MODELS){
  const candidates=Object.entries(providers??{}).filter(([,p])=>p?.models?.some(m=>m.id===rule.id));
  const row=candidates.find(([id])=>id===rule.preferredProvider)??candidates[0];
  if(!row){missing.push(rule.id);continue;}
  const [id,p]=row;
  if(!['openai-completions','openai-responses','anthropic-messages'].includes(p.api)||!p.apiKeyEnv)fail('MODEL_POLICY_SOURCE_INVALID');
  const url=new URL(p.baseURL);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)fail('MODEL_POLICY_SOURCE_INVALID');
  const model={...structuredClone(p.models.find(m=>m.id===rule.id)),name:rule.name,input:['text','image']};
  if(!selected[id])selected[id]={...structuredClone(p),models:[]};
  selected[id].models.push(model);
 }
 if(missing.length)throw Object.assign(Error('MODEL_POLICY_SOURCE_REQUIRED'),{code:'MODEL_POLICY_SOURCE_REQUIRED',missing});
 const first=Object.entries(selected).find(([,p])=>p.models.some(m=>m.id==='deepseek-flash'));
 const ops=Object.keys(providers).filter(id=>!Object.hasOwn(selected,id)).map(id=>({op:'unset',path:['providers',id]}));
 for(const[id,p]of Object.entries(selected))if(!isDeepStrictEqual(providers[id],p))ops.push({op:'set',path:['providers',id],value:p});
 return {providers:selected,ops,defaultSelection:{provider:first[0],model:'deepseek-flash'}};
}

export class ModelPolicy{
 constructor(ctx,{backup}={}){this.ctx=ctx;this.backup=backup;this.state={revision:MODEL_POLICY_REVISION,ready:false,error:null};}
 namespace(){const ns=this.ctx.settings.describe().find(n=>n.ns==='llm-pi-ai');if(!ns)fail('MODEL_POLICY_SETTINGS_REQUIRED');return ns;}
 async apply(){
  this.state.ready=false;
  try{
   const ns=this.namespace(),plan=modelPolicyPlan(ns.value.providers??{});
   for(const p of Object.values(plan.providers))if(!(await this.ctx.credentials.describe(p.apiKeyEnv)).configured)fail('MODEL_POLICY_CREDENTIAL_REQUIRED');
   if(plan.ops.length){if(!this.ctx.settings.writable)fail('MODEL_POLICY_SETTINGS_READ_ONLY');await this.backup?.({policy:MODEL_POLICY_REVISION,providers:ns.user?.providers??ns.value.providers,defaultSelection:this.ctx.agentDefaultModel.currentSelection(),revision:ns.revision});await this.ctx.settings.mutate('llm-pi-ai',plan.ops,ns.revision);}
   const after=this.namespace(),actual=after.value.providers??{};
   try{const check=modelPolicyPlan(actual);if(check.ops.length)fail('MODEL_POLICY_NOT_APPLIED');}
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
   this.state={revision:MODEL_POLICY_REVISION,ready:true,error:null,models:MODEL_POLICY_MODELS.map(({id,name})=>({id,name,input:['text','image']})),defaultPending};
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

export function installModelPolicy(ctx,{enabled=process.env.NAUMI_MODEL_POLICY===MODEL_POLICY_REVISION,home=resolveDshHome()}={}){
 if(!enabled)return;
 return ctx.inject(['settings','credentials','agentDefaultModel','llm','agents'],scope=>{
  const service=new ModelPolicy(scope,{backup:modelPolicyBackup(home)});scope.provide('naumiModelPolicy',service);
  // A failed migration is visible and denies inference; it does not silently reopen old models.
  const ready=service.apply().catch(()=>null);
  scope.on('agent/created',async({agent})=>{await ready;if(service.state.ready)service.select(agent);});
  scope.on('ready',async()=>{await ready;if(service.state.ready)for(const agent of scope.agents.list())service.select(agent);});
  scope.on('llm/stream',async function*(options,next){await ready;try{service.assert(options);}catch(e){throw new LlmError(e.code??'MODEL_POLICY_NOT_READY','MODEL_POLICY_DENIED');}yield* next();});
 });
}
