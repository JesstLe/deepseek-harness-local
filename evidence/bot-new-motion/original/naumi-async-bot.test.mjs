import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {taskFixture} from './helpers/bot-task-fixture.mjs';
import {botTaskHost} from './helpers/bot-task-host.mjs';
import {createTaskActivity,employeeTaskState,receptionTarget,sessionTasks} from '../plugins/naumi-enterprise/assets/bot-task-model.js';

test('default dispatch is durable background acceptance; wait returns immediately and chat does not own the worker',async()=>{
  const f=await taskFixture();try{
    const args=f.input();delete args.replyMode;
    const t=await f.service.dispatch(f.sender,args);assert.equal(t.replyMode,'background');await f.service.settled();
    const result=await f.service.wait(f.sender,{taskId:t.id,afterRevision:f.service.current(t.id).revision,timeoutMs:120000});
    assert.equal(result.background,true);assert.equal(f.service.waiters.size,0);assert.equal(f.service.current(t.id).status,'running');
    f.service.userInput(f.sender.id,{id:'new-topic',source:{kind:'user'},content:[{type:'text',text:'聊另一件事'}]});
    assert.equal(f.service.current(t.id).messageId,t.messageId);
    await f.finish(t);assert.equal(f.service.current(t.id).status,'completed');assert.equal(f.deliveries.at(-1).mode,'followup');
    const before=f.deliveries.length;await f.restart();assert.equal(f.deliveries.length,before);
    await assert.rejects(f.service.dispatch(f.sender,{...args,replyMode:'wait'}),/IDEMPOTENCY_CONFLICT/);
  }finally{await f.cleanup();}
});

test('legacy dispatch retries keep the original identity and wait semantics after upgrade',async()=>{
  const f=await taskFixture();try{
    const args=f.input(),task=await f.service.dispatch(f.sender,args);await f.service.settled();
    await f.store.change(doc=>{delete doc.tasks.find(t=>t.id===task.id).replyMode;return {value:null};});
    delete args.replyMode;
    const retried=await f.service.dispatch(f.sender,args);assert.equal(retried.id,task.id);assert.equal(f.store.read().tasks.length,1);
    await assert.rejects(f.service.dispatch(f.sender,{...args,replyMode:'background'}),/IDEMPOTENCY_CONFLICT/);
  }finally{await f.cleanup();}
});

test('explicit waiting and delegated dependencies preserve their wait semantics',async()=>{
  const f=await taskFixture();try{
    const task=await f.service.dispatch(f.sender,f.input({replyMode:'background'}));await f.service.settled();
    const waiting=f.service.wait(f.sender,{taskId:task.id,afterRevision:f.service.current(task.id).revision,timeoutMs:1000,waitForResult:true});
    assert.equal(f.service.waiters.size,1);
    const nested=await f.service.dispatch(f.agents.get(task.targetSessionId),{targetBotId:f.otherBot.id,task:'独立子任务',idempotencyKey:'child'});
    assert.equal(nested.replyMode,'wait');await f.service.settled();await f.finish(task);assert.equal((await waiting).status,'completed');
  }finally{await f.cleanup();}
});

test('actual Session inbox places old-task results in next-turn without steering the current discussion',async()=>{
  const f=await botTaskHost();try{
    const t=await f.service.dispatch(f.sender,{targetBotId:f.targetBot.id,task:'写文案',idempotencyKey:'background'});await f.service.settled();
    f.sender.session.append('turn/start',{turn:1});f.sender.status='running';
    const before=f.sender.session.snapshotEvents().length;
    await f.complete(t);
    assert.equal(f.sender.inbox.nextStep.length,0);assert.equal(f.sender.inbox.nextTurn.length,1);
    const message=f.sender.inbox.nextTurn[0];assert.equal(message.source.kind,'agent-message');assert(message.content[0].text.includes(t.id));
    const newEvents=f.sender.session.snapshotEvents().slice(before);
    assert.equal(newEvents.filter(e=>e.type==='user/message').length,0);
    assert.equal(newEvents.find(e=>e.type==='agent/inbox/spliced').data.target,'next-turn');
    // Lost outbox acknowledgement does not move an already-queued message into the running turn.
    await f.store.change(d=>{d.outbox[0].delivered=false;return {value:null};});await f.service.settled();
    assert.equal(f.sender.inbox.nextStep.length,0);assert.equal(f.sender.inbox.nextTurn.length,1);
    const compact=await(await f.request(null,{url:'/naumi/bot-tasks?view=activity'})).json();
    assert.equal(compact.tasks[0].replyMode,'background');assert(!('profile'in compact.tasks[0]));assert(!('result'in compact.tasks[0]));
  }finally{await f.cleanup();}
});

test('a failed cancellation never falsely completes the task; deliberate retry cancels only that worker',async()=>{
  const f=await taskFixture();try{
    const t=await f.service.dispatch(f.sender,f.input());await f.service.settled();const cancel=f.runtime.cancel;
    f.runtime.cancel=async()=>{throw Error('FIXTURE_STOP_FAILED');};
    await assert.rejects(f.service.cancel(f.sender,{taskId:t.id,expectedRevision:f.service.current(t.id).revision}),/STOP_FAILED/);
    assert.equal(f.service.current(t.id).status,'running');assert.equal(f.runtime.isRunning(t.targetSessionId),true);
    f.runtime.cancel=cancel;await f.service.cancel(f.sender,{taskId:t.id,expectedRevision:f.service.current(t.id).revision});
    assert.equal(f.service.current(t.id).status,'cancelled');assert.equal(f.runtime.isRunning(t.targetSessionId),false);
  }finally{await f.cleanup();}
});

test('reception and avatar states come from different sources; opening a Bot never selects its active job',()=>{
  const bot={id:'b',homeSessionId:'home',sessionIds:['home','chat2','job']},tasks=[{id:'t',targetBotId:'b',targetSessionId:'job',sourceSessionId:'source',status:'running',updatedAt:'2026-11-17'}];
  const sessions={byId:{home:{id:'home'},chat2:{id:'chat2'},job:{id:'job',running:true}}};
  assert.equal(receptionTarget(bot,tasks,sessions), 'home');assert.equal(receptionTarget(bot,tasks,sessions,{archivedSessionIds:['home']}),'chat2');
  assert.equal(employeeTaskState(bot,tasks),'running');assert.equal(employeeTaskState(bot,[{...tasks[0],status:'queued'}]),'queued');
  assert.equal(employeeTaskState(bot,[{...tasks[0],status:'waiting'}]),'waiting');assert.equal(sessionTasks(tasks,'source').length,1);assert.equal(sessionTasks(tasks,'other').length,0);
});

test('task subscriptions share one event feed, clear identities on permission loss and ignore late responses after unmount',async()=>{
  const streams=[],calls=[];let allowed=true;
  const source=createTaskActivity({fetcher:async(url,options)=>{calls.push({url,options});return allowed?Response.json({version:1,revision:1,tasks:[{id:'private'}]}):new Response('',{status:403});},eventSource:()=>{const s={close(){s.closed=true;}};streams.push(s);return s;},windowTarget:{addEventListener(){},removeEventListener(){}}});
  const a=source.subscribe(()=>{}),b=source.subscribe(()=>{});await source.refresh();assert.equal(streams.length,1);assert.equal(source.getSnapshot().tasks.length,1);
  allowed=false;await source.refresh();assert.equal(source.getSnapshot().status,'forbidden');assert.deepEqual(source.getSnapshot().tasks,[]);assert.equal(streams[0].closed,true);
  a();b();assert.equal(source.getSnapshot().status,'idle');assert(calls.every(c=>c.options.method==='GET'));
});

test('async UI remains additive and retains employee menus, model location, native cancel/queue and reduced motion',()=>{
  const ui=fs.readFileSync('plugins/naumi-enterprise/assets/bot-task-ui.js','utf8'),css=fs.readFileSync('plugins/naumi-enterprise/assets/bot-task.css','utf8'),sidebar=fs.readFileSync('plugins/naumi-enterprise/assets/bot-sidebar.js','utf8');
  assert(ui.includes("name:'conversation.input.dock'"));assert(!ui.includes('session.prompt'));assert(!ui.includes('setInterval'));
  assert(sidebar.includes('EXPERIENCE_ACTIONS'));assert(sidebar.includes('receptionTarget'));assert(css.includes('prefers-reduced-motion'));
  assert(fs.readFileSync('plugins/naumi-enterprise/bot-tasks.js','utf8').includes('END your turn'));
});
