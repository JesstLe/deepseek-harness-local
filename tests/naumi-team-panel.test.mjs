import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Session,SessionId,appendPluginRecord} from '@deepseek-ai/dsh-session';
import {Context} from '@deepseek-ai/cordis';
import {SessionProjectionRegistry} from '@deepseek-ai/dsh-session-projection';
import {TEAM_PROFILE_EVENT,teamProfileProjection,createTeamProfileService,createTeamProfileTools,installTeamProfile} from '../plugins/naumi-enterprise/team-profile.js';
import {teamTaskGroups,teamSchedules,scheduleTime,scheduleToggleRequest,memberState,teamInitials,readEnvironment} from '../plugins/naumi-enterprise/assets/team-panel-model.js';

function fixture({flush=async()=>true}={}){
  const root={id:'team-a',session:Session.create(SessionId('team-a'))},member={id:'member-a'},foreign={id:'foreign'},rootB={id:'team-b',session:Session.create(SessionId('team-b'))};
  const members=new Map([[root,{root,id:root.id,role:'lead',name:'lead'}],[member,{root,id:root.id,role:'teammate',name:'chosen-by-agent'}],[rootB,{root:rootB,id:rootB.id,role:'lead',name:'lead'}]]);
  const ctx={agentTeams:{membership:agent=>{const value=members.get(agent);if(!value)throw Error('INVALID_AGENT');return value;}},sessions:{flush}};
  const projection={stateOf:session=>session.snapshotEvents().reduce(teamProfileProjection.apply,teamProfileProjection.init(session.header))};
  return {root,rootB,member,foreign,ctx,projection,service:createTeamProfileService(ctx,projection,{now:()=>new Date('2026-11-16T08:00:00Z').toISOString()})};
}
test('unnamed team has no invented business name or fixed member aliases',async()=>{
  const f=fixture();assert.deepEqual(await f.service.read(f.root),{teamId:'team-a',revision:0,name:null,updatedAt:null});
  const source=fs.readFileSync('plugins/naumi-enterprise/assets/team-panel.js','utf8');
  assert(source.includes('member.name'));assert(source.includes('profile?.name'));assert(!/impl-dev|test-dev|docs-dev|研发团队|运营团队/.test(source));
});
test('real plugin record is durable/replayable and keeps model-visible history unchanged',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-team-profile-'));
  try{
    const f=fixture({flush:async session=>{fs.writeFileSync(path.join(dir,session.id+'.json'),JSON.stringify({header:session.header,events:session.snapshotEvents()}));return true;}});
    const seq=f.root.session.seq;
    const result=await f.service.update(f.root,{name:'内容研究与验证小组',expectedRevision:0});assert.equal(result.name,'内容研究与验证小组');assert.equal(result.revision,1);assert.equal(f.root.session.seq,seq+1);
    const stored=JSON.parse(fs.readFileSync(path.join(dir,'team-a.json'),'utf8'));
    assert.equal(stored.events.at(-1).type,TEAM_PROFILE_EVENT);assert.equal(stored.events.at(-1).ignorable,true);
    const restored=Session.create(SessionId('team-a'),stored.events,stored.header);
    assert.deepEqual(f.projection.stateOf(restored),result);
    assert.equal(stored.events.filter(e=>e.surfaceOp).length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('projection registry publishes and replays the new field without changing other views',async()=>{
  const ctx=new Context(),registry=new SessionProjectionRegistry(ctx),handle=await registry.register(teamProfileProjection);
  try{
    const f=fixture();const service=createTeamProfileService(f.ctx,handle);
    assert.equal(handle.stateOf(f.root.session).name,null);
    await service.update(f.root,{name:'Agent 自主命名',expectedRevision:0});
    assert.equal(handle.stateOf(f.root.session).name,'Agent 自主命名');
    const restored=Session.create(SessionId('team-a'),f.root.session.snapshotEvents(),f.root.session.header);
    assert.equal(handle.stateOf(restored).name,'Agent 自主命名');
    await service.dispose();
  }finally{await handle.dispose();}
});
test('only exact live Lead may update; teammate can read its lead profile',async()=>{
  const f=fixture();await f.service.update(f.root,{name:'自主团队',expectedRevision:0});
  assert.equal((await f.service.read(f.member)).name,'自主团队');
  assert.throws(()=>f.service.update(f.member,{name:'changed',expectedRevision:1}),/LEAD_REQUIRED/);
  assert.throws(()=>f.service.update(f.foreign,{name:'changed',expectedRevision:1}),/INVALID_AGENT/);
  assert.throws(()=>f.service.update(undefined,{name:'changed',expectedRevision:1}),/CALLER_REQUIRED/);
  assert.equal((await f.service.read(f.rootB)).name,null);
});
test('concurrent expectedRevision writes serialize: one success, one conflict',async()=>{
  const f=fixture();const outcomes=await Promise.allSettled([f.service.update(f.root,{name:'第一个名字',expectedRevision:0}),f.service.update(f.root,{name:'第二个名字',expectedRevision:0})]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.match(outcomes.find(r=>r.status==='rejected').reason.message,/CONFLICT/);
  assert.equal((await f.service.read(f.root)).revision,1);
});
test('renaming affects display only, same-name update is an idempotent no-op',async()=>{
  const f=fixture();await f.service.update(f.root,{name:'  第一阶段  ',expectedRevision:0});const n=f.root.session.seq;
  assert.equal((await f.service.update(f.root,{name:'第一阶段',expectedRevision:1})).revision,1);assert.equal(f.root.session.seq,n);
  const next=await f.service.update(f.root,{name:'第二阶段',expectedRevision:1});assert.equal(next.revision,2);assert.equal(next.teamId,'team-a');assert.equal(f.root.id,'team-a');
});
test('invalid names, revisions and aborted calls leave the log unchanged',async()=>{
  const f=fixture();const seq=f.root.session.seq;
  for(const name of ['', '  ', 'x'.repeat(81), 'x\ny', 'x\u0000y'])assert.throws(()=>f.service.update(f.root,{name,expectedRevision:0}));
  for(const expectedRevision of [undefined,-1,0.1,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>f.service.update(f.root,{name:'valid',expectedRevision}));
  await assert.rejects(f.service.update(f.root,{name:'valid',expectedRevision:0},{signal:AbortSignal.abort()}));assert.equal(f.root.session.seq,seq);
});
test('failed persistence is never reported as a successful name change',async()=>{
  let fail=true;const f=fixture({flush:async session=>{if(fail&&session.seq>0)throw Error('disk unavailable');return true;}});
  await assert.rejects(f.service.update(f.root,{name:'名称',expectedRevision:0}),/disk unavailable/);
  fail=false;assert.equal((await f.service.read(f.root)).name,'名称');
  await assert.rejects(f.service.update(f.root,{name:'other',expectedRevision:0}),/CONFLICT/);
});
test('forked and unrelated plugin events cannot masquerade as the current team profile',async()=>{
  const f=fixture();await f.service.update(f.root,{name:'原团队',expectedRevision:0});
  const fork=Session.create(SessionId('fork-b'),f.root.session.snapshotEvents());assert.equal(f.projection.stateOf(fork).name,null);
  const state=teamProfileProjection.init(f.root.session.header);
  assert.equal(teamProfileProjection.apply(state,{type:'unrelated',data:{name:'Wrong'}}),state);
});
test('malformed or skipped-revision profile record preserves last value and stops writes',()=>{
  const f=fixture();appendPluginRecord(f.root.session,TEAM_PROFILE_EVENT,{teamId:'team-a',revision:4,name:'bad',updatedAt:'2026-11-16T08:00:00.000Z'});
  const state=f.projection.stateOf(f.root.session);assert.equal(state.name,null);assert.equal(state.failure,'TEAM_PROFILE_INVALID_RECORD');
});
test('tools derive identity from exec.agent and do not accept a browser teamId',async()=>{
  const f=fixture(),[get,update]=createTeamProfileTools(f.service);
  assert.equal(get.name,'team_profile_get');assert.equal(update.name,'team_profile_update');assert(!Object.hasOwn(update.parameters,'teamId'));
  const current=await get.execute({}, {agent:f.root});
  const result=await update.execute({name:'工具自主选择的名字',expectedRevision:current.revision},{agent:f.root,signal:new AbortController().signal});
  assert.equal(result.name,'工具自主选择的名字');assert.deepEqual(JSON.parse(update.output.render({},result)[0].text),result);
});
test('profile disposal rejects further tool calls',async()=>{
  const f=fixture();await f.service.dispose();await assert.rejects(f.service.read(f.root),/CLOSED/);assert.throws(()=>f.service.update(f.root,{name:'x',expectedRevision:0}),/CLOSED/);
});
test('installer only registers for accepted members and cleans exact agent scopes',async()=>{
  const events=new Map(),effects=[],toolNames=[],sections=[];let disposed=0;
  const member={ctx:{tools:{register:t=>{toolNames.push(t.name);return()=>{disposed++;};}},systemPrompt:{section:s=>{sections.push(s);return()=>{disposed++;};},getSectionOrder:()=>20}}};
  const other={};const f=fixture();
  const scope={...f.ctx,agentTeams:{...f.ctx.agentTeams,tryMembership:agent=>agent===member?{}:undefined},sessionProjections:{register:async()=>f.projection},agents:{list:()=>[member,other]},on:(event,fn)=>events.set(event,fn),effect:fn=>effects.push(fn())};
  await installTeamProfile({inject:(_required,fn)=>fn(scope)});
  assert.deepEqual(toolNames,['team_profile_get','team_profile_update']);assert.match(sections[0].text,/autonomously/);
  events.get('agent/created')({agent:member});assert.equal(toolNames.length,2);
  events.get('agent/disposed')({agent:member});assert.equal(disposed,3);await effects[0]();
});
test('task groups use authoritative statuses and keep source collection untouched',()=>{
  const tasks=Object.freeze([{id:'1',status:'pending'},{id:'2',status:'completed'},{id:'3',status:'in_progress'},{id:'4',status:'deleted'}]);
  const result=teamTaskGroups({tasks});assert.deepEqual(result.active.map(t=>t.id),['3','1']);assert.deepEqual(result.completed.map(t=>t.id),['2']);assert.equal(tasks[0].id,'1');
});
test('schedule rows include only the current lead and preserve pause and delivery-floor semantics',()=>{
  const base={target:{sessionId:'lead'},scheduledAt:'2026-11-17T00:00:00Z'};
  const rows=[{...base,id:'paused',status:'paused'},{...base,id:'active',status:'active',deliveryFloorEndsAt:'2026-11-17T02:00:00Z'},{...base,id:'ended',status:'ended'},{id:'foreign',status:'active',target:{sessionId:'someone-else'}},{id:'involved',status:'active',involvedSessionIds:['lead'],scheduledAt:'2026-11-17T01:00:00Z'}];
  assert.deepEqual(teamSchedules(rows,'lead').map(r=>r.id),['involved','active','paused']);assert.equal(scheduleTime(rows[1]),Date.parse('2026-11-17T02:00:00Z'));
});
test('schedule toggles preserve CAS and never alter prompt, timing or target',()=>{
  assert.deepEqual(scheduleToggleRequest({id:'a',status:'active',updatedAt:'version'}),{id:'a',action:'update',patch:{active:false},expectedUpdatedAt:'version'});
  assert.deepEqual(scheduleToggleRequest({id:'b',status:'paused'}),{id:'b',action:'update',patch:{active:true},expectedUpdatedAt:null});
  assert.throws(()=>scheduleToggleRequest({id:'a',status:'active',executionActive:true}));assert.throws(()=>scheduleToggleRequest({id:'a',status:'ended'}));
});
test('member states distinguish no running turn from completion and unavailable status',()=>{
  assert.equal(memberState({phase:'active'},null,null),'unknown');assert.equal(memberState({phase:'active'},{running:false}), 'inactive');
  assert.equal(memberState({phase:'active'},{running:true,pendingInteraction:true}),'waiting');assert.equal(memberState({phase:'failed'},{running:true}),'failed');
  assert.equal(teamInitials('智能研究'),'智能');assert.equal(teamInitials('👩‍💻团队'),'👩‍💻团');
});
test('environment inspection makes only two fixed GETs and preserves installed vs connected',async()=>{
  const requests=[];const result=await readEnvironment(async(url,options)=>{requests.push([url,options]);return Response.json(url.endsWith('desktop')?{status:'ready',toolCount:75}:{status:'installed'});});
  assert.deepEqual(requests.map(([u,o])=>[u,o.method]),[['/naumi/desktop','GET'],['/naumi/browser','GET']]);assert.equal(result.browser.value.status,'installed');assert.equal(result.desktop.value.toolCount,75);
  const failure=await readEnvironment(async()=>new Response('',{status:401}));assert.equal(failure.desktop.state,'error');
});
test('the existing brand/sidebar/model CSS outside the right panel remains byte-equivalent',()=>{
  const original=fs.readFileSync('evidence/naumi-team-panel/original/plugins/naumi-enterprise/assets/style.css','utf8');
  assert.equal(fs.readFileSync('plugins/naumi-enterprise/assets/style.css','utf8'),original.slice(0,original.indexOf('/* UI-only context composition')));
});
test('new assets are shipped in the plugin package and exposed by explicit allowlist only',()=>{
  const pkg=JSON.parse(fs.readFileSync('plugins/naumi-enterprise/package.json','utf8')),host=fs.readFileSync('plugins/naumi-enterprise/host.js','utf8');
  assert(pkg.files.includes('team-profile.js'));assert(pkg.files.includes('assets'));
  for(const asset of ['team-panel.js','team-panel-model.js','team-panel.css'])assert(host.includes("['"+asset+"'"));
  assert(!host.includes('/naumi/team-profile'));assert(host.includes('installTeamProfile(ctx)'));
});
