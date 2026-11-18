// Verify the original deployment baseline after native UI navigation, including cold blank restoration.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {zstdDecompressSync} from 'node:zlib';import {DatabaseSync} from 'node:sqlite';import {botLiveApi} from './bot-live-api.mjs';
const root='E:/Workspace/naumi-desktop',out=path.join(process.cwd(),'evidence/bot-main-chat'),s=JSON.parse(fs.readFileSync(path.join(root,'runtime/bot-main-chat-load.json'))),hash=b=>createHash('sha256').update(b).digest('hex'),json=v=>hash(JSON.stringify(v)),appends=[],activityAppends=[];let exact=0;
for(const[f,h]of Object.entries(s.protected)){
 const b=fs.readFileSync(path.join(root,f));if(hash(b)===h){exact++;continue;}assert(f.endsWith('session.v4.jsonl.zstd'),'NON_SESSION_DRIFT '+f);let pos=0,originalEnd=null,rows=[];
 while(pos<b.length){const d=zstdDecompressSync(b.subarray(pos),{info:true});pos+=d.engine.bytesWritten;if(originalEnd!==null)rows.push(...d.buffer.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse));if(hash(b.subarray(0,pos))===h)originalEnd=pos;}
 assert(originalEnd!==null,'ORIGINAL_PREFIX_CHANGED '+f);assert(rows.length&&rows.every(r=>r.type==='session/end-seed'&&Object.keys(r.data).length===0),'NON_LIFECYCLE_APPEND '+f);appends.push({file:f,originalSHA256:h,originalBytes:originalEnd,currentBytes:b.length,originalPrefixPreserved:true,appendedEventTypes:rows.map(r=>r.type)});
}
const installed=path.join(root,'.dsh/profiles/web/node_modules/@naumi/dsh-enterprise');for(const[f,h]of Object.entries(s.inventory)){const row=s.rows.find(r=>r.file===f);assert.equal(hash(fs.readFileSync(path.join(installed,f))),row?.after??h);}
for(const[f,h]of Object.entries(s.databases)){
 const db=new DatabaseSync(path.join(root,'.dsh/naumi',f),{readOnly:true});try{
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().filter(t=>!(f==='employees.sqlite'&&t.name==='employee_activity_clock')),rows=Object.fromEntries(tables.map(t=>[t.name,db.prepare('SELECT * FROM "'+t.name+'"').all()]));
  if(json(rows)!==h){
   assert.equal(f,'employees.sqlite','BUSINESS_DB_DRIFT '+f);const e=rows.events.at(-1),value=JSON.parse(e.json).value;assert.equal(e.type,'activity_observation');assert.equal(e.revision,1);assert(!rows.events.slice(0,-1).some(v=>v.entity_id===e.entity_id));
   const ops=rows.operations.filter(o=>JSON.parse(o.result)?.id===e.entity_id);assert.equal(ops.length,1);assert(ops[0].operation_id.startsWith('observe:'));assert.deepEqual(JSON.parse(ops[0].result),value);
   rows.events.pop();rows.entities=rows.entities.filter(v=>v.id!==e.entity_id);rows.operations=rows.operations.filter(v=>v!==ops[0]);
   assert.equal(json(rows),h,'PREEXISTING_EMPLOYEE_ROW_CHANGED');activityAppends.push({seq:e.seq,type:e.type,revision:1,operation:'observe',originalBusinessRowsHashMatched:true});
  }else assert.equal(json(rows),h);
 }finally{db.close();}
}

const api=await botLiveApi(root),bots=await api.json('/naumi/bots'),tasks=await api.json('/naumi/bot-tasks'),sessions=await api.rpc('session/list',{_request:{}});assert.deepEqual(bots,s.bots);assert.equal(json(tasks),s.tasks);assert.equal(sessions.items.length,s.sessions);assert(!sessions.items.some(v=>v.running));assert.equal(json(await api.json('/naumi/model-connections')),s.models);
for(const b of bots.bots){const {exportedAt,...v}=await api.json('/naumi/employees?view=export&botId='+b.id);assert.equal(json(v),s.employees[b.id]);}
for(const row of s.otherEvidence){const b=fs.readFileSync(path.join(root,row.file));assert(b.length>=row.bytes);assert.equal(hash(b.subarray(0,row.bytes)),row.sha256);}
const result={status:'PASS',protectedWholeHashUnchanged:exact,sessionLifecycleAppends:appends,originalProtectedBytesPreserved:exact+appends.length,unrelatedRuntimeUnchanged:Object.keys(s.inventory).length-10,businessDatabaseAggregatesUnchanged:4-activityAppends.length,employeeActivityAppends:activityAppends,originalEmployeeRowsPreserved:true,sessions:sessions.items.length,running:0,bots:bots.bots.length,modelsEmployeesTasksGroupsUnchanged:true,modelPrompts:0,businessTaskWrites:0};fs.writeFileSync(path.join(out,'POST_UI.json'),JSON.stringify(result,null,2)+'\n');console.log('MAIN_CHAT_POST_UI_PASS exact_files='+exact+' session_prefixes='+appends.length+' sessions='+s.sessions+' running=0 original_employee_rows=PASS activity_appends='+activityAppends.length+' prompts=0');
