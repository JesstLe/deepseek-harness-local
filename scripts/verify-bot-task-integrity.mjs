import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {taskFixture} from '../tests/helpers/bot-task-fixture.mjs';
import {runBotTool} from '../tests/helpers/bot-tool-pipeline.mjs';
const mode=process.argv[2]??'modified',root=path.resolve(process.argv[3]??'.');
const {BotTaskService}=await import(pathToFileURL(path.join(root,'plugins/naumi-enterprise/bot-task-service.js')));
const {createBotTaskTools}=await import(pathToFileURL(path.join(root,'plugins/naumi-enterprise/bot-tasks.js')));
const f=await taskFixture({concurrency:0});
let service;
try{
  service=new BotTaskService({ctx:f.ctx,directory:f.directory,store:f.store,runtime:f.runtime,concurrency:0});
  const t=await service.dispatch(f.sender,f.input());await service.settled();
  const other={id:'same-bot-other-session',role:'lead'};f.agents.set(other.id,other);
  await f.directory.bind(f.sourceBot.id,other.id,f.directory.forSession(f.sender.id).revision,f.dir);
  const list=await runBotTool(createBotTaskTools(service),f.sender,'bot_task_list',{});
  let write='ALLOWED';try{await service.continue(other,{taskId:t.id,expectedRevision:service.current(t.id).revision,idempotencyKey:'test-other-session',message:'fixture-only amendment'});}catch(e){assert.equal(e.message,'BOT_TASK_SESSION_REQUIRED');write='BLOCKED';}
  const before=mode==='baseline'||mode==='rollback';assert.equal(list.isError,before);assert.equal(write,before?'ALLOWED':'BLOCKED');
  if(before)assert.match(list.error.message,/value is not lossless JSON/);else assert.deepEqual(list.value,JSON.parse(JSON.stringify(list.value)));
  console.log(`${mode.toUpperCase()} list=${list.isError?'INVALID_JSON':'LOSSLESS_JSON'} cross_session_write=${write} bot_wide_read=PRESERVED`);
}finally{await service?.close();await f.cleanup();}
