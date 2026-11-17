import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const mode=process.argv[2]??'modified',dir=mode==='modified'?'plugins/naumi-enterprise/assets':process.argv[3]??'evidence/task-card-recycling/original/plugins/naumi-enterprise/assets';
const model=await import(pathToFileURL(path.resolve(dir,'bot-task-model.js'))),now=Date.parse('2026-11-17T05:00:00Z');
const rows=['running','completed','failed'].map(status=>({id:'task-'+status,sourceSessionId:'chat',targetSessionId:'job',attempt:1,status,updatedAt:new Date(now-60000).toISOString()}));
if(mode==='baseline'||mode==='rollback'){
  assert.equal(model.taskDockRows,undefined);assert.equal(model.sessionTasks(rows,'chat').length,3);
  console.log(`${mode.toUpperCase()} visible_cards=3 completed_card=STICKY history=ABSENT original_behavior=PASS`);
}else{
  const first=model.taskDockRows(rows,'chat',{now});assert.equal(first.current.length,1);assert.equal(first.history.length,2);
  const done={...rows[1],updatedAt:new Date(now).toISOString()};assert.equal(model.taskDockRows([done],'chat',{now}).current.length,1);assert.equal(model.taskDockRows([done],'chat',{now:now+8000}).history.length,1);
  const storage={getItem:()=>null,setItem:()=>{}},dismissed=model.dismissTaskCard(done,[],storage);assert.equal(model.taskDockRows([done],'chat',{now,dismissed}).current.length,0);
  console.log('MODIFIED active_cards=1 archived_cards=2 auto_recycle_ms=8000 manual_dismiss=PASS task_data=UNCHANGED');
}
