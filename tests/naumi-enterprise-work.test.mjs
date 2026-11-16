import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {EmployeeEnterpriseWork,createEnterpriseWorkTools} from '../plugins/naumi-enterprise/employee-enterprise-work.js';
import {EmployeeStore} from '../plugins/naumi-enterprise/employee-store.js';import {EmployeeDeviceVault} from '../plugins/naumi-enterprise/employee-device-vault.js';
async function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-business-unit-')),db=new DatabaseSync(path.join(dir,'sync.sqlite')),store=new EmployeeStore(path.join(dir,'employees.sqlite')),botId='bot-'+randomUUID(),employeeId=randomUUID(),calls=[];
 const vault=new EmployeeDeviceVault(path.join(dir,'device.dpapi'));const replies=new Map();let mode='ack',hold;
 const deviceId=randomUUID();const sync={db,store,vault,deviceId,clock:()=>Date.now(),bot:id=>{if(id!==botId)throw Error('EMP_BOT_NOT_FOUND');},offlineClaims:()=>({bindings:[{localBotId:botId,employeeId}]}),device:async body=>{calls.push(structuredClone(body));if(body.action==='authorize')return {};
   if(body.action==='execution.inspect')return {execution:{taskId:body.taskId,employeeId:body.employeeId,state:'idle',ownerDeviceId:null,fencingToken:'0'}};
   if(body.action==='execution.acquire')return {execution:{taskId:body.taskId,employeeId:body.employeeId,ownerDeviceId:deviceId,attemptId:body.attemptId,fencingToken:'1',state:'owned',leaseExpiresAt:new Date(Date.now()+120000).toISOString(),placement:'local-bound',revision:1}};
   if(body.action==='work.receipt')return replies.has(body.operationId)?{status:'acknowledged',operationId:body.operationId,result:replies.get(body.operationId)}:{status:'not_found',operationId:body.operationId};
   if(body.action==='work.read')return {tasks:[{reviews:[{id:'review-fixture',outcome:'accepted',reason:'固定验收流程'}]}]};
   if(mode==='hold')await new Promise(resolve=>{hold=resolve;});
   if(mode==='reject'){const e=Error('FORBIDDEN');e.status=403;throw e;}
   if(mode==='offline')throw Error('network unavailable');const result={id:randomUUID(),version:1};replies.set(body.operationId,result);if(mode==='lost')throw Error('ack lost');return {status:'acknowledged',operationId:body.operationId,result};}};
 const bridge=sync.enterpriseWork=new EmployeeEnterpriseWork(sync),claim=()=>({action:'work.claim',taskId:randomUUID(),revision:1,operationId:randomUUID()});
 return {dir,db,store,sync,bridge,botId,employeeId,calls,replies,claim,setMode:value=>{mode=value;},release:()=>hold?.(),close:async()=>{await bridge.close();db.close();store.close();if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('TEMP_ESCAPE');fs.rmSync(dir,{recursive:true,force:true});}};
}
test('business ledger: UNKNOWN is durable and receipt reconciliation never replays mutation',async()=>{
 const f=await fixture();try{const p=f.claim();f.setMode('lost');const result=await f.bridge.command(f.botId,p,{sessionId:'root'});assert.equal(result.status,'unknown');assert.equal(f.bridge.operations(f.botId)[0].state,'unknown');const before=f.calls.filter(c=>c.action==='work.claim').length;
 const recovered=await f.bridge.command(f.botId,p,{sessionId:'root'});assert.equal(recovered.status,'acknowledged');assert.equal(f.calls.filter(c=>c.action==='work.claim').length,before);assert.equal(f.bridge.operations(f.botId)[0].state,'acknowledged');
 await assert.rejects(f.bridge.command(f.botId,{...p,revision:2},{sessionId:'root'}),/IDEMPOTENCY_CONFLICT/);
 }finally{await f.close();}
});
test('missing remote receipt does not auto-retry; explicit owner retry retains operation and exact source',async()=>{
 const f=await fixture();try{const p=f.claim();f.setMode('offline');await f.bridge.command(f.botId,p,{sessionId:'root'});const before=f.calls.filter(c=>c.action==='work.claim').length;assert.equal((await f.bridge.command(f.botId,p,{sessionId:'root'})).status,'unknown');assert.equal(f.calls.filter(c=>c.action==='work.claim').length,before);
 f.setMode('ack');assert.equal((await f.bridge.retry(f.botId,p.operationId)).status,'acknowledged');assert.equal(f.calls.filter(c=>c.action==='work.claim').at(-1).source.sessionId,'root');assert.equal(f.calls.filter(c=>c.action==='work.claim').at(-1).operationId,p.operationId);
 }finally{await f.close();}
});
test('definitive authorization errors stay rejected, not UNKNOWN, and cannot be silently retried',async()=>{
 const f=await fixture();try{const p=f.claim();f.setMode('reject');await assert.rejects(f.bridge.command(f.botId,p),/FORBIDDEN/);assert.equal(f.bridge.operations(f.botId)[0].state,'rejected');await assert.rejects(f.bridge.retry(f.botId,p.operationId),/RETRY_NOT_UNKNOWN/);}finally{await f.close();}
});
test('concurrent same-ID changed payload rejects and shutdown waits for actual in-flight mutation',async()=>{
 const f=await fixture();try{const p=f.claim();f.setMode('hold');const promise=f.bridge.command(f.botId,p,{sessionId:'root'});while(!f.calls.some(c=>c.action==='work.claim'))await new Promise(r=>setTimeout(r,5));
 await assert.rejects(f.bridge.command(f.botId,{...p,revision:2},{sessionId:'root'}),/IDEMPOTENCY_CONFLICT/);let closed=false;const closing=f.bridge.close().then(()=>closed=true);await new Promise(r=>setTimeout(r,10));assert.equal(closed,false);f.release();await promise;await closing;assert.equal(closed,true);assert.equal(f.calls.filter(c=>c.action==='work.claim').length,1);
 }finally{await f.close();}
});
test('accepted enterprise feedback creates exactly one candidate; disabled learning does not add memory',async()=>{
 const f=await fixture();try{await f.bridge.command(f.botId,{action:'work.read'});await f.bridge.command(f.botId,{action:'work.read'});assert.equal(f.store.memories(f.botId,{status:'candidate'}).length,1);assert.equal(f.store.memories(f.botId).length,0);const p=f.store.profile(f.botId);f.store.updateProfile(f.botId,{expectedRevision:p.revision,patch:{autoLearning:false},operationId:'disable'});f.bridge.learnReviewFeedback(f.botId,{tasks:[{reviews:[{id:'different',outcome:'accepted',reason:'不自动学习'}]}]});assert.equal(f.store.memories(f.botId,{status:'candidate'}).length,1);}finally{await f.close();}
});
test('Agent tools bind the actual caller and fixed action; no upload, approval or owner retry capability',async()=>{
 const f=await fixture();try{const service={caller:(agent,write)=>{if(agent!=='lead'||write&&agent!=='lead')throw Error('EMP_CALLER_REQUIRED');return {bot:{id:f.botId},root:{id:'real-root'}};}};
 const tools=createEnterpriseWorkTools(service,f.sync);assert.deepEqual(tools.map(t=>t.name),['employee_enterprise_work','employee_enterprise_claim','employee_enterprise_submit','employee_enterprise_receipt']);await tools[0].execute({},{agent:'lead'});assert.equal(f.calls.find(c=>c.action==='work.read').employeeId,f.employeeId);
 await assert.rejects(tools[0].execute({botId:'someone-else'},{agent:'lead'}));await assert.rejects(tools[2].execute({action:'work.upload',...f.claim()},{agent:'lead'}));assert.equal(f.calls.filter(c=>c.action==='work.upload').length,0);
 await assert.rejects(tools[0].execute({},{agent:'guest'}),/CALLER_REQUIRED/);await assert.rejects(tools[0].execute({},{agent:'lead',signal:AbortSignal.abort()}),{name:'AbortError'});
 }finally{await f.close();}
});
