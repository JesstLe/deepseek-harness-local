import {randomUUID,verify} from 'node:crypto';import {z} from 'zod';
import {LlmAdapter,LlmError,resolveRetryPolicy,resolveImageAttachmentAccess} from '@deepseek-ai/dsh-llm';import {PiAiAdapter} from '@deepseek-ai/dsh-llm-pi-ai';
import {createProvider,envApiKeyAuth,InMemoryCredentialStore,defaultProviderAuthContext} from '@earendil-works/pi-ai';import {openAICompletionsApi} from '@earendil-works/pi-ai/api/openai-completions.lazy';
export const MODEL_PROVIDER='naumi-enterprise',NO_RETRY=resolveRetryPolicy({mode:'normal',maxRetries:0},'naumi-model-gateway');
const fail=code=>{throw new LlmError(code,code);},key=(bot,task)=>bot+'/'+(task??'local');
export class EmployeeModels{
 constructor({ctx,sync,directory}){Object.assign(this,{ctx,sync,directory});this.flights=new Map();this.active=new Map();this.closed=false;sync.db.exec(`CREATE TABLE IF NOT EXISTS model_credentials(id TEXT PRIMARY KEY,bot_id TEXT NOT NULL,task_id TEXT,encrypted TEXT NOT NULL);CREATE TABLE IF NOT EXISTS model_requests(id TEXT PRIMARY KEY,bot_id TEXT,task_id TEXT,session_id TEXT,state TEXT NOT NULL,updated_at TEXT NOT NULL);UPDATE model_requests SET state='unknown' WHERE state='pending';`);}
 verify(value,botId,taskId){
  const registration=this.sync.registration(),device=this.sync.offlineClaims(),[kid,payload,signature,...extra]=value.token.split('.');let c;
  try{if(extra.length||kid!==registration.keyId||!verify(null,Buffer.from(payload),registration.serverPublicKey,Buffer.from(signature,'base64url')))throw Error();c=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{fail('MODEL_CREDENTIAL_SIGNATURE_INVALID');}
  if(c.aud!=='naumi-model-gateway'||c.iss!==this.sync.origin||c.gateway!==value.gateway||c.tenantId!==registration.tenantId||c.memberId!==registration.memberId||c.deviceId!==this.sync.deviceId||c.botId!==botId||c.taskId!==taskId||!device.bindings.some(b=>b.localBotId===botId&&b.employeeId===c.employeeId)||c.authEpoch<device.authEpoch)fail('MODEL_CREDENTIAL_BINDING_INVALID');
  const u=new URL(c.gateway);if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))fail('MODEL_GATEWAY_URL_INVALID');
  const start=Date.parse(c.issuedAt),end=Date.parse(c.expiresAt);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=this.sync.clock()||end-start>86400000||this.sync.clock()<start-60000)fail('MODEL_CREDENTIAL_EXPIRED');
  if(!c.policy?.active||!Array.isArray(c.policy.routes)||!Number.isInteger(c.policy.revision))fail('MODEL_POLICY_DISABLED');if(c.policy.revision<(device.modelPolicyRevision??0))fail('MODEL_POLICY_STALE');return c;
 }
 cached(botId,taskId){const r=this.sync.db.prepare('SELECT encrypted FROM model_credentials WHERE id=?').get(key(botId,taskId));return r?this.sync.vault.unseal(r.encrypted):null;}
 async credential(botId,taskId=null,{force=false,signal}={}){
  if(this.closed)fail('MODEL_CLIENT_CLOSED');this.sync.bot(botId);let old=this.cached(botId,taskId),oldClaims;try{if(old)oldClaims=this.verify(old,botId,taskId);}catch{old=null;}
  if(old&&!force&&old.models?.length&&Date.parse(oldClaims.expiresAt)-this.sync.clock()>30000)return old;
  const id=key(botId,taskId);if(this.flights.has(id))return this.flights.get(id);
  let gotCredential=false;const flight=(async()=>{try{const claims=this.sync.offlineClaims(),binding=claims.bindings.find(b=>b.localBotId===botId);if(!binding)fail('EMP_DEVICE_BINDING_REQUIRED');
    const response=await this.sync.device({action:'model.authorize',employeeId:binding.employeeId,taskId},{signal}),value=response.model;if(!value?.token||value.token.length>15000)fail('MODEL_CREDENTIAL_INVALID');const c=this.verify(value,botId,taskId);
    gotCredential=true;if(oldClaims&&c.policy.revision<oldClaims.policy.revision)fail('MODEL_POLICY_ROLLBACK');
    // Retire the old revision before catalog I/O. A failed catalog must not revive old authorization.
    value.models=[];this.sync.db.prepare('INSERT INTO model_credentials VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET encrypted=excluded.encrypted').run(id,botId,taskId,this.sync.vault.seal(value));
    const models=await this.gateway(value,'/v1/models',{signal}),allowed=new Set(c.policy.routes);value.models=z.array(z.object({id:z.string().max(80),name:z.string().max(120),contextTokens:z.number().int().min(128).max(2000000),maxOutputTokens:z.number().int().positive().max(1000000),vision:z.boolean(),inputMicrosPerMillion:z.number().int().nonnegative().max(1e9),outputMicrosPerMillion:z.number().int().nonnegative().max(1e9)}).passthrough()).max(30).parse(models.data).filter(m=>allowed.has(m.id));
    this.sync.db.prepare('INSERT INTO model_credentials VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET encrypted=excluded.encrypted').run(id,botId,taskId,this.sync.vault.seal(value));this.onChange?.();return value;
   }catch(e){if(old&&!force&&!gotCredential&&(!e.status||e.status>=500)&&!/^MODEL_CREDENTIAL_|MODEL_POLICY_/.test(e.code??'')){this.verify(old,botId,taskId);return old;}throw e;}})().finally(()=>this.flights.delete(id));this.flights.set(id,flight);return flight;
 }
 async gateway(value,endpoint,{signal,body}={}){const r=await fetch(value.gateway+endpoint,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+value.token,...body?{'Content-Type':'application/json'}:{}},signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20000)]),...body?{body:JSON.stringify(body)}:{}});const text=await r.text();if(text.length>2*1024*1024)fail('MODEL_GATEWAY_RESPONSE_INVALID');let result;try{result=JSON.parse(text);}catch{fail('MODEL_GATEWAY_RESPONSE_INVALID');}if(!r.ok)fail(result.error?.code??'MODEL_GATEWAY_UNAVAILABLE');return result;}
 catalog(){const models=new Map();for(const r of this.sync.db.prepare('SELECT encrypted FROM model_credentials').all()){const v=this.sync.vault.unseal(r.encrypted);for(const m of v.models??[])models.set(m.id,m);}return [...models.values()];}
 status(botId,taskId=null){const v=this.cached(botId,taskId);let c,error=null;try{if(v)c=this.verify(v,botId,taskId);}catch(e){error=e.code??'MODEL_CREDENTIAL_INVALID';}return {provider:MODEL_PROVIDER,connected:!!v&&!error,gateway:v?.gateway??null,expiresAt:c?.expiresAt??null,policy:c?.policy??null,error,models:v?.models??[],requests:this.sync.db.prepare('SELECT id,task_id AS taskId,session_id AS sessionId,state,updated_at AS updatedAt FROM model_requests WHERE bot_id=? ORDER BY updated_at DESC LIMIT 30').all(botId)};}
 async applyProof(gateway,proof){
  const registration=this.sync.registration();if(!registration)fail('EMP_DEVICE_NOT_REGISTERED');const [kid,payload,signature,...extra]=proof.split('.');let p;
  try{if(extra.length||kid!==registration.keyId||!verify(null,Buffer.from(payload),registration.serverPublicKey,Buffer.from(signature,'base64url')))throw Error();p=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{fail('MODEL_ADMIN_SIGNATURE_INVALID');}
  if(p.aud!=='naumi-model-admin'||p.iss!==this.sync.origin||p.tenantId!==registration.tenantId||p.gateway!==gateway||Date.parse(p.expiresAt)<=this.sync.clock())fail('MODEL_ADMIN_INVALID');
  const u=new URL(gateway);if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))fail('MODEL_GATEWAY_URL_INVALID');
  const r=await fetch(gateway+'/admin',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({proof}),signal:AbortSignal.timeout(15000)}),v=await r.json();if(!r.ok)fail(v.error?.code??'MODEL_POLICY_SYNC_FAILED');return v;
 }
 async close(){this.closed=true;for(const a of this.active.values())a.controller.abort(Error('MODEL_CLIENT_CLOSED'));await Promise.allSettled([...this.flights.values(),...[...this.active.values()].map(a=>a.done)]);}
}
function transport(ctx,models,gateway,token,requestId){
 const descriptors=models.map(m=>({id:m.id,provider:MODEL_PROVIDER,baseUrl:gateway+'/v1',name:m.name,api:'openai-completions',reasoning:false,input:m.vision?['text','image']:['text'],contextWindow:m.contextTokens,maxTokens:m.maxOutputTokens,cost:{input:m.inputMicrosPerMillion/1e6,output:m.outputMicrosPerMillion/1e6,cacheRead:m.inputMicrosPerMillion/1e6,cacheWrite:m.inputMicrosPerMillion/1e6}}));
 const provider=createProvider({id:MODEL_PROVIDER,name:'Naumi 企业模型',baseUrl:gateway+'/v1',models:descriptors,auth:{apiKey:envApiKeyAuth('Naumi device model credential',[])},api:openAICompletionsApi()});
 const profile={provider:MODEL_PROVIDER,displayName:'Naumi 企业模型',api:'openai-completions',baseURL:gateway+'/v1',streamIdleTimeoutMs:300000,maxRequestImageBytes:8*1024*1024,maxRequestImages:15,imageOffloadCountQuantum:5,requestImagePixelBudget:4194304,requestImageMaxBytes:1048576,retryPolicy:NO_RETRY,piProvider:provider,modelErrors:new Map(),configuredMaxTokens:new Map(models.map(m=>[m.id,m.maxOutputTokens]))};
 return new PiAiAdapter({profiles:()=>new Map([[MODEL_PROVIDER,profile]]),resolveApiKey:async()=>token,auth:{credentials:new InMemoryCredentialStore(),authContext:defaultProviderAuthContext()},prepareHeaders:(_request,headers)=>{headers.set('X-Naumi-Request-Id',requestId);return headers;},resolveAttachments:()=>ctx.get('attachments'),resolveImageAccess:(attachments,ref)=>resolveImageAttachmentAccess(attachments,p=>ctx.get('fs')?.processPathFromHostPath(p),ref)});
}
export class EmployeeGatewayAdapter extends LlmAdapter{
 constructor({ctx,client,directory}){super();Object.assign(this,{ctx,client,directory});}
 providerInfo(){return {id:MODEL_PROVIDER,name:'Naumi 企业模型'};}
 providerRetryPolicy(){return NO_RETRY;}
 async listModels(){const models=this.client.catalog();if(!models.length)return [];const v=this.client.sync.db.prepare('SELECT encrypted FROM model_credentials LIMIT 1').get(),gateway=this.client.sync.vault.unseal(v.encrypted).gateway;return transport(this.ctx,models,gateway,'metadata-only',randomUUID()).listModels(MODEL_PROVIDER);}
 async resolveModel(provider,model){const row=this.client.sync.db.prepare('SELECT encrypted FROM model_credentials').all().map(r=>this.client.sync.vault.unseal(r.encrypted)).find(v=>v.models?.some(m=>m.id===model));if(!row)fail('MODEL_ROUTE_NOT_CACHED');return transport(this.ctx,row.models,row.gateway,'metadata-only',randomUUID()).resolveModel(provider,model);}
 async prepareCall(provider,model){return {model:await this.resolveModel(provider,model),stream:options=>this.stream(options)};}
 async *stream(options){
  const agent=options.sessionId?this.ctx.agents.get(options.sessionId):null;if(!agent)fail('MODEL_SESSION_REQUIRED');const membership=this.ctx.agentTeams.tryMembership(agent),root=membership?.root??agent,managed=this.client.sync.runtimeGate?await this.client.sync.runtimeGate.context(agent):null,botId=managed?.botId??this.directory.forSession(root.id)?.id,taskId=managed?.taskId??null;if(!botId)fail('MODEL_BOT_BINDING_REQUIRED');
  const controller=new AbortController(),signal=AbortSignal.any([controller.signal,...options.signal?[options.signal]:[]]),id=randomUUID();let finish;const done=new Promise(resolve=>{finish=resolve;});this.client.active.set(id,{controller,done});
  try{
   const value=await this.client.credential(botId,taskId,{signal});if(!value.models.some(m=>m.id===options.model))fail('MODEL_ROUTE_NOT_AUTHORIZED');
   this.client.sync.db.prepare('INSERT INTO model_requests VALUES(?,?,?,?,?,?)').run(id,botId,taskId,root.id,'pending',new Date().toISOString());let success=false;
   try{const adapter=transport(this.ctx,value.models,value.gateway,value.token,id);for await(const chunk of adapter.stream({...options,signal})){if(chunk.type==='finish'&&['stop','tool-calls','max-tokens'].includes(chunk.reason.kind))success=true;yield chunk;}}
   finally{this.client.sync.db.prepare('UPDATE model_requests SET state=?,updated_at=? WHERE id=?').run(success?'stream_complete':'unknown',new Date().toISOString(),id);}
  }catch(e){throw new LlmError(/^MODEL_[A-Z_]+$/.test(e.code??e.message)?e.code??e.message:'MODEL_CHANNEL_UNAVAILABLE','MODEL_CHANNEL_UNAVAILABLE');}
  finally{this.client.active.delete(id);finish();}
 }
}
export function installEmployeeModels(scope,directory,{sync}={}){
 if(!sync)return null;const client=new EmployeeModels({ctx:scope,sync,directory});sync.models=client;
 const host=scope.inject(['llm','agents','agentTeams'],ctx=>{const adapter=new EmployeeGatewayAdapter({ctx,client,directory}),registration=ctx.llm.registerAdapter([MODEL_PROVIDER],adapter);client.onChange=()=>ctx.emit('llm/adapters-updated');ctx.effect(()=>()=>{client.onChange=null;registration();});});
 scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/employee-models',handler:async(req,res)=>{
  const a=scope.connection.admit(req);if('rejection'in a){res.writeHead(a.rejection).end();return;}if(a.peer.principal.kind!=='owner'){res.writeHead(403).end();return;}res.setHeader('Cache-Control','no-store');const send=(code,v)=>{if(!res.destroyed)res.writeHead(code,{'Content-Type':'application/json'}).end(JSON.stringify(v));};
  try{const q=new URL(req.url,'http://localhost').searchParams;if(req.method==='GET'){const botId=z.string().min(1).max(200).parse(q.get('botId')),taskId=q.get('taskId')??null;sync.bot(botId);send(200,client.status(botId,taskId));return;}
   if(req.method!=='POST'){send(405,{error:'METHOD_NOT_ALLOWED'});return;}if(req.headers['x-naumi-models']!=='1'||req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){send(403,{error:'MODEL_SAME_ORIGIN_REQUIRED'});return;}
   let text='',n=0;for await(const b of req){n+=b.length;if(n>32768){send(413,{error:'MODEL_BODY_TOO_LARGE'});return;}text+=b;}let p;try{p=z.union([z.object({action:z.literal('apply-proof'),gateway:z.string().url(),proof:z.string().max(15000)}).strict(),z.object({action:z.enum(['connect','budget','receipt']),botId:z.string().min(1).max(200),taskId:z.string().uuid().nullable().default(null),requestId:z.string().uuid().optional()}).strict()]).parse(JSON.parse(text));}catch{send(400,{error:'MODEL_INVALID_REQUEST'});return;}
   if(p.action==='apply-proof'){send(200,await client.applyProof(p.gateway,p.proof));return;}
   const value=await client.credential(p.botId,p.taskId,{force:p.action==='connect'});send(200,p.action==='connect'?client.status(p.botId,p.taskId):await client.gateway(value,p.action==='budget'?'/budget':'/receipt?id='+z.string().uuid().parse(p.requestId)));
  }catch(e){const code=/^(?:MODEL|EMP)_[A-Z_]+$/.test(e.code??e.message)?e.code??e.message:'MODEL_CHANNEL_UNAVAILABLE';send(/REQUIRED|NOT_REGISTERED|DISABLED/.test(code)?403:/CONFLICT/.test(code)?409:503,{error:code});}
 }}));return {client,async close(){await client.close();await host.dispose();if(sync.models===client)delete sync.models;}};
}
