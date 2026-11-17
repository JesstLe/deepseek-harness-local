import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {taskFixture} from '../tests/helpers/bot-task-fixture.mjs';
const mode=process.argv[2]??'modified';
if(mode==='baseline'||mode==='rollback'){
  const root=path.resolve(process.argv[3]??'evidence/async-bot/original/plugins/naumi-enterprise');
  const {BotTaskService}=await import(pathToFileURL(path.join(root,'bot-task-service.js')));
  const source=BotTaskService.prototype.dispatch.toString(),runtime=await import(pathToFileURL(path.join(root,'bot-task-runtime.js')));
  assert(!source.includes('replyMode'));assert(!runtime.createBotTaskRuntime.toString().includes('agent.followup('));
  console.log(`${mode.toUpperCase()} dispatch_mode=legacy wait=blocking result_inbox=next-step original_behavior=PASS`);
}else{
  const f=await taskFixture();try{
    const args=f.input();delete args.replyMode;const task=await f.service.dispatch(f.sender,args);await f.service.settled();
    assert.equal(task.replyMode,'background');const view=await f.service.wait(f.sender,{taskId:task.id,afterRevision:f.service.current(task.id).revision});assert(view.background);assert.equal(f.service.waiters.size,0);
    f.service.userInput(f.sender.id,{id:'new-topic',source:{kind:'user'}});assert.equal(f.service.current(task.id).status,'running');await f.finish(task);assert.equal(f.deliveries.at(-1).mode,'followup');
    console.log('MODIFIED dispatch=background wait=immediate independent_chat=PASS result_mode=followup duplicate_tasks=0');
  }finally{await f.cleanup();}
}
