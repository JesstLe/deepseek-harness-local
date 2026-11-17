import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {BotDirectory,PrimaryBotService,createBotTools} from '../plugins/naumi-enterprise/bots.js';
import {taskFixture} from './helpers/bot-task-fixture.mjs';
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-management-')),directory=new BotDirectory(path.join(dir,'naumi/bots.json')),sessions=new Map(),workspaces=new Map(),created=[],tasks=[];
 const runtime={snapshot:async id=>sessions.get(id),async ensure(id,options){if(!sessions.has(id)){created.push({id,options});sessions.set(id,{header:{cwd:options.cwd},events:[]});}},deliver(){throw Error('NO_MODEL');}};
 const options={directory,getRuntime:()=>runtime,getTasks:()=>({store:{read:()=>({tasks})}}),workspaceRegistry:{async create(cwd,name){if(!workspaces.has(cwd))workspaces.set(cwd,{path:cwd,name,ids:[],async attachSession(id){if(!this.ids.includes(id))this.ids.push(id);}});return workspaces.get(cwd);}},agentPresets:{resolve:async()=>({id:'standard'}),presetForSession:()=>null},agentDefaultModel:{currentSelection:()=>({provider:'existing',model:'same-id'})}};
 const operations=new PrimaryBotService(options),root={id:'primary-home',session:{header:{cwd:dir}}},member={id:'child'};const ctx={agentPresets:options.agentPresets,agentTeams:{membership(agent){return{root:agent===member?root:agent,role:agent===member?'teammate':'lead'};}}};
 const tools=Object.fromEntries(createBotTools(ctx,directory,operations).map(t=>[t.name,t])),fields={name:'运营员工',kind:'agent',purpose:'内容规划与复核'},create=()=>operations.createBot({requestId:randomUUID(),expectedRevision:directory.list().revision,fields});
 const primary=async()=>{const bot=await directory.create({sessionId:root.id,cwd:dir},{name:'主助手',kind:'agent',purpose:'接待与协调'});await directory.choosePrimary(bot.id,directory.list().revision);return bot;};
 t.after(async()=>{await operations.tail;await directory.close();assert(dir.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
 return{dir,directory,root,member,ctx,tools,fields,operations,options,runtime,sessions,workspaces,created,tasks,primary,create};
}
test('primary tool creates distinct employee/home/workspace without stealing caller identity or starting work',async t=>{
 const f=fixture(t),primary=await f.primary(),before=f.directory.primary(),bot=await f.tools.bot_create.execute({...f.fields,idempotencyKey:'hire-1'},{agent:f.root,callId:'call-1'});
 assert.notEqual(bot.id,primary.id);assert.notEqual(bot.homeSessionId,primary.homeSessionId);assert.notEqual(bot.cwd,primary.cwd);assert(bot.cwd.startsWith(path.join(f.dir,'naumi/workspaces')+path.sep));assert(fs.statSync(bot.cwd).isDirectory());assert.deepEqual(f.directory.primary(),before);assert.equal(f.directory.forSession(f.root.id).id,primary.id);assert.equal(f.directory.forSession(bot.homeSessionId).id,bot.id);assert.deepEqual(f.created[0].options.profile,{agentPreset:'standard',model:{provider:'existing',model:'same-id'},permissions:[]});assert.equal(f.workspaces.get(bot.cwd).ids[0],bot.homeSessionId);
});
test('manual and primary use one provisioning service, exact request retries are durable after restart',async t=>{
 const f=fixture(t);await f.primary();const input={requestId:randomUUID(),expectedRevision:f.directory.list().revision,fields:f.fields},bots=await Promise.all(Array.from({length:8},()=>f.operations.createBot(input)));
 assert.equal(new Set(bots.map(b=>b.id)).size,1);assert.equal(f.created.length,1);assert.equal(f.directory.list().bots.length,2);const reopened=new BotDirectory(f.directory.file);try{const again=await new PrimaryBotService({...f.options,directory:reopened}).createBot(input);assert.equal(again.id,bots[0].id);assert.equal(f.created.length,1);}finally{await reopened.close();}
});
test('different payload cannot reuse accepted key; name conflicts and stale revisions create no duplicate Session',async t=>{
 const f=fixture(t);await f.primary();const input={requestId:randomUUID(),expectedRevision:2,fields:f.fields};await f.operations.createBot(input);
 await assert.rejects(f.operations.createBot({...input,fields:{...f.fields,purpose:'changed'}}),/BOT_CREATION_REQUEST_CONFLICT/);
 await assert.rejects(f.operations.createBot({...input,requestId:randomUUID(),expectedRevision:4}),/BOT_NAME_EXISTS/);
 await assert.rejects(f.operations.createBot({...input,requestId:randomUUID(),fields:{...f.fields,name:'另一个'}}),/BOT_CONFLICT/);assert.equal(f.created.length,1);
});
test('ensure/registration/checkpoint failure is recoverable using the same reserved identity',async t=>{
 const f=fixture(t);await f.primary();const input={requestId:randomUUID(),expectedRevision:2,fields:f.fields},ensure=f.runtime.ensure;f.runtime.ensure=async()=>{throw Error('ENSURE_FAILURE');};await assert.rejects(f.operations.createBot(input),/ENSURE_FAILURE/);const pending=f.directory.list().creations[0];assert.equal(pending.state,'pending');assert.equal(f.directory.list().bots.length,1);
 f.runtime.ensure=ensure;const write=f.directory.write;f.directory.write=async next=>{if(next.creations[0].state==='completed')throw Error('COMMIT_FAILURE');return write(next);};await assert.rejects(f.operations.createBot(input),/COMMIT_FAILURE/);assert.equal(f.created.length,1);f.directory.write=write;const bot=await f.operations.createBot(input);assert.equal(bot.id,pending.botId);assert.equal(bot.homeSessionId,pending.sessionId);assert.equal(f.created.length,1);
});
test('first checkpoint failure performs no filesystem/native provisioning',async t=>{const f=fixture(t);await f.primary();f.directory.write=async()=>{throw Error('DISK');};await assert.rejects(f.create(),/DISK/);assert.equal(f.created.length,0);assert(!fs.existsSync(path.join(f.dir,'naumi/workspaces')));});
test('legacy thread creation cannot consume the last seat held by a durable employee reservation',async t=>{
 const f=fixture(t);await f.primary();await f.directory.transact(next=>{const example=next.bots[0];for(let i=0;i<998;i++)next.bots.push({...example,id:'existing-'+i,name:'已有员工'+i,homeSessionId:'old-'+i,sessionIds:['old-'+i]});return{bot:next.bots[0]};});
 const ensure=f.runtime.ensure;f.runtime.ensure=async()=>{throw Error('PENDING');};const input={requestId:randomUUID(),expectedRevision:f.directory.list().revision,fields:f.fields};await assert.rejects(f.operations.createBot(input),/PENDING/);
 await assert.rejects(f.directory.create({sessionId:'legacy-new',cwd:f.dir},{name:'抢占名额',kind:'agent',purpose:'legacy'}),/BOT_DIRECTORY_FULL/);f.runtime.ensure=ensure;await f.operations.createBot(input);assert.equal(f.directory.list().bots.length,1000);
});
test('primary manages a named target; ordinary employee and teammate cannot manage another Bot',async t=>{
 const f=fixture(t),primary=await f.primary(),bot=await f.create(),input={targetBotId:bot.id,expectedRevision:1,name:'新运营',purpose:'新的职责',avatarShape:'creator',avatarPalette:'pink'};
 const result=await f.tools.bot_update.execute(input,{agent:f.root});assert.equal(result.name,'新运营');assert.equal(result.appearance.palette,'pink');assert.equal(f.directory.primary().id,primary.id);assert.deepEqual(primary,f.directory.primary());
 await assert.rejects(Promise.resolve().then(()=>f.tools.bot_update.execute({...input,targetBotId:primary.id},{agent:{id:bot.homeSessionId}})),/BOT_PRIMARY_MANAGER_REQUIRED/);
 await assert.rejects(Promise.resolve().then(()=>f.tools.bot_update.execute(input,{agent:f.member})),/BOT_LEAD_REQUIRED/);
});
test('managed archive preserves files/Sessions, refuses active tasks and keeps primary enabled',async t=>{
 const f=fixture(t),primary=await f.primary(),bot=await f.create();fs.writeFileSync(path.join(bot.cwd,'file.md'),'retained');f.tasks.push({sourceBotId:primary.id,targetBotId:bot.id,status:'running'});
 await assert.rejects(f.operations.manageBot(bot.id,{expectedRevision:1,status:'archived'}),/BOT_BUSY/);f.tasks[0].status='completed';const archived=await f.operations.manageBot(bot.id,{expectedRevision:1,status:'archived'});assert.equal(archived.status,'archived');assert.deepEqual(archived.sessionIds,bot.sessionIds);assert.equal(fs.readFileSync(path.join(bot.cwd,'file.md'),'utf8'),'retained');await f.operations.manageBot(bot.id,{expectedRevision:2,status:'active'});await assert.rejects(f.operations.manageBot(primary.id,{expectedRevision:1,status:'archived'}),/BOT_PRIMARY_REQUIRED/);
});
test('primary identity in group reception may create/manage; no target identity may be supplied by the caller',async t=>{
 const f=fixture(t),primary=await f.primary();f.directory.groupSessionOwner=id=>id==='group-home'?primary.id:undefined;
 const bot=await f.tools.bot_create.execute({...f.fields,idempotencyKey:'group-create'},{agent:{id:'group-home'}});const edited=await f.tools.bot_update.execute({targetBotId:bot.id,expectedRevision:1,name:'群内创建的员工'},{agent:{id:'group-home'}});assert.equal(edited.id,bot.id);assert.equal(f.directory.forSession('group-home').id,primary.id);
});
test('account directories isolate provisioning receipts, names, management and dedicated workspaces',async t=>{const a=fixture(t),b=fixture(t);await a.primary();await b.primary();const first=await a.create(),second=await b.create();assert.notEqual(first.cwd,second.cwd);await assert.rejects(b.operations.manageBot(first.id,{expectedRevision:1,name:'cross-account'}),/BOT_NOT_FOUND/);});
test('manual plus uses a real form and shared owner API, not an AI draft or duplicate native editor',()=>{
 const sidebar=fs.readFileSync('plugins/naumi-enterprise/assets/bot-sidebar.js','utf8'),ui=fs.readFileSync('plugins/naumi-enterprise/assets/primary-bot.js','utf8');assert(sidebar.includes('new CustomEvent(CREATE_BOT_EVENT)'));assert(!sidebar.includes('startSession(undefined,{prompt:'));assert(ui.includes("action:'create'"));assert(ui.includes("'aria-label':'创建 Bot'"));assert(!ui.includes('contentEditable'));assert(!ui.includes('session.prompt'));
});
test('archiving while dispatch profile lookup is in flight cannot accept a task for the archived target',async()=>{
 const f=await taskFixture();try{let entered,release;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r),profile=f.runtime.profile;f.runtime.profile=async bot=>{entered();await gate;return profile(bot);};
 const pending=f.service.dispatch(f.sender,f.input());await ready;
 const management=new PrimaryBotService({directory:f.directory,getTasks:()=>f.service});await management.manageBot(f.targetBot.id,{expectedRevision:1,status:'archived'});release();await assert.rejects(pending,/BOT_ARCHIVED/);assert.equal(f.store.read().tasks.length,0);assert.equal(f.directory.forSession(f.sender.id).id,f.sourceBot.id);
 }finally{await f.cleanup();}
});
