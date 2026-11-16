import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {EmployeeWorkStore} from '../plugins/naumi-enterprise/employee-work-store.js';
import {EmployeeWorkService} from '../plugins/naumi-enterprise/employee-work.js';
import {employeeHost} from './helpers/employee-host.mjs';
import {createEmployeeClient,profileDifference} from '../plugins/naumi-enterprise/assets/employee-center-model.js';
import {createEmployeeCenter} from '../plugins/naumi-enterprise/assets/employee-center.js';

const goal=(w,b,extra={})=>w.createGoal(b,{operationId:randomUUID(),title:'文章目标',criteria:['事实可核验','格式符合要求'],...extra});
const draft=(w,b,g,actor={kind:'owner'})=>w.createDelivery(b,{operationId:randomUUID(),goalId:g.id,title:'文章正文',fileName:'文章.md',content:'# 初版\n正文'},actor);
const transition=(w,b,d,action,extra={},actor={kind:'owner'})=>w.transition(b,{operationId:randomUUID(),deliveryId:d.id,expectedRevision:d.revision,action,...extra},actor);
test('local goal and delivery lifecycle separates execution from immutable business acceptance',async()=>{
  const f=await employeeHost();try{
    const w=new EmployeeWorkStore(f.store),b=f.sourceBot.id,g=goal(w,b);let d=draft(w,b,g);
    assert.equal(d.businessStatus,'draft');assert.throws(()=>w.updateGoal(b,{operationId:'premature',goalId:g.id,expectedRevision:1,patch:{status:'completed'}}),/ACCEPTED_DELIVERY_REQUIRED/);
    d=transition(w,b,d,'submit');assert.equal(d.businessStatus,'submitted');assert.throws(()=>transition(w,b,d,'accept',{checkedCriteria:[0,1]}),/INVALID_TRANSITION/);
    d=transition(w,b,d,'start_review');assert.throws(()=>transition(w,b,d,'accept',{checkedCriteria:[0]}),/CRITERIA_UNCHECKED/);
    d=transition(w,b,d,'accept',{checkedCriteria:[0,1],reason:'依据完整，格式清晰'});assert.equal(d.businessStatus,'accepted');
    assert.throws(()=>w.reviseDelivery(b,{deliveryId:d.id,expectedRevision:d.revision,operationId:'immutable',fileName:'覆盖.md',content:'覆盖'}),/IMMUTABLE/);
    assert.equal(w.details(b,d.id).reviews.length,3);assert.equal(f.store.memories(b,{status:'candidate'}).length,1);assert.equal(f.store.memories(b).length,0);
    assert.equal(w.updateGoal(b,{goalId:g.id,expectedRevision:1,operationId:'complete',patch:{status:'completed'}}).status,'completed');
  }finally{await f.cleanup();}
});
test('returned work requires a reason, new version, resubmission and current revision',async()=>{
  const f=await employeeHost();try{
    const w=new EmployeeWorkStore(f.store),b=f.sourceBot.id,g=goal(w,b);let d=draft(w,b,g);const original=w.artifact(b,d.currentArtifactId);
    d=transition(w,b,d,'submit');assert.throws(()=>transition(w,b,d,'request_changes'),/REASON_REQUIRED/);d=transition(w,b,d,'request_changes',{reason:'补充依据'});
    assert.throws(()=>transition(w,b,d,'submit'),/INVALID_TRANSITION/);
    d=w.reviseDelivery(b,{deliveryId:d.id,expectedRevision:d.revision,operationId:'revise',fileName:'文章.md',content:'# 第二版\n补充依据'});assert.equal(d.version,2);assert.equal(d.businessStatus,'draft');assert.equal(w.artifact(b,original.id).content,'# 初版\n正文');assert.notEqual(w.artifact(b,d.currentArtifactId).sha256,original.sha256);
    assert.throws(()=>transition(w,b,{...d,revision:1},'submit'),/WORK_CONFLICT/);d=transition(w,b,d,'submit');assert.equal(d.artifactIds.length,2);
  }finally{await f.cleanup();}
});
test('goal dependencies and hierarchy reject cycles, foreign references and premature progress',async()=>{
  const f=await employeeHost();try{
    const w=new EmployeeWorkStore(f.store),b=f.sourceBot.id,a=goal(w,b),c=goal(w,b,{title:'第二项',dependencies:[a.id]});
    assert.throws(()=>w.updateGoal(b,{goalId:c.id,expectedRevision:1,operationId:'blocked',patch:{status:'in_progress'}}),/DEPENDENCY_UNFINISHED/);
    assert.throws(()=>w.updateGoal(b,{goalId:a.id,expectedRevision:1,operationId:'cycle',patch:{dependencies:[c.id]}}),/CYCLE/);
    const child=goal(w,b,{title:'里程碑',parentId:a.id,kind:'milestone'});
    assert.throws(()=>w.updateGoal(b,{goalId:a.id,expectedRevision:1,operationId:'parent-cycle',patch:{parentId:child.id}}),/CYCLE/);
    const foreign=goal(w,f.targetBot.id);assert.throws(()=>goal(w,b,{dependencies:[foreign.id]}),/GOAL_NOT_FOUND/);
  }finally{await f.cleanup();}
});
test('same operation is idempotent and injected failure rolls back draft, artifact, audit and receipt',async()=>{
  const f=await employeeHost();try{
    const w=new EmployeeWorkStore(f.store),b=f.sourceBot.id,input={operationId:'same-goal',title:'目标',criteria:['依据完整']},g=w.createGoal(b,input);assert.deepEqual(w.createGoal(b,input),g);
    assert.throws(()=>w.createGoal(b,{...input,title:'别的'}),/IDEMPOTENCY_CONFLICT/);
    const count=f.store.stats().events;f.store.beforeCommit=()=>{throw Error('injected');};assert.throws(()=>draft(w,b,g),/injected/);assert.equal(w.deliveries(b).length,0);assert.equal(f.store.entitiesOfType(b,'artifact').length,0);assert.equal(f.store.stats().events,count);
  }finally{await f.cleanup();}
});
test('accepted delivery under old criteria cannot silently complete a changed goal',async()=>{
  const f=await employeeHost();try{
    const w=new EmployeeWorkStore(f.store),b=f.sourceBot.id,g=goal(w,b);let d=draft(w,b,g);d=transition(w,b,d,'submit');d=transition(w,b,d,'start_review');d=transition(w,b,d,'accept',{checkedCriteria:[0,1]});
    const changed=w.updateGoal(b,{goalId:g.id,expectedRevision:1,operationId:'change-criteria',patch:{criteria:['新增业务条件']}});
    assert.throws(()=>w.updateGoal(b,{goalId:g.id,expectedRevision:changed.revision,operationId:'finish-old',patch:{status:'completed'}}),/ACCEPTED_DELIVERY_REQUIRED/);
    assert.deepEqual(w.details(b,d.id).acceptanceCriteria,['事实可核验','格式符合要求']);
  }finally{await f.cleanup();}
});
test('review learning respects disabled learning; memory and timeline pagination are deterministic',async()=>{
  const f=await employeeHost();try{
    const w=new EmployeeWorkStore(f.store),b=f.sourceBot.id,g=goal(w,b);f.store.updateProfile(b,{operationId:'disable',expectedRevision:0,patch:{autoLearning:false}});let d=draft(w,b,g);d=transition(w,b,d,'submit');d=transition(w,b,d,'start_review');d=transition(w,b,d,'accept',{checkedCriteria:[0,1],reason:'不应自动学习'});assert.equal(f.store.allMemories(b).length,0);
    for(let i=0;i<25;i++)f.store.createMemory(b,{operationId:'page-'+i,kind:i%2?'fact':'preference',text:'分页记忆 '+i});
    const first=f.store.memories(b,{status:'active',limit:10}),second=f.store.memories(b,{status:'active',offset:10,limit:10});assert.equal(new Set([...first,...second].map(m=>m.id)).size,20);
    assert(f.store.memories(b,{kind:'fact'}).every(m=>m.kind==='fact'));
    const newest=f.store.timeline(b,{limit:10}),older=f.store.timeline(b,{before:newest.at(-1).seq,limit:10});assert(newest[0].seq>older[0].seq);assert(newest.every(e=>e.type==='memory'));assert.equal(new Set([...newest,...older].map(e=>e.seq)).size,20);
  }finally{await f.cleanup();}
});
test('Agent may submit only its own draft and never self-review; fake task links and other Bot artifacts are rejected',async()=>{
  const f=await employeeHost();try{
    const w=new EmployeeWorkStore(f.store),b=f.sourceBot.id,g=goal(w,b),service=new EmployeeWorkService({ctx:f.services,directory:f.directory,store:f.store});
    const a=service.agentCommand(f.sender,{action:'delivery_create',goalId:g.id,title:'Agent 交付',fileName:'交付.txt',content:'内容',operationId:'agent-create'});
    const submitted=service.agentCommand(f.sender,{action:'delivery_transition',transition:'submit',deliveryId:a.id,expectedRevision:1,operationId:'agent-submit'});assert.equal(submitted.businessStatus,'submitted');
    assert.throws(()=>service.agentCommand(f.sender,{action:'delivery_transition',transition:'accept',deliveryId:a.id,expectedRevision:2,operationId:'self'}),/REVIEWER_REQUIRED/);
    const userDraft=draft(w,b,g);assert.throws(()=>service.agentCommand(f.sender,{action:'delivery_revise',deliveryId:userDraft.id,expectedRevision:1,fileName:'x.txt',content:'x',operationId:'takeover'}),/EXECUTOR_REQUIRED/);
    assert.throws(()=>service.agentCommand(f.sender,{action:'delivery_create',goalId:g.id,title:'错误任务',fileName:'x.txt',content:'x',sourceTaskId:'made-up',operationId:'fake'}),/TASK_NOT_FOUND/);
    assert.throws(()=>w.artifact(f.targetBot.id,a.currentArtifactId),/ARTIFACT_NOT_FOUND/);
  }finally{await f.cleanup();}
});
test('real HTTP commands, owner admission and downloadable artifact hash are enforced',async()=>{
  const f=await employeeHost();try{
    const base={botId:f.sourceBot.id,operationId:'goal-http',action:'goal_create',title:'HTTP 目标',criteria:['完整正文']};const created=await f.command(base);assert.equal(created.status,200);
    const d=await f.command({action:'delivery_create',botId:f.sourceBot.id,operationId:'http-draft',goalId:created.value.id,title:'HTTP 文档',fileName:'正文.md',content:'# 文档\n真实内容'});assert.equal(d.status,200);
    const url=f.origin+'/naumi/employee-work?'+new URLSearchParams({botId:f.sourceBot.id,view:'artifact',artifactId:d.value.currentArtifactId});const response=await fetch(url,{headers:{cookie:'fixture-owner'}});assert.equal(response.status,200);assert.equal(await response.text(),'# 文档\n真实内容');assert.match(response.headers.get('content-disposition'),/attachment/);assert.equal(response.headers.get('x-artifact-sha256').length,64);
    assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{cookie:'fixture-guest'}})).status,403);
    const cross=await fetch(f.origin+'/naumi/employee-work',{method:'POST',headers:{cookie:'fixture-owner',origin:'https://foreign','Content-Type':'application/json','x-naumi-employee-work':'1'},body:JSON.stringify(base)});assert.equal(cross.status,403);
    assert.equal((await f.command({...base,operationId:'bad',actor:{kind:'owner'}})).status,400);
    const list=await (await fetch(f.origin+'/naumi/employee-work?botId='+f.sourceBot.id,{headers:{cookie:'fixture-owner'}})).json();assert.equal(list.deliveries[0].businessStatus,'draft');assert.equal(list.deliveries[0].executionStatus,'not_linked');
  }finally{await f.cleanup();}
});
test('client retries lost replies with same operationId, but keeps business validation distinct from login failure',async()=>{
  const calls=[];let first=true;const client=createEmployeeClient({uuid:()=> 'stable-id',fetcher:async(url,opts)=>{calls.push(JSON.parse(opts.body));if(first){first=false;throw Error('network');}return Response.json({ok:true});}});
  const body={action:'profile_update',botId:'b',expectedRevision:1,patch:{persona:'x'}};await assert.rejects(client.command('/naumi/employees',body));await client.command('/naumi/employees',body);assert.equal(calls[0].operationId,calls[1].operationId);
  const denied=createEmployeeClient({fetcher:async()=>Response.json({error:'EMP_FIELD_LOCKED'},{status:403})});await assert.rejects(denied.command('/naumi/employees',body),/EMP_FIELD_LOCKED/);
  assert.deepEqual(profileDifference({persona:'旧'},{persona:'新'}).map(d=>d.field),['persona']);
});
test('employee center renders a real main surface before data arrives, not a comma-expression null',()=>{
  const React={createElement:(type,props,...children)=>({type,props,children}),useState:value=>[value,()=>{}],useEffect:()=>{},useRef:value=>({current:value})};
  const tree=createEmployeeCenter(React)();assert.equal(tree.type,'main');assert.equal(tree.props['data-employee-center'],true);assert(tree.children.some(child=>child?.type==='aside'));
});
