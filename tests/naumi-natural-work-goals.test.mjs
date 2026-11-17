import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {EmployeeStore} from '../plugins/naumi-enterprise/employee-store.js';
import {EmployeeWorkStore} from '../plugins/naumi-enterprise/employee-work-store.js';
import {EmployeeWorkService} from '../plugins/naumi-enterprise/employee-work.js';
import {employeeHost} from './helpers/employee-host.mjs';

async function fixture(){
  const f=await employeeHost(),work=new EmployeeWorkStore(f.store),service=new EmployeeWorkService({ctx:f.services,directory:f.directory,store:f.store});
  const source=(text='整理下周活动方案，提供来源和可执行清单',agent=f.sender,kind={kind:'user'})=>{
    const message=createUserMessage({source:kind,content:[{type:'text',text}]});agent.session.append('user/message',message,{surfaceOp:'append'});return message;
  };
  const message=source(),input={title:'整理活动方案',description:'形成可复核方案',criteria:['提供来源','行动清单完整'],sourceMessageId:message.id,quote:'整理下周活动方案',operationId:'propose-one'};
  const propose=(patch={},agent=f.sender)=>agent.tools.get('employee_goal_propose').execute({...input,...patch},{agent});
  const review=(p,extra={})=>({action:'goal_proposal_review',botId:f.sourceBot.id,proposalId:p.id,expectedRevision:p.revision,operationId:randomUUID(),decision:'confirm',...extra});
  return {...f,work,service,source,message,input,propose,review};
}

test('native goal tool persists pending proposal with verified source and no goal/task/approval side effects',async()=>{
  const f=await fixture();try{
    const p=await f.propose();assert.equal(p.status,'pending');assert.equal(p.source.messageId,f.message.id);assert.equal(p.source.sessionId,f.sender.id);
    assert.equal(f.work.goals(f.sourceBot.id).length,0);assert.equal(f.work.deliveries(f.sourceBot.id).length,0);assert.equal(f.work.proposals(f.targetBot.id).length,0);
    assert(f.log.get(f.sender.id).events.some(e=>e.type==='user/message'&&e.data.id===f.message.id));
    const v=await f.sender.tools.get('employee_work').execute({},{agent:f.sender});assert.equal(v.goalProposals[0].id,p.id);assert.equal(v.recentUserSources[0].messageId,f.message.id);
    assert.equal(f.store.export(f.sourceBot.id).work.goalProposals[0].id,p.id);
    assert.throws(()=>f.work.goal(f.sourceBot.id,p.id),/GOAL_NOT_FOUND/);
  }finally{await f.cleanup();}
});
test('same source/content deduplicates across operation IDs and ignores never revive from retries',async()=>{
  const f=await fixture();try{
    const p=await f.propose();assert.deepEqual(await f.propose(),p);assert.deepEqual(await f.propose({operationId:'other-op'}),p);
    await assert.rejects(f.propose({title:'别的目标'}),/IDEMPOTENCY_CONFLICT/);
    const dismissed=await f.command(f.review(p,{decision:'dismiss',operationId:'ignore'}));assert.equal(dismissed.status,200);
    const repeat=await f.propose({operationId:'after-ignore'});assert.equal(repeat.status,'dismissed');assert.equal(f.work.proposals(p.botId).length,1);assert.equal(f.work.goals(p.botId).length,0);
  }finally{await f.cleanup();}
});
test('owner edits and confirms in one transaction; same operation receipt returns same original goal',async()=>{
  const f=await fixture();try{
    const p=await f.propose(),command=f.review(p,{goal:{...p.goal,title:'修改后的活动目标',criteria:['最终确认标准']},operationId:'owner-confirm'});
    const result=await f.command(command);assert.equal(result.status,200);assert.equal(result.value.goal.status,'planned');assert.equal(result.value.goal.title,'修改后的活动目标');assert.equal(result.value.goal.sourceProposalId,p.id);
    assert.equal(result.value.proposal.goal.title,p.goal.title);assert.equal(result.value.proposal.goalId,result.value.goal.id);
    assert.deepEqual((await f.command(command)).value,result.value);assert.equal(f.work.goals(p.botId).length,1);
    assert.equal((await f.command({...command,operationId:'late-op'})).status,409);assert.equal(f.work.goals(p.botId).length,1);
    await assert.rejects(f.sender.tools.get('employee_delivery_create').execute({goalId:p.id,title:'invalid',fileName:'x.txt',content:'x',operationId:'fake-goal'},{agent:f.sender}),/GOAL_NOT_FOUND/);
  }finally{await f.cleanup();}
});
test('failed confirmation rolls back goal, proposal, audit and operation receipt together',async()=>{
  const f=await fixture();try{
    const p=await f.propose(),events=f.store.stats().events,command=f.review(p,{operationId:'atomic-confirm'});
    f.store.beforeCommit=()=>{throw Error('injected write failure');};assert.equal((await f.command(command)).status,503);
    assert.equal(f.work.goals(p.botId).length,0);assert.equal(f.work.proposal(p.botId,p.id).status,'pending');assert.equal(f.store.stats().events,events);
    assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM operations WHERE operation_id=?').get('atomic-confirm').n,0);
    f.store.beforeCommit=null;assert.equal((await f.command(command)).status,200);assert.equal(f.work.goals(p.botId).length,1);
  }finally{await f.cleanup();}
});
test('parallel confirm versus dismiss has exactly one winner and never overwrites a resolved proposal',async()=>{
  const f=await fixture();try{
    const p=await f.propose(),results=await Promise.all([f.command(f.review(p)),f.command(f.review(p,{decision:'dismiss'}))]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const current=f.work.proposal(p.botId,p.id);
    assert.equal(current.revision,2);assert.equal(f.work.goals(p.botId).length,current.status==='confirmed'?1:0);
    const repeat=await f.command(f.review(current,{decision:'confirm'}));assert.equal(repeat.status,400);assert.equal(repeat.value.error,'WORK_PROPOSAL_RESOLVED');
  }finally{await f.cleanup();}
});
test('reopened SQLite and a second connection preserve source, resolution and idempotent receipt',async()=>{
  const f=await fixture();let other;try{
    const p=await f.propose(),command=f.review(p,{operationId:'cross-connection'}),r=await f.command(command);
    other=new EmployeeStore(f.store.file);const w=new EmployeeWorkStore(other);assert.equal(w.proposal(p.botId,p.id).source.messageId,f.message.id);
    const {action,botId,...input}=command;assert.deepEqual(w.reviewProposal(botId,input),r.value);assert.equal(w.goals(p.botId).length,1);
    assert.throws(()=>w.proposal(f.targetBot.id,p.id),/NOT_FOUND/);
  }finally{other?.close();await f.cleanup();}
});
test('missing/foreign/relay source or mismatched quote cannot create proposals',async()=>{
  const f=await fixture();try{
    for(const patch of [{sourceMessageId:'invented'},{quote:'并不存在的文字'}])await assert.rejects(f.propose(patch),/USER_SOURCE_REQUIRED|SOURCE_QUOTE_MISMATCH/);
    await assert.rejects(f.propose({},f.target),/USER_SOURCE_REQUIRED/);
    const relay=f.source('整理下周活动方案',f.sender,{kind:'agent-message',form:'relay',senderSessionId:f.target.id});
    await assert.rejects(f.propose({sourceMessageId:relay.id}),/USER_SOURCE_REQUIRED/);assert.equal(f.work.proposals(f.sourceBot.id).length,0);
  }finally{await f.cleanup();}
});
test('agent cannot create active goals, confirm/dismiss proposals, or spoof Bot/owner/source fields',async()=>{
  const f=await fixture();try{
    const p=await f.propose();assert.throws(()=>f.service.agentCommand(f.sender,f.review(p)),/REVIEWER_REQUIRED/);
    assert.throws(()=>f.work.reviewProposal(p.botId,{...f.review(p)}, {kind:'agent',sessionId:f.sender.id}),/REVIEWER_REQUIRED/);
    assert.equal((await f.command(f.review(p,{actor:{kind:'owner'}}))).status,400);
    assert.equal((await f.command(f.review(p,{botId:f.targetBot.id}))).status,404);
    assert.equal((await f.command({...f.input,action:'goal_propose',botId:p.botId})).status,400);
    await assert.rejects(f.propose({botId:f.targetBot.id}),/unrecognized|Unrecognized/);
    await assert.rejects(f.propose({permissions:'all'}),/unrecognized|Unrecognized/);
  }finally{await f.cleanup();}
});
test('owner HTTP admission, CSRF and strict review shape remain enforced',async()=>{
  const f=await fixture();try{
    const p=await f.propose(),command=f.review(p),url=f.origin+'/naumi/employee-work';
    const post=headers=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(command)});
    assert.equal((await post({})).status,401);assert.equal((await post({cookie:'fixture-guest'})).status,403);
    assert.equal((await post({cookie:'fixture-owner'})).status,403);assert.equal((await post({cookie:'fixture-owner','x-naumi-employee-work':'1',origin:'https://foreign'})).status,403);
    assert.equal((await f.command(f.review(p,{decision:'dismiss',goal:p.goal}))).status,400);
    const read=await fetch(url+'?botId='+p.botId,{headers:{cookie:'fixture-owner'}});assert.equal(read.headers.get('x-naumi-goal-proposals'),'1');assert.equal((await read.json()).goalProposals.length,1);
    assert.equal(f.work.proposal(p.botId,p.id).status,'pending');
  }finally{await f.cleanup();}
});
test('source flush failure, cancellation and identity changes fail before a durable proposal',async()=>{
  const f=await fixture();try{
    const original=f.services.sessions.flush;f.services.sessions.flush=async()=>{throw Error('flush failed');};await assert.rejects(f.propose(),/flush failed/);
    const abort=new AbortController();f.services.sessions.flush=async s=>{await original(s);abort.abort();};
    await assert.rejects(f.sender.tools.get('employee_goal_propose').execute(f.input,{agent:f.sender,signal:abort.signal}),/abort/i);
    f.services.sessions.flush=async s=>{await original(s);f.directory.forSession=()=>f.targetBot;};await assert.rejects(f.propose(),/IDENTITY_CHANGED/);
    assert.equal(f.work.proposals(f.sourceBot.id).length,0);
  }finally{await f.cleanup();}
});
test('public text protection and invalid criteria prevent persistence; proposals have a pending capacity',async()=>{
  const f=await fixture();try{
    await assert.rejects(f.propose({title:'apikey: sk-'+ 'a'.repeat(24)}),/SECRET_PATTERN/);await assert.rejects(f.propose({criteria:[]}),/small|least/i);
    const p=await f.propose();for(let i=1;i<50;i++)await f.propose({title:'目标'+i,operationId:'capacity'+i});
    await assert.rejects(f.propose({title:'超限',operationId:'overflow'}),/PROPOSAL_CAPACITY/);assert.equal(f.work.goals(p.botId).length,0);
    assert.equal((await f.command(f.review(p,{decision:'dismiss'}))).status,200);assert.equal((await f.propose({title:'新目标',operationId:'after-room'})).status,'pending');
  }finally{await f.cleanup();}
});
