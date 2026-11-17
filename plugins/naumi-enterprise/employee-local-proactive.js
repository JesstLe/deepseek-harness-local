import {randomUUID} from 'node:crypto';
import {LlmError} from '@deepseek-ai/dsh-llm';

export const isLocalAction=action=>action?.kind==='run_local_agent';
const TYPES=['local_proactive_model','local_proactive_tool'];
const READ_ONLY=new Set(['employee_profile','employee_memory_search','employee_work','employee_capabilities','employee_activity_report']);
const fail=code=>{throw Error(code);};
const actor={kind:'owner',note:'Explicit local-owner proactive policy; not enterprise authorization or financial settlement'};

/** Thin local policy/receipt adapter for the shared proactive consumer. No scheduler or Agent driver. */
export class LocalProactivePolicy{
  constructor(engine){
    this.engine=engine;this.store=engine.store;this.inflight=new Map();
    this.store.db.exec("CREATE INDEX IF NOT EXISTS employee_local_job_receipts ON entities(bot_id,type,json_extract(json,'$.jobId'))");
    for(const type of TYPES)for(const row of this.rows(type).filter(r=>r.state==='running'))this.save({...row,state:'unknown',endedAt:this.store.now()},type,'local_recover');
  }
  configured(){return typeof this.engine.ctx.tools?.guard==='function'&&typeof this.engine.ctx.tools?.schemas==='function';}
  rows(type,botId,jobId){return jobId?this.store.db.prepare("SELECT json FROM entities WHERE bot_id=? AND type=? AND json_extract(json,'$.jobId')=?").all(botId,type,jobId).map(r=>JSON.parse(r.json)):botId?this.store.entitiesOfType(botId,type):this.store.db.prepare('SELECT json FROM entities WHERE type=?').all(type).map(r=>JSON.parse(r.json));}
  save(row,type,action){return this.store.mutate(row.botId,'local:'+randomUUID(),action,{id:row.id,state:row.state},actor,()=>this.store.put({...row,revision:(row.revision??0)+1,updatedAt:this.store.now()},type,action,actor));}
  targets(botId){
    if(!this.configured())return [];
    return this.engine.ctx.agents.list().filter(agent=>this.engine.directory.forSession(agent.id)?.id===botId&&this.engine.rootId(agent)===agent.id&&!this.engine.sync?.runtimeGate?.binding(agent.id))
      .map(agent=>({sessionId:agent.id,selection:agent.model.current()??null,allowedTools:this.engine.ctx.tools.schemas(agent).map(t=>t.name).filter(n=>['employee_profile','employee_memory_search','employee_work','employee_delivery_create','employee_delivery_revise','employee_delivery_submit','employee_activity_report','employee_capabilities','str_replace_editor'].includes(n))})).filter(t=>t.selection&&t.selection.provider!=='naumi-enterprise');
  }
  validate(botId,action){
    if(!this.configured())fail('ACT_AI_LOCAL_GUARD_REQUIRED');
    const bot=this.engine.directory.forSession(action.sessionId),agent=this.engine.ctx.agents.get(action.sessionId);
    if(!bot||bot.id!==botId||bot.status!=='active')fail('ACT_AI_LOCAL_BOT_REQUIRED');
    if(this.engine.sync?.runtimeGate?.binding(action.sessionId)||action.provider==='naumi-enterprise')fail('ACT_AI_LOCAL_MANAGED_SESSION_DENIED');
    if(!agent||this.engine.rootId(agent)!==agent.id)fail('ACT_AI_LOCAL_ROOT_REQUIRED');
    const selected=agent.model.current();if(!this.sameModel(action,selected))fail('ACT_AI_MODEL_SELECTION_CHANGED');
    this.engine.work.goal(botId,action.goalId);
    const available=new Set(this.engine.ctx.tools.schemas(agent).map(t=>t.name));
    if(action.allowedTools.some(t=>!available.has(t)))fail('ACT_AI_LOCAL_TOOL_UNAVAILABLE');
  }
  sameModel(action,selected){return selected?.provider===action.provider&&selected?.model===action.model&&selected?.reasoningEffort===action.reasoningEffort;}
  check(job,agent,{selection}={}){
    if(!this.configured())return 'ACT_AI_LOCAL_GUARD_REQUIRED';
    if(this.engine.sync?.runtimeGate?.binding(job.action.sessionId)||job.action.provider==='naumi-enterprise')return 'ACT_AI_LOCAL_MANAGED_SESSION_DENIED';
    if(agent&&this.engine.rootId(agent)!==job.action.sessionId)return 'ACT_AI_LOCAL_ROOT_REQUIRED';
    if(agent&&!this.sameModel(job.action,agent.model.current()))return 'ACT_AI_MODEL_SELECTION_CHANGED';
    if(selection&&(selection.provider!==job.action.provider||selection.model!==job.action.model))return 'ACT_AI_MODEL_SELECTION_CHANGED';
    if(this.rows('local_proactive_tool',job.botId,job.id).some(r=>r.jobId===job.id&&(r.state==='unknown'||r.state==='running'&&!this.inflight.has(r.id))&&!r.resolution))return 'ACT_AI_LOCAL_TOOL_UNRESOLVED';
    if(this.rows('local_proactive_model',job.botId,job.id).some(r=>r.jobId===job.id&&r.state==='unknown'&&!r.resolution))return 'ACT_AI_LOCAL_MODEL_UNRESOLVED';
    return null;
  }
  guard(exec,job){
    if(!job.action.allowedTools.includes(exec.name))return 'ACT_AI_LOCAL_TOOL_NOT_APPROVED';
    const calls=this.rows('local_proactive_tool',job.botId,job.id).filter(r=>r.jobId===job.id).length;
    if(calls>=job.action.maxToolCalls)return 'ACT_AI_LOCAL_TOOL_LIMIT';
  }
  async *stream(agent,options,next,entry){
    const e=this.engine,job=e.job(entry.botId,entry.id),denial=entry.reason??e.check(job,agent,{running:true,selection:options});
    if(denial)throw new LlmError(denial,'ACT_AI_ADMISSION_DENIED');
    const id='local-model-'+randomUUID();let row;
    try{
      row=this.store.mutate(job.botId,id,'local_model_start',{jobId:job.id,requestId:id},actor,()=>{
        const current=e.job(job.botId,job.id),reason=entry.reason??e.check(current,agent,{running:true,selection:options});if(reason)fail(reason);
        if(current.modelRequests>=current.action.maxModelRequests)fail('ACT_AI_REQUEST_LIMIT');
        this.store.put({...current,revision:current.revision+1,modelRequests:current.modelRequests+1,modelRequestIds:[...current.modelRequestIds,id],updatedAt:this.store.now()},'proactive_ai','ai_model_dispatch',actor);
        return this.store.put({id,botId:job.botId,jobId:job.id,sessionId:agent.id,revision:1,state:'running',usage:null,usageStatus:'unknown',startedAt:this.store.now()},'local_proactive_model','local_model_start',actor);
      });
    }catch(error){e.volatile.add(job.action.sessionId);e.stop(entry,'ACT_AI_STORAGE_UNRESOLVED');throw error;}
    this.inflight.set(id,entry);let finish=false,usage=null;
    try{
      for await(const chunk of next()){
        const reason=entry.reason??e.check(e.job(job.botId,job.id),agent,{running:true,selection:options});if(reason)throw new LlmError(reason,'ACT_AI_ADMISSION_DENIED');
        if(chunk.type==='usage'&&Number.isSafeInteger(chunk.usage.inputTokens)&&chunk.usage.inputTokens>=0&&Number.isSafeInteger(chunk.usage.outputTokens)&&chunk.usage.outputTokens>=0)usage={inputTokens:chunk.usage.inputTokens,outputTokens:chunk.usage.outputTokens};
        if(chunk.type==='finish'&&['stop','tool-calls','max-tokens'].includes(chunk.reason.kind))finish=true;
        yield chunk;
      }
    }finally{
      this.inflight.delete(id);try{this.save({...row,state:finish?'completed':'unknown',usage,usageStatus:usage?'reported':'unknown',endedAt:this.store.now()},'local_proactive_model','local_model_end');}catch{e.volatile.add(job.action.sessionId);e.stop(entry,'ACT_AI_STORAGE_UNRESOLVED');throw Error('ACT_AI_STORAGE_UNRESOLVED');}
    }
  }
  async execute(exec,next,entry){
    const e=this.engine,job=e.job(entry.botId,entry.id),denial=entry.reason??e.guard(exec);if(denial)fail(denial);
    const id='local-tool-'+randomUUID();let row;try{row=this.store.mutate(job.botId,id,'local_tool_start',{jobId:job.id,callId:exec.callId},actor,()=>{
      const current=e.job(job.botId,job.id),reason=entry.reason??e.guard(exec);if(reason)fail(reason);
      return this.store.put({id,botId:job.botId,jobId:job.id,sessionId:exec.agent.id,callId:exec.callId,toolName:exec.name,revision:1,state:'running',startedAt:this.store.now()},'local_proactive_tool','local_tool_start',actor);
    });
    }catch(error){e.volatile.add(job.action.sessionId);e.stop(entry,'ACT_AI_STORAGE_UNRESOLVED');throw error;}
    this.inflight.set(id,entry);let state='unknown';
    try{const result=await next();state=entry.controller.signal.aborted?'unknown':result.isError?(READ_ONLY.has(exec.name)?'failed':'unknown'):result.value?.status==='unknown'?'unknown':'completed';return result;}
    finally{this.inflight.delete(id);try{this.save({...row,state,endedAt:this.store.now()},'local_proactive_tool','local_tool_end');}catch{e.volatile.add(job.action.sessionId);e.stop(entry,'ACT_AI_STORAGE_UNRESOLVED');throw Error('ACT_AI_STORAGE_UNRESOLVED');}}
  }
  receipts(job){return TYPES.flatMap(type=>this.rows(type,job.botId,job.id).filter(r=>r.jobId===job.id).map(r=>({requestId:r.id,state:r.state,kind:type==='local_proactive_model'?'model':'tool',usage:r.usage??null,usageStatus:r.usageStatus??null,resolution:r.resolution??null})));}
  assertResolvable(job){
    const e=this.engine,agent=e.ctx.agents.get(job.action.sessionId);
    if(agent&&!e.idle(agent)||[...this.inflight.values()].some(v=>v.id===job.id)||e.finishing.has(job.id))fail('ACT_AI_SESSION_BUSY');
  }
  resolve(job,reason){
    this.assertResolvable(job);
    for(const type of TYPES)for(const row of this.rows(type,job.botId,job.id).filter(r=>r.jobId===job.id&&['running','unknown'].includes(r.state)&&!r.resolution))this.store.put({...row,revision:row.revision+1,resolution:{confirmedStopped:true,reason,at:this.store.now(),kind:'local-owner-confirmation'},updatedAt:this.store.now()},type,'local_owner_resolve',actor);
  }
}
