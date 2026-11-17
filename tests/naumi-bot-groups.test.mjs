import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {BotGroupService,mentionedBots} from '../plugins/naumi-enterprise/bot-group-service.js';
import {BotGroupStore} from '../plugins/naumi-enterprise/bot-group-store.js';

function fixture(t, options={}) {
  const home = mkdtempSync(join(tmpdir(),'naumi-bot-groups-'));
  const file = join(home,'groups.sqlite');
  const bots = ['策划','运营','运营组','审稿'].map((name,index) => ({id:`bot-${index}`,name,status:'active',cwd:home}));
  const deliveries = [], tasks = [], sessions = new Map(), receipts = new Map();
  const directory = {list:() => ({bots}),forSession:sessionId => bots.find(bot => bot.id === store.member(sessionId)?.botId)};
  const runtime = {
    profile:async bot => ({model:{model:bot.id}}),
    snapshot:async id => sessions.get(id),
    ensure:async (id,input) => { sessions.set(id,input); },
    inspect:async (_sessionId,id) => receipts.get(id),
    deliver:async input => {
      assert.equal(input.mode,'followup'); assert.equal(input.fromUser,true);
      deliveries.push(input);
      const receipt = {seen:true,pending:true}; receipts.set(input.messageId,receipt); return receipt;
    },
  };
  let store, service;
  const open = () => {
    store = new BotGroupStore(file);
    service = new BotGroupService({store,directory,getTasks:() => ({runtime,store:{read:() => ({tasks})}}),...options});
  };
  open();
  t.after(async () => { if (!service.closed) await service.close(); rmSync(home,{recursive:true,force:true}); });
  return {get service(){return service;},get store(){return store;},bots,deliveries,tasks,receipts,sessions,
    reopen:async () => { await service.close(); open(); },
    create(data={}) { return service.create({id:randomUUID(),name:'上新讨论',botIds:bots.slice(0,3).map(bot => bot.id),defaultBotId:bots[0].id,...data}); },
    post(room,text,botIds=[],id=randomUUID()) { return service.post({id,roomId:room.id,text,botIds}); },
  };
}

test('mentions prefer the longest name and exclude paths, email, code and links',()=>{
  const bots = [{id:'1',name:'运营'},{id:'2',name:'运营组'},{id:'3',name:'Review'}];
  assert.deepEqual(mentionedBots('请@运营组、@运营 @review；重复 @运营',bots),['2','1','3']);
  assert.deepEqual(mentionedBots('`@运营` ```\n@运营组\n``` [@运营](x) a@Review.test @运营/a @运营计划',bots),[]);
});

test('existing IDs, optional default and request replay govern group membership and routing',async t=>{
  const f = fixture(t), groupId = randomUUID();
  const room = f.create({id:groupId});
  assert.deepEqual(f.create({id:groupId}),room);
  assert.throws(() => f.create({id:groupId,name:'旧群重写'}),/BOT_GROUP_CONFLICT/);
  assert.throws(() => f.create({defaultBotId:f.bots[3].id}),/BOT_GROUP_DEFAULT_NOT_MEMBER/);
  assert.throws(() => f.create({botIds:[f.bots[0].id,'unknown']}),/BOT_GROUP_MEMBER_UNAVAILABLE/);
  const requestId = randomUUID();
  assert.deepEqual(f.post(room,'讨论这件商品',[],requestId),f.post(room,'讨论这件商品',[],requestId));
  assert.throws(() => f.post(room,'重复执行',[],requestId),/BOT_GROUP_CONFLICT/);
  await f.service.kick();
  const noDefault = f.create({defaultBotId:null});
  assert.throws(() => f.post(noDefault,'普通消息'),/BOT_GROUP_MENTION_REQUIRED/);
  assert.throws(() => f.post(room,'越权点名',[f.bots[3].id]),/BOT_GROUP_MEMBER_UNAVAILABLE/);
  assert.equal(f.deliveries.length,1);
  assert.equal(f.deliveries[0].sessionId,room.members[0].sessionId);
});

test('one turn per group-member session while different members receive their own messages',async t=>{
  const f = fixture(t), room = f.create();
  f.post(room,'请 @运营 和 @运营组 各自判断');
  f.post(room,'@运营 后续问题');
  await f.service.kick();
  assert.equal(f.deliveries.length,2);
  assert.deepEqual(new Set(f.deliveries.map(d => d.sessionId)),new Set(room.members.slice(1).map(member => member.sessionId)));
  assert.equal(f.deliveries[0].text,'请 @运营 和 @运营组 各自判断');
  f.receipts.set(f.deliveries[0].messageId,{seen:true,consumed:true,end:{kind:'completed'},text:'运营判断'});
  await f.service.kick();
  assert.equal(f.deliveries.length,3);
  assert.equal(f.deliveries[2].sessionId,room.members[1].sessionId);
  assert.equal(f.service.read(room.id).posts[0].replies[0].text,'运营判断');
});

test('a renamed member keeps its session and an archived member is never routed',async t=>{
  const f = fixture(t), room = f.create();
  f.bots[1].name = '编辑';
  f.post(room,'@编辑 请给意见');
  await f.service.kick();
  assert.equal(f.deliveries[0].sessionId,room.members[1].sessionId);
  f.bots[1].status = 'archived';
  assert.throws(() => f.post(room,'@编辑 再看一遍'),/BOT_GROUP_MEMBER_UNAVAILABLE/);
});

test('restart replays only a parked inbox message and never repeats an uncertain or completed turn',async t=>{
  const f = fixture(t), room = f.create();
  f.post(room,'@策划 @运营 @运营组 看附件');
  await f.service.kick();
  const [done,unknown,parked] = f.deliveries.map(x => x.messageId);
  f.receipts.set(done,{seen:true,consumed:true,end:{kind:'completed'},text:'已经回复'});
  f.receipts.set(unknown,{seen:true,consumed:true});
  await f.reopen();
  await f.service.kick();
  assert.deepEqual(f.deliveries.map(row => row.messageId),[done,unknown,parked,parked]);
  const replies = f.service.read(room.id).posts[0].replies;
  assert.deepEqual(replies.map(reply => reply.state),['completed','interrupted','sent']);
  assert.equal(replies[0].text,'已经回复');
});

test('group history stays isolated and only tasks dispatched by its own sessions are projected',async t=>{
  const f = fixture(t), room = f.create(), other = f.create({name:'另一个群'});
  f.post(room,'波司登项目的备注');
  await f.service.kick();
  assert.doesNotMatch(f.service.context(other.members[0].sessionId),/波司登/);
  const task = {id:'task-1',sourceSessionId:room.members[0].sessionId,targetBotId:f.bots[1].id,targetSessionId:'session-task',
    status:'completed',attempt:1,task:'撰写文案',result:'已交付',delivery:{files:[{sessionId:'session-task',path:'稿件.md',seq:4,index:0}]}};
  f.tasks.push(task,{...task,id:'task-private',sourceSessionId:'session-direct'});
  assert.deepEqual(f.service.read(room.id).tasks.map(row => row.id),['task-1']);
  assert.equal(f.service.read(other.id).tasks.length,0);
  await f.reopen(); await f.service.kick();
  assert.equal(f.service.read(room.id).tasks[0].files[0].path,'稿件.md');
  assert.equal(f.service.read(room.id).tasks.length,1);
});
