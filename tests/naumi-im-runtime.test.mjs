import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {createAssistantMessage} from '@deepseek-ai/dsh-llm';
import {botTaskHost} from './helpers/bot-task-host.mjs';
import {IMStore} from '../plugins/naumi-enterprise/im-store.js';
import {IMService} from '../plugins/naumi-enterprise/im-service.js';

test('IM input crosses real native runtime, Session validation, Bot ownership and durable receipts without a second execution engine',async()=>{
 const f=await botTaskHost(),store=new IMStore(join(f.dir,'im.sqlite')),vault=new Map(),sends=[];
 const owner=f.directory.registerSessionOwner(id=>store.sessionOwner(id));
 const credentials={set:async(k,v)=>vault.set(k,v),unset:async k=>vault.delete(k),resolve:async k=>({value:vault.get(k)}),describe:async k=>({configured:vault.has(k)})};
 const adapter={connect:(_fields,_env,h)=>{h.onStatus({state:'ready'});return {stop(){},send:async(chat,payload)=>{sends.push({chat,payload});return {messageId:'receipt'};}}}};
 const im=new IMService({store,directory:f.directory,getTasks:()=>f.service,getGroups:()=>null,credentials,ctx:f.ctx,platforms:{feishu:adapter},environment:()=>({})});
 try{
  const id=randomUUID(),cmd=body=>im.execute({...body,expectedRevision:store.revision()});await cmd({action:'save',id,platform:'feishu',appId:'fixture-app',name:'协议驱动',secret:'fixture-secret'});await cmd({action:'enable',id,enabled:true});
  const code=(await cmd({action:'pair',connectionId:id,chatKind:'direct',target:{kind:'bot',id:f.targetBot.id}})).pair.code;
  const event={chat:{key:'native-chat',kind:'direct'},sender:{id:'native-user'},messageId:'pair-message',text:'/pair '+code,images:[]};await im.receive(id,event);await im.kick();
  const input=await im.receive(id,{...event,messageId:'user-message',text:'验证原生消息'});await im.kick();
  const binding=store.bindings()[0],agent=f.agents.get(binding.sessionId);assert.ok(agent);assert.equal(f.directory.forSession(agent.id).id,f.targetBot.id);assert.notEqual(agent.id,f.target.id);
  assert.equal(agent.model.current().model,'target-model');assert.equal(agent.session.header.agentPreset,'target-preset');assert.equal(agent.session.snapshotEvents().find(e=>e.type==='sandbox/mode').data.mode,'read-only');
  const message=agent.inbox.nextTurn[0];assert.equal(message.id,input.messageId);assert.equal(message.source.kind,'user');assert.equal(message.content[0].text,'验证原生消息');
  agent.session.append('turn/start',{turn:1});agent.session.append('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:1,inserted:[]});agent.inbox.nextTurn.splice(0);
  agent.session.append('step/start',{turn:1,step:1});agent.session.append('user/message',message,{surfaceOp:'append'});
  agent.session.append('assistant/message',{turn:1,step:1,message:createAssistantMessage({source:{kind:'model',provider:'fixture',model:'target-model'},content:[{type:'text',text:'原生收据结果'}]})},{surfaceOp:'append'});
  agent.session.append('turn/end',{turn:1,reason:{kind:'completed'}});await f.services.sessions.flush(agent.session);agent.status='idle';
  await im.kick();assert.equal(store.input(input.id).state,'settled');assert.equal(sends.filter(s=>s.payload.text==='原生收据结果').length,1);
  await im.receive(id,{...event,messageId:'user-message',text:'验证原生消息'});await im.kick();assert.equal(agent.inbox.nextTurn.length,0);assert.equal(sends.filter(s=>s.payload.text==='原生收据结果').length,1);
  assert.equal(f.target.session.snapshotEvents().filter(e=>e.type==='user/message').length,0);assert.equal(f.creations.length,1);
 }finally{owner();await im.close();await f.cleanup();}
});
