import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {taskFixture} from './helpers/bot-task-fixture.mjs';
import {botTaskHost} from './helpers/bot-task-host.mjs';
import {employeeTasks,receptionTarget,taskDockRows} from '../plugins/naumi-enterprise/assets/bot-task-model.js';
import {installRetiredModelCompaction} from '../plugins/naumi-enterprise/bot-tasks.js';
import {BasicCompactionEngine} from '@deepseek-ai/dsh-compaction-basic';

test('completed work continues in the exact same task, Bot, workspace and Session with an immutable original request',async()=>{
  const f=await taskFixture();try{
    const first=await f.service.dispatch(f.sender,f.input({replyMode:'background'}));await f.service.settled();await f.finish(first,{text:'原始文案'});
    const before=f.service.current(first.id),bots=f.directory.list().bots;
    const next=await f.service.continue(f.sender,{taskId:first.id,expectedRevision:before.revision,idempotencyKey:'edit-1',message:'把原稿标题改成第二个'});await f.service.settled();
    assert.equal(next.id,first.id);assert.equal(next.targetSessionId,first.targetSessionId);assert.equal(next.targetBotId,first.targetBotId);assert.equal(next.task,first.task);assert.equal(next.attempt,2);
    assert.equal(f.store.read().tasks.length,1);assert.deepEqual(f.directory.list().bots,bots);assert.equal(f.service.current(first.id).instruction,'把原稿标题改成第二个');
    const delivered=f.deliveries.filter(d=>d.sessionId===first.targetSessionId).at(-1).text;
    const amendment=JSON.parse(delivered.split('本轮明确补充/修改：')[1].split('\n')[0]);
    assert.equal(amendment.text,'把原稿标题改成第二个');assert.deepEqual(amendment,f.service.current(first.id).amendment);
    await f.finish(next,{text:'标题修改完成'});assert.equal(f.service.current(first.id).result,'标题修改完成');assert.equal(f.deliveries.at(-1).mode,'followup');
  }finally{await f.cleanup();}
});

test('concurrent continuation retries are idempotent and stale distinct updates conflict',async()=>{
  const f=await taskFixture();try{
    const t=await f.service.dispatch(f.sender,f.input());await f.service.settled();await f.finish(t);
    const input={taskId:t.id,expectedRevision:f.service.current(t.id).revision,idempotencyKey:'same-edit',message:'压缩为三段'};
    const results=await Promise.all(Array.from({length:8},()=>f.service.continue(f.sender,input)));await f.service.settled();assert(results.every(r=>r.id===t.id));assert.equal(f.service.current(t.id).attempt,2);
    assert.equal(f.store.read().outbox.filter(m=>m.key.includes('same-edit')).length,1);
    await assert.rejects(f.service.continue(f.sender,{...input,message:'改成其他内容'}),/IDEMPOTENCY_CONFLICT/);
    await assert.rejects(f.service.continue(f.sender,{...input,idempotencyKey:'different'}),/CONFLICT/);
  }finally{await f.cleanup();}
});

test('queued amendments wait for provisioning and never create a second execution Session',async()=>{
  const f=await taskFixture({concurrency:0});try{
    const t=await f.service.dispatch(f.sender,f.input());await f.service.settled();
    await f.service.continue(f.sender,{taskId:t.id,expectedRevision:f.service.current(t.id).revision,idempotencyKey:'queued-note',message:'同时给出三种标题'});await f.service.settled();
    assert.equal(f.service.current(t.id).status,'queued');assert.equal(f.deliveries.length,0);assert(!f.store.read().outbox[0].error);
    f.service.concurrency=1;f.service.kick();await f.service.settled();assert.equal(f.service.current(t.id).status,'running');
    const sent=f.deliveries.filter(d=>d.sessionId===t.targetSessionId);assert.equal(sent.length,2);assert(sent[1].text.includes('同时给出三种标题'));assert.equal(f.service.current(t.id).messageId,sent[1].messageId);
    await f.finish(t);assert.equal(f.service.current(t.id).status,'completed');
  }finally{await f.cleanup();}
});

test('queued revision survives restart and idempotent delivery recovery',async()=>{
  const f=await taskFixture();try{
    const t=await f.service.dispatch(f.sender,f.input());await f.service.settled();await f.finish(t);f.service.concurrency=0;
    await f.service.continue(f.sender,{taskId:t.id,expectedRevision:f.service.current(t.id).revision,idempotencyKey:'recover-edit',message:'只改原文结尾'});await f.service.settled();
    await f.restart();assert.equal(f.service.current(t.id).instruction,'只改原文结尾');assert.equal(f.service.current(t.id).targetSessionId,t.targetSessionId);assert.equal(f.service.current(t.id).attempt,2);
    await f.service.settled();assert.equal(f.deliveries.filter(d=>d.sessionId===t.targetSessionId).length,2);const n=f.deliveries.length;await f.restart();assert.equal(f.deliveries.length,n);
  }finally{await f.cleanup();}
});

test('only source Lead can amend; failed/cancelled/interrupted work never resurrects through continue',async()=>{
  const f=await taskFixture();try{
    const t=await f.service.dispatch(f.sender,f.input());await f.service.settled();
    const args={taskId:t.id,expectedRevision:f.service.current(t.id).revision,idempotencyKey:'edit',message:'修改内容'};
    await assert.rejects(f.service.continue(f.other,args),/FORBIDDEN/);await assert.rejects(f.service.continue(f.target,args),/SENDER_REQUIRED/);
    await f.finish(t,{kind:'error'});await assert.rejects(f.service.continue(f.sender,{...args,expectedRevision:f.service.current(t.id).revision}),/RETRY_REQUIRED/);
    const before=f.store.read().tasks.length;await assert.rejects(f.service.continue(f.sender,{...args,taskId:'missing'}),/NOT_FOUND/);assert.equal(f.store.read().tasks.length,before);
  }finally{await f.cleanup();}
});

test('real Session and HTTP preserve original delivery events across revision rounds, enforcing CAS and owner admission',async()=>{
  const f=await botTaskHost();try{
    const t=await f.service.dispatch(f.sender,{targetBotId:f.targetBot.id,task:'原文',idempotencyKey:'first'});await f.service.settled();await f.complete(t,'原文交付');
    const body={action:'continue',sourceSessionId:f.sender.id,taskId:t.id,expectedRevision:f.service.current(t.id).revision,idempotencyKey:'edit',message:'改原文标题'};
    assert.equal((await f.request(body,{cookie:'fixture-guest'})).status,403);assert.equal((await f.request(body,{header:false})).status,403);
    const response=await f.request(body);assert.equal(response.status,200);assert.equal(response.headers.get('X-Naumi-Bot-Continuity'),'1');await f.service.settled();
    await f.complete(t,'原文修改完成');assert.equal(f.service.current(t.id).status,'completed');assert.equal(f.creations.length,1);assert.equal(f.store.read().tasks.length,1);
    assert.equal(f.agents.get(t.targetSessionId).session.snapshotEvents().filter(e=>e.type==='turn/end').length,2);
    assert.equal((await f.request({...body,idempotencyKey:'stale'})).status,409);assert.equal((await f.request(body)).status,200);
  }finally{await f.cleanup();}
});

test('a direct human continuation in a completed execution Session is tracked and returned under the same task',async()=>{
  const f=await taskFixture();try{
    const t=await f.service.dispatch(f.sender,f.input());await f.service.settled();await f.finish(t);
    f.service.userInput(t.targetSessionId,{id:'human-revision',source:{kind:'user'},content:[{type:'text',text:'把这篇再缩短一点'}]});await f.service.settled();
    const current=f.service.current(t.id);assert.equal(current.status,'running');assert.equal(current.attempt,2);assert.equal(current.messageId,'human-revision');assert.equal(current.targetSessionId,t.targetSessionId);
    assert.equal(current.instruction,'把这篇再缩短一点');assert.equal(current.task,t.task);
  }finally{await f.cleanup();}
});

test('a revision round requires its own validated file delivery while retaining the prior original file event',async()=>{
  const f=await botTaskHost();try{
    const t=await f.service.dispatch(f.sender,{targetBotId:f.targetBot.id,task:'交付原文',output:'files',idempotencyKey:'file-first'});await f.service.settled();
    const file=path.join(f.dir,'original.md');fs.writeFileSync(file,'# 原文');
    await f.complete(t,'原文已登记',async agent=>{await agent.tools.get('bot_task_reply').execute({taskId:t.id,idempotencyKey:'original-file',kind:'result',message:'原文',files:[{path:file,description:'原文'}]},{agent,callId:'original-file-call',signal:new AbortController().signal});});
    const original=f.service.current(t.id).delivery.files[0];assert.equal(f.service.current(t.id).status,'completed');
    await f.service.continue(f.sender,{taskId:t.id,expectedRevision:f.service.current(t.id).revision,idempotencyKey:'revise-file',message:'修改原文标题'});await f.service.settled();await f.complete(t,'文字声称改好了，但没有登记文件');
    assert.equal(f.service.current(t.id).error,'BOT_DELIVERY_MISSING');assert.equal(f.service.current(t.id).status,'failed');
    assert.equal(f.agents.get(t.targetSessionId).session.snapshotEvents().filter(e=>e.type==='deliverables/presented').length,1);
    assert.equal(f.store.read().outbox.find(m=>m.attempt===1&&m.kind==='result').files[0].path,original.path);assert(fs.existsSync(file));
  }finally{await f.cleanup();}
});

test('Bot-level task projection spans source and target Sessions without changing reception or reviving archived cards',()=>{
  const bot={id:'employee',homeSessionId:'home',sessionIds:['home','job-a','job-b']},now=new Date().toISOString();
  const tasks=[{id:'a',targetBotId:bot.id,sourceBotId:'lead',sourceSessionId:'lead-home',targetSessionId:'job-a',status:'running',updatedAt:now},{id:'b',targetBotId:bot.id,sourceBotId:'lead',sourceSessionId:'lead-home',targetSessionId:'job-b',status:'queued',updatedAt:now},{id:'other',targetBotId:'stranger',sourceBotId:'lead',status:'running',updatedAt:now}];
  const grouped=employeeTasks(bot,tasks);assert.equal(grouped.active.length,2);assert.equal(grouped.active[0].id,'a');
  assert.equal(receptionTarget(bot,tasks,{byId:{home:{},'job-a':{},'job-b':{}}}),'home');assert.equal(taskDockRows(tasks,'home').current.length,0);
  assert.equal(receptionTarget(bot,tasks,{byId:{}}),'home','A cold native catalog must not cause an implicit new chat');
  const source=fs.readFileSync('plugins/naumi-enterprise/assets/team-panel.js','utf8');assert(source.includes('employeeTasks(bot,jobs.tasks)'));assert(source.includes('createBotTaskCard'));assert(source.includes('会话运行详情'));
});

test('retired-model compaction uses the explicitly chosen custom route without rewriting historical header or global policy',async()=>{
  const header={config:{provider:'deepseek-account',model:'deepseek-flash'}},config={modelPolicies:[{provider:'deepseek-account',model:'deepseek-flash'}],maxTokens:8000},calls=[];
  const engine={config,summarize(input,owner,signal){calls.push({config:this.config,input,owner,signal});return Promise.resolve('summary');}};
  const original=engine.summarize,agent={ctx:{get:()=>engine},session:{requestHeader:()=>header},model:{current:()=>({provider:'ccs-deepseek-992333',model:'deepseek-flash'})}};
  const undo=installRetiredModelCompaction(agent,{listProviders:()=>[{id:'ccs-deepseek-992333'}]});
  const abort=new AbortController(),input={messages:[]};assert.equal(await engine.summarize(input,agent,abort.signal),'summary');
  assert.equal(calls[0].config.summarizationProvider,'ccs-deepseek-992333');assert.equal(calls[0].config.summarizationModel,'deepseek-flash');assert.equal(calls[0].config.modelPolicies[0].summarizationProvider,'ccs-deepseek-992333');
  assert.equal(calls[0].input,input);assert.equal(calls[0].signal,abort.signal);assert.equal(header.config.provider,'deepseek-account');assert.equal(engine.config,config);assert(!config.summarizationProvider);
  undo();assert.equal(engine.summarize,original);
});

test('compaction does not reroute a registered provider, unrelated history or an unavailable selected route',async()=>{
  for(const [previous,providers]of [['other',[{id:'custom'}]],['deepseek-account',[{id:'deepseek-account'},{id:'custom'}]],['deepseek-account',[]]]){
    const config={modelPolicies:[]},engine={config,summarize(){return this.config;}},agent={ctx:{get:()=>engine},session:{requestHeader:()=>({config:{provider:previous,model:'old'}})},model:{current:()=>({provider:'custom',model:'new'})}};
    const undo=installRetiredModelCompaction(agent,{listProviders:()=>providers});assert.equal(engine.summarize({},agent),config);undo();
  }
});

test('real BasicCompactionEngine summarizer sends an explicit custom compaction request preserving history and checkpoint text',async()=>{
  const calls=[],llm={listProviders:()=>[{id:'custom'}],async *stream(options){calls.push(options);yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'Retained original files and current task.'};yield {type:'block-end',index:0,block:{type:'text',text:'Retained original files and current task.'}};yield {type:'finish',reason:'stop'};}};
  const owner={session:{id:'legacy-session',requestHeader:()=>({config:{provider:'deepseek-account',model:'deepseek-flash'}}),toolHistory:()=>[]},model:{current:()=>({provider:'custom',model:'deepseek-flash'})},options:{provider:'custom',model:'deepseek-flash'}};
  const engine={ctx:{llm},config:{summarizationProvider:'',summarizationModel:'',modelPolicies:[],maxTokens:8000}},messages=[{role:'user',content:[{type:'text',text:'原任务与文件不能丢失'}]}];
  const undo=installRetiredModelCompaction({ctx:{get:()=>BasicCompactionEngine.prototype}},llm);
  try{const result=await BasicCompactionEngine.prototype.summarize.call(engine,{messages},owner,new AbortController().signal);assert.equal(calls[0].provider,'custom');assert.equal(calls[0].purpose,'compaction');assert.equal(result.provider,'custom');assert(result.summary[0].text.includes('Retained original'));assert.equal(messages.length,1);assert.equal(owner.session.requestHeader().config.provider,'deepseek-account');}
  finally{undo();}
});

test('model-visible task list is bounded and omits full old results without changing detailed HTTP records',async()=>{
  const f=await taskFixture({concurrency:0});try{
    const t=await f.service.dispatch(f.sender,f.input());await f.store.change(doc=>{doc.tasks[0].result='x'.repeat(30000);return{value:null};});
    const view=f.service.summaries(f.sender,{limit:1,offset:0});assert.equal(view.tasks[0].id,t.id);assert.equal(view.tasks[0].hasResult,true);assert(!('result'in view.tasks[0]));assert(!('profile'in view.tasks[0]));assert(JSON.stringify(view).length<1000);assert.equal(f.service.list(f.sender)[0].result.length,30000);
  }finally{await f.cleanup();}
});
