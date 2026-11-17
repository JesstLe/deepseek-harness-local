import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {employeeHost} from './helpers/employee-host.mjs';
import {EmployeeWorkStore} from '../plugins/naumi-enterprise/employee-work-store.js';
import {EmployeeWorkService} from '../plugins/naumi-enterprise/employee-work.js';
const op=()=>randomUUID();
async function fixture(){
 const f=await employeeHost(),work=new EmployeeWorkStore(f.store),service=new EmployeeWorkService({ctx:f.services,directory:f.directory,store:f.store,tasks:()=>f.service.store.read().tasks});
 f.service.readWorkGoal=(botId,id)=>{const g=work.goal(botId,id);if(['planned','in_progress'].includes(g.status))work.validateGraph(botId,{...g,status:'in_progress'});return g;};
 const goal=work.createGoal(f.sourceBot.id,{operationId:op(),title:'交付活动方案',description:'依据真实来源形成方案',criteria:['来源可核验','步骤完整']});
 const args=(patch={})=>({targetBotId:f.targetBot.id,task:'写活动方案',idempotencyKey:op(),replyMode:'background',workGoalId:goal.id,workGoalRevision:goal.revision,...patch});
 const dispatch=async patch=>{const task=await f.service.dispatch(f.sender,args(patch));await f.service.settled();return f.service.current(task.id);};
 const create=(agent,task,patch={})=>service.agentCommand(agent,{action:'delivery_create',goalId:goal.id,sourceTaskId:task.id,title:'活动方案正文',fileName:'方案.md',content:'第一版内容',operationId:op(),...patch});
 return {...f,work,ws:service,goal,args,dispatch,create};
}
test('dispatch captures exact confirmed source goal without copying goals, credentials, private memory or target privileges',async()=>{
 const f=await fixture();try{
  f.store.createMemory(f.sourceBot.id,{operationId:op(),kind:'fact',text:'主管私有信息不共享'});
  const t=await f.dispatch();assert.equal(t.workGoal.goalId,f.goal.id);assert.equal(t.workGoal.botId,f.sourceBot.id);assert.deepEqual(t.workGoal.criteria,f.goal.criteria);assert.equal(f.work.goals(f.targetBot.id).length,0);
  const agent=f.agents.get(t.targetSessionId),v=f.ws.agentList(agent);assert.equal(v.assignedWork.length,1);assert.equal(v.assignedWork[0].goal.goalId,f.goal.id);assert.equal(f.ws.agentList(f.target).assignedWork.length,0);
  assert(!JSON.stringify(v).includes('主管私有信息'));assert.equal(t.profile.model.model,'target-model');assert.equal(t.profile.permissions.find(p=>p.type==='permission/preset').data.preset,'read-only');
 }finally{await f.cleanup();}
});
test('missing/foreign/proposal/stale/paused goals and unfinished dependencies fail before dispatch',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.service.dispatch(f.sender,f.args({workGoalRevision:undefined})),/REFERENCE_REQUIRED/);
  await assert.rejects(f.service.dispatch(f.sender,f.args({workGoalId:'goalproposal-not-a-goal'})),/GOAL_NOT_FOUND/);
  const other=f.work.createGoal(f.targetBot.id,{operationId:op(),title:'别人的目标',criteria:['隔离']});await assert.rejects(f.service.dispatch(f.sender,f.args({workGoalId:other.id})),/GOAL_NOT_FOUND/);
  await assert.rejects(f.service.dispatch(f.sender,f.args({workGoalRevision:2})),/GOAL_CHANGED/);
  f.work.updateGoal(f.sourceBot.id,{goalId:f.goal.id,expectedRevision:1,operationId:op(),patch:{status:'paused'}});await assert.rejects(f.service.dispatch(f.sender,f.args({workGoalRevision:2})),/NOT_ACTIVE/);assert.equal(f.service.store.read().tasks.length,0);
 }finally{await f.cleanup();}
});
test('goal changes during target-profile await fail at final admission and never publish a partial task',async()=>{
 const f=await fixture();try{
  const original=f.service.runtime.profile;f.service.runtime.profile=async bot=>{f.work.updateGoal(f.sourceBot.id,{goalId:f.goal.id,expectedRevision:1,operationId:op(),patch:{criteria:['变更标准']}});return original(bot);};
  await assert.rejects(f.service.dispatch(f.sender,f.args()),/GOAL_CHANGED/);assert.equal(f.service.store.read().tasks.length,0);
 }finally{await f.cleanup();}
});
test('same dispatch receipt remains original after goal changes; same key cannot silently switch a goal reference',async()=>{
 const f=await fixture();try{
  const args=f.args(),t=await f.service.dispatch(f.sender,args);await f.service.settled();f.work.updateGoal(f.sourceBot.id,{goalId:f.goal.id,expectedRevision:1,operationId:op(),patch:{criteria:['新条件']}});
  const retry=await f.service.dispatch(f.sender,args);assert.equal(retry.id,t.id);assert.equal(retry.workGoal.revision,1);await assert.rejects(f.service.dispatch(f.sender,{...args,workGoalRevision:2}),/IDEMPOTENCY_CONFLICT/);assert.equal(f.service.store.read().tasks.length,1);
 }finally{await f.cleanup();}
});
test('exact task executor creates source-owner goal draft and submits without self-review or arbitrary cross-Bot access',async()=>{
 const f=await fixture();try{
  const t=await f.dispatch(),agent=f.agents.get(t.targetSessionId),d=f.create(agent,t);assert.equal(d.botId,f.sourceBot.id);assert.equal(d.executorBotId,f.targetBot.id);assert.equal(d.sourceTaskId,t.id);assert.equal(f.work.deliveries(f.targetBot.id).length,0);
  assert(f.ws.agentList(agent).assignedWork[0].deliveries.some(x=>x.id===d.id));assert(f.ws.list(f.sourceBot.id).linkedTasks.some(x=>x.id===t.id));assert.equal(f.ws.list(f.sourceBot.id).deliveries[0].executionStatus,'running');
  assert.throws(()=>f.create(f.target,t),/EXECUTOR_REQUIRED/);assert.throws(()=>f.create(f.sender,t),/EXECUTOR_REQUIRED/);
  assert.throws(()=>f.create(agent,t,{sourceTaskId:undefined}),/REFERENCE_REQUIRED/);assert.throws(()=>f.create(agent,t,{goalId:'goal-unrelated'}),/GOAL_MISMATCH/);
  const submitted=f.ws.agentCommand(agent,{action:'delivery_transition',transition:'submit',deliveryId:d.id,expectedRevision:1,operationId:op()});assert.equal(submitted.businessStatus,'submitted');
  assert.throws(()=>f.ws.agentCommand(agent,{action:'delivery_transition',transition:'accept',deliveryId:d.id,expectedRevision:2,operationId:op()}),/REVIEWER_REQUIRED/);
 }finally{await f.cleanup();}
});
test('task completion is not business acceptance; owner return creates new version in same task and learns only candidate for executor',async()=>{
 const f=await fixture();try{
  let t=await f.dispatch();const agent=f.agents.get(t.targetSessionId);let d=f.create(agent,t);d=f.ws.agentCommand(agent,{action:'delivery_transition',transition:'submit',deliveryId:d.id,expectedRevision:d.revision,operationId:op()});
  await f.complete(t);t=f.service.current(t.id);assert.equal(t.status,'completed');assert.equal(f.work.delivery(f.sourceBot.id,d.id).businessStatus,'submitted');assert.equal(f.work.goal(f.sourceBot.id,f.goal.id).status,'planned');
  d=f.ws.command({action:'delivery_transition',botId:f.sourceBot.id,deliveryId:d.id,expectedRevision:d.revision,operationId:op(),transition:'request_changes',reason:'补充来源'});
  await f.service.continue(f.sender,{taskId:t.id,expectedRevision:t.revision,idempotencyKey:'revision-same-task',message:'按退回意见补充来源'});await f.service.settled();t=f.service.current(t.id);assert.equal(t.targetSessionId,agent.id);assert.equal(t.attempt,2);
  d=f.ws.agentCommand(agent,{action:'delivery_revise',deliveryId:d.id,expectedRevision:d.revision,fileName:'方案.md',content:'第二版附来源',operationId:op()});d=f.ws.agentCommand(agent,{action:'delivery_transition',transition:'submit',deliveryId:d.id,expectedRevision:d.revision,operationId:op()});
  d=f.ws.command({action:'delivery_transition',botId:f.sourceBot.id,deliveryId:d.id,expectedRevision:d.revision,operationId:op(),transition:'start_review'});d=f.ws.command({action:'delivery_transition',botId:f.sourceBot.id,deliveryId:d.id,expectedRevision:d.revision,operationId:op(),transition:'accept',checkedCriteria:[0,1],reason:'先核对来源再交付'});
  assert.equal(d.businessStatus,'accepted');const details=f.work.details(f.sourceBot.id,d.id);assert.equal(details.artifacts.length,2);assert.equal(f.work.artifact(f.sourceBot.id,details.artifacts[0].id).content,'第一版内容');
  const learned=f.store.memories(f.targetBot.id,{status:'candidate'});assert.equal(learned.length,1);assert.equal(f.store.memories(f.targetBot.id).length,0);assert.equal(f.store.memories(f.sourceBot.id,{status:'candidate'}).length,0);f.store.updateMemory(f.targetBot.id,{memoryId:learned[0].id,expectedRevision:learned[0].revision,operationId:op(),patch:{status:'active'}});const reused=await f.target.tools.get('employee_memory_search').execute({query:'核对来源'},{agent:f.target});assert.equal(reused.length,1);assert.equal(reused[0].id,learned[0].id);
 }finally{await f.cleanup();}
});
test('goal specification edit blocks new publication until original sender explicitly refreshes same task reference; history remains immutable',async()=>{
 const f=await fixture();try{
  let t=await f.dispatch();const agent=f.agents.get(t.targetSessionId);f.work.updateGoal(f.sourceBot.id,{goalId:f.goal.id,expectedRevision:1,operationId:op(),patch:{criteria:['新标准']}});assert.throws(()=>f.create(agent,t),/GOAL_CHANGED/);
  await assert.rejects(f.service.continue(f.sender,{taskId:t.id,expectedRevision:t.revision,idempotencyKey:op(),message:'继续'}),/GOAL_CHANGED/);
  const c={taskId:t.id,expectedRevision:t.revision,idempotencyKey:'explicit-refresh',message:'按已确认的新标准继续',workGoalRevision:2};await f.service.continue(f.sender,c);await f.service.continue(f.sender,c);await f.service.settled();t=f.service.current(t.id);
  assert.equal(t.workGoal.revision,1);assert.deepEqual(t.workGoal.criteria,f.goal.criteria);assert.equal(t.workGoalUpdates.length,1);assert.deepEqual(t.workGoalUpdates[0].criteria,['新标准']);assert.equal(f.create(agent,t).sourceGoalRevision,2);
 }finally{await f.cleanup();}
});
test('status-only progress update does not invent stale-specification failure, but pause blocks publication and future task continuation',async()=>{
 const f=await fixture();try{
  const t=await f.dispatch(),agent=f.agents.get(t.targetSessionId);f.work.updateGoal(f.sourceBot.id,{goalId:f.goal.id,expectedRevision:1,operationId:op(),patch:{status:'in_progress'}});assert.equal(f.create(agent,t).businessStatus,'draft');
  f.work.updateGoal(f.sourceBot.id,{goalId:f.goal.id,expectedRevision:2,operationId:op(),patch:{status:'paused'}});assert.throws(()=>f.create(agent,t),/NOT_ACTIVE/);
  await assert.rejects(f.service.continue(f.sender,{taskId:t.id,expectedRevision:t.revision,idempotencyKey:op(),message:'继续'}),/NOT_ACTIVE/);
 }finally{await f.cleanup();}
});
test('delivery transaction failure preserves original task and leaves no draft/artifact/receipt or duplicate goal',async()=>{
 const f=await fixture();try{
  const t=await f.dispatch(),agent=f.agents.get(t.targetSessionId),before=f.service.store.read();f.store.beforeCommit=()=>{throw Error('injected');};assert.throws(()=>f.create(agent,t),/injected/);f.store.beforeCommit=null;
  assert.equal(f.work.deliveries(f.sourceBot.id).length,0);assert.equal(f.store.entitiesOfType(f.sourceBot.id,'artifact').length,0);assert.deepEqual(f.service.store.read(),before);assert.equal(f.work.goals(f.sourceBot.id).length,1);
 }finally{await f.cleanup();}
});
test('startup work-store readiness parks linked queue until the shared store is ready without a failed task or duplicate dispatch',async()=>{
 const f=await fixture();try{
  f.service.workGoalsReady=()=>false;const accepted=await f.service.dispatch(f.sender,f.args());await f.service.settled();assert.equal(f.service.current(accepted.id).status,'queued');assert(!f.agents.has(accepted.targetSessionId));
  f.service.workGoalsReady=()=>true;f.service.kick();await f.service.settled();assert.equal(f.service.current(accepted.id).status,'running');assert(f.agents.has(accepted.targetSessionId));assert.equal(f.service.store.read().tasks.length,1);
 }finally{await f.cleanup();}
});
test('another delegated Session of the same target Bot cannot revise or submit a sibling task delivery',async()=>{
 const f=await fixture();try{
  const first=await f.dispatch(),agent=f.agents.get(first.targetSessionId),d=f.create(agent,first);await f.complete(first);
  const second=await f.dispatch(),other=f.agents.get(second.targetSessionId);assert.notEqual(other.id,agent.id);
  assert.throws(()=>f.ws.agentCommand(other,{action:'delivery_revise',deliveryId:d.id,expectedRevision:1,fileName:'方案.md',content:'错误覆盖',operationId:op()}),/EXECUTOR_REQUIRED/);
  assert.throws(()=>f.ws.agentCommand(other,{action:'delivery_transition',transition:'submit',deliveryId:d.id,expectedRevision:1,operationId:op()}),/EXECUTOR_REQUIRED/);assert.equal(f.work.details(f.sourceBot.id,d.id).currentContent,'第一版内容');
 }finally{await f.cleanup();}
});
