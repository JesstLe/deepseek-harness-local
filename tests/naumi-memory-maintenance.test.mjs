import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {EmployeeStore} from '../plugins/naumi-enterprise/employee-store.js';
import {EmployeeMemoryMaintenance} from '../plugins/naumi-enterprise/employee-memory-maintenance.js';
import {employeeHost} from './helpers/employee-host.mjs';
const fixture=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-memory-maint-')),store=new EmployeeStore(path.join(dir,'employees.sqlite'),{clock:()=>new Date('2026-11-16T12:00:00Z')}),m=new EmployeeMemoryMaintenance(store);return {dir,store,m,close(){store.close();if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('TEMP_ESCAPE');fs.rmSync(dir,{recursive:true,force:true});}};};
const memory=(f,text,overrides={})=>f.store.createMemory('a',{kind:'procedure',text,operationId:crypto.randomUUID(),...overrides},{kind:'owner',note:crypto.randomUUID()});
test('maintenance preview is deterministic/read-only; exact same facts merge, preserve all sources and syncable tombstones',()=>{
 const f=fixture();try{const a=memory(f,'先给结论'),b=memory(f,'先给结论',{pinned:true});const before=f.store.stats().events,p=f.m.preview('a');assert.equal(p.duplicates.length,1);assert.equal(f.store.stats().events,before);
 const request={keepId:a.id,refs:p.duplicates[0].refs,operationId:'merge'};const result=f.m.merge('a',request);assert.equal(result.kept.pinned,true);assert.equal(result.kept.mergedFrom[0].source.note,b.source.note);assert.equal(f.store.entity('a',b.id).status,'deleted');assert.equal(f.store.entity('a',b.id).mergedInto,a.id);assert.deepEqual(f.m.merge('a',request),result);assert.equal(f.m.preview('a').duplicates.length,0);assert.equal(f.store.memories('a').length,1);
 }finally{f.close();}
});
test('different statuses, candidate profile changes and expiry are not silently merged; stale refs reject atomically',()=>{
 const f=fixture();try{const a=memory(f,'同一事实'),b=memory(f,'同一事实',{status:'candidate'});assert.equal(f.m.preview('a').duplicates.length,0);
 assert.throws(()=>f.m.merge('a',{keepId:a.id,refs:[a,b].map(({id,revision})=>({id,revision})),operationId:'bad'}),/DIFFERENT_FACTS/);assert.equal(f.store.entity('a',a.id).revision,1);
 f.store.updateMemory('a',{memoryId:a.id,expectedRevision:1,operationId:'update',patch:{text:'新的事实'}});assert.throws(()=>f.m.merge('a',{keepId:a.id,refs:[a,b].map(({id,revision})=>({id,revision})),operationId:'stale'}),/EMP_CONFLICT/);
 }finally{f.close();}
});
test('expiry cleanup needs explicit selected revisions and preserves history; nonexpired member aborts entire batch',()=>{
 const f=fixture();try{const expired=memory(f,'已过期',{expiresAt:'2026-11-15T12:00:00Z'}),valid=memory(f,'有效',{expiresAt:'2026-11-18T12:00:00Z'});assert.equal(f.m.preview('a').expired.length,1);assert.equal(f.store.memories('a').length,1);
 assert.throws(()=>f.m.expire('a',{refs:[expired,valid].map(({id,revision})=>({id,revision})),operationId:'wrong'}),/NOT_EXPIRED/);assert.equal(f.store.entity('a',expired.id).status,'active');f.m.expire('a',{refs:[{id:expired.id,revision:1}],operationId:'expire'});assert.equal(f.store.entity('a',expired.id).status,'deleted');assert.ok(f.store.history('a').some(e=>e.action==='memory_expire'));
 }finally{f.close();}
});
test('manual import previews source/count/dedup and imports candidate only, never forges genuine-user attribution',()=>{
 const f=fixture();try{memory(f,'已存在');const raw=[{kind:'procedure',text:'已存在'},{kind:'procedure',text:'新增流程',source:{kind:'external',note:'source file A'}},{kind:'procedure',text:'新增流程'}];const preview=f.m.previewImport('a',raw);assert.equal(preview.candidateCount,1);assert.equal(preview.duplicateCount,2);
 assert.throws(()=>f.m.import('a',{records:preview.input,digest:'0'.repeat(64),operationId:'wrong'}),/PREVIEW_MISMATCH/);
 const result=f.m.import('a',{records:preview.input,digest:preview.digest,operationId:'import'});assert.equal(result.imported,1);assert.equal(result.memories[0].status,'candidate');assert.equal(result.memories[0].source.kind,'owner');assert.equal(result.memories[0].importSource.kind,'external');assert.equal(f.store.memories('a').length,1);assert.equal(f.store.memories('b',{status:'all'}).length,0);
 assert.throws(()=>f.m.previewImport('a',[{kind:'fact',text:'password=abcdefghi'}]),/SECRET_PATTERN/);assert.throws(()=>f.m.previewImport('a',Array.from({length:101},()=>({kind:'fact',text:'test'}))));
 }finally{f.close();}
});
test('maintenance operations roll back all entity/tombstone/audit writes on storage failure',()=>{
 const f=fixture();try{const a=memory(f,'重复'),b=memory(f,'重复');const before=f.store.stats();f.store.beforeCommit=()=>{throw Error('injected write failure');};assert.throws(()=>f.m.merge('a',{keepId:a.id,refs:[a,b].map(({id,revision})=>({id,revision})),operationId:'fail'}),/injected/);f.store.beforeCommit=null;assert.deepEqual(f.store.stats(),before);assert.equal(f.store.entity('a',b.id).status,'active');}finally{f.close();}
});
test('owner HTTP preview/import/merge/expire enforces owner, origin, strict body and Bot identity',async()=>{
 const f=await employeeHost();try{const botId=f.sourceBot.id;const req=async(body,cookie='fixture-owner')=>fetch(f.origin+'/naumi/employees'+(body?'':'?botId='+botId+'&view=maintenance'),{method:body?'POST':'GET',headers:{cookie,origin:f.origin,'content-type':'application/json','x-naumi-employees':'1'},...(body?{body:JSON.stringify({botId,operationId:'maint-http',...body})}:{})});
 assert.equal((await req()).status,200);assert.equal((await req(null,'fixture-guest')).status,403);const response=await req({action:'memory_import_preview',records:[{kind:'fact',text:'人工导入测试'}]});assert.equal(response.status,200);const p=await response.json();assert.equal(p.candidateCount,1);
 const imported=await req({action:'memory_import',records:p.input,digest:p.digest,operationId:'import'});assert.equal(imported.status,200);assert.equal((await imported.json()).memories[0].status,'candidate');assert.equal((await req({action:'memory_import',records:p.input,digest:p.digest,unknown:true})).status,400);
 }finally{await f.cleanup();}
});
