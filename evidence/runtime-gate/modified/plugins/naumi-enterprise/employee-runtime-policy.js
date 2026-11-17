import {z} from 'zod';
export const LOCAL_READ_TOOLS=new Set(['employee_profile','employee_memory_search','employee_shared_memory_search','employee_work','employee_capabilities','bot_directory']);
export const LOCAL_DRAFT_TOOLS=new Set(['employee_memory_propose','employee_profile_propose','employee_delivery_create','employee_delivery_revise','employee_delivery_submit']);
export const RECOVERY_TOOLS=new Set(['employee_activity_report','employee_enterprise_work','employee_enterprise_receipt']);
// New independent roots/reminders must receive an explicit managed binding, not escape their originating run.
export const SCOPE_CHANGE_TOOLS=new Set(['bot_create','bot_use','bot_update','bot_dispatch','bot_task_reply','bot_task_retry','bot_task_cancel']);
const id=z.string().min(1).max(200),rev=z.number().int().positive(),names=z.array(z.string().regex(/^[A-Za-z0-9_.:-]{1,160}$/)).max(100).refine(v=>new Set(v).size===v.length);
export const runtimeCommands=z.discriminatedUnion('action',[
  z.object({action:z.literal('attach'),botId:id,sessionId:id,taskId:z.string().uuid(),allowedTools:names,allowOfflineLocal:z.boolean(),operationId:id}).strict(),
  z.object({action:z.literal('configure'),botId:id,sessionId:id,expectedRevision:rev,allowedTools:names,allowOfflineLocal:z.boolean(),operationId:id}).strict(),
  ...['pause','resume','stop'].map(action=>z.object({action:z.literal(action),botId:id,sessionId:id,expectedRevision:rev,operationId:id}).strict()),
  z.object({action:z.literal('resolve_unknown'),botId:id,sessionId:id,expectedRevision:rev,confirmedStopped:z.literal(true),reason:z.string().trim().min(6).max(1000),operationId:id}).strict(),
]);
export function scopeChanging(name){return SCOPE_CHANGE_TOOLS.has(name)||/^schedule(?:_|$)/.test(name);}
