import {createHash,randomUUID} from 'node:crypto';
import {LlmError,isAgentLoopRequest} from '@deepseek-ai/dsh-llm';
import {NativeToolExecutor} from '@deepseek-ai/dsh-tool-executor-native';
import {z} from 'zod';
import {runtimeCommands,LOCAL_READ_TOOLS,LOCAL_DRAFT_TOOLS,RECOVERY_TOOLS,scopeChanging} from './employee-runtime-policy.js';
import {assertPublicText} from './employee-store.js';

const hash=v=>createHash('sha256').update(v).digest('hex'),bindingId=id=>'runtime-'+hash(id),system={kind:'owner',note:'Managed runtime admission'},fail=code=>{throw Error(code);};
const publicError=e=>/^(?:EMP|EXECUTION|RUNTIME|WORK|STATE|DEVICE|MEMBER|TENANT|ACCESS)_[A-Z_]+$/.test(e?.message??'')?e.message:'RUNTIME_AUTHORITY_UNAVAILABLE';
/** App admission, not an OS sandbox. All grants remain with the existing encrypted device vault. */
export class EmployeeRuntimeGate{
  constructor({ctx,directory,store,sync,clock=()=>Date.now()}){
    Object.assign(this,{ctx,directory,store,sync,clock});this.contexts=new WeakMap();this.active=new Map();this.models=new Map();this.renewals=new Map();this.closed=false;
    this.shutdown=new AbortController();this.remoteReports=new Map();this.lastReport=new Map();this.nativeExecutors=new Map();this.volatileUnknown=new Set();
    // An interrupted external tool has no new execution until its original attempt is reconciled.
    for(const row of this.store.db.prepare("SELECT json FROM entities WHERE type='managed_tool' AND json_extract(json,'$.state')='running'").all()){
      const run=JSON.parse(row.json),b=this.binding(run.rootSessionId);if(!b)fail('RUNTIME_BINDING_MISSING');
      this.store.mutate(run.botId,'runtime-recover:'+run.id,'runtime_recover',{toolRunId:run.id},system,()=>{
        const live=this.binding(run.rootSessionId);if(!live.unknown)this.save({...live,unknown:{code:'RUNTIME_PROCESS_INTERRUPTED',toolRunId:run.id,at:this.store.now()}},'managed_session','runtime_recover');
        return this.save({...run,state:'unknown',recoveredAt:this.store.now()},'managed_tool','runtime_tool_recover');
      });
    }
  }
  bindings(botId){return this.store.entitiesOfType(botId,'managed_session');}
  mountNative(agent){
    if(!agent||this.nativeExecutors.has(agent))return;if(typeof agent.ctx?.tools?.setExecutor!=='function')fail('RUNTIME_NATIVE_EXECUTOR_REQUIRED');
    const dispose=agent.ctx.tools.setExecutor(new NativeToolExecutor(agent.ctx));
    try{const prompt=agent.ctx.systemPrompt.context({name:'naumi:managed-runtime',order:75,required:true,text:()=>{
      const b=this.contextSync(agent);if(!b)return '';const m=this.mode(b);
      return 'Managed enterprise task admission (restrictions intersect original permissions; not a grant): '+JSON.stringify({taskId:b.taskId,mode:m.mode,reason:m.reason,localReadTools:[...LOCAL_READ_TOOLS],localDraftTools:[...LOCAL_DRAFT_TOOLS],onlineTools:m.mode==='online'?b.allowedTools:[],recoveryTools:[...RECOVERY_TOOLS]})+' Never bypass a denied tool with shell, raw Node programs, a new Session, another Bot or a schedule. No automatic replay after UNKNOWN. Report waiting state and let the owner reconcile the original executor. Business acceptance remains server-authoritative.';
    }});this.nativeExecutors.set(agent,()=>{prompt();dispose();});}catch(e){dispose();throw e;}
  }
  binding(sessionId){const row=this.store.db.prepare("SELECT json FROM entities WHERE type='managed_session' AND id=?").get(bindingId(sessionId));return row?JSON.parse(row.json):null;}
  save(value,type,action,actor=system){return this.store.put({...value,revision:(value.revision??0)+1,updatedAt:this.store.now()},type,action,actor);}
  change(binding,patch,action){return this.store.mutate(binding.botId,'gate:'+randomUUID(),action,{sessionId:binding.sessionId,patch},system,()=>{
    const live=this.binding(binding.sessionId);return this.save({...live,...patch},'managed_session',action);
  });}
  unknown(binding,code,toolRunId){if(!binding)return;this.volatileUnknown.add(binding.sessionId);if(binding.unknown)return binding;return this.change(binding,{unknown:{code,toolRunId,at:this.store.now()}},'runtime_unknown');}
  async context(agent){
    if(!agent)return null;let root=this.ctx.agentTeams.tryMembership(agent)?.root??agent,seen=new Set();
    for(let depth=0;depth<32;depth++){
      if(seen.has(root.id))fail('RUNTIME_PARENT_CYCLE');seen.add(root.id);
      const b=this.binding(root.id);if(b){this.contexts.set(agent,b.sessionId);return b;}
      const link=this.store.entity('__runtime__','lineage-'+hash(root.id));if(link){const b=this.binding(link.rootSessionId);if(!b)fail('RUNTIME_BINDING_MISSING');this.contexts.set(agent,b.sessionId);return b;}
      const parent=root.session?.header?.parentSession;if(!parent){this.contexts.set(agent,null);return null;}
      const direct=this.binding(parent);if(direct){
        this.store.mutate('__runtime__','lineage:'+root.id,'runtime_lineage',{sessionId:root.id,rootSessionId:direct.sessionId},system,()=>this.store.put({id:'lineage-'+hash(root.id),botId:'__runtime__',revision:1,sessionId:root.id,rootSessionId:direct.sessionId},'managed_lineage','runtime_lineage',system));
        this.contexts.set(agent,direct.sessionId);return direct;
      }
      const live=this.ctx.agents.get(parent),stored=live?null:await this.ctx.sessionPersistence.stat(parent);if(!live&&!stored)fail('RUNTIME_PARENT_UNAVAILABLE');root=live??{id:parent,session:{header:stored.header}};
    }
    fail('RUNTIME_PARENT_DEPTH');
  }
  contextSync(agent){
    if(!agent)return null;const direct=this.binding(agent.id);if(direct)return direct;
    const root=this.ctx.agentTeams.tryMembership(agent)?.root;if(root){const b=this.binding(root.id);if(b)return b;}
    const cached=this.contexts.get(agent);if(cached)return this.binding(cached)??fail('RUNTIME_BINDING_MISSING');
    if(this.contexts.has(agent))return null;
    // Async admission must resolve fork ancestry before the last-mile guard accepts it.
    if(agent.session?.header?.parentSession)fail('RUNTIME_CONTEXT_PENDING');return null;
  }
  authorization(b){
    if(this.closed)fail('RUNTIME_GATE_CLOSED');
    const bot=this.directory.forSession(b.sessionId);if(!bot||bot.id!==b.botId||bot.status!=='active')fail('RUNTIME_BOT_BINDING_CHANGED');
    if(this.sync.deviceId!==b.deviceId||this.sync.registration()?.tenantId!==b.tenantId)fail('RUNTIME_DEVICE_BINDING_CHANGED');
    const claims=this.sync.offlineClaims();if(claims.memberId!==b.memberId)fail('RUNTIME_ACCOUNT_BINDING_CHANGED');if(!claims.bindings.some(x=>x.localBotId===b.botId&&x.employeeId===b.employeeId))fail('EMP_DEVICE_BINDING_REQUIRED');return claims;
  }
  mode(b){
    if(!b)return {mode:'unmanaged',reason:null};
    try{
      const c=this.authorization(b);if(b.state!=='active')return {mode:b.state,reason:b.state==='stopped'?'RUNTIME_STOPPED':'RUNTIME_PAUSED'};
      if(!c.capabilities.includes('local.infer'))return {mode:'waiting_authority',reason:'RUNTIME_INFERENCE_NOT_AUTHORIZED'};
      const g=this.sync.enterpriseWork.leases.cached(b.botId,b.taskId);
      const valid=g&&g.ownerDeviceId===b.deviceId&&g.taskId===b.taskId&&g.employeeId===b.employeeId&&g.attemptId===b.attemptId&&g.fencingToken===b.fencingToken&&g.state==='owned'&&Date.parse(g.leaseExpiresAt)>this.clock();
      const unresolved=b.unknown||this.volatileUnknown.has(b.sessionId);
      if(!unresolved&&valid)return {mode:'online',reason:null,expiresAt:g.leaseExpiresAt,claims:c};
      if(b.allowOfflineLocal&&c.capabilities.includes('local.infer'))return {mode:'local_only',reason:unresolved?'RUNTIME_RESULT_UNRESOLVED':'RUNTIME_LEASE_UNAVAILABLE',claims:c};
      return {mode:'waiting_authority',reason:unresolved?'RUNTIME_RESULT_UNRESOLVED':'RUNTIME_LEASE_UNAVAILABLE'};
    }catch(e){return {mode:'waiting_authority',reason:publicError(e)};}
  }
  inference(b){const m=this.mode(b);return ['unmanaged','online','local_only'].includes(m.mode)?null:m.reason;}
  deny(exec){
    try{
      const b=this.contextSync(exec.agent);if(!b)return;
      const claims=this.authorization(b),name=exec.name;
      if(RECOVERY_TOOLS.has(name))return;
      if(name==='run_code')return 'RUNTIME_PROGRAM_TRANSPORT_DISABLED';
      if(scopeChanging(name))return 'RUNTIME_SCOPE_CHANGE_REQUIRES_NEW_BINDING';
      const m=this.mode(b);if(!['online','local_only'].includes(m.mode))return m.reason;
      if(LOCAL_READ_TOOLS.has(name))return claims.capabilities.includes('local.read')?undefined:'RUNTIME_LOCAL_READ_NOT_AUTHORIZED';
      if(LOCAL_DRAFT_TOOLS.has(name))return claims.capabilities.includes('local.draft')?undefined:'RUNTIME_LOCAL_DRAFT_NOT_AUTHORIZED';
      if(m.mode!=='online')return m.reason;
      if(!b.allowedTools.includes(name))return 'RUNTIME_TOOL_NOT_APPROVED';
      if(['employee_enterprise_claim','employee_enterprise_submit'].includes(name)&&exec.arguments?.taskId!==b.taskId)return 'RUNTIME_TASK_SCOPE_MISMATCH';
    }catch(e){return publicError(e);}
  }
  assertMarker(botId,sessionId,taskId,marker){
    const b=this.binding(sessionId);if(!b||b.botId!==botId||b.taskId!==taskId)fail('RUNTIME_SESSION_BINDING_REQUIRED');
    const m=this.mode(b);if(m.mode!=='online')fail(m.reason??'RUNTIME_PERMIT_REQUIRED');
    if(marker&&(marker.attemptId!==b.attemptId||marker.fencingToken!==b.fencingToken))fail('RUNTIME_ATTEMPT_CHANGED');return b;
  }
  async command(raw){
    const p=runtimeCommands.parse(raw);this.sync.bot(p.botId);const agent=this.ctx.agents.get(p.sessionId);
    const old=this.store.db.prepare('SELECT digest FROM operations WHERE bot_id=? AND operation_id=?').get(p.botId,p.operationId);
    if(old)return this.store.mutate(p.botId,p.operationId,'runtime_'+p.action,p,{kind:'owner'},()=>fail('RUNTIME_IDEMPOTENCY_INVARIANT'));
    const busy=()=>this.ctx.agents.list().some(a=>a.status==='running'&&(a.id===p.sessionId||this.ctx.agentTeams.tryMembership(a)?.root.id===p.sessionId||this.contexts.get(a)===p.sessionId||a.session?.header?.parentSession===p.sessionId))||[...this.active.values()].some(v=>v.rootSessionId===p.sessionId);
    if(!['pause','stop'].includes(p.action)&&busy())fail('RUNTIME_SESSION_BUSY');
    if(p.action==='attach'){
      if(this.binding(p.sessionId))fail('RUNTIME_BINDING_IMMUTABLE');
      if(this.directory.forSession(p.sessionId)?.id!==p.botId)fail('RUNTIME_SESSION_BOT_MISMATCH');
      const stored=agent?{header:agent.session.header}:await this.ctx.sessionPersistence.stat(p.sessionId);if(!stored)fail('RUNTIME_SESSION_NOT_FOUND');
      if(stored.header.origin==='subagent'||stored.header.parentSession||stored.header.delegationDepth>0)fail('RUNTIME_ROOT_SESSION_REQUIRED');
      if(p.allowedTools.some(scopeChanging))fail('RUNTIME_SCOPE_CHANGE_REQUIRES_NEW_BINDING');
      const visible=new Set(this.ctx.tools.definitions(agent).map(t=>t.name));if(p.allowedTools.some(n=>!visible.has(n)))fail('RUNTIME_TOOL_NOT_REGISTERED');
      const c=this.sync.offlineClaims(),employeeId=c.bindings.find(b=>b.localBotId===p.botId)?.employeeId;if(!employeeId)fail('EMP_DEVICE_BINDING_REQUIRED');
      const prior=this.store.db.prepare("SELECT json FROM entities WHERE type='managed_session' AND json_extract(json,'$.taskId')=?").all(p.taskId).map(r=>JSON.parse(r.json));
      if(prior.some(b=>b.state!=='stopped'||b.unknown||this.volatileUnknown.has(b.sessionId)))fail('RUNTIME_TASK_ALREADY_BOUND');
      const inspected=await this.sync.device({action:'execution.inspect',employeeId,taskId:p.taskId},{signal:this.shutdown.signal});
      if(prior.length&&(inspected.execution?.ownerDeviceId!==null||prior.some(b=>BigInt(inspected.execution?.fencingToken??'0')<=BigInt(b.fencingToken??'0'))))fail('RUNTIME_SERVER_STOP_CONFIRMATION_REQUIRED');
      const result=this.store.mutate(p.botId,p.operationId,'runtime_attach',p,{kind:'owner'},()=>{
        if(busy())fail('RUNTIME_SESSION_BUSY');
        if(this.binding(p.sessionId))fail('RUNTIME_BINDING_IMMUTABLE');
        const prior=this.store.db.prepare("SELECT json FROM entities WHERE type='managed_session' AND json_extract(json,'$.taskId')=?").all(p.taskId).map(r=>JSON.parse(r.json));
        if(prior.some(b=>b.state!=='stopped'||b.unknown||this.volatileUnknown.has(b.sessionId)))fail('RUNTIME_TASK_ALREADY_BOUND');
        if(prior.length&&(inspected.execution?.ownerDeviceId!==null||prior.some(b=>BigInt(inspected.execution?.fencingToken??'0')<=BigInt(b.fencingToken??'0'))))fail('RUNTIME_SERVER_STOP_CONFIRMATION_REQUIRED');
        return this.save({id:bindingId(p.sessionId),botId:p.botId,sessionId:p.sessionId,taskId:p.taskId,employeeId,tenantId:c.tenantId,memberId:c.memberId,deviceId:this.sync.deviceId,allowedTools:p.allowedTools,allowOfflineLocal:p.allowOfflineLocal,state:'paused',attemptId:null,fencingToken:null,unknown:null,createdAt:this.store.now()},'managed_session','runtime_attach',{kind:'owner'});
      });
      this.mountNative(agent);return result;
    }
    let b=this.binding(p.sessionId);if(!b||b.botId!==p.botId)fail('RUNTIME_SESSION_BINDING_REQUIRED');
    // Exact repeats return the committed result, including a successful resume whose revision advanced.
    if(b.revision!==p.expectedRevision)fail('RUNTIME_CONFLICT');if(b.state==='stopped'&&p.action!=='resolve_unknown')fail('RUNTIME_STOPPED');
    if(p.action==='configure'){
      this.authorization(b);if(b.state!=='paused')fail('RUNTIME_PAUSE_REQUIRED');if(p.allowedTools.some(scopeChanging))fail('RUNTIME_SCOPE_CHANGE_REQUIRES_NEW_BINDING');
      const visible=new Set(this.ctx.tools.definitions(agent).map(t=>t.name));if(p.allowedTools.some(n=>!visible.has(n)))fail('RUNTIME_TOOL_NOT_REGISTERED');
    }
    if(p.action==='resolve_unknown'){
      assertPublicText(p.reason);if(!b.unknown&&!this.volatileUnknown.has(b.sessionId))fail('RUNTIME_NOT_UNKNOWN');this.authorization(b);
      const r=await this.sync.device({action:'execution.inspect',employeeId:b.employeeId,taskId:b.taskId},{signal:this.shutdown.signal});
      if(r.execution?.ownerDeviceId!==null||!['idle','finished'].includes(r.execution?.state)||BigInt(r.execution.fencingToken)<=BigInt(b.fencingToken??'0'))fail('RUNTIME_SERVER_STOP_CONFIRMATION_REQUIRED');
    }
    if(p.action==='resume'){
      this.authorization(b);if(b.unknown||this.volatileUnknown.has(b.sessionId))fail('RUNTIME_RESULT_UNRESOLVED');
      await this.sync.enterpriseWork.leases.ensure(b.botId,b.employeeId,b.taskId,{signal:this.shutdown.signal});
    }
    const result=this.store.mutate(p.botId,p.operationId,'runtime_'+p.action,p,{kind:'owner'},()=>{
      b=this.binding(p.sessionId);if(b.revision!==p.expectedRevision)fail('RUNTIME_CONFLICT');
      if(!['pause','stop'].includes(p.action)&&busy())fail('RUNTIME_SESSION_BUSY');
      const grant=p.action==='resume'?this.sync.enterpriseWork.leases.cached(b.botId,b.taskId):null;
      return this.save({...b,state:p.action==='resume'?'active':p.action==='stop'||b.state==='stopped'?'stopped':'paused',...(grant?{attemptId:grant.attemptId,fencingToken:grant.fencingToken}:{}),...(p.action==='configure'?{allowedTools:p.allowedTools,allowOfflineLocal:p.allowOfflineLocal}:{}),...(p.action==='resolve_unknown'?{unknown:null,stopReview:p.reason}: {})},'managed_session','runtime_'+p.action,{kind:'owner'});
    });
    if(p.action==='resolve_unknown')this.volatileUnknown.delete(p.sessionId);if(['pause','stop'].includes(p.action))this.tick();return result;
  }
  async execute(exec,next){
    const b=this.contextSync(exec.agent),denial=this.deny(exec);if(denial)throw Error(denial);
    const local=!b||LOCAL_READ_TOOLS.has(exec.name)||LOCAL_DRAFT_TOOLS.has(exec.name)||RECOVERY_TOOLS.has(exec.name);if(local)return next();
    const controller=new AbortController(),id='managed-tool-'+randomUUID(),original=exec.signal;
    const run={id,botId:b.botId,rootSessionId:b.sessionId,sessionId:exec.agent.id,revision:0,toolName:exec.name,callId:exec.callId,attemptId:b.attemptId,fencingToken:b.fencingToken,state:'running',startedAt:this.store.now()};
    this.store.mutate(b.botId,id,'runtime_tool_start',{id,callId:exec.callId},system,()=>this.save(run,'managed_tool','runtime_tool_start'));
    let finish,settled=false;const done=new Promise(resolve=>{finish=resolve;});
    this.active.set(id,{...run,controller,done});exec.signal=AbortSignal.any([original,controller.signal]);
    try{
      const result=await next(),expired=controller.signal.aborted||this.deny(exec),uncertain=!!expired||result.isError||result.value?.status==='unknown';
      if(uncertain)this.unknown(this.binding(b.sessionId),expired?'RUNTIME_TOOL_PERMIT_LOST':'RUNTIME_TOOL_RESULT_UNKNOWN',id);
      this.store.mutate(b.botId,id+':settle','runtime_tool_end',{id,uncertain},system,()=>this.save({...run,revision:1,state:uncertain?'unknown':'completed',endedAt:this.store.now()},'managed_tool','runtime_tool_end'));
      settled=true;
      if(expired)throw Error('RUNTIME_TOOL_RESULT_UNKNOWN');return result;
    }catch(e){this.unknown(this.binding(b.sessionId),'RUNTIME_TOOL_RESULT_UNKNOWN',id);if(!settled)this.store.mutate(b.botId,id+':error','runtime_tool_error',{id},system,()=>this.save({...run,revision:1,state:'unknown',endedAt:this.store.now()},'managed_tool','runtime_tool_error'));throw e;}
    finally{exec.signal=original;this.active.delete(id);finish();}
  }
  tick(){
    if(this.closed)return;
    for(const run of this.active.values()){
      const b=this.binding(run.rootSessionId),m=this.mode(b);
      if(m.mode!=='online'){run.controller.abort(Error('RUNTIME_TOOL_PERMIT_LOST'));try{this.unknown(b,'RUNTIME_TOOL_PERMIT_LOST',run.id);}catch{this.ctx.logger?.warn('RUNTIME_UNKNOWN_STORAGE_FAILED');}}
    }
    for(const {agent} of this.models.values()){
      const b=this.contextSync(agent),reason=this.inference(b);if(reason)agent.cancel({kind:'hook',reason},{keepInbox:true});
    }
    for(const row of this.store.db.prepare("SELECT json FROM entities WHERE type='managed_session' AND json_extract(json,'$.unknown') IS NOT NULL").all()){
      const b=JSON.parse(row.json);if(!b.unknown||b.unknown.remoteReportedAt||this.remoteReports.has(b.sessionId)||this.clock()-(this.lastReport.get(b.sessionId)??0)<5000)continue;
      this.lastReport.set(b.sessionId,this.clock());
      const flight=(async()=>{try{const r=await this.sync.device({action:'execution.inspect',employeeId:b.employeeId,taskId:b.taskId},{signal:this.shutdown.signal}),x=r.execution;
        if(x?.attemptId===b.attemptId&&x?.fencingToken===b.fencingToken&&x.ownerDeviceId===b.deviceId){if(x.state==='owned')await this.sync.enterpriseWork.leases.uncertain(b.botId,b.employeeId,b.taskId,b.unknown.code);else if(x.state!=='unknown')return;
          if(!this.closed){const live=this.binding(b.sessionId);if(live.unknown)this.change(live,{unknown:{...live.unknown,remoteReportedAt:this.store.now()}},'runtime_unknown_reported');}}
      }catch{}})().finally(()=>this.remoteReports.delete(b.sessionId));this.remoteReports.set(b.sessionId,flight);
    }
    for(const agent of this.ctx.agents.list()){
      let b;try{b=this.contextSync(agent);}catch{continue;}if(!b||b.state!=='active'||b.unknown||this.volatileUnknown.has(b.sessionId)||agent.status!=='running'||this.renewals.has(b.sessionId))continue;
      const grant=this.sync.enterpriseWork.leases.cached(b.botId,b.taskId),ttl=grant?Date.parse(grant.leaseExpiresAt)-this.clock():0;
      if(ttl>Math.max(10000,(grant?.leaseSeconds??60)*500))continue;
      const last=this.lastRenewal?.get(b.sessionId)??0;if(this.clock()-last<5000)continue;
      (this.lastRenewal??=new Map()).set(b.sessionId,this.clock());
      const flight=(async()=>{try{this.authorization(b);await this.sync.enterpriseWork.leases.renew(b.botId,b.employeeId,b.taskId,{attemptId:b.attemptId,fencingToken:b.fencingToken},{signal:this.shutdown.signal});}
        catch(e){const code=publicError(e);if(!['RUNTIME_AUTHORITY_UNAVAILABLE','EMP_SYNC_UNAVAILABLE'].includes(code)&&!this.closed)this.unknown(this.binding(b.sessionId),code,null);}
      })().catch(()=>this.ctx.logger?.warn('RUNTIME_RENEWAL_FAILED')).finally(()=>this.renewals.delete(b.sessionId));this.renewals.set(b.sessionId,flight);
    }
  }
  read(botId){return {configured:true,bindings:this.bindings(botId).map(b=>({...b,unknown:b.unknown??(this.volatileUnknown.has(b.sessionId)?{code:'RUNTIME_UNKNOWN_STORAGE_FAILED'}:null),admission:{...this.mode(b),claims:undefined},inFlight:[...this.active.values()].filter(r=>r.rootSessionId===b.sessionId).length})),sessions:this.directory.list().bots.find(b=>b.id===botId)?.sessionIds??[],tools:[...new Set((this.ctx.tools.definitions(this.ctx.agents.get(this.directory.list().bots.find(b=>b.id===botId)?.homeSessionId))).map(t=>t.name))].filter(n=>!scopeChanging(n)&&!LOCAL_READ_TOOLS.has(n)&&!LOCAL_DRAFT_TOOLS.has(n)&&!RECOVERY_TOOLS.has(n)).sort(),localTools:[...LOCAL_READ_TOOLS,...LOCAL_DRAFT_TOOLS],scope:'local-owner-controls-with-signed-enterprise-authorization'};}
  async close(){this.closed=true;await this.initialization;this.shutdown.abort(Error('RUNTIME_GATE_CLOSED'));for(const run of this.active.values()){run.controller.abort(Error('RUNTIME_GATE_CLOSED'));try{this.unknown(this.binding(run.rootSessionId),'RUNTIME_PROCESS_STOPPING',run.id);}catch{this.ctx.logger?.warn('RUNTIME_UNKNOWN_STORAGE_FAILED');}}for(const {agent} of this.models.values())agent.cancel({kind:'hook',reason:'RUNTIME_GATE_CLOSED'},{keepInbox:true});await Promise.allSettled([...this.renewals.values(),...this.remoteReports.values(),...[...this.active.values()].map(r=>r.done)]);for(const dispose of this.nativeExecutors.values())dispose();this.nativeExecutors.clear();}
}

export function installEmployeeRuntimeGate(scope,directory,store,{sync,intervalMs=1000}={}){
  if(!sync?.enterpriseWork)return null;
  if(typeof scope.tools.guard!=='function')fail('RUNTIME_TOOL_GUARD_UNAVAILABLE');
  const gate=new EmployeeRuntimeGate({ctx:scope,directory,store,sync});sync.runtimeGate=gate;
  const guard=scope.tools.guard(exec=>gate.deny(exec));
  scope.on('agent/created',async({agent})=>{if(await gate.context(agent))gate.mountNative(agent);});
  scope.on('agent/disposed',({agent})=>{gate.nativeExecutors.get(agent)?.();gate.nativeExecutors.delete(agent);});
  gate.initialization=Promise.allSettled(scope.agents.list().map(async agent=>{if(await gate.context(agent))gate.mountNative(agent);}));
  scope.on('agent/pre-step',async(payload,next)=>{payload.signal.throwIfAborted();const b=await gate.context(payload.agent);if(gate.inference(b))return {kind:'reject'};const decision=await next();payload.signal.throwIfAborted();return gate.inference(gate.contextSync(payload.agent))?{kind:'reject'}:decision;});
  scope.on('tools/pre-execute',async(exec,next)=>{exec.signal.throwIfAborted();await gate.context(exec.agent);const reason=gate.deny(exec);return reason?{kind:'deny',reason}:next();});
  scope.on('tools/execute',(exec,next)=>gate.execute(exec,next));
  scope.on('llm/stream',async function*(options,next){
    const agent=options.sessionId?scope.agents.get(options.sessionId):null,b=agent?await gate.context(agent):options.sessionId?gate.binding(options.sessionId):null,reason=gate.inference(b);
    if(reason)throw new LlmError(reason,'RUNTIME_ADMISSION_DENIED');
    const token=randomUUID();if(b&&agent&&isAgentLoopRequest(options))gate.models.set(token,{agent});
    try{for await(const chunk of next()){const reason=gate.inference(agent?gate.contextSync(agent):b?gate.binding(b.sessionId):null);if(reason)throw new LlmError(reason,'RUNTIME_ADMISSION_DENIED');yield chunk;}}finally{gate.models.delete(token);}
  });
  scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/employee-runtime-gate',handler:async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');const a=scope.connection.admit(req);if('rejection'in a){res.writeHead(a.rejection).end();return;}if(a.peer.principal.kind!=='owner'){res.writeHead(403).end();return;}
    const send=(code,v)=>{if(!res.destroyed)res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(v));};
    try{
      if(req.method==='GET'){const botId=z.string().min(1).max(200).parse(new URL(req.url,'http://localhost').searchParams.get('botId'));if(!directory.list().bots.some(b=>b.id===botId))fail('EMP_BOT_NOT_FOUND');send(200,gate.read(botId));return;}
      if(req.method!=='POST'){res.setHeader('Allow','GET, POST');send(405,{error:'METHOD_NOT_ALLOWED'});return;}
      if(req.headers['x-naumi-runtime-gate']!=='1'||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){send(403,{error:'RUNTIME_SAME_ORIGIN_REQUIRED'});return;}
      const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>32768){send(413,{error:'RUNTIME_REQUEST_TOO_LARGE'});return;}chunks.push(Buffer.from(c));}
      let p;try{p=runtimeCommands.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{send(400,{error:'RUNTIME_INVALID_REQUEST'});return;}send(200,await gate.command(p));
    }catch(e){const code=e instanceof z.ZodError?'RUNTIME_INVALID_REQUEST':publicError(e);send(/CONFLICT|BUSY|IMMUTABLE/.test(code)?409:/NOT_FOUND/.test(code)?404:/REQUIRED|CHANGED|UNRESOLVED|STOPPED|REGISTERED/.test(code)?403:/UNAVAILABLE/.test(code)?503:400,{error:code});}
  }}));
  const timer=setInterval(()=>{try{gate.tick();}catch{scope.logger.warn('RUNTIME_GATE_SCAN_FAILED');}},intervalMs);timer.unref?.();
  return {gate,async close(){clearInterval(timer);await gate.close();guard();if(sync.runtimeGate===gate)delete sync.runtimeGate;}};
}
