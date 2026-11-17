import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {taskFixture} from '../tests/helpers/bot-task-fixture.mjs';
const mode=process.argv[2]??'modified';
if(mode==='baseline'||mode==='rollback'){
  const root=path.resolve(process.argv[3]??'evidence/bot-task-continuity/original/plugins/naumi-enterprise');
  const {BotTaskService}=await import(pathToFileURL(path.join(root,'bot-task-service.js'))),model=await import(pathToFileURL(path.join(root,'assets/bot-task-model.js')));
  assert.equal(BotTaskService.prototype.continue,undefined);assert.equal(model.employeeTasks,undefined);
  console.log(`${mode.toUpperCase()} completed_continue=ABSENT employee_task_view=SESSION_ONLY original_behavior=PASS`);
}else{
  const f=await taskFixture();try{
    const t=await f.service.dispatch(f.sender,f.input({replyMode:'background'}));await f.service.settled();await f.finish(t);
    const args={taskId:t.id,expectedRevision:f.service.current(t.id).revision,idempotencyKey:'verify-revision',message:'修改原文标题'};
    const revision=await f.service.continue(f.sender,args);await f.service.continue(f.sender,args);await f.service.settled();
    assert.equal(revision.targetSessionId,t.targetSessionId);assert.equal(revision.id,t.id);assert.equal(revision.attempt,2);assert.equal(f.store.read().tasks.length,1);
    await f.finish(t,{text:'原文已修改'});assert.equal(f.service.current(t.id).result,'原文已修改');assert.equal(f.deliveries.at(-1).mode,'followup');
    console.log('MODIFIED same_task=1 same_session=1 attempt=2 duplicate_tasks=0 result=followup original_request=UNCHANGED');
  }finally{await f.cleanup();}
}
