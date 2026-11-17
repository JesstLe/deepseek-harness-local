import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {zstdDecompressSync} from 'node:zlib';
import {botLiveApi} from './bot-live-api.mjs';

const root=path.resolve(process.argv[2]??'E:/Workspace/naumi-desktop'),api=await botLiveApi(root),e=path.resolve('evidence/async-bot'),checkpoint=path.join(e,'live-checkpoint.json');
let run=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):null;
const save=()=>fs.writeFileSync(checkpoint,JSON.stringify(run,null,2)+'\n');
const read=id=>{
  const home=path.join(root,'.dsh/sessions');let file;for(const name of fs.readdirSync(home)){const p=path.join(home,name,id,'session.v4.jsonl.zstd');if(fs.existsSync(p)){file=p;break;}}assert(file);
  const bytes=fs.readFileSync(file),parts=[];let offset=0;while(offset<bytes.length){const frame=zstdDecompressSync(bytes.subarray(offset),{info:true});assert(frame.engine.bytesWritten);offset+=frame.engine.bytesWritten;parts.push(frame.buffer);}
  return Buffer.concat(parts).toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
};
const all=await api.json('/naumi/bots');
if(!run){
  const source=all.bots.find(b=>b.name.includes('主管'))??all.bots[0],target=all.bots.find(b=>b.id!==source.id&&b.name.includes('运营'))??all.bots.find(b=>b.id!==source.id);assert(source&&target);
  const created=await api.rpc('session/create',{request:{cwd:source.cwd,agentPreset:source.agentPreset}});
  run={startedAt:new Date().toISOString(),sourceSessionId:created.sessionId,sourceBotId:source.id,targetBotId:target.id,targetName:target.name,botIds:all.bots.map(b=>b.id),firstRequest:randomUUID(),secondRequest:randomUUID(),firstSent:false,secondSent:false};save();
  await api.rpc('session/rename',{request:{sessionId:created.sessionId,title:'异步聊天联调'}});
}
if(run.finished){console.log('LIVE_ALREADY_VERIFIED no_model_replay=1');process.exit(0);}
const source=(await api.json('/naumi/bots')).bots.find(b=>b.id===run.sourceBotId);assert(source);
if(!source.sessionIds.includes(run.sourceSessionId))await api.json('/naumi/bots',{action:'bind',botId:source.id,sessionId:run.sourceSessionId,expectedRevision:source.revision},'x-naumi-bots');
const prompt=async(requestId,text)=>api.rpc('session/prompt',{request:{requestId,sessionId:run.sourceSessionId,mode:'queue',content:[{type:'text',text}],clientTimeZone:'Asia/Shanghai'}});
if(!run.firstSent){run.firstSent=true;save();await prompt(run.firstRequest,`这是异步协作联调：让已有的“${run.targetName}”Bot 在它自己的任务会话中先用 pwsh 执行 Start-Sleep -Seconds 25，再只回复 NAUMI_ASYNC_WORK_DONE。不要创建替代队友或新 Bot，不读写文件，不做外部操作。我还要继续与你聊别的话题。`);}
if(!run.acknowledged){
  const wait=await api.rpc('session/wait',{request:{sessionId:run.sourceSessionId,timeoutMs:90000,limit:1}},95000);assert.equal(wait.reason,'idle');
  const tasks=(await api.json('/naumi/bot-tasks')).tasks.filter(t=>t.sourceSessionId===run.sourceSessionId);assert.equal(tasks.length,1);const task=tasks[0];
  run.taskId=task.id;run.targetSessionId=task.targetSessionId;run.mode=task.replyMode;run.statusAtAcknowledgement=task.status;run.acknowledgedAt=new Date().toISOString();save();
  assert.equal(task.replyMode,'background');assert(['queued','starting','running'].includes(task.status),'Supervisor waited until worker finished');run.acknowledged=true;save();
}
if(!run.secondSent){run.secondSent=true;save();await prompt(run.secondRequest,'现在换个独立话题，请只回复 NAUMI_CHAT_CAN_CONTINUE；前面交办的工作保持原样继续，不要等待它，也不要取消或重派。');}
if(!run.secondReplied){
  const wait=await api.rpc('session/wait',{request:{sessionId:run.sourceSessionId,timeoutMs:90000,limit:1}},95000);assert.equal(wait.reason,'idle');
  const task=await api.json('/naumi/bot-tasks?taskId='+run.taskId),rows=read(run.sourceSessionId),final=rows.findLast(r=>r.type==='assistant/message')?.data.message;
  assert((final?.content??[]).some(b=>b.type==='text'&&b.text.includes('NAUMI_CHAT_CAN_CONTINUE')),'New topic did not get an independent reply');
  run.statusAtSecondReply=task.status;run.secondReplyAt=new Date().toISOString();save();assert(['queued','starting','running'].includes(task.status),'Worker completed before second topic could be answered');run.secondReplied=true;save();
}
let task=await api.json('/naumi/bot-tasks?taskId='+run.taskId);
if(!['completed','failed','cancelled','interrupted'].includes(task.status)){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(Error('ASYNC_WORK_TIMEOUT')),120000);
  try{const stream=await api.request('/naumi/bot-tasks/events',{signal:abort.signal});for await(const _ of stream.body){task=await api.json('/naumi/bot-tasks?taskId='+run.taskId);if(['completed','failed','cancelled','interrupted'].includes(task.status)&&task.messages.some(m=>m.delivered))break;}}
  finally{clearTimeout(timer);abort.abort();}
}
assert.equal(task.status,'completed',task.error);assert(task.result.includes('NAUMI_ASYNC_WORK_DONE'));
await api.rpc('session/wait',{request:{sessionId:run.sourceSessionId,timeoutMs:60000,limit:1}},65000);
const sourceRows=read(run.sourceSessionId),workerRows=read(task.targetSessionId),calls=sourceRows.filter(r=>r.type==='tool/call').map(r=>r.data.name);
const relays=sourceRows.filter(r=>r.type==='agent/inbox/spliced'&&r.data.target==='next-turn'&&r.data.inserted.some(m=>m.source?.senderSessionId===task.targetSessionId));assert.equal(relays.length,1);
assert(workerRows.some(r=>r.type==='tool/call'&&r.data.name==='pwsh'),'Worker never executed the delayed task');
assert.deepEqual((await api.json('/naumi/bots')).bots.map(b=>b.id),run.botIds);
for(const id of [run.sourceSessionId,task.targetSessionId])await api.rpc('workspace/archiveSession',{request:{sessionId:id,stopActivity:false}});
const result={tier:'actual configured model, natural-language dispatch, real 25-second worker tool and second user conversation',sourceSessionId:run.sourceSessionId,targetSessionId:task.targetSessionId,taskId:task.id,mode:task.replyMode,statusAtAcknowledgement:run.statusAtAcknowledgement,statusAtSecondReply:run.statusAtSecondReply,sourceToolCalls:calls,workerCompleted:true,resultQueuedAsNextTurn:true,testSessionsArchived:2,botsPreserved:true,finishedAt:new Date().toISOString()};
fs.writeFileSync(path.join(e,'LIVE_VERIFICATION.json'),JSON.stringify(result,null,2)+'\n');run.finished=true;save();
console.log('LIVE acknowledgement_before_worker=PASS second_topic_before_worker=PASS worker_continued=PASS result_next_turn=1 task_duplicates=0 test_sessions_archived=2');
