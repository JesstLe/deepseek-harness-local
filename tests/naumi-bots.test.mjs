import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {BotDirectory,createBotTools,installBots} from '../plugins/naumi-enterprise/bots.js';
import {navigationMode,botSessions,botTarget,botSelected,currentSessionId,botActivity,botSummary,botTone,newBotTaskRequest,createBotCatalog} from '../plugins/naumi-enterprise/assets/bot-sidebar-model.js';

function fixture(options={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-bots-')),file=path.join(dir,'bots.json');let counter=0;
  const store=new BotDirectory(file,{uuid:()=>String(++counter),now:()=>new Date('2026-11-16T09:00:00Z').toISOString(),...options});
  const root={id:'session-1',session:{header:{cwd:dir}}},member={id:'member-1'},other={id:'other'},ctx={agentPresets:{presetForSession:()=>null},agentTeams:{membership:agent=>agent===root?{root,id:root.id,role:'lead'}:agent===member?{root,id:root.id,role:'teammate'}:(()=>{throw Error('INVALID_AGENT');})()}};
  const cleanup=async()=>{await store.close();assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});};
  const create=(name='Agent 自主选择的团队名')=>store.create({sessionId:root.id,cwd:dir},{name,kind:'team',purpose:'根据用户的实际需求整理资料与复核结果'});
  return {dir,file,store,root,member,other,ctx,cleanup,create};
}
test('directory starts empty and merely switching/listing never creates staff or a file',async()=>{
  const f=fixture();try{assert.deepEqual(f.store.list(),{version:1,revision:0,bots:[]});assert.equal(fs.existsSync(f.file),false);assert.equal(navigationMode(null),'threads');assert.equal(navigationMode('bot'),'bot');for(const value of ['Bot','thread','../x',true])assert.equal(navigationMode(value),'threads');}finally{await f.cleanup();}
});
test('Bot ID is independent of session identity and survives restart',async()=>{
  const f=fixture();try{const bot=await f.create();assert.notEqual(bot.id,bot.homeSessionId);assert.equal(bot.id,'bot-1');assert.equal(bot.name,'Agent 自主选择的团队名');const reloaded=new BotDirectory(f.file);assert.deepEqual(reloaded.list(),f.store.list());await reloaded.close();assert(!fs.readdirSync(f.dir).some(p=>p.endsWith('.tmp')));}finally{await f.cleanup();}
});
test('one Bot owns multiple task threads without duplicating its identity or mutating Sessions',async()=>{
  const f=fixture();try{const bot=await f.create(),next=await f.store.bind(bot.id,'session-2',1,f.dir);assert.equal(f.store.list().bots.length,1);assert.deepEqual(next.sessionIds,['session-1','session-2']);assert.equal(f.store.forSession('session-2').id,bot.id);assert.deepEqual(f.root.session.header,{cwd:f.dir});assert.equal((await f.store.bind(bot.id,'session-2',1,f.dir)).revision,2);}finally{await f.cleanup();}
});
test('Agent renaming changes both tasks lookup but never Bot ID or conversation titles',async()=>{
  const f=fixture();try{const bot=await f.create();await f.store.bind(bot.id,'session-2',1,f.dir);await f.store.update('session-2',{name:'Agent 自主更新的名字',expectedRevision:2});assert.equal(f.store.forSession('session-1').name,'Agent 自主更新的名字');assert.equal(f.store.forSession('session-2').id,bot.id);assert(!Object.hasOwn(f.root.session,'title'));}finally{await f.cleanup();}
});
test('parallel updates are serialized with one CAS conflict',async()=>{
  const f=fixture();try{await f.create();const values=await Promise.allSettled([f.store.update('session-1',{name:'甲',expectedRevision:1}),f.store.update('session-1',{name:'乙',expectedRevision:1})]);assert.equal(values.filter(v=>v.status==='fulfilled').length,1);assert.match(values.find(v=>v.status==='rejected').reason.message,/BOT_CONFLICT/);}finally{await f.cleanup();}
});
test('name, purpose, kind, revision and root binding validation have no partial writes',async()=>{
  const f=fixture();try{assert.throws(()=>f.store.create({sessionId:'s',cwd:f.dir},{name:'',kind:'team',purpose:'task'}));assert.throws(()=>f.store.create({sessionId:'s',cwd:f.dir},{name:'Name',kind:'bad',purpose:'task'}));const bot=await f.create();await assert.rejects(f.create('不同的名称'),/BOT_SESSION_ALREADY_BOUND/);await assert.rejects(f.store.bind(bot.id,'new',1,path.dirname(f.dir)),/BOT_WORKSPACE_MISMATCH/);await assert.rejects(f.store.update('session-1',{expectedRevision:99,name:'New'}),/BOT_CONFLICT/);assert.equal(f.store.list().revision,1);}finally{await f.cleanup();}
});
test('a Session cannot be stolen by another Bot; duplicate active names are rejected',async()=>{
  const f=fixture();try{const first=await f.create();await assert.rejects(f.store.create({sessionId:'s2',cwd:f.dir},{name:first.name,kind:'agent',purpose:'task'}),/BOT_NAME_EXISTS/);const second=await f.store.create({sessionId:'s2',cwd:f.dir},{name:'另一位智能体',kind:'agent',purpose:'不同职责'});await assert.rejects(f.store.bind(first.id,'s2',1,f.dir),/BOT_SESSION_ALREADY_BOUND/);assert.equal(f.store.forSession('s2').id,second.id);}finally{await f.cleanup();}
});
test('archiving hides the identity from active view but retains all task associations and stops no work',async()=>{
  const f=fixture();try{const bot=await f.create();const archived=await f.store.update('session-1',{status:'archived',expectedRevision:1});assert.deepEqual(archived.sessionIds,['session-1']);await assert.rejects(f.store.bind(bot.id,'new',2,f.dir),/BOT_ARCHIVED/);assert.equal(f.store.list().bots.length,1);await f.store.update('session-1',{status:'active',expectedRevision:2});assert.equal(f.store.forSession('session-1').status,'active');}finally{await f.cleanup();}
});
test('failed checkpoint preserves previous published state and disk contents',async()=>{
  const f=fixture();try{await f.create();const before=fs.readFileSync(f.file,'utf8');f.store.write=async()=>{throw Error('disk failure');};await assert.rejects(f.store.update('session-1',{name:'not published',expectedRevision:1}),/disk failure/);assert.equal(fs.readFileSync(f.file,'utf8'),before);assert.equal(f.store.list().bots[0].revision,1);}finally{await f.cleanup();}
});
test('corrupt saved directory is never silently replaced with an empty directory',async()=>{
  const f=fixture();try{fs.writeFileSync(f.file,'{"bad":true}');const broken=new BotDirectory(f.file);assert.throws(()=>broken.list(),/BOT_DIRECTORY_INVALID/);assert.throws(()=>broken.create({sessionId:'s',cwd:f.dir},{name:'New',kind:'team',purpose:'Task'}),/BOT_DIRECTORY_INVALID/);assert.equal(fs.readFileSync(f.file,'utf8'),'{"bad":true}');await broken.close();}finally{await f.cleanup();}
});
test('tools require the exact caller; only Lead creates or edits, teammate may read',async()=>{
  const f=fixture();try{
    const tools=Object.fromEntries(createBotTools(f.ctx,f.store).map(t=>[t.name,t])),invoke=(name,args,agent)=>Promise.resolve().then(()=>tools[name].execute(args,{agent}));
    const input={name:'模型工具决定的名字',kind:'agent',purpose:'任务执行与结果复核'};
    await assert.rejects(invoke('bot_create',input,f.member),/BOT_LEAD_REQUIRED/);await assert.rejects(invoke('bot_directory',{},f.other),/INVALID_AGENT/);
    await invoke('bot_create',input,f.root);assert.equal((await invoke('bot_directory',{},f.member)).currentBotId,'bot-1');
    await assert.rejects(invoke('bot_update',{name:'新的名字',expectedRevision:1},f.member),/BOT_LEAD_REQUIRED/);assert(!Object.hasOwn(tools.bot_update.parameters,'sessionId'));
  }finally{await f.cleanup();}
});
test('mode surface is an additive portal and never redeclares or replaces the native workspace parent',()=>{
  const source=fs.readFileSync('plugins/naumi-enterprise/assets/bot-sidebar.js','utf8');
  assert(source.includes("name:'shell.overlay'"));assert(!source.includes("name:'sidebar.workspaces'"));assert(!source.includes('children:entry.children'));assert(source.includes('createPortal(h(React.Fragment'));
  assert(fs.readFileSync('plugins/naumi-enterprise/client.js','utf8').includes("ctx.inject(['remote'],scope=>scope.effect"));
  assert(source.includes("ctx.inject(['remote.session','uiWorkspace','sessions','workspaces']"));
});
test('Bot selection uses the real normalized session IDs and retains member navigation',()=>{
  const bot={id:'b',sessionIds:['s1','s2']},sessions={byId:{s1:{id:'s1',retainedBy:{mainView:0},running:false},s2:{id:'s2',retainedBy:{mainView:1},running:false},child:{id:'child',retainedBy:{mainView:0},running:true}},projectionsBySession:{s2:{values:{agentTeam:{members:[{id:'child'}],tasks:[{status:'in_progress',subject:'真实任务'}]},title:'当前任务'}}}},status=new Map();
  assert.equal(currentSessionId(sessions,null),'s2');assert.equal(currentSessionId(sessions,'plugins'),null);assert.equal(botTarget(bot,sessions,status),'s2');assert.equal(botTarget(bot,sessions,status,{archivedSessionIds:['s2']}),'s1');assert(botSelected(bot,'child',sessions));assert.equal(botActivity(bot,sessions,status),'running');assert.equal(botSummary(bot,sessions),'真实任务');assert.equal(botSessions(bot,sessions).length,2);
});
test('new task uses original workspace/preset creation only, without model, prompt or permissions',()=>{
  const bot={cwd:'E:\\Work\\project',agentPreset:'standard'},value=newBotTaskRequest(bot,{items:[{workspaceId:'w',path:'e:/work/project'}]});assert.deepEqual(value,{workspaceId:'w',agentPreset:'standard'});assert.deepEqual(newBotTaskRequest(bot,{items:[]}),{cwd:'E:\\Work\\project',agentPreset:'standard'});assert.equal(botTone('stable-id'),botTone('stable-id'));
});

async function routesFixture(){
  const f=fixture(),routes=new Map(),effects=[];
  const scope={...f.ctx,inject:()=>({dispose:async()=>{}}),agentTeams:{...f.ctx.agentTeams,tryMembership:()=>undefined},agents:{list:()=>[]},sessions:{get:id=>({header:{id,cwd:f.dir,...(id==='child'?{origin:'subagent'}:{})}})},sessionPersistence:{stat:async()=>undefined},connection:{admit:()=>({peer:{principal:{kind:'owner'}}})},on:()=>{},effect:fn=>effects.push(fn()),webServer:{register:route=>{routes.set(route.path,route.handler);return()=>{};}}};
  installBots({inject:(_deps,fn)=>fn(scope)},{directory:f.store});
  const call=async({method='GET',body,headers={},admission}={})=>{
    if(admission)scope.connection.admit=()=>admission;
    const req=Readable.from(body===undefined?[]:[Buffer.from(typeof body==='string'?body:JSON.stringify(body))]);Object.assign(req,{method,headers:{host:'127.0.0.1:3080',...headers}});
    const res=new EventEmitter();res.headers={};res.setHeader=(k,v)=>res.headers[k]=v;res.writeHead=(code,values={})=>{res.status=code;Object.assign(res.headers,values);return res;};res.end=value=>{res.body=value;res.writableEnded=true;res.emit('close');return res;};
    await routes.get('/naumi/bots')(req,res);return res;
  };
  return {...f,scope,routes,call};
}
test('directory HTTP is owner-only and forbids undeclared writes and cross-origin binding',async()=>{
  const f=await routesFixture();try{const response=await f.call();assert.equal(response.status,200);assert.equal(response.headers['X-Naumi-Bots-Contract'],'2');assert.equal((await f.call({method:'DELETE'})).status,405);assert.equal((await f.call({method:'POST',body:{}})).status,403);assert.equal((await f.call({method:'POST',body:{},headers:{'x-naumi-bots':'1',origin:'https://foreign'}})).status,403);assert.equal((await f.call({admission:{peer:{principal:{kind:'guest'}}}})).status,403);assert.equal((await f.call({admission:{rejection:401}})).status,401);}finally{await f.cleanup();}
});
test('browser can bind a real root task, but cannot rename Bots or bind subagents',async()=>{
  const f=await routesFixture();try{const bot=await f.create(),headers={'x-naumi-bots':'1',origin:'http://127.0.0.1:3080'};
    assert.equal((await f.call({method:'POST',headers,body:{action:'rename',name:'Fake'}})).status,400);
    assert.equal((await f.call({method:'POST',headers,body:{action:'bind',botId:bot.id,sessionId:'child',expectedRevision:1}})).status,403);
    const result=await f.call({method:'POST',headers,body:{action:'bind',botId:bot.id,sessionId:'new-root',expectedRevision:1}});assert.equal(result.status,200);assert.equal(f.store.forSession('new-root').id,bot.id);
  }finally{await f.cleanup();}
});
test('shared client catalog subscribes once, performs GET only and releases its SSE when last view leaves',async()=>{
  const calls=[],sources=[],win={addEventListener(){},removeEventListener(){}};
  const source=createBotCatalog({fetcher:async(url,options)=>{calls.push({url,...options});return Response.json({version:1,revision:0,bots:[]});},eventSource:url=>{const s={url,closed:false,close(){this.closed=true;}};sources.push(s);return s;},windowTarget:win});
  const stop1=source.subscribe(()=>{}),stop2=source.subscribe(()=>{});await source.refresh();assert(calls.every(c=>c.method==='GET'));assert.equal(sources.length,1);assert.equal(source.getSnapshot().status,'ready');stop1();assert.equal(sources[0].closed,false);stop2();assert.equal(sources[0].closed,true);assert.equal(source.getSnapshot().status,'idle');
});
test('permission loss clears cached Bot identities, not just a red error label',async()=>{
  let allowed=true;const source=createBotCatalog({fetcher:async()=>allowed?Response.json({version:1,revision:1,bots:[{id:'private'}]}):new Response('',{status:403}),eventSource:()=>({close(){}}),windowTarget:{addEventListener(){},removeEventListener(){}}});
  const stop=source.subscribe(()=>{});await source.refresh();allowed=false;await source.refresh();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(source.getSnapshot().status,'forbidden');assert.deepEqual(source.getSnapshot().bots,[]);stop();
});
test('UI has no hardcoded employee catalog and keeps the native tree mounted in both modes',()=>{
  const source=fs.readFileSync('plugins/naumi-enterprise/assets/bot-sidebar.js','utf8'),css=fs.readFileSync('plugins/naumi-enterprise/assets/bot-sidebar.css','utf8');assert(source.includes("child.dataset.naumiThreadContent='true'"));assert(css.includes('[data-navigation-mode=bot]>[data-naumi-thread-content]{display:none!important}'));assert(source.includes('catalog.bots.filter'));assert(!/impl-dev|test-dev|自媒体团队|投资大师|运营团队/.test(source));for(const forbidden of ['selectModel','setPermission','session.prompt','schedule.create','removeChild'])assert(!source.includes(forbidden));
});
