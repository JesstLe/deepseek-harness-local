import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {zstdDecompressSync} from 'node:zlib';
import {botLiveApi} from './bot-live-api.mjs';

const api=await botLiveApi(),e='evidence/employee-foundation/',checkpoint=e+'live-attempt.json';
let attempt=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):null;
const save=()=>fs.writeFileSync(checkpoint,JSON.stringify(attempt,null,2)+'\n');
const get=(id,view,extra='')=>api.json('/naumi/employees?botId='+id+'&view='+view+extra);
const command=input=>api.json('/naumi/employees',input,'x-naumi-employees');
if(!attempt){
  const catalog=await api.json('/naumi/bots'),bot=catalog.bots.find(b=>b.name==='项目主管'&&b.status==='active');assert(bot);
  const profile=await get(bot.id,'profile');assert(profile.autoLearning,'learning disabled by owner; do not override');
  attempt={botId:bot.id,botIds:catalog.bots.map(b=>b.id),marker:'EMPLOYEE_CONTINUITY_PROBE_20261116',profileBefore:profile,startedAt:new Date().toISOString()};save();
}
async function session(field,title){
  if(!attempt[field]){
    const bot=(await api.json('/naumi/bots')).bots.find(b=>b.id===attempt.botId);
    const created=await api.rpc('session/create',{request:{cwd:bot.cwd,agentPreset:bot.agentPreset}});attempt[field]=created.sessionId;save();
    await api.rpc('session/rename',{request:{sessionId:created.sessionId,title}});
  }
  const bot=(await api.json('/naumi/bots')).bots.find(b=>b.id===attempt.botId);
  if(!bot.sessionIds.includes(attempt[field]))await api.json('/naumi/bots',{action:'bind',botId:bot.id,sessionId:attempt[field],expectedRevision:bot.revision},'x-naumi-bots');
  return attempt[field];
}
async function prompt(sessionId,text,key){
  attempt[key]??=randomUUID();save();
  await api.rpc('session/prompt',{request:{sessionId,requestId:attempt[key],mode:'queue',content:[{type:'text',text}],clientTimeZone:'Asia/Shanghai'}});
  const result=await api.rpc('session/wait',{request:{sessionId,timeoutMs:120000,limit:4}},125000);assert.equal(result.reason,'idle');return result;
}
const sourceId=await session('sourceSessionId','员工连续性联调 · 写入');
await prompt(sourceId,'记住我的偏好：'+attempt.marker,'writeRequestId');
const memories=await get(attempt.botId,'memories','&query='+attempt.marker);assert(memories.length>=1,'explicit user instruction was not saved');
const automatic=memories.find(m=>m.source.kind==='user'&&m.source.sessionId===sourceId);assert(automatic,'missing real user source');
const targetId=await session('readSessionId','员工连续性联调 · 新会话读取');
await prompt(targetId,`调用 employee_memory_search 搜索 ${attempt.marker}，只返回记忆里的验证标记，不新增或修改任何记忆。这是联调验证，不执行其他业务。`,'readRequestId');
function read(id){
  const root='E:/Workspace/deepseek-harness-local/.dsh/sessions';let file;
  for(const project of fs.readdirSync(root)){const p=path.join(root,project,id,'session.v4.jsonl.zstd');if(fs.existsSync(p)){file=p;break;}}assert(file);
  const b=fs.readFileSync(file),parts=[];let offset=0;
  while(offset<b.length){const r=zstdDecompressSync(b.subarray(offset),{info:true});offset+=r.engine.bytesWritten;parts.push(r.buffer);}
  return Buffer.concat(parts).toString().trim().split('\n').map(JSON.parse);
}
const rows=read(targetId),calls=rows.filter(e=>e.type==='tool/call').map(e=>e.data.name);
assert(calls.includes('employee_memory_search'));
const final=(rows.findLast(e=>e.type==='assistant/message')?.data.message.content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');assert(final.includes(attempt.marker));
const after=await get(attempt.botId,'profile');assert.deepEqual(after,attempt.profileBefore,'memory test must not change persona/settings');
const heartbeat=await get(attempt.botId,'heartbeat');assert.equal(heartbeat.modelCalls,0);assert.equal(heartbeat.actionsStarted,0);assert.equal(heartbeat.runtimeState,'healthy');
assert.deepEqual((await api.json('/naumi/bots')).bots.map(b=>b.id),attempt.botIds);
const proof={tier:'live configured Harness model with real user-message learning and new-Session retrieval',...attempt,memoryId:automatic.id,
  userSourceVerified:true,crossSessionRetrieval:true,tools:calls,profileUnchanged:true,heartbeat:{runtimeState:heartbeat.runtimeState,modelCalls:heartbeat.modelCalls,actionsStarted:heartbeat.actionsStarted},completedAt:new Date().toISOString()};
fs.writeFileSync(e+'LIVE_VERIFICATION.json',JSON.stringify(proof,null,2)+'\n');
// Only the fixed-marker test records are deleted. Keep raw Session/audit evidence as documented.
for(const memory of await get(attempt.botId,'memories','&status=all&query='+attempt.marker))if(memory.status!=='deleted')await command({action:'memory_update',botId:attempt.botId,memoryId:memory.id,expectedRevision:memory.revision,operationId:'cleanup-'+memory.id,patch:{status:'deleted'}});
for(const id of [sourceId,targetId])await api.rpc('workspace/archiveSession',{request:{sessionId:id,stopActivity:false}});
console.log('LIVE_EMPLOYEE explicit_learning=PASS new_session_retrieval=PASS persona_unchanged=1 heartbeat_llm_calls=0 test_memories=deleted test_sessions=archived');
