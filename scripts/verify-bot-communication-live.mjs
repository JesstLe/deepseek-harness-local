import fs from 'node:fs';
import assert from 'node:assert/strict';
import {botLiveApi} from './bot-live-api.mjs';

// One real, bounded textual round trip. Checkpoint + idempotency avoid duplicate paid work on rerun.
const api=await botLiveApi(),e='evidence/bot-communication/',checkpoint=e+'live-attempt.json';
const ready=await api.request('/naumi/bot-tasks');assert.equal(ready.status,200);assert.equal(ready.headers.get('x-naumi-bot-router'),'1');await ready.json();
let attempt=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):null;
const save=()=>fs.writeFileSync(checkpoint,JSON.stringify(attempt,null,2)+'\n');
if(!attempt){
  const before=await api.json('/naumi/bots'),source=before.bots.find(b=>b.name==='项目主管'&&b.status==='active'),target=before.bots.find(b=>b.name==='自媒体内容运营'&&b.status==='active');
  assert(source&&target,'expected existing Bots missing');
  const created=await api.rpc('session/create',{request:{cwd:source.cwd,agentPreset:source.agentPreset}});
  attempt={sourceBotId:source.id,targetBotId:target.id,sourceSessionId:created.sessionId,key:'naumi-communication-live-v1',marker:'NAUMI_BOT_LINK_OK_20261116',botIds:before.bots.map(b=>b.id),startedAt:new Date().toISOString()};save();
  await api.rpc('session/rename',{request:{sessionId:created.sessionId,title:'Bot 通信联调'}});
}
let bots=await api.json('/naumi/bots'),source=bots.bots.find(b=>b.id===attempt.sourceBotId);
if(!source.sessionIds.includes(attempt.sourceSessionId))await api.json('/naumi/bots',{action:'bind',botId:source.id,sessionId:attempt.sourceSessionId,expectedRevision:source.revision},'x-naumi-bots');
const text=`这是一条 Naumi Bot 通信联调，不处理业务、不读写文件、不调用浏览器或其他工具。请只回复：${attempt.marker}。`;
const accepted=await api.json('/naumi/bot-tasks',{action:'dispatch',sourceSessionId:attempt.sourceSessionId,targetBotId:attempt.targetBotId,task:text,idempotencyKey:attempt.key},'x-naumi-bot-tasks');
attempt.taskId=accepted.id;attempt.targetSessionId=accepted.targetSessionId;save();
let task=accepted;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('LIVE_TASK_TIMEOUT')),120000);
try{
  const events=await api.request('/naumi/bot-tasks/events',{signal:controller.signal});assert.equal(events.status,200);
  for await(const chunk of events.body){
    if(!String(chunk).length)continue;
    task=await api.json('/naumi/bot-tasks?taskId='+attempt.taskId);
    if(['failed','cancelled','interrupted'].includes(task.status))throw Error(task.error??task.status);
    if(task.status==='completed'&&task.messages.some(m=>m.kind==='result'&&m.delivered))break;
  }
}finally{clearTimeout(timer);controller.abort();}
assert.equal(task.status,'completed');assert(task.result.includes(attempt.marker));
const parent=await api.rpc('session/wait',{request:{sessionId:attempt.sourceSessionId,timeoutMs:120000,limit:5}},125000);
assert.equal(parent.reason,'idle','supervisor not settled');
const parentOutput=JSON.stringify(parent.output.records);assert(parentOutput.includes(attempt.marker),'supervisor did not acknowledge returned marker');
bots=await api.json('/naumi/bots');assert.deepEqual(bots.bots.map(b=>b.id),attempt.botIds);
assert(bots.bots.find(b=>b.id===attempt.targetBotId).sessionIds.includes(attempt.targetSessionId));
const again=await api.json('/naumi/bot-tasks',{action:'dispatch',sourceSessionId:attempt.sourceSessionId,targetBotId:attempt.targetBotId,task:text,idempotencyKey:attempt.key},'x-naumi-bot-tasks');assert.equal(again.id,task.id);
const proof={tier:'live Harness with configured model; dedicated labelled integration Session',...attempt,status:task.status,
  result:task.result,sourceResultAcknowledged:true,returnDelivered:true,existingBotsPreserved:true,idempotency:true,completedAt:new Date().toISOString()};
fs.writeFileSync(e+'LIVE_VERIFICATION.json',JSON.stringify(proof,null,2)+'\n');
console.log('LIVE dispatch=PASS target_bot=reused worker_completed=1 result_return=PASS supervisor_ack=PASS duplicate_tasks=0');
