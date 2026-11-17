import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Context} from '@deepseek-ai/cordis';
import {Session,SessionId} from '@deepseek-ai/dsh-session';
import {createAssistantMessage} from '@deepseek-ai/dsh-llm';
import {BotDirectory} from '../../plugins/naumi-enterprise/bots.js';
import {BotTaskStore} from '../../plugins/naumi-enterprise/bot-task-store.js';
import {installBotTasks} from '../../plugins/naumi-enterprise/bot-tasks.js';

/** Real Cordis, Session schema, atomic stores and HTTP. The Agent driver is a deterministic adapter. */
export async function botTaskHost(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-bot-host-')),ctx=new Context();
  let botCounter=0;
  const directory=new BotDirectory(path.join(dir,'bots.json'),{uuid:()=>String(++botCounter)}),store=new BotTaskStore(path.join(dir,'tasks.json'));
  const agents=new Map(),routes=new Map(),log=new Map(),mounts=[],creations=[];
  const snapshot=session=>({header:structuredClone(session.header),events:structuredClone(session.snapshotEvents())});
  const flush=async session=>{const value=snapshot(session);log.set(session.id,value);fs.writeFileSync(path.join(dir,session.id+'.json'),JSON.stringify(value));};
  function agentOf(session){
    const tools=new Map(),prompts=new Map(),nextStep=[],nextTurn=[];
    // Fold pending inboxes through the real Session record format.
    for(const e of session.snapshotEvents())if(e.type==='agent/inbox/spliced'){
      const data=e.data,items=data.target==='next-step'?nextStep:nextTurn;items.splice(data.start,data.removedCount??0,...data.inserted);
    }
    const agent={id:session.id,session,status:'idle',tools,prompts,
      ctx:{on:()=>()=>{},tools:{register(tool){tools.set(tool.name,tool);return()=>tools.delete(tool.name);}},
        systemPrompt:{getSectionOrder:()=>10,getContextOrder:()=>10,section(p){prompts.set(p.name,p);return()=>prompts.delete(p.name);},context(p){prompts.set(p.name,p);return()=>prompts.delete(p.name);}}},
      model:{current:()=>session.snapshotEvents().findLast(e=>e.type==='model/selection')?.data,
        select:selection=>session.append('model/selection',selection)},
      inbox:{nextStep,nextTurn,remove(id){for(const [target,items] of [['next-step',nextStep],['next-turn',nextTurn]]){const index=items.findIndex(m=>m.id===id);if(index>=0){items.splice(index,1);session.append('agent/inbox/spliced',{target,start:index,removedCount:1,inserted:[],outcome:'canceled'});return true;}}return false;}},
      steer(message){session.append('agent/inbox/spliced',{target:'next-step',start:nextStep.length,removedCount:0,inserted:[message]});nextStep.push(message);agent.status='running';ctx.emit('agent/status',{agent,status:'running'});},
      cancel(){agent.status='idle';},whenIdle:async()=>{},
    };agents.set(agent.id,agent);return agent;
  }
  const fresh=(id,cwd,preset)=>{
    const header={...Session.create(SessionId(id)).header,cwd,agentPreset:preset};
    return agentOf(Session.create(SessionId(id),[],header));
  };
  const sender=fresh('host-source',dir,'source-preset'),target=fresh('host-target',dir,'target-preset');
  for(const [agent,model,mode]of [[sender,'source-model','workspace-write'],[target,'target-model','read-only']]){
    agent.model.select({provider:'fixture',model,reasoningEffort:'high'});
    agent.session.append('permission/preset',{preset:mode});agent.session.append('sandbox/mode',{mode});agent.session.append('approval/policy',{policy:'ask'});await flush(agent.session);
  }
  const sourceBot=await directory.create({sessionId:sender.id,cwd:dir,agentPreset:'source-preset'},{name:'验证主管',kind:'agent',purpose:'分配任务'});
  const targetBot=await directory.create({sessionId:target.id,cwd:dir,agentPreset:'target-preset'},{name:'验证目标',kind:'agent',purpose:'处理任务'});
  const registry={get:id=>agents.get(id),list:()=>[...agents.values()],
    async create(options){creations.push(options);const agent=fresh(options.sessionId,options.meta.cwd,options.meta.agentPreset);await options.setup(agent.ctx,agent);await ctx.serial('agent/created',{agent,source:'startup'});await flush(agent.session);return {agent,dispose:async()=>{agents.delete(agent.id);ctx.emit('agent/disposed',{agent});}};},
    async resume(options){const data=log.get(options.resumeSessionId);if(!data)throw Error('BOT_SESSION_NOT_FOUND');const agent=agentOf(Session.create(SessionId(data.header.id),data.events,data.header));await options.setup(agent.ctx,agent);await ctx.serial('agent/created',{agent,source:'resume'});return {agent,dispose:async()=>{agents.delete(agent.id);ctx.emit('agent/disposed',{agent});}};},
  };
  const services={agents:registry,agentTeams:{tryMembership:agent=>agents.get(agent.id)===agent?{root:agent,role:'lead',id:agent.id}:undefined,
    membership(agent){const value=this.tryMembership(agent);if(!value)throw Error('TEAM_NOT_MEMBER');return value;}},
    agentPresets:{resolve:async id=>({id:id??'default-preset'}),mount:async(_scope,id)=>{mounts.push(id);},presetForSession:session=>session.header.agentPreset},
    agentDefaultModel:{currentSelection:()=>({provider:'fixture',model:'default-model'})},
    sessions:{get:id=>agents.get(id)?.session,flush},
    workspaceFiles:{async stat(scope,file,signal){signal.throwIfAborted();const absolutePath=await fs.promises.realpath(path.resolve(scope.workspaceRoot,file)),stat=await fs.promises.stat(absolutePath);if(!stat.isFile())throw Error('NOT_REGULAR_FILE');return {absolutePath,version:String(stat.mtimeMs),bytes:stat.size};}},
    sessionPersistence:{stat:async id=>log.has(id)?{header:log.get(id).header}:null,
      open:async id=>({header:log.get(id).header,read:async()=>({events:log.get(id).events}),close:async()=>{}})},
    tools:{},systemPrompt:{},
    connection:{admit:req=>req.headers.cookie==='fixture-owner'?{peer:{principal:{kind:'owner'}}}:req.headers.cookie==='fixture-guest'?{peer:{principal:{kind:'guest'}}}:{rejection:401}},
    webServer:{register(route){routes.set(route.path,route.handler);return()=>routes.delete(route.path);}},
  };
  const provider=await ctx.plugin({name:'bot-task-host-services',apply(scope){for(const [name,value] of Object.entries(services))scope.provide(name,value);}});
  let child,service;const host=await ctx.plugin({name:'bot-task-host-plugin',inject:['webServer','connection'],apply(scope){child=installBotTasks(scope,directory,{store,onReady:value=>{service=value;}});}});await child;
  const server=http.createServer((req,res)=>{const handler=routes.get(new URL(req.url,'http://localhost').pathname);if(handler)void handler(req,res);else res.writeHead(404).end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const request=(body,{cookie='fixture-owner',originHeader=origin,method=body?'POST':'GET',header=true,url='/naumi/bot-tasks'}={})=>fetch(origin+url,{method,headers:{cookie,origin:originHeader,'Content-Type':'application/json',...(header?{'x-naumi-bot-tasks':'1'}:{})},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  const complete=async(task,text='真实会话格式交付',beforeEnd=()=>{})=>{
    const agent=agents.get(task.targetSessionId),messages=[...agent.inbox.nextStep];
    const turn=1;agent.session.append('turn/start',{turn});agent.session.append('agent/inbox/spliced',{target:'next-step',start:0,removedCount:messages.length,inserted:[]});agent.inbox.nextStep.splice(0);
    agent.session.append('step/start',{turn,step:1});for(const message of messages)agent.session.append('user/message',message,{surfaceOp:'append'});
    agent.session.append('assistant/message',{turn,step:1,message:createAssistantMessage({source:{kind:'model',provider:'fixture',model:'target-model'},content:[{type:'text',text}]})},{surfaceOp:'append'});
    await beforeEnd(agent,turn);
    agent.session.append('turn/end',{turn,reason:{kind:'completed'}});await flush(agent.session);agent.status='idle';ctx.emit('agent/status',{agent,status:'idle'});await service.settled();
  };
  return {dir,ctx,services,registry,agents,log,store,directory,sourceBot,targetBot,sender,target,creations,mounts,service,origin,request,complete,
    cleanup:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await host.dispose();await provider.dispose();await directory.close();if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('BAD_FIXTURE_PATH');fs.rmSync(dir,{recursive:true,force:true});},
  };
}
