import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import {randomUUID,generateKeyPairSync,createHash,sign,verify} from 'node:crypto';
import {Context} from '@deepseek-ai/cordis';import Projections from '@deepseek-ai/dsh-session-projection';import Sessions,{SessionId} from '@deepseek-ai/dsh-session';import Prompt from '@deepseek-ai/dsh-system-prompt';import Tools,{defineTool} from '@deepseek-ai/dsh-tools';import Llm,{LlmAdapter} from '@deepseek-ai/dsh-llm';import Agents from '@deepseek-ai/dsh-agent';import Loop from '@deepseek-ai/dsh-agent-loop';import * as Native from '@deepseek-ai/dsh-tool-executor-native';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import {BotDirectory} from '../../plugins/naumi-enterprise/bots.js';import {EmployeeStore} from '../../plugins/naumi-enterprise/employee-store.js';import {EmployeeSync} from '../../plugins/naumi-enterprise/employee-sync.js';import {EmployeeDeviceVault} from '../../plugins/naumi-enterprise/employee-device-vault.js';import {EmployeeEnterpriseWork} from '../../plugins/naumi-enterprise/employee-enterprise-work.js';import {installEmployeeRuntimeGate} from '../../plugins/naumi-enterprise/employee-runtime-gate.js';

/** Real AgentLoop/LLM registry/Tools pipeline/Session/Cordis/SQLite and signed HTTP. Provider/business domain are fixtures. */
export async function managedRuntimeHost(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-managed-')),ctx=new Context(),forks=[],routes=new Map(),logs=new Map(),handles=[];let now=Date.now(),network=true,modelCalls=0,externalCalls=0,modelHook=null,externalHook=null;
  for(const [plugin,config] of [[Projections,{}],[Sessions,{}],[Jsonl,{root:path.join(dir,'sessions'),compression:'none'}],[Prompt,{}],[Llm,{}],[Tools,{}],[Native,{}],[Agents,{}],[Loop,{}]]){const f=ctx.plugin(plugin,config);await f;forks.push(f);}
  class Adapter extends LlmAdapter{async *stream(options){modelCalls++;options.signal?.throwIfAborted();if(modelHook){yield* modelHook(options);return;}yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'本地模型链路仍工作'};yield {type:'block-end',index:0,block:{type:'text',text:'本地模型链路仍工作'}};yield {type:'finish',reason:{kind:'stop'}};}}
  const llm=ctx.llm.registerAdapter(['fixture'],new Adapter());
  const member=agent=>{if(ctx.agents.get(agent.id)!==agent)return;const root=agent.session.header.parentSession?ctx.agents.get(agent.session.header.parentSession)??agent:agent;return {root,role:root===agent?'lead':'member',id:root.id};};
  const provider=ctx.plugin({name:'managed-host-edges',apply(scope){scope.provide('agentDefaultModel',{currentSelection:()=>({provider:'fixture',model:'fixture-model'})});scope.provide('agentTeams',{tryMembership:member,membership:a=>{const m=member(a);if(!m)throw Error('TEAM_NOT_MEMBER');return m;}});scope.provide('connection',{admit:req=>req.headers.cookie==='fixture-owner'?{peer:{principal:{kind:'owner'}}}:req.headers.cookie==='fixture-guest'?{peer:{principal:{kind:'guest'}}}:{rejection:401}});scope.provide('webServer',{register:r=>{routes.set(r.path,r.handler);return()=>routes.delete(r.path);}});}});await provider;
  ctx.on('session/event',(session)=>logs.set(session.id,{header:structuredClone(session.header),events:structuredClone(session.snapshotEvents())}));
  const directory=new BotDirectory(path.join(dir,'bots.json')),store=new EmployeeStore(path.join(dir,'employees.sqlite'));
  async function create(sessionId='session-'+randomUUID(),parent){const h=await ctx.agents.create({sessionId:SessionId(sessionId),meta:{cwd:dir,...parent?{parentSession:parent.id,origin:'subagent',delegationDepth:1}:{}},...parent?{parentAgent:parent}:{},agentOptions:{provider:'fixture',model:'fixture-model'}});handles.push(h);return h.agent;}
  const root=await create(),bot=await directory.create({sessionId:root.id,cwd:dir},{name:'执行员工',purpose:'执行许可验证',kind:'agent'}),other=await create();
  const {privateKey,publicKey}=generateKeyPairSync('ed25519'),tenantId=randomUUID(),memberId=randomUUID(),employeeId=randomUUID(),taskId=randomUUID(),deviceId=randomUUID();
  const vault=new EmployeeDeviceVault(path.join(dir,'device.fixture'),{protect:v=>Buffer.from(v).toString('base64'),unprotect:v=>Buffer.from(v,'base64').toString()});const keys=vault.open();let claims;
  const remote={taskId,employeeId,placement:'local-bound',leaseSeconds:30,boundDeviceId:deviceId,ownerDeviceId:null,attemptId:null,fencingToken:'0',state:'idle',revision:1,leaseExpiresAt:null};let sync;const deviceActions=new Map();
  const packet=()=>{const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');return {kid:'fixture-key',payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64url')};};
  const server=http.createServer(async(req,res)=>{
    const send=(status,v)=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(v));
    if(req.url?.startsWith('/naumi/')){const handler=routes.get(new URL(req.url,'http://localhost').pathname);if(handler)await handler(req,res);else send(404,{});return;}
    if(!network){send(503,{code:'EMP_SYNC_UNAVAILABLE'});return;}
    const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);let p;try{p=JSON.parse(raw);}catch{send(400,{});return;}
    if(!verify(null,raw,keys.publicKey,Buffer.from(req.headers['x-naumi-device-signature']??'','base64url'))){send(403,{code:'SIGNATURE_INVALID'});return;}
    const a=p.body;let result={};
    if(a.action==='execution.inspect')result={execution:{...remote}};
    else if(a.action==='execution.acquire'){
      if(remote.ownerDeviceId&&(remote.ownerDeviceId!==deviceId||remote.attemptId!==a.attemptId)){send(409,{code:'EXECUTION_ALREADY_OWNED'});return;}
      if(remote.state==='unknown'){send(409,{code:'EXECUTION_RESULT_UNRESOLVED'});return;}
      if(!remote.ownerDeviceId){remote.ownerDeviceId=deviceId;remote.attemptId=a.attemptId;remote.fencingToken=String(BigInt(remote.fencingToken)+1n);}remote.state='owned';remote.revision++;remote.leaseExpiresAt=new Date(now+30000).toISOString();result={execution:{...remote}};
    }else if(a.action==='execution.renew'||a.action==='execution.uncertain'){
      if(a.execution.attemptId!==remote.attemptId||a.execution.fencingToken!==remote.fencingToken||remote.state!=='owned'){send(409,{code:'EXECUTION_FENCE_STALE'});return;}
      remote.revision++;if(a.action==='execution.uncertain')remote.state='unknown';else remote.leaseExpiresAt=new Date(now+30000).toISOString();result={execution:{...remote}};
    }else if(deviceActions.has(a.action)){try{result=await deviceActions.get(a.action)(a);}catch(e){send(e.status??500,{code:e.message});return;}}else if(a.action==='work.read')result={tasks:[{id:taskId,title:'企业测试任务'}]};
    else if(a.action!=='authorize'){send(400,{code:'UNSUPPORTED_FIXTURE_ACTION'});return;}
    send(200,{...result,authorization:packet()});
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  sync=new EmployeeSync({file:path.join(dir,'sync.sqlite'),store,directory,origin,vault,clock:()=>now});sync.set('deviceId',deviceId);sync.deviceId=deviceId;
  sync.set('registration',{tenantId,memberId,keyId:'fixture-key',serverPublicKey:publicKey.export({format:'pem',type:'spki'}).toString()});
  claims={v:1,aud:'naumi-desktop',iss:origin,tenantId,memberId,deviceId,keyHash:createHash('sha256').update(generatePublicDER(keys.publicKey)).digest('hex'),authEpoch:1,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString(),capabilities:['local.read','local.draft','local.infer'],bindings:[{employeeId,localBotId:bot.id}],projectIds:[]};sync.set('authorization',packet());sync.enterpriseWork=new EmployeeEnterpriseWork(sync);
  let runtime;const gateHost=ctx.plugin({name:'managed-runtime-gate-test',inject:['agents','sessions','sessionPersistence','tools','agentTeams','connection','webServer'],apply(scope){runtime=installEmployeeRuntimeGate(scope,directory,store,{sync,intervalMs:100000});}});await gateHost;runtime.gate.clock=()=>now;
  const tool=(name,run)=>ctx.tools.register(defineTool({name,description:name,parameters:{},output:{schema:{type:'json'},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},execute:async(_args,exec)=>run(exec)}));
  const disposers=[tool('external_write',async exec=>{externalCalls++;return externalHook?externalHook(exec):{receipt:'fixture-'+externalCalls};}),tool('employee_work',async()=>({goals:[]})),tool('employee_delivery_create',async()=>({draft:true})),tool('employee_activity_report',async()=>({recorded:true})),tool('employee_enterprise_submit',async()=>({status:'acknowledged'})),tool('bot_dispatch',async()=>({shouldNotExecute:true}))];
  const command=(action,args={})=>runtime.gate.command({action,botId:bot.id,sessionId:root.id,operationId:randomUUID(),...args});
  const attach=(args={})=>command('attach',{taskId,allowedTools:['external_write','employee_enterprise_submit'],allowOfflineLocal:true,...args});
  const resume=async()=>{const b=runtime.gate.binding(root.id);return command('resume',{expectedRevision:b.revision});};
  const invoke=async(name,agent=root,args={})=>(await ctx.tools.execute({calls:[{type:'tool-call',id:'call-'+randomUUID(),name,arguments:JSON.stringify(args)}],agent,signal:new AbortController().signal})).results[0].result;
  return {ctx,root,other,bot,dir,directory,store,sync,origin,claims,remote,taskId,employeeId,runtime,create,command,attach,resume,invoke,deviceActions,signPacket(body){const payload=Buffer.from(JSON.stringify({v:1,iss:origin,...body})).toString('base64url');return 'fixture-key.'+payload+'.'+sign(null,Buffer.from(payload),privateKey).toString('base64url');},get now(){return now;},get modelCalls(){return modelCalls;},get externalCalls(){return externalCalls;},advance:ms=>now+=ms,setNetwork:v=>network=v,setModelHook:v=>modelHook=v,setExternalHook:v=>externalHook=v,refreshClaims:()=>sync.set('authorization',packet()),
    release(){remote.ownerDeviceId=null;remote.attemptId=null;remote.state='idle';remote.fencingToken=String(BigInt(remote.fencingToken)+1n);remote.leaseExpiresAt=null;remote.revision++;},
    async cleanup(){await runtime.close();await gateHost.dispose();for(const h of handles.reverse())await h.dispose();for(const d of disposers)d();await sync.close();store.close();await directory.close();llm();await provider.dispose();for(const f of forks.reverse())await f.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('TEMP_ESCAPE');fs.rmSync(dir,{recursive:true,force:true});},
  };
}
import {createPublicKey} from 'node:crypto';const generatePublicDER=pem=>createPublicKey(pem).export({format:'der',type:'spki'});
