import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {botGroupHttpFixture} from './helpers/bot-group-http.mjs';

const endpoint = '/naumi/bot-groups';
const headers = {'x-naumi-bot-groups':'1',origin:'http://localhost'};
const createRoom = () => ({action:'create',id:randomUUID(),name:'产品讨论',botIds:['bot-0','bot-1'],defaultBotId:null});

test('group HTTP handler enforces owner, same-origin writes, schema and body limits',async t => {
  const fixture = await botGroupHttpFixture();
  t.after(() => fixture.close());
  const body = createRoom();
  for (const [options,expected] of [
    [{principal:null},401],[{principal:'member'},403],[{body},403],
    [{body,headers:{...headers,origin:'https://example.invalid'}},403],
    [{body:{...body,unrecognized:true},headers},400],
    [{body:'{',headers},400],[{body:'x'.repeat(65537),headers},413],
    [{method:'DELETE'},405],
  ]) assert.equal((await fixture.call(endpoint,options)).status,expected);
  assert.equal((await fixture.call(`${endpoint}?roomId=invalid`)).status,400);
  assert.equal((await fixture.call(`${endpoint}?roomId=${body.id}&before=0`)).status,400);
  assert.deepEqual((await fixture.call()).json,{rooms:[]});
});

test('group HTTP creates atomically, routes mentions to scoped sessions and shows only its own ledger receipts',async t => {
  const fixture = await botGroupHttpFixture();
  t.after(() => fixture.close());
  const body = createRoom();
  const request = input => fixture.call(endpoint,{body:input,headers});
  const opened = await request(body);
  assert.equal(opened.status,200);
  assert.equal(opened.headers['cache-control'],'private, no-store');
  assert.deepEqual((await request(body)).json,opened.json);
  assert.equal((await request({...body,name:'重复 UUID'})).status,409);
  assert.equal((await request({...body,id:randomUUID(),botIds:['bot-0','bot-2']})).status,400);
  const post = {action:'post',id:randomUUID(),roomId:body.id,botIds:[],text:'请帮我看一下'};
  assert.equal((await request(post)).json.error,'BOT_GROUP_MENTION_REQUIRED');
  const directed = {...post,text:'@编辑 @审稿 各自给出意见'};
  const accepted = await request(directed);
  assert.equal(accepted.status,202);
  assert.deepEqual((await request(directed)).json,accepted.json);
  assert.equal((await request({...directed,text:'换消息'})).status,409);
  await waitUntil(t,() => fixture.receipts.size === 2);
  for (const [messageId,{input}] of fixture.receipts) {
    const bot = fixture.directory.forSession(input.sessionId);
    const agent = fixture.agents.get(input.sessionId);
    assert.equal(agent.options.profile.model.model,bot.id);
    assert.equal(input.fromUser,true);
    assert.equal(input.mode,'followup');
    assert.match(agent.contexts.get('naumi:bot-group').text(),/产品讨论/);
    fixture.finish(messageId,`${bot.name}答复`);
  }
  const roomUrl = `${endpoint}?roomId=${body.id}`;
  await waitUntil(t,async () => (await fixture.call(roomUrl)).json.posts[0].replies.every(reply => reply.state === 'completed'));
  const task = {id:'task-1',sourceSessionId:opened.json.members[0].sessionId,targetBotId:'bot-1',targetSessionId:'child-session',
    status:'completed',attempt:1,task:'审核文案',updatedAt:new Date().toISOString(),
    delivery:{files:[{sessionId:'child-session',path:'审核报告.md',seq:7,index:0}]}};
  fixture.tasks.push(task,{...task,id:'task-other',sourceSessionId:'another-session'});
  const room = (await fixture.call(roomUrl)).json;
  assert.equal(room.posts.length,1);
  assert.deepEqual(room.posts[0].replies.map(reply => reply.text),['编辑答复','审稿答复']);
  assert.deepEqual(room.tasks.map(task => task.id),['task-1']);
  assert.equal(room.tasks[0].files[0].path,'审核报告.md');
  assert.deepEqual(fixture.warnings,[]);
});

async function waitUntil(t,predicate) {
  for (let i = 0; i < 50; i += 1) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve,10));
  }
  assert.fail(`${t.name}: condition not reached`);
}
