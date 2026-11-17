import {randomUUID} from 'node:crypto';
import {z} from 'zod';

const protocols=['openai-completions','openai-responses','anthropic-messages'];
const model=z.object({id:z.string().trim().min(1).max(512),name:z.string().trim().max(160).optional()}).strict();
const save=z.object({action:z.literal('save'),id:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),expectedRevision:z.number().int().nonnegative(),displayName:z.string().trim().min(1).max(120),baseURL:z.string().trim().min(1).max(2048),api:z.enum(protocols),models:z.array(model).min(1).max(200),apiKey:z.string().trim().min(1).max(16000).optional()}).strict();
const remove=z.object({action:z.literal('remove'),id:z.string().min(1).max(80),expectedRevision:z.number().int().nonnegative()}).strict();
const error=(code,status=400)=>Object.assign(new Error(code),{code,status});
export function endpoint(value){
 let u;try{u=new URL(value);}catch{throw error('MODEL_URL_INVALID');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||/\/(?:chat\/completions|responses|messages)\/?$/.test(u.pathname))throw error('MODEL_URL_INVALID');
 return u.href.replace(/\/+$/,'');
}
const unconfigured={provider:'naumi-custom',model:'configure-model'};
const official=id=>['deepseek-official','deepseek-account'].includes(id);

/** Settings own route configuration; the existing local credential service alone owns secrets.
 * A rotated key gets a fresh reference, so a failed CAS never changes a working route's key.
 */
export class ModelConnections{
 constructor(ctx){this.ctx=ctx;this.queue=Promise.resolve();}
 namespace(){const ns=this.ctx.settings.describe({redactSecrets:true}).find(n=>n.ns==='llm-pi-ai');if(!ns)throw error('MODEL_SETTINGS_UNAVAILABLE',503);return ns;}
 async read(){const ns=this.namespace(),groups=[];for(const[id,p]of Object.entries(ns.value.providers??{})){
  const info=p.apiKeyEnv?await this.ctx.credentials.describe(p.apiKeyEnv):{configured:false,writable:true};
  groups.push({id,displayName:p.displayName??id,api:p.api??'openai-completions',baseURL:p.baseURL??'',models:(p.models??[]).map(m=>({id:m.id,...m.name?{name:m.name}:{}})),configured:info.configured,editable:protocols.includes(p.api)&&Array.isArray(p.models)&&p.models.length>0});
 }return {revision:ns.revision,writable:this.ctx.settings.writable,groups};}
 async repairDefault(removed){
  const current=this.ctx.agentDefaultModel.currentSelection();
  const p=this.namespace().value.providers??{},own=p[current.provider];
  const missingModel=own?.models?.length&&!own.models.some(m=>m.id===current.model);
  if(!official(current.provider)&&current.provider!==unconfigured.provider&&current.provider!==removed&&!missingModel)return;
  const first=missingModel?[current.provider,own]:Object.entries(p).find(([,v])=>v.models?.length);
  await this.ctx.agentDefaultModel.saveSelection(first?{provider:first[0],model:first[1].models[0].id}:unconfigured);
 }
 execute(input){const run=this.queue.then(()=>this.write(input));this.queue=run.catch(()=>{});return run;}
 async write(input){
  const parsed=z.union([save,remove]).safeParse(input);if(!parsed.success)throw error('MODEL_INVALID_REQUEST');const p=parsed.data;
  const ns=this.namespace();if(!this.ctx.settings.writable)throw error('MODEL_SETTINGS_READ_ONLY',403);if(ns.revision!==p.expectedRevision)throw error('MODEL_SETTINGS_CONFLICT',409);
  const previous=ns.value.providers?.[p.id];let newRef;
  if(p.action==='remove'){
   if(!previous)throw error('MODEL_GROUP_NOT_FOUND',404);
   await this.ctx.settings.mutate('llm-pi-ai',[{op:'unset',path:['providers',p.id]}],ns.revision);
  }else{
   if(new Set(p.models.map(m=>m.id)).size!==p.models.length)throw error('MODEL_DUPLICATE_ID');
   if(!p.apiKey&&!previous?.apiKeyEnv)throw error('MODEL_KEY_REQUIRED');
   const profile={...previous,displayName:p.displayName,baseURL:endpoint(p.baseURL),api:p.api,models:p.models.map(m=>({...previous?.models?.find(old=>old.id===m.id),...m})),apiKeyEnv:previous?.apiKeyEnv};
   if(p.apiKey){if(/[\r\n\u0000-\u001f\u007f]/.test(p.apiKey))throw error('MODEL_KEY_INVALID');newRef='NAUMI_MODEL_'+randomUUID().replaceAll('-','').toUpperCase();profile.apiKeyEnv=newRef;await this.ctx.credentials.set(newRef,p.apiKey);}
   try{await this.ctx.settings.mutate('llm-pi-ai',[{op:'set',path:['providers',p.id],value:profile}],ns.revision);}
   catch(e){if(newRef)try{await this.ctx.credentials.unset(newRef);}catch{throw error('MODEL_SAVE_CLEANUP_FAILED',500);}throw e;}
  }
  // Configuration is already durable. Report a default-selection issue separately, not as a failed save.
  let defaultPending=false;try{await this.repairDefault(p.action==='remove'?p.id:undefined);}catch{defaultPending=true;}
  return {...await this.read(),defaultPending};
 }
}

export function installModelConnections(ctx){
 return ctx.inject(['webServer','connection','settings','credentials','agentDefaultModel'],scope=>{
  const service=new ModelConnections(scope);
  scope.on('ready',()=>service.repairDefault().catch(()=>{}));
  scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/model-connections',handler:async(req,res)=>{
   res.setHeader('Cache-Control','no-store');const send=(status,value)=>{if(!res.destroyed)res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(value));};
   const admission=scope.connection.admit(req);if('rejection'in admission){send(admission.rejection,{error:'AUTH_REQUIRED'});return;}if(admission.peer.principal.kind!=='owner'){send(403,{error:'OWNER_REQUIRED'});return;}
   try{
    if(req.method==='GET'){send(200,await service.read());return;}
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');send(405,{error:'METHOD_NOT_ALLOWED'});return;}
    if(req.headers['x-naumi-model-connections']!=='1'||req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){send(403,{error:'SAME_ORIGIN_REQUIRED'});return;}
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??'')){send(415,{error:'JSON_REQUIRED'});return;}
    let bytes=0,text='';for await(const b of req){bytes+=b.length;if(bytes>131072){send(413,{error:'MODEL_BODY_TOO_LARGE'});return;}text+=b;}
    let input;try{input=JSON.parse(text);}catch{throw error('MODEL_INVALID_REQUEST');}
    send(200,await service.execute(input));
   }catch(e){const conflict=e.code==='SETTINGS_CONFLICT';send(conflict?409:e.status??500,{error:conflict?'MODEL_SETTINGS_CONFLICT':/^MODEL_[A-Z_]+$/.test(e.code??'')?e.code:'MODEL_SAVE_FAILED'});}
  }}));
 });
}
