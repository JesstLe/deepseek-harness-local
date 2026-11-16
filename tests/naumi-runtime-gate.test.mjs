import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createUserMessage} from '@deepseek-ai/dsh-llm';import {EmployeeRuntimeGate} from '../plugins/naumi-enterprise/employee-runtime-gate.js';import {managedRuntimeHost} from './helpers/managed-runtime-host.mjs';
const denied=result=>{assert.equal(result.isError,true);return result.error.message;};
const waitUntil=async fn=>{const end=Date.now()+5000;while(!fn()){if(Date.now()>end)throw Error('FIXTURE_WAIT_TIMEOUT');await new Promise(r=>setTimeout(r,10));}};

test('real tool pipeline preserves unmanaged sessions and owner binding is paused, immutable, CAS and idempotent',async()=>{
 const f=await managedRuntimeHost();try{
  assert.equal((await f.invoke('external_write',f.other)).isError,false);const p={action:'attach',botId:f.bot.id,sessionId:f.root.id,taskId:f.taskId,allowedTools:['external_write'],allowOfflineLocal:true,operationId:'stable'};
  const b=await f.runtime.gate.command(p);assert.equal(b.state,'paused');assert.deepEqual(await f.runtime.gate.command(p),b);assert.match(denied(await f.invoke('external_write')),/RUNTIME_PAUSED/);
  await assert.rejects(f.attach(),/IMMUTABLE/);await assert.rejects(f.command('resume',{expectedRevision:999}),/CONFLICT/);await f.resume();assert.equal((await f.invoke('external_write')).isError,false);
  assert.equal(f.root.model.current().model,'fixture-model');assert.equal(f.externalCalls,2);
 }finally{await f.cleanup();}
});
test('a later allow policy cannot override the monotonic guard; task and scope expansion are denied',async()=>{
 const f=await managedRuntimeHost();let override;try{await f.attach();await f.resume();override=f.ctx.on('tools/pre-execute',(_exec,_next)=>({kind:'allow'}),true);
  assert.match(denied(await f.invoke('employee_enterprise_submit',f.root,{taskId:randomUUID()})),/TASK_SCOPE_MISMATCH/);
  assert.match(denied(await f.invoke('bot_dispatch')),/SCOPE_CHANGE/);
  assert.equal(f.runtime.gate.deny({agent:f.root,name:'run_code'}),'RUNTIME_PROGRAM_TRANSPORT_DISABLED');
  const b=f.runtime.gate.binding(f.root.id);await f.command('pause',{expectedRevision:b.revision});assert.match(denied(await f.invoke('external_write')),/RUNTIME_PAUSED/);assert.equal(f.externalCalls,0);
 }finally{override?.();await f.cleanup();}
});
test('control-center loss and expired lease preserve signed local work/inference but block external effects',async()=>{
 const f=await managedRuntimeHost();try{await f.attach();await f.resume();f.setNetwork(false);f.advance(31000);f.runtime.gate.tick();
  assert.equal(f.runtime.gate.mode(f.runtime.gate.binding(f.root.id)).mode,'local_only');assert.equal((await f.invoke('employee_work')).isError,false);assert.equal((await f.invoke('employee_delivery_create')).isError,false);assert.match(denied(await f.invoke('external_write')),/LEASE_UNAVAILABLE/);assert.equal(f.externalCalls,0);
  f.root.steer(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'继续本地分析'}]}));await f.root.whenIdle();assert.equal(f.modelCalls,1);assert(f.root.session.snapshotEvents().some(e=>e.type==='assistant/message'));
 }finally{await f.cleanup();}
});
test('actual AgentLoop parks paused input before model step; owner resume does not auto-wake/replay',async()=>{
 const f=await managedRuntimeHost();try{await f.attach();const message=createUserMessage({source:{kind:'user'},content:[{type:'text',text:'受管执行测试'}]});f.root.steer(message);await f.root.whenIdle();
  assert.equal(f.modelCalls,0);assert(!f.root.session.snapshotEvents().some(e=>e.type==='step/start'));assert.equal(f.root.session.snapshotEvents().filter(e=>e.type==='turn/end').at(-1).data.reason.kind,'blocked');
  await f.resume();await new Promise(r=>setTimeout(r,30));assert.equal(f.modelCalls,0);
 }finally{await f.cleanup();}
});
test('expired/revoked signed authorization denies real model entry while owner history remains readable',async()=>{
 const f=await managedRuntimeHost();try{await f.attach();await f.resume();f.claims.expiresAt=new Date(f.now-1).toISOString();f.refreshClaims();
  assert.match(denied(await f.invoke('employee_work')),/EMP_AUTH_/);f.root.steer(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'不得绕过过期授权'}]}));await f.root.whenIdle();assert.equal(f.modelCalls,0);assert.equal(f.runtime.gate.read(f.bot.id).bindings.length,1);
 }finally{await f.cleanup();}
});
test('last-mile streaming model gate rechecks policy after pre-step and cancels a live request with hook attribution',async()=>{
 const f=await managedRuntimeHost();try{await f.attach();await f.resume();let entered=false;
  f.setModelHook(async function*(options){entered=true;await new Promise((resolve,reject)=>{if(options.signal.aborted)reject(options.signal.reason);else options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});yield {type:'finish',reason:{kind:'stop'}};});
  f.root.steer(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'等待中的模型请求'}]}));await waitUntil(()=>entered);const b=f.runtime.gate.binding(f.root.id);await f.command('pause',{expectedRevision:b.revision});await f.root.whenIdle();
  assert.equal(f.root.status,'idle');assert.equal(f.modelCalls,1);const end=f.root.session.snapshotEvents().filter(e=>e.type==='turn/end').at(-1);assert.equal(end.data.reason.kind,'aborted');assert.equal(end.data.reason.reason.kind,'hook');
 }finally{await f.cleanup();}
});
test('in-flight external operation loses permit, aborts cooperatively, persists UNKNOWN and cannot auto-resume',async()=>{
 const f=await managedRuntimeHost();try{await f.attach();await f.resume();let entered=false;f.setExternalHook(exec=>new Promise((resolve,reject)=>{entered=true;exec.signal.addEventListener('abort',()=>reject(exec.signal.reason),{once:true});}));
  const operation=f.invoke('external_write');await waitUntil(()=>entered);f.setNetwork(false);f.advance(31000);f.runtime.gate.tick();assert.equal((await operation).isError,true);
  let b=f.runtime.gate.binding(f.root.id);assert(b.unknown);assert.equal(f.store.entitiesOfType(f.bot.id,'managed_tool')[0].state,'unknown');await assert.rejects(f.resume(),/RESULT_UNRESOLVED/);
  f.setNetwork(true);f.advance(6000);f.runtime.gate.tick();await Promise.allSettled([...f.runtime.gate.remoteReports.values()]);assert.equal(f.remote.state,'unknown');
  b=f.runtime.gate.binding(f.root.id);await assert.rejects(f.command('resolve_unknown',{expectedRevision:b.revision,confirmedStopped:true,reason:'已核对原执行器停止'}),/SERVER_STOP_CONFIRMATION/);
  f.release();b=f.runtime.gate.binding(f.root.id);await f.command('resolve_unknown',{expectedRevision:b.revision,confirmedStopped:true,reason:'已核对原执行器停止'});await f.resume();assert.equal(f.runtime.gate.binding(f.root.id).fencingToken,'3');
 }finally{await f.cleanup();}
});
test('process-style reopen freezes running external receipts without changing attempt or replaying effects',async()=>{
 const f=await managedRuntimeHost();try{await f.attach();await f.resume();const b=f.runtime.gate.binding(f.root.id),id='interrupted-'+randomUUID();
  f.store.mutate(f.bot.id,id,'test_running',{}, {kind:'owner'},()=>f.store.put({id,botId:f.bot.id,revision:1,rootSessionId:f.root.id,state:'running',attemptId:b.attemptId},'managed_tool','test_running',{kind:'owner'}));
  const reopened=new EmployeeRuntimeGate({ctx:f.ctx,directory:f.directory,store:f.store,sync:f.sync,clock:()=>f.now});assert.equal(reopened.binding(f.root.id).unknown.code,'RUNTIME_PROCESS_INTERRUPTED');assert.equal(reopened.binding(f.root.id).attemptId,b.attemptId);assert.equal(f.externalCalls,0);await reopened.close();
 }finally{await f.cleanup();}
});
test('real parent/fork scope inherits admission, and unrelated Bot/session cannot take the managed task',async()=>{
 const f=await managedRuntimeHost();try{await f.attach();const child=await f.create(undefined,f.root);assert.match(denied(await f.invoke('external_write',child)),/PAUSED/);await f.resume();assert.equal((await f.invoke('external_write',child)).isError,false);assert.equal((await f.invoke('external_write',f.other)).isError,false);
  await assert.rejects(f.command('attach',{sessionId:f.other.id,taskId:f.taskId,allowedTools:[],allowOfflineLocal:true}),/SESSION_BOT_MISMATCH/);
 }finally{await f.cleanup();}
});
test('offline switch is explicit, local inference capability is required even with a valid lease',async()=>{
 const f=await managedRuntimeHost();try{await f.attach({allowOfflineLocal:false});await f.resume();f.advance(31000);assert.equal(f.runtime.gate.inference(f.runtime.gate.binding(f.root.id)),'RUNTIME_LEASE_UNAVAILABLE');
  f.claims.capabilities=['local.read','local.draft'];f.refreshClaims();assert.equal(f.runtime.gate.inference(f.runtime.gate.binding(f.root.id)),'RUNTIME_INFERENCE_NOT_AUTHORIZED');
 }finally{await f.cleanup();}
});
test('owner HTTP rejects guest/CSRF/oversize/extra fields; reads never acquire or wake a session',async()=>{
 const f=await managedRuntimeHost();try{const url=f.origin+'/naumi/employee-runtime-gate',body={action:'attach',botId:f.bot.id,sessionId:f.root.id,taskId:f.taskId,allowedTools:[],allowOfflineLocal:true,operationId:'http'},post=(body,headers={})=>fetch(url,{method:'POST',headers:{cookie:'fixture-owner',origin:f.origin,'Content-Type':'application/json','x-naumi-runtime-gate':'1',...headers},body:JSON.stringify(body)});
  assert.equal((await fetch(url+'?botId='+f.bot.id)).status,401);assert.equal((await post(body,{cookie:'fixture-guest'})).status,403);assert.equal((await post(body,{origin:'https://foreign.invalid'})).status,403);assert.equal((await post({...body,tenantId:randomUUID()})).status,400);assert.equal((await post({...body,operationId:'x'.repeat(33000)})).status,413);assert.equal((await post(body)).status,200);
  const data=await (await fetch(url+'?botId='+f.bot.id,{headers:{cookie:'fixture-owner'}})).json();assert.equal(data.bindings[0].state,'paused');assert.equal(f.remote.ownerDeviceId,null);assert.equal(f.modelCalls,0);
 }finally{await f.cleanup();}
});
test('policy edits require pause, retain identity, and stopped bindings remain denial tombstones',async()=>{
 const f=await managedRuntimeHost();try{await f.attach();await f.resume();let b=f.runtime.gate.binding(f.root.id);await assert.rejects(f.command('configure',{expectedRevision:b.revision,allowedTools:[],allowOfflineLocal:false}),/PAUSE_REQUIRED/);await f.command('pause',{expectedRevision:b.revision});b=f.runtime.gate.binding(f.root.id);await f.command('configure',{expectedRevision:b.revision,allowedTools:[],allowOfflineLocal:false});await f.resume();assert.match(denied(await f.invoke('external_write')),/TOOL_NOT_APPROVED/);b=f.runtime.gate.binding(f.root.id);await f.command('stop',{expectedRevision:b.revision});assert.match(denied(await f.invoke('external_write')),/STOPPED/);await assert.rejects(f.resume(),/STOPPED/);
 }finally{await f.cleanup();}
});
test('stopped UNKNOWN tombstones can be reconciled only after server release, but never resumed',async()=>{
 const f=await managedRuntimeHost();try{await f.attach();await f.resume();let b=f.runtime.gate.binding(f.root.id);f.runtime.gate.unknown(b,'RUNTIME_TOOL_RESULT_UNKNOWN','fixture-tool');b=f.runtime.gate.binding(f.root.id);await f.command('stop',{expectedRevision:b.revision});f.release();b=f.runtime.gate.binding(f.root.id);const resolved=await f.command('resolve_unknown',{expectedRevision:b.revision,confirmedStopped:true,reason:'原执行器停止与业务结果已核对'});assert.equal(resolved.state,'stopped');assert.equal(resolved.unknown,null);await assert.rejects(f.resume(),/STOPPED/);
 }finally{await f.cleanup();}
});
test('the actual LlmRuntime provider boundary denies session-bound auxiliary calls, not only Agent pre-step',async()=>{
 const f=await managedRuntimeHost();try{await f.attach();await assert.rejects(async()=>{for await(const _ of f.ctx.llm.stream({provider:'fixture',model:'fixture-model',sessionId:f.root.id,messages:[createUserMessage({source:{kind:'user'},content:[{type:'text',text:'fixture'}]})]})){}},/RUNTIME_PAUSED/);assert.equal(f.modelCalls,0);
 }finally{await f.cleanup();}
});
test('storage failure cannot postpone permit-loss cancellation or reopen external admission',async()=>{
 const f=await managedRuntimeHost();try{await f.attach();await f.resume();let entered=false,aborted=false;f.setExternalHook(exec=>new Promise((resolve,reject)=>{entered=true;exec.signal.addEventListener('abort',()=>{aborted=true;reject(exec.signal.reason);},{once:true});}));const operation=f.invoke('external_write');await waitUntil(()=>entered);f.setNetwork(false);f.advance(31000);f.store.beforeCommit=()=>{throw Error('fixture disk failure');};f.runtime.gate.tick();assert(aborted);assert((await operation).isError);assert.equal(f.runtime.gate.mode(f.runtime.gate.binding(f.root.id)).reason,'RUNTIME_RESULT_UNRESOLVED');await assert.rejects(f.resume(),/RESULT_UNRESOLVED/);
 }finally{f.store.beforeCommit=null;await f.cleanup();}
});
