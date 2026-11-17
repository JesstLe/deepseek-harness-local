import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {fileReference,deliveryCheck} from './bot-deliverables.js';
import {taskIntent,taskAmendment,taskHandoff,taskAcceptance} from './bot-task-handoff.js';

const id=z.string().min(1).max(200),text=z.string().min(1).max(32000),stamp=z.string().datetime();
export const TASK_STATES=['queued','starting','running','waiting','completed','failed','cancelled','interrupted'];
export const TERMINAL=new Set(['completed','failed','cancelled','interrupted']);
const profileSchema=z.object({agentPreset:id.optional(),model:z.object({provider:id,model:id,reasoningEffort:id.optional()}).strict(),
  permissions:z.array(z.object({type:z.enum(['permission/preset','sandbox/mode','approval/policy']),data:z.record(z.string(),z.unknown())}).strict()).max(3)}).strict();
const taskSchema=z.object({id,key:id,sourceBotId:id,sourceSessionId:id,targetBotId:id,targetSessionId:id,targetCwd:z.string().min(1).max(4096),
  profile:profileSchema,task:text,status:z.enum(TASK_STATES),revision:z.number().int().positive(),attempt:z.number().int().positive().max(100),
  messageId:id,lineage:z.array(id).min(2).max(5),parentTaskId:id.optional(),createdAt:stamp,updatedAt:stamp,
  output:z.enum(['text','files']).optional(),replyMode:z.enum(['background','wait']).optional(),delivery:deliveryCheck.optional(),deliveryHistory:z.array(z.object({attempt:z.number().int().positive(),files:z.array(fileReference).max(8),createdAt:stamp}).strict()).max(100).optional(),
  intent:taskIntent.optional(),amendment:taskAmendment.optional(),handoff:taskHandoff.optional(),
  instruction:text.optional(),result:z.string().max(32000).optional(),progress:z.string().max(4000).optional(),error:id.optional()}).strict();
const outboxSchema=z.object({id,taskId:id,key:z.string().min(1).max(400),messageId:id,fromSessionId:id,toSessionId:id,
  attempt:z.number().int().positive(),taskStatus:z.enum(TASK_STATES),kind:z.enum(['message','progress','blocked','result','status']),text,acceptance:taskAcceptance.optional(),files:z.array(fileReference).max(8).optional(),delivered:z.boolean(),error:id.optional(),createdAt:stamp}).strict();
const schema=z.object({version:z.literal(1),revision:z.number().int().nonnegative(),tasks:z.array(taskSchema).max(1000),outbox:z.array(outboxSchema).max(10000)}).strict().superRefine((doc,ctx)=>{
  const ids=new Set(),keys=new Set(),sessions=new Set();
  for(const task of doc.tasks){const key=task.sourceSessionId+'\0'+task.key;if(ids.has(task.id)||keys.has(key)||sessions.has(task.targetSessionId)||new Set(task.lineage).size!==task.lineage.length)ctx.addIssue({code:'custom',message:'Duplicate Bot task identity'});
    if(task.handoff&&!ids.has(task.handoff.taskId))ctx.addIssue({code:'custom',message:'Invalid Bot task handoff'});
    ids.add(task.id);keys.add(key);sessions.add(task.targetSessionId);}
  const messages=new Set();for(const m of doc.outbox){const key=m.taskId+'\0'+m.key;if(!ids.has(m.taskId)||messages.has(key))ctx.addIssue({code:'custom',message:'Invalid Bot outbox'});messages.add(key);}
});

/** Transactional local-owner ledger. A status transition and its reply outbox commit together. */
export class BotTaskStore{
  constructor(file,{write}={}){
    this.file=file;this.tail=Promise.resolve();this.listeners=new Set();this.closed=false;
    this.write=write??(async doc=>{
      await fs.promises.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
      try{const handle=await fs.promises.open(temp,'wx',0o600);try{await handle.writeFile(JSON.stringify(doc,null,2)+'\n');await handle.sync();}finally{await handle.close();}await fs.promises.rename(temp,file);}
      finally{await fs.promises.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
    });
    try{this.value=schema.parse(JSON.parse(fs.readFileSync(file,'utf8')));}catch(e){if(e.code==='ENOENT')this.value={version:1,revision:0,tasks:[],outbox:[]};else this.failure='BOT_TASK_LEDGER_INVALID';}
  }
  ready(){if(this.closed)throw Error('BOT_TASK_LEDGER_CLOSED');if(this.failure)throw Error(this.failure);}
  read(){this.ready();return structuredClone(this.value);}
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  change(fn){
    this.ready();const run=this.tail.then(async()=>{
      this.ready();const next=structuredClone(this.value),result=fn(next);
      if(result?.unchanged)return structuredClone(result.value);
      next.revision++;schema.parse(next);await this.write(next);this.value=next;
      for(const listener of this.listeners){try{listener();}catch{}}
      return structuredClone(result?.value);
    });this.tail=run.then(()=>{},()=>{});return run;
  }
  async close(){await this.tail;this.closed=true;this.listeners.clear();}
}
