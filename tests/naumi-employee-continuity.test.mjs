import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EmployeeStore} from '../plugins/naumi-enterprise/employee-store.js';

test('latest explicit communication assignment is the only active style across Sessions; originals are retained',()=>{
 const s=new EmployeeStore(':memory:');try{
  const old=s.learnExplicit('bot','first','以后回复先给结论','one').memory;
  s.learnExplicit('bot','second','以后回复详细解释','two');
  assert.deepEqual(s.memories('bot').map(m=>m.text),['详细解释']);assert(!s.context('bot').includes('先给结论'));
  const row=s.memories('bot',{status:'all'}).find(m=>m.id===old.id);assert.equal(row.status,'active');assert.equal(row.effective,false);assert.equal(s.entity('bot',old.id).effective,undefined);
  assert.equal(s.export('bot').memories.length,2);assert(s.history('bot').some(e=>e.source.sessionId==='one'));
 }finally{s.close();}
});
test('forgetting current explicit style does not reactivate older assignments or erase historical sources',()=>{
 const s=new EmployeeStore(':memory:');try{
  s.learnExplicit('bot','first','以后回复先给结论','one');s.learnExplicit('bot','second','以后回复详细解释','two');
  s.learnExplicit('bot','forget','忘记我的偏好：详细解释','two');assert.equal(s.profile('bot').communicationStyle,'');assert.equal(s.memories('bot').length,0);
  assert.equal(s.export('bot').memories.length,2);assert(s.history('bot').some(e=>e.action==='explicit_forgetting'));
 }finally{s.close();}
});
test('owner changed or cleared persona supersedes accepted candidates while candidate and independent memory remain historical',()=>{
 const s=new EmployeeStore(':memory:');try{
  const candidate=s.createMemory('bot',{operationId:'candidate',kind:'preference',text:'人物设定候选：资料员',status:'candidate'},{kind:'proposal',sessionId:'one',messageId:'m',quote:'请做资料员'},{proposedProfile:{persona:'资料员'}});
  const active=s.updateMemory('bot',{operationId:'confirm',memoryId:candidate.id,expectedRevision:1,profileRevision:0,patch:{status:'active'}});assert(s.memories('bot').some(m=>m.id===active.id));
  s.updateProfile('bot',{operationId:'new-role',expectedRevision:1,patch:{persona:'设计师'}});assert(!s.memories('bot').some(m=>m.id===active.id));assert(!s.context('bot').includes('资料员'));
  assert.equal(s.memories('bot',{status:'all'}).find(m=>m.id===active.id).effective,false);assert.equal(s.entity('bot',active.id).status,'active');
 }finally{s.close();}
});
test('ordinary manual preferences and unsupported or temporary syntax do not get silently filtered or learned',()=>{
 const s=new EmployeeStore(':memory:');try{
  s.createMemory('bot',{operationId:'manual',kind:'preference',text:'先给结论'});s.learnExplicit('bot','current','以后回复详细解释','session');
  assert.equal(s.memories('bot').length,2);assert.equal(s.learnExplicit('bot','temp','这次回复简洁直接','session').learned,false);assert.equal(s.profile('bot').communicationStyle,'详细解释');
  assert.equal(s.learnExplicit('bot','quote','他说以后回复先给结论','session').learned,false);assert.equal(s.memories('other').length,0);
 }finally{s.close();}
});
test('reopened durable store yields the same effective projection without migrations, rewritten sources or shared Bot data',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-continuity-')),file=path.join(dir,'employee.sqlite');let s;try{
  s=new EmployeeStore(file);s.learnExplicit('bot','a','以后回复先给结论','one');s.learnExplicit('bot','b','以后回复简洁直接','two');const audit=s.stats().events;s.close();s=new EmployeeStore(file);
  assert.equal(s.profile('bot').communicationStyle,'简洁直接');assert.deepEqual(s.memories('bot').map(m=>m.text),['简洁直接']);assert.equal(s.stats().events,audit);assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,1);assert.equal(s.memories('other').length,0);
 }finally{s?.close();assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
});
