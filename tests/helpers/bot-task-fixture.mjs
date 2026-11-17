import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {BotDirectory} from '../../plugins/naumi-enterprise/bots.js';
import {BotTaskStore} from '../../plugins/naumi-enterprise/bot-task-store.js';
import {BotTaskService} from '../../plugins/naumi-enterprise/bot-task-service.js';

export async function taskFixture({concurrency=4}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-bot-tasks-'));
  const directory=new BotDirectory(path.join(dir,'bots.json')),storeFile=path.join(dir,'tasks.json');
  let store=new BotTaskStore(storeFile),service;
  const agents=new Map(),sessions=new Map(),deliveries=[],errors=[];
  const makeAgent=(id,cwd=dir)=>{const agent={id,session:{header:{id,cwd}},role:'lead'};agents.set(id,agent);return agent;};
  const sender=makeAgent('sender-root'),other=makeAgent('other-root'),target=makeAgent('target-home');
  const sourceBot=await directory.create({sessionId:sender.id,cwd:dir,agentPreset:'sender-preset'},{name:'主管',kind:'agent',purpose:'组织与验收'});
  const targetBot=await directory.create({sessionId:target.id,cwd:dir,agentPreset:'target-preset'},{name:'内容 Bot',kind:'agent',purpose:'执行写作任务'});
  const otherBot=await directory.create({sessionId:other.id,cwd:dir,agentPreset:'other-preset'},{name:'其他 Bot',kind:'agent',purpose:'其他工作'});
  const ctx={agentTeams:{membership(agent){if(agents.get(agent.id)!==agent)throw Error('TEAM_NOT_MEMBER');return {root:agent.root??agent,role:agent.role};}}};
  const runtime={
    failDelivery:false,failSource:false,
    async profile(bot){return {agentPreset:bot.agentPreset,model:{provider:'fixture',model:'target-model',reasoningEffort:'high'},permissions:[{type:'sandbox/mode',data:{mode:'read-only'}}]};},
    async ensure(id,{create=false,cwd,profile}={}){
      if(!agents.has(id)){if(!create&&!sessions.has(id))throw Error('BOT_SESSION_NOT_FOUND');makeAgent(id,cwd);}
      if(!sessions.has(id))sessions.set(id,{messages:new Map(),running:false,profile});
      return agents.get(id);
    },
    async inspect(id,messageId){const s=sessions.get(id);return s?.messages.has(messageId)?{...s.messages.get(messageId),running:s.running}:null;},
    isRunning:id=>sessions.get(id)?.running??false,
    async deliver(request){
      if(this.failDelivery||this.failSource&&request.sessionId===sender.id)throw Error('BOT_FIXTURE_DELIVERY_FAILED');
      await this.ensure(request.sessionId,request);const session=sessions.get(request.sessionId);
      if(!session.messages.has(request.messageId)){session.messages.set(request.messageId,{seen:true,pending:false,consumed:true,end:null,text:'',turn:session.messages.size+1});deliveries.push(structuredClone(request));}
      session.running=true;return this.inspect(request.sessionId,request.messageId);
    },
    async cancel(id){const session=sessions.get(id);if(session){session.running=false;for(const message of session.messages.values())if(!message.end)message.end={kind:'aborted',reason:{kind:'user'}};}},
    async close(){},
  };
  for(const agent of [sender,target,other])sessions.set(agent.id,{messages:new Map(),running:false});
  const open=()=>new BotTaskService({ctx,directory,store,runtime,concurrency,onError:e=>errors.push(e)});service=open();
  const input=(extra={})=>({replyMode:'wait',targetBotId:targetBot.id,task:'写一段产品介绍',idempotencyKey:randomUUID(),...extra});
  const finish=async(task,{kind='completed',text='目标 Bot 的交付内容'}={})=>{
    const s=sessions.get(task.targetSessionId),message=s.messages.get(service.current(task.id).messageId);
    s.running=false;message.end={kind};message.text=text;await service.observeTask(task.id);await service.settled();
  };
  return {dir,directory,storeFile,sender,target,other,sourceBot,targetBot,otherBot,agents,sessions,deliveries,runtime,errors,ctx,input,finish,
    get store(){return store;},get service(){return service;},
    async restart(){await service.settled();await service.close();store=new BotTaskStore(storeFile);service=open();await service.recover();await service.settled();},
    async cleanup(){await service.close();await directory.close();if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('BAD_FIXTURE_PATH');fs.rmSync(dir,{recursive:true,force:true});},
  };
}
