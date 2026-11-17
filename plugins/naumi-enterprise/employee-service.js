import {z} from 'zod';
import {profileFields,assertPublicText} from './employee-store.js';

const fail=code=>{throw Error(code);};
export class EmployeeService{
  constructor(ctx,directory,store){Object.assign(this,{ctx,directory,store});}
  bot(botId,{write=false}={}){const bot=this.directory.list().bots.find(b=>b.id===botId);if(!bot)fail('EMP_BOT_NOT_FOUND');if(write&&bot.status!=='active')fail('EMP_BOT_ARCHIVED');return bot;}
  caller(agent,write=false){
    if(!agent)fail('EMP_CALLER_REQUIRED');const member=this.ctx.agentTeams.membership(agent);
    if(write&&member.role!=='lead')fail('EMP_LEAD_REQUIRED');
    const bot=this.directory.forSession(member.root.id);if(!bot)fail('EMP_BOT_NOT_BOUND');this.bot(bot.id,{write});return {bot,root:member.root};
  }
  async evidence(root,{sourceMessageId,quote}){
    z.string().min(1).max(200).parse(sourceMessageId);z.string().trim().min(1).max(1000).parse(quote);assertPublicText(quote);
    const events=root.session.snapshotEvents();
    const event=events.find(e=>e.type==='user/message'&&e.data.id===sourceMessageId);
    if(!event||event.data.source?.kind!=='user')fail('EMP_USER_SOURCE_REQUIRED');
    const text=event.data.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');if(!text.includes(quote))fail('EMP_SOURCE_QUOTE_MISMATCH');
    // Persist the original source before acknowledging a durable derived candidate.
    await this.ctx.sessions.flush(root.session);
    return {kind:'proposal',sessionId:root.id,messageId:sourceMessageId,quote};
  }
  profile(agent){const {bot,root}=this.caller(agent);
    const recentUserSources=root.session.snapshotEvents().filter(e=>e.type==='user/message'&&e.data.source?.kind==='user').slice(-5).map(e=>{
      const text=e.data.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
      try{assertPublicText(text);return {messageId:e.data.id,quote:text.slice(0,1000)};}catch{return {messageId:e.data.id,quote:null,omitted:'credential_pattern'};}
    });
    return {botId:bot.id,...this.store.profile(bot.id),syncState:'local_only',recentUserSources};
  }
  search(agent,args){const {bot}=this.caller(agent);return this.store.memories(bot.id,args);}
  async proposeMemory(agent,input){
    const args=z.object({kind:z.enum(['fact','preference','experience','procedure','relationship']),text:z.string().trim().min(1).max(4000),sourceMessageId:z.string().min(1).max(200),quote:z.string().min(1).max(1000),operationId:z.string().min(1).max(160)}).strict().parse(input);
    const {bot,root}=this.caller(agent,true);if(!this.store.profile(bot.id).autoLearning)fail('EMP_LEARNING_DISABLED');
    const actor=await this.evidence(root,args);if(this.caller(agent,true).bot.id!==bot.id)fail('EMP_IDENTITY_CHANGED');if(!this.store.profile(bot.id).autoLearning)fail('EMP_LEARNING_DISABLED');
    return this.store.createMemory(bot.id,{operationId:args.operationId,kind:args.kind,text:args.text,status:'candidate'},actor);
  }
  async proposeProfile(agent,input){
    const args=z.object({patch:profileFields,sourceMessageId:z.string().min(1).max(200),quote:z.string().min(1).max(1000),operationId:z.string().min(1).max(160)}).strict().parse(input);
    if(!Object.keys(args.patch).length)fail('EMP_EMPTY_PATCH');
    const {bot,root}=this.caller(agent,true),profile=this.store.profile(bot.id);
    if(!profile.autoLearning)fail('EMP_LEARNING_DISABLED');for(const field of Object.keys(args.patch))if(profile.lockedFields.includes(field))fail('EMP_FIELD_LOCKED');
    const actor=await this.evidence(root,args);if(this.caller(agent,true).bot.id!==bot.id)fail('EMP_IDENTITY_CHANGED');const current=this.store.profile(bot.id);if(!current.autoLearning)fail('EMP_LEARNING_DISABLED');for(const field of Object.keys(args.patch))if(current.lockedFields.includes(field))fail('EMP_FIELD_LOCKED');
    return this.store.createMemory(bot.id,{operationId:args.operationId,kind:'preference',text:'人物设定候选：'+JSON.stringify(args.patch),status:'candidate'},actor,{proposedProfile:args.patch});
  }
  learn(session,message){
    if(message.source?.kind!=='user')return {learned:false,reason:'not_user'};
    const agent=this.ctx.agents.get(session.id);if(!agent)return {learned:false,reason:'not_live'};
    const {root,bot}=this.caller(agent,true);if(root.id!==session.id)return {learned:false,reason:'not_root'};
    const text=message.content.filter(p=>p.type==='text').map(p=>p.text).join('\n').trim();
    return this.store.learnExplicit(bot.id,message.id,text,session.id);
  }
  owner(command){
    const {action,botId,...input}=command;this.bot(botId,{write:true});
    const methods={profile_update:'updateProfile',profile_restore:'restoreProfile',memory_create:'createMemory',memory_update:'updateMemory'};
    if(!methods[action])fail('EMP_INVALID_ACTION');return this.store[methods[action]](botId,input,{kind:'owner'});
  }
}

/** One process scheduler: observation only; no LLM, dispatch, cancellation or autonomous side effect. */
export class EmployeeHeartbeat{
  constructor({agents,directory,store,clock=()=>Date.now(),intervalMs=30000,workIntervalMs=300000,onError=()=>{}}){
    Object.assign(this,{agents,directory,store,clock,intervalMs,workIntervalMs,onError});
    this.closed=false;this.busy=false;this.value={runtimeState:'starting',sampledAt:null,workSampledAt:null,staleAfterMs:intervalMs*3};
  }
  tick(){
    if(this.closed||this.busy)return;this.busy=true;
    try{
      const now=this.clock(),bots=this.directory.list().bots,agents=this.agents.list(),running=agents.filter(a=>a.status==='running');
      const runningBotIds=new Set(running.map(a=>this.directory.forSession(a.id)?.id).filter(Boolean));
      this.value={...this.value,runtimeState:'healthy',sampledAt:new Date(now).toISOString(),activeBotCount:bots.filter(b=>b.status==='active').length,
        runningSessionCount:running.length,runningBotCount:runningBotIds.size,staleAfterMs:this.intervalMs*3};delete this.value.error;
      if(!this.value.workSampledAt||now-Date.parse(this.value.workSampledAt)>=this.workIntervalMs)this.value={...this.value,workSampledAt:new Date(now).toISOString(),storage:this.store.stats()};
    }catch(error){this.value={...this.value,runtimeState:'error',error:'EMP_HEARTBEAT_SCAN_FAILED'};this.onError(error);}
    finally{this.busy=false;}
  }
  read(){return {...structuredClone(this.value),stale:!this.value.sampledAt||this.clock()-Date.parse(this.value.sampledAt)>this.value.staleAfterMs,modelCalls:0,actionsStarted:0};}
  start(){if(this.closed||this.timer)return;this.tick();this.timer=setInterval(()=>this.tick(),this.intervalMs);this.timer.unref?.();}
  close(){clearInterval(this.timer);this.timer=null;this.closed=true;this.value.runtimeState='stopped';}
}
