import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {taskFixture} from './helpers/bot-task-fixture.mjs';
import {botTaskHost} from './helpers/bot-task-host.mjs';
import {BotTaskStore} from '../plugins/naumi-enterprise/bot-task-store.js';
import {botOverview} from '../plugins/naumi-enterprise/bot-overview.js';
import {taskWorkGroups} from '../plugins/naumi-enterprise/assets/bot-overview.js';
import {createBotTaskRuntime} from '../plugins/naumi-enterprise/bot-task-runtime.js';
const input=(extra={})=>({task:'整理本周设计资料',idempotencyKey:randomUUID(),...extra});
async function fixture(t){const f=await taskFixture();t.after(()=>f.cleanup());return f;}

test('self start durably accepts one independent native task and keeps Bot profile',async t=>{
 const f=await fixture(t),args=input(),values=await Promise.all(Array.from({length:8},()=>f.service.start(f.sender,args)));
 await f.service.settled();assert.equal(new Set(values.map(v=>v.id)).size,1);
 const task=f.service.current(values[0].id);assert.equal(task.executionKind,'self');assert.deepEqual(task.lineage,[f.sourceBot.id]);assert.equal(task.replyMode,'background');assert.equal(task.sourceBotId,task.targetBotId);assert.notEqual(task.sourceSessionId,task.targetSessionId);assert.equal(task.profile.model.reasoningEffort,'high');assert.equal(task.profile.permissions[0].data.mode,'read-only');assert.equal(f.sessions.get(task.targetSessionId).running,true);
 const waiting=await f.service.wait(f.sender,{taskId:task.id,afterRevision:task.revision});assert.equal(waiting.background,true);
 assert.equal(f.deliveries.filter(v=>v.sessionId===task.targetSessionId).length,1);
});
test('self start rejects historical same-Bot sessions, workers and untrusted override fields',async t=>{
 const f=await fixture(t),task=await f.service.start(f.sender,input());await f.service.settled();
 const worker=f.agents.get(task.targetSessionId);assert.throws(()=>f.service.start(worker,input()),/BOT_RECEPTION_SESSION_REQUIRED/);
 await f.directory.bind(f.sourceBot.id,f.other.id,f.directory.forSession(f.sender.id).revision,f.dir).catch(()=>{});
 // Use a new non-home root, never a different Bot identity.
 const old=await f.runtime.ensure('historical',{create:true,cwd:f.dir});await f.directory.bind(f.sourceBot.id,old.id,f.directory.forSession(f.sender.id).revision,f.dir);
 assert.throws(()=>f.service.start(old,input()),/BOT_RECEPTION_SESSION_REQUIRED/);
 for(const extra of [{targetBotId:f.targetBot.id},{replyMode:'wait'},{executionKind:'self'},{profile:{}}])assert.throws(()=>f.service.start(f.sender,input(extra)));
});
test('normal dispatch still forbids self/cycles; idempotency cannot change kind',async t=>{
 const f=await fixture(t),args=input(),task=await f.service.start(f.sender,args);await f.service.settled();
 await assert.rejects(f.service.dispatch(f.sender,{...args,targetBotId:f.sourceBot.id}),/BOT_TASK_IDEMPOTENCY_CONFLICT/);
 await assert.rejects(f.service.dispatch(f.sender,f.input({targetBotId:f.sourceBot.id})),/BOT_TASK_CYCLE/);
 const child=await f.service.dispatch(f.agents.get(task.targetSessionId),f.input());await f.service.settled();assert.equal(child.parentTaskId,task.id);assert.deepEqual(child.lineage,[f.sourceBot.id,f.targetBot.id]);
 await assert.rejects(f.service.dispatch(f.agents.get(child.targetSessionId),f.input({targetBotId:f.sourceBot.id})),/BOT_TASK_CYCLE/);
});
test('exact self worker replies but cannot continue/cancel/retry its sender task',async t=>{
 const f=await fixture(t),task=await f.service.start(f.sender,input());await f.service.settled();const worker=f.agents.get(task.targetSessionId);
 await f.service.reply(worker,{taskId:task.id,idempotencyKey:'progress',kind:'progress',message:'正在整理'});assert.equal(f.service.current(task.id).progress,'正在整理');
 for(const [name,args]of [['continue',{message:'替换',idempotencyKey:'edit'}],['cancel',{}],['retry',{}]])await assert.rejects(f.service[name](worker,{taskId:task.id,expectedRevision:f.service.current(task.id).revision,...args}),/BOT_TASK_SESSION_REQUIRED/);
 await assert.rejects(f.service.reply(f.target,{taskId:task.id,idempotencyKey:'fake',kind:'result',message:'伪造'}),/BOT_TASK_FORBIDDEN/);
 await f.finish(task);assert.equal(f.service.current(task.id).status,'completed');assert.equal(f.deliveries.find(v=>v.sessionId===f.sender.id).mode,'followup');
});
test('new home messages and stopping current chat leave self worker running; task cancel is explicit',async t=>{
 const f=await fixture(t),task=await f.service.start(f.sender,input());await f.service.settled();
 f.service.userInput(f.sender.id,{id:'new-topic',source:{kind:'user'},content:[{type:'text',text:'聊聊今天的天气'}]},f.sender.session);
 await f.runtime.cancel(f.sender.id);await f.service.settled();assert.equal(f.sessions.get(task.targetSessionId).running,true);assert.equal(f.service.current(task.id).status,'running');
 await f.service.cancel(f.sender,{taskId:task.id,expectedRevision:f.service.current(task.id).revision});assert.equal(f.service.current(task.id).status,'cancelled');assert.equal(f.sessions.get(task.targetSessionId).running,false);
});
test('same-Bot tasks queue without merging identities; continuation reuses exact task/session',async t=>{
 const f=await fixture(t),a=await f.service.start(f.sender,input()),b=await f.service.start(f.sender,input({task:'另一个工作'}));await f.service.settled();
 assert.equal(f.service.current(a.id).status,'running');assert.equal(f.service.current(b.id).status,'queued');
 await f.finish(a);assert.equal(f.service.current(b.id).status,'running');await f.finish(b);
 const updated=await f.service.continue(f.sender,{taskId:a.id,expectedRevision:f.service.current(a.id).revision,idempotencyKey:'same-edit',message:'调整为蓝色'});await f.service.settled();
 assert.equal(updated.id,a.id);assert.equal(updated.targetSessionId,a.targetSessionId);assert.equal(updated.attempt,2);assert.equal(f.store.read().tasks.length,2);
 const duplicate=await f.service.continue(f.sender,{taskId:a.id,expectedRevision:1,idempotencyKey:'same-edit',message:'调整为蓝色'});assert.equal(duplicate.attempt,2);
});
test('self tasks preserve confirmed Goal snapshot and reject stale Goal',async t=>{
 const f=await fixture(t),goal={id:'g',botId:f.sourceBot.id,revision:2,title:'设计交付',description:'原要求',criteria:['有文件'],status:'planned'};f.service.readWorkGoal=()=>goal;
 await assert.rejects(f.service.start(f.sender,input({workGoalId:'g',workGoalRevision:1})),/BOT_WORK_GOAL_CHANGED/);
 const task=await f.service.start(f.sender,input({workGoalId:'g',workGoalRevision:2}));await f.service.settled();assert.equal(task.workGoal.description,'原要求');goal.description='新要求';assert.equal(f.service.current(task.id).workGoal.description,'原要求');
});
test('restart preserves accepted task and next-turn outbox exactly once',async t=>{
 const f=await fixture(t),task=await f.service.start(f.sender,input());await f.service.settled();f.runtime.failSource=true;await f.finish(task);assert.equal(f.store.read().outbox.some(v=>!v.delivered),true);
 f.runtime.failSource=false;await f.restart();await f.restart();assert.equal(f.service.current(task.id).status,'completed');assert.equal(f.deliveries.filter(v=>v.sessionId===f.sender.id).length,1);assert.equal(f.deliveries.filter(v=>v.sessionId===task.targetSessionId).length,1);
});
test('ledger rejects forged self identities and one-node delegated lineage',async t=>{
 const f=await fixture(t),task=await f.service.start(f.sender,input());await f.service.settled();
 const original=f.store.read();for(const mutate of [v=>{delete v.executionKind;},v=>v.lineage.push(v.sourceBotId),v=>v.targetBotId=f.targetBot.id,v=>v.parentTaskId='parent',v=>v.sourceSessionId=v.targetSessionId,v=>v.replyMode='wait']){
  const doc=structuredClone(original);mutate(doc.tasks[0]);const file=path.join(f.dir,randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify(doc));const store=new BotTaskStore(file);assert.throws(()=>store.read(),/BOT_TASK_LEDGER_INVALID/);await store.close();
 }
});
test('owner HTTP and real Session inbox: self result and immutable files return to next turn',async t=>{
 const f=await botTaskHost();t.after(()=>f.cleanup());
 const r=await f.request({action:'start',sourceSessionId:f.sender.id,...input({output:'files'})});assert.equal(r.status,200);assert.equal(r.headers.get('x-naumi-bot-main-chat'),'1');const task=await r.json();await f.service.settled();
 const tool=f.sender.tools.get('bot_task_start');assert(tool);assert.match(f.sender.prompts.get('naumi:bot-task').text(),/MAIN RECEPTION CHAT/);
 const worker=f.agents.get(task.targetSessionId);assert.match(worker.prompts.get('naumi:bot-task').text(),/Do NOT call bot_task_start/);
 const file=path.join(f.dir,'design.txt');fs.writeFileSync(file,'实际交付文件');f.sender.status='running';
 await f.complete(task,'文件已交付',async(agent)=>{await f.service.reply(agent,{taskId:task.id,idempotencyKey:'present',kind:'result',message:'设计文件',files:[{path:file,description:'设计文件'}]},{callId:'self-files'});});
 const done=f.service.current(task.id);assert.equal(done.status,'completed');assert(done.delivery.files[0].snapshot);assert.equal(f.sender.inbox.nextStep.length,0);assert.equal(f.sender.inbox.nextTurn.length,1);assert.match(f.sender.inbox.nextTurn[0].content[0].text,new RegExp(task.id));assert.notEqual(worker.id,f.sender.id);
 const foreign=await f.request({action:'start',sourceSessionId:task.targetSessionId,...input()});assert.equal(foreign.status,403);
 const guest=await f.request({action:'start',sourceSessionId:f.sender.id,...input()},{cookie:'fixture-guest'});assert.equal(guest.status,403);
});
test('task overview excludes nonempty main chat and groups native threads/child work without losing identities',async()=>{
 const jobs=[{id:'a',sourceBotId:'b',targetBotId:'b',sourceSessionId:'home',targetSessionId:'worker',task:'任务A',status:'running',updatedAt:'2',executionKind:'self',attempt:2},{id:'c',parentTaskId:'a',sourceBotId:'b',targetBotId:'x',targetSessionId:'child-worker',task:'子任务',status:'completed',updatedAt:'1'}];
 jobs.push({id:'grandchild',parentTaskId:'c',sourceBotId:'x',targetBotId:'z',targetSessionId:'grandchild-worker',task:'后续复核',status:'completed',updatedAt:'1'});
 const service={store:{read:()=>({revision:4,tasks:jobs})},runtime:{snapshot:async id=>({header:{id},events:[{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'你好'}]}}]}),threads:async id=>({threads:id==='worker'?[{sessionId:'native-child',parentSessionId:id,title:'设计评审',depth:1,available:true}]:[],partial:false})}};
 const data=await botOverview({list:()=>({bots:[{id:'b',homeSessionId:'home',sessionIds:['home','worker']}]})},service,'b');assert.equal(data.sessions.length,0);assert.equal(data.tasks[0].threads[0].sessionId,'native-child');assert.equal(data.tasks[0].attempt,2);const groups=taskWorkGroups(data);assert.equal(groups.groups.length,1);assert.equal(groups.groups[0].children[0].id,'c');assert.equal(groups.groups[0].children[1].id,'grandchild');assert.equal(taskWorkGroups(data,'后续复核').groups[0].task.id,'a');assert.equal(taskWorkGroups(data,'子任务').groups[0].task.id,'a');
});
test('native thread discovery checks exact parent, bounds traversal, and never starts Agents',async()=>{
 const snapshots={root:{header:{id:'root'},events:[]},a:{header:{id:'a',parentSession:'root'},events:[]},wrong:{header:{id:'wrong',parentSession:'foreign'},events:[]},leaf:{header:{id:'leaf',parentSession:'a'},events:[]}};
 const runtime=createBotTaskRuntime({get:name=>name==='subagents'?{listChildren:async id=>id==='root'?[{id:'a',label:'评审',mode:'continuable'},{id:'wrong',mode:'one-shot'}]:id==='a'?[{id:'leaf',mode:'one-shot'}]:[]}:null,agents:{get:()=>null},sessionPersistence:{stat:async id=>snapshots[id],open:async id=>({...snapshots[id],read:async()=>({events:[]}),close:async()=>{}})}});
 const tree=await runtime.threads('root');assert.deepEqual(tree.threads.map(v=>v.sessionId),['a','leaf']);assert.equal(tree.partial,true);assert.equal((await runtime.threads('root',{limit:1})).threads.length,1);
});
