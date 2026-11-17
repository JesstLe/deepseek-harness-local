import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {taskFixture} from './helpers/bot-task-fixture.mjs';
import {botTaskHost} from './helpers/bot-task-host.mjs';
import {runBotTool} from './helpers/bot-tool-pipeline.mjs';
import {createBotTaskTools} from '../plugins/naumi-enterprise/bot-tasks.js';
import {BotTaskStore} from '../plugins/naumi-enterprise/bot-task-store.js';
import {repairTaskDocument,repairTaskFile,sha} from '../scripts/repair-bot-task-integrity.mjs';

async function otherConversation(f){
  const a={id:'other-reception',role:'lead'};f.agents.set(a.id,a);
  await f.directory.bind(f.sourceBot.id,a.id,f.directory.forSession(f.sender.id).revision,f.dir);return a;
}

test('native tool output boundary accepts absent, empty and bounded progress and retains compact pagination',async()=>{
  const f=await taskFixture({concurrency:0});try{
    const a=await f.service.dispatch(f.sender,f.input({replyMode:'background'}));const b=await f.service.dispatch(f.sender,f.input());
    for(const progress of [undefined,'','进度'.repeat(200)]){
      await f.store.change(d=>{for(const t of d.tasks){if(progress===undefined)delete t.progress;else t.progress=progress;}return{value:null};});
      const result=await runBotTool(createBotTaskTools(f.service),f.sender,'bot_task_list',{limit:1});
      assert.equal(result.isError,false,JSON.stringify(result));assert.equal(result.value.total,2);assert.equal(result.value.hasMore,true);
      assert.deepEqual(result.value,JSON.parse(result.content[0].text));assert.equal('progress'in result.value.tasks[0],progress!==undefined);
      if(progress!==undefined)assert.equal(result.value.tasks[0].progress,progress.slice(0,160));
      for(const name of ['bot_task_get','bot_task_wait']){
        const r=await runBotTool(createBotTaskTools(f.service),f.sender,name,{taskId:a.id,...(name==='bot_task_wait'?{afterRevision:f.service.current(a.id).revision}: {})});assert.equal(r.isError,false);
      }
    }
    const page=await runBotTool(createBotTaskTools(f.service),f.sender,'bot_task_list',{offset:1,limit:1});assert.equal(page.value.hasMore,false);assert.equal(page.value.tasks.length,1);
    const empty=await runBotTool(createBotTaskTools(f.service),f.other,'bot_task_list',{});assert.equal(empty.isError,false);assert.equal(empty.value.total,0);
    assert.notEqual(a.id,b.id);
  }finally{await f.cleanup();}
});

test('same-Bot foreign conversation can read but cannot continue, retry, cancel or send feedback on existing work',async()=>{
  const f=await taskFixture();try{
    const t=await f.service.dispatch(f.sender,f.input());await f.service.settled();const a=await otherConversation(f);
    assert.equal((await f.service.get(a,t.id)).id,t.id);assert.equal(f.service.summaries(a).total,1);
    for(const terminal of [false,true]){
      if(terminal)await f.finish(t);
      const before=f.store.read(),deliveries=f.deliveries.length;
      for(const name of ['bot_task_continue','bot_task_retry','bot_task_cancel','bot_task_reply']){
        const args={taskId:t.id,...(name==='bot_task_reply'?{kind:'message',message:'unrelated',idempotencyKey:'foreign'}:{expectedRevision:f.service.current(t.id).revision,...(name==='bot_task_continue'?{message:'unrelated',idempotencyKey:'foreign'}:{})})};
        const r=await runBotTool(createBotTaskTools(f.service),a,name,args);assert.equal(r.isError,true);assert.match(r.error.message,/BOT_TASK_SESSION_REQUIRED/);
      }
      assert.deepEqual(f.store.read(),before);assert.equal(f.deliveries.length,deliveries);
    }
    const r=await f.service.continue(f.sender,{taskId:t.id,expectedRevision:f.service.current(t.id).revision,idempotencyKey:'owner',message:'真实修改'});assert.equal(r.attempt,2);await f.service.settled();
    await f.service.reply(f.agents.get(t.targetSessionId),{taskId:t.id,idempotencyKey:'worker-progress',kind:'progress',message:'修改中'});
    const independent=await f.service.dispatch(a,f.input());assert.equal(independent.sourceSessionId,a.id);assert.notEqual(independent.id,t.id);
  }finally{await f.cleanup();}
});

test('explicit owner task-card HTTP works while foreign sourceSession HTTP is rejected without any ledger delta',async()=>{
  const f=await botTaskHost();try{
    const t=await f.service.dispatch(f.sender,{targetBotId:f.targetBot.id,task:'业务稿件',idempotencyKey:'business'});await f.service.settled();await f.complete(t,'原始交付');
    // Bind an existing native Session to the sender Bot as a second reception.
    const foreign=await f.registry.create({sessionId:'foreign-sender',meta:{cwd:f.dir,agentPreset:'source-preset'},setup:async()=>{}});
    await f.directory.bind(f.sourceBot.id,foreign.agent.id,f.directory.forSession(f.sender.id).revision,f.dir);
    const body={action:'continue',sourceSessionId:foreign.agent.id,taskId:t.id,expectedRevision:f.service.current(t.id).revision,idempotencyKey:'foreign',message:'test marker'};
    const before=f.store.read();const denied=await f.request(body);assert.equal(denied.status,403);assert.equal((await denied.json()).error,'BOT_TASK_SESSION_REQUIRED');assert.deepEqual(f.store.read(),before);
    const ok=await f.request({...body,sourceSessionId:f.sender.id,idempotencyKey:'explicit-card',message:'修改原稿标题'});assert.equal(ok.status,200);assert.equal(ok.headers.get('X-Naumi-Bot-Integrity'),'1');await f.service.settled();await f.complete(t,'修改交付');
    assert.equal(f.service.current(t.id).attempt,2);assert.equal(f.service.current(t.id).targetSessionId,t.targetSessionId);
  }finally{await f.cleanup();}
});

async function contaminatedFixture(){
  const f=await taskFixture({concurrency:0});const t=await f.service.dispatch(f.sender,f.input());const unrelated=await f.service.dispatch(f.sender,f.input());
  await f.store.change(d=>{const a=d.tasks.find(a=>a.id===t.id);a.status='completed';a.instruction='fixture test instruction';a.result='fixture test marker';d.outbox.push({id:'message-test',taskId:t.id,key:'continue:foreign:test',messageId:'message-test-call',fromSessionId:'foreign',toSessionId:t.targetSessionId,attempt:1,taskStatus:'completed',kind:'message',text:a.instruction,delivered:false,createdAt:a.updatedAt});return{value:null};});
  await f.service.settled();
  const d=f.store.read(),a=d.tasks.find(a=>a.id===t.id),expected={taskId:t.id,revision:a.revision,foreignSessionId:'foreign',instructionSHA256:sha(a.instruction),resultSHA256:sha(a.result),ledgerSHA256:sha(fs.readFileSync(f.storeFile))};
  return {f,t,unrelated,d,expected};
}

test('incident repair preserves original request, identity, profile and all history; marks interrupted without replay',async()=>{
  const {f,t,unrelated,d,expected}=await contaminatedFixture();try{
    const {document:next,receipt}=repairTaskDocument(d,expected),a=next.tasks.find(a=>a.id===t.id);
    assert.equal(a.status,'interrupted');assert.equal(a.error,'BOT_TASK_REVIEW_REQUIRED');assert.equal(a.attempt,t.attempt);assert.equal(a.revision,expected.revision+1);
    for(const key of ['task','sourceSessionId','targetSessionId','targetBotId','profile','targetCwd','messageId'])assert.deepEqual(a[key],d.tasks.find(a=>a.id===t.id)[key]);
    for(const key of ['instruction','result','delivery','progress'])assert(!Object.hasOwn(a,key));
    assert.deepEqual(next.tasks.find(a=>a.id===unrelated.id),d.tasks.find(a=>a.id===unrelated.id));
    assert.equal(next.outbox.length,d.outbox.length+1);assert.equal(next.outbox[0].text,d.outbox[0].text);assert.equal(next.outbox.at(-1).delivered,true);assert.equal(receipt.queued,false);
    const privateDir=path.join(f.dir,'repair');const r=await repairTaskFile({ledger:f.storeFile,expected,evidence:privateDir});assert.equal(sha(fs.readFileSync(r.backup)),expected.ledgerSHA256);
    const restored=path.join(f.dir,'rollback-copy.json');fs.copyFileSync(r.backup,restored);const reopened=new BotTaskStore(restored);
    try{assert.deepEqual(reopened.read(),d);assert.equal(reopened.read().tasks.find(a=>a.id===t.id).result,'fixture test marker');assert.equal(sha(fs.readFileSync(f.storeFile)),r.afterSHA256);}finally{await reopened.close();}
    await f.restart();assert.equal(f.service.current(t.id).status,'interrupted');assert.equal(f.deliveries.length,0);
    await f.service.retry(f.sender,{taskId:t.id,expectedRevision:f.service.current(t.id).revision});await f.service.settled();assert(!f.service.current(t.id).instruction);
  }finally{await f.cleanup();}
});

test('repair refuses stale CAS, changed instruction/result or missing provenance and never writes on mismatch',async()=>{
  const {f,d,expected}=await contaminatedFixture();try{
    for(const delta of [{revision:999},{instructionSHA256:'wrong'},{resultSHA256:'wrong'},{foreignSessionId:'wrong'}])assert.throws(()=>repairTaskDocument(d,{...expected,...delta}));
    const raw=fs.readFileSync(f.storeFile);await assert.rejects(repairTaskFile({ledger:f.storeFile,expected:{...expected,ledgerSHA256:'wrong'},evidence:path.join(f.dir,'refused')}),/REPAIR_LEDGER_CONFLICT/);assert.deepEqual(fs.readFileSync(f.storeFile),raw);assert(!fs.existsSync(path.join(f.dir,'refused')));
  }finally{await f.cleanup();}
});

test('historical live acceptance driver exits before credentials, HTTP or model invocation',()=>{
  const r=spawnSync(process.execPath,['scripts/verify-bot-task-continuity-live.mjs'],{encoding:'utf8'});assert.equal(r.status,2);assert.match(r.stderr,/CONTINUITY_LIVE_RETIRED/);
  const source=fs.readFileSync('scripts/verify-bot-task-continuity-live.mjs','utf8');assert(!source.includes('import '));assert(!source.includes('fetch('));
});
