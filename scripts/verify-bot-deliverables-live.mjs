import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {zstdDecompressSync} from 'node:zlib';
import {botLiveApi} from './bot-live-api.mjs';

const runtime=path.resolve(process.argv[2]??'E:/Workspace/naumi-desktop'),e=path.resolve('evidence/bot-deliverables');
const api=await botLiveApi(runtime),checkpoint=path.join(e,'live-checkpoint.json');
let run=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):null;
const save=()=>fs.writeFileSync(checkpoint,JSON.stringify(run,null,2)+'\n');
const read=id=>{
  const root=path.join(runtime,'.dsh/sessions');let file;
  for(const project of fs.readdirSync(root)){const p=path.join(root,project,id,'session.v4.jsonl.zstd');if(fs.existsSync(p)){file=p;break;}}
  assert(file);const bytes=fs.readFileSync(file),parts=[];let offset=0;
  while(offset<bytes.length){const frame=zstdDecompressSync(bytes.subarray(offset),{info:true});assert(frame.engine.bytesWritten>0);offset+=frame.engine.bytesWritten;parts.push(frame.buffer);}
  return Buffer.concat(parts).toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
};
const catalog=await api.json('/naumi/bots');
if(!run){
  const bots=catalog.bots.filter(b=>b.status==='active');assert(bots.length>=2);
  const target=bots.find(b=>b.name.includes('自媒体'))??bots[1],source=bots.find(b=>b.id!==target.id);
  const sourceSession=await api.rpc('session/create',{request:{cwd:source.cwd,agentPreset:source.agentPreset}});
  run={startedAt:new Date().toISOString(),sourceBotId:source.id,targetBotId:target.id,sourceSessionId:sourceSession.sessionId,idempotencyKey:'file-preview-'+randomUUID(),botIds:catalog.bots.map(b=>b.id),file:path.join(target.cwd,'naumi-file-preview-'+randomUUID()+'.md'),dispatchSent:false};save();
  await api.rpc('session/rename',{request:{sessionId:run.sourceSessionId,title:'文件交付联调'}});
}
const source=(await api.json('/naumi/bots')).bots.find(b=>b.id===run.sourceBotId);assert(source);
if(!source.sessionIds.includes(run.sourceSessionId))await api.json('/naumi/bots',{action:'bind',botId:source.id,sessionId:run.sourceSessionId,expectedRevision:source.revision},'x-naumi-bots');
const all=await api.json('/naumi/bot-tasks');let task=all.tasks.find(t=>t.sourceSessionId===run.sourceSessionId&&t.key===run.idempotencyKey);
if(!task){
  assert(!run.dispatchSent,'Prior dispatch outcome unknown; do not replay');run.dispatchSent=true;save();
  task=await api.json('/naumi/bot-tasks',{action:'dispatch',sourceSessionId:run.sourceSessionId,targetBotId:run.targetBotId,output:'files',idempotencyKey:run.idempotencyKey,
    task:`文件交付联调，只执行本次本地检查。请用 write 工具创建这个唯一的新文件：${run.file}，内容为 Markdown 标题“Naumi 文件预览验证”和一行“文件交付成功”。最终答复只需声明交付文件，并用反引号写出该完整文件路径。此次特意不调用 present，也不调用 bot_task_reply，以验证系统自动登记的兜底。不要读取、修改其他文件，不调用浏览器、外部账号或创建新 Bot。`},'x-naumi-bot-tasks');
  run.taskId=task.id;run.targetSessionId=task.targetSessionId;save();
}
if(!['completed','failed','cancelled','interrupted'].includes(task.status)){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(Error('DELIVERY_TIMEOUT')),180000);
  try{const events=await api.request('/naumi/bot-tasks/events',{signal:abort.signal});assert.equal(events.status,200);
    for await(const _ of events.body){task=(await api.json('/naumi/bot-tasks?taskId='+task.id));if(['completed','failed','cancelled','interrupted'].includes(task.status)&&task.messages.some(m=>m.delivered))break;}
  }finally{clearTimeout(timer);abort.abort();}
}
assert.equal(task.status,'completed',task.error);assert.equal(task.delivery.status,'ready');assert.equal(task.delivery.files.length,1);
assert.equal(path.resolve(task.delivery.files[0].path),path.resolve(run.file));
await api.rpc('session/wait',{request:{sessionId:run.sourceSessionId,timeoutMs:120000,limit:1}},125000);
const worker=read(task.targetSessionId),supervisor=read(run.sourceSessionId);
assert.equal(worker.filter(r=>r.type==='deliverables/presented').length,1);
assert(!worker.some(r=>r.type==='tool/call'&&r.data.name==='present'),'Expected automatic registration, not model present');
assert.equal(supervisor.filter(r=>r.type==='deliverables/presented'&&r.data.callId.startsWith('naumi-relay:')).length,1);
assert(fs.readFileSync(run.file,'utf8').includes('Naumi'));
assert.deepEqual((await api.json('/naumi/bots')).bots.map(b=>b.id),run.botIds);
for(const id of [run.sourceSessionId,task.targetSessionId])await api.rpc('workspace/archiveSession',{request:{sessionId:id,stopActivity:false}});
fs.unlinkSync(run.file);
const result={tier:'actual local Harness, configured model, real write, durable Session events and task/outbox',taskId:task.id,sourceSessionId:run.sourceSessionId,targetSessionId:task.targetSessionId,workerCard:1,supervisorRelayCard:1,modelPresentCalls:0,sourceReferences:task.delivery.files.map(({sessionId,seq,index,turn})=>({sessionId,seq,index,turn})),taskStatus:task.status,deliveryStatus:task.delivery.status,temporaryFileRemoved:true,testThreadsArchived:2,botsPreserved:true,finishedAt:new Date().toISOString()};
fs.writeFileSync(path.join(e,'LIVE_VERIFICATION.json'),JSON.stringify(result,null,2)+'\n');
run.finished=true;save();
console.log('LIVE worker_card=1 supervisor_card=1 model_present_calls=0 file_refs=VERIFIED task=completed test_threads_archived=2 temporary_file=REMOVED');
