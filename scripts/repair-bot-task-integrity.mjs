import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {BotTaskStore} from '../plugins/naumi-enterprise/bot-task-store.js';
export const sha=value=>createHash('sha256').update(value).digest('hex');

/** Explicit incident repair, never a startup migration or model-output blacklist. */
export function repairTaskDocument(document,expected,{time=new Date().toISOString(),uuid=randomUUID}={}){
  const next=structuredClone(document),t=next.tasks.find(t=>t.id===expected.taskId);
  assert(t,'REPAIR_TASK_NOT_FOUND');assert.equal(t.revision,expected.revision,'REPAIR_TASK_CONFLICT');
  assert.equal(t.status,'completed','REPAIR_TASK_NOT_TERMINAL');
  assert.equal(sha(t.instruction??''),expected.instructionSHA256,'REPAIR_INSTRUCTION_CHANGED');
  assert.equal(sha(t.result??''),expected.resultSHA256,'REPAIR_RESULT_CHANGED');
  assert.notEqual(expected.foreignSessionId,t.sourceSessionId,'REPAIR_NOT_FOREIGN_SESSION');
  assert.notEqual(expected.foreignSessionId,t.targetSessionId,'REPAIR_NOT_FOREIGN_SESSION');
  assert(next.outbox.some(m=>m.taskId===t.id&&m.fromSessionId===expected.foreignSessionId&&m.toSessionId===t.targetSessionId&&m.key.startsWith('continue:'+expected.foreignSessionId+':')&&m.text===t.instruction),'REPAIR_PROVENANCE_MISMATCH');
  const prior={status:t.status,revision:t.revision,attempt:t.attempt};
  // Retain all prior result/message rows. No model call, no queue, no file edits.
  t.status='interrupted';t.error='BOT_TASK_REVIEW_REQUIRED';t.revision++;t.updatedAt=time;
  for(const field of ['instruction','result','delivery','progress'])delete t[field];
  for(const m of next.outbox.filter(m=>m.taskId===t.id&&!m.delivered)){m.delivered=true;m.error='BOT_TASK_REPAIR_SUPERSEDED';}
  next.outbox.push({id:'message-'+uuid(),taskId:t.id,key:'integrity-repair:'+expected.instructionSHA256,messageId:uuid(),fromSessionId:t.targetSessionId,toSessionId:t.sourceSessionId,attempt:t.attempt,taskStatus:t.status,kind:'status',text:'任务中的联调测试要求已移除；原始需求、文件及历史记录保留。本轮测试回执不作为业务完成，等待用户明确续办。',files:[],delivered:true,createdAt:time});
  next.revision++;
  return {document:next,receipt:{taskId:t.id,prior,status:t.status,revision:t.revision,attempt:t.attempt,requiresExplicitRetry:true,queued:false,historyPreserved:true}};
}

export async function repairTaskFile({ledger,expected,evidence}){
  assert(path.isAbsolute(ledger)&&path.isAbsolute(evidence),'REPAIR_ABSOLUTE_PATH_REQUIRED');
  const original=fs.readFileSync(ledger);assert.equal(sha(original),expected.ledgerSHA256,'REPAIR_LEDGER_CONFLICT');
  const {document,receipt}=repairTaskDocument(JSON.parse(original),expected);
  fs.mkdirSync(evidence,{recursive:true});
  assert(!fs.existsSync(path.join(evidence,'repair-receipt.json')),'REPAIR_RECEIPT_ALREADY_EXISTS');
  const before=path.join(evidence,'ledger.before.json');fs.writeFileSync(before,original,{flag:'wx',mode:0o600});
  const changed=Buffer.from(JSON.stringify(document,null,2)+'\n'),temp=ledger+'.repair-'+randomUUID()+'.tmp';
  try{
    const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,changed);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    const store=new BotTaskStore(temp);try{store.read();}finally{await store.close();}
    assert.equal(sha(fs.readFileSync(ledger)),expected.ledgerSHA256,'REPAIR_LEDGER_CONFLICT');
    fs.renameSync(temp,ledger);assert.equal(sha(fs.readFileSync(ledger)),sha(changed));
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  const result={...receipt,beforeSHA256:sha(original),afterSHA256:sha(changed),backup:before};
  fs.writeFileSync(path.join(evidence,'repair-receipt.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [runtime,plan,evidence]=process.argv.slice(2);assert(runtime&&plan&&evidence,'Usage: node scripts/repair-bot-task-integrity.mjs ABS_RUNTIME PLAN_JSON ABS_PRIVATE_EVIDENCE');
  assert(path.isAbsolute(runtime),'REPAIR_ABSOLUTE_PATH_REQUIRED');
  assert(!fs.existsSync(path.join(runtime,'runtime/server.pid')),'REPAIR_STOP_SERVICE_FIRST');
  const config=JSON.parse(fs.readFileSync(path.join(runtime,'config/local.json'),'utf8'));
  const listening=await new Promise(resolve=>{const s=net.connect({host:config.host,port:config.port});s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));s.setTimeout(3000,()=>{s.destroy();resolve(true);});});
  assert(!listening,'REPAIR_PORT_STILL_ACTIVE');
  const result=await repairTaskFile({ledger:path.join(runtime,'.dsh/naumi/bot-tasks.json'),expected:JSON.parse(fs.readFileSync(plan,'utf8')),evidence});
  console.log(`REPAIR tasks=1 status=${result.status} attempt=${result.attempt} history=RETAINED model_calls=0 queued=0`);
}
