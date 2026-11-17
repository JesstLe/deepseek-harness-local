import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {resolveEveryOccurrence} from '@deepseek-ai/dsh-schedule';
import {assertPublicText} from './employee-store.js';
import {EmployeeWorkStore} from './employee-work-store.js';

const id=z.string().min(1).max(200),rev=z.number().int().positive(),stamp=z.string().datetime();
const trigger=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('every'),seconds:z.number().int().min(60).max(2592000)}).strict(),
  z.object({kind:z.literal('at'),at:stamp}).strict(),
  z.object({kind:z.literal('goal_due'),goalId:id.nullable().default(null)}).strict(),
]);
const action=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('notify'),text:z.string().trim().min(1).max(1000)}).strict(),
  z.object({kind:z.literal('queue_goal'),title:z.string().trim().min(1).max(120),description:z.string().max(4000).default(''),criteria:z.array(z.string().trim().min(1).max(500)).min(1).max(20)}).strict(),
  z.object({kind:z.literal('run_local_agent'),sessionId:id,goalId:id,provider:z.string().min(1).max(160),model:z.string().min(1).max(160),reasoningEffort:z.string().min(1).max(100).optional(),prompt:z.string().trim().min(1).max(4000),maxModelRequests:z.number().int().min(1).max(20),maxSeconds:z.number().int().min(10).max(3600),maxToolCalls:z.number().int().min(1).max(100),allowedTools:z.array(z.enum(['employee_profile','employee_memory_search','employee_work','employee_delivery_create','employee_delivery_revise','employee_delivery_submit','employee_activity_report','employee_capabilities','str_replace_editor'])).min(1).max(9).refine(v=>new Set(v).size===v.length)}).strict(),
  z.object({kind:z.literal('run_agent'),sessionId:id,taskId:z.string().uuid(),goalId:id,model:z.string().min(1).max(80),prompt:z.string().trim().min(1).max(4000),maxModelRequests:z.number().int().min(1).max(20),maxSeconds:z.number().int().min(10).max(3600)}).strict(),
]);
const window=z.object({timeZone:z.string().min(1).max(100).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}}),days:z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(v=>new Set(v).size===v.length),startMinute:z.number().int().min(0).max(1439),endMinute:z.number().int().min(1).max(1440)}).strict().refine(v=>v.startMinute<v.endMinute,'Use an explicit non-overnight work window');
export const ruleConfig=z.object({title:z.string().trim().min(1).max(120),trigger,action,workWindow:window,cooldownSeconds:z.number().int().min(60).max(2592000),maxActions:z.number().int().min(1).max(1000)}).strict();
export const activityCommands=z.discriminatedUnion('action',[
  z.object({action:z.literal('rule_create'),botId:id,operationId:id,config:ruleConfig}).strict(),
  z.object({action:z.literal('rule_update'),botId:id,operationId:id,ruleId:id,expectedRevision:rev,config:ruleConfig}).strict(),
  z.object({action:z.literal('rule_enable'),botId:id,operationId:id,ruleId:id,expectedRevision:rev,enabled:z.boolean()}).strict(),
  z.object({action:z.literal('notification_read'),botId:id,operationId:id,notificationId:id,expectedRevision:rev}).strict(),
]);
const fail=code=>{throw Error(code);},key=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const owner={kind:'owner'},system={kind:'owner',note:'Owner-approved local deterministic rule; no model or external action'};
export function inWorkWindow(value,now){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:value.timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(v=>[v.type,v.value]));
  const day=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(p.weekday)+1,minute=Number(p.hour)*60+Number(p.minute);
  return value.days.includes(day)&&minute>=value.startMinute&&minute<value.endMinute;
}
/** All effects are local SQLite writes, committed WITH their occurrence receipt. Never wakes an Agent. */
export class EmployeeActivityStore{
  constructor(store){this.store=store;this.work=new EmployeeWorkStore(store);store.db.exec('CREATE TABLE IF NOT EXISTS employee_activity_clock(id INTEGER PRIMARY KEY CHECK(id=1),high_water_ms INTEGER NOT NULL)');}
  rules(botId){return this.store.entitiesOfType(botId,'proactive_rule');}
  runs(botId){return this.store.entitiesOfType(botId,'proactive_run').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50);}
  notifications(botId){return this.store.entitiesOfType(botId,'notification').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100);}
  rule(botId,ruleId){const r=this.store.entity(botId,ruleId);if(!r||!ruleId.startsWith('rule-'))fail('ACT_RULE_NOT_FOUND');return r;}
  command(raw){
    const {action,botId,operationId,...args}=activityCommands.parse(raw);if(args.config)assertPublicText(JSON.stringify(args.config));
    return this.store.mutate(botId,operationId,action,args,owner,()=>{
      const time=this.store.now();
      if(action==='rule_create'){
        if(this.rules(botId).length>=100)fail('ACT_RULE_CAPACITY');this.validateScope(botId,args.config);
        return this.store.put({id:'rule-'+randomUUID(),botId,revision:1,config:args.config,configVersion:randomUUID(),enabled:false,approvedAt:null,approvalId:null,actionCount:0,lastActionAt:null,nextAt:this.next(args.config,Date.parse(time)),createdAt:time,updatedAt:time},'proactive_rule',action,owner);
      }
      if(action==='notification_read'){
        const n=this.store.entity(botId,args.notificationId);if(!n||!args.notificationId.startsWith('notification-'))fail('ACT_NOTIFICATION_NOT_FOUND');
        if(n.revision!==args.expectedRevision)fail('ACT_CONFLICT');return this.store.put({...n,revision:n.revision+1,readAt:time},'notification',action,owner);
      }
      const r=this.rule(botId,args.ruleId);if(r.revision!==args.expectedRevision)fail('ACT_CONFLICT');
      if(args.config)this.validateScope(botId,args.config);
      // Configuration changes always revoke approval. A separate owner enable is required.
      const config=args.config??r.config,enabled=action==='rule_enable'&&args.enabled;
      if(enabled&&r.actionCount>=config.maxActions)fail('ACT_ACTION_LIMIT');
      return this.store.put({...r,config,configVersion:args.config?randomUUID():r.configVersion,enabled,revision:r.revision+1,approvedAt:enabled?time:null,approvalId:enabled?randomUUID():null,nextAt:this.next(config,Date.parse(time)),updatedAt:time},'proactive_rule',action,owner);
    });
  }
  validateScope(botId,config){if(config.trigger.kind==='goal_due'&&config.trigger.goalId)this.work.goal(botId,config.trigger.goalId);if(['run_agent','run_local_agent'].includes(config.action.kind))this.work.goal(botId,config.action.goalId);}
  next(config,now){return config.trigger.kind==='every'?new Date(now+config.trigger.seconds*1000).toISOString():config.trigger.kind==='at'?config.trigger.at:null;}
  occurrence(botId,r,now){
    const t=r.config.trigger;
    if(t.kind==='goal_due')return this.work.goals(botId).filter(g=>(!t.goalId||g.id===t.goalId)&&['planned','in_progress'].includes(g.status)&&g.dueAt&&Date.parse(g.dueAt)<=now).map(g=>({token:'goal:'+g.id+':'+g.dueAt,at:g.dueAt,goalId:g.id}));
    if(!r.nextAt||Date.parse(r.nextAt)>now)return [];
    if(t.kind==='at')return [{token:'at:'+t.at,at:t.at,nextAt:null}];
    const o=resolveEveryOccurrence({everySeconds:t.seconds,scheduledAt:r.nextAt},now);return [{token:'every:'+o.occurrenceAt,at:o.occurrenceAt,nextAt:o.nextScheduledAt??null}];
  }
  tick(botIds){
    const now=this.store.clock().getTime(),previous=this.store.db.prepare('SELECT high_water_ms FROM employee_activity_clock WHERE id=1').get()?.high_water_ms??0;
    if(now+1000<previous)return {clockRollback:true,actions:0};
    this.store.db.prepare('INSERT INTO employee_activity_clock VALUES(1,?) ON CONFLICT(id) DO UPDATE SET high_water_ms=max(high_water_ms,excluded.high_water_ms)').run(now);
    let actions=0;
    for(const botId of botIds)for(const rule of this.rules(botId)){
      if(!rule.enabled||!rule.approvedAt||rule.actionCount>=rule.config.maxActions||!inWorkWindow(rule.config.workWindow,now))continue;
      if(['run_agent','run_local_agent'].includes(rule.config.action.kind)&&this.store.entitiesOfType(botId,'proactive_ai').some(j=>j.ruleId===rule.id&&!['awaiting_review','failed','cancelled','expired','reviewed_stopped'].includes(j.state)))continue;
      for(const o of this.occurrence(botId,rule,now)){
        const r=this.rule(botId,rule.id);if(!r.enabled||r.revision!==rule.revision||r.actionCount>=r.config.maxActions)break;
        if(r.lastActionAt&&now-Date.parse(r.lastActionAt)<r.config.cooldownSeconds*1000)break;
        const receiptId='run-'+key([r.id,r.configVersion,o.token]);
        if(this.store.entity(botId,receiptId))continue;
        this.store.mutate(botId,'activity:'+receiptId,'rule_fire',{ruleId:r.id,revision:r.revision,occurrence:o},system,()=>{
          // Re-read under BEGIN IMMEDIATE. Two processes cannot commit the same occurrence twice.
          const live=this.rule(botId,r.id);if(live.revision!==r.revision||!live.enabled)fail('ACT_CONFLICT');
          if(this.store.entitiesOfType(botId,'proactive_run').length>=10000)fail('ACT_RUN_CAPACITY');
          const time=this.store.now(),effectId=(r.config.action.kind==='notify'?'notification-':['run_agent','run_local_agent'].includes(r.config.action.kind)?'ai-job-':'goal-')+key([receiptId,'effect']);
          if(r.config.action.kind==='notify')this.store.put({id:effectId,botId,revision:1,text:r.config.action.text,ruleId:r.id,sourceGoalId:o.goalId??null,readAt:null,createdAt:time},'notification','rule_notification',system);
          else if(['run_agent','run_local_agent'].includes(r.config.action.kind)){
            if(this.store.entitiesOfType(botId,'proactive_ai').length>=10000)fail('ACT_AI_CAPACITY');
            this.store.put({id:effectId,botId,revision:1,ruleId:r.id,ruleTitle:r.config.title,configVersion:r.configVersion,approvedAt:r.approvedAt,approvalId:r.approvalId,sourceRunId:receiptId,action:r.config.action,workWindow:r.config.workWindow,state:'queued',reason:null,modelRequestIds:[],modelRequests:0,messageId:null,turn:null,createdAt:time,updatedAt:time},'proactive_ai','ai_queued',{kind:'owner',note:'Explicitly approved AI rule; queued is not execution or business acceptance'});
          }
          else{
            if(this.work.goals(botId).length>=1000)fail('WORK_CAPACITY');
            const a=r.config.action,goal={id:effectId,botId,revision:1,title:a.title,description:a.description,criteria:a.criteria,kind:'objective',parentId:null,dependencies:[],priority:1,dueAt:null,status:'planned',sourceRuleId:r.id,sourceRunId:receiptId,createdAt:time,updatedAt:time};
            this.work.validateGraph(botId,goal);this.store.put(goal,'goal','rule_queue_goal',system);
          }
          this.store.put({...live,revision:live.revision+1,actionCount:live.actionCount+1,lastActionAt:time,nextAt:o.nextAt===undefined?live.nextAt:o.nextAt,enabled:live.config.trigger.kind!=='at'&&live.actionCount+1<live.config.maxActions,updatedAt:time},'proactive_rule','rule_fired',system);
          return this.store.put({id:receiptId,botId,revision:1,ruleId:r.id,ruleRevision:r.revision,occurrenceAt:o.at,sourceGoalId:o.goalId??null,action:r.config.action.kind,effectId,result:'committed',modelCalls:0,externalActions:0,createdAt:time},'proactive_run','rule_receipt',system);
        });actions++;
      }
    }
    return {clockRollback:false,actions};
  }
}
