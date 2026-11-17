import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {taskDockRows,TASK_CARD_RETENTION_MS,taskCardIdentity,dismissTaskCard,readTaskCardDismissals,TASK_CARD_DISMISSALS_KEY} from '../plugins/naumi-enterprise/assets/bot-task-model.js';

const now=Date.parse('2026-11-17T05:00:00Z');
const task=(status,age=0,extra={})=>({id:'task-'+status,sourceSessionId:'chat',targetSessionId:'worker',status,attempt:1,revision:2,updatedAt:new Date(now-age).toISOString(),...extra});
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};

test('old settled cards recycle immediately while all active/unknown states stay visible without mutation',()=>{
  const tasks=['queued','starting','running','waiting','future-state','completed','failed','cancelled','interrupted'].map(s=>task(s,600000)),before=JSON.stringify(tasks);
  const view=taskDockRows(tasks,'chat',{now});
  assert.deepEqual(new Set(view.current.map(t=>t.status)),new Set(['queued','starting','running','waiting','future-state']));
  assert.equal(view.history.length,4);assert.equal(view.errors,2);assert.equal(view.nextExpiry,null);assert.equal(JSON.stringify(tasks),before);
  assert.equal(taskDockRows(tasks,'other',{now}).current.length,0);
});

test('a new completion gets eight seconds then moves to history without another HTTP event',()=>{
  const tasks=[task('completed'),task('cancelled',1000)];
  const first=taskDockRows(tasks,'chat',{now});assert.equal(first.current.length,2);assert.equal(first.nextExpiry,now+TASK_CARD_RETENTION_MS-1000);
  const next=taskDockRows(tasks,'chat',{now:now+TASK_CARD_RETENTION_MS});assert.equal(next.current.length,0);assert.equal(next.history.length,2);assert.equal(next.nextExpiry,null);
  assert.equal(taskDockRows(tasks,'worker',{now:now+TASK_CARD_RETENTION_MS}).history.length,2);
});

test('expanded results stay readable until collapsed; manual dismissal overrides the reading pin',()=>{
  const t=task('completed',60000),pinned=[t.id];
  assert.equal(taskDockRows([t],'chat',{now,pinned}).current.length,1);
  assert.equal(taskDockRows([t],'chat',{now,pinned}).nextExpiry,null);
  assert.equal(taskDockRows([t],'chat',{now,pinned,dismissed:[taskCardIdentity(t)]}).history.length,1);
  assert.equal(taskDockRows([t],'chat',{now}).current.length,0);
});

test('manual recycling persists on refresh, is bounded and never hides running work or its new attempt',()=>{
  const storage=memory(),t=task('completed');const dismissed=dismissTaskCard(t,[],storage);
  assert.deepEqual(readTaskCardDismissals(storage),dismissed);assert.equal(taskDockRows([t],'chat',{now,dismissed:readTaskCardDismissals(storage)}).current.length,0);
  const retry={...t,status:'running',attempt:2};assert.equal(taskDockRows([retry],'chat',{now,dismissed}).current.length,1);
  assert.equal(dismissTaskCard(retry,dismissed,storage),dismissed);
  assert.equal(taskDockRows([{...retry,status:'completed'}],'chat',{now,dismissed}).current.length,1);
  const many=Array.from({length:600},(_,i)=>'old-'+i);assert.equal(dismissTaskCard(t,many,storage).length,500);
  assert(!storage.getItem(TASK_CARD_DISMISSALS_KEY).includes('sourceSessionId'));
});

test('invalid storage, disabled persistence and invalid/future timestamps never strand terminal cards or break chat',()=>{
  const storage=memory();storage.setItem(TASK_CARD_DISMISSALS_KEY,'not-json');assert.deepEqual(readTaskCardDismissals(storage),[]);
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};
  assert.deepEqual(readTaskCardDismissals(blocked),[]);assert.equal(dismissTaskCard(task('failed'),[],blocked).length,1);
  for(const updatedAt of ['invalid',new Date(now+60000).toISOString()])assert.equal(taskDockRows([task('completed',0,{updatedAt})],'chat',{now}).history.length,1);
});

test('UI uses one expiry timer and retains explicit history, result preview and the native input/model ownership',()=>{
  const ui=fs.readFileSync('plugins/naumi-enterprise/assets/bot-task-ui.js','utf8');
  assert(ui.includes('view.nextExpiry'));assert(!ui.includes('setInterval'));assert(ui.includes('clearTimeout(timer)'));
  assert(ui.includes('nbt-history-toggle'));assert(ui.includes('historyLimit'));assert(ui.includes('sidebarRight.openResource'));
  assert(ui.includes("name:'conversation.input.dock'"));assert(!ui.includes('session.prompt'));assert(!ui.includes('localStorage.clear'));
});
