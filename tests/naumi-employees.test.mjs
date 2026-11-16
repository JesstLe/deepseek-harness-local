import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {botTaskHost} from './helpers/bot-task-host.mjs';
import {installEmployees} from '../plugins/naumi-enterprise/employees.js';
import {EmployeeStore} from '../plugins/naumi-enterprise/employee-store.js';
import {EmployeeHeartbeat} from '../plugins/naumi-enterprise/employee-service.js';

async function fixture(){
  const f=await botTaskHost(),store=new EmployeeStore(path.join(f.dir,'employees.sqlite'));let runtime,child;
  const host=await f.ctx.plugin({name:'test-employees-parent',inject:['webServer','connection'],apply(scope){child=installEmployees(scope,f.directory,{store,onReady:value=>{runtime=value;}});}});await child;
  const cleanup=f.cleanup;
  return {...f,store,runtime,host,request:(body,options={})=>f.request(body,{url:'/naumi/employees',header:false,...options,...(body?{...options}: {})}),
    async post(body,options={}){return fetch(f.origin+'/naumi/employees',{method:'POST',headers:{cookie:'fixture-owner',origin:f.origin,'Content-Type':'application/json','x-naumi-employees':'1',...options.headers},body:JSON.stringify(body)});},
    async get(view='profile',extra=''){return fetch(f.origin+'/naumi/employees?botId='+f.sourceBot.id+'&view='+view+extra,{headers:{cookie:'fixture-owner'}});},
    source(text,source={kind:'user'}){const message=createUserMessage({source,content:[{type:'text',text}]});const event=f.sender.session.append('user/message',message,{surfaceOp:'append'});return {message,event};},
    async cleanup(){await host.dispose();await cleanup();},
  };
}
test('AC11 real owner HTTP CRUD and export are operable and no cloud request is required',async()=>{
  const f=await fixture();try{
    const initial=await f.get();assert.equal(initial.status,200);assert.equal(initial.headers.get('x-naumi-employees'),'1');assert.equal((await initial.json()).revision,0);
    const command={action:'profile_update',botId:f.sourceBot.id,expectedRevision:0,operationId:'profile',patch:{personality:'直接但尊重事实',persona:'协作型员工'}};
    const response=await f.post(command);assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
    assert.equal((await f.post({...command,operationId:'conflict'})).status,409);
    const mem=await f.post({action:'memory_create',botId:f.sourceBot.id,operationId:'memory',kind:'preference',text:'先给结论'});assert.equal(mem.status,200);const memory=await mem.json();
    assert.equal((await (await f.get('memories','&query=先给结论')).json()).length,1);
    assert.equal((await f.post({action:'memory_update',botId:f.sourceBot.id,memoryId:memory.id,expectedRevision:1,operationId:'delete',patch:{status:'deleted'}})).status,200);
    assert.equal((await (await f.get('memories')).json()).length,0);assert.equal((await (await f.get('export')).json()).syncState,'local_only');
    assert((await (await f.get('history')).json()).length>=3);
  }finally{await f.cleanup();}
});
test('AC11 rejects guest, cross-origin, missing header, malformed/oversize and unauthorized fields',async()=>{
  const f=await fixture();try{
    const q='?botId='+f.sourceBot.id;
    assert.equal((await f.request(null,{url:'/naumi/employees'+q,cookie:''})).status,401);
    assert.equal((await f.request(null,{url:'/naumi/employees'+q,cookie:'fixture-guest'})).status,403);
    const body={action:'profile_update',botId:f.sourceBot.id,expectedRevision:0,operationId:'x',patch:{persona:'test'}};
    assert.equal((await f.post(body,{headers:{origin:'https://foreign.example'}})).status,403);
    assert.equal((await f.request(body)).status,403);
    assert.equal((await f.post({...body,patch:{permissions:'all'}})).status,400);
    assert.equal((await f.post({...body,unknown:true})).status,400);
    assert.equal((await f.post({...body,patch:{persona:'x'.repeat(40000)}})).status,413);
    assert.equal((await f.request(null,{url:'/naumi/employees'+q,method:'DELETE'})).status,405);
  }finally{await f.cleanup();}
});
test('AC06 proposals require real user message quote; relay, missing and foreign message IDs fail',async()=>{
  const f=await fixture();try{
    const {message}=f.source('希望你做事更严谨');const tool=f.sender.tools.get('employee_memory_propose');
    const sources=(await f.sender.tools.get('employee_profile').execute({},{agent:f.sender})).recentUserSources;assert.equal(sources[0].messageId,message.id);assert.equal(sources[0].quote,'希望你做事更严谨');
    const input={kind:'preference',text:'重视细节',sourceMessageId:message.id,quote:'做事更严谨',operationId:'candidate'};
    const memory=await tool.execute(input,{agent:f.sender});assert.equal(memory.status,'candidate');assert.equal(f.store.memories(f.sourceBot.id).length,0);
    await assert.rejects(tool.execute({...input,sourceMessageId:'made-up',operationId:'bad'},{agent:f.sender}),/USER_SOURCE_REQUIRED/);
    await assert.rejects(tool.execute({...input,quote:'并不存在',operationId:'bad2'},{agent:f.sender}),/SOURCE_QUOTE_MISMATCH/);
    const relay=f.source('希望你做事更严谨',{kind:'agent-message',form:'relay',senderSessionId:f.target.id}).message;
    await assert.rejects(tool.execute({...input,sourceMessageId:relay.id,operationId:'relay'},{agent:f.sender}),/USER_SOURCE_REQUIRED/);
    await assert.rejects(f.target.tools.get('employee_memory_propose').execute(input,{agent:f.target}),/USER_SOURCE_REQUIRED/);
    const profile=await f.sender.tools.get('employee_profile_propose').execute({patch:{personality:'严谨'},sourceMessageId:message.id,quote:'更严谨',operationId:'persona'},{agent:f.sender});
    assert.equal(profile.status,'candidate');assert.equal(f.store.profile(f.sourceBot.id).personality,'');
    const accepted=await f.post({action:'memory_update',botId:f.sourceBot.id,memoryId:profile.id,expectedRevision:1,profileRevision:0,operationId:'accept',patch:{status:'active'}});assert.equal(accepted.status,200);assert.equal(f.store.profile(f.sourceBot.id).personality,'严谨');
  }finally{await f.cleanup();}
});
test('AC04 genuine session events learn standalone preference, not relay or one-time text; disabled learning works',async()=>{
  const f=await fixture();try{
    const one=f.source('以后回复先给结论');f.ctx.emit('session/event',f.sender.session,one.event);await f.runtime.settled();
    assert.equal(f.store.profile(f.sourceBot.id).communicationStyle,'先给结论');assert.equal(f.store.memories(f.sourceBot.id).length,1);
    f.ctx.emit('session/event',f.sender.session,one.event);await f.runtime.settled();assert.equal(f.store.memories(f.sourceBot.id).length,1);
    for(const [text,source]of [['这次回复先给结论',{kind:'user'}],['记住我的偏好：更夸张',{kind:'agent-message',form:'relay',senderSessionId:f.target.id}]]){const next=f.source(text,source);f.ctx.emit('session/event',f.sender.session,next.event);}await f.runtime.settled();assert.equal(f.store.memories(f.sourceBot.id).length,1);
    f.store.updateProfile(f.sourceBot.id,{expectedRevision:1,operationId:'off',patch:{autoLearning:false}});
    const next=f.source('记住我的偏好：少用术语');f.ctx.emit('session/event',f.sender.session,next.event);await f.runtime.settled();assert.equal(f.store.memories(f.sourceBot.id).length,1);
  }finally{await f.cleanup();}
});
test('AC09 context and tools resolve exact Bot data, with candidate suppression and unchanged model',async()=>{
  const f=await fixture();try{
    const original=f.sender.model.current();f.store.createMemory(f.sourceBot.id,{kind:'preference',text:'主管独有偏好',operationId:'a'});
    f.store.createMemory(f.targetBot.id,{kind:'preference',text:'目标独有偏好',operationId:'b'});
    const context=f.sender.prompts.get('naumi:employee-context').text();assert(context.includes('主管独有偏好'));assert(!context.includes('目标独有偏好'));
    assert.equal((await f.sender.tools.get('employee_memory_search').execute({query:'目标独有'},{agent:f.sender})).length,0);assert.deepEqual(f.sender.model.current(),original);
    await assert.rejects(f.sender.tools.get('employee_profile').execute({},{agent:f.sender,signal:AbortSignal.abort()}),{name:'AbortError'});
  }finally{await f.cleanup();}
});
test('AC10 heartbeat is observed state, stale detection, 0 actions; errors and teardown are honest',async()=>{
  const f=await fixture();try{
    let time=100000;const beat=new EmployeeHeartbeat({agents:f.registry,directory:f.directory,store:f.store,clock:()=>time,intervalMs:100});beat.tick();
    const sample=beat.read();assert.equal(sample.runtimeState,'healthy');assert.equal(sample.modelCalls,0);assert.equal(sample.actionsStarted,0);
    time+=301;assert.equal(beat.read().stale,true);assert.equal(beat.read().sampledAt,sample.sampledAt);
    const n=f.creations.length;beat.tick();assert.equal(f.creations.length,n);
    beat.agents={list(){throw Error('fixture scan failure');}};beat.tick();assert.equal(beat.read().runtimeState,'error');
    beat.close();const stopped=beat.read();time+=10000;beat.tick();assert.equal(beat.read().sampledAt,stopped.sampledAt);assert.equal(beat.timer,null);
    const response=await f.get('heartbeat');assert.equal(response.status,200);assert.equal((await response.json()).modelCalls,0);
    const before=f.sender.tools.size;await f.host.dispose();assert.equal(f.sender.tools.size,before-8);assert.equal(f.runtime.heartbeat.read().runtimeState,'stopped');
  }finally{await f.cleanup();}
});
