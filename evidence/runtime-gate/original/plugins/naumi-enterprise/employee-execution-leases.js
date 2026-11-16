import {randomUUID} from 'node:crypto';import {z} from 'zod';
const uuid=z.string().uuid(),token=z.string().regex(/^[1-9]\d{0,18}$/);
const grant=z.object({taskId:uuid,employeeId:uuid,ownerDeviceId:uuid,attemptId:uuid,fencingToken:token,state:z.literal('owned'),leaseExpiresAt:z.string().datetime(),placement:z.enum(['local-bound','cloud-bound','portable-exclusive']),revision:z.number().int().positive()}).passthrough();
const fail=code=>{throw Error(code);};
/** Durable device attempt; never invent a new attempt merely because a request or heartbeat timed out. */
export class EmployeeExecutionLeases{
 constructor(sync){this.sync=sync;this.db=sync.db;this.vault=sync.vault;this.flights=new Map();
  this.db.exec('CREATE TABLE IF NOT EXISTS execution_attempts(bot_id TEXT NOT NULL,task_id TEXT NOT NULL,employee_id TEXT NOT NULL,attempt_id TEXT NOT NULL,encrypted TEXT,PRIMARY KEY(bot_id,task_id))');
 }
 row(botId,taskId,employeeId){let r=this.db.prepare('SELECT * FROM execution_attempts WHERE bot_id=? AND task_id=?').get(botId,taskId);
  if(r&&r.employee_id!==employeeId)fail('EXECUTION_EMPLOYEE_MISMATCH');if(!r){this.db.prepare('INSERT INTO execution_attempts VALUES(?,?,?,?,NULL)').run(botId,taskId,employeeId,randomUUID());r=this.db.prepare('SELECT * FROM execution_attempts WHERE bot_id=? AND task_id=?').get(botId,taskId);}return r;
 }
 async ensure(botId,employeeId,taskId){this.sync.bot(botId);uuid.parse(employeeId);uuid.parse(taskId);const r=this.row(botId,taskId,employeeId),key=botId+'/'+taskId;
  if(this.flights.has(key))return this.flights.get(key);
  const pending=this.acquire(r).finally(()=>this.flights.delete(key));this.flights.set(key,pending);return pending;
 }
 async acquire(row){
  const info=await this.sync.device({action:'execution.inspect',employeeId:row.employee_id,taskId:row.task_id}),cached=this.cached(row.bot_id,row.task_id),current=info.execution;
  if(current?.state==='idle'&&current.ownerDeviceId===null&&BigInt(current.fencingToken)>BigInt(cached?.fencingToken??'0')){this.resetAfterRelease(row.bot_id,row.employee_id,row.task_id,current);row=this.row(row.bot_id,row.task_id,row.employee_id);}
  const r=await this.sync.device({action:'execution.acquire',employeeId:row.employee_id,taskId:row.task_id,attemptId:row.attempt_id}),g=grant.parse(r.execution);
  if(g.ownerDeviceId!==this.sync.deviceId||g.taskId!==row.task_id||g.employeeId!==row.employee_id||g.attemptId!==row.attempt_id)fail('EXECUTION_GRANT_BINDING_INVALID');
  if(Date.parse(g.leaseExpiresAt)<=this.sync.clock())fail('EXECUTION_GRANT_EXPIRED');
  this.db.prepare('UPDATE execution_attempts SET encrypted=? WHERE bot_id=? AND task_id=?').run(this.vault.seal(g),row.bot_id,row.task_id);
  return {attemptId:g.attemptId,fencingToken:g.fencingToken};
 }
 cached(botId,taskId){const r=this.db.prepare('SELECT encrypted FROM execution_attempts WHERE bot_id=? AND task_id=?').get(botId,taskId);return r?.encrypted?this.vault.unseal(r.encrypted):null;}
 async uncertain(botId,employeeId,taskId,reason){const r=this.row(botId,taskId,employeeId),g=this.cached(botId,taskId);if(!g)fail('EXECUTION_PERMIT_REQUIRED');return this.sync.device({action:'execution.uncertain',employeeId,taskId,execution:{attemptId:r.attempt_id,fencingToken:g.fencingToken},reason:z.string().trim().min(1).max(1000).parse(reason)});}
 // Reset is explicit and allowed only after an authoritative idle state with no owner.
 resetAfterRelease(botId,employeeId,taskId,execution){if(!execution||execution.ownerDeviceId!==null||execution.state!=='idle')fail('EXECUTION_STOP_CONFIRMATION_REQUIRED');const r=this.row(botId,taskId,employeeId);this.db.prepare('UPDATE execution_attempts SET attempt_id=?,encrypted=NULL WHERE bot_id=? AND task_id=?').run(randomUUID(),r.bot_id,r.task_id);}
 async close(){await Promise.allSettled([...this.flights.values()]);}
}
