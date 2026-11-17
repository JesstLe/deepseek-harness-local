import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {imFixture} from './helpers/im-gateway.mjs';
import {createIMHandler} from '../plugins/naumi-enterprise/im-gateway.js';
import {originOf} from '../plugins/naumi-enterprise/im-delivery.js';

test('connections are disabled by default; secret refs never cross the settings boundary; CAS protects rotation',async t=>{
 const f=imFixture(t),id=randomUUID();await f.command({action:'save',id,platform:'feishu',appId:'app-1',name:'工作消息',secret:'TOP_SECRET'});
 let view=await f.service.read();assert.equal(view.connections[0].enabled,false);assert.equal(view.connections[0].configured,true);assert.equal(f.handlers.size,0);
 assert.doesNotMatch(JSON.stringify(view),/TOP_SECRET|NAUMI_IM_|secretRef/);
 await assert.rejects(f.service.execute({action:'save',id,platform:'feishu',appId:'app-1',name:'改名',secret:'BAD',expectedRevision:0}),/IM_CONFLICT/);assert.equal(f.vault.size,1);
 await f.command({action:'save',id,platform:'feishu',appId:'app-1',name:'改名',secret:'ROTATED'});assert.equal(f.vault.size,1);assert.deepEqual([...f.vault.values()],['ROTATED']);
 await f.command({action:'enable',id,enabled:true});assert.equal(f.handlers.size,1);
 await assert.rejects(f.command({action:'save',id,platform:'feishu',appId:'other-app',name:'改名'}),/IM_ACCOUNT_IMMUTABLE/);
 await assert.rejects(f.command({action:'save',id,platform:'feishu',appId:'app-1',name:'改名',extra:true}),/Unrecognized key/);
});

test('pairing is account-specific, kind-specific, single-use, hashed, expiring and explicitly targets an existing Bot',async t=>{
 const f=imFixture(t),a=await f.connection(),b=await f.connection('dingtalk');
 await assert.rejects(f.command({action:'pair',connectionId:a,chatKind:'direct',target:{kind:'bot',id:'missing'}}),/IM_BOT_NOT_FOUND/);
 const v=await f.command({action:'pair',connectionId:a,chatKind:'direct',target:{kind:'bot',id:'bot-a'}}),e=f.event({text:'/pair '+v.pair.code});
 const stored=f.store.db.prepare('SELECT * FROM pairs').get();assert.notEqual(stored.hash,v.pair.code);assert.doesNotMatch(stored.value,new RegExp(v.pair.code));
 await f.service.receive(b,e);assert.equal(f.store.bindings().length,0);
 await f.service.receive(a,{...e,chat:{...e.chat,kind:'group'}});assert.equal(f.store.bindings().length,0);
 await f.service.receive(a,e);await f.service.kick();assert.equal(f.store.bindings().length,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM pairs').get().n,0);
 await f.service.receive(a,{...e,chat:{key:'another-chat',kind:'direct'}});assert.equal(f.store.bindings().length,1);
 assert.equal(f.deliveries.length,0);assert.equal(f.store.bindings()[0].users[0],e.sender.id);
 const again=await f.command({action:'pair',connectionId:b,chatKind:'direct',target:{kind:'bot',id:'bot-a'}});
 f.store.db.prepare('UPDATE pairs SET expires=0').run();await f.service.receive(b,{...e,text:'/pair '+again.pair.code});assert.equal(f.store.bindings().length,1);
});

test('DM routing reuses Bot profile, creates independent Sessions, deduplicates concurrent retries and reopens without model replay',async t=>{
 const f=imFixture(t),id=await f.connection(),one=await f.pair(id),two=await f.pair(id);
 const event=f.event({chat:one.chat});await Promise.all(Array.from({length:12},()=>f.service.receive(id,event)));await f.service.kick();
 assert.equal(f.deliveries.length,1);const input=f.store.inputs()[0];assert.equal(f.deliveries[0].profile.model.model,'bot-a');assert.equal(f.deliveries[0].mode,'followup');assert.equal(f.deliveries[0].fromUser,true);assert.notEqual(input.sessionId,'home-a');
 await f.receive(id,two);assert.equal(f.deliveries.length,2);assert.notEqual(f.deliveries[0].sessionId,f.deliveries[1].sessionId);
 f.finish(input,'只回原聊天');await f.service.kick();assert.equal(f.sends.filter(s=>s.payload.text==='只回原聊天').length,1);assert.equal(f.sends.find(s=>s.payload.text==='只回原聊天').chat.key,one.chat.key);
 await f.reopen();await f.service.kick();await f.service.receive(id,event);await f.service.kick();assert.equal(f.deliveries.length,2);assert.equal(f.sends.filter(s=>s.payload.text==='只回原聊天').length,1);
});

test('unpaired users, unmentioned groups and threads are not routed',async t=>{
 const f=imFixture(t),id=await f.connection(),binding=await f.pair(id);
 await f.receive(id,binding,'外人',{sender:{id:'stranger'}});await f.receive(id,binding,'线程',{threadId:'thread'});assert.equal(f.deliveries.length,0);
 const room=f.groups.create({id:randomUUID(),name:'已有群',botIds:f.bots.map(b=>b.id),defaultBotId:'bot-a'}),group=await f.pair(id,{kind:'group',id:room.id});
 await f.receive(id,group,'未点名',{mentioned:false});assert.equal(f.deliveries.length,0);
 await assert.rejects(f.command({action:'pair',connectionId:id,chatKind:'group',target:{kind:'group',id:room.id}}),/IM_GROUP_ALREADY_BOUND/);
});

test('external groups reuse the REAL group service and exact post receipts; local web posts do not broadcast',async t=>{
 const f=imFixture(t),id=await f.connection(),room=f.groups.create({id:randomUUID(),name:'编辑室',botIds:f.bots.map(b=>b.id),defaultBotId:'bot-a'}),binding=await f.pair(id,{kind:'group',id:room.id});
 const input=await f.receive(id,binding,'@编辑 请答复');await f.groups.kick();assert.equal(f.deliveries.length,1);const reply=f.deliveries[0];assert.equal(f.sessions.get(reply.sessionId).header.agentPreset,'preset-bot-b');assert.notEqual(reply.sessionId,binding.sessionId);
 f.receipts.set(reply.messageId,{seen:true,pending:false,consumed:true,end:{kind:'completed'},text:'群内结果'});await f.groups.kick();await f.service.kick();
 assert.equal(f.groups.readPost(room.id,input.messageId).replies[0].state,'completed');assert.equal(f.sends.filter(s=>s.payload.text.includes('群内结果')).length,1);
 const local=f.groups.post({id:randomUUID(),roomId:room.id,botIds:['bot-a'],text:'仅网页讨论'});await f.groups.kick();const web=f.deliveries.at(-1);f.receipts.set(web.messageId,{seen:true,consumed:true,end:{kind:'completed'},text:'网页机密'});await f.groups.kick();await f.service.kick();assert.ok(local);assert.equal(f.sends.some(s=>s.payload.text.includes('网页机密')),false);
});

test('unknown sends survive restart without blind replay; only explicit owner reconciliation resends, never executes again',async t=>{
 const f=imFixture(t),id=await f.connection(),binding=await f.pair(id),input=await f.receive(id,binding);
 f.finish(input,'成果');f.failSend(Error('timeout after server accepted'));await f.service.kick();let output=f.store.outputs().find(v=>v.payload.text==='成果');assert.equal(output.state,'unknown');
 await f.reopen();await f.service.kick();assert.equal(f.sends.some(s=>s.payload.text==='成果'),false);assert.equal(f.deliveries.length,1);
 await f.command({action:'resolve',id:output.id,received:false,confirm:true});await f.service.kick();assert.equal(f.sends.filter(s=>s.payload.text==='成果').length,1);assert.equal(f.deliveries.length,1);
});

test('crash during send becomes UNKNOWN, rate-limit rejection retries without changing native work',async t=>{
 const f=imFixture(t),id=await f.connection(),binding=await f.pair(id),input=await f.receive(id,binding);f.finish(input,'成果');f.failSend(Object.assign(Error('429'),{status:429}));await f.service.kick();
 const row=f.store.outputs().find(v=>v.payload.text==='成果');assert.equal(row.state,'queued');f.store.updateOutput(row.id,{nextAt:0});await f.service.kick();assert.equal(f.sends.filter(s=>s.payload.text==='成果').length,1);
 const crash=f.store.enqueue(originOf(input),'crash',{type:'text',text:'崩溃中'});f.store.updateOutput(crash.id,{state:'sending'});await f.reopen();assert.equal(f.store.output(crash.id).state,'unknown');assert.equal(f.deliveries.length,1);
});

test('revoke and re-pair invalidate old destinations and Sessions, including queued files and task outcomes',async t=>{
 const f=imFixture(t),id=await f.connection(),binding=await f.pair(id),input=await f.receive(id,binding);f.finish(input,'旧结果');
 await f.command({action:'binding',id:binding.id,active:false,users:binding.users});await f.service.kick();assert.equal(f.sends.some(s=>s.payload.text==='旧结果'),false);assert.equal(f.store.input(input.id).state,'revoked');
 await assert.rejects(f.command({action:'binding',id:binding.id,active:true,users:binding.users}),/IM_PAIR_REQUIRED/);
 const other=await f.pair(id,{kind:'bot',id:'bot-b'},{chat:binding.chat});assert.equal(other.id,binding.id);assert.notEqual(other.sessionId,binding.sessionId);assert.ok(other.revision>binding.revision);
 assert.equal(f.store.sessionOwner(binding.sessionId),'bot-a');assert.equal(f.store.sessionOwner(other.sessionId),'bot-b');
 const old=f.handlers.get('feishu');await f.command({action:'enable',id,enabled:false});await old.onMessage(f.event({chat:other.chat}));assert.equal(f.deliveries.length,1);
});

test('/stop stops exact current chat turn, preserves independent tasks and other conversations',async t=>{
 const f=imFixture(t),id=await f.connection(),binding=await f.pair(id),first=await f.receive(id,binding,'第一题'),later=await f.receive(id,binding,'后续排队');
 f.receipts.set(first.messageId,{seen:true,consumed:true,turn:1,running:true});f.tasks.push({id:'independent',sourceSessionId:binding.sessionId,targetSessionId:'worker',status:'running'});
 await f.receive(id,binding,'/stop');const stops=f.stops.filter(v=>v.messageId);assert.deepEqual(stops,[{sessionId:binding.sessionId,messageId:first.messageId}]);assert.equal(f.receipts.get(later.messageId).pending,true);assert.equal(f.tasks[0].status,'running');
});

test('durable task origin uses exact native source message, not current web turn; files retain event/version proof',async t=>{
 const f=imFixture(t),id=await f.connection(),binding=await f.pair(id),input=await f.receive(id,binding),path=joinPath(f.home,'result.txt');
 f.tasks.push({id:'task-a',sourceSessionId:input.sessionId,targetSessionId:'worker',targetBotId:'bot-b',intent:{source:{sessionId:input.sessionId,messageId:input.messageId}}});
 f.sessions.set('worker',{header:{cwd:f.home},events:[{seq:3,type:'deliverables/presented',data:{turn:1,files:[{path}]}}]});
 const ref={sessionId:'worker',seq:3,index:0,turn:1,path,version:'v1',bytes:3};
 f.taskOutbox.push({id:'result-1',taskId:'task-a',key:'finish:1',fromSessionId:'worker',toSessionId:input.sessionId,kind:'result',text:'真实任务结果',files:[ref]});
 await f.service.kick();assert.equal(f.sends.filter(s=>s.payload?.text.includes('真实任务结果')).length,1);assert.equal(f.sends.filter(s=>s.file).length,1);assert.equal(f.sends.find(s=>s.file).file.data.toString(),'abc');
 await f.service.kick();assert.equal(f.sends.filter(s=>s.file).length,1);
 f.tasks[0].amendment={source:{sessionId:'web-session',messageId:'web-message'}};f.taskOutbox.push({...f.taskOutbox[0],id:'web-result',text:'仅网页续办'});await f.service.kick();assert.equal(f.sends.some(s=>s.payload?.text.includes('仅网页续办')),false);
});
function joinPath(home,name){return home.replaceAll('\\','/')+'/'+name;}

test('scoped approval and question callbacks verify exact account/chat/user and expire without replay after restart',async t=>{
 const f=imFixture(t),id=await f.connection(),b=await f.pair(id),input=await f.receive(id,b);const ac=new AbortController();
 const promise=f.service.interactions.open(input,{type:'approval',sessionId:input.sessionId,toolName:'shell',reason:'测试',signal:ac.signal});await f.service.kick();let row=f.store.interactions().find(v=>v.state==='open');
 assert.equal(f.service.interactions.respond(id,{chat:b.chat,sender:{id:'wrong'}},row.id,'allow'),false);assert.equal(f.service.interactions.respond(randomUUID(),{chat:b.chat,sender:{id:input.userId}},row.id,'allow'),false);
 assert.equal(f.service.interactions.respond(id,{chat:b.chat,sender:{id:input.userId}},row.id,'allow'),true);assert.equal(await promise,'allowed-once');assert.equal(f.service.interactions.respond(id,{chat:b.chat,sender:{id:input.userId}},row.id,'allow'),false);
 const question=f.service.interactions.open(input,{type:'question',sessionId:input.sessionId,questions:[{id:'q1',question:'方式',options:[{label:'快'},{label:'准'}]},{id:'q2',question:'内容'}]});await f.service.kick();row=f.store.interactions().find(v=>v.state==='open');
 await f.receive(id,b,`/answer ${row.id} 2 | 我的内容`);assert.deepEqual(await question,{answers:[{id:'q1',selected:['准']},{id:'q2',selected:[],custom:'我的内容'}]});
 const pending=f.service.interactions.open(input,{type:'approval',sessionId:input.sessionId,toolName:'shell'});await f.reopen();assert.equal(await pending,'cancelled');assert.equal(f.service.waiters.size,0);
});

test('active origin matches exact native turn; mixed-user coalescing cannot grant approval authority',async t=>{
 const f=imFixture(t),id=await f.connection(),b=await f.pair(id),input=await f.receive(id,b);
 f.sessions.set(input.sessionId,{header:{cwd:f.home},events:[{type:'turn/start',data:{turn:3}}]});f.receipts.set(input.messageId,{seen:true,consumed:true,turn:3});
 assert.equal((await f.service.activeOrigin(input.sessionId)).id,input.id);
 f.store.saveBinding({...b,users:[...b.users,'user-2']});const other=await f.receive(id,b,'其他用户',{sender:{id:'user-2'}});f.receipts.set(other.messageId,{seen:true,consumed:true,turn:3});assert.equal(await f.service.activeOrigin(input.sessionId),null);
});

test('owner HTTP enforces auth, strict JSON/schema, CSRF and bounded bodies without reflecting credentials',async t=>{
 const f=imFixture(t);let principal='owner';const scope={connection:{admit:()=>principal?{peer:{principal:{kind:principal}}}:{rejection:401}}};const handler=createIMHandler(scope,f.service);
 async function call({method='GET',body,headers={}}={}){const req=Readable.from(body===undefined?[]:[Buffer.from(typeof body==='string'?body:JSON.stringify(body))]);Object.assign(req,{method,headers:{host:'localhost',...headers}});let status,value;const res=new EventEmitter();Object.assign(res,{setHeader(){},writeHead(s){status=s;return this;},end(v){value=v;}});await handler(req,res);return {status,value:value&&JSON.parse(value)};}
 assert.equal((await call()).status,200);principal='member';assert.equal((await call()).status,403);principal=null;assert.equal((await call()).status,401);principal='owner';assert.equal((await call({method:'DELETE'})).status,405);
 const body={action:'enable',id:randomUUID(),enabled:true,expectedRevision:0},headers={'x-naumi-im':'1','content-type':'application/json',origin:'http://localhost'};
 assert.equal((await call({method:'POST',body})).status,403);assert.equal((await call({method:'POST',body,headers:{...headers,origin:'https://evil.invalid'}})).status,403);
 assert.equal((await call({method:'POST',body,headers:{'x-naumi-im':'1'}})).status,415);assert.equal((await call({method:'POST',body:'x'.repeat(32769),headers})).status,413);
 assert.equal((await call({method:'POST',body:{...body,secret:'SHOULD_NOT_REFLECT'},headers})).status,400);assert.doesNotMatch(JSON.stringify(await call()),/SHOULD_NOT_REFLECT/);
});

test('vendored source provenance is pinned, bytes match local hashes and package includes every runtime module',()=>{
 const root=new URL('../plugins/naumi-enterprise/',import.meta.url),up=JSON.parse(readFileSync(new URL('third-party/ds-bot-im/UPSTREAM.json',root)));assert.equal(up.commit,'5e9b7da8882da3b68d8a0624342708c2150a9156');
 for(const f of up.files)assert.equal(createHash('sha256').update(readFileSync(new URL('im-adapters/'+f.path,root))).digest('hex'),f.localSha256,f.path);
 const pkg=JSON.parse(readFileSync(new URL('package.json',root)));for(const file of ['im-gateway.js','im-service.js','im-store.js','im-interactions.js','im-platforms.js','im-delivery.js','im-adapters'])assert.ok(pkg.files.includes(file));
 assert.match(readFileSync(new URL('host.js',root),'utf8'),/im-settings\.css/);assert.match(readFileSync(new URL('assets/im-settings.js',root),'utf8'),/id:'im'/);
});
