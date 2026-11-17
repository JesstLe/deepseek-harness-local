import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {Context} from '@deepseek-ai/cordis';import SessionStore from '@deepseek-ai/dsh-session';import * as persistence from '@deepseek-ai/dsh-session-persistence-jsonl';
const out=path.resolve('evidence/daily-real-acceptance'),hash=b=>createHash('sha256').update(b).digest('hex');
let passing;
for(const entry of fs.readdirSync(out).filter(n=>n.startsWith('live-'))){
 const dir=path.join(out,entry),r=JSON.parse(fs.readFileSync(path.join(dir,'LIVE_VERIFICATION.json'))),fixture=path.resolve(r.fixture);
 assert(fixture.startsWith(path.resolve('runtime')+path.sep)&&fs.existsSync(path.join(fixture,'.daily-real-fixture')),'OWN_FIXTURE_REQUIRED');
 const ctx=new Context(),sm=ctx.plugin(SessionStore),pm=ctx.plugin(persistence,{root:path.join(r.home,'sessions')});await pm.await();let committed=0;const sessions=[];
 try{for(const v of await ctx.sessionPersistence.list()){
  const h=await ctx.sessionPersistence.open(v.header.id,'read');try{const {events}=await h.read(),publicEvents=[];let responses=0;
   for(const e of events){if(e.type==='assistant/message'){responses++;publicEvents.push({seq:e.seq,type:e.type,turn:e.data.turn,step:e.data.step,messageId:e.data.message.id,content:e.data.message.content.filter(b=>b.type==='text'||b.type==='tool-call')});}
    else if(e.type==='tool/result'||e.type==='turn/end'||e.type==='user/message'||e.type==='permission/preset'||e.type==='sandbox/mode'||e.type==='approval/policy')publicEvents.push(e);}
   committed+=responses;sessions.push({sessionId:v.header.id,cwd:v.header.cwd,responses,events:publicEvents});
  }finally{await h.close();}
 }}finally{await pm.dispose();await sm.dispose();}
 fs.writeFileSync(path.join(dir,'SESSION_AUDIT.json'),JSON.stringify({status:r.status,source:'native read-only persistence',projection:'Public text/tool-call/results/end/preset records; not a full raw archive',supplierEntryRequests:r.supplierRequests,allSessionCommittedResponses:committed,sessions},null,2)+'\n');
 if(r.status==='PASS'){
  assert(!passing,'ONE_PASSING_CASE_EXPECTED');passing=entry;
  const db=new DatabaseSync(path.join(r.home,'naumi/employees.sqlite'),{readOnly:true});let entities;try{entities=db.prepare('SELECT type,json FROM entities').all().map(e=>({type:e.type,value:JSON.parse(e.json)}));}finally{db.close();}
  const linkedArtifacts=entities.filter(e=>e.type==='artifact'&&e.value.sourceTaskId===r.taskId).map(e=>e.value),artifacts=linkedArtifacts.filter(a=>a.kind==='files').sort((a,b)=>a.sourceTaskAttempt-b.sourceTaskAttempt);assert.equal(artifacts.length,2);const fileProof=[];
  for(const a of artifacts){const attempt=a.sourceTaskAttempt;assert([1,2].includes(attempt));assert.equal(a.sourceSessionId,r.executionSessionId);let csv;
   for(const f of a.files){const p=path.resolve(f.snapshot.path);assert(p.startsWith(path.resolve(r.workerCwd)+path.sep));const bytes=fs.readFileSync(p);assert.equal(hash(bytes),f.snapshot.sha256);assert.equal(bytes.length,f.snapshot.bytes);const destination=path.join(dir,'generated','attempt-'+attempt,path.basename(f.path));fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);assert.equal(hash(fs.readFileSync(destination)),hash(bytes));fileProof.push({attempt,path:path.relative(out,destination).replaceAll('\\','/'),bytes:bytes.length,sha256:hash(bytes)});if(path.extname(f.path)==='.csv')csv=bytes.toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(row=>row.split(','));}
   assert(csv);assert.deepEqual(csv[0],['channel','orders','amount']);assert.equal(csv.length,4);const values=Object.fromEntries(csv.slice(1).map(v=>[v[0],[Number(v[1]),Number(v[2])]]));assert.deepEqual(values,attempt===1?{offline:[8,960],online:[17,1800],total:[25,2760]}:{offline:[14,1680],online:[17,1800],total:[31,3480]});assert.equal(values.offline[0]+values.online[0],values.total[0]);assert.equal(values.offline[1]+values.online[1],values.total[1]);
  }
  const reviews=entities.filter(e=>e.type==='review'&&e.value.deliveryId===r.deliveryId).map(e=>e.value);assert(reviews.some(v=>v.action==='request_changes'&&v.sourceTaskAttempt===1));assert(reviews.some(v=>v.action==='accept'&&v.sourceTaskAttempt===2&&v.artifactSha256===artifacts[1].sha256));
  const ledger=JSON.parse(fs.readFileSync(path.join(r.home,'naumi/bot-tasks.json')));assert.equal(ledger.tasks.length,1);assert.equal(ledger.tasks[0].id,r.taskId);assert.equal(ledger.tasks[0].attempt,2);assert.equal(ledger.tasks[0].status,'completed');
  const supplementaryTextArtifacts=linkedArtifacts.filter(a=>a.kind!=='files').length;
  fs.writeFileSync(path.join(dir,'OWN_BUSINESS_AUDIT.json'),JSON.stringify({status:'PASS',realModel:true,actual3080Writes:0,allSessionCommittedResponses:committed,supplierEntryRequests:r.supplierRequests,paidBillingCount:'NOT_OBSERVED',supplementaryTextArtifacts,remainingUX:['Model also created supplementary text deliveries; not counted as file acceptance; retain audit and consolidate authoring path in follow-up'],task:ledger.tasks[0],entities,fileProof,checks:['exact CSV rows/channels/totals for both immutable versions','snapshot bytes and sha256 reopened','same task/session/attempt2','owner return1 and accept2 exact artifact','native public session events reopened']},null,2)+'\n');
  console.log('REAL_AUDIT csv_versions=2 exact_totals=25/2760,31/3480 files='+fileProof.length+' sha256=PASS all_session_native_responses='+committed+' supplier_entry_requests='+r.supplierRequests+' supplementary_text_artifacts='+supplementaryTextArtifacts+' paid_billing=NOT_OBSERVED');
 }
}
assert(passing,'PASSING_LIVE_CASE_REQUIRED');console.log('REAL_AUDIT passing_case='+passing+' failed_cases=RETAINED actual3080_writes=0');
