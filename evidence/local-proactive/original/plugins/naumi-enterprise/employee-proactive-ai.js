import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {freezeMessage,LlmError,isAgentLoopRequest} from '@deepseek-ai/dsh-llm';
import {EmployeeWorkStore} from './employee-work-store.js';
import {inWorkWindow} from './employee-activity-store.js';
import {assertPublicText} from './employee-store.js';
import {createBotTaskRuntime} from './bot-task-runtime.js';

const id=z.string().min(1).max(200),terminal=new Set(['awaiting_review','failed','cancelled','expired','reviewed_stopped']);
export const aiCommands=z.discriminatedUnion('action',[
  z.object({action:z.literal('ai_job_cancel'),botId:id,operationId:id,jobId:id,expectedRevision:z.number().int().positive()}).strict(),
  z.object({action:z.literal('ai_job_resolve'),botId:id,operationId:id,jobId:id,expectedRevision:z.number().int().positive(),confirmedStopped:z.literal(true),reason:z.string().trim().min(6).max(1000)}).strict(),
]);
const actor={kind:'owner',note:'Explicitly approved proactive AI lifecycle; not business acceptance'},fail=code=>{throw Error(code);};
const publicCode=e=>/^(?:ACT|EMP|MODEL|WORK|RUNTIME|EXECUTION)_[A-Z_]+$/.test(e?.code??e?.message??'')?e.code??e.message:'ACT_AI_CHANNEL_UNAVAILABLE';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

/** Durable work admission over the existing AgentLoop. Never fabricates a business completion. */
export class EmployeeProactiveAi{
  constructor({ctx,directory,store,activity,sync}){
    Object.assign(this,{ctx,directory,store,activity,sync});this.work=new EmployeeWorkStore(store);
    this.active=new Map();this.retired=new WeakMap();this.reservedSessions=new Set();this.flights=new Map();this.finishing=new Map();this.volatile=new Set();this.retryAt=new Map();this.shutdown=new AbortController();this.closed=false;
    for(const row of this.rows().filter(j=>['starting','running','stopping','settling'].includes(j.state)))this.change(row,{state:'unknown',reason:'ACT_AI_PROCESS_INTERRUPTED'},'ai_recover');
    if(sync?.models){if(sync.models.proactive)fail('ACT_AI_ALREADY_INSTALLED');sync.models.proactive=this;}
  }
  now(){return this.store.clock().getTime();}
  rows(botId){return botId?this.store.entitiesOfType(botId,'proactive_ai'):this.store.db.prepare("SELECT json FROM entities WHERE type='proactive_ai'").all().map(r=>JSON.parse(r.json));}
  job(botId,jobId){const j=this.store.entity(botId,jobId);if(!j||!jobId.startsWith('ai-job-'))fail('ACT_AI_JOB_NOT_FOUND');return j;}
  change(j,patch,action){return this.store.mutate(j.botId,'ai:'+randomUUID(),action,{jobId:j.id,patch},actor,()=>{const live=this.job(j.botId,j.id);return this.store.put({...live,...patch,revision:live.revision+1,updatedAt:this.store.now()},'proactive_ai',action,actor);});}
  configured(){return !!this.sync?.runtimeGate&&!!this.sync?.models;}
  rootId(agent){return this.sync?.runtimeGate?.contextSync(agent)?.sessionId??agent.id;}
  entry(agent){return this.active.get(this.rootId(agent))??this.retired.get(agent);}
  idle(agent){return agent?.status==='idle'&&!agent.inbox.nextTurn.length&&!agent.inbox.nextStep.length;}
  validApproval(j){const r=this.activity.rule(j.botId,j.ruleId);return r.configVersion===j.configVersion&&r.approvalId===j.approvalId&&!!r.approvalId;}
  validate(botId,config){
    if(config.action.kind!=='run_agent')return;
    if(!this.configured())fail('ACT_AI_NOT_CONFIGURED');
    const a=config.action,b=this.sync.runtimeGate.binding(a.sessionId);if(!b||b.botId!==botId||b.taskId!==a.taskId||b.state==='stopped')fail('ACT_AI_MANAGED_SESSION_REQUIRED');
    this.sync.runtimeGate.authorization(b);this.work.goal(botId,a.goalId);
    const selected=this.ctx.agents.get(a.sessionId)?.model.current();if(selected&&(selected.provider!=='naumi-enterprise'||selected.model!==a.model))fail('ACT_AI_MODEL_SELECTION_CHANGED');
  }
  check(j,agent,{running=false,selection}={}){
    if(this.closed)return 'ACT_AI_STOPPING';if(this.volatile.has(j.action.sessionId))return 'ACT_AI_STORAGE_UNRESOLVED';
    if(running&&j.state!=='running')return 'ACT_AI_RUN_NOT_ACTIVE';
    if(!this.validApproval(j))return 'ACT_AI_APPROVAL_REVOKED';
    const bot=this.directory.forSession(j.action.sessionId);if(!bot||bot.id!==j.botId||bot.status!=='active')return 'ACT_AI_BOT_CHANGED';
    const now=this.now(),high=this.store.db.prepare('SELECT high_water_ms FROM employee_activity_clock WHERE id=1').get()?.high_water_ms??0;if(now+1000<high)return 'ACT_AI_CLOCK_ROLLBACK';
    if(!inWorkWindow(j.workWindow,now))return 'ACT_AI_QUIET_TIME';
    if(running&&now-Date.parse(j.startedAt)>=j.action.maxSeconds*1000)return 'ACT_AI_TIME_LIMIT';
    const goal=this.work.goal(j.botId,j.action.goalId);if(!['planned','in_progress'].includes(goal.status))return 'ACT_AI_GOAL_NOT_ACTIVE';
    if(goal.dependencies.some(id=>this.work.goal(j.botId,id).status!=='completed'))return 'ACT_AI_WAITING_DEPENDENCY';
    const b=this.sync?.runtimeGate?.binding(j.action.sessionId);if(!b||b.botId!==j.botId||b.taskId!==j.action.taskId)return 'ACT_AI_MANAGED_SESSION_REQUIRED';
    if(b.unknown||this.sync.runtimeGate.volatileUnknown.has(b.sessionId))return 'ACT_AI_EXECUTOR_UNRESOLVED';
    const selected=selection??agent?.model.current();if(selected&&(selected.provider!=='naumi-enterprise'||selected.model!==j.action.model))return 'ACT_AI_MODEL_SELECTION_CHANGED';
    return this.sync.runtimeGate.inference(b,{provider:'naumi-enterprise'})??null;
  }
  cleanInbox(agent){for(const j of this.rows().filter(j=>j.action.sessionId===agent.id&&j.messageId&&['unknown','reviewed_stopped','cancelled','failed','expired'].includes(j.state)))agent.inbox.remove(j.messageId);}
  modelStarting(agent,requestId,options,captured){
    const entry=captured??this.entry(agent);if(!entry)return null;entry.controller.signal.throwIfAborted();const j=this.job(entry.botId,entry.id),denial=entry.reason??this.check(j,agent,{running:true,selection:options});
    if(denial)throw new LlmError(denial,'ACT_AI_ADMISSION_DENIED');if(j.modelRequests>=j.action.maxModelRequests)throw new LlmError('ACT_AI_REQUEST_LIMIT','ACT_AI_REQUEST_LIMIT');
    try{this.change(j,{modelRequests:j.modelRequests+1,modelRequestIds:[...j.modelRequestIds,requestId]},'ai_model_dispatch');}
    catch(e){this.volatile.add(j.action.sessionId);this.stop(entry,'ACT_AI_STORAGE_UNRESOLVED');throw e;}
    return {signal:entry.controller.signal};
  }
  guard(exec){
    const entry=this.entry(exec.agent);if(!entry)return;const j=this.job(entry.botId,entry.id),denial=entry.reason??this.check(j,exec.agent,{running:true});if(denial)return denial;
    if(/^employee_enterprise_(claim|upload|submit)$/.test(exec.name)&&exec.arguments?.taskId&&exec.arguments.taskId!==j.action.taskId)return 'ACT_AI_TASK_SCOPE_CHANGED';
    if(exec.name==='employee_delivery_create'&&exec.arguments?.goalId!==j.action.goalId)return 'ACT_AI_GOAL_SCOPE_CHANGED';
    if(['employee_delivery_revise','employee_delivery_submit'].includes(exec.name)&&this.work.delivery(j.botId,exec.arguments?.deliveryId).goalId!==j.action.goalId)return 'ACT_AI_GOAL_SCOPE_CHANGED';
  }
  stop(entry,reason){
    if(entry.reason)return;entry.reason=reason;entry.controller.abort(Error(reason));
    try{this.change(this.job(entry.botId,entry.id),{state:'stopping',reason},'ai_stop');}catch{this.volatile.add(entry.sessionId);}
    for(const agent of this.ctx.agents.list())if(this.rootId(agent)===entry.sessionId)agent.cancel({kind:'hook',reason},{keepInbox:true});
    entry.agent.inbox.remove(entry.messageId);if(entry.turn===null)void this.finish(entry,{kind:'aborted'});
  }
  waiting(j,state,reason){if(j.state!==state||j.reason!==reason)this.change(j,{state,reason},'ai_wait');this.retryAt.set(j.id,this.now()+15000);}
  async budget(j){
    let value=await this.sync.models.credential(j.botId,j.action.taskId,{signal:this.shutdown.signal}),b;
    try{b=await this.sync.models.gateway(value,'/budget',{signal:this.shutdown.signal});}catch(e){if(publicCode(e)!=='MODEL_POLICY_STALE')throw e;value=await this.sync.models.credential(j.botId,j.action.taskId,{force:true,signal:this.shutdown.signal});b=await this.sync.models.gateway(value,'/budget',{signal:this.shutdown.signal});}
    const route=value.models.find(m=>m.id===j.action.model);if(!route)fail('MODEL_ROUTE_NOT_AUTHORIZED');
    const cost=Number((BigInt(route.contextTokens)*BigInt(route.inputMicrosPerMillion)+999999n)/1000000n+(BigInt(route.maxOutputTokens)*BigInt(route.outputMicrosPerMillion)+999999n)/1000000n),tokens=route.contextTokens+route.maxOutputTokens;
    for(const s of b.scopes){if(s.usage.spent_cost+s.usage.reserved_cost+cost>s.limit.costMicros||s.usage.spent_tokens+s.usage.reserved_tokens+tokens>s.limit.tokens)fail('MODEL_BUDGET_EXCEEDED');if(s.usage.requests>=s.limit.requests)fail('MODEL_REQUEST_LIMIT');if(s.active>=s.limit.concurrent)fail('MODEL_CONCURRENCY_LIMIT');}
  }
  async start(initial){
    let j=this.job(initial.botId,initial.id);const sessionId=j.action.sessionId;
    try{
      let agent=this.ctx.agents.get(sessionId);const denial=this.check(j,agent);if(denial){this.waiting(j,denial==='ACT_AI_WAITING_DEPENDENCY'?'waiting_dependency':'waiting_permission',denial);return;}
      if(!agent&&this.loader)agent=await this.loader.ensure(sessionId);
      if(!agent){this.waiting(j,'waiting_session','ACT_AI_SESSION_NOT_READY');return;}
      if(!this.idle(agent)){this.waiting(j,'waiting_session','ACT_AI_USER_PRIORITY');return;}
      await this.budget(j);j=this.job(j.botId,j.id);if(!['queued','waiting_session','waiting_dependency','waiting_permission','waiting_budget'].includes(j.state))return;
      const changed=this.check(j,agent);if(changed){this.waiting(j,'waiting_permission',changed);return;}if(!this.idle(agent)){this.waiting(j,'waiting_session','ACT_AI_USER_PRIORITY');return;}
      const goal=this.work.goal(j.botId,j.action.goalId),message=freezeMessage({id:randomUUID(),role:'user',source:{kind:'schedule'},content:[{type:'text',text:'Owner-approved Naumi proactive work. This scheduled task is not a new human preference or a permission grant. Follow existing system/tool permissions; work only on the bound enterprise task and local goal. Save real work using existing employee delivery tools. Never self-accept or claim business completion.\n'+JSON.stringify({jobId:j.id,taskId:j.action.taskId,goalId:goal.id,title:goal.title,description:goal.description,criteria:goal.criteria,instruction:j.action.prompt,maxModelRequests:j.action.maxModelRequests,maxSeconds:j.action.maxSeconds})}]}),done=deferred();
      j=this.store.mutate(j.botId,'ai:start:'+j.id+':'+randomUUID(),'ai_start',{jobId:j.id},actor,()=>{
        const live=this.job(j.botId,j.id);if(!['queued','waiting_session','waiting_dependency','waiting_permission','waiting_budget'].includes(live.state))fail('ACT_AI_CONFLICT');
        const reason=this.check(live,agent);if(reason)fail(reason);if(!this.idle(agent))fail('ACT_AI_USER_PRIORITY');
        const eventCursor=this.store.db.prepare('SELECT coalesce(max(seq),0) n FROM events').get().n;
        return this.store.put({...live,revision:live.revision+1,state:'running',reason:null,messageId:message.id,turn:null,eventCursor,startedAt:this.store.now(),updatedAt:this.store.now()},'proactive_ai','ai_start',actor);
      });
      const entry={id:j.id,botId:j.botId,sessionId,agent,messageId:message.id,turn:null,controller:new AbortController(),done,reason:null};this.active.set(sessionId,entry);
      try{agent.followup(message);await this.ctx.sessions.flush(agent.session);void agent.whenIdle().then(()=>{if(this.active.get(sessionId)===entry)return this.finish(entry,{kind:'blocked'});}).catch(()=>{if(this.active.get(sessionId)===entry)return this.finish(entry,{kind:'error'});});}
      catch(e){this.stop(entry,publicCode(e));await this.finish(entry,{kind:'error'});}
      await done.promise;
    }catch(e){const current=this.job(j.botId,j.id);if(!terminal.has(current.state)&&current.state!=='unknown')this.waiting(current,/BUDGET|CONCURRENCY|REQUEST_LIMIT/.test(publicCode(e))?'waiting_budget':'waiting_permission',publicCode(e));}
  }
  artifacts(j){
    const ids=new Set(),artifacts=new Set();for(const row of this.store.db.prepare("SELECT json FROM events WHERE bot_id=? AND seq>? AND type='delivery'").all(j.botId,j.eventCursor??0)){
      const e=JSON.parse(row.json);if(e.source?.kind==='agent'&&e.source.sessionId===j.action.sessionId&&e.value.goalId===j.action.goalId){ids.add(e.entityId);for(const id of e.value.artifactIds??[])artifacts.add(id);}
    }return {deliveryIds:[...ids],artifactIds:[...artifacts]};
  }
  async receipts(j){if(!j.modelRequestIds.length)return [];const value=await this.sync.models.credential(j.botId,j.action.taskId,{signal:this.shutdown.signal});return Promise.all(j.modelRequestIds.map(id=>this.sync.models.gateway(value,'/receipt?id='+id,{signal:this.shutdown.signal})));}
  finish(entry,end){
    if(this.finishing.has(entry.id))return this.finishing.get(entry.id);entry.controller.abort(Error('ACT_AI_TURN_ENDED'));
    for(const agent of this.ctx.agents.list())if(agent.id!==entry.sessionId&&this.rootId(agent)===entry.sessionId){this.retired.set(agent,entry);agent.cancel({kind:'hook',reason:'ACT_AI_TURN_ENDED'},{keepInbox:true});}
    if(this.active.get(entry.sessionId)===entry)this.active.delete(entry.sessionId);
    const flight=(async()=>{
      let j=this.job(entry.botId,entry.id);try{
        j=this.change(j,{state:'settling',turn:entry.turn,endKind:end.kind},'ai_settling');await this.ctx.sessions.flush(entry.agent.session);
        let receipts=[],unresolved=false;try{receipts=await this.receipts(j);unresolved=receipts.some(r=>!['completed','rejected','charged_ceiling'].includes(r.state));}catch{unresolved=j.modelRequestIds.length>0;}
        const b=this.sync.runtimeGate.binding(entry.sessionId);unresolved||=!!b?.unknown||this.sync.runtimeGate.volatileUnknown.has(entry.sessionId)||this.volatile.has(entry.sessionId);
        const events=entry.agent.session.snapshotEvents(),answer=events.findLast(e=>e.type==='assistant/message'&&e.data.turn===entry.turn&&!e.data.message.toolCalls?.length),success=end.kind==='completed'&&!entry.reason&&j.modelRequests>0&&receipts.every(r=>r.state==='completed')&&!!answer;
        const state=unresolved?'unknown':success?'awaiting_review':entry.reason&&/USER_PRIORITY|OWNER_CANCEL|APPROVAL_REVOKED|STOPPING/.test(entry.reason)?'cancelled':'failed';
        this.change(j,{state,reason:unresolved?'ACT_AI_RESULT_UNRESOLVED':entry.reason??(success?null:publicCode(end.error??{message:'ACT_AI_TURN_'+end.kind.toUpperCase()})),...this.artifacts(j),assistantEvent:answer?{sessionId:entry.sessionId,seq:answer.seq,turn:entry.turn}:null,receipts:receipts.map(r=>({requestId:r.requestId,state:r.state,chargedCostMicros:r.chargedCostMicros})),endedAt:this.store.now()},'ai_settled');
      }catch{this.volatile.add(entry.sessionId);try{this.change(j,{state:'unknown',reason:'ACT_AI_STORAGE_UNRESOLVED'},'ai_settle_failed');}catch{this.ctx.logger.warn('ACT_AI_STORAGE_UNRESOLVED');}}
    })().finally(()=>{entry.done.resolve();this.finishing.delete(entry.id);});this.finishing.set(entry.id,flight);return flight;
  }
  tick(){
    if(this.closed)return;for(const entry of this.active.values()){const j=this.job(entry.botId,entry.id),denial=this.check(j,entry.agent,{running:true});if(denial)this.stop(entry,denial);}
    if(!this.configured())return;
    for(const j of this.rows().sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){
      if(terminal.has(j.state)||['unknown','running','stopping','settling'].includes(j.state))continue;
      if(!this.validApproval(j)){this.change(j,{state:'cancelled',reason:'ACT_AI_APPROVAL_REVOKED'},'ai_cancel_stale');continue;}
      if(this.now()-Date.parse(j.createdAt)>86400000){this.change(j,{state:'expired',reason:'ACT_AI_QUEUE_EXPIRED'},'ai_expire');continue;}
      if(this.flights.size>=4||this.reservedSessions.has(j.action.sessionId)||this.active.has(j.action.sessionId)||this.volatile.has(j.action.sessionId)||(this.retryAt.get(j.id)??0)>this.now())continue;
      if(this.rows().some(other=>other.id!==j.id&&other.action.sessionId===j.action.sessionId&&['unknown','running','stopping','settling'].includes(other.state)))continue;
      this.reservedSessions.add(j.action.sessionId);const flight=this.start(j).catch(()=>this.ctx.logger.warn('ACT_AI_CONSUMER_FAILED')).finally(()=>{this.flights.delete(j.id);this.reservedSessions.delete(j.action.sessionId);});this.flights.set(j.id,flight);
    }
  }
  async command(raw){
    const p=aiCommands.parse(raw);if(this.store.db.prepare('SELECT 1 FROM operations WHERE bot_id=? AND operation_id=?').get(p.botId,p.operationId))return this.store.mutate(p.botId,p.operationId,p.action,p,actor,()=>fail('ACT_AI_IDEMPOTENCY_INVARIANT'));
    const j=this.job(p.botId,p.jobId);if(j.revision!==p.expectedRevision)fail('ACT_AI_CONFLICT');
    if(p.action==='ai_job_resolve'){
      assertPublicText(p.reason);if(j.state!=='unknown')fail('ACT_AI_NOT_UNKNOWN');if(this.active.has(j.action.sessionId))fail('ACT_AI_SESSION_BUSY');
      const b=this.sync.runtimeGate.binding(j.action.sessionId);if(b?.unknown||this.sync.runtimeGate.volatileUnknown.has(j.action.sessionId))fail('ACT_AI_EXECUTOR_UNRESOLVED');
      const receipts=await this.receipts(j);if(receipts.some(r=>!['completed','rejected','charged_ceiling'].includes(r.state)))fail('ACT_AI_MODEL_UNRESOLVED');
    }else if(terminal.has(j.state)||j.state==='unknown')fail('ACT_AI_REVIEW_REQUIRED');
    const result=this.store.mutate(j.botId,p.operationId,p.action,p,actor,()=>{const live=this.job(j.botId,j.id);if(live.revision!==p.expectedRevision)fail('ACT_AI_CONFLICT');return this.store.put({...live,revision:live.revision+1,state:p.action==='ai_job_resolve'?'reviewed_stopped':this.active.has(j.action.sessionId)?'stopping':'cancelled',reason:p.action==='ai_job_resolve'?p.reason:'ACT_AI_OWNER_CANCEL',updatedAt:this.store.now()},'proactive_ai',p.action,actor);});
    if(p.action==='ai_job_resolve')this.volatile.delete(j.action.sessionId);else{const entry=this.active.get(j.action.sessionId);if(entry?.id===j.id)this.stop(entry,'ACT_AI_OWNER_CANCEL');}return result;
  }
  view(botId){return {configured:this.configured(),jobs:this.rows(botId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50),targets:this.sync?.runtimeGate?.bindings(botId).filter(b=>b.state!=='stopped').map(b=>({sessionId:b.sessionId,taskId:b.taskId,state:b.state,selection:this.ctx.agents.get(b.sessionId)?.model.current()??null}))??[]};}
  async close(){this.closed=true;this.shutdown.abort(Error('ACT_AI_STOPPING'));for(const e of this.active.values())this.stop(e,'ACT_AI_STOPPING');await Promise.allSettled([...this.flights.values(),...this.finishing.values()]);await this.loader?.close();if(this.sync?.models?.proactive===this)delete this.sync.models.proactive;}
}

export function installProactiveAi(scope,directory,store,activity,sync,{intervalMs=1000}={}){
  const engine=new EmployeeProactiveAi({ctx:scope,directory,store,activity,sync});
  if(engine.configured()&&typeof scope.tools.guard!=='function')fail('ACT_AI_TOOL_GUARD_REQUIRED');
  const guard=engine.configured()?scope.tools.guard(exec=>engine.guard(exec)):()=>{};
  const loaderHost=scope.inject(['agentPresets','agents','agentTeams','agentDefaultModel','sessions','sessionPersistence'],ctx=>{engine.loader=createBotTaskRuntime(ctx);});
  scope.on('agent/created',({agent})=>engine.cleanInbox(agent));for(const agent of scope.agents.list())engine.cleanInbox(agent);
  scope.on('agent/inbox/inserted',({agent,message})=>{
    const e=engine.entry(agent);if(!e||e.reason||message.id===e.messageId||message.source?.kind!=='user')return;
    engine.stop(e,'ACT_AI_USER_PRIORITY');
    // send() captures its wake classification BEFORE insertion callbacks. Requeue this exact
    // pending human identity after cancellation so the driver's public after-abort wake latches.
    // Never manufacture a replacement prompt or clear another user's pending work.
    const pending=[...agent.inbox.nextTurn,...agent.inbox.nextStep].find(m=>m.id===message.id);
    if(pending&&agent.inbox.remove(pending.id))agent.followup(pending);
  });
  scope.on('agent/inbox/claimed',({agent,message,turn})=>{const e=engine.entry(agent);if(e&&agent.id===e.sessionId&&message.id===e.messageId){e.turn=turn;try{engine.change(engine.job(e.botId,e.id),{turn},'ai_turn_claimed');}catch{engine.volatile.add(e.sessionId);engine.stop(e,'ACT_AI_STORAGE_UNRESOLVED');}}});
  scope.on('session/event',(session,event)=>{const e=engine.active.get(session.id);if(e&&event.type==='turn/end'&&event.data.turn===e.turn)void engine.finish(e,event.data.reason);});
  scope.on('agent/pre-step',async(payload,next)=>{const e=engine.entry(payload.agent);if(!e)return next();const j=engine.job(e.botId,e.id),denial=e.reason??engine.check(j,payload.agent,{running:true,selection:payload.modelSelection});if(denial||j.modelRequests>=j.action.maxModelRequests){engine.stop(e,denial??'ACT_AI_REQUEST_LIMIT');return {kind:'reject'};}const decision=await next();const after=engine.check(engine.job(e.botId,e.id),payload.agent,{running:true,selection:payload.modelSelection});if(after){engine.stop(e,after);return {kind:'reject'};}return decision;});
  scope.on('tools/execute',async(exec,next)=>{const e=engine.entry(exec.agent);if(!e)return next();const before=exec.signal;exec.signal=AbortSignal.any([before,e.controller.signal]);try{return await next();}finally{exec.signal=before;}});
  scope.on('llm/stream',async function*(options,next){const agent=options.sessionId?scope.agents.get(options.sessionId):null,e=agent?engine.entry(agent):null;if(!e)return yield* next();if(!isAgentLoopRequest(options))throw new LlmError('ACT_AI_AUXILIARY_MODEL_DENIED','ACT_AI_AUXILIARY_MODEL_DENIED');const check=()=>{const reason=e.reason??engine.check(engine.job(e.botId,e.id),agent,{running:true,selection:options});if(reason)throw new LlmError(reason,'ACT_AI_ADMISSION_DENIED');};check();for await(const chunk of next()){check();yield chunk;}});
  const timer=setInterval(()=>{try{engine.tick();}catch{scope.logger.warn('ACT_AI_SCAN_FAILED');}},intervalMs);timer.unref?.();
  return {engine,async close(){clearInterval(timer);await engine.close();guard();await loaderHost.dispose();}};
}
