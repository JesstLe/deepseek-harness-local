import {installModelSelection,modelSelectionProjectionDefinition} from '@deepseek-ai/dsh-agent';
import {freezeMessage} from '@deepseek-ai/dsh-llm';
import {references,announcedFiles,validateFiles,registerFiles} from './bot-deliverables.js';

const permissionTypes=['permission/preset','sandbox/mode','approval/policy'];

/** Public Harness APIs only. Each dispatched task owns a root Session of the EXISTING target Bot. */
export function createBotTaskRuntime(ctx){
  const handles=new Map(),opening=new Map();let closed=false;
  const snapshot=async sessionId=>{
    const live=ctx.agents.get(sessionId);
    if(live){const events=live.session.snapshotEvents();await ctx.sessions.flush(live.session);return {header:live.session.header,events,live};}
    const stat=await ctx.sessionPersistence.stat(sessionId);if(!stat)return null;
    const handle=await ctx.sessionPersistence.open(sessionId,'read');
    try{return {header:handle.header,events:(await handle.read(0)).events,live:null};}finally{await handle.close();}
  };
  const profile=async bot=>{
    const stored=await snapshot(bot.homeSessionId);if(!stored)throw Error('BOT_TARGET_SESSION_MISSING');
    const fold=modelSelectionProjectionDefinition;
    const model=stored.events.reduce(fold.apply,fold.init(stored.header));
    return {agentPreset:stored.events.findLast(e=>e.type==='agent-preset/selected')?.data.agentPreset??stored.header.agentPreset??bot.agentPreset,
      model:stored.live?.model.current()??model.pending??model.lastUsed??ctx.agentDefaultModel.currentSelection(),
      permissions:permissionTypes.flatMap(type=>{const event=stored.events.findLast(e=>e.type===type);return event?[{type,data:structuredClone(event.data)}]:[];})};
  };
  const ensure=async(sessionId,{cwd,profile:config,create=false}={})=>{
    if(closed)throw Error('BOT_ROUTER_CLOSED');
    const live=ctx.agents.get(sessionId);if(live)return live;
    if(opening.has(sessionId))return opening.get(sessionId);
    const run=(async()=>{
      const stored=await snapshot(sessionId);
      if(!stored&&!create)throw Error('BOT_SESSION_NOT_FOUND');
      if(stored?.header.origin==='subagent'||(stored?.header.delegationDepth??0)>0)throw Error('BOT_ROOT_SESSION_REQUIRED');
      let selected=config;
      if(!selected){
        if(!stored)throw Error('BOT_PROFILE_REQUIRED');
        selected=await profile({homeSessionId:sessionId,agentPreset:stored.header.agentPreset});
      }
      const resolved=await ctx.agentPresets.resolve(selected.agentPreset);
      const setup=async(agentCtx,agent)=>{
        installModelSelection(agentCtx);await ctx.agentPresets.mount(agentCtx,resolved.id);
        if(!stored){
          // Apply only the target Bot's recorded choices, never the dispatcher's privileges/model.
          for(const event of selected.permissions??[])agent.session.append(event.type,structuredClone(event.data));
          if(selected.model)agent.model.select(selected.model);
        }
      };
      let handle;
      try{handle=stored?await ctx.agents.resume({resumeSessionId:sessionId,agentOptions:selected.model,setup})
        :await ctx.agents.create({sessionId,meta:{cwd,agentPreset:resolved.id},agentOptions:selected.model,setup});}
      catch(error){const raced=ctx.agents.get(sessionId);if(raced)return raced;throw error;}
      if(closed){await handle.dispose();throw Error('BOT_ROUTER_CLOSED');}
      handles.set(sessionId,handle);await ctx.sessions.flush(handle.agent.session);return handle.agent;
    })();opening.set(sessionId,run);
    try{return await run;}finally{opening.delete(sessionId);}
  };
  const deliveryLanes=new Map();
  const serialDelivery=(id,fn)=>{
    const run=(deliveryLanes.get(id)??Promise.resolve()).then(fn),tail=run.catch(()=>{});deliveryLanes.set(id,tail);
    return run.finally(()=>{if(deliveryLanes.get(id)===tail)deliveryLanes.delete(id);});
  };
  const publish=async(sessionId,turn,{files,callId,signal=AbortSignal.timeout(10000)}={})=>serialDelivery(sessionId,async()=>{
    signal.throwIfAborted();
    const agent=ctx.agents.get(sessionId),stored=await snapshot(sessionId);
    if(!stored)throw Error('BOT_SESSION_NOT_FOUND');
    const ended=stored.events.find(e=>e.type==='turn/end'&&e.data.turn===turn);
    const final=stored.events.findLast(e=>e.type==='assistant/message'&&e.data.turn===turn)?.data.message;
    const text=final?.toolCalls?.length?'':(final?.content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');
    const old=references(stored.events,sessionId,turn);
    const candidates=files??(old.length?null:ended?.data.reason.kind==='completed'?announcedFiles(stored.events,turn,text):null);
    if(candidates?.length){
      if(!agent)throw Error('BOT_DELIVERY_SESSION_NOT_ACTIVE');
      const checked=await validateFiles(ctx,agent.session,candidates,signal);
      signal.throwIfAborted();
      registerFiles(agent.session,turn,checked,callId??`naumi-delivery:${sessionId}:${turn}`);
      await ctx.sessions.flush(agent.session);
    }
    const current=await snapshot(sessionId),refs=references(current.events,sessionId,turn),verified=[];
    for(const ref of refs){
      const [stat]=await validateFiles(ctx,{id:sessionId,header:current.header},[{path:ref.path,description:ref.description}],AbortSignal.timeout(10000));
      verified.push({...ref,version:stat.version,...(stat.bytes!==undefined?{bytes:stat.bytes}:{})});
    }
    return verified;
  });
  return {
    snapshot,profile,ensure,
    publishTurn:publish,
    async declare(sessionId,files,callId,signal){
      const stored=await snapshot(sessionId),turn=stored?.events.findLast(e=>e.type==='turn/start')?.data.turn;
      if(!turn||stored.events.some(e=>e.type==='turn/end'&&e.data.turn===turn))throw Error('BOT_DELIVERY_OPEN_TURN_REQUIRED');
      return publish(sessionId,turn,{files,callId,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
    },
    async delivery(sessionId,messageId,requirement='text'){
      const state=await this.inspect(sessionId,messageId);
      if(!state?.turn)return {requirement,status:requirement==='files'?'missing':'not_required',files:[]};
      try{const files=await publish(sessionId,state.turn);return {requirement,status:files.length?'ready':requirement==='files'?'missing':'not_required',files};}
      catch{return {requirement,status:'unavailable',files:[]};}
    },
    async mirror(sessionId,messageId,files){
      if(!files?.length)return;
      return serialDelivery(sessionId,async()=>{
        const stored=await snapshot(sessionId),agent=ctx.agents.get(sessionId);if(!stored||!agent)return;
        const state=inspectBotMessage(stored.events,messageId);if(!state.consumed)return;
        const callId=`naumi-relay:${messageId}`;
        if(stored.events.some(e=>e.type==='deliverables/presented'&&e.data.callId===callId))return;
        const checked=[];
        for(const ref of files){
          const source=await snapshot(ref.sessionId),event=source?.events.find(e=>e.seq===ref.seq&&e.type==='deliverables/presented'&&e.data.turn===ref.turn);
          const original=event?.data.files[ref.index];
          if(!original||original.path!==ref.path)throw Error('BOT_DELIVERY_REFERENCE_MISMATCH');
          await validateFiles(ctx,{id:ref.sessionId,header:source.header},[original],AbortSignal.timeout(10000));
          checked.push(...await validateFiles(ctx,agent.session,[original],AbortSignal.timeout(10000)));
        }
        registerFiles(agent.session,state.turn,checked,callId);await ctx.sessions.flush(agent.session);
      });
    },
    isRunning:sessionId=>ctx.agents.get(sessionId)?.status==='running',
    async inspect(sessionId,messageId){const stored=await snapshot(sessionId);return stored?inspectBotMessage(stored.events,messageId,stored.live?.status==='running'):null;},
    async deliver({sessionId,messageId,fromSessionId,fromUser=false,text,create=false,cwd,profile:config,mode='steer'}){
      const agent=await ensure(sessionId,{create,cwd,profile:config});
      const observed=await this.inspect(sessionId,messageId);
      const source=fromUser?{kind:'user'}:{kind:'agent-message',form:'relay',senderSessionId:fromSessionId};
      const message=freezeMessage({id:messageId,role:'user',source,content:[{type:'text',text}]});
      if(observed?.seen){
        // Resuming an idle Session does not itself wake a parked inbox. Requeue the SAME
        // still-pending identity synchronously; consumed or discarded input is never replayed.
        const pending=[...agent.inbox.nextStep,...agent.inbox.nextTurn].find(m=>m.id===messageId);
        if(observed.pending&&pending&&agent.status==='idle'&&agent.inbox.remove(messageId)){
          if(mode==='followup')agent.followup(pending);else agent.steer(pending);
        }
      }else if(mode==='followup')agent.followup(message);else agent.steer(message);
      await ctx.sessions.flush(agent.session);
      const receipt=await this.inspect(sessionId,messageId);
      if(!receipt?.seen)throw Error('BOT_MESSAGE_RECEIPT_MISSING');
      return receipt;
    },
    async cancel(sessionId){
      if(!ctx.agents.get(sessionId)&&!await ctx.sessionPersistence.stat(sessionId))return;
      const agent=await ensure(sessionId);agent.cancel({kind:'user'});await agent.whenIdle();await ctx.sessions.flush(agent.session);
    },
    async close(){closed=true;await Promise.allSettled([...deliveryLanes.values()]);await Promise.allSettled([...opening.values()]);await Promise.allSettled([...handles.values()].map(handle=>handle.dispose()));handles.clear();},
  };
}

/** Match a durable message ID, not a title, live status or an arbitrary last assistant response. */
export function inspectBotMessage(events,messageId,running=false){
  const inbox={'next-step':[],'next-turn':[]};let seen=false,turn=null,current=null,start=-1;
  for(let i=0;i<events.length;i++){
    const event=events[i];if(event.type==='turn/start')current=event.data.turn;
    if(event.type==='agent/inbox/spliced'){
      const data=event.data,items=inbox[data.target];
      if(items){if(data.inserted.some(m=>m.id===messageId))seen=true;items.splice(data.start,data.removedCount??0,...data.inserted);}
    }
    if(event.type==='user/message'&&event.data.id===messageId){seen=true;turn=current;start=i;}
  }
  const end=turn===null?null:events.findLast(e=>e.type==='turn/end'&&e.data.turn===turn);
  const last=start<0?null:events.slice(start).findLast(e=>e.type==='assistant/message'&&e.data.turn===turn);
  const message=last?.data.message;
  const text=message?.toolCalls?.length?'':(message?.content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n').trim();
  return {seen,pending:Object.values(inbox).flat().some(m=>m.id===messageId),consumed:turn!==null,turn,running,
    end:end?.data.reason??null,text};
}
