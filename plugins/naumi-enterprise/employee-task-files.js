import {createHash} from 'node:crypto';
import {inspectBotMessage} from './bot-task-runtime.js';
import {fileReference} from './bot-deliverables.js';

const fail=code=>{throw Error(code);};
export function fileArtifactDigest(a){return createHash('sha256').update(JSON.stringify({files:a.files,sourceTaskId:a.sourceTaskId,sourceTaskAttempt:a.sourceTaskAttempt,sourceSessionId:a.sourceSessionId,sourceMessageId:a.sourceMessageId,sourceGoalRevision:a.sourceGoalRevision,acceptanceCriteria:a.acceptanceCriteria})).digest('hex');}
const serial=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const goalRef=t=>t.workGoalUpdates?.at(-1)??t.workGoal;
const identity=t=>JSON.stringify([t.id,t.attempt,t.messageId,t.targetSessionId,t.sourceBotId,t.targetBotId,t.status,goalRef(t),t.delivery]);
/** Reconcile committed native outputs only. Never drive an Agent or create another execution queue. */
export class EmployeeTaskFiles{
 constructor(service,tasks){this.service=service;this.tasks=tasks;this.errors=new Map();this.tail=Promise.resolve();this.closed=false;this.again=false;this.running=false;}
 start(){this.off=this.tasks.store.subscribe(()=>this.kick());this.kick();}
 kick(){if(this.closed)return;if(this.running){this.again=true;return;}this.running=true;this.tail=this.tail.then(async()=>{do{this.again=false;for(const t of this.tasks.store.read().tasks){if(this.closed)break;if(!goalRef(t)||t.status!=='completed'||t.delivery?.status!=='ready'||!t.delivery.files.length)continue;
    try{const old=this.service.work.deliveries(t.sourceBotId).filter(d=>d.kind==='files'&&d.sourceTaskId===t.id).flatMap(d=>d.artifactIds.map(id=>this.service.work.artifact(t.sourceBotId,id))).find(a=>a.kind==='files'&&a.sourceTaskId===t.id&&a.sourceTaskAttempt===t.attempt);
    if(old&&old.sourceMessageId===t.messageId&&old.sourceSessionId===t.targetSessionId&&serial(old.files)===serial(t.delivery.files)){this.errors.delete(t.id);continue;}
    await this.reconcile(t);this.errors.delete(t.id);}catch(e){this.errors.set(t.id,{taskId:t.id,attempt:t.attempt,title:t.task.slice(0,80),code:/^(WORK|BOT)_[A-Z_]+$/.test(e.message)?e.message:'WORK_FILE_UNAVAILABLE'});}
   }}while(this.again&&!this.closed);}).finally(()=>{this.running=false;if(this.again&&!this.closed)this.kick();});this.tail.catch(()=>{});}
 async settled(){do{await this.tail;}while(this.running);}
 async close(){this.closed=true;this.off?.();await this.tail.catch(()=>{});}
 async proof(task,artifact){
  const ref=goalRef(task);if(!ref||ref.botId!==task.sourceBotId||artifact.sourceTaskId!==task.id||artifact.sourceSessionId!==task.targetSessionId||!Number.isSafeInteger(artifact.sourceTaskAttempt)||artifact.sourceTaskAttempt>task.attempt)fail('WORK_FILE_SOURCE_MISMATCH');
  const files=artifact.files.map(f=>fileReference.parse(f));if(!files.length||files.length>8||files.some(f=>!f.snapshot||f.sessionId!==task.targetSessionId))fail('WORK_FILE_SNAPSHOT_REQUIRED');
  const declared=artifact.sourceTaskAttempt===task.attempt?task.delivery?.files:task.deliveryHistory?.find(v=>v.attempt===artifact.sourceTaskAttempt)?.files;
  if(serial(declared)!==serial(files))fail('WORK_FILE_SOURCE_MISMATCH');
  const stored=await this.tasks.runtime.snapshot(task.targetSessionId);if(!stored)fail('WORK_FILE_SOURCE_MISSING');const state=inspectBotMessage(stored.events,artifact.sourceMessageId);
  if(!state.consumed||state.end?.kind!=='completed'||files.some(f=>f.turn!==state.turn))fail('WORK_FILE_TURN_MISMATCH');return files;
 }
 async verify(artifact,index){
  const d=this.service.work.delivery(artifact.botId,artifact.deliveryId),task=this.tasks.store.read().tasks.find(t=>t.id===artifact.sourceTaskId);
  if(!task||task.sourceBotId!==artifact.botId||goalRef(task)?.goalId!==d.goalId)fail('WORK_FILE_SOURCE_MISMATCH');
  this.service.bot(task.targetBotId);const refs=await this.proof(task,artifact);let result;
  for(const [i,ref]of refs.entries()){if(index!==undefined&&index!==i)continue;try{const v=await this.tasks.runtime.verifyVersion(ref);if(index===i)result={...v,fileName:ref.path.split(/[\\/]/).at(-1)};}catch(e){fail(e.message==='BOT_VERSION_CORRUPT'?'WORK_FILE_CORRUPT':'WORK_FILE_UNAVAILABLE');}}
  if(index!==undefined&&!result)fail('WORK_ARTIFACT_NOT_FOUND');return result;
 }
 async reconcile(task){
  if(task.status!=='completed'||task.delivery?.status!=='ready')fail('WORK_FILE_TASK_NOT_READY');const goal=this.service.linkedGoal(task);if(!goal)fail('WORK_TASK_GOAL_MISMATCH');
  const a={sourceTaskId:task.id,sourceTaskAttempt:task.attempt,sourceSessionId:task.targetSessionId,sourceMessageId:task.messageId,files:structuredClone(task.delivery.files),sourceGoalRevision:goal.revision,acceptanceCriteria:[...goal.criteria]};
  const refs=await this.proof(task,a);for(const ref of refs)await this.tasks.runtime.verifyVersion(ref);
  const validate=()=>{const latest=this.tasks.store.read().tasks.find(t=>t.id===task.id);if(!latest||identity(latest)!==identity(task))fail('WORK_FILE_TASK_CHANGED');this.service.linkedGoal(latest);};validate();
  return this.service.work.publishTaskFiles(task.sourceBotId,{...a,goalId:goal.goalId,title:goal.title,executorBotId:task.targetBotId},{kind:'agent',sessionId:task.targetSessionId,note:'native task file delivery'},validate);
 }
}
