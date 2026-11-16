import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {EmployeeStore} from '../plugins/naumi-enterprise/employee-store.js';
import {EmployeeActivityStore,inWorkWindow} from '../plugins/naumi-enterprise/employee-activity-store.js';
import {EmployeeObservation} from '../plugins/naumi-enterprise/employee-observation.js';
import {EmployeeCapabilities} from '../plugins/naumi-enterprise/employee-capabilities.js';
import {NativeBrowserRuntime} from '../plugins/naumi-enterprise/native-browser-runtime.js';
import {EmployeeWorkStore} from '../plugins/naumi-enterprise/employee-work-store.js';
import {employeeHost} from './helpers/employee-host.mjs';
const require=createRequire(import.meta.url),{startBridge}=require('../desktop/app/tools.cjs');
const config=(patch={})=>({title:'工作巡检',trigger:{kind:'every',seconds:60},action:{kind:'notify',text:'核对待办'},workWindow:{timeZone:'UTC',days:[1,2,3,4,5,6,7],startMinute:0,endMinute:1440},cooldownSeconds:60,maxActions:5,...patch});
function fixture(file=':memory:'){
  let ms=Date.parse('2031-01-06T10:00:00Z');const store=new EmployeeStore(file,{clock:()=>new Date(ms)}),activity=new EmployeeActivityStore(store);
  const command=(action,args={})=>activity.command({botId:'bot-1',operationId:randomUUID(),action,...args});
  const create=(patch={})=>command('rule_create',{config:config(patch)}),enable=r=>command('rule_enable',{ruleId:r.id,expectedRevision:r.revision,enabled:true});
  return {store,activity,create,enable,command,advance:n=>ms+=n,clock:()=>ms,close:()=>store.close()};
}
test('owner approval, revision CAS, config edits revoke approval; exact retries are idempotent',()=>{
  const f=fixture();try{const c={action:'rule_create',botId:'bot-1',operationId:'stable',config:config()},r=f.activity.command(c);assert.deepEqual(f.activity.command(c),r);f.advance(60000);assert.equal(f.activity.tick(['bot-1']).actions,0);
    const on=f.enable(r);assert.throws(()=>f.enable(r),/CONFLICT/);const changed=f.command('rule_update',{ruleId:on.id,expectedRevision:on.revision,config:config({title:'新规则'})});assert.equal(changed.enabled,false);assert.notEqual(changed.configVersion,on.configVersion);
    assert.throws(()=>f.activity.command({...c,config:config({title:'different'})}),/IDEMPOTENCY_CONFLICT/);
  }finally{f.close();}
});
test('interval firing commits local notification with receipt and cumulative limit; no replay storm',()=>{
  const f=fixture();try{const r=f.enable(f.create({maxActions:2}));f.advance(60000*1000);assert.equal(f.activity.tick(['bot-1']).actions,1);assert.equal(f.activity.tick(['bot-1']).actions,0);
    const receipt=f.activity.runs('bot-1')[0];assert.equal(receipt.modelCalls,0);assert.equal(receipt.externalActions,0);assert.equal(f.activity.notifications('bot-1').length,1);
    f.advance(60000);assert.equal(f.activity.tick(['bot-1']).actions,1);assert.equal(f.activity.rule('bot-1',r.id).enabled,false);assert.throws(()=>f.enable(f.activity.rule('bot-1',r.id)),/ACTION_LIMIT/);
  }finally{f.close();}
});
test('quiet periods defer actions, timezone windows respect DST/weekdays, no ordinary quiet-time notifications',()=>{
  const f=fixture();try{f.enable(f.create({workWindow:{timeZone:'UTC',days:[1],startMinute:660,endMinute:720}}));f.advance(60000);assert.equal(f.activity.tick(['bot-1']).actions,0);f.advance(60*60000);assert.equal(f.activity.tick(['bot-1']).actions,1);
    const w={timeZone:'America/New_York',days:[7],startMinute:180,endMinute:240};assert.equal(inWorkWindow(w,Date.parse('2031-03-09T07:30:00Z')),true);assert.equal(inWorkWindow(w,Date.parse('2031-03-09T06:30:00Z')),false);
  }finally{f.close();}
});
test('event scope is Bot-local; overdue goal stable dedupe survives disable/re-enable',()=>{
  const f=fixture();try{const work=new EmployeeWorkStore(f.store),g=work.createGoal('bot-1',{title:'到期目标',criteria:['交付'],dueAt:new Date(f.clock()-1000).toISOString(),operationId:'g'});work.createGoal('bot-2',{title:'其他员工',criteria:['交付'],dueAt:new Date(f.clock()-1000).toISOString(),operationId:'g'});
    let r=f.enable(f.create({trigger:{kind:'goal_due',goalId:g.id}}));assert.equal(f.activity.tick(['bot-1']).actions,1);r=f.activity.rule('bot-1',r.id);r=f.command('rule_enable',{ruleId:r.id,expectedRevision:r.revision,enabled:false});r=f.enable(r);f.advance(60000);assert.equal(f.activity.tick(['bot-1']).actions,0);assert.equal(f.activity.notifications('bot-2').length,0);
    assert.throws(()=>f.create({trigger:{kind:'goal_due',goalId:'goal-foreign'}}),/NOT_FOUND/);
  }finally{f.close();}
});
test('queue action persists a planned goal with criteria; it does not dispatch, claim, or accept',()=>{
  const f=fixture();try{f.enable(f.create({action:{kind:'queue_goal',title:'待办工作',description:'核对资料',criteria:['完整清单']}}));f.advance(60000);f.activity.tick(['bot-1']);const g=new EmployeeWorkStore(f.store).goals('bot-1')[0];assert.equal(g.status,'planned');assert.deepEqual(g.criteria,['完整清单']);assert(g.sourceRunId);assert.equal(f.store.entitiesOfType('bot-1','delivery').length,0);
  }finally{f.close();}
});
test('single at trigger is durable and one-shot; changed content needs new approval',()=>{
  const f=fixture();try{const at=new Date(f.clock()+60000).toISOString(),r=f.enable(f.create({trigger:{kind:'at',at}}));f.advance(120000);assert.equal(f.activity.tick(['bot-1']).actions,1);f.enable(f.activity.rule('bot-1',r.id));f.advance(60000);assert.equal(f.activity.tick(['bot-1']).actions,0);
  }finally{f.close();}
});
test('effects, rule cursor and occurrence receipt roll back together after interrupted commit',()=>{
  const f=fixture();try{f.enable(f.create());f.advance(60000);f.store.beforeCommit=()=>{throw Error('injected disk failure');};assert.throws(()=>f.activity.tick(['bot-1']),/injected/);assert.equal(f.activity.runs('bot-1').length,0);assert.equal(f.activity.notifications('bot-1').length,0);f.store.beforeCommit=null;assert.equal(f.activity.tick(['bot-1']).actions,1);
  }finally{f.close();}
});
test('restart and second connection preserve receipt/cursor, clock rollback freezes rules without deleting data',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-activity-')),file=path.join(dir,'employees.sqlite'),f=fixture(file);let other;
  try{f.enable(f.create());f.advance(60000);f.activity.tick(['bot-1']);other=new EmployeeStore(file,{clock:()=>new Date(f.clock())});const reopened=new EmployeeActivityStore(other);assert.equal(reopened.tick(['bot-1']).actions,0);assert.equal(reopened.runs('bot-1').length,1);f.advance(-120000);assert.equal(f.activity.tick(['bot-1']).clockRollback,true);assert.equal(f.activity.notifications('bot-1').length,1);f.advance(180000);assert.equal(f.activity.tick(['bot-1']).actions,1);
  }finally{other?.close();f.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('invalid scope, arbitrary shell/model/external actions, secrets and invalid windows are rejected',()=>{
  const f=fixture();try{for(const c of [config({action:{kind:'shell',command:'x'}}),config({model:'x'}),config({workWindow:{...config().workWindow,timeZone:'invalid'}}),config({trigger:{kind:'every',seconds:1}}),config({title:'apikey=sk-12345678901234567890123456'})])assert.throws(()=>f.command('rule_create',{config:c}));
  }finally{f.close();}
});
test('no-progress uses artifact evidence, never heartbeat or self-reported claims; waits/faults remain distinct',()=>{
  const f=fixture(),agent={id:'session-1',status:'running'},directory={forSession:id=>id===agent.id?{id:'bot-1',status:'active'}:null},agents={get:id=>id===agent.id?agent:null},o=new EmployeeObservation({store:f.store,directory,agents,noProgressMs:1000});
  try{o.record(agent,'running');f.advance(2000);assert.equal(o.read('bot-1').sessions[0].noProgress,true);o.report(agent,{state:'working',note:'我有进展',operationId:'report'});assert.equal(o.read('bot-1').progress,null);assert.equal(o.read('bot-1').sessions[0].noProgress,true);
    o.report(agent,{state:'waiting_user',note:'等待确认',operationId:'wait'});assert.equal(o.read('bot-1').sessions[0].noProgress,false);assert.equal(o.read('bot-1').sessions[0].workState,'waiting_user');
    o.record(agent,'fault');agent.status='idle';o.record(agent,'idle');assert.equal(o.read('bot-1').sessions[0].workState,'fault');agent.status='running';o.record(agent,'running');assert.equal(o.read('bot-1').sessions[0].workState,'working');
    const work=new EmployeeWorkStore(f.store),g=work.createGoal('bot-1',{title:'G',criteria:['C'],operationId:'g'});work.createDelivery('bot-1',{goalId:g.id,title:'D',fileName:'交付.md',content:'真实已保存产物',operationId:'d'},{kind:'agent',sessionId:agent.id});assert.equal(o.read('bot-1').progress.kind,'artifact');assert(o.read('bot-1').sessions[0].progress);
    agents.get=()=>null;assert.equal(o.read('bot-1').sessions[0].runtimeState,'unknown');assert.equal(o.read('bot-1').heartbeatIsProgress,false);
  }finally{f.close();}
});
test('capabilities distinguish registered tools from auth/health, expiration and bundled CLI inventory',async()=>{
  let now=10000;const c=new EmployeeCapabilities({ctx:{tools:{definitions:()=>[{name:'mcp__naumi_desktop__desktop_status'},{name:'naumi_browser'}]}},clock:()=>now,desktop:()=>({version:'1.3.1'}),browser:{health:async()=>({installed:true,connected:false,healthy:false,engine:'chromium',reasonCode:'NATIVE_BROWSER_DISCONNECTED'}),dispose:async()=>{}}});
  try{await Promise.all([c.refresh(),c.refresh()]);const r=c.read('bot-1').records;assert.equal(r.find(v=>v.id==='desktop').connected,null);assert.equal(r.find(v=>v.id==='desktop').authorized,null);assert.equal(r.find(v=>v.id==='dingtalk').inventoryScope,'naumi_bundle');assert.equal(r.find(v=>v.id==='browser').healthy,false);now+=180001;assert(c.read('bot-1').records.every(r=>r.stale));assert(!JSON.stringify(r).includes('token'));
  }finally{await c.close();}
});
test('browser health is authenticated, no snapshot/content/input; stale descriptors never imply a live bridge',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-health-'));let bridge;
  const native=new NativeBrowserRuntime({home:dir,legacy:{status:()=>({installed:true}),dispose:async()=>{}}});
  try{bridge=await startBridge({home:dir,guests:{selected(){throw Error('health must not inspect pages');}},window:{}});const d=JSON.parse(fs.readFileSync(path.join(dir,'naumi-desktop-bridge.json')));assert.equal((await native.health()).healthy,true);assert.equal((await fetch('http://127.0.0.1:'+d.port+'/health')).status,403);
    const body=await (await fetch('http://127.0.0.1:'+d.port+'/health',{headers:{Authorization:'Bearer '+d.token}})).json();assert.deepEqual(Object.keys(body).sort(),['engine','ok','pid','protocolVersion']);await bridge.close();bridge=null;fs.writeFileSync(path.join(dir,'naumi-desktop-bridge.json'),JSON.stringify(d));assert.equal((await native.health()).connected,false);
  }finally{await bridge?.close();await native.dispose();fs.rmSync(dir,{recursive:true,force:true});}
});
test('real Cordis owner HTTP admits rules, rejects guest/CSRF/unknown actions, archived Bot cannot execute',async()=>{
  const f=await employeeHost();try{const url=f.origin+'/naumi/employee-activity',botId=f.sourceBot.id,post=(body,headers={})=>fetch(url,{method:'POST',headers:{cookie:'fixture-owner',origin:f.origin,'Content-Type':'application/json','x-naumi-employee-activity':'1',...headers},body:JSON.stringify(body)}),body={action:'rule_create',botId,operationId:'create',config:config()};
    const r=await post(body);assert.equal(r.status,200);const rule=await r.json();assert.equal(rule.enabled,false);assert.equal((await post({...body,action:'rule_enable',ruleId:rule.id})).status,400);
    assert.equal((await post(body,{cookie:'fixture-guest'})).status,403);assert.equal((await post(body,{origin:'https://foreign.invalid'})).status,403);assert.equal((await post(body,{'x-naumi-employee-activity':''})).status,403);assert.equal((await fetch(url+'?botId='+botId)).status,401);
    const get=await fetch(url+'?botId='+botId,{headers:{cookie:'fixture-owner'}});assert.equal(get.status,200);const value=await get.json();assert.equal(value.scheduler.modelCalls,0);assert.equal(value.rules.length,1);
    const tool=f.sender.tools.get('employee_activity_report');tool.execute({state:'waiting_dependency',note:'缺少输入',operationId:'r'},{agent:f.sender});assert.equal(f.runtime.activityRuntime.observation.read(botId).sessions[0].workState,'waiting_dependency');
    assert.equal(f.creations.length,0);assert.equal(f.store.entitiesOfType(botId,'goal').length,0);
    await f.directory.update(f.sender.id,{expectedRevision:f.sourceBot.revision,status:'archived'});assert.equal((await post({...body,operationId:'archive'})).status,403);assert.equal(f.creations.length,0);
  }finally{await f.cleanup();}
});
test('the real process timer executes due approved rules without Agent wakeups or LLM calls',async()=>{
  const f=await employeeHost({activityOptions:{intervalMs:20}});try{
    let now=Date.parse('2031-01-06T10:00:00Z');f.store.clock=()=>new Date(now);const a=f.runtime.activityRuntime.activity,botId=f.sourceBot.id;
    const r=a.command({action:'rule_create',botId,operationId:'timer-create',config:config()});a.command({action:'rule_enable',botId,ruleId:r.id,expectedRevision:r.revision,operationId:'timer-enable',enabled:true});now+=60000;
    await new Promise(r=>setTimeout(r,100));assert.equal(a.runs(botId).length,1);assert.equal(f.creations.length,0);assert.equal(f.runtime.activityRuntime.read(botId).scheduler.modelCalls,0);
    assert.equal((await f.sender.tools.get('employee_capabilities').execute({},{agent:f.sender})).toolPermissionNotInferred,true);
  }finally{await f.cleanup();}
});
