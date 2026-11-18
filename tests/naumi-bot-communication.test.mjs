import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {taskFixture} from './helpers/bot-task-fixture.mjs';
import {BotTaskStore} from '../plugins/naumi-enterprise/bot-task-store.js';
import {inspectBotMessage} from '../plugins/naumi-enterprise/bot-task-runtime.js';
import {createBotTaskTools} from '../plugins/naumi-enterprise/bot-tasks.js';

test('dispatch reuses target Bot identity, binds a distinct root task and automatically returns its real result',async()=>{
  const f=await taskFixture();try{
    const before=f.directory.list().bots.map(b=>b.id),task=await f.service.dispatch(f.sender,f.input());await f.service.settled();
    assert.equal(f.service.current(task.id).status,'running');assert.deepEqual(f.directory.list().bots.map(b=>b.id),before);
    assert.equal(f.directory.forSession(task.targetSessionId).id,f.targetBot.id);assert.notEqual(task.targetSessionId,f.target.id);
    assert.equal(f.sessions.get(task.targetSessionId).profile.agentPreset,'target-preset');
    assert.equal(f.sessions.get(task.targetSessionId).profile.model.model,'target-model');
    await f.finish(task);assert.equal(f.service.current(task.id).status,'completed');
    const replies=f.deliveries.filter(d=>d.sessionId===f.sender.id);assert.equal(replies.length,1);assert.match(replies[0].text,/目标 Bot 的交付内容/);
    assert.equal(replies[0].fromSessionId,task.targetSessionId);assert.equal(f.errors.length,0);
  }finally{await f.cleanup();}
});
test('concurrent repeated dispatch is one task, one linked Session and one delivery',async()=>{
  const f=await taskFixture();try{
    const input=f.input(),tasks=await Promise.all(Array.from({length:12},()=>f.service.dispatch(f.sender,input)));await f.service.settled();
    assert.equal(new Set(tasks.map(t=>t.id)).size,1);assert.equal(f.store.read().tasks.length,1);
    assert.equal(f.deliveries.filter(d=>d.sessionId===tasks[0].targetSessionId).length,1);
    await assert.rejects(f.service.dispatch(f.sender,{...input,task:'另一任务'}),/IDEMPOTENCY_CONFLICT/);
  }finally{await f.cleanup();}
});
test('teammates cannot dispatch, foreign Bot cannot inspect/cancel, and source cannot impersonate executor result',async()=>{
  const f=await taskFixture();try{
    const teammate={id:'member',role:'teammate',root:f.sender};f.agents.set(teammate.id,teammate);
    await assert.rejects(f.service.dispatch(teammate,f.input()),/BOT_LEAD_REQUIRED/);
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();
    await assert.rejects(f.service.get(f.other,task.id),/BOT_TASK_FORBIDDEN/);
    await assert.rejects(f.service.reply(f.sender,{taskId:task.id,idempotencyKey:'fake-result',kind:'result',message:'假结果'}),/EXECUTOR_REQUIRED/);
    await assert.rejects(f.service.reply(f.target,{taskId:task.id,idempotencyKey:'wrong-session',kind:'result',message:'假结果'}),/EXECUTOR_REQUIRED/);
  }finally{await f.cleanup();}
});
test('archived target and unbound caller never create a task or send a message',async()=>{
  const f=await taskFixture();try{
    await f.directory.update(f.target.id,{status:'archived',expectedRevision:1});
    await assert.rejects(f.service.dispatch(f.sender,f.input()),/BOT_ARCHIVED/);
    const stranger={id:'stranger',role:'lead'};f.agents.set(stranger.id,stranger);
    await assert.rejects(f.service.dispatch(stranger,f.input()),/BOT_NOT_BOUND/);
    assert.equal(f.store.read().tasks.length,0);assert.equal(f.deliveries.length,0);
  }finally{await f.cleanup();}
});
test('same Bot queue is serialized without blocking an unrelated Bot',async()=>{
  const f=await taskFixture({concurrency:2});try{
    const a=await f.service.dispatch(f.sender,f.input()),b=await f.service.dispatch(f.sender,f.input());
    const c=await f.service.dispatch(f.sender,f.input({targetBotId:f.otherBot.id}));await f.service.settled();
    assert.equal(f.service.current(a.id).status,'running');assert.equal(f.service.current(b.id).status,'queued');assert.equal(f.service.current(c.id).status,'running');
    await f.finish(a);assert.equal(f.service.current(b.id).status,'running');
  }finally{await f.cleanup();}
});
test('delegation back to an ancestor Bot and self-dispatch are rejected',async()=>{
  const f=await taskFixture();try{
    await assert.rejects(f.service.dispatch(f.sender,f.input({targetBotId:f.sourceBot.id})),/BOT_TASK_CYCLE/);
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();
    await assert.rejects(f.service.dispatch(f.agents.get(task.targetSessionId),f.input({targetBotId:f.sourceBot.id})),/BOT_TASK_CYCLE/);
  }finally{await f.cleanup();}
});
test('worker clarification reaches the original sender; feedback resumes the same target task',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();const worker=f.agents.get(task.targetSessionId);
    const args={taskId:task.id,idempotencyKey:'clarify',kind:'blocked',message:'请选择要使用的素材'};
    await f.service.reply(worker,args);await f.service.reply(worker,args);await f.service.settled();
    assert.equal(f.service.current(task.id).status,'waiting');assert.equal(f.deliveries.filter(d=>d.sessionId===f.sender.id).length,1);
    await f.service.reply(f.sender,{taskId:task.id,idempotencyKey:'answer',kind:'message',message:'使用现有产品资料'});await f.service.settled();
    assert.equal(f.service.current(task.id).status,'running');assert.equal(f.deliveries.filter(d=>d.sessionId===task.targetSessionId).length,2);
    await f.finish(task);assert.equal(f.service.current(task.id).status,'completed');
  }finally{await f.cleanup();}
});
test('progress is persisted without waking the sender or pretending the task completed',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();
    await f.service.reply(f.agents.get(task.targetSessionId),{taskId:task.id,idempotencyKey:'progress',kind:'progress',message:'资料已整理'});await f.service.settled();
    assert.equal(f.service.current(task.id).status,'running');assert.equal(f.deliveries.filter(d=>d.sessionId===f.sender.id).length,0);
    assert.equal(f.service.current(task.id).progress,'资料已整理');
  }finally{await f.cleanup();}
});
test('feedback recovery preserves the feedback body rather than resending the original task',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();
    await f.service.reply(f.agents.get(task.targetSessionId),{taskId:task.id,idempotencyKey:'question',kind:'blocked',message:'需要补充资料'});await f.service.settled();
    f.runtime.failDelivery=true;await f.service.reply(f.sender,{taskId:task.id,idempotencyKey:'feedback',kind:'message',message:'反馈独有内容：使用蓝色版本'});await f.service.settled();
    f.sessions.get(task.targetSessionId).running=false;f.runtime.failDelivery=false;await f.restart();
    const last=f.deliveries.filter(d=>d.sessionId===task.targetSessionId).at(-1);assert.match(last.text,/反馈独有内容：使用蓝色版本/);assert.equal(f.service.current(task.id).status,'running');
  }finally{await f.cleanup();}
});
test('old-attempt outbox items never enter a later attempt',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();f.runtime.failSource=true;await f.finish(task,{kind:'error'});
    await f.service.retry(f.sender,{taskId:task.id,expectedRevision:f.service.current(task.id).revision});await f.service.settled();
    f.runtime.failSource=false;await f.restart();assert.equal(f.store.read().outbox[0].error,'BOT_TASK_STALE_ATTEMPT');
    assert.equal(f.deliveries.filter(d=>d.sessionId===f.sender.id).length,0);
  }finally{await f.cleanup();}
});
test('a direct human answer in a waiting task becomes the current message without changing task identity',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();
    await f.service.reply(f.agents.get(task.targetSessionId),{taskId:task.id,idempotencyKey:'question',kind:'blocked',message:'需要资料'});await f.service.settled();
    f.service.userInput(task.targetSessionId,{id:'human-answer',source:{kind:'user'}});await f.service.settled();
    assert.equal(f.service.current(task.id).messageId,'human-answer');assert.equal(f.service.current(task.id).status,'running');
  }finally{await f.cleanup();}
});
test('empty final answer, error and interrupted turns are never reported as completed',async()=>{
  for(const [kind,text,expected]of [['completed','','failed'],['error','some text','failed'],['interrupted','some text','interrupted']]){
    const f=await taskFixture();try{const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();await f.finish(task,{kind,text});assert.equal(f.service.current(task.id).status,expected);}finally{await f.cleanup();}
  }
});
test('explicit cancel and retry use CAS, preserve Bot/task/Session IDs and never stop unrelated work',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();
    await assert.rejects(f.service.cancel(f.sender,{taskId:task.id,expectedRevision:1}),/BOT_TASK_CONFLICT/);
    const cancelled=await f.service.cancel(f.sender,{taskId:task.id,expectedRevision:f.service.current(task.id).revision});await f.service.settled();assert.equal(cancelled.status,'cancelled');
    const retried=await f.service.retry(f.sender,{taskId:task.id,expectedRevision:cancelled.revision});await f.service.settled();
    assert.equal(retried.id,task.id);assert.equal(retried.targetSessionId,task.targetSessionId);assert.equal(retried.attempt,2);assert.equal(f.directory.list().bots.length,3);
    await f.finish(task);assert.equal(f.service.current(task.id).status,'completed');
  }finally{await f.cleanup();}
});
test('disk failure before acceptance produces no dispatch or false task',async()=>{
  const f=await taskFixture();try{
    f.store.write=async()=>{throw Error('fixture disk failure');};await assert.rejects(f.service.dispatch(f.sender,f.input()),/disk failure/);
    assert.equal(f.store.read().tasks.length,0);assert.equal(f.deliveries.length,0);
  }finally{await f.cleanup();}
});
test('failed send retains an actionable failure; deliberate retry reuses identity',async()=>{
  const f=await taskFixture();try{
    f.runtime.failDelivery=true;const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();
    assert.equal(f.service.current(task.id).status,'failed');f.runtime.failDelivery=false;
    await f.service.retry(f.sender,{taskId:task.id,expectedRevision:f.service.current(task.id).revision});await f.service.settled();
    assert.equal(f.service.current(task.id).status,'running');assert.equal(f.store.read().tasks.length,1);
  }finally{await f.cleanup();}
});
test('restart preserves completed identity and never repeats execution or acknowledged replies',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();await f.finish(task);const count=f.deliveries.length;
    await f.restart();assert.equal(f.service.current(task.id).status,'completed');assert.equal(f.deliveries.length,count);
  }finally{await f.cleanup();}
});
test('recovery returns a durable result after a crash between turn end and ledger update',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();const s=f.sessions.get(task.targetSessionId);
    s.running=false;Object.assign(s.messages.get(task.messageId),{end:{kind:'completed'},text:'已落盘的结果'});
    await f.restart();assert.equal(f.service.current(task.id).status,'completed');assert.equal(f.deliveries.filter(d=>d.sessionId===task.targetSessionId).length,1);
    assert.equal(f.deliveries.filter(d=>d.sessionId===f.sender.id).length,1);
  }finally{await f.cleanup();}
});
test('a consumed task without a durable end is interrupted on recovery, not silently replayed',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();f.sessions.get(task.targetSessionId).running=false;
    await f.restart();assert.equal(f.service.current(task.id).status,'interrupted');assert.equal(f.deliveries.filter(d=>d.sessionId===task.targetSessionId).length,1);
  }finally{await f.cleanup();}
});
test('reply outbox survives an offline sender and retries once on recovery without rerunning worker',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();f.runtime.failSource=true;await f.finish(task);
    assert.equal(f.store.read().outbox[0].delivered,false);assert(f.store.read().outbox[0].error);
    f.runtime.failSource=false;await f.restart();assert.equal(f.store.read().outbox[0].delivered,true);
    assert.equal(f.deliveries.filter(d=>d.sessionId===task.targetSessionId).length,1);assert.equal(f.deliveries.filter(d=>d.sessionId===f.sender.id).length,1);
  }finally{await f.cleanup();}
});
test('persisted reply delivery acknowledgement loss deduplicates by exact message ID',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();await f.finish(task);
    await f.store.change(doc=>{doc.outbox[0].delivered=false;return {value:null};});await f.service.settled();
    assert.equal(f.deliveries.filter(d=>d.sessionId===f.sender.id).length,1);
  }finally{await f.cleanup();}
});
test('wait is event-driven, has race-free revision checks, cancellation and teardown',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input());await f.service.settled();const afterRevision=f.service.current(task.id).revision;
    const waiting=f.service.wait(f.sender,{taskId:task.id,afterRevision,timeoutMs:1000});await f.finish(task);assert.equal((await waiting).status,'completed');
    const another=await f.service.dispatch(f.sender,f.input());await f.service.settled();const controller=new AbortController();
    const promise=f.service.wait(f.sender,{taskId:another.id,afterRevision:f.service.current(another.id).revision,timeoutMs:1000},{signal:controller.signal});controller.abort();await assert.rejects(promise,{name:'AbortError'});
    const closed=f.service.wait(f.sender,{taskId:another.id,afterRevision:f.service.current(another.id).revision,timeoutMs:1000});const checked=assert.rejects(closed,/BOT_ROUTER_CLOSED/);await f.service.close();await checked;
  }finally{await f.cleanup();}
});
test('corrupt ledger fails closed and is not replaced with an empty ledger',async()=>{
  const f=await taskFixture();try{
    fs.writeFileSync(f.storeFile,'{"version":999}');const broken=new BotTaskStore(f.storeFile);
    assert.throws(()=>broken.read(),/BOT_TASK_LEDGER_INVALID/);assert.equal(fs.readFileSync(f.storeFile,'utf8'),'{"version":999}');await broken.close();
  }finally{await f.cleanup();}
});
test('message matching excludes unrelated turns and respects parked or discarded input',()=>{
  const events=[{type:'agent/inbox/spliced',data:{target:'next-step',start:0,removedCount:0,inserted:[{id:'a'}]}},
    {type:'turn/start',data:{turn:1}},{type:'agent/inbox/spliced',data:{target:'next-step',start:0,removedCount:1,inserted:[]}},
    {type:'user/message',data:{id:'a'}},{type:'assistant/message',data:{turn:1,message:{content:[{type:'text',text:'正确结果'}]}}},{type:'turn/end',data:{turn:1,reason:{kind:'completed'}}},
    {type:'turn/start',data:{turn:2}},{type:'assistant/message',data:{turn:2,message:{content:[{type:'text',text:'无关结果'}]}}},{type:'turn/end',data:{turn:2,reason:{kind:'completed'}}}];
  const view=inspectBotMessage(events,'a');assert.equal(view.text,'正确结果');assert.equal(view.turn,1);assert.equal(view.pending,false);
  assert.equal(inspectBotMessage(events,'missing').seen,false);assert.equal(inspectBotMessage(events.slice(0,1),'a').pending,true);
});
test('tool set exposes dispatch/reply/lifecycle with exact caller and cancellation, never spawn replacement',async()=>{
  const f=await taskFixture();try{
    const tools=Object.fromEntries(createBotTaskTools(f.service).map(t=>[t.name,t]));assert.equal(Object.keys(tools).length,9);assert(tools.bot_task_start);
    assert(!Object.hasOwn(tools,'spawn_teammate'));
    await assert.rejects(tools.bot_dispatch.execute(f.input(),{agent:f.sender,signal:AbortSignal.abort()}),{name:'AbortError'});
    assert.equal(f.store.read().tasks.length,0);
  }finally{await f.cleanup();}
});
