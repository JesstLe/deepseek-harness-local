import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {BotDirectory,PrimaryBotService} from '../plugins/naumi-enterprise/bots.js';
import {BotGroupStore} from '../plugins/naumi-enterprise/bot-group-store.js';
import {BotGroupService} from '../plugins/naumi-enterprise/bot-group-service.js';
import {enterBotMode} from '../plugins/naumi-enterprise/assets/primary-bot.js';

function fixture(t){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-primary-')),file=path.join(home,'bots.json'),directory=new BotDirectory(file),sessions=new Map(),created=[];
 const model={provider:'configured',model:'same-model',reasoningEffort:'high'},workspace={id:'existing',path:home};
 const runtime={async snapshot(id){return sessions.get(id);},async ensure(id,config){if(!sessions.has(id)){created.push({id,config});sessions.set(id,{header:{cwd:config.cwd},events:[]});}},deliver(){throw Error('MODEL_CALL_FORBIDDEN');}};
 const options={directory,getRuntime:()=>runtime,workspaceRegistry:{list:()=>[workspace],get:id=>id==='existing'?workspace:undefined,archivedSessionIds:[]},agentPresets:{resolve:async()=>({id:'standard'})},agentDefaultModel:{currentSelection:()=>structuredClone(model)}};
 const cleanup=[];const service=new PrimaryBotService(options),input={action:'create-primary',requestId:randomUUID(),expectedRevision:0,name:'我的助手'};
 t.after(async()=>{await directory.close();for(const close of cleanup)close();assert(home.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(home,{recursive:true,force:true});});
 return {cleanup,home,file,directory,sessions,created,runtime,options,service,input,model,workspace};
}
test('primary is explicit and absent reads never provision an identity',t=>{const f=fixture(t);assert.equal(f.directory.primary(),null);assert(!fs.existsSync(f.file));});
test('create provisions one durable native home without prompting; workspace/preset/model/default permissions inherited',async t=>{
 const f=fixture(t),bot=await f.service.execute({...f.input,appearance:{shape:'creator',palette:'pink'}});
 assert.equal(f.directory.primary().id,bot.id);assert.equal(bot.homeSessionId,f.created[0].id);assert.equal(bot.cwd,f.home);assert.equal(bot.agentPreset,'standard');assert.deepEqual(f.created[0].config,{create:true,cwd:f.home,profile:{agentPreset:'standard',model:f.model,permissions:[]}});assert.equal(bot.appearance.shape,'creator');assert(!f.directory.list().primarySetup);
 const reopened=new BotDirectory(f.file);assert.deepEqual(reopened.primary(),bot);await reopened.close();
});
test('same UUID concurrent services reserve a single Bot/session; runtime ensure is idempotent',async t=>{
 const f=fixture(t),other=new PrimaryBotService(f.options),values=await Promise.all(Array.from({length:10},(_,i)=>(i%2?other:f.service).execute(f.input)));
 assert.equal(new Set(values.map(b=>b.id)).size,1);assert.equal(f.created.length,1);assert.equal(f.directory.list().bots.length,1);assert.equal(f.directory.list().revision,2);
});
test('failed ensure persists reservation, another request is rejected and restart retries original IDs',async t=>{
 const f=fixture(t),ensure=f.runtime.ensure;f.runtime.ensure=async()=>{throw Error('ENSURE_FAILED');};
 await assert.rejects(f.service.execute(f.input),/ENSURE_FAILED/);const pending=f.directory.list().primarySetup;assert(pending);assert.equal(f.directory.primary(),null);
 await assert.rejects(f.service.execute({...f.input,requestId:randomUUID()}),/BOT_PRIMARY_PENDING/);
 await assert.rejects(f.service.execute({...f.input,name:'changed'}),/BOT_PRIMARY_REQUEST_CONFLICT/);
 const reopened=new BotDirectory(f.file);try{f.runtime.ensure=ensure;const bot=await new PrimaryBotService({...f.options,directory:reopened}).execute({...f.input,expectedRevision:1});assert.equal(bot.id,pending.botId);assert.equal(bot.homeSessionId,pending.sessionId);assert.equal(f.created.length,1);}finally{await reopened.close();}
});
test('checkpoint failures before reservation create no Session; after ensure remain recoverable',async t=>{
 const f=fixture(t),write=f.directory.write;f.directory.write=async()=>{throw Error('DISK_FAILED');};await assert.rejects(f.service.execute(f.input),/DISK_FAILED/);assert.equal(f.created.length,0);assert.equal(f.directory.list().revision,0);
 f.directory.write=async next=>{if(next.primaryBotId)throw Error('COMMIT_FAILED');return write(next);};await assert.rejects(f.service.execute(f.input),/COMMIT_FAILED/);assert.equal(f.created.length,1);const pending=f.directory.list().primarySetup;
 f.directory.write=write;const bot=await f.service.execute(f.input);assert.equal(bot.homeSessionId,pending.sessionId);assert.equal(f.created.length,1);
});
test('native workspace attachment must persist before publishing primary and retries the original home',async t=>{
 const f=fixture(t);let failing=true;const attached=[];f.workspace.attachSession=async id=>{if(failing)throw Error('ATTACH_FAILED');attached.push(id);};
 await assert.rejects(f.service.execute(f.input),/ATTACH_FAILED/);assert.equal(f.directory.primary(),null);const pending=f.directory.list().primarySetup;
 failing=false;const bot=await f.service.execute(f.input);assert.deepEqual(attached,[pending.sessionId]);assert.equal(bot.homeSessionId,pending.sessionId);assert.equal(f.created.length,1);
});
test('CAS conflict, missing workspace and deleted default refuse partial bootstrap',async t=>{
 const f=fixture(t);await assert.rejects(f.service.execute({...f.input,expectedRevision:4}),/BOT_CONFLICT/);assert(!fs.existsSync(f.file));
 await assert.rejects(f.service.execute({...f.input,workspaceId:'missing'}),/BOT_WORKSPACE_REQUIRED/);
 const service=new PrimaryBotService({...f.options,workspaceRegistry:{list:()=>[]},workspaceController:{initializeDefault:async()=>undefined}});await assert.rejects(service.execute(f.input),/BOT_WORKSPACE_REQUIRED/);assert.equal(f.created.length,0);
});
test('native default workspace controller wrapper is resolved through registry, not treated as filesystem path',async t=>{
 const f=fixture(t);let list=[];const service=new PrimaryBotService({...f.options,workspaceRegistry:{list:()=>list},workspaceController:{initializeDefault:async()=>{list=[f.workspace];return {workspace:{workspaceId:'existing',path:f.home}};}}});assert.equal((await service.execute(f.input)).cwd,f.home);
});
async function staff(f,name='主管',sid='old-home'){f.sessions.set(sid,{header:{cwd:f.home},events:[]});return f.directory.create({sessionId:sid,cwd:f.home},{name,kind:'agent',purpose:'已有职责'});}
test('old accounts never infer primary from name/order; explicit claim preserves all Bot bytes and sessions',async t=>{
 const f=fixture(t),bot=await staff(f),other=await staff(f,'运营','worker');assert.equal(f.directory.primary(),null);const before=f.directory.list().bots;
 const chosen=await f.service.execute({action:'select-primary',botId:other.id,expectedRevision:2});assert.equal(chosen.id,other.id);assert.deepEqual(f.directory.list().bots,before);assert.equal(f.created.length,0);
 await assert.rejects(f.service.execute({action:'select-primary',botId:bot.id,expectedRevision:3}),/BOT_PRIMARY_ALREADY_SET/);
 await f.directory.update('worker',{expectedRevision:1,name:'改名'});assert.equal(f.directory.primary().id,other.id);await assert.rejects(f.directory.update('worker',{expectedRevision:2,status:'archived'}),/BOT_PRIMARY_REQUIRED/);
});
test('claim validates root home, archive and live Session existence',async t=>{
 const f=fixture(t),bot=await staff(f);const input={action:'select-primary',botId:bot.id,expectedRevision:1};
 f.sessions.delete('old-home');await assert.rejects(f.service.execute(input),/BOT_SESSION_NOT_FOUND/);
 f.sessions.set('old-home',{header:{cwd:f.home,origin:'subagent'}});await assert.rejects(f.service.execute(input),/BOT_ROOT_SESSION_REQUIRED/);
 f.sessions.set('old-home',{header:{cwd:f.home}});f.options.workspaceRegistry.archivedSessionIds.push('old-home');await assert.rejects(f.service.execute(input),/BOT_PRIMARY_HOME_ARCHIVED/);
 f.options.workspaceRegistry.archivedSessionIds=[];await f.directory.update('old-home',{expectedRevision:1,status:'archived'});await assert.rejects(f.service.execute({...input,expectedRevision:2}),/BOT_ARCHIVED/);assert.equal(f.directory.primary(),null);
});
test('two account profile directories have independent primary IDs, Sessions and reservations',async t=>{const a=fixture(t),b=fixture(t);await a.service.execute(a.input);assert.equal(b.directory.primary(),null);await b.service.execute(b.input);assert.notEqual(a.directory.primary().id,b.directory.primary().id);assert.notEqual(a.directory.primary().homeSessionId,b.directory.primary().homeSessionId);});
test('Bot entry requires ready catalog and opens the stable main chat without creating or selecting a task',async()=>{
 const calls=[],ctx={layout:{beginNavigation(){},selectPanel:id=>calls.push(id)},uiWorkspace:{openSession:id=>calls.push(id)}};
 assert.throws(()=>enterBotMode(ctx,{status:'error',bots:[]}),/BOT_DIRECTORY_UNAVAILABLE/);assert.deepEqual(calls,[]);
 await enterBotMode(ctx,{status:'ready',bots:[]});assert.equal(calls.pop(),'naumi-primary-bot');await enterBotMode(ctx,{status:'ready',primaryBotId:'b',bots:[{id:'b',status:'active',homeSessionId:'home',sessionIds:['home','running-task']}]});assert.equal(calls.pop(),'home');
});
test('primary alignment preserves legacy member Sessions/posts and reserves a thirteenth legacy seat without dropping staff',async t=>{
 const f=fixture(t),store=new BotGroupStore(path.join(f.home,'groups.sqlite'));f.cleanup.push(()=>store.db.close());
 const bots=[];for(let i=0;i<13;i++)bots.push(await staff(f,'员工'+i,'s'+i));const legacy=store.create({id:randomUUID(),name:'旧群',botIds:bots.slice(0,12).map(b=>b.id),defaultBotId:bots[1].id},()=>{});
 const post=store.post({id:randomUUID(),roomId:legacy.id,text:'旧消息',botIds:[]},()=>[legacy.members[0]]),before=store.posts(legacy.id);
 await f.directory.choosePrimary(bots[12].id,f.directory.list().revision);
 const service=new BotGroupService({directory:f.directory,store,getTasks:()=>null});service.kick=async()=>{};service.alignPrimary();service.alignPrimary();
 const migrated=store.room(legacy.id);assert.equal(migrated.members.length,13);assert.deepEqual(migrated.members.slice(0,12),legacy.members);assert.deepEqual(store.posts(legacy.id),before);assert.equal(migrated.defaultBotId,bots[12].id);
 assert.throws(()=>service.create({id:randomUUID(),name:'超员',botIds:bots.slice(0,12).map(b=>b.id),defaultBotId:null}),/BOT_GROUP_MEMBER_LIMIT/);
 const room=service.create({id:randomUUID(),name:'新群',botIds:[bots[0].id,bots[1].id],defaultBotId:bots[1].id});assert.equal(room.defaultBotId,bots[12].id);assert.equal(room.members[0].botId,bots[12].id);
 const send=(text,botIds=[])=>{const p=service.post({id:randomUUID(),roomId:room.id,text,botIds});return store.posts(room.id).find(row=>row.seq===p.seq).replies;};
 assert.equal(send('普通消息')[0].botId,bots[12].id);assert.equal(send('@员工0 明确点名')[0].botId,bots[0].id);assert.equal(send('明确目标',[bots[1].id])[0].botId,bots[1].id);assert(post.seq);
});
