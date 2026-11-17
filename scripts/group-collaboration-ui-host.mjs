// Isolated candidate UI on the real Harness shell. Only read RPCs are proxied;
// all group writes go to temporary SQLite and a deterministic (non-model) driver.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {botLiveApi} from './bot-live-api.mjs';import {extendNativeComposer} from './native-composer-extension.mjs';
import {BotGroupStore} from '../plugins/naumi-enterprise/bot-group-store.js';import {BotGroupService} from '../plugins/naumi-enterprise/bot-group-service.js';
const root=process.cwd(),runtime='E:/Workspace/naumi-desktop',out=path.join(root,'evidence/group-live-collaboration'),api=await botLiveApi(runtime);
const {WebSocket,WebSocketServer}=createRequire(path.join(runtime,'package.json'))('ws');
const logs=['server.out.log','server.err.log'].map(p=>fs.readFileSync(path.join(runtime,'logs',p),'utf8')).join('\n');
const launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];
const owner=await fetch(launch,{redirect:'manual'}),ownerCookie=owner.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
const realRooms=(await api.json('/naumi/bot-groups')).rooms,catalog=await api.json('/naumi/bots'),anchor=realRooms[0];
if(!anchor)throw Error('READ_ONLY_ANCHOR_ROOM_REQUIRED');
const dir=mkdtempSync(path.join(tmpdir(),'naumi-group-ui-')),store=new BotGroupStore(path.join(dir,'groups.sqlite'));
const room=store.create({id:randomUUID(),name:'群协作隔离验收',botIds:anchor.members.map(m=>m.botId),defaultBotId:anchor.defaultBotId??anchor.members[0].botId},()=>{});
for(const m of anchor.members)store.db.prepare('UPDATE members SET session_id=? WHERE room_id=? AND bot_id=?').run(m.sessionId,room.id,m.botId);
const actual=store.room(room.id),sender=actual.members.find(m=>m.botId===actual.defaultBotId),worker=actual.members.find(m=>m.botId!==sender.botId);
const ledger={tasks:[],outbox:[]},receipts=new Map(),writes=[],blocked=[],requests=[];let failedOnce=false;
const directory={list:()=>catalog,forSession:id=>catalog.bots.find(b=>b.id===store.member(id)?.botId)};
const adapter={snapshot:async id=>({id}),profile:async()=>({}),inspect:async(_sid,id)=>receipts.get(id),
 async deliver(input){writes.push(input);const receipt=input.text.includes('测试长回复')?{seen:true,pending:true,running:true}:{seen:true,consumed:true,end:{kind:'completed'},text:input.text.includes('排期')?'下周排期可以继续讨论，文案任务仍在后台执行。':'收到这条群消息。'};receipts.set(input.messageId,receipt);return receipt;},
 async interrupt(_sid,id){receipts.set(id,{seen:true,consumed:true,end:{kind:'aborted',reason:{kind:'user'}}});return {interrupted:true};}};
const groups=new BotGroupService({directory,store,getTasks:()=>({runtime:adapter,store:{read:()=>ledger}})});
const post=groups.post({id:randomUUID(),roomId:room.id,text:'请安排运营准备活动文案。',botIds:[]});await groups.kick();
const stamp=new Date().toISOString(),task={id:'ui-task-'+randomUUID(),sourceSessionId:sender.sessionId,sourceBotId:sender.botId,targetBotId:worker.botId,targetSessionId:worker.sessionId,status:'running',attempt:1,revision:3,task:'准备活动文案',createdAt:stamp,updatedAt:stamp};ledger.tasks.push(task);
ledger.outbox.push({id:'ui-progress',key:'ack',taskId:task.id,attempt:1,fromSessionId:worker.sessionId,toSessionId:sender.sessionId,taskStatus:'running',kind:'progress',text:'我先梳理使用场景，再给出三个标题方向。',createdAt:stamp,delivered:true,files:[]});
const native=fs.readFileSync(path.join(runtime,'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'),'utf8'),candidate=extendNativeComposer(native);
const nativeCore=native.replaceAll('\r\n','\n').replace(/\/\/# sourceMappingURL=[^\n]*/g,'').trim(),candidateCore=candidate.replaceAll('\r\n','\n').replace(/\/\/# sourceMappingURL=[^\n]*/g,'').trim().replace('exports.apply = apply;',`exports.apply = function(...args){try{return apply(...args);}catch(e){console.error('NATIVE_SETUP_FAILURE',e.message);throw e;}};`);
const clientBefore=fs.readFileSync(path.join(runtime,'.dsh/profiles/web/node_modules/@naumi/dsh-enterprise/client.js'),'utf8');
const clientAfter=clientBefore.replace("yield ctx.slots.register({name:'main',key:'naumi-conversation'},()=>h(React.Suspense,{fallback:null},h(BotGroups)));", "yield ctx.slots.register({name:'main',key:'naumi-conversation',children:{'naumi.group.controls':{kind:'single',scope:'session'}}},props=>h(React.Suspense,{fallback:null},h(BotGroups,{native:props})));");
if(clientAfter===clientBefore)throw Error('CANDIDATE_MAIN_ANCHOR_CHANGED');
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/fixture/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({room:actual,taskId:task.id,writes:writes.length,requests,blocked,posts:groups.read(room.id).posts,ledger}));return;}
 if(url.pathname==='/fixture/complete'){task.status='completed';task.revision++;task.updatedAt=new Date().toISOString();task.result='三个标题已整理。';ledger.outbox.push({id:'ui-result',key:'finish:1',taskId:task.id,attempt:1,fromSessionId:worker.sessionId,toSessionId:sender.sessionId,taskStatus:'completed',kind:'result',text:task.result,createdAt:task.updatedAt,delivered:false,files:[]});res.end('ok');return;}
 if(url.pathname==='/naumi/bot-groups'){
  res.setHeader('Content-Type','application/json');if(req.method==='GET'){res.end(JSON.stringify(url.searchParams.has('roomId')?groups.read(room.id):{rooms:[actual]}));return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));
  if(body.action==='prepare'){res.end(JSON.stringify({sessionId:sender.sessionId}));return;}
  if(body.action==='post'){requests.push(body);if(body.text==='重试验收'&&!failedOnce){failedOnce=true;res.writeHead(503).end('{"error":"TEMPORARY"}');return;}res.writeHead(202).end(JSON.stringify(groups.post(body)));await groups.kick();return;}
  if(body.action==='interrupt'){res.end(JSON.stringify(await groups.interrupt(body.roomId,body.replyId)));return;}
  res.writeHead(400).end('{}');return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){
  // Session retain/open/subscribe are read-only controller operations. No
  // prompt, cancellation, model selection, account or business mutation passes.
  const allowed=/^\/api\/(?:session\/(?:list|read|subscribe|unsubscribe|stat|access|modelCatalog)|connection\/|config\/get|plugin\/list|agentPresets\/list|settings\/describe|credentials\/describe|dynamicCordisRunner\/(?:inventory|syncInspectManifest))/.test(url.pathname);
  if(!allowed){blocked.push(url.pathname);res.writeHead(403,{'Content-Type':'application/json'}).end('{"error":"FIXTURE_WRITE_BLOCKED"}');return;}
 }
 const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),controller=new AbortController();res.on('close',()=>controller.abort());
 const response=await api.request(req.url,{method:req.method,signal:controller.signal,headers:{...(req.headers['content-type']?{'content-type':req.headers['content-type']}:{})},...(body.length?{body}:{})});
 const type=response.headers.get('content-type')??'';
 for(const [k,v]of response.headers)if(!['content-length','content-encoding','set-cookie','transfer-encoding','connection'].includes(k))res.setHeader(k,v);
 res.statusCode=response.status;
 if(type.includes('text/event-stream')){Readable.fromWeb(response.body).on('error',()=>res.end()).pipe(res);return;}
  let bytes=Buffer.from(await response.arrayBuffer());
  if(req.url.includes('ui-conversation/client.js'))fs.writeFileSync(path.join(out,'native-response.private.json'),JSON.stringify({status:response.status,type,length:bytes.length,exact:bytes.toString().includes(native),normal:bytes.toString().replaceAll('\r\n','\n').includes(native.replaceAll('\r\n','\n')),marker:bytes.toString().includes('async sendSession(session,')}));
 if(type.includes('javascript')||type.includes('html')){
  let text=bytes.toString().replaceAll('\r\n','\n');if(text.includes(nativeCore))text=text.replace(nativeCore,()=>candidateCore);if(text.includes(clientBefore.replaceAll('\r\n','\n')))text=text.replace(clientBefore.replaceAll('\r\n','\n'),()=>clientAfter);
  if(type.includes('html'))text=text.replace('<head>',`<head><script>localStorage.setItem('naumi.navigationMode.v1','bot');sessionStorage.setItem('naumi.groupSelection.v1',${JSON.stringify(room.id)});sessionStorage.setItem('naumi.activePanel','naumi-conversation');window.__fixtureErrors=[];window.__fixtureConsole=[];for(const level of ['warn','error']){const original=console[level];console[level]=(...a)=>{__fixtureConsole.push(a.map(v=>v?.message??String(v)).join(' '));original(...a)}};addEventListener('error',e=>__fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>__fixtureErrors.push(String(e.reason)));</script>`);
  bytes=Buffer.from(text);
 }
 if(url.pathname.startsWith('/naumi/assets/')){const name=path.basename(url.pathname),p=path.join(root,'plugins/naumi-enterprise/assets',name);if(fs.existsSync(p))bytes=fs.readFileSync(p);}
 res.end(bytes);
}catch(e){if(!res.headersSent)res.writeHead(500,{'Content-Type':'text/plain'});res.end('FIXTURE_ERROR '+e.message);}});
const sockets=new WebSocketServer({noServer:true});
server.on('upgrade',(req,socket,head)=>{
 if(req.url!=='/api/remote.mux'){socket.destroy();return;}
 sockets.handleUpgrade(req,socket,head,client=>{
  const upstream=new WebSocket('ws://127.0.0.1:3080/api/remote.mux',{headers:{cookie:ownerCookie}}),queue=[];
  const send=(data,binary)=>{
   const value=data.toString();
   if(/session\/(?:prompt|cancel|create|archive|remove|modelSelect)|credentials\/(?:set|write)|settings\/(?:set|update)/.test(value)){blocked.push('WS_MUTATION_BLOCKED');return;}
   if(upstream.readyState===WebSocket.OPEN)upstream.send(data,{binary});else queue.push([data,binary]);
  };
  client.on('message',send);upstream.on('open',()=>{for(const [data,binary]of queue)upstream.send(data,{binary});queue.length=0;});
  upstream.on('message',(data,binary)=>{if(client.readyState===WebSocket.OPEN)client.send(data,{binary});});
  client.on('close',()=>upstream.close());upstream.on('close',()=>client.close());client.on('error',()=>upstream.close());upstream.on('error',()=>client.close());
 });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
fs.writeFileSync(path.join(out,'UI_HOST.json'),JSON.stringify({origin,pid:process.pid,roomId:room.id,taskId:task.id,modelCalls:0},null,2));
console.log('GROUP_UI_HOST '+origin+' model_calls=0');
const stop=async()=>{for(const socket of sockets.clients)socket.terminate();server.closeAllConnections();await new Promise(r=>server.close(r));await groups.close();rmSync(dir,{recursive:true,force:true});process.exit();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
