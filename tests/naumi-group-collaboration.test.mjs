import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {BotGroupStore} from '../plugins/naumi-enterprise/bot-group-store.js';
import {BotGroupService} from '../plugins/naumi-enterprise/bot-group-service.js';
import {taskFixture} from './helpers/bot-task-fixture.mjs';
import {botTaskHost} from './helpers/bot-task-host.mjs';
import {botGroupHttpFixture} from './helpers/bot-group-http.mjs';
import {extendNativeComposer,NATIVE_COMPOSER_SHA} from '../scripts/native-composer-extension.mjs';
import {groupTimeline,roomWorking,groupReplyView,watchGroupReplies} from '../plugins/naumi-enterprise/assets/bot-chat-model.js';

async function setup(){
  const f=await taskFixture(),file=path.join(f.dir,'groups.sqlite');let store=new BotGroupStore(file),groups;
  const room=store.create({id:randomUUID(),name:'协作验收',botIds:[f.sourceBot.id,f.targetBot.id],defaultBotId:f.sourceBot.id},()=>{});
  f.directory.groupSessionOwner=id=>store.member(id)?.botId;
  f.runtime.snapshot=async id=>f.sessions.get(id);
  const open=()=>new BotGroupService({directory:f.directory,store,getTasks:()=>f.service});groups=open();
  await groups.prepare(room.id);const source=f.agents.get(room.members[0].sessionId);
  return {f,room,source,get groups(){return groups;},get store(){return store;},
    async reopen(){await groups.close();store=new BotGroupStore(file);groups=open();},
    async cleanup(){await groups.close();await f.cleanup();}};
}

test('group observes durable acceptance, genuine worker feedback and files without waiting or copying task state',async()=>{
  const x=await setup(),{f,room,source}=x;try{
    const t=await f.service.dispatch(source,f.input({replyMode:'background'}));await f.service.settled();
    const before=f.store.read().revision;
    const accepted=x.groups.read(room.id);assert.equal(accepted.activity[0].type,'task-state');assert.equal(accepted.activity[0].status,'running');
    assert(!accepted.activity.some(a=>a.text));assert.equal(f.store.read().revision,before,'read projection is not a new task write');
    const worker=f.agents.get(t.targetSessionId);
    await f.service.reply(worker,{taskId:t.id,idempotencyKey:'ack',kind:'progress',message:'先梳理商品卖点，再写三个标题。'});
    assert.equal(x.groups.read(room.id).activity.filter(a=>a.kind==='progress').length,1);
    assert.equal(f.deliveries.filter(d=>d.sessionId===source.id).length,0,'progress does not wake manager');
    const p=x.groups.post({id:randomUUID(),roomId:room.id,text:'同时聊一下下周排期',botIds:[f.targetBot.id]});await x.groups.kick();
    assert.equal(x.groups.read(room.id).posts.find(row=>row.id===p.id).replies[0].botId,f.targetBot.id);
    assert.notEqual(room.members[1].sessionId,t.targetSessionId,'reception and work remain separate');
    assert.equal(f.service.current(t.id).status,'running');
    await f.finish(t,{text:'最终标题与文案'});
    const final=x.groups.read(room.id);assert.equal(final.activity.filter(a=>a.kind==='result').length,1);
    assert.equal(final.activity.find(a=>a.kind==='result').botId,f.targetBot.id);
    assert.equal(final.activity.filter(a=>a.type==='relay').length,1,'source followup gets its own exact message binding');
    const stable=JSON.stringify(final.activity);await x.reopen();assert.equal(JSON.stringify(x.groups.read(room.id).activity),stable);
  }finally{await x.cleanup();}
});

test('selected task goes to its original dispatcher and continues the same work; CAS/idempotency/isolation remain enforced',async()=>{
  const x=await setup(),{f,room,source}=x;try{
    const original=await f.service.dispatch(source,f.input({replyMode:'background'}));await f.service.settled();
    const workerId=original.targetSessionId,id=randomUUID();
    const post={id,roomId:room.id,text:'@'+f.targetBot.name+' 改成突出材质，不写价格',botIds:[],taskId:original.id};
    x.groups.post(post);assert.deepEqual(x.groups.post(post),{id,seq:1});await x.groups.kick();
    const reply=x.groups.read(room.id).posts[0].replies[0];assert.equal(reply.sessionId,source.id);
    const context=JSON.parse(x.groups.context(source.id).split('\n').at(-1));assert.equal(context.tasks[0].id,original.id);assert.equal(context.tasks[0].selected,true);
    assert.throws(()=>x.groups.post({...post,taskId:'private'}),/CONFLICT/);
    const request={taskId:original.id,expectedRevision:f.service.current(original.id).revision,idempotencyKey:'material',message:post.text};
    await f.service.continue(source,request);await f.service.continue(source,request);await f.service.settled();
    assert.equal(f.store.read().tasks.length,1);assert.equal(f.service.current(original.id).targetSessionId,workerId);assert.equal(f.service.current(original.id).attempt,1);
    assert.equal(f.store.read().outbox.filter(m=>m.toSessionId===workerId).length,1);
    assert.equal(f.deliveries.findLast(d=>d.sessionId===workerId).mode,'steer');
    await assert.rejects(f.service.continue(source,{...request,idempotencyKey:'stale'}),/CONFLICT/);
    await assert.rejects(f.service.continue(f.sender,{...request,expectedRevision:f.service.current(original.id).revision,idempotencyKey:'other-session'}),/SESSION_REQUIRED/);
    const other=x.groups.create({id:randomUUID(),name:'另一个群',botIds:[f.sourceBot.id,f.targetBot.id],defaultBotId:f.sourceBot.id});
    assert.equal(x.groups.read(other.id).activity.length,0);
    assert.throws(()=>x.groups.post({...post,id:randomUUID(),roomId:other.id}),/TASK_NOT_FOUND/);
    assert.throws(()=>x.groups.post({...post,id:randomUUID(),botIds:[f.targetBot.id]}),/RECIPIENT_CONFLICT/);
  }finally{await x.cleanup();}
});

test('interrupting a queued or current group reply never cancels its independent task or a different room',async()=>{
  const x=await setup(),{f,room,source}=x;try{
    const t=await f.service.dispatch(source,f.input());await f.service.settled();
    x.groups.post({id:randomUUID(),roomId:room.id,text:'说一下安排',botIds:[]});await x.groups.kick();
    let cancelled=0;f.runtime.interrupt=async(sessionId,messageId)=>{cancelled++;assert.equal(sessionId,source.id);const s=f.sessions.get(sessionId);s.running=false;s.messages.get(messageId).end={kind:'aborted',reason:{kind:'user'}};return {interrupted:true};};
    const reply=x.groups.read(room.id).posts[0].replies[0];await x.groups.interrupt(room.id,reply.id);
    assert.equal(cancelled,1);assert.equal(x.groups.read(room.id).posts[0].replies[0].state,'cancelled');
    assert.equal(f.service.current(t.id).status,'running');assert.equal(f.runtime.isRunning(t.targetSessionId),true);
    await assert.rejects(x.groups.interrupt(randomUUID(),reply.id),/REPLY_NOT_FOUND/);
    await x.groups.interrupt(room.id,reply.id);assert.equal(cancelled,1);
  }finally{await x.cleanup();}
});

test('attachments and task reference persist together and changed UUID retries fail without rewriting history',async()=>{
  const x=await setup(),{room}=x;try{
    const req={id:randomUUID(),roomId:room.id,text:'看附件',botIds:[],attachments:[{type:'file',file:{name:'brief.md'}}],requestAttachments:[{type:'file',receiptId:'receipt-1'}]};
    x.groups.post(req);await x.groups.kick();await x.reopen();
    assert.deepEqual(x.groups.read(room.id).posts[0].attachments,req.attachments);
    assert.throws(()=>x.groups.post({...req,requestAttachments:[{type:'file',receiptId:'receipt-2'}]}),/CONFLICT/);
  }finally{await x.cleanup();}
});

test('native preparation is owner/same-origin only, creates no model turn; exact-reply stop rejects foreign identities',async t=>{
  const f=await botGroupHttpFixture();t.after(()=>f.close());const headers={'x-naumi-bot-groups':'1',origin:'http://localhost'},id=randomUUID();
  await f.call('/naumi/bot-groups',{headers,body:{action:'create',id,name:'输入区',botIds:['bot-0','bot-1'],defaultBotId:'bot-0'}});
  const prepare={action:'prepare',roomId:id};assert.equal((await f.call('/naumi/bot-groups',{body:prepare})).status,403);
  const ready=await f.call('/naumi/bot-groups',{headers,body:prepare});assert.equal(ready.status,200);assert.equal(f.receipts.size,0);
  assert.equal((await f.call('/naumi/bot-groups',{headers,body:{action:'interrupt',roomId:id,replyId:randomUUID()}})).status,400);
  assert.equal((await f.call('/naumi/bot-groups',{headers,body:{action:'post',id:randomUUID(),roomId:id,text:'',botIds:[]}})).status,400);
});

test('timeline interleaves actual background feedback with new topics, and task work keeps group activity alive',()=>{
  const posts=[{id:'p',seq:1,text:'新话题',createdAt:'2026-11-17T10:00:02Z',replies:[]}],activity=[{id:'a',createdAt:'2026-11-17T10:00:01Z',type:'task-message',text:'实际进度'},{id:'b',createdAt:'2026-11-17T10:00:03Z',type:'task-message',text:'最终结果'}];
  assert.deepEqual(groupTimeline(posts,activity).map(r=>r.id),['a','p','b']);assert.equal(roomWorking({posts,tasks:[{status:'running'}]}),true);assert.equal(roomWorking({posts,tasks:[{status:'completed'}]}),false);
});

test('relayed source response is matched by native message ID rather than its presentation ID',async()=>{
  const entries=[{type:'turn/start',data:{turn:3}},{type:'user/message',data:{id:'outbox-message'}},{type:'assistant/message',data:{turn:3,message:{content:[{type:'text',text:'主管根据原稿做的总结'}]}}}];let result;
  const stop=watchGroupReplies({sessions:{retain(){return {ready:Promise.resolve({eventSource:{getSnapshot:()=>({entries}),subscribe:()=>()=>{}}}),release(){}};}}},[{id:'relay:message',messageId:'outbox-message',sessionId:'s',state:'observing'}],v=>result=v,{schedule:fn=>setTimeout(fn,0),cancel:clearTimeout});
  await new Promise(r=>setTimeout(r,20));assert.equal(result['relay:message'].text,'主管根据原稿做的总结');assert.equal(groupReplyView(entries,'another-message','s').text,'');stop();
});

test('native extension preserves actual InputBar and normal send path; group has no second editor/send implementation',()=>{
  const file='node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',installed=fs.readFileSync(file,'utf8');
  const source=installed.includes('Naumi scoped composer transport v1')?fs.readFileSync(file+'.naumi-original','utf8'):installed;
  assert.equal(createHash('sha256').update(source).digest('hex'),NATIVE_COMPOSER_SHA);
  const patched=extendNativeComposer(source);assert.equal(extendNativeComposer(patched),patched);assert.throws(()=>extendNativeComposer(source+' '),/UPSTREAM_CHANGED/);
  assert(patched.includes("name:'naumi.native.composer.bar'"));assert(patched.includes('(InputBar,{...props,useSession})'));assert(patched.includes('bindGroupDraft(actions.setDraft)'));
  assert(patched.includes('const result = await Promise.race([session.prompt(content, mode, signal, submission.requestId), acceptance.promise])'));
  const ui=fs.readFileSync('plugins/naumi-enterprise/assets/bot-groups.js','utf8');assert(!ui.includes("h('textarea'"));assert(!ui.includes('nbc-composer'));assert(ui.includes("native.renderFactorySlot('naumi.group.composer'"));
});

test('accepted native attachment retries use saved request identity without consuming staged receipts twice',async t=>{
  const f=await botGroupHttpFixture();t.after(()=>f.close());const headers={'x-naumi-bot-groups':'1',origin:'http://localhost'},roomId=randomUUID();let admissions=0,commits=0;
  f.runtime.admitGroupAttachments=async(_sessionId,parts)=>{admissions++;assert.equal(parts[0].receiptId,'uploaded-1');return {content:[{type:'file',file:{name:'brief.md'}}],commit:()=>commits++,dispose(){}};};
  await f.call('/naumi/bot-groups',{headers,body:{action:'create',id:roomId,name:'附件验收',botIds:['bot-0','bot-1'],defaultBotId:'bot-0'}});
  const body={action:'post',id:randomUUID(),roomId,text:'',botIds:[],attachments:[{type:'file',receiptId:'uploaded-1'}]};
  assert.equal((await f.call('/naumi/bot-groups',{headers,body})).status,202);
  assert.equal((await f.call('/naumi/bot-groups',{headers,body})).status,202);assert.equal(admissions,1);assert.equal(commits,1);
  assert.equal((await f.call('/naumi/bot-groups',{headers,body:{...body,attachments:[{type:'file',receiptId:'other'}]}})).status,409);
});

test('native interrupt matches exact turn and uses keepInbox, leaving later input and task state untouched',async()=>{
  const f=await botTaskHost();try{
    const a=f.sender;a.session.append('turn/start',{turn:1});a.session.append('user/message',{id:'group-reply',role:'user',source:{kind:'user'},content:[{type:'text',text:'接待回复'}]},{surfaceOp:'append'});a.status='running';
    let cancels=0;a.cancel=(cause,options)=>{cancels++;assert.equal(cause.kind,'user');assert.equal(options.keepInbox,true);
      const data={turn:1,reason:{kind:'aborted',reason:{kind:'user'}}};a.session.append('turn/end',data);a.status='idle';f.ctx.emit('session/event',a.session,{type:'turn/end',data});};
    a.followup({id:'later-input',role:'user',source:{kind:'user'},content:[{type:'text',text:'下一个话题'}]});
    assert.deepEqual(await f.service.runtime.interrupt(a.id,'wrong-message'),{interrupted:false});
    assert.deepEqual(await f.service.runtime.interrupt(a.id,'group-reply'),{interrupted:true});assert.equal(cancels,1);assert.equal(a.inbox.nextTurn[0].id,'later-input');
    assert.deepEqual(await f.service.runtime.interrupt(a.id,'group-reply'),{interrupted:false});assert.equal(cancels,1);
    assert.equal(f.store.read().tasks.length,0);
  }finally{await f.cleanup();}
});

test('runtime group attachments reuse native admission and reject receipts staged for a different Session',async()=>{
  const f=await botTaskHost();let commits=0,disposes=0;try{
    const layer=await f.ctx.plugin({name:'fixture-upload-admission',apply(scope){
      scope.provide('fileUploads',{resolve:(agent,id)=>agent.id===f.sender.id&&id==='upload'?{type:'file',file:{name:'brief.md'}}:undefined,
        bindPrompt:()=>({commit:()=>commits++,[Symbol.dispose]:()=>disposes++})});
      scope.provide('attachments',{admitPromptContent:async parts=>parts});
    }});
    const ready=await f.service.runtime.admitGroupAttachments(f.sender.id,[{type:'file',receiptId:'upload'}],'request-1');
    assert.equal(ready.content[0].file.name,'brief.md');ready.commit();ready.dispose();assert.equal(commits,1);assert.equal(disposes,1);
    await assert.rejects(f.service.runtime.admitGroupAttachments(f.target.id,[{type:'file',receiptId:'upload'}],'request-2'),/NOT_STAGED/);
    await layer.dispose();
  }finally{await f.cleanup();}
});
