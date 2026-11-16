import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {zstdDecompressSync} from 'node:zlib';
import {botLiveApi} from './bot-live-api.mjs';

const api=await botLiveApi(),e='evidence/bot-communication/',checkpoint=e+'routing-attempt.json';
let attempt=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):null;
const save=()=>fs.writeFileSync(checkpoint,JSON.stringify(attempt,null,2)+'\n');
if(!attempt){
  const directory=await api.json('/naumi/bots'),source=directory.bots.find(b=>b.name==='项目主管'),target=directory.bots.find(b=>b.name==='自媒体内容运营');assert(source&&target);
  const created=await api.rpc('session/create',{request:{cwd:source.cwd,agentPreset:source.agentPreset}});
  attempt={sourceSessionId:created.sessionId,sourceBotId:source.id,targetBotId:target.id,requestId:randomUUID(),marker:'NAUMI_AGENT_ROUTING_OK_20261116',botIds:directory.bots.map(b=>b.id),startedAt:new Date().toISOString()};save();
  await api.rpc('session/rename',{request:{sessionId:created.sessionId,title:'Bot 派单工具联调'}});
}
const directory=await api.json('/naumi/bots'),source=directory.bots.find(b=>b.id===attempt.sourceBotId);
if(!source.sessionIds.includes(attempt.sourceSessionId))await api.json('/naumi/bots',{action:'bind',botId:source.id,sessionId:attempt.sourceSessionId,expectedRevision:source.revision},'x-naumi-bots');
await api.rpc('session/prompt',{request:{requestId:attempt.requestId,sessionId:attempt.sourceSessionId,mode:'queue',content:[{type:'text',text:`请直接让已经存在的“自媒体内容运营”Bot 只回复：${attempt.marker}。这是跨 Bot 通信联调，不新建 Bot、不创建替代队友、不读写文件、不调用浏览器。收到对方结果后原样转达，不执行其他业务。`}],clientTimeZone:'Asia/Shanghai'}});
const abort=new AbortController(),timer=setTimeout(()=>abort.abort(Error('ROUTING_TIMEOUT')),180000);let task;
try{
  const events=await api.request('/naumi/bot-tasks/events',{signal:abort.signal});assert.equal(events.status,200);
  for await(const chunk of events.body){
    if(!String(chunk).length)continue;
    const tasks=(await api.json('/naumi/bot-tasks')).tasks.filter(t=>t.sourceSessionId===attempt.sourceSessionId);
    assert(tasks.length<=1,'model duplicated the task');task=tasks[0];if(!task)continue;
    attempt.taskId=task.id;attempt.targetSessionId=task.targetSessionId;save();
    assert.equal(task.targetBotId,attempt.targetBotId);
    if(['failed','cancelled','interrupted'].includes(task.status))throw Error(task.error??task.status);
    if(task.status==='completed'&&task.messages.some(m=>m.kind==='result'&&m.delivered))break;
  }
}finally{clearTimeout(timer);abort.abort();}
assert.equal(task.status,'completed');assert(task.result.includes(attempt.marker));
const parent=await api.rpc('session/wait',{request:{sessionId:attempt.sourceSessionId,timeoutMs:120000,limit:5}},125000);assert.equal(parent.reason,'idle');
function read(id){
  const root='E:/Workspace/deepseek-harness-local/.dsh/sessions';let file;
  for(const project of fs.readdirSync(root)){const p=path.join(root,project,id,'session.v4.jsonl.zstd');if(fs.existsSync(p)){file=p;break;}}assert(file);
  const buffer=fs.readFileSync(file),parts=[];let offset=0;
  while(offset<buffer.length){const frame=zstdDecompressSync(buffer.subarray(offset),{info:true});offset+=frame.engine.bytesWritten;parts.push(frame.buffer);}
  return Buffer.concat(parts).toString().trim().split('\n').map(JSON.parse);
}
const rows=read(attempt.sourceSessionId),calls=rows.filter(r=>r.type==='tool/call').map(r=>r.data.name);
assert(calls.includes('bot_dispatch'));assert(!calls.includes('spawn_teammate'));
const final=(rows.findLast(r=>r.type==='assistant/message')?.data.message.content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');assert(final.includes(attempt.marker));
const after=await api.json('/naumi/bots');assert.deepEqual(after.bots.map(b=>b.id),attempt.botIds);
const result={tier:'live natural-language supervisor request, real configured model and actual tool execution',...attempt,calls,status:task.status,targetReused:true,sourceFinalContainsMarker:true,completedAt:new Date().toISOString()};
fs.writeFileSync(e+'LIVE_ROUTING.json',JSON.stringify(result,null,2)+'\n');
for(const id of [attempt.sourceSessionId,attempt.targetSessionId])await api.rpc('workspace/archiveSession',{request:{sessionId:id,stopActivity:false}});
console.log('LIVE_ROUTING supervisor_bot_dispatch=PASS existing_target=PASS replacement_teammates=0 final_return=PASS test_threads_archived=2');
