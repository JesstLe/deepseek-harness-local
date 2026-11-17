import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {EmployeeStore} from '../plugins/naumi-enterprise/employee-store.js';

function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-employee-')),file=path.join(dir,'employees.sqlite');let time=new Date('2026-11-16T10:00:00Z');const store=new EmployeeStore(file,{clock:()=>time});return {dir,file,store,setTime:value=>{time=new Date(value);},close(){store.close();assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});}};}
const update=(expectedRevision,patch,operationId='op-'+expectedRevision)=>({expectedRevision,patch,operationId});
test('AC01 empty profile has no invented identity; SQLite WAL reopen preserves profile and history',()=>{
  const f=fixture();try{
    assert.equal(f.store.profile('b').revision,0);assert.equal(f.store.profile('b').personality,'');
    assert.equal(f.store.db.prepare('PRAGMA journal_mode').get().journal_mode,'wal');
    f.store.updateProfile('b',update(0,{personality:'重视证据'}));f.store.close();
    const reopened=new EmployeeStore(f.file);try{assert.equal(reopened.profile('b').personality,'重视证据');assert.equal(reopened.history('b')[0].revision,1);assert.equal(reopened.history('b')[0].syncState,'local_only');}finally{reopened.close();}
    const moduleUrl=new URL('../plugins/naumi-enterprise/employee-store.js',import.meta.url).href;
    const child=spawnSync(process.execPath,['--input-type=module','-e',`import {EmployeeStore} from ${JSON.stringify(moduleUrl)};const s=new EmployeeStore(${JSON.stringify(f.file)});console.log(JSON.stringify(s.profile('b')));s.close();`],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout).personality,'重视证据');
  }finally{f.close();}
});
test('AC02 CAS and idempotent operation preserve one revision and reject payload changes',()=>{
  const f=fixture();try{
    const request=update(0,{workStyle:'先验证后交付'},'same');const first=f.store.updateProfile('b',request);
    assert.deepEqual(f.store.updateProfile('b',request),first);assert.equal(f.store.history('b').length,1);
    assert.throws(()=>f.store.updateProfile('b',update(0,{workStyle:'不同'},'same')),/IDEMPOTENCY_CONFLICT/);
    assert.throws(()=>f.store.updateProfile('b',update(0,{workStyle:'不同'},'other')),/EMP_CONFLICT/);
    assert.equal(f.store.profile('b').revision,1);
  }finally{f.close();}
});
test('AC03 locked profile fields and disabled learning prevent drift; manual unlock remains explicit',()=>{
  const f=fixture();try{
    f.store.updateProfile('b',update(0,{communicationStyle:'原样',lockedFields:['communicationStyle']}));
    assert.throws(()=>f.store.updateProfile('b',update(1,{communicationStyle:'改写'},'locked')),/FIELD_LOCKED/);
    assert.equal(f.store.learnExplicit('b','message-1','以后回复先给结论','s').reason,'field_locked');assert.equal(f.store.profile('b').communicationStyle,'原样');assert.equal(f.store.memories('b').length,0);
    f.store.updateProfile('b',update(1,{autoLearning:false},'off'));const n=f.store.stats().events;
    assert.equal(f.store.learnExplicit('b','message-2','记住我的偏好：少用术语','s').learned,false);assert.equal(f.store.stats().events,n);
    f.store.updateProfile('b',update(2,{lockedFields:[]},'unlock'));f.store.updateProfile('b',update(3,{communicationStyle:'已解锁'},'edit'));
    assert.equal(f.store.profile('b').communicationStyle,'已解锁');
  }finally{f.close();}
});
test('AC04 explicit learning persists attributed preference and optional style, with same-message deduplication',()=>{
  const f=fixture();try{
    const a=f.store.learnExplicit('b','m','以后回复先给结论','s'),b=f.store.learnExplicit('b','m','以后回复先给结论','s');assert.deepEqual(a,b);
    assert.equal(f.store.memories('b').length,1);assert.equal(f.store.profile('b').communicationStyle,'先给结论');assert.equal(f.store.memories('b')[0].source.messageId,'m');
    for(const text of ['这次回复先给结论','他说以后回复先给结论','以后回复先给结论\n另外做别的事','记住我的偏好：暂时不要详细','以后回复随便发挥'])assert.equal(f.store.learnExplicit('b','other-'+text,text,'s').learned,false);
    assert.equal(f.store.memories('b').length,1);
  }finally{f.close();}
});
test('AC05 profile restore creates a new revision and respects current locked fields',()=>{
  const f=fixture();try{
    f.store.updateProfile('b',update(0,{persona:'负责资料复核'}));f.store.updateProfile('b',update(1,{persona:'善于提出创意'}));
    const restored=f.store.restoreProfile('b',{expectedRevision:2,targetRevision:1,operationId:'restore'});assert.equal(restored.revision,3);assert.equal(restored.persona,'负责资料复核');
    f.store.updateProfile('b',update(3,{persona:'锁定设定',lockedFields:['persona']},'lock'));assert.throws(()=>f.store.restoreProfile('b',{expectedRevision:4,targetRevision:1,operationId:'bad-restore'}),/FIELD_LOCKED/);
    assert.equal(f.store.history('b').length,4);
  }finally{f.close();}
});
test('AC07 candidate review, correction, pin, expiry and deletion control actual retrieval',()=>{
  const f=fixture();try{
    let m=f.store.createMemory('b',{kind:'fact',text:'产品规格待确认',status:'candidate',operationId:'create'});assert.equal(f.store.memories('b').length,0);
    m=f.store.updateMemory('b',{memoryId:m.id,expectedRevision:1,patch:{status:'active',text:'产品规格已确认',pinned:true},operationId:'confirm'});assert.equal(f.store.memories('b')[0].text,'产品规格已确认');
    m=f.store.updateMemory('b',{memoryId:m.id,expectedRevision:2,patch:{expiresAt:'2026-11-16T10:01:00Z'},operationId:'expiry'});f.setTime('2026-11-16T10:02:00Z');assert.equal(f.store.memories('b').length,0);
    m=f.store.updateMemory('b',{memoryId:m.id,expectedRevision:3,patch:{status:'deleted'},operationId:'delete'});assert.equal(m.status,'deleted');assert.equal(f.store.memories('b',{status:'deleted'}).length,1);
    assert.throws(()=>f.store.updateMemory('b',{memoryId:m.id,expectedRevision:4,patch:{status:'active'},operationId:'revive'}),/MEMORY_DELETED/);assert(!f.store.context('b').includes('产品规格'));
  }finally{f.close();}
});
test('AC08 local keyword search supports Chinese, treats SQL punctuation as data and isolates Bots',()=>{
  const f=fixture();try{
    f.store.createMemory('a',{kind:'procedure',text:'产品介绍先讲适用人群',operationId:'one'});f.store.createMemory('b',{kind:'fact',text:'产品介绍绝密方案',operationId:'two'});
    assert.equal(f.store.memories('a',{query:'适用人群'}).length,1);assert.equal(f.store.memories('a',{query:"' OR 1=1 --"}).length,0);
    assert.equal(f.store.memories('a',{query:'绝密方案'}).length,0);assert.equal(f.store.memories('a',{query:'不存在'}).length,0);
    assert.throws(()=>f.store.memories('a',{limit:10000}));
  }finally{f.close();}
});
test('AC09 context excludes candidates and expires, remains bounded and rejects explicit secret patterns',()=>{
  const f=fixture();try{
    f.store.createMemory('a',{kind:'fact',text:'候选不该出现',status:'candidate',operationId:'candidate'});
    f.store.createMemory('a',{kind:'fact',text:'过期不该出现',expiresAt:'2020-01-01T00:00:00Z',operationId:'expired'});
    for(let i=0;i<12;i++)f.store.createMemory('a',{kind:'fact',text:'长文本'+i+'字'.repeat(3000),operationId:'long'+i});
    const context=f.store.context('a');assert(context.length<8192);assert(!context.includes('候选不该出现'));assert(!context.includes('过期不该出现'));
    f.store.updateProfile('a',update(0,Object.fromEntries(['communicationStyle','workStyle','personality','persona'].map(k=>[k,'\\"'.repeat(1000)])),'escaped'));
    assert(f.store.context('a').length<8192);assert.doesNotThrow(()=>JSON.parse(f.store.context('a')));
    assert.throws(()=>f.store.createMemory('a',{kind:'fact',text:'api_key=abcdef1234567890123456',operationId:'secret'}),/SECRET_PATTERN/);
    assert.throws(()=>f.store.updateProfile('a',update(0,{persona:'Bearer abcdef1234567890123456'},'secret-profile')),/SECRET_PATTERN/);
  }finally{f.close();}
});
test('candidate profile acceptance is atomic with revision check and review history',()=>{
  const f=fixture();try{
    const m=f.store.createMemory('b',{kind:'preference',text:'人物候选',status:'candidate',operationId:'candidate'},{kind:'proposal',quote:'做事更严谨'},{proposedProfile:{personality:'严谨'}});
    assert.throws(()=>f.store.updateMemory('b',{memoryId:m.id,expectedRevision:1,profileRevision:99,patch:{status:'active'},operationId:'bad'}),/EMP_CONFLICT/);
    assert.equal(f.store.entity('b',m.id).status,'candidate');assert.equal(f.store.profile('b').revision,0);
    f.store.updateMemory('b',{memoryId:m.id,expectedRevision:1,profileRevision:0,patch:{status:'active'},operationId:'accept'});assert.equal(f.store.profile('b').personality,'严谨');
  }finally{f.close();}
});
test('AC14 failed transaction rolls back entities, audit and idempotency receipts together',()=>{
  const f=fixture();try{
    f.store.beforeCommit=()=>{throw Error('injected checkpoint failure');};assert.throws(()=>f.store.updateProfile('b',update(0,{persona:'不得发布'})),/checkpoint failure/);
    assert.equal(f.store.profile('b').revision,0);assert.equal(f.store.stats().events,0);assert.equal(f.store.db.prepare('select count(*) as n from operations').get().n,0);
    f.store.beforeCommit=null;assert.equal(f.store.updateProfile('b',update(0,{persona:'重试成功'})).revision,1);
  }finally{f.close();}
});
test('two SQLite connections enforce revisions against the latest committed state',()=>{
  const f=fixture(),second=new EmployeeStore(f.file);try{
    const a=f.store.profile('b'),b=second.profile('b');assert.equal(a.revision,b.revision);
    f.store.updateProfile('b',update(a.revision,{workStyle:'第一份修改'},'first'));
    assert.throws(()=>second.updateProfile('b',update(b.revision,{workStyle:'冲突修改'},'second')),/EMP_CONFLICT/);
    assert.equal(second.profile('b').workStyle,'第一份修改');
  }finally{second.close();f.close();}
});
test('AC14 unsupported schema and corruption are never replaced by an empty database',()=>{
  const f=fixture();try{
    f.store.close();const db=new DatabaseSync(f.file);db.exec('PRAGMA user_version=99');db.close();const hash=fs.readFileSync(f.file);
    assert.throws(()=>new EmployeeStore(f.file),/SCHEMA_UNSUPPORTED/);assert.deepEqual(fs.readFileSync(f.file),hash);
    const corrupt=path.join(f.dir,'broken.sqlite');fs.writeFileSync(corrupt,'not sqlite');assert.throws(()=>new EmployeeStore(corrupt),/STORAGE_UNAVAILABLE/);assert.equal(fs.readFileSync(corrupt,'utf8'),'not sqlite');
  }finally{f.close();}
});
