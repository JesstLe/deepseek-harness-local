import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createToolResultMessage} from '@deepseek-ai/dsh-llm';
import {parseFileAddress} from '@deepseek-ai/dsh-util-workspace-path';
import {Session,SessionId} from '@deepseek-ai/dsh-session';
import {botTaskHost} from './helpers/bot-task-host.mjs';
import {announcedFiles,references,registerFiles,previewAddress,DELIVERY_PROMPT} from '../plugins/naumi-enterprise/bot-deliverables.js';
import {BotTaskStore} from '../plugins/naumi-enterprise/bot-task-store.js';

const input=f=>({targetBotId:f.targetBot.id,task:'保存并交付文章文件',idempotencyKey:'article-1',output:'files'});
const writeEvents=(agent,turn,file,{error=false}={})=>{
  const callId='fixture-write';
  agent.session.append('tool/call',{turn,step:1,callId,name:'write',arguments:JSON.stringify({file_path:file,content:'fixture'})});
  agent.session.append('tool/result',{turn,step:1,message:createToolResultMessage({callId,isError:error,content:[{type:'text',text:error?'write failed':'written'}]})},{surfaceOp:'append'});
};
async function start(f){const response=await f.request({action:'dispatch',sourceSessionId:f.sender.id,...input(f)});assert.equal(response.status,200);const task=await response.json();await f.service.settled();return task;}

test('announcements are correlated with successful same-turn writes, not arbitrary paths or source edits',()=>{
  const events=[{type:'tool/call',data:{turn:1,name:'write',callId:'w',arguments:'{"file_path":"reports/a.md"}'}},
    {type:'tool/result',data:{message:{toolCallId:'w',isError:false}}},
    {type:'tool/call',data:{turn:1,name:'edit',callId:'e',arguments:{file_path:'src/code.js'}}},
    {type:'tool/result',data:{message:{toolCallId:'e',isError:true}}}];
  assert.deepEqual(announcedFiles(events,1,'交付：`reports/a.md`；另有 `secret.key`、`src/code.js`'),[{path:'reports/a.md'}]);
  assert.deepEqual(announcedFiles(events,2,'`reports/a.md`'),[]);
  assert.deepEqual(announcedFiles(events,1,'[文章](<reports/a.md>)'),[{path:'reports/a.md'}]);
  assert.deepEqual(announcedFiles(events,1,'分析结束，没有文件交付'),[]);
});

test('automatic registration creates native events, durable source references and an idempotent supervisor card',async()=>{
  const f=await botTaskHost();try{
    assert(f.sender.prompts.get('naumi:bot-delivery').text.includes('present'));
    assert.equal((await f.request(null)).headers.get('x-naumi-bot-delivery'),'1');
    const task=await start(f),file=path.join(f.dir,'文章 草稿.md');fs.writeFileSync(file,'# 文章\n正文');
    await f.complete(task,'交付文件：`文章 草稿.md`',async(a,t)=>writeEvents(a,t,file));
    const done=f.service.current(task.id);assert.equal(done.status,'completed');assert.equal(done.delivery.status,'ready');
    const ref=done.delivery.files[0];assert.equal(ref.sessionId,task.targetSessionId);assert.equal(ref.path,file);assert(ref.version);assert(ref.bytes>0);
    const address=parseFileAddress(previewAddress(ref));assert.equal(address.sessionId,task.targetSessionId);assert(address.path.includes('文章 草稿.md'));
    const worker=f.agents.get(task.targetSessionId),presented=worker.session.snapshotEvents().filter(e=>e.type==='deliverables/presented');
    assert.equal(presented.length,1);assert.equal(presented[0].seq,ref.seq);assert.equal(presented[0].data.turn,1);
    const reply=f.sender.inbox.nextTurn[0];assert(reply.content[0].text.includes('原始交付坐标'));assert(reply.content[0].text.includes(task.targetSessionId));
    const fetched=await(await f.request(null,{url:'/naumi/bot-tasks?taskId='+task.id})).json();assert.deepEqual(fetched.messages[0].files,done.delivery.files);
    const reopened=new BotTaskStore(f.store.file);assert.deepEqual(reopened.read().tasks[0].delivery,done.delivery);await reopened.close();
    f.sender.session.append('turn/start',{turn:1});f.sender.session.append('user/message',reply,{surfaceOp:'append'});
    await f.service.runtime.mirror(f.sender.id,reply.id,done.delivery.files);await f.service.runtime.mirror(f.sender.id,reply.id,done.delivery.files);
    assert.equal(f.sender.session.snapshotEvents().filter(e=>e.type==='deliverables/presented').length,1);
    // Reconcile and lost outbox acknowledgement never create another attachment or execute work again.
    await f.service.observeTask(task.id);await f.store.change(d=>{d.outbox[0].delivered=false;return {value:null};});await f.service.settled();
    assert.equal(worker.session.snapshotEvents().filter(e=>e.type==='deliverables/presented').length,1);assert.equal(f.sender.inbox.nextTurn.length,1);
  }finally{await f.cleanup();}
});

test('file tasks with text-only completion fail delivery checking and retain the actual text',async()=>{
  const f=await botTaskHost();try{const task=await start(f);await f.complete(task,'我已经写好了 `missing.md`');const done=f.service.current(task.id);
    assert.equal(done.status,'failed');assert.equal(done.error,'BOT_DELIVERY_MISSING');assert.equal(done.delivery.status,'missing');assert.match(done.result,/写好了/);
    assert.equal(f.sender.inbox.nextTurn.length,1);assert.match(f.sender.inbox.nextTurn[0].content[0].text,/BOT_DELIVERY_MISSING/);
    const body={...input(f),output:'text'};await assert.rejects(f.service.dispatch(f.sender,body),/IDEMPOTENCY_CONFLICT/);
  }finally{await f.cleanup();}
});

test('missing, denied and outside-workspace file announcements cannot become valid deliveries',async()=>{
  for(const mode of ['missing','denied','outside']){
    const f=await botTaskHost();try{
      const task=await start(f),file=mode==='outside'?path.join(path.dirname(f.dir),'not-owned.md'):path.join(f.dir,'missing.md');
      if(mode==='denied')f.services.workspaceFiles.stat=async()=>{throw Error('READ_DENIED');};
      if(mode==='outside')f.services.workspaceFiles.stat=async()=>({absolutePath:file,version:'fixture',bytes:1});
      await f.complete(task,`交付：[文章](<${file}>)`,async(a,t)=>writeEvents(a,t,file));
      const done=f.service.current(task.id);assert.equal(done.status,'failed');assert.equal(done.error,'BOT_DELIVERY_UNAVAILABLE');
      assert.equal(f.agents.get(task.targetSessionId).session.snapshotEvents().filter(e=>e.type==='deliverables/presented').length,0);
    }finally{await f.cleanup();}
  }
});

test('explicit file result registers a native card but cannot complete before the actual turn end',async()=>{
  const f=await botTaskHost();try{
    const task=await start(f),file=path.join(f.dir,'explicit.md');fs.writeFileSync(file,'explicit');
    await f.complete(task,'交付已登记',async(agent,turn)=>{
      await assert.rejects(agent.tools.get('bot_task_reply').execute({taskId:task.id,idempotencyKey:'early',kind:'result',message:'完成'},{agent,signal:new AbortController().signal}),/FILES_REQUIRED/);
      const response=await agent.tools.get('bot_task_reply').execute({taskId:task.id,idempotencyKey:'files-1',kind:'result',message:'完成文章',files:[{path:file,description:'文章'}]},{agent,callId:'delivery-1',signal:new AbortController().signal});
      assert.equal(response.awaitingTurnEnd,true);assert.equal(f.service.current(task.id).status,'running');
      assert.equal(references(agent.session.snapshotEvents(),agent.id,turn).length,1);
      const tool=agent.tools.get('bot_task_reply'),args={taskId:task.id,idempotencyKey:'files-1',kind:'result',message:'完成文章',files:[{path:file,description:'文章'}]};
      await Promise.all(Array.from({length:4},(_,i)=>tool.execute(args,{agent,callId:'retry-'+i,signal:new AbortController().signal})));
      assert.equal(agent.session.snapshotEvents().filter(e=>e.type==='deliverables/presented').length,1);
      await assert.rejects(tool.execute({...args,files:[{path:file,description:'different'}]},{agent,callId:'conflict',signal:new AbortController().signal}),/IDEMPOTENCY_CONFLICT/);
      await assert.rejects(tool.execute({...args,idempotencyKey:'cancelled'},{agent,callId:'cancelled',signal:AbortSignal.abort()}),{name:'AbortError'});
      await agent.tools.get('bot_task_reply').execute({taskId:task.id,idempotencyKey:'registered',kind:'result',message:'完成'},{agent,signal:new AbortController().signal});
      assert.equal(f.service.current(task.id).status,'running');
    });assert.equal(f.service.current(task.id).status,'completed');assert.equal(f.service.current(task.id).delivery.files[0].description,'文章');
  }finally{await f.cleanup();}
});

test('native present remains authoritative, different turns and forged relay coordinates are rejected',async()=>{
  const f=await botTaskHost();try{
    const task=await start(f),file=path.join(f.dir,'native.md');fs.writeFileSync(file,'native');
    await f.complete(task,'正文完成',async(agent,turn)=>registerFiles(agent.session,turn,[{path:file,description:'原始文件'}],'native-present'));
    const refs=f.service.current(task.id).delivery.files;assert.equal(refs.length,1);assert.equal(f.agents.get(task.targetSessionId).session.snapshotEvents().filter(e=>e.type==='deliverables/presented').length,1);
    const reply=f.sender.inbox.nextTurn[0];f.sender.session.append('turn/start',{turn:1});f.sender.session.append('user/message',reply,{surfaceOp:'append'});
    await assert.rejects(f.service.runtime.mirror(f.sender.id,reply.id,[{...refs[0],seq:99999}]),/REFERENCE_MISMATCH/);
    assert.equal(f.sender.session.snapshotEvents().filter(e=>e.type==='deliverables/presented').length,0);
    assert.deepEqual(references(f.agents.get(task.targetSessionId).session.snapshotEvents(),task.targetSessionId,2),[]);
    fs.unlinkSync(file);await f.service.runtime.mirror(f.sender.id,reply.id,refs);assert(fs.existsSync(refs[0].snapshot.path));
  }finally{await f.cleanup();}
});

test('direct Bot work also publishes announced deliverables without a delegated task',async()=>{
  const f=await botTaskHost();try{
    const file=path.join(f.dir,'direct.md');fs.writeFileSync(file,'direct');
    await f.complete({targetSessionId:f.target.id},'交付文件：`direct.md`',async(a,t)=>writeEvents(a,t,file));
    const refs=await f.service.runtime.publishTurn(f.target.id,1);assert.equal(refs.length,1);assert.equal(f.store.read().tasks.length,0);
    assert(DELIVERY_PROMPT.includes('output="files"'));
  }finally{await f.cleanup();}
});

test('same-turn native deliveries do not leak from old turns and cross-workspace relay keeps the source authoritative',async()=>{
  const f=await botTaskHost();try{
    const task=await start(f),file=path.join(f.dir,'private.md');fs.writeFileSync(file,'source');
    await f.complete(task,'完成',async(a,t)=>registerFiles(a.session,t,[{path:file}],'present-1'));
    const refs=f.service.current(task.id).delivery.files,reply=f.sender.inbox.nextTurn[0];
    // New immutable snapshots are explicitly verified and copied into the recipient workspace.
    const otherRoot=path.join(f.dir,'other');fs.mkdirSync(otherRoot);
    f.sender.session=Session.create(SessionId(f.sender.id),f.sender.session.snapshotEvents(),{...f.sender.session.header,cwd:otherRoot});
    f.sender.session.append('turn/start',{turn:1});f.sender.session.append('user/message',reply,{surfaceOp:'append'});
    await f.service.runtime.mirror(f.sender.id,reply.id,refs);
    const mirrored=f.sender.session.snapshotEvents().filter(e=>e.type==='deliverables/presented');assert.equal(mirrored.length,1);assert(mirrored[0].data.files[0].path.startsWith(otherRoot));assert.equal(fs.readFileSync(mirrored[0].data.files[0].path,'utf8'),'source');
    const forged=refs.map(r=>({...r,path:path.join(f.dir,'another.md')}));
    await assert.rejects(f.service.runtime.verifyVersion(forged[0]),/REFERENCE/);
    assert(reply.content[0].text.includes(previewAddress(refs[0])));
    const worker=f.agents.get(task.targetSessionId);worker.session.append('turn/start',{turn:2});worker.session.append('user/message',{id:'new-request',role:'user',source:{kind:'user'},content:[{type:'text',text:'另一任务'}]},{surfaceOp:'append'});
    worker.session.append('turn/end',{turn:2,reason:{kind:'completed'}});
    assert.equal((await f.service.runtime.delivery(worker.id,'new-request','files')).status,'missing');
  }finally{await f.cleanup();}
});
