import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {verifyHandoffFiles} from '../plugins/naumi-enterprise/bot-deliverables.js';
import {BotTaskService} from '../plugins/naumi-enterprise/bot-task-service.js';
import {BotTaskStore} from '../plugins/naumi-enterprise/bot-task-store.js';

const version = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture(t) {
  const home=await mkdtemp(path.join(tmpdir(),'naumi-task-handoff-'));
  const bots=['sender','writing','review','outsider'].map(id=>({id,status:'active',cwd:home}));
  const agents=new Map(),owners=new Map(),sessions=new Map(),delivered=[],errors=[];
  const directory={list:()=>({bots}),forSession:id=>owners.get(id),async bind(id,sessionId){owners.set(sessionId,bots.find(bot=>bot.id===id));}};
  function agent(id,bot){
    const events=[],session={id,header:{cwd:bot?.cwd??home},snapshotEvents:()=>events};
    const value={id,session};agents.set(id,value);sessions.set(id,{header:session.header,events,receipts:new Map()});
    if(bot)owners.set(id,bot);
    return value;
  }
  const sender=agent('original-sender',bots[0]),elsewhere=agent('other-sender-session',bots[0]),writer=agent('writer-home',bots[1]);
  const ctx={agentTeams:{membership(value){assert.equal(agents.get(value.id),value);return {root:value,role:'lead'};}}};
  const files={workspaceFiles:{async stat(_scope,name){
    const absolutePath=path.resolve(name),bytes=await readFile(absolutePath);
    return {absolutePath,version:version(bytes),bytes:bytes.length};
  }}};
  const runtime={
    async profile(){return {model:{provider:'fixture',model:'test'},permissions:[]};},
    async ensure(id,{cwd=home}={}){
      if(!agents.has(id)){const value=agent(id);value.session.header.cwd=cwd;}
      return agents.get(id);
    },
    async inspect(id,messageId){return sessions.get(id)?.receipts.get(messageId)??null;},
    isRunning:()=>false,
    async deliver(request){
      const session=sessions.get(request.sessionId);
      if(!session.receipts.has(request.messageId)){
        const receipt={seen:true,pending:false,consumed:true,turn:session.receipts.size+1};
        session.receipts.set(request.messageId,receipt);delivered.push(request);
      }
      return session.receipts.get(request.messageId);
    },
    async delivery(_sessionId,_messageId,requirement){return {requirement,status:requirement==='files'?'ready':'not_required',files:requirement==='files'?[fileRef]:[]};},
    verifyHandoff:(id,refs)=>verifyHandoffFiles(files,async sessionId=>sessions.get(sessionId),id,refs,AbortSignal.timeout(1000)),
    async cancel(){},async close(){},
  };
  let store,service,fileRef;
  const open=()=>{store=new BotTaskStore(path.join(home,'ledger.json'));service=new BotTaskService({ctx,directory,store,runtime,onError:error=>errors.push(error)});};
  open();
  t.after(async()=>{await service.close();assert(path.resolve(home).startsWith(path.resolve(tmpdir())+path.sep));await rm(home,{recursive:true,force:true});});
  function prompt(fullText,turn=1,kind='user'){
    sessions.get(sender.id).events.push({type:'turn/start',data:{turn}},{type:'user/message',data:{id:`user-${turn}`,source:{kind},content:[{type:'text',text:fullText}]}});
  }
  async function complete(task,text,content){
    await service.settled();
    const current=service.current(task.id),session=sessions.get(task.targetSessionId),receipt=session.receipts.get(current.messageId);
    assert(receipt,'task must be delivered');
    if(content!==undefined){
      const file=path.join(home,'original-draft.md'),seq=session.events.length+1;
      await writeFile(file,content,'utf8');fileRef={sessionId:task.targetSessionId,seq,index:0,turn:receipt.turn,path:file,version:version(content)};
      session.events.push({type:'deliverables/presented',seq,data:{turn:receipt.turn,files:[{path:file}]}});
    }
    Object.assign(receipt,{end:{kind:'completed'},text});
    await service.observeTask(task.id);await service.settled();return service.current(task.id);
  }
  const start=(extra={})=>service.dispatch(sender,{targetBotId:'writing',task:'撰写上新文案',output:'files',idempotencyKey:'write',...extra},{callId:'submit'});
  const review=(task,extra={},who=sender)=>service.dispatch(who,{targetBotId:'review',task:'打开原稿并审核，列出缺失证据',handoffTaskId:task.id,handoffRevision:task.revision,idempotencyKey:'review',...extra},{callId:'review'});
  return {sender,elsewhere,writer,bots,delivered,errors,prompt,complete,start,review,get service(){return service;},
    async restart(){await service.settled();await service.close();open();await service.recover();await service.settled();}};
}

test('after restart a different Bot receives the actual revised artifact, latest criteria and original user evidence',async t=>{
  const f=await fixture(t);
  const initial='写一份上新文案，重点说明价格。';
  f.prompt(initial);
  const first=await f.start({goal:'为新品上线准备文案',acceptance:['解释活动价']});
  const draft=await f.complete(first,'价格初稿已生成','# 初稿\n活动价 100 元');
  const corrected='改成突出材质，缺检测报告就说明。';
  f.prompt(corrected,2);
  const revision=await f.service.continue(f.sender,{taskId:first.id,expectedRevision:draft.revision,idempotencyKey:'change-material',
    message:'突出材质，并列出未验证的材料依据',acceptance:['说明材质','指出缺失的检测报告']},{callId:'amend'});
  assert.equal(revision.targetSessionId,first.targetSessionId);
  const final=await f.complete(first,'材质初稿已生成','# 初稿\n使用棉麻材质，待查检测报告');
  assert.equal(final.attempt,2);
  await f.restart();
  f.prompt('请把原稿交给审稿 Bot。',3);
  const submissions=await Promise.all(Array.from({length:6},()=>f.review(final)));
  const review=submissions[0];
  assert(submissions.every(item=>item.id===review.id));
  await f.service.settled();
  assert.equal(f.service.list(f.sender).length,2);
  assert.notEqual(review.id,first.id);
  assert.notEqual(review.targetSessionId,first.targetSessionId);
  assert.deepEqual(review.handoff.acceptance,['说明材质','指出缺失的检测报告']);
  assert.equal(review.handoff.source.text,initial);
  assert.equal(review.handoff.amendment.source.text,corrected);
  assert.equal(review.handoff.amendment.source.messageId,'user-2');
  assert.match(await readFile(review.handoff.files[0].path,'utf8'),/棉麻材质/);
  const messages=f.delivered.filter(item=>item.sessionId===review.targetSessionId);
  assert.equal(messages.length,1);
  assert.match(messages[0].text,/dsh-resource:\/\/file\/session\//);
  assert.match(messages[0].text,/指出缺失的检测报告/);
  await f.complete(review,'原稿已核对，仍缺检测报告');
  await f.restart();
  assert.match(f.service.current(review.id).result,/仍缺检测报告/);
  assert.equal(f.service.current(first.id).result,'材质初稿已生成');
  assert.equal(f.delivered.filter(item=>item.sessionId===review.targetSessionId).length,1);
  assert.deepEqual(f.errors,[]);
});

test('handoff requires the original sending Session, a completed current revision and a distinct reviewer',async t=>{
  const f=await fixture(t);
  const writer=await f.start();
  await f.service.settled();
  await assert.rejects(f.review(f.service.current(writer.id)),/BOT_HANDOFF_SOURCE_NOT_COMPLETED/);
  const done=await f.complete(writer,'已交付','初稿');
  await assert.rejects(f.review(done,{},f.elsewhere),/BOT_TASK_SESSION_REQUIRED/);
  await assert.rejects(f.review(done,{},f.writer),/BOT_TASK_SENDER_REQUIRED/);
  await assert.rejects(f.review(done,{handoffRevision:done.revision-1}),/BOT_TASK_CONFLICT/);
  await assert.rejects(f.review(done,{targetBotId:'writing'}),/BOT_HANDOFF_DIFFERENT_BOT_REQUIRED/);
  assert.equal(f.service.list(f.sender).length,1);
});

test('changed file bytes stop the reviewer before it receives any task message',async t=>{
  const f=await fixture(t);
  const requested=await f.start();
  const done=await f.complete(requested,'已交付','真实原稿');
  await writeFile(done.delivery.files[0].path,'其他文件内容','utf8');
  const review=await f.review(done);
  await f.service.settled();
  assert.equal(f.service.current(review.id).error,'BOT_HANDOFF_FILE_STALE');
  assert.equal(f.service.current(review.id).status,'failed');
  assert(!f.delivered.some(item=>item.sessionId===review.targetSessionId));
});

test('handoff cannot pass an original file outside the reviewer workspace',async t=>{
  const f=await fixture(t);
  const requested=await f.start();
  const done=await f.complete(requested,'已交付','真实原稿');
  const reviewer=f.bots.find(bot=>bot.id==='review');
  reviewer.cwd=path.join(reviewer.cwd,'restrict-review-scope');
  const review=await f.review(done);
  await f.service.settled();
  assert.equal(f.service.current(review.id).error,'BOT_HANDOFF_FILE_SCOPE');
  assert(!f.delivered.some(item=>item.sessionId===review.targetSessionId));
});

test('relay messages cannot be recorded as user evidence and optional fields preserve idempotency',async t=>{
  const f=await fixture(t);
  f.prompt('自动代理消息',1,'agent-message');
  const initial=await f.start({acceptance:['完整文案']});
  assert.equal(initial.intent.source,undefined);
  assert.equal((await f.start({acceptance:['完整文案']})).id,initial.id);
  await assert.rejects(f.start({acceptance:['换验收清单']}),/BOT_TASK_IDEMPOTENCY_CONFLICT/);
});
