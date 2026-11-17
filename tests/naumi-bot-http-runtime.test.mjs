import test from 'node:test';
import assert from 'node:assert/strict';
import {botTaskHost} from './helpers/bot-task-host.mjs';

test('real Cordis and HTTP dispatch through public registry preserves target profile and returns a durable relay',async()=>{
  const f=await botTaskHost();try{
    assert.equal(f.sender.tools.size,8);assert(f.sender.prompts.get('naumi:bot-routing'));
    const before=JSON.stringify(f.sender.session.snapshotEvents());
    const response=await f.request({action:'dispatch',sourceSessionId:f.sender.id,targetBotId:f.targetBot.id,task:'返回验证文本',idempotencyKey:'http-dispatch-1'});
    assert.equal(response.status,200);assert.equal(response.headers.get('x-naumi-bot-router'),'1');const task=await response.json();
    await f.service.settled();assert.equal(f.service.current(task.id).status,'running');
    const worker=f.agents.get(task.targetSessionId);assert.equal(worker.session.header.agentPreset,'target-preset');assert.equal(worker.model.current().model,'target-model');
    assert.equal(worker.session.snapshotEvents().findLast(e=>e.type==='sandbox/mode').data.mode,'read-only');assert.equal(JSON.stringify(f.sender.session.snapshotEvents()),before);
    assert.equal(f.creations.length,1);assert.equal(f.creations[0].parentAgent,undefined);assert.equal(worker.session.header.origin,undefined);
    assert.match(worker.prompts.get('naumi:bot-task').text(),new RegExp(task.id));
    await f.complete(task);assert.equal(f.service.current(task.id).status,'completed');
    const message=f.sender.inbox.nextTurn[0];assert.equal(message.source.kind,'agent-message');assert.equal(message.source.senderSessionId,task.targetSessionId);assert.match(message.content[0].text,/真实会话格式交付/);
    const fetched=await (await f.request(null,{url:'/naumi/bot-tasks?taskId='+task.id})).json();assert.equal(fetched.result,'真实会话格式交付');assert.equal(fetched.messages[0].delivered,true);assert(!('profile'in fetched));
  }finally{await f.cleanup();}
});
test('HTTP owner/origin/body boundaries reject unauthenticated and undeclared commands',async()=>{
  const f=await botTaskHost();try{
    assert.equal((await f.request(null,{cookie:''})).status,401);assert.equal((await f.request(null,{cookie:'fixture-guest'})).status,403);
    const body={action:'dispatch',sourceSessionId:f.sender.id,targetBotId:f.targetBot.id,task:'验证',idempotencyKey:'key'};
    assert.equal((await f.request(body,{originHeader:'https://foreign.example'})).status,403);
    assert.equal((await f.request(body,{header:false})).status,403);
    assert.equal((await f.request({...body,sourceSessionId:'unbound'})).status,403);
    assert.equal((await f.request({...body,agentPreset:'forbidden-override'})).status,400);
    assert.equal((await f.request('x'.repeat(65537))).status,413);
    assert.equal((await f.request(null,{method:'DELETE'})).status,405);
    assert.equal(f.store.read().tasks.length,0);
  }finally{await f.cleanup();}
});
test('source result delivery is deduplicated even when acknowledgement is lost after inbox persistence',async()=>{
  const f=await botTaskHost();try{
    const task=await f.service.dispatch(f.sender,{targetBotId:f.targetBot.id,task:'验证',idempotencyKey:'once'});await f.service.settled();await f.complete(task);
    const message=f.sender.inbox.nextTurn[0];await f.store.change(doc=>{doc.outbox[0].delivered=false;return {value:null};});await f.service.settled();
    assert.equal(f.sender.inbox.nextTurn.length,1);assert.equal(f.sender.inbox.nextTurn[0].id,message.id);
  }finally{await f.cleanup();}
});
test('cold target profile is read without waking its home Session',async()=>{
  const f=await botTaskHost();try{
    f.agents.delete(f.target.id);const task=await f.service.dispatch(f.sender,{targetBotId:f.targetBot.id,task:'验证',idempotencyKey:'cold'});await f.service.settled();
    assert(!f.agents.has(f.target.id));assert.equal(f.agents.get(task.targetSessionId).model.current().model,'target-model');assert.equal(f.service.current(task.id).status,'running');
  }finally{await f.cleanup();}
});
