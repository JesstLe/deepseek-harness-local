import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {zstdDecompressSync} from 'node:zlib';
import {botLiveApi} from './bot-live-api.mjs';
const root=path.resolve(process.argv[2]??'E:/Workspace/naumi-desktop'),e=path.resolve('evidence/bot-task-continuity'),checkpoint=path.join(e,'live-checkpoint.json'),api=await botLiveApi(root);
const response=await api.request('/naumi/bot-tasks?view=activity');assert.equal(response.headers.get('X-Naumi-Bot-Continuity'),'1','Continuity source has not been loaded');
let run=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):null;
const save=()=>fs.writeFileSync(checkpoint,JSON.stringify(run,null,2)+'\n');
if(run?.finished){console.log('LIVE_ALREADY_VERIFIED no_model_replay=1');process.exit(0);}
const read=id=>{
  const home=path.join(root,'.dsh/sessions'),file=fs.readdirSync(home).map(n=>path.join(home,n,id,'session.v4.jsonl.zstd')).find(fs.existsSync);assert(file);
  const bytes=fs.readFileSync(file),parts=[];let offset=0;while(offset<bytes.length){const frame=zstdDecompressSync(bytes.subarray(offset),{info:true});assert(frame.engine.bytesWritten);offset+=frame.engine.bytesWritten;parts.push(frame.buffer);}
  return Buffer.concat(parts).toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
};
const catalog=await api.json('/naumi/bots');
if(!run){
  const source=catalog.bots.find(b=>b.name.includes('主管'))??catalog.bots[0],target=catalog.bots.find(b=>b.id!==source.id&&b.name.includes('运营'))??catalog.bots.find(b=>b.id!==source.id);assert(source&&target);
  const session=await api.rpc('session/create',{request:{cwd:source.cwd,agentPreset:source.agentPreset}});
  run={startedAt:new Date().toISOString(),sourceBotId:source.id,targetBotId:target.id,targetName:target.name,sourceSessionId:session.sessionId,botIds:catalog.bots.map(b=>b.id),firstRequest:randomUUID(),secondRequest:randomUUID(),firstSent:false,secondSent:false};save();
  await api.rpc('session/rename',{request:{sessionId:session.sessionId,title:'同任务续办联调'}});
}
const source=(await api.json('/naumi/bots')).bots.find(b=>b.id===run.sourceBotId);assert(source);
if(!source.sessionIds.includes(run.sourceSessionId))await api.json('/naumi/bots',{action:'bind',botId:source.id,sessionId:run.sourceSessionId,expectedRevision:source.revision},'x-naumi-bots');
const prompt=(requestId,text)=>api.rpc('session/prompt',{request:{requestId,sessionId:run.sourceSessionId,mode:'queue',content:[{type:'text',text}],clientTimeZone:'Asia/Shanghai'}});
const idle=async()=>{const state=await api.rpc('session/wait',{request:{sessionId:run.sourceSessionId,timeoutMs:90000,limit:1}},95000);assert.equal(state.reason,'idle');};
const tasks=async()=>(await api.json('/naumi/bot-tasks')).tasks.filter(t=>t.sourceSessionId===run.sourceSessionId);
const awaitTask=async predicate=>{
  let rows=await tasks();if(predicate(rows))return rows;
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(Error('CONTINUITY_LIVE_TIMEOUT')),120000);
  try{const stream=await api.request('/naumi/bot-tasks/events',{signal:abort.signal});for await(const _ of stream.body){rows=await tasks();if(predicate(rows))return rows;}}
  finally{clearTimeout(timer);abort.abort();}
  throw Error('CONTINUITY_EVENT_STREAM_ENDED');
};
if(!run.firstSent){run.firstSent=true;save();await prompt(run.firstRequest,`这是同任务续办验收：请让已有的“${run.targetName}”Bot 在它自己的任务会话只回复 NAUMI_CONTINUITY_ORIGINAL。不要创建替代队友或新 Bot，不读写文件、不做外部操作。`);}
if(!run.firstCompleted){
  await idle();const rows=await awaitTask(rows=>rows.length>0&&rows.every(t=>['completed','failed','cancelled','interrupted'].includes(t.status)));
  assert.equal(rows.length,1);const t=rows[0];assert.equal(t.status,'completed',t.error);assert(t.result.includes('NAUMI_CONTINUITY_ORIGINAL'));
  run.taskId=t.id;run.targetSessionId=t.targetSessionId;run.firstAttempt=t.attempt;run.originalRequest=t.task;run.firstCompleted=true;save();await idle();
}
if(!run.secondSent){run.secondSent=true;save();await prompt(run.secondRequest,`把刚才交给“${run.targetName}”的同一项工作继续修改：这次只回复 NAUMI_CONTINUITY_REVISED。沿用原任务和原执行会话，不创建新任务，不重派，不读写文件，也不做外部操作。`);}
await idle();const rows=await awaitTask(rows=>rows.length>1||rows.some(t=>t.attempt>run.firstAttempt&&['completed','failed','cancelled','interrupted'].includes(t.status)));
assert.equal(rows.length,1,'Revision created a duplicate task');const t=rows[0];assert.equal(t.id,run.taskId);assert.equal(t.targetSessionId,run.targetSessionId);assert.equal(t.attempt,run.firstAttempt+1);assert.equal(t.task,run.originalRequest);assert.equal(t.status,'completed',t.error);assert(t.result.includes('NAUMI_CONTINUITY_REVISED'));await idle();
const events=read(run.sourceSessionId),calls=events.filter(r=>r.type==='tool/call').map(r=>r.data.name);assert.equal(calls.filter(n=>n==='bot_dispatch').length,1);assert(calls.includes('bot_task_continue'),'Natural-language revision did not use continue');
const worker=read(t.targetSessionId),turns=worker.filter(r=>r.type==='turn/end'&&r.data.reason.kind==='completed');assert.equal(turns.length,2);assert(t.messages.filter(m=>m.kind==='result'&&m.delivered).length===2);
assert.deepEqual((await api.json('/naumi/bots')).bots.map(b=>b.id),run.botIds);
for(const id of [run.sourceSessionId,run.targetSessionId])await api.rpc('workspace/archiveSession',{request:{sessionId:id,stopActivity:false}});
fs.writeFileSync(path.join(e,'LIVE_VERIFICATION.json'),JSON.stringify({tier:'actual configured models, natural-language original delegation and revision, real persisted Session turns',sourceSessionId:run.sourceSessionId,targetSessionId:t.targetSessionId,taskId:t.id,attempt:t.attempt,sourceToolCalls:calls,workerCompletedTurns:turns.length,duplicateTasks:0,originalRequestPreserved:true,botsPreserved:true,testSessionsArchived:2,finishedAt:new Date().toISOString()},null,2)+'\n');run.finished=true;save();
console.log('LIVE natural_revision=continue same_task=1 same_session=1 attempts=2 duplicate_tasks=0 original_request=UNCHANGED test_sessions_archived=2');
