import {createHash} from 'node:crypto';
import {z} from 'zod';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {EmployeeExecutionLeases} from './employee-execution-leases.js';
const uuid=z.string().uuid(),task={taskId:uuid},source=z.object({sessionId:z.string().min(1).max(200).optional(),localDeliveryId:z.string().max(200).optional()}).strict();
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const fail=code=>{throw Error(code);};
export const enterpriseWorkCommand=z.discriminatedUnion('action',[
 z.object({action:z.literal('work.read'),taskId:uuid.optional(),after:z.string().max(50).default(''),limit:z.number().int().min(1).max(50).default(50)}).strict(),
 z.object({action:z.literal('work.receipt'),operationId:uuid}).strict(),
 z.object({action:z.literal('work.claim'),...task,revision:z.number().int().positive(),operationId:uuid}).strict(),
 z.object({action:z.literal('work.submit'),...task,deliverableId:uuid,assetId:uuid,description:z.string().max(5000),operationId:uuid,localDeliveryId:z.string().max(200).optional()}).strict(),
 z.object({action:z.literal('work.upload'),...task,name:z.string().min(1).max(180),content:z.string().min(4).max(28*1024*1024),sha256:z.string().regex(/^[0-9a-f]{64}$/),operationId:uuid}).strict(),
]);
export class EmployeeEnterpriseWork {
 constructor(sync){this.sync=sync;this.db=sync.db;this.vault=sync.vault;
   this.db.exec('CREATE TABLE IF NOT EXISTS enterprise_operations(operation_id TEXT PRIMARY KEY,bot_id TEXT NOT NULL,employee_id TEXT NOT NULL,task_id TEXT NOT NULL,action TEXT NOT NULL,digest TEXT NOT NULL,state TEXT NOT NULL,encrypted TEXT NOT NULL,updated_at TEXT NOT NULL)');
   this.db.prepare("UPDATE enterprise_operations SET state='unknown' WHERE state='pending'").run();this.flights=new Map();this.leases=new EmployeeExecutionLeases(sync);
 }
 async binding(botId){if(this.closed)fail('WORK_BRIDGE_CLOSED');this.sync.bot(botId);await this.sync.device({action:'authorize'});const binding=this.sync.offlineClaims().bindings.find(b=>b.localBotId===botId);if(!binding)fail('EMP_DEVICE_BINDING_REQUIRED');return binding;}
 operations(botId){this.sync.bot(botId);return this.db.prepare('SELECT operation_id,task_id,action,state,updated_at,encrypted FROM enterprise_operations WHERE bot_id=? ORDER BY updated_at DESC LIMIT 100').all(botId).map(r=>({operationId:r.operation_id,taskId:r.task_id,action:r.action,state:r.state,updatedAt:r.updated_at,result:this.vault.unseal(r.encrypted).result??null,error:this.vault.unseal(r.encrypted).error??null}));}
 save(row,state,value){this.db.prepare('UPDATE enterprise_operations SET state=?,encrypted=?,updated_at=? WHERE operation_id=?').run(state,this.vault.seal(value),new Date(this.sync.clock()).toISOString(),row.operation_id);}
 async receipt(botId,operationId){
   uuid.parse(operationId);const binding=await this.binding(botId),row=this.db.prepare('SELECT * FROM enterprise_operations WHERE operation_id=? AND bot_id=?').get(operationId,botId);
   if(row&&row.employee_id!==binding.employeeId)fail('WORK_OPERATION_BINDING_CHANGED');
   const response=await this.sync.device({action:'work.receipt',employeeId:binding.employeeId,operationId});
   if(row&&response.status==='acknowledged'){const value=this.vault.unseal(row.encrypted);this.save(row,'acknowledged',{request:this.compact(value.request),result:response.result});}
   return {operationId,status:response.status,result:response.result??null};
 }
 compact(request){if(request?.action!=='work.upload')return request;const {content,...metadata}=request;return metadata;}
 async command(botId,raw,{sessionId,retry=false}={}){
   const p=enterpriseWorkCommand.parse(raw);if(p.action==='work.receipt')return this.receipt(botId,p.operationId);
   const binding=await this.binding(botId);
   if(p.action==='work.read'){const result=await this.sync.device({...p,employeeId:binding.employeeId});this.learnReviewFeedback(botId,result);return result;}
   const {localDeliveryId,...input}=p,body={...input,employeeId:binding.employeeId,source:source.parse({...sessionId?{sessionId}:{},...localDeliveryId?{localDeliveryId}:{}})};
   const key=p.operationId;
   if(this.flights.has(key)){const row=this.db.prepare('SELECT digest,bot_id FROM enterprise_operations WHERE operation_id=?').get(key);if(row?.digest!==digest(body)||row.bot_id!==botId)fail('WORK_IDEMPOTENCY_CONFLICT');return this.flights.get(key);}
   const flight=this.execute(botId,binding.employeeId,body,retry).finally(()=>this.flights.delete(key));this.flights.set(key,flight);return flight;
 }
 async execute(botId,employeeId,body,retry){
   const hash=digest(body);let row=this.db.prepare('SELECT * FROM enterprise_operations WHERE operation_id=?').get(body.operationId);
   if(row&&(row.bot_id!==botId||row.employee_id!==employeeId||row.digest!==hash))fail('WORK_IDEMPOTENCY_CONFLICT');
   if(row?.state==='acknowledged')return {operationId:body.operationId,status:'acknowledged',result:this.vault.unseal(row.encrypted).result};
   if(row&&['unknown','pending'].includes(row.state)){
     const receipt=await this.receipt(botId,body.operationId);if(receipt.status==='acknowledged')return receipt;
     if(!retry)return {operationId:body.operationId,status:'unknown',receiptStatus:'not_found'};
   }
   if(!row){this.db.prepare('INSERT INTO enterprise_operations VALUES(?,?,?,?,?,?,?,?,?)').run(body.operationId,botId,employeeId,body.taskId,body.action,hash,'pending',this.vault.seal({request:body}),new Date(this.sync.clock()).toISOString());row=this.db.prepare('SELECT * FROM enterprise_operations WHERE operation_id=?').get(body.operationId);}
   else this.save(row,'pending',{request:body});
   try{
     const execution=await this.leases.ensure(botId,employeeId,body.taskId);
     this.save(row,'pending',{request:body,lastExecution:execution});
     const response=await this.sync.device({...body,execution});if(response.status!=='acknowledged'||response.operationId!==body.operationId)fail('WORK_ACK_INVALID');
     this.save(row,'acknowledged',{request:this.compact(body),lastExecution:execution,result:response.result});return {operationId:body.operationId,status:'acknowledged',result:response.result};
   }catch(e){
     const definite=Number.isInteger(e.status)&&e.status>=400&&e.status<500;
     this.save(row,definite?'rejected':'unknown',{request:body,error:/^[A-Z_]+$/.test(e.message)?e.message:'WORK_RESULT_UNKNOWN'});
     if(definite)throw e;return {operationId:body.operationId,status:'unknown',error:'WORK_RESULT_UNKNOWN'};
   }
 }
 async retry(botId,operationId){const row=this.db.prepare('SELECT * FROM enterprise_operations WHERE operation_id=? AND bot_id=?').get(uuid.parse(operationId),botId);if(!row)fail('WORK_OPERATION_NOT_FOUND');const value=this.vault.unseal(row.encrypted);
   if(row.state==='acknowledged')return {operationId,status:'acknowledged',result:value.result};
   if(row.state!=='unknown')fail('WORK_RETRY_NOT_UNKNOWN');
   const binding=await this.binding(botId);if(binding.employeeId!==row.employee_id)fail('WORK_OPERATION_BINDING_CHANGED');return this.execute(botId,binding.employeeId,value.request,true);
 }
 learnReviewFeedback(botId,result){
   const store=this.sync.store;if(!store.profile(botId).autoLearning)return;
   for(const task of result.tasks??[])for(const review of task.reviews??[]){
     if(review.outcome!=='accepted'||!review.reason?.trim()||store.allMemories(botId).length>=5000)continue;
     try{store.createMemory(botId,{kind:'procedure',text:review.reason.trim().slice(0,2000),status:'candidate',operationId:'enterprise-review:'+review.id},{kind:'owner',note:`Verified enterprise acceptance ${review.id}`});}
     catch(e){if(!['EMP_SECRET_PATTERN','EMP_MEMORY_CAPACITY'].includes(e.message))throw e;}
   }
 }
 async close(){this.closed=true;await Promise.allSettled([...this.flights.values()]);await this.leases.close();}
}

export function createEnterpriseWorkTools(service,sync){
 if(!sync?.enterpriseWork)return [];
 const bridge=sync.enterpriseWork,output={schema:{type:'json'},render:(_args,v)=>[{type:'text',text:JSON.stringify(v)}]},string={type:'string',required:true};
 const tool=(name,description,parameters,action,write=false)=>defineTool({name,description,parameters,output,execute:(args,exec)=>{exec.signal?.throwIfAborted();const {bot,root}=service.caller(exec.agent,write);return bridge.command(bot.id,{...args,action},{sessionId:root.id});}});
 return [
   tool('employee_enterprise_work','Read your bound enterprise employee tasks, exact server revisions, deliverables, private asset metadata and immutable review decisions. Only server status accepted is enterprise acceptance; local goal completion is unrelated. Supports paging with after.',{taskId:{type:'string'},after:{type:'string'},limit:{type:'integer'}},'work.read'),
   tool('employee_enterprise_claim','Claim a server task already assigned to this registered human account and explicitly linked to your digital employee. Requires current task revision, designer role and stable UUID operationId. Does not assign, review or accept work.',{taskId:string,revision:{type:'integer',required:true},operationId:string},'work.claim',true),
   tool('employee_enterprise_submit','Submit an existing server asset uploaded by the accountable assignee to the exact linked task/deliverable. This starts professional review, never accepts. Keep UUID operationId stable. UNKNOWN means query employee_enterprise_receipt; do not invent success or replay under a new ID.',{taskId:string,deliverableId:string,assetId:string,description:string,operationId:string},'work.submit',true),
   tool('employee_enterprise_receipt','Query the authoritative receipt for a stable operationId after an uncertain upload/claim/submit. Read-only; does not replay or change a task. A missing receipt is not business acceptance.',{operationId:string},'work.receipt'),
 ];
}
