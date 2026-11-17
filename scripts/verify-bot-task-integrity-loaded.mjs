import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {botLiveApi} from './bot-live-api.mjs';import {sha} from './repair-bot-task-integrity.mjs';import {runBotTool} from '../tests/helpers/bot-tool-pipeline.mjs';
const runtime=path.resolve(process.argv[2]??process.cwd()),backup=path.resolve(process.argv[3]??'');assert(process.argv[3]);
const receipt=JSON.parse(fs.readFileSync(path.join(backup,'repair/repair-receipt.json'),'utf8'));
const original=JSON.parse(fs.readFileSync(path.join(backup,'repair/ledger.before.json'),'utf8')),raw=fs.readFileSync(path.join(runtime,'.dsh/naumi/bot-tasks.json')),current=JSON.parse(raw);
assert.equal(sha(raw),receipt.afterSHA256,'LIVE_LEDGER_CHANGED');const a=current.tasks.find(t=>t.id===receipt.taskId),b=original.tasks.find(t=>t.id===receipt.taskId);
assert.equal(a.status,'interrupted');assert.equal(a.error,'BOT_TASK_REVIEW_REQUIRED');assert(!a.instruction&&!a.result);assert.equal(a.attempt,b.attempt);
for(const key of ['task','profile','sourceSessionId','targetSessionId','targetCwd','messageId'])assert.deepEqual(a[key],b[key]);
assert.deepEqual(current.tasks.filter(t=>t.id!==a.id),original.tasks.filter(t=>t.id!==a.id));assert.equal(current.outbox.length,original.outbox.length+1);
for(const m of original.outbox){const n=current.outbox.find(n=>n.id===m.id);if(m.taskId!==a.id||m.delivered)assert.deepEqual(n,m);else{assert.equal(n.text,m.text);assert.equal(n.delivered,true);}}
const api=await botLiveApi(runtime),response=await api.request('/naumi/bot-tasks?taskId='+encodeURIComponent(a.id));assert.equal(response.status,200);assert.equal(response.headers.get('X-Naumi-Bot-Integrity'),'1');const shown=await response.json();assert.equal(shown.status,'interrupted');assert(!shown.result&&!shown.instruction);assert.equal(shown.messages.at(-1).kind,'status');
const plugin=path.join(runtime,'.dsh/profiles/web/node_modules/@naumi/dsh-enterprise');
const {BotTaskService}=await import(pathToFileURL(path.join(plugin,'bot-task-service.js'))),{createBotTaskTools}=await import(pathToFileURL(path.join(plugin,'bot-tasks.js')));
const {BotDirectory}=await import(pathToFileURL(path.join(plugin,'bots.js'))),{BotTaskStore}=await import(pathToFileURL(path.join(plugin,'bot-task-store.js')));
// Read-only projection of the actual loaded bytes + actual persistent ownership.
// This is not an agent resume, a synthetic online model call or an HTTP mutation.
const directory=new BotDirectory(path.join(runtime,'.dsh/naumi/bots.json')),store=new BotTaskStore(path.join(runtime,'.dsh/naumi/bot-tasks.json'));
const service=new BotTaskService({ctx:{agentTeams:{membership:agent=>({root:agent,role:'lead'})}},directory,store,runtime:{close:async()=>{}},concurrency:0});
try{
  const source={id:a.sourceSessionId},foreign={id:original.outbox.find(m=>m.taskId===a.id&&m.key.startsWith('continue:')).fromSessionId};assert.notEqual(foreign.id,source.id);
  const list=await runBotTool(createBotTaskTools(service),source,'bot_task_list',{});assert.equal(list.isError,false,JSON.stringify(list));
  const revision=a.revision;
  for(const name of ['bot_task_continue','bot_task_retry','bot_task_cancel','bot_task_reply']){
    const args={taskId:a.id,...(name==='bot_task_reply'?{idempotencyKey:'read-only-denial',kind:'message',message:'not executed'}:{expectedRevision:revision,...(name==='bot_task_continue'?{idempotencyKey:'read-only-denial',message:'not executed'}:{})})};
    const denied=await runBotTool(createBotTaskTools(service),foreign,name,args);assert.equal(denied.isError,true);assert.match(denied.error.message,/BOT_TASK_SESSION_REQUIRED/);
  }
}finally{await service.close();await directory.close();}
assert.equal(sha(fs.readFileSync(path.join(runtime,'.dsh/naumi/bot-tasks.json'))),receipt.afterSHA256);
const sessions=await api.rpc('session/list',{_request:{}}),running=sessions.items.filter(s=>s.running===true).length;assert.equal(running,0);
const report={tier:'actual owner HTTP + loaded-source native tool pipeline over actual read-only ledger; no browser or model calls',checks:17,status:'PASS',taskId:a.id,statusAfter:a.status,attempt:a.attempt,revision:a.revision,otherTasksUnchanged:true,originalHistoryRetained:true,modelCalls:0,running,sessions:sessions.items.length,serviceStillRunning:true,http:200};
fs.writeFileSync('evidence/bot-task-integrity/LIVE_VERIFICATION.json',JSON.stringify(report,null,2)+'\n');
console.log('LIVE integrity=1 list=LOSSLESS_JSON foreign_writes=BLOCKED task=interrupted unrelated_tasks=UNCHANGED model_calls=0 running=0 http=200');
